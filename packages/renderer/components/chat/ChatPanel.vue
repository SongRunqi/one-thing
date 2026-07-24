<template>
  <div
    ref="chatPanelRef"
    class="chat-panel"
  >
    <MessageList
      ref="messageListRef"
      :messages="panelMessages"
      :is-loading="isLoading"
      :session-id="effectiveSessionId"
      :layout-transitioning="props.layoutTransitioning"
      :outline-rail-target="props.outlineRailTarget"
      @set-quoted-text="handleSetQuotedText"
      @set-input-text="handleSetInputText"
      @regenerate="handleRegenerate"
      @edit-and-resend="handleEditAndResend"
      @split-with-branch="(sessionId) => emit('splitWithBranch', sessionId)"
      @open-file="(filePath) => emit('openFile', filePath)"
      @review-goal="(goalSessionId) => emit('reviewGoal', goalSessionId)"
    />

    <Teleport
      :to="props.footerTarget ?? 'body'"
      :disabled="!props.footerTarget"
    >
      <div
        v-show="props.active"
        ref="composerContainerRef"
        v-memo="[props.active, isGenerating, effectiveSessionId, currentPendingPermission?.toolCall.id, queuedBehindPermission.length, showRejectInstruction, goalMusicOffset]"
        class="composer-container"
        :style="{ '--goal-music-offset': goalMusicOffset + 'px' }"
      >
        <BackgroundJobsStatusBar />
        <GoalStatusBar :session-id="effectiveSessionId" />

        <!-- Permission ledger: the request read as a key/value form in the
             composer's blueprint language — hairline rows, mono cells, zero
             fill. Scope is a column of the form, not a row of pill buttons,
             so a standing grant can never be a mis-click on "Allow". -->
        <div
          v-if="currentPendingPermission"
          class="session-permission-panel"
        >
          <div class="permission-row">
            <span class="permission-key">tool</span>
            <span class="permission-value">{{ permissionTool(currentPendingPermission.toolCall) }}</span>
          </div>
          <div class="permission-row">
            <span class="permission-key">target</span>
            <span class="permission-value">{{ permissionTarget(currentPendingPermission.toolCall) }}</span>
          </div>
          <div
            v-if="permissionPreview(currentPendingPermission.toolCall)"
            class="permission-row"
          >
            <span class="permission-key">{{ permissionDetailKey(currentPendingPermission.toolCall) }}</span>
            <span class="permission-value is-dim">{{ permissionPreview(currentPendingPermission.toolCall) }}</span>
          </div>
          <div class="permission-row is-scope">
            <span class="permission-key">scope</span>
            <span class="permission-value">
              <Button
                v-for="option in scopeOptions"
                :key="option.value"
                unstyled
                class="permission-scope-btn"
                native-type="button"
                :aria-pressed="permissionScope === option.value"
                :title="option.hint"
                @click="permissionScope = option.value"
              >
                {{ option.label }}
              </Button>
            </span>
          </div>
          <div
            v-if="showRejectInstruction"
            class="permission-row is-instruction"
          >
            <span class="permission-key">reason</span>
            <textarea
              v-model="rejectInstruction"
              class="permission-instruction-input"
              placeholder="Tell the assistant what to do instead..."
              rows="2"
              @keydown.stop
            />
          </div>
          <div class="permission-foot">
            <span class="permission-hint">
              {{ queuedBehindPermission.length > 0
                ? `${queuedBehindPermission.length} queued behind this permission`
                : 'awaiting your decision' }}
            </span>
            <Button
              v-if="showRejectInstruction"
              unstyled
              class="permission-btn reject"
              native-type="button"
              @click="rejectCurrentPermissionWithInstruction"
            >
              SEND REJECTION
            </Button>
            <template v-else>
              <Button
                unstyled
                class="permission-btn reject"
                native-type="button"
                title="Reject this call"
                @click="rejectCurrentPermission"
              >
                REJECT
              </Button>
              <Button
                unstyled
                class="permission-btn instruct"
                native-type="button"
                title="Reject and tell the assistant what to do instead"
                @click="showRejectInstruction = true"
              >
                REJECT…
              </Button>
            </template>
            <Button
              unstyled
              class="permission-btn allow"
              native-type="button"
              :title="`Allow (${permissionScopeLabel})`"
              @click="approveCurrentPermission(permissionScope)"
            >
              ALLOW
            </Button>
          </div>
        </div>

        <InputBox
          ref="inputBoxRef"
          :is-loading="isGenerating"
          :session-id="effectiveSessionId"
          @send-message="handleSendMessage"
          @stop-generation="handleStopGeneration"
          @switch-session="handleSwitchSession"
        />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useChatStore } from '@/stores/chat'
import { useMusicStore } from '@/stores/music'
import { useChatSession } from '@/composables/useChatSession'
import MessageList from './MessageList.vue'
import InputBox from './InputBox.vue'
import BackgroundJobsStatusBar from './BackgroundJobsStatusBar.vue'
import GoalStatusBar from './GoalStatusBar.vue'
import type { MessageAttachment, ToolCall } from '@/types'
import { buildToolActivityTarget, buildToolPermissionTitle } from '@/stores/helpers/tool-display'

const props = withDefaults(defineProps<{
  sessionId?: string
  active?: boolean
  footerTarget?: HTMLElement | null
  layoutTransitioning?: boolean
  outlineRailTarget?: HTMLElement | null
}>(), {
  active: true,
  footerTarget: null,
  layoutTransitioning: false,
  outlineRailTarget: null,
})

const emit = defineEmits<{
  splitWithBranch: [sessionId: string]
  openFile: [filePath: string]
  reviewGoal: [sessionId: string]
  switchSession: [sessionId: string]
}>()

const sessionsStore = useSessionsStore()
const chatStore = useChatStore()
const musicStore = useMusicStore()

const effectiveSessionId = computed(() => props.sessionId || sessionsStore.currentSessionId)

// The music bar is an out-of-flow flyout floating up over the composer's top
// edge, right where the goal bar sits. When it is showing, lift the goal bar
// clear by its height (plus the bar's own 9px top gap) so the goal reads above
// the music bar instead of being covered by it.
// Pinned, the bar is no longer out of flow: the composer reserves its height
// (InputBox's --music-bar-reserve), so the goal bar already clears it and
// lifting again would just open a second empty gap.
const goalMusicOffset = computed(() =>
  musicStore.barHeight > 0 && !musicStore.barPinned ? musicStore.barHeight + 9 : 0,
)

const {
  messages,
  isLoading,
  isGenerating,
  sendMessage: chatSendMessage,
  steerMessage: chatSteerMessage,
  queueFollowUpMessage: chatQueueFollowUpMessage,
  regenerate: chatRegenerate,
  editAndResend: chatEditAndResend,
  stopGeneration: chatStopGeneration,
} = useChatSession(effectiveSessionId)

const currentSession = computed(() => {
  const sid = effectiveSessionId.value
  if (!sid) return null
  return sessionsStore.getSessionItem(sid) || null
})

const panelMessages = computed(() => messages.value)

// Actionability needs both truths: `requiresConfirmation` is persisted engine
// history, `canRespond` marks a live emitted prompt in the permission manager
// (set from permission events / the pending seed). Either alone renders a
// card that can't be answered — stale after restart, or a queued follower.
const currentPendingPermission = computed<{ toolCall: ToolCall } | null>(() => {
  for (const message of panelMessages.value) {
    const toolCall = message.toolCalls?.find(tc => tc.requiresConfirmation && tc.canRespond)
    if (toolCall) return { toolCall }
  }
  return null
})

const queuedBehindPermission = computed(() => {
  const pending = currentPendingPermission.value?.toolCall
  if (!pending) return []
  const queued: ToolCall[] = []
  let seenPending = false
  for (const message of panelMessages.value) {
    for (const toolCall of message.toolCalls || []) {
      if (toolCall.id === pending.id) {
        seenPending = true
        continue
      }
      if (seenPending && toolCall.status === 'queued') {
        queued.push(toolCall)
      }
    }
  }
  return queued
})

const showRejectInstruction = ref(false)
const rejectInstruction = ref('')
const permissionScope = ref<PermissionResponse>('once')

watch(currentPendingPermission, () => {
  showRejectInstruction.value = false
  rejectInstruction.value = ''
  // Never carry a standing scope across requests — each grant is chosen fresh.
  permissionScope.value = 'once'
})

const scopeOptions = computed(() => {
  const options: Array<{ value: PermissionResponse; label: string; hint: string }> = [
    { value: 'once', label: 'once', hint: 'Allow this call only' },
    { value: 'session', label: 'session', hint: 'Allow for this session' },
  ]
  const toolCall = currentPendingPermission.value?.toolCall
  if (toolCall && canAllowWorkspace(toolCall)) {
    options.push({ value: 'workdir', label: 'workspace', hint: 'Allow in this workspace' })
  }
  return options
})

const permissionScopeLabel = computed(() => {
  return scopeOptions.value.find(option => option.value === permissionScope.value)?.label || 'once'
})

// A scope can disappear between requests (workspace is withheld for sensitive
// reads); fall back rather than approve with a scope the UI no longer offers.
watch(scopeOptions, options => {
  if (!options.some(option => option.value === permissionScope.value)) {
    permissionScope.value = 'once'
  }
})

const inputBoxRef = ref<InstanceType<typeof InputBox> | null>(null)
const messageListRef = ref<InstanceType<typeof MessageList> | null>(null)
const chatPanelRef = ref<HTMLElement | null>(null)
const composerContainerRef = ref<HTMLElement | null>(null)
const TAIL_SNAPSHOT_DISTANCE_PX = 4
const RESTORE_WAIT_FRAME_LIMIT = 120
let composerResizeObserver: ResizeObserver | null = null
let composerMeasureFrame: number | null = null
let lastMeasuredComposerHeight = -1
let contentColumnResizeObserver: ResizeObserver | null = null
let contentColumnMeasureFrame: number | null = null
let layoutFollowFrame: number | null = null
let lastMeasuredPanelLeft: number | null = null
let pendingComposerResizeHeight: number | null = null

const CONTENT_COLUMN_VAR_NAMES = [
  '--chat-composer-width',
  '--chat-content-column-left',
  '--chat-content-column-right',
  '--chat-content-column-center',
] as const

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

function getContentColumnElement(): HTMLElement | null {
  return chatPanelRef.value?.querySelector<HTMLElement>('.message-list-content') ?? null
}

function getLayoutVariableTargets(): HTMLElement[] {
  return [composerContainerRef.value].filter((element): element is HTMLElement => Boolean(element))
}

function clearContentColumnVariables() {
  for (const target of getLayoutVariableTargets()) {
    for (const name of CONTENT_COLUMN_VAR_NAMES) {
      target.style.removeProperty(name)
    }
  }
}

function cssPx(value: number): string {
  return `${Math.max(0, value).toFixed(2)}px`
}

function getResizeEntryBlockSize(entry: ResizeObserverEntry): number {
  const borderBox = entry.borderBoxSize
  const firstBorderBox = Array.isArray(borderBox) ? borderBox[0] : borderBox
  return firstBorderBox?.blockSize ?? entry.contentRect.height
}

function measureContentColumn() {
  contentColumnMeasureFrame = null

  const panel = chatPanelRef.value
  const column = getContentColumnElement()
  if (!panel || !column) {
    clearContentColumnVariables()
    return
  }

  const panelRect = panel.getBoundingClientRect()
  const columnRect = column.getBoundingClientRect()
  lastMeasuredPanelLeft = panelRect.left
  const left = columnRect.left - panelRect.left
  const right = panelRect.right - columnRect.right
  const width = columnRect.width
  const center = left + width / 2

  const values = {
    '--chat-composer-width': cssPx(width),
    '--chat-content-column-left': cssPx(left),
    '--chat-content-column-right': cssPx(right),
    '--chat-content-column-center': cssPx(center),
  }

  for (const target of getLayoutVariableTargets()) {
    for (const [name, value] of Object.entries(values)) {
      target.style.setProperty(name, value)
    }
  }
}

function scheduleContentColumnMeasure() {
  if (contentColumnMeasureFrame !== null) return
  contentColumnMeasureFrame = requestAnimationFrame(measureContentColumn)
}

function observeContentColumn() {
  contentColumnResizeObserver?.disconnect()
  contentColumnResizeObserver = null
  scheduleContentColumnMeasure()

  const panel = chatPanelRef.value
  if (!panel || typeof ResizeObserver === 'undefined') return

  contentColumnResizeObserver = new ResizeObserver(scheduleContentColumnMeasure)
  contentColumnResizeObserver.observe(panel)

  const column = getContentColumnElement()
  if (column) {
    contentColumnResizeObserver.observe(column)
  }
}

function setComposerHeightVariable(height: number) {
  const measuredHeight = Math.max(0, Math.ceil(height))
  if (measuredHeight === lastMeasuredComposerHeight) return
  lastMeasuredComposerHeight = measuredHeight
  for (const target of getLayoutVariableTargets()) {
    target.style.setProperty('--chat-composer-height', `${measuredHeight}px`)
  }
  messageListRef.value?.notifyLayoutChange?.()
}

function applyPendingComposerResizeHeight(): boolean {
  if (pendingComposerResizeHeight === null) return false
  const height = pendingComposerResizeHeight
  pendingComposerResizeHeight = null
  setComposerHeightVariable(height)
  return true
}

function measureComposerHeight() {
  composerMeasureFrame = null
  if (applyPendingComposerResizeHeight()) return
  const composer = composerContainerRef.value
  setComposerHeightVariable(composer?.getBoundingClientRect().height ?? 0)
}

function scheduleComposerMeasure() {
  if (composerMeasureFrame !== null) return
  composerMeasureFrame = requestAnimationFrame(measureComposerHeight)
}

function observeComposerHeight() {
  composerResizeObserver?.disconnect()
  composerResizeObserver = null
  scheduleComposerMeasure()

  const composer = composerContainerRef.value
  if (!composer || typeof ResizeObserver === 'undefined') return

  composerResizeObserver = new ResizeObserver((entries) => {
    const entry = entries.find(item => item.target === composerContainerRef.value) ?? entries[0]
    if (!entry) return
    pendingComposerResizeHeight = getResizeEntryBlockSize(entry)
    applyPendingComposerResizeHeight()
  })
  composerResizeObserver.observe(composer, { box: 'border-box' })
}

function permissionTitle(toolCall: ToolCall): string {
  return buildToolPermissionTitle(toolCall)
}

function permissionTool(toolCall: ToolCall): string {
  return String(toolCall.toolName || toolCall.toolId || 'tool').trim().toLowerCase()
}

// The ledger splits what the title fuses: `target` is the thing being acted
// on, so drop the leading verb the permission title prepends ("Write <path>").
function permissionTarget(toolCall: ToolCall): string {
  const args = (toolCall.arguments || {}) as Record<string, unknown>
  const direct = args.path ?? args.file_path ?? args.command ?? toolCall.changes?.filePath
  if (direct) return String(direct).replace(/\s*\n\s*/g, ' ')
  const activityTarget = buildToolActivityTarget(toolCall.toolName || toolCall.toolId, toolCall)
  if (activityTarget) return activityTarget
  const title = buildToolPermissionTitle(toolCall)
  const [, remainder] = title.match(/^\S+\s+(.+)$/) || []
  return remainder || title
}

function permissionDetailKey(toolCall: ToolCall): string {
  return toolCall.changes ? 'diff' : 'detail'
}

function permissionPreview(toolCall: ToolCall): string {
  if (toolCall.changes) return `+${toolCall.changes.additions || 0} -${toolCall.changes.deletions || 0}`
  // The command already fills the `target` row for bash — don't print it twice.
  return ''
}

type PermissionResponse = 'once' | 'session' | 'workdir'

function canAllowWorkspace(toolCall: ToolCall): boolean {
  const permissionType = String((toolCall as any).permissionType || toolCall.arguments?.permissionType || '')
  const name = (toolCall.toolName || toolCall.toolId || '').toLowerCase()
  // Sensitive file reads should not be granted workspace-wide in the first scope UX.
  if (permissionType === 'sensitive_file_read') return false
  // Repointing a capability is always a one-time answer — core refuses to turn
  // it into a standing grant, so never offer the button either.
  if (permissionType === 'capability_change') return false
  if (name === 'read' && /\.env|\.pem$|\.key$|\.p12$|\.pfx$/i.test(permissionTitle(toolCall))) return false
  return true
}

function approveCurrentPermission(response: PermissionResponse = 'once') {
  const toolCall = currentPendingPermission.value?.toolCall
  if (!toolCall) return
  messageListRef.value?.confirmTool(toolCall, response)
}

function rejectCurrentPermission() {
  const toolCall = currentPendingPermission.value?.toolCall
  if (!toolCall) return
  messageListRef.value?.rejectTool(toolCall)
}

function rejectCurrentPermissionWithInstruction() {
  const toolCall = currentPendingPermission.value?.toolCall
  if (!toolCall) return
  messageListRef.value?.rejectTool(toolCall, rejectInstruction.value.trim() || undefined)
}

async function waitForRestorePage(
  sessionId: string,
  anchorMessageId?: string,
  options: { allowEmptyTail?: boolean } = {},
) {
  for (let frame = 0; frame < RESTORE_WAIT_FRAME_LIMIT; frame += 1) {
    if (effectiveSessionId.value !== sessionId) return false
    const messages = chatStore.sessionMessages.get(sessionId) ?? []
    const pageState = chatStore.getSessionPageState(sessionId)
    const session = sessionsStore.getSessionItem(sessionId)
    const canRestoreEmptyTail = options.allowEmptyTail === true &&
      !anchorMessageId &&
      messages.length === 0 &&
      (
        sessionsStore.isNewChatDraftId(sessionId) ||
        pageState?.totalCount === 0 ||
        session?.messageCount === 0 ||
        (!isLoading.value && !pageState && typeof session?.messageCount !== 'number')
      )
    const hasRestoreMessages = messages.length > 0 || canRestoreEmptyTail
    const hasAnchor = !anchorMessageId || messages.some(message => message.id === anchorMessageId)
    if (!isLoading.value && hasRestoreMessages && hasAnchor) {
      await nextTick()
      return true
    }
    await nextFrame()
  }
  return effectiveSessionId.value === sessionId
}

function saveCurrentSnapshot(sessionId: string, prepareForSwitch = false) {
  const distanceToBottom = messageListRef.value?.getDistanceToBottom() ?? 0
  const isAtTail = distanceToBottom <= TAIL_SNAPSHOT_DISTANCE_PX
  const anchorMessageId = messageListRef.value?.getAnchorMessageId() ?? undefined
  const anchorOffset = messageListRef.value?.getAnchorOffset() ?? 0
  const navMessageId = messageListRef.value?.getNavMessageId() ?? undefined
  const hasNavigated = messageListRef.value?.getHasNavigated() ?? false
  const messageInput = inputBoxRef.value?.getMessageInput() ?? ''
  const quotedText = inputBoxRef.value?.getQuotedText() ?? ''
  const attachments = inputBoxRef.value?.getAttachments() ?? []

  if (prepareForSwitch) {
    messageListRef.value?.prepareForSwitch()
  }

  chatStore.saveSnapshot(sessionId, {
    mode: isAtTail || !anchorMessageId ? 'tail' : 'anchor',
    anchorMessageId: isAtTail ? undefined : anchorMessageId,
    offsetWithinMessage: isAtTail ? undefined : anchorOffset,
    navMessageId: isAtTail ? undefined : navMessageId,
    hasNavigated,
    messageInput,
    quotedText,
    attachments,
  })
}

async function restoreCurrentSnapshot(sessionId: string) {
  const snapshot = chatStore.getSnapshot(sessionId)
  if (!snapshot) {
    await waitForRestorePage(sessionId, undefined, { allowEmptyTail: true })
    if (effectiveSessionId.value !== sessionId) return false
    messageListRef.value?.restoreTail()
    return false
  }

  if (snapshot.mode === 'anchor') {
    await waitForRestorePage(sessionId, snapshot.anchorMessageId)
  }
  if (effectiveSessionId.value !== sessionId) return false

  if (snapshot.mode === 'anchor') {
    messageListRef.value?.restoreAnchor(snapshot)
  } else {
    messageListRef.value?.restoreTail()
  }

  if (effectiveSessionId.value !== sessionId) return false
  inputBoxRef.value?.restoreSnapshot(snapshot)
  return true
}

onMounted(() => {
  observeComposerHeight()
  observeContentColumn()
  const sessionId = effectiveSessionId.value
  if (sessionId) {
    restoreCurrentSnapshot(sessionId)
  }
})

onBeforeUnmount(() => {
  composerResizeObserver?.disconnect()
  composerResizeObserver = null
  if (composerMeasureFrame !== null) {
    cancelAnimationFrame(composerMeasureFrame)
    composerMeasureFrame = null
  }
  contentColumnResizeObserver?.disconnect()
  contentColumnResizeObserver = null
  if (contentColumnMeasureFrame !== null) {
    cancelAnimationFrame(contentColumnMeasureFrame)
    contentColumnMeasureFrame = null
  }
  stopLayoutFollowLoop()

  const sessionId = effectiveSessionId.value
  if (sessionId) {
    saveCurrentSnapshot(sessionId)
  }
})

watch(
  () => [props.footerTarget, props.active] as const,
  () => {
    nextTick(() => {
      observeComposerHeight()
      scheduleContentColumnMeasure()
      messageListRef.value?.notifyLayoutChange?.()
    })
  },
  { flush: 'post' },
)

// While the sidebar (or another layout region) animates, re-measure every frame
// so the composer column tracks the moving layout instead of snapping afterwards.
function stopLayoutFollowLoop() {
  if (layoutFollowFrame !== null) {
    cancelAnimationFrame(layoutFollowFrame)
    layoutFollowFrame = null
  }
}

function runLayoutFollowLoop() {
  if (layoutFollowFrame !== null) return
  layoutFollowFrame = requestAnimationFrame(() => {
    layoutFollowFrame = null
    if (!props.layoutTransitioning) return
    const prevPanelLeft = lastMeasuredPanelLeft
    measureContentColumn()
    if (prevPanelLeft !== null && lastMeasuredPanelLeft !== null) {
      const delta = prevPanelLeft - lastMeasuredPanelLeft
      if (Math.abs(delta) >= 0.5) applyLayoutFlip(delta)
    }
    runLayoutFollowLoop()
  })
}

// The panel origin snaps in a single frame when the docked sidebar toggles
// (its width is deliberately discrete, see App.vue). Margin/width transitions
// on the composer children ease relative to the container, so without
// compensation the whole composer still jumps by the panel delta. FLIP: shift
// the container back by that delta, then release it on the same curve.
// Carrying the in-flight transform keeps re-toggles mid-animation smooth.
function applyLayoutFlip(delta: number) {
  const composer = composerContainerRef.value
  if (!composer) return
  const transform = getComputedStyle(composer).transform
  const carried = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).m41 : 0
  composer.style.transitionProperty = 'none'
  composer.style.transform = `translateX(${(delta + carried).toFixed(2)}px)`
  void composer.offsetWidth
  composer.style.transitionProperty = ''
  composer.style.transform = 'translateX(0px)'
}

function clearLayoutFlip() {
  const composer = composerContainerRef.value
  if (!composer) return
  composer.style.transitionProperty = ''
  composer.style.transform = ''
}

watch(
  () => props.layoutTransitioning,
  (isTransitioning) => {
    // Imperative class: the container sits behind a v-memo, so a reactive
    // :class binding would not re-render on this prop alone.
    const composer = composerContainerRef.value
    if (isTransitioning) {
      composer?.classList.add('is-layout-animating')
      runLayoutFollowLoop()
      return
    }
    stopLayoutFollowLoop()
    clearLayoutFlip()
    composer?.classList.remove('is-layout-animating')
    // Final true-up once the animation settles.
    scheduleContentColumnMeasure()
    scheduleComposerMeasure()
  },
)

// Session switch: save/restore scroll position and input state
watch(effectiveSessionId, async (newId, oldId) => {
  const start = performance.now()
  const oldMessageCount = oldId ? (chatStore.sessionMessages.get(oldId)?.length ?? 0) : 0
  const newMessageCount = newId ? (chatStore.sessionMessages.get(newId)?.length ?? 0) : 0
  if (oldId && oldId !== newId) {
    saveCurrentSnapshot(oldId, true)
  }

  const beforeTick = performance.now()
  await nextTick()
  const afterTick = performance.now()

  if (newId) {
    const hadSnapshot = !!chatStore.getSnapshot(newId)
    if (effectiveSessionId.value !== newId) return
    if (!hadSnapshot) {
      inputBoxRef.value?.clearInput()
    }
    await restoreCurrentSnapshot(newId)
    if (effectiveSessionId.value !== newId) return
  }

  requestAnimationFrame(() => {
    console.info('[Perf][SessionRender][ChatPanel]', {
      sessionId: newId,
      oldSessionId: oldId,
      totalToFirstFrameMs: Math.round(performance.now() - start),
      nextTickMs: Math.round(afterTick - beforeTick),
      oldMessageCount,
      newMessageCount,
      restoredSnapshot: !!(newId && chatStore.getSnapshot(newId)),
    })
  })
})

watch(() => panelMessages.value.length, () => {
  nextTick(observeContentColumn)
}, { flush: 'post' })

async function handleSendMessage(
  message: string,
  mode: 'send' | 'steer' | 'followup' = 'send',
  attachments?: MessageAttachment[],
) {
  const session = currentSession.value
  if (!session) return
  // Note: do not scroll here. This runs before the message is in state, so it
  // would smooth-scroll against stale content and then fight MessageList's
  // new-user-message watcher (force-follow + instant setTail), producing a
  // visible "smooth then snap" double scroll. The watcher owns follow-on-send.
  if (mode === 'steer') {
    await chatSteerMessage(message)
  } else if (mode === 'followup') {
    await chatQueueFollowUpMessage(message)
  } else {
    if (sessionsStore.isNewChatDraftId(session.id)) {
      const materialized = await sessionsStore.materializeNewChatDraft(session.id, session.name || 'New Chat')
      if (!materialized) {
        // The input is already cleared; a silent return would discard the
        // message with zero feedback. The draft was restored, so surface a
        // visible error card in it.
        chatStore.addLocalMessage(session.id, {
          role: 'error',
          content: 'Failed to create the session — your message was not sent. Please try again.',
        })
        return
      }
      await chatStore.sendMessage(materialized.id, message, attachments)
      return
    }
    await chatSendMessage(message, attachments)
  }
}

async function handleStopGeneration() {
  await chatStopGeneration()
}

function handleSwitchSession(sessionId: string) {
  emit('switchSession', sessionId)
}

function handleSetQuotedText(text: string) {
  inputBoxRef.value?.setQuotedText(text)
}

async function handleRegenerate(messageId: string) {
  if (!currentSession.value) return
  await chatRegenerate(messageId)
}

async function handleEditAndResend(messageId: string, newContent: string) {
  if (!currentSession.value) return
  await chatEditAndResend(messageId, newContent)
}

function handleSetInputText(text: string) {
  inputBoxRef.value?.setMessageInput(text)
}

function focusInput() {
  inputBoxRef.value?.focus()
}

function insertPromptReference(promptId: string) {
  inputBoxRef.value?.insertPromptReference(promptId)
}

function saveSnapshotForCurrentSession() {
  const sessionId = effectiveSessionId.value
  if (!sessionId) return false
  saveCurrentSnapshot(sessionId, false)
  return true
}

async function restoreSnapshotForCurrentSession() {
  const sessionId = effectiveSessionId.value
  if (!sessionId) return false
  return restoreCurrentSnapshot(sessionId)
}

async function scrollToMessage(messageId: string) {
  await nextTick()
  return messageListRef.value?.scrollToMessage?.(messageId) ?? false
}

defineExpose({
  focusInput,
  insertPromptReference,
  saveSnapshotForCurrentSession,
  restoreSnapshotForCurrentSession,
  scrollToMessage,
})
</script>

<style scoped>
.chat-panel {
  --chat-content-width: min(var(--content-measure, 46rem), max(58%, calc(100% - 144px)));
  --chat-composer-width: var(--chat-content-width);
  --chat-composer-height: 0px;

  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.composer-container {
  flex-shrink: 0;
  padding: 0 0 16px;
  display: flex;
  flex-direction: column;
  /* flex-start, not center: the column children position themselves via the
     measured margin vars (auto margins still center the fallback). Centering
     would re-split leftover space in a single frame when the panel width
     snaps, defeating the animated margins below. */
  align-items: flex-start;
  background: transparent;
  position: relative;
  /* Above the message list's scroll-to-bottom button (z-index 4): composer
     flyouts (model picker, file picker) must never be overlapped by it. */
  z-index: 5;
}

.composer-container > :deep(.background-jobs-bar) {
  align-self: center;
}

/* The goal bar rides the same measured column as the composer; without this
   it sits at the container's flex-start edge, visibly off the reading column.
   Top margin clears the frame legend that punches out above the border. */
.composer-container > :deep(.goal-bar) {
  box-sizing: border-box;
  width: var(--chat-composer-width);
  /* Bottom margin grows by the music bar's height (var set on the container)
     so the goal bar lifts above the flyout that floats up from the composer. */
  margin: 8px var(--chat-content-column-right, auto) calc(8px + var(--goal-music-offset, 0px)) var(--chat-content-column-left, auto);
  transition: margin-bottom 0.18s ease;
}

/* The docked sidebar snaps discretely (see App.vue), so the composer glides
   to its new column on its own; only while the layout toggle is animating,
   so live splitter drags keep tracking the cursor 1:1. The container transform
   carries the FLIP compensation for the panel-origin snap. */
.composer-container.is-layout-animating {
  transition: transform var(--app-sidebar-transition-duration, 0.3s) var(--app-sidebar-transition-ease, cubic-bezier(0.4, 0, 0.2, 1));
}

.composer-container.is-layout-animating :deep(.composer-wrapper),
.composer-container.is-layout-animating :deep(.goal-bar),
.composer-container.is-layout-animating .session-permission-panel {
  transition:
    width var(--app-sidebar-transition-duration, 0.3s) var(--app-sidebar-transition-ease, cubic-bezier(0.4, 0, 0.2, 1)),
    margin var(--app-sidebar-transition-duration, 0.3s) var(--app-sidebar-transition-ease, cubic-bezier(0.4, 0, 0.2, 1));
}

/* Permission ledger — the composer's blueprint frame, one row per field:
   zero fill, one outline, hairline cell dividers, mono annotations. The
   only colour is carried by the two decisions themselves. */
.session-permission-panel {
  --permission-frame: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 52%, transparent);
  --permission-divider: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 30%, transparent);
  --permission-allow-fg: var(--ui-status-success-fg, var(--text-success));
  --permission-reject-fg: var(--ui-status-warning-fg, var(--text-warning));

  width: var(--chat-composer-width);
  margin: 0 var(--chat-content-column-right, auto) 8px var(--chat-content-column-left, auto);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--permission-frame);
  border-radius: var(--radius-xs, 4px);
  background: transparent;
  overflow: hidden;
}

.permission-row {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  align-items: stretch;
  min-height: 30px;
  border-bottom: 1px solid var(--permission-divider);
}

.permission-key {
  display: flex;
  align-items: center;
  padding: 0 11px;
  border-right: 1px solid var(--permission-divider);
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
}

.permission-value {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 0 11px;
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  color: var(--ui-text-primary-fg, var(--text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.permission-value.is-dim {
  color: var(--ui-text-muted-fg, var(--muted));
}

.permission-row.is-scope .permission-value {
  padding: 0;
}

.permission-scope-btn {
  min-height: 30px;
  padding: 0 12px;
  border: 0;
  border-right: 1px solid var(--permission-divider);
  background: transparent;
  cursor: pointer;
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ui-text-muted-fg, var(--muted));
  transition: color 0.16s ease, background 0.16s ease;
}

.permission-scope-btn:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.permission-scope-btn[aria-pressed='true'] {
  color: var(--permission-allow-fg);
  background: color-mix(in srgb, var(--permission-allow-fg) 10%, transparent);
}

.permission-row.is-instruction {
  align-items: start;
}

.permission-row.is-instruction .permission-key {
  align-items: flex-start;
  padding-top: 9px;
}

.permission-instruction-input {
  min-width: 0;
  min-height: 48px;
  resize: vertical;
  padding: 8px 11px;
  border: 0;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  line-height: 1.5;
}

.permission-instruction-input:focus {
  outline: none;
  background: var(--ui-state-hover-bg, var(--hover));
}

.permission-foot {
  display: flex;
  align-items: stretch;
  min-height: 32px;
}

.permission-hint {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  padding: 0 11px;
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.permission-btn {
  flex-shrink: 0;
  min-height: 32px;
  padding: 0 14px;
  border: 0;
  border-left: 1px solid var(--permission-divider);
  border-radius: 0;
  background: transparent;
  cursor: pointer;
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--ui-text-muted-fg, var(--muted));
  transition: background 0.16s ease;
}

.permission-btn.allow {
  color: var(--permission-allow-fg);
}

.permission-btn.reject,
.permission-btn.instruct {
  color: var(--permission-reject-fg);
}

.permission-btn.allow:hover {
  background: color-mix(in srgb, var(--permission-allow-fg) 12%, transparent);
}

.permission-btn.reject:hover,
.permission-btn.instruct:hover {
  background: color-mix(in srgb, var(--permission-reject-fg) 12%, transparent);
}

@media (max-width: 768px) {
  .chat-panel {
    --chat-content-width: calc(100% - 48px);
  }
}

@media (max-width: 480px) {
  .chat-panel {
    --chat-content-width: calc(100% - 24px);
  }
}
</style>
