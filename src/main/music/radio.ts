/**
 * The radio's host-side wiring: the conductor gets its samples from the
 * now-playing watcher, its DJ from the stream engine, and its revive path from
 * the keepalive flow. See docs/design/music-radio-conductor.md.
 *
 * The DJ is a real agent (`radio-dj`) in a real session named 电台 — its
 * transcript is the programming log. Wakes are engine-direct drives, same as
 * goal kicks: `source: 'radio'` is registered in SYSTEM_INTERNAL_MESSAGE_SOURCES,
 * so the router bypasses channel-identity resolution and the turn lands in the
 * radio session instead of spawning a ghost session.
 */
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import {
  RADIO_DJ_AGENT_ID,
  RADIO_DJ_AGENT_NAME,
  RADIO_DJ_FACTORY_VERSION,
  createOnethingMusicReliableRunner,
  createOnethingRadioConductor,
  createOnethingRadioStore,
  estimateSpeechSeconds,
  firstVocalStartAt,
  matchSongFromSearch,
  songPlayFlagFromSearch,
  radioDjFactoryPromptVersion,
  renderRadioCurationPrompt,
  renderRadioDjAgentPrompt,
  renderRadioOpenPrompt,
  type OnethingMusicIdentifiedSong,
  type OnethingMusicNowPlaying,
  type OnethingRadioConductor,
  type OnethingRadioProgrammeEntry,
  type OnethingRadioStore,
} from '@onething/runtime/music'
import { broadcastElectronVoiceMessage } from '@onething/electron-host/voice/events'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type { MusicLyricLine, MusicLyrics } from '../../shared/ipc/music.js'
import { createElectronMusicProcessRunner } from '@onething/electron-host/music/process-runner'
import { addGrant } from '@onething/core'
import { writeJsonFile } from '@onething/core/storage'
import { agentExists, createAgent, getAgent, updateAgent } from '../agents/store.js'
import { markSessionUnattended } from '../permission/unattended.js'
import { getStorePath } from '../stores/paths.js'
import { getSettings } from '../stores/settings.js'
import * as sessions from '../stores/sessions.js'
import {
  getActiveMusicProvider,
  getMusicNowPlaying,
  getMusicService,
  nudgeMusicClients,
  refreshMusicNowPlaying,
  setMusicSampleListener,
} from './service.js'
import { speakDjPatter } from './dj-voice.js'

let radioStore: OnethingRadioStore | null = null
let conductor: OnethingRadioConductor | null = null
/** Sessions this process already pre-granted music-dir writes to. */
const grantedSessions = new Set<string>()

export function getRadioStore(): OnethingRadioStore {
  const provider = getActiveMusicProvider()
  radioStore ??= createOnethingRadioStore(path.join(getStorePath(), 'music'), {
    ids: provider.ids,
    providerId: provider.descriptor.id,
  })
  return radioStore
}

function getReliableRunner() {
  const provider = getActiveMusicProvider()
  return createOnethingMusicReliableRunner({
    runner: createElectronMusicProcessRunner(),
    logger: console,
    cli: {
      binary: provider.descriptor.binary,
      parse: {
        envelope: provider.cli.parse.envelope,
        nowPlaying: provider.cli.parse.nowPlaying,
      },
    },
  })
}

/**
 * Make sure the DJ exists to be woken: the factory persona once, a dedicated
 * session bound to it once. User edits to the agent are never overwritten —
 * this only ever creates.
 */
function ensureRadioSession(store: OnethingRadioStore): string {
  const factoryPrompt = renderRadioDjAgentPrompt({
    inboxPath: store.inboxPath,
    cliCheatsheet: getActiveMusicProvider().prose.cliCheatsheet,
  })
  // Recreate the agent if it was deleted by hand — a session pointing at a
  // missing agent silently falls back to the default persona, which is a
  // different host with no radio discipline.
  if (!agentExists(RADIO_DJ_AGENT_ID)) {
    createAgent({
      id: RADIO_DJ_AGENT_ID,
      name: RADIO_DJ_AGENT_NAME,
      systemPrompt: factoryPrompt,
    })
    console.warn('[radio] radio-dj agent was missing; recreated from the factory persona')
  } else {
    // Mandatory disciplines live in the persona, so installed agents must
    // follow factory upgrades: "created once, never touched" froze every DJ
    // on day-one rules, and a chat with the stale DJ shipped six
    // rights-restricted songs (2026-07-17). The fingerprint line in the
    // prompt is the opt-out: users who delete it own their persona; a prompt
    // without a fingerprint is a pre-fingerprint factory install and gets a
    // one-time migration.
    const installed = getAgent(RADIO_DJ_AGENT_ID)?.systemPrompt ?? ''
    const installedVersion = radioDjFactoryPromptVersion(installed)
    if ((installedVersion ?? 0) < RADIO_DJ_FACTORY_VERSION && installed !== factoryPrompt) {
      updateAgent({ agentId: RADIO_DJ_AGENT_ID, systemPrompt: factoryPrompt })
      console.warn(
        `[radio] radio-dj persona upgraded to factory v${RADIO_DJ_FACTORY_VERSION} (was ${installedVersion ?? 'pre-fingerprint'})`,
      )
    }
  }

  const brief = store.readBrief()
  if (brief.sessionId) {
    const existing = sessions.getSession(brief.sessionId)
    if (existing && !isDjSessionOversized(existing)) return brief.sessionId
    if (existing) {
      // Rotation: wakes replay the full transcript, so an old station pays
      // for every past batch on every new one. The DJ is stateless by design
      // (the wake prompt carries intent/history/queue), so a fresh session IS
      // the handoff — no summary needed. The old log stays in the sidebar's
      // Music group.
      console.warn(
        `[radio] rotating dj session ${brief.sessionId} (messages=${existing.messages?.length ?? 0})`,
      )
    }
  }

  // A dead id (session deleted by hand) used to mean "silently create a new
  // session every wake" — five sessions in one morning, field-measured. Reuse
  // the newest still-reasonable radio-dj session from the index first.
  if (brief.sessionId && !sessions.getSession(brief.sessionId)) {
    const candidate = pickReusableRadioDjSession(sessions.getSessionsList())
    if (candidate) {
      store.writeBrief({ ...brief, sessionId: candidate })
      return candidate
    }
  }

  const sessionId = randomUUID()
  sessions.createSession(sessionId, '电台')
  sessions.updateSessionAgent(sessionId, RADIO_DJ_AGENT_ID)
  store.writeBrief({ ...brief, sessionId })
  return sessionId
}

/** Transcript-weight thresholds for rotating the DJ session. */
const DJ_SESSION_MAX_CONTEXT_TOKENS = 60_000
const DJ_SESSION_MAX_MESSAGES = 40

export function isDjSessionOversized(
  session: { messages?: unknown[]; contextSize?: number } | undefined | null,
): boolean {
  if (!session) return false
  const contextSize = typeof session.contextSize === 'number' ? session.contextSize : 0
  const messageCount = Array.isArray(session.messages) ? session.messages.length : 0
  return contextSize > DJ_SESSION_MAX_CONTEXT_TOKENS || messageCount > DJ_SESSION_MAX_MESSAGES
}

/** Newest radio-dj session light enough to keep using (index metadata only). */
export function pickReusableRadioDjSession(
  list: Array<{ id: string; agentId?: string; updatedAt: number; messageCount?: number }>,
): string | null {
  const candidates = list
    .filter(
      meta =>
        meta.agentId === RADIO_DJ_AGENT_ID && (meta.messageCount ?? 0) <= DJ_SESSION_MAX_MESSAGES,
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
  return candidates[0]?.id ?? null
}

/**
 * Drive one DJ turn into the radio session. A missing sessionId means this is
 * the opening of the station (first batch + start playback); afterwards every
 * wake is a follow-up batch.
 */
/**
 * The DJ's whole file workspace is the music dir (inbox in, brief context
 * out). Grant EVERY effect a file op there can raise (session-scoped, this
 * dir only): the wake lands in a session nobody is looking at, where a
 * permission prompt hangs (first field test) and an auto-deny deadlocks —
 * second field test: the DJ session has no workingDirectory, so reads raise
 * `external_directory`/`sensitive_file_read`, which the original write-only
 * grant did not cover; Read got denied, Write requires Read first, and the
 * curation loop died against that wall every wake.
 */
const MUSIC_DIR_GRANT_TYPES = [
  'read',
  'sensitive_file_read',
  'external_directory',
  'file_write',
  'file_edit',
  'file_destructive_edit',
] as const

function grantMusicDirAccess(sessionId: string, musicDir: string): void {
  if (grantedSessions.has(sessionId)) return
  grantedSessions.add(sessionId)
  const pattern = path.join(musicDir, '*')
  for (const type of MUSIC_DIR_GRANT_TYPES) {
    addGrant({
      scope: 'session',
      type,
      pattern,
      sessionId,
      createdFrom: { messageId: 'radio-conductor', title: '电台节目单目录(预授)' },
    })
  }
}

/** Per-item and total budgets for the opening patter's life-context block. */
const LIFE_CONTEXT_ITEM_MAX = 200
const LIFE_CONTEXT_TOTAL_MAX = 1_200
/** Variables with no narrative value for a radio host. */
const LIFE_CONTEXT_EXCLUDED = new Set(['music', 'workdir', 'background_jobs'])

/**
 * The listener's life right now, for the opening patter: a filtered snapshot
 * of the variable registry (notes, goals, custom variables — whatever
 * providers exist). Deliberately NOT a named list of variables: a future
 * weather/schedule provider joins the morning show with zero changes here.
 * Best-effort — an empty string just means a plain opening.
 */
async function buildRadioLifeContext(sessionId: string): Promise<string> {
  try {
    // Dynamic import mirrors the engine imports below: radio.ts is reachable
    // from the variable gateways, and static graph edges here have bitten
    // unrelated test module graphs before.
    const { getVariableRegistry } = await import('@onething/runtime/variables/registry')
    const variables = await getVariableRegistry().list({ sessionId })
    const lines: string[] = []
    let total = 0
    for (const variable of variables) {
      if (LIFE_CONTEXT_EXCLUDED.has(variable.name)) continue
      const value = (variable.value ?? '').trim()
      if (!value) continue
      const line = `- ${variable.name}: ${value.slice(0, LIFE_CONTEXT_ITEM_MAX)}`
      if (total + line.length > LIFE_CONTEXT_TOTAL_MAX) break
      lines.push(line)
      total += line.length
    }
    return lines.join('\n')
  } catch (error) {
    console.warn('[radio] life context unavailable; opening plain', error)
    return ''
  }
}

/**
 * How long a stated intent survives without being re-set. Past this, the next
 * DJ wake drops it and self-directs by time + history — so last session's
 * 午睡歌曲 can't haunt tonight's late-night radio even if the station was only
 * resumed, never freshly opened. Ages from the last real set/open, not plays.
 */
const RADIO_INTENT_TTL_MS = 6 * 60 * 60 * 1_000

async function wakeRadioDj(): Promise<void> {
  if (!isMusicEnabled()) return
  const store = getRadioStore()
  // Before rendering the DJ prompt, age out a stale intent so a resumed or
  // conductor-woken station (no fresh open) doesn't quote an old direction.
  store.expireStaleIntent(RADIO_INTENT_TTL_MS)
  const brief = store.readBrief()
  const opening = !brief.sessionId || !sessions.getSession(brief.sessionId)
  const sessionId = ensureRadioSession(store)
  grantMusicDirAccess(sessionId, path.dirname(store.programmePath))
  // Nobody watches DJ turns; a permission dialog there is a silent hang.
  // Marked unattended, asks become immediate explained denials instead.
  markSessionUnattended(sessionId)

  // Dynamic imports: this module is reachable from the variable gateways, and
  // a static engine import would drag the whole provider stack into every
  // module graph that touches variables (which broke unrelated tests).
  const [{ getStreamEngineSafe }, { getEventBus }] = await Promise.all([
    import('../engine/index.js'),
    import('../events/index.js'),
  ])

  // A run already active in the radio session IS the DJ working — kicking
  // again would interleave two curations in one transcript.
  if (getStreamEngineSafe()?.getController(sessionId)) return

  const renderOptions = {
    brief: store.readBrief(),
    inboxPath: store.inboxPath,
    programmeRemaining: store.readProgramme().entries.map(entry => entry.title),
  }
  const content = opening
    ? renderRadioOpenPrompt({
        ...renderOptions,
        lifeContext: await buildRadioLifeContext(sessionId),
      })
    : renderRadioCurationPrompt(renderOptions)

  // The DJ's own model (设置 → 音乐 → 电台编排), same idea as toolCallModel:
  // curation is background work in a session nobody watches, so it should not
  // inherit whatever model the radio session last used. Empty providerId =
  // follow the session default. Think mode rides the override so it stays
  // independent of the global per-model toggle.
  const djModel = getSettings().music?.radioDj
  const modelOverride = djModel?.providerId
    ? {
        providerId: djModel.providerId,
        ...(djModel.model ? { model: djModel.model } : {}),
        ...(typeof djModel.thinking === 'boolean'
          ? { thinking: djModel.thinking, thinkingEffort: djModel.thinkingEffort }
          : {}),
      }
    : {}

  await getEventBus().emit(sessionId, {
    type: 'command:send-message',
    content,
    source: 'radio',
    origin: { transport: 'api', source: 'radio', receivedAt: Date.now() },
    // The session is deliberately named 电台; the drive prompt is not a title.
    suppressTitleGeneration: true,
    ...modelOverride,
  })
}

/**
 * A song we started is audibly on. Lyrics and the play record fire here — no
 * title matching anywhere: LLM-written titles drift (bare '早春的树' vs the
 * player's '早春的树 - 陈鸿宇') and broke every title-keyed feature at once.
 * `playerTitle` is the player's own stable format, used for display and the
 * renderer's lyric guard. (The patter is NOT here: a real host talks BEFORE
 * the song — playProgrammeEntry speaks into the silence, then starts it. The
 * first field run had the song poke out for two seconds, get paused for the
 * intro, then resume — backwards.)
 */
function onSongStarted(entry: OnethingRadioProgrammeEntry, playerTitle: string): void {
  const store = getRadioStore()
  store.recordPlayed(playerTitle, entry.encryptedId)
  void pushLyricsFor(entry, playerTitle)
}

/**
 * Read-back verify budget. A single fixed-delay check misjudged a slow night
 * (song came up at ~6s, we checked at 5s, wrote a false 起播失败 and dropped
 * the entry) — so poll instead, and let a late start still count as a start.
 */
const PLAY_VERIFY_INTERVAL_MS = 1_000
const PLAY_VERIFY_DEADLINE_MS = 12_000

const NCM_LOGIN_EXPIRED_MESSAGE =
  '网易云登录已过期,请到 设置 → 音乐 重新登录;登录恢复后电台会自动续播'

/**
 * The conductor's systemic-failure probe (see its option doc): an expired
 * NetEase login makes `play` exit 0 with no sound for EVERY song — 2026-07-17
 * that burned six curated entries under a generic 起播失败. `login --check` is
 * read-only (same command the bash whitelist trusts); a refusal envelope
 * arrives as a thrown `未登录` message. Anything else (timeout, missing
 * binary) is "can't tell" — fail open so per-song handling keeps working.
 */
export async function diagnoseRadioStartFailure(): Promise<string | null> {
  try {
    await getReliableRunner().run('read', getActiveMusicProvider().cli.build.loginCheck())
    return null
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return message.includes('未登录') ? NCM_LOGIN_EXPIRED_MESSAGE : null
  }
}

/**
 * Post-mortem for a silent start: `play` on a rights-restricted song exits 0
 * with no output and no sound (measured — six songs burned under a generic
 * 起播失败 before anyone knew why). Re-search the title and read the record's
 * playFlag with the entry's id as the join key. Only runs on the failure
 * path; any doubt (no match, search down) returns false and keeps the
 * generic verdict.
 */
async function isSongRightsRestricted(entry: OnethingRadioProgrammeEntry): Promise<boolean> {
  try {
    const provider = getActiveMusicProvider()
    // Deep enough that album variants surface: the curated version of a song
    // can rank low for its own bare title (field-hit: 琵琶语's chosen record
    // was not in the top five).
    const stdout = await getReliableRunner().run('server', provider.cli.build.search(entry.title, 20))
    return (
      songPlayFlagFromSearch(provider.cli.parse.searchRecords(stdout), {
        encryptedId: entry.encryptedId,
        originalId: entry.originalId,
      }) === false
    )
  } catch {
    return false
  }
}

/**
 * A start failure that is NOT the song's fault (another start already in
 * flight, expired login, wrong player backend). The popped programme entry
 * deserves to go back to the front — dropping it was how curated songs
 * (opening patter included) silently vanished when the user double-tapped ⏭
 * during a start. Genuine per-song failures still drop the entry (putting a
 * rejected song back would wedge the radio on it).
 */
class RadioStartNotSongsFaultError extends Error {
  readonly entryReusable = true
}

function isEntryReusableFailure(error: unknown): boolean {
  return error instanceof Error && (error as { entryReusable?: boolean }).entryReusable === true
}

/** Serializes song starts; see playProgrammeEntry. */
let playStarting: Promise<void> | null = null
/** The entry the in-flight start is for; meaningful only while playStarting is set. */
let playStartingEntry: OnethingRadioProgrammeEntry | null = null

/**
 * The bar's "换歌中" signal: the title being started, undefined when no start
 * is in flight. Covers the whole deliberate-silence window — patter synthesis,
 * the spoken line, play spawn, verify — so the UI stops reading a normal
 * transition as "the radio stalled" (field complaint).
 */
export function getRadioStartingTitle(): string | undefined {
  return playStarting ? (playStartingEntry?.title ?? undefined) : undefined
}

/**
 * Start one song. NCM_LEGACY_PLAY=1 is the one starter that survived the
 * field test: the modern daemon pipeline (play's detached child, hard 3s
 * handshake, manifest revalidation blowing the deadline) went 0/12 in one
 * evening, while legacy in-process playback started every time and still
 * answers socket transport (pause/state). Throws unless the player is
 * actually playing afterwards — the read-back is the verdict, not play's own
 * exit code.
 *
 * Serialized: legacy sessions have no daemon arbitration, so two overlapping
 * starts would both sound. Concurrent callers (conductor advance, bar skip,
 * bar resume) wait for the in-flight start and then throw — by the time it
 * finishes, their own song choice is stale.
 */
async function playProgrammeEntry(entry: OnethingRadioProgrammeEntry): Promise<void> {
  if (playStarting) {
    await playStarting.catch(() => {})
    throw new RadioStartNotSongsFaultError(`另一次起播正在进行,放弃「${entry.title}」`)
  }

  const start = (async () => {
    // Known-unplayable at curation time: refuse before ANY ceremony — a
    // spoken intro for a song that cannot come is the worst version of this
    // failure (field feedback). Callers' grey-skipping loops normally filter
    // these; this guard covers onDeck replays and hand-fed entries.
    if (entry.playFlag === false) {
      throw new Error('版权受限,无法播放——已跳过')
    }
    // The bar's 停止电台 can land at any moment in this multi-second flow;
    // a start that outlives the close would restart the music the user just
    // killed. Checked again after the patter (the longest gap).
    if (!getRadioStore().readBrief().active) {
      throw new RadioStartNotSongsFaultError('电台已停止')
    }
    const reliable = getReliableRunner()
    if (getMusicService().getState().playerBackend !== 'mpv') {
      throw new RadioStartNotSongsFaultError(
        '电台需要内置播放器(mpv);当前是网易云 App 模式,可在状态栏切换',
      )
    }
    // onDeck is written at issue time, not on verified success: a start judged
    // failed may still sound seconds later (the late-start case), and whoever
    // compensates then needs to know which song this was.
    getRadioStore().setOnDeck(entry)
    // The host's timing, like a real radio: if the song's instrumental intro
    // is long enough (first sung lyric line vs estimated speech length), start
    // the music and talk OVER the intro, shutting up before the vocal — no
    // pause, no interruption. Too-short intro / no lyric timeline → speak
    // into silence BEFORE the song instead.
    let talkOverIntro = false
    if (entry.say) {
      const lines = await getLyricLines(entry).catch(() => [] as MusicLyricLine[])
      const vocalAt = firstVocalStartAt(lines)
      talkOverIntro =
        vocalAt !== undefined && vocalAt >= estimateSpeechSeconds(entry.say) + 1.5
      if (!talkOverIntro) {
        const pre = await reliable.readState().catch(() => null)
        if (pre?.status === 'playing' || pre?.status === 'paused') {
          await reliable.run('transport', getActiveMusicProvider().cli.build.stop()).catch(error => {
            console.warn('[radio] could not stop before patter', error)
          })
        }
        await speakDjPatter(entry.say, entry.title).catch(error => {
          console.warn('[radio] patter before play failed; starting the song anyway', error)
        })
        // 停止电台 pressed while the host was talking: the patter was cut and
        // acked, the station closed — do NOT start the song it introduced.
        if (!getRadioStore().readBrief().active) {
          throw new RadioStartNotSongsFaultError('电台已停止')
        }
      }
    }
    // 'start' class: zero retries — play is NOT idempotent, and an automatic
    // re-run after a "failure" that actually made sound plays the song twice.
    // Argv + env (ncm: NCM_LEGACY_PLAY=1) are the provider's measured law.
    const startCommand = getActiveMusicProvider().cli.build.start(entry)
    await reliable.run('start', startCommand.args, startCommand.env)
    if (entry.say && talkOverIntro) {
      // Fire alongside the starting song: TTS synthesis latency (~1-2s)
      // naturally drops the voice a beat into the intro.
      void speakDjPatter(entry.say, entry.title).catch(error => {
        console.warn('[radio] patter over intro failed', error)
      })
    }
    const deadline = Date.now() + PLAY_VERIFY_DEADLINE_MS
    for (;;) {
      await new Promise(resolve => setTimeout(resolve, PLAY_VERIFY_INTERVAL_MS))
      const state = await reliable.readState().catch(() => null)
      if (state?.status === 'playing') {
        // Everything that used to hang off title-matching fires right here
        // instead: we KNOW which song this is — we just started it. The
        // player's own title (stable machine format) rides the pushes so the
        // renderer's display always agrees with the bar.
        onSongStarted(entry, state.title ?? entry.title)
        break
      }
      if (Date.now() >= deadline) {
        // Every caller (conductor advance, bar resume/skip/replay) surfaces
        // this message as the brief's lastError — say the true cause when we
        // know it instead of the generic shrug.
        const systemic = await diagnoseRadioStartFailure().catch(() => null)
        if (systemic) throw new RadioStartNotSongsFaultError(systemic)
        if (await isSongRightsRestricted(entry)) {
          throw new Error('版权受限,网易云不提供这首的播放权——已跳过')
        }
        throw new Error(`play 返回成功但播放器没有在放「${entry.title}」`)
      }
    }
    await refreshMusicNowPlaying()
  })()

  playStartingEntry = entry
  playStarting = start.then(
    () => undefined,
    () => undefined,
  )
  // Announce the transition at both edges: the watcher only pushes CHANGES in
  // player state, and a start's whole point is that the player is silent while
  // it runs — without the nudges the bar would keep claiming 电台停了.
  nudgeMusicClients()
  try {
    await start
  } finally {
    playStarting = null
    nudgeMusicClients()
  }
}

/**
 * The bar's "next" is a skip — the strongest taste signal the DJ gets. Called
 * by the music IPC layer before it forwards the command.
 */
export function recordRadioSkip(): void {
  const store = getRadioStore()
  const brief = store.readBrief()
  if (!brief.active) return
  // onDeck is the song we started (with its id); the sample title is a
  // display-only fallback for songs the radio did not start.
  const title = getMusicNowPlaying()?.title ?? brief.onDeck?.title
  if (title) store.recordSkipped(title, brief.onDeck?.encryptedId)
}

/**
 * Pop entries until one is worth trying: curation-flagged unplayable songs
 * (playFlag: false) are skipped with an honest note instead of being fed to a
 * start that would speak their intro and then fail silently for 12 seconds.
 */
function takeNextPlayableEntry(store: OnethingRadioStore): OnethingRadioProgrammeEntry | null {
  let entry = store.takeNextEntry()
  while (entry && entry.playFlag === false) {
    store.recordError(`「${entry.title}」版权受限,已跳过`)
    entry = store.takeNextEntry()
  }
  return entry
}

/** Undo a pop after a not-the-song's-fault failure — the DJ's order survives. */
function returnEntryToProgramme(store: OnethingRadioStore, entry: OnethingRadioProgrammeEntry): void {
  const programme = store.readProgramme()
  programme.entries.unshift(entry)
  store.writeProgramme(programme)
}

/**
 * The bar gestures' failure ledger: a systemic message (expired login) goes to
 * the status line verbatim — prefixing it with 起播失败(歌名) would bury the
 * one actionable sentence under the name of an innocent song.
 */
function recordStartFailure(entry: { title: string }, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const line = message === NCM_LOGIN_EXPIRED_MESSAGE ? message : `起播失败(${entry.title}):${message}`
  getRadioStore().recordError(line)
  return line
}

/** Resume playback by hand — the bar button. Same starter the conductor uses. */
export async function resumeRadioPlayback(): Promise<boolean> {
  const store = getRadioStore()
  // ▶ on a CLOSED station with songs left is a re-open: flip active back on so
  // the conductor re-engages (auto-advance, DJ wakes) instead of playing one
  // orphan song into a dead station. One button covers "stalled, continue"
  // and "closed earlier, pick it back up".
  const brief = store.readBrief()
  if (!brief.active) {
    const hasContent = store.readProgramme().entries.length > 0 || brief.onDeck !== undefined
    if (!hasContent) return false
    store.writeBrief({ ...brief, active: true })
  }
  // A bar gesture is re-engagement: owe the DJ a wake (and reset any breaker)
  // even if this very resume has nothing left to play.
  store.noteUserEngagement()
  // Prefer fresh curation; with the programme drained, replay the last song
  // known to have played (played songs die with the player's memory).
  const popped = takeNextPlayableEntry(store)
  const entry = popped ?? store.readBrief().onDeck
  if (!entry) return false
  try {
    await playProgrammeEntry(entry)
    store.recordError(undefined)
    return true
  } catch (error) {
    if (popped && isEntryReusableFailure(error)) returnEntryToProgramme(store, popped)
    recordStartFailure(entry, error)
    return false
  }
}

/**
 * The bar's "next" while the radio is on: a skip is recorded by the IPC layer,
 * and the next programme entry starts immediately — there is no player queue
 * to advance anymore, the conductor is the queue. No onDeck fallback: the user
 * is skipping AWAY from that song, replaying it would be mockery.
 */
export async function skipToNextRadioSong(): Promise<boolean> {
  const store = getRadioStore()
  store.noteUserEngagement()
  const entry = takeNextPlayableEntry(store)
  if (!entry) return false
  try {
    await playProgrammeEntry(entry)
    store.recordError(undefined)
    return true
  } catch (error) {
    if (isEntryReusableFailure(error)) returnEntryToProgramme(store, entry)
    recordStartFailure(entry, error)
    return false
  }
}

/**
 * The bar's "prev" while the radio is on: there is no player queue to step
 * back through, so ⏮ means "this song from the top" — replay onDeck.
 */
export async function replayCurrentRadioSong(): Promise<boolean> {
  const store = getRadioStore()
  const entry = store.readBrief().onDeck
  if (!entry) return false
  try {
    await playProgrammeEntry(entry)
    store.recordError(undefined)
    return true
  } catch (error) {
    recordStartFailure(entry, error)
    return false
  }
}

export function isRadioActive(): boolean {
  return getRadioStore().readBrief().active
}

// ----------------------------------------------------------------------------
// The radio tool (the main session's delegation handle)
// ----------------------------------------------------------------------------

function radioToolStatus(): {
  active: boolean
  intent: string
  programmeLength: number
  nowPlayingTitle?: string
  lastError?: string
} {
  const store = getRadioStore()
  const brief = store.readBrief()
  return {
    active: brief.active,
    intent: brief.intent,
    programmeLength: store.readProgramme().entries.length,
    nowPlayingTitle: getMusicNowPlaying()?.title,
    lastError: brief.lastError,
  }
}

/**
 * Open or retune the station. Writes the intent file and applies it
 * synchronously (mergeIntent stamps intentAppliedAt, which owes the conductor
 * one immediate wake), then nudges the watcher so the wake lands within
 * seconds instead of the next idle poll.
 */
/**
 * The one open/retune path, shared by the model's radio tool and the bar's
 * 开电台/新电台 buttons. An empty intent is legitimate here: the open prompt's
 * intent-line degradation turns it into "按时段和历史自主定调" — "让 DJ 看着办"
 * costs zero new logic.
 */
export function openRadioStation(intent: string, options: { clearProgramme: boolean }): void {
  const store = getRadioStore()
  if (options.clearProgramme) {
    store.writeProgramme({ entries: [] })
    writeJsonFile(store.inboxPath, { entries: [] })
  }
  writeJsonFile(store.intentPath, {
    active: true,
    intent,
    startedAt: new Date().toISOString(),
  })
  store.mergeIntent()
  void refreshMusicNowPlaying()
}

export async function radioToolOpen(
  intent: string,
  options: { clearProgramme: boolean },
): Promise<ReturnType<typeof radioToolStatus>> {
  if (!isMusicEnabled()) {
    // Honest failure beats a receipt that promises a DJ who will never wake.
    throw new Error('音乐电台未启用:请在 设置 → 音乐 完成配置并打开总开关')
  }
  openRadioStation(intent, options)
  return radioToolStatus()
}

/** Close the station: inactive FIRST, then stop — the order that avoids auto-revive. */
export async function radioToolClose(): Promise<ReturnType<typeof radioToolStatus>> {
  const store = getRadioStore()
  writeJsonFile(store.intentPath, { active: false })
  store.mergeIntent()
  try {
    await getReliableRunner().run('transport', getActiveMusicProvider().cli.build.stop())
  } catch (error) {
    console.warn('[radio] stop on close failed', error)
  }
  await refreshMusicNowPlaying()
  return radioToolStatus()
}

export { radioToolStatus }

// ----------------------------------------------------------------------------
// Song requests (chat's radio tool + the panel's search, one shared channel)
// ----------------------------------------------------------------------------

/**
 * 「下一首放 xxx」 made real: search, pick the first PLAYABLE record, cut in
 * at the front of the programme. Requested songs carry no patter — the
 * listener asked for the song, not an introduction — and `note: '点歌'` marks
 * them in the panel. Honest failures: nothing found / only grey versions /
 * already queued or playing.
 */
export async function requestSong(
  query: string,
): Promise<{ success: boolean; title?: string; error?: string }> {
  if (!isMusicEnabled()) return { success: false, error: '音乐电台未启用' }
  const store = getRadioStore()
  if (!store.readBrief().active) {
    return { success: false, error: '电台未开——先开台再点歌' }
  }

  const provider = getActiveMusicProvider()
  let records
  try {
    const stdout = await getReliableRunner().run('server', provider.cli.build.search(query, 10))
    records = provider.cli.parse.searchRecords(stdout)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: `搜索失败:${message}` }
  }
  if (records.length === 0) return { success: false, error: `没搜到「${query}」` }

  const playable = records.find(record => record.playFlag !== false)
  if (!playable) return { success: false, error: `「${query}」搜到的版本都无播放版权` }

  const entry = provider.ids.normalizeEntry({
    encryptedId: playable.primaryId,
    originalId: playable.altId ?? playable.primaryId,
    title: playable.artist ? `${playable.title} - ${playable.artist}` : playable.title,
    note: '点歌',
    playFlag: playable.playFlag,
  })
  if (!entry) return { success: false, error: '搜索结果的 id 不可用' }

  const playingTitle = getMusicNowPlaying()?.title
  if (playingTitle === entry.title) {
    return { success: true, title: entry.title, error: '这首正在放' }
  }
  const programme = store.readProgramme()
  const queuedAt = programme.entries.findIndex(
    item => item.encryptedId.toLowerCase() === entry.encryptedId.toLowerCase(),
  )
  if (queuedAt !== -1) {
    // Already curated: a request means "sooner", so promote instead of dup.
    const [existing] = programme.entries.splice(queuedAt, 1)
    programme.entries.unshift(existing)
  } else {
    programme.entries.unshift(entry)
  }
  store.writeProgramme(programme)
  nudgeMusicClients()
  return { success: true, title: entry.title }
}

// ----------------------------------------------------------------------------
// Programme panel (visible, editable queue)
// ----------------------------------------------------------------------------

export function getProgrammeSnapshot(): {
  entries: Array<{
    encryptedId: string
    title: string
    say?: string
    note?: string
    playFlag?: boolean
  }>
  onDeck?: string
} {
  const store = getRadioStore()
  return {
    entries: store.readProgramme().entries.map(entry => ({
      encryptedId: entry.encryptedId,
      title: entry.title,
      say: entry.say,
      note: entry.note,
      playFlag: entry.playFlag,
    })),
    onDeck: store.readBrief().onDeck?.title,
  }
}

/**
 * Panel edits. All synchronous read-modify-writes through the store in the
 * main process — the conductor pops entries on the same event loop, so there
 * is no interleaving to race. The conductor stays the only CONSUMER of the
 * programme; these are the user's explicit orders about what it consumes.
 */
export function applyProgrammeAction(
  action:
    | { kind: 'remove'; encryptedId: string }
    | { kind: 'promote'; encryptedId: string }
    | { kind: 'move'; encryptedId: string; toIndex: number },
): { success: boolean; error?: string } {
  const store = getRadioStore()
  const programme = store.readProgramme()
  const index = programme.entries.findIndex(
    entry => entry.encryptedId.toLowerCase() === action.encryptedId.toLowerCase(),
  )
  // The entry may have been popped by the conductor between the panel's read
  // and the click — a no-op, not an error.
  if (index === -1) return { success: true }

  const [entry] = programme.entries.splice(index, 1)
  if (action.kind === 'remove') {
    // Removing from the queue IS the strongest taste signal: the DJ's next
    // batch reads skipped history and steers away.
    store.recordSkipped(entry.title, entry.encryptedId)
  } else if (action.kind === 'promote') {
    programme.entries.unshift(entry)
  } else {
    const to = Math.max(0, Math.min(programme.entries.length, action.toIndex))
    programme.entries.splice(to, 0, entry)
  }
  store.writeProgramme(programme)
  nudgeMusicClients()
  return { success: true }
}

/**
 * Heart the current song. The AI is forbidden from touching 红心; the bar's
 * button is the legitimate path — the click IS the explicit user intent. The
 * song id comes from onDeck (the only place the current song's id survives),
 * so this works for radio-started songs only.
 */
export async function likeCurrentSong(): Promise<{ success: boolean; error?: string }> {
  const store = getRadioStore()
  // Radio-started songs are known via onDeck; anything else may have been
  // reverse-identified from the player's title (a same-source compare, which
  // is safe — the cross-source title comparison is what got banned).
  const playingTitle = getMusicNowPlaying()?.title
  const identified =
    identifiedCurrent && playingTitle === identifiedCurrent.title ? identifiedCurrent : null
  const candidate = identified ?? store.readBrief().onDeck
  if (!candidate) {
    return { success: false, error: '不知道这首歌的 id,暂时没法红心' }
  }
  try {
    await getReliableRunner().run(
      'server',
      getActiveMusicProvider().cli.build.like({
        encryptedId: candidate.encryptedId,
        originalId: candidate.originalId,
        title: candidate.title,
      }),
    )
    store.recordLoved(playingTitle ?? candidate.title, candidate.encryptedId)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '红心失败' }
  }
}

// ----------------------------------------------------------------------------
// Lyrics (the composer's placeholder)
// ----------------------------------------------------------------------------

const lyricCache = new Map<string, MusicLyricLine[]>()
let currentLyrics: MusicLyrics | null = null

export function getMusicLyrics(): MusicLyrics | null {
  return currentLyrics
}

/**
 * Fetch (once per song, cached) and push the timed lyrics for a song the radio
 * just started. Best-effort: no lyrics is ambience missing, never an error the
 * user sees. One server call per new song — the cache keeps replays free.
 */
/** Fetch (cached) the timed lyric lines for a song — shared by the lyric push
 * and the talk-over-the-intro timing decision. */
async function getLyricLines(entry: OnethingRadioProgrammeEntry): Promise<MusicLyricLine[]> {
  let lines = lyricCache.get(entry.encryptedId)
  if (!lines) {
    const provider = getActiveMusicProvider()
    const stdout = await getReliableRunner().run('server', provider.cli.build.lyric(entry))
    // The provider's parser degrades garbage to "no lyrics", never a throw.
    lines = provider.cli.parse.lyric(stdout)
    // Evict the oldest entry, not the whole cache — clear-all used to wipe the
    // CURRENT song's lines too, forcing a refetch mid-play.
    if (lyricCache.size > 20) {
      const oldest = lyricCache.keys().next().value
      if (oldest !== undefined) lyricCache.delete(oldest)
    }
    lyricCache.set(entry.encryptedId, lines)
  }
  return lines
}

async function pushLyricsFor(entry: OnethingRadioProgrammeEntry, playerTitle: string): Promise<void> {
  try {
    const lines = await getLyricLines(entry)
    // The PLAYER's title, not the DJ's: the renderer guards lyrics against the
    // bar's now-playing title, and only the player agrees with itself.
    currentLyrics = { title: playerTitle, lines }
    broadcastElectronVoiceMessage({ channel: IPC_CHANNELS.MUSIC_LYRICS, payload: currentLyrics })
  } catch (error) {
    console.warn(`[radio] could not fetch lyrics for 「${entry.title}」`, error)
  }
}

// ----------------------------------------------------------------------------
// Reverse identification (songs someone else started)
// ----------------------------------------------------------------------------

let lastObservedTitle: string | undefined
/** Titles we already failed to identify — do not burn a search per poll. */
const identifyMisses = new Set<string>()
/** The identified currently-playing song; title is the PLAYER's own string. */
let identifiedCurrent: (OnethingMusicIdentifiedSong & { title: string }) | null = null

/**
 * Ceremonies follow the song, not the code path: when a song WE did not start
 * shows up (the model's manual `play`), recover its id by exact-title search
 * and push its lyrics too. Exact or nothing — captioning the wrong song is
 * worse than no caption.
 */
async function observeUnknownSong(sample: OnethingMusicNowPlaying | null): Promise<void> {
  if (sample?.status !== 'playing' || !sample.title) return
  if (sample.title === lastObservedTitle) return
  lastObservedTitle = sample.title
  identifiedCurrent = null
  // Radio-started songs already had their ceremonies at start (the lyrics
  // push carries the player's title, so this same-source compare is safe).
  if (currentLyrics?.title === sample.title) return
  if (identifyMisses.has(sample.title)) return
  try {
    const provider = getActiveMusicProvider()
    const stdout = await getReliableRunner().run('server', provider.cli.build.search(sample.title, 10))
    const match = matchSongFromSearch(provider.cli.parse.searchRecords(stdout), sample.title)
    if (!match) {
      // Bounded: a long-running station observing many unidentifiable titles
      // must not leak; dropping the oldest only means one extra search someday.
      if (identifyMisses.size >= 200) {
        const oldest = identifyMisses.values().next().value
        if (oldest !== undefined) identifyMisses.delete(oldest)
      }
      identifyMisses.add(sample.title)
      return
    }
    identifiedCurrent = { ...match, title: sample.title }
    void pushLyricsFor(
      { encryptedId: match.encryptedId, originalId: match.originalId, title: sample.title },
      sample.title,
    )
  } catch (error) {
    console.warn(`[radio] could not identify 「${sample.title}」`, error)
  }
}

/**
 * Hook the conductor into the now-playing watcher. Idempotent; called at IPC
 * init right after the watcher starts. Costs nothing while the radio is off —
 * every sample begins with a brief read that says "inactive".
 */
/** The master switch, live-readable so a settings toggle needs no restart. */
function isMusicEnabled(): boolean {
  return getSettings().music?.enabled === true
}

export function startRadioConductor(): void {
  if (conductor) return
  // Cold-start correctness for the backend gate in playProgrammeEntry: the
  // in-memory playerBackend defaults to mpv until an env probe runs, and
  // nothing probes unless the settings tab is opened — an orpheus install
  // would be waved through. One boot-time probe pins the real value.
  void getMusicService()
    .refreshEnv()
    .catch(() => {})
  conductor = createOnethingRadioConductor({
    store: getRadioStore(),
    runner: getReliableRunner(),
    playSong: playProgrammeEntry,
    wakeDj: wakeRadioDj,
    diagnoseStartFailure: diagnoseRadioStartFailure,
    // A start's patter speaks into deliberate silence; without this the
    // conductor reads that silence as "song over" and pops entries into the
    // mutex (one song burned per long patter).
    startInFlight: () => playStarting !== null,
    onLateStart: () => {
      // A start we misjudged is audibly playing: onDeck knows which song —
      // fire the ceremonies it missed.
      const onDeck = getRadioStore().readBrief().onDeck
      if (!onDeck) return
      onSongStarted(onDeck, getMusicNowPlaying()?.title ?? onDeck.title)
    },
    logger: console,
  })
  setMusicSampleListener(sample => {
    // The master switch, enforced where everything converges: with music
    // disabled the conductor never ticks (no advance, no DJ wakes, no merges)
    // and the radio stays genuinely dormant — the switch used to be cosmetic.
    if (!isMusicEnabled()) return
    conductor?.onSample(sample)
    void observeUnknownSong(sample)
  })
}

export function disposeRadioConductor(): void {
  setMusicSampleListener(null)
  conductor = null
  radioStore = null
  // Full module-state reset: a dispose→re-init cycle (tests, future hot
  // reconfiguration) must not inherit stale grants, caches, or a held mutex.
  grantedSessions.clear()
  lyricCache.clear()
  currentLyrics = null
  identifyMisses.clear()
  lastObservedTitle = undefined
  identifiedCurrent = null
  playStarting = null
  playStartingEntry = null
}
