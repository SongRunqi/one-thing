import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import type { SkillDefinition, UserPrompt } from '@shared/ipc'
import {
  FILE_REF_PATTERN,
  MEMBER_REF_PATTERN,
  PAGE_REF_PATTERN,
  PROMPT_REF_PATTERN,
  SKILL_REF_PATTERN,
} from '@shared/prompt-references'
import { createDomButton, unmountDomButtons } from '@/components/common/dom-button'
import {
  computeFloatingStyle,
  elementAnchorRect,
} from '@/composables/floating/compute-position'
import type { CommandDefinition } from '@/types/commands'

export interface PromptCardData {
  id: string
  title: string
  body: string
  description?: string
}

type ReferenceCardKind = 'prompt' | 'skill' | 'command' | 'file' | 'page'

interface ReferenceCardData {
  kind: ReferenceCardKind
  id: string
  title: string
  body: string
  description?: string
  kindLabel: string
}

interface ReferenceRange {
  from: number
  to: number
  card?: ReferenceCardData
  /** A ready-made widget, for tokens that are not reference cards (member). */
  widget?: WidgetType
  /**
   * Hidden ranges are removed from the editor's visual flow entirely (no
   * widget). The leading slash command uses this: the token stays in the doc
   * as the source of truth, but the composer lifts it into a chip docked
   * above the input instead of rendering it inline.
   */
  hidden?: boolean
}

/** A collab room member, as the `{{member:<agentId>}}` token needs it (W14a). */
export interface MemberRefData {
  id: string
  name: string
}

export interface PromptCardExtensionOptions {
  prompts?: UserPrompt[]
  skills?: SkillDefinition[]
  commands?: CommandDefinition[]
  /** Room roster for member tokens; empty outside collab rooms. */
  members?: MemberRefData[]
}

const LEGACY_SKILL_REF_PATTERN = /(^|\s)\/skill:([^\n]+?)(?=\s{2,}|$)/g
const LEADING_SLASH_REF_PATTERN = /^\/([a-zA-Z0-9_-]+)(?=\s|$)/

/**
 * A picked room member (W14a). The doc holds `{{member:<agentId>}}` — identity,
 * not a name — and this paints it as the plain `@名字` a mention IS. No card,
 * no chip, no close button: a mention is a word in a sentence, and the whole
 * point of the token is that the sentence keeps reading like one while the id
 * rides underneath. Deleting it removes the token atomically (atomicRanges),
 * so a half-eaten `{{member:` can never reach the room.
 *
 * The name is resolved from the CURRENT roster on every rebuild, so renaming a
 * member repaints drafts that already mention it.
 */
class MemberRefWidget extends WidgetType {
  constructor(private readonly label: string) {
    super()
  }

  eq(other: MemberRefWidget): boolean {
    return this.label === other.label
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'member-ref-widget'
    span.contentEditable = 'false'
    span.textContent = `@${this.label}`
    return span
  }

  ignoreEvent(): boolean {
    return false
  }
}

class PromptRefWidget extends WidgetType {
  private popover: HTMLElement | null = null
  private hideTimer: number | null = null
  private cleanupFns: Array<() => void> = []

  constructor(
    private readonly card: ReferenceCardData,
    private readonly from: number,
    private readonly to: number,
  ) {
    super()
  }

  eq(other: PromptRefWidget): boolean {
    return this.card.kind === other.card.kind &&
      this.card.id === other.card.id &&
      this.from === other.from &&
      this.to === other.to &&
      this.card.title === other.card.title &&
      this.card.body === other.card.body &&
      this.card.description === other.card.description
  }

  toDOM(view: EditorView): HTMLElement {
    const label = this.card.title
    const span = document.createElement('span')
    span.className = `prompt-ref-widget is-${this.card.kind}`
    span.contentEditable = 'false'

    const kindLabel = document.createElement('span')
    kindLabel.className = 'prompt-ref-widget-kind'
    kindLabel.textContent = this.card.kindLabel

    const title = document.createElement('span')
    title.className = 'prompt-ref-widget-title'
    title.textContent = label

    const closeMount = createDomButton({
      className: 'prompt-ref-widget-close',
      ariaLabel: `Remove ${this.card.kind} ${label}`,
      children: '×',
      onMouseDown: (event) => {
        event.preventDefault()
        event.stopPropagation()
      },
      onClick: (event) => {
        event.preventDefault()
        event.stopPropagation()
        const docLength = view.state.doc.length
        if (this.from < 0 || this.to > docLength || this.from >= this.to) return
        view.dispatch({
          changes: { from: this.from, to: this.to, insert: '' },
          selection: { anchor: this.from },
          scrollIntoView: true,
        })
        view.focus()
      },
    })

    span.append(kindLabel, title, closeMount.host)
    span.addEventListener('mouseenter', () => this.showPopover(span))
    span.addEventListener('mouseleave', () => this.scheduleHidePopover())
    span.addEventListener('focusin', () => this.showPopover(span))
    span.addEventListener('focusout', () => this.scheduleHidePopover())

    return span
  }

  destroy(dom: HTMLElement): void {
    unmountDomButtons(dom)
    this.removePopover()
  }

  ignoreEvent(): boolean {
    return false
  }

  private clearHideTimer(): void {
    if (this.hideTimer === null) return
    window.clearTimeout(this.hideTimer)
    this.hideTimer = null
  }

  private scheduleHidePopover(): void {
    this.clearHideTimer()
    this.hideTimer = window.setTimeout(() => this.removePopover(), 90)
  }

  private showPopover(anchor: HTMLElement): void {
    this.clearHideTimer()
    if (!this.popover) {
      this.popover = this.createPopover()
      document.body.appendChild(this.popover)

      const reposition = () => this.positionPopover(anchor)
      window.addEventListener('scroll', reposition, true)
      window.addEventListener('resize', reposition)
      this.popover.addEventListener('mouseenter', () => this.clearHideTimer())
      this.popover.addEventListener('mouseleave', () => this.scheduleHidePopover())
      this.cleanupFns = [
        () => window.removeEventListener('scroll', reposition, true),
        () => window.removeEventListener('resize', reposition),
      ]
    }
    this.positionPopover(anchor)
  }

  private removePopover(): void {
    this.clearHideTimer()
    for (const cleanup of this.cleanupFns) cleanup()
    this.cleanupFns = []
    this.popover?.remove()
    this.popover = null
  }

  private createPopover(): HTMLElement {
    const popover = document.createElement('div')
    popover.className = `prompt-ref-widget-floating-popover is-${this.card.kind}`
    popover.style.cssText = [
      'position: fixed',
      'left: 0',
      'top: 0',
      'width: min(420px, calc(100vw - 24px))',
      'max-height: min(260px, calc(100vh - 24px))',
      'display: flex',
      'flex-direction: column',
      'gap: 7px',
      'padding: 10px 11px',
      'border: 1px solid var(--ui-border-default-border)',
      'border-radius: 8px',
      'background: var(--ui-surface-panel-bg)',
      'color: var(--ui-text-primary-fg)',
      'box-shadow: 0 16px 42px rgba(0, 0, 0, 0.22)',
      'z-index: var(--z-max)',
      'white-space: normal',
      'box-sizing: border-box',
      'pointer-events: auto',
    ].join(';')

    const title = document.createElement('strong')
    title.textContent = this.card.title
    popover.appendChild(title)

    if (this.card.description) {
      const description = document.createElement('span')
      description.textContent = this.card.description
      description.style.cssText = 'color: var(--ui-text-muted-fg); font-size: 12px;'
      popover.appendChild(description)
    }

    const content = document.createElement('span')
    content.textContent = this.card.body
    content.style.cssText = [
      'overflow: auto',
      'white-space: pre-wrap',
      'font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
      'font-size: 12px',
      'line-height: 1.45',
    ].join(';')
    popover.appendChild(content)

    return popover
  }

  /**
   * 坐标走浮层内核的命令式出口(G5)。这里是 CodeMirror 的 widget —— 没有 Vue
   * 组件可挂,所以拿不到 `useFloatingLayer()`;在内核开出纯函数出口之前,这段
   * 只能自己拼一遍 `top-start` + flip + clamp 的算术(原样十七行)。
   *
   * 语义与原来的手拼版一致:优先开在上方,上方装不下就翻到下方,最后钳进视口
   * 12px 的边距内 —— 只是这三步现在由 `computePosition` 做,和全窗其它浮层同一份。
   */
  private positionPopover(anchor: HTMLElement): void {
    if (!this.popover) return
    const popoverRect = this.popover.getBoundingClientRect()
    const { style } = computeFloatingStyle(
      elementAnchorRect(anchor),
      {
        width: popoverRect.width || Math.min(420, window.innerWidth - 24),
        height: popoverRect.height || 80,
      },
      { placement: 'top-start', offset: 8, margin: 12 },
    )
    this.popover.style.transform = `translate(${style.left}, ${style.top})`
  }
}

function promptToCard(prompt: PromptCardData | undefined, promptId: string): ReferenceCardData {
  return {
    kind: 'prompt',
    id: promptId,
    title: prompt?.title || 'Missing prompt',
    body: prompt?.body || `Prompt "${promptId}" was not found.`,
    description: prompt?.description,
    kindLabel: 'prompt',
  }
}

function skillToCard(skill: SkillDefinition | undefined, skillName: string): ReferenceCardData {
  return {
    kind: 'skill',
    id: skill?.id || skillName,
    title: skill?.name || skillName,
    body: skill?.description || `Skill "${skillName}" was not found.`,
    description: skill ? `${skill.source} skill` : undefined,
    kindLabel: 'skill',
  }
}

function commandToCard(command: CommandDefinition | undefined, commandId: string): ReferenceCardData {
  return {
    kind: 'command',
    id: commandId,
    title: `/${commandId}`,
    body: command?.usage || `/${commandId}`,
    description: command?.description,
    kindLabel: 'cmd',
  }
}

function fileToCard(filePath: string): ReferenceCardData {
  return {
    kind: 'file',
    id: filePath,
    title: filePath,
    body: filePath,
    kindLabel: 'file',
  }
}

function pageToCard(tabId: string): ReferenceCardData {
  return {
    kind: 'page',
    id: tabId,
    title: tabId,
    body: tabId,
    kindLabel: 'page',
  }
}

function collectKnownSkillRanges(
  doc: string,
  skillsByName: Map<string, SkillDefinition>,
): ReferenceRange[] {
  const ranges: ReferenceRange[] = []
  const skills = Array.from(skillsByName.values()).sort((a, b) => b.name.length - a.name.length)

  for (const skill of skills) {
    const token = `/skill:${skill.name}`
    let searchFrom = 0
    while (searchFrom < doc.length) {
      const index = doc.indexOf(token, searchFrom)
      if (index === -1) break

      const before = index > 0 ? doc[index - 1] : ''
      const after = doc[index + token.length] || ''
      const hasLeadingBoundary = !before || /\s/.test(before)
      const hasTrailingBoundary = !after || /\s/.test(after)
      if (hasLeadingBoundary && hasTrailingBoundary) {
        ranges.push({
          from: index,
          to: index + token.length,
          card: skillToCard(skill, skill.name),
        })
      }

      searchFrom = index + token.length
    }
  }

  return ranges
}

function collectSkillTokenRanges(
  doc: string,
  skillsById: Map<string, SkillDefinition>,
): ReferenceRange[] {
  const ranges: ReferenceRange[] = []
  SKILL_REF_PATTERN.lastIndex = 0
  for (const match of doc.matchAll(SKILL_REF_PATTERN)) {
    const from = match.index ?? 0
    const to = from + match[0].length
    const skillId = match[1]
    const skill = skillsById.get(skillId)
    ranges.push({
      from,
      to,
      card: skillToCard(skill, skill?.name || skillId),
    })
  }
  return ranges
}

interface ReferenceLookups {
  prompts: Map<string, PromptCardData>
  skillsById: Map<string, SkillDefinition>
  skillsByName: Map<string, SkillDefinition>
  commandsById: Map<string, CommandDefinition>
  membersById: Map<string, MemberRefData>
}

function collectReferenceRanges(
  view: EditorView,
  lookups: ReferenceLookups,
): ReferenceRange[] {
  const { prompts, skillsById, skillsByName, commandsById, membersById } = lookups
  const ranges: ReferenceRange[] = []
  const doc = view.state.doc.toString()

  PROMPT_REF_PATTERN.lastIndex = 0
  for (const match of doc.matchAll(PROMPT_REF_PATTERN)) {
    const from = match.index ?? 0
    const to = from + match[0].length
    const promptId = match[1]
    ranges.push({ from, to, card: promptToCard(prompts.get(promptId), promptId) })
  }

  // File tokens are hidden, never widgets: the composer already shows each
  // pick as a chip in the dock, so the doc only needs to remember where it sat.
  FILE_REF_PATTERN.lastIndex = 0
  for (const match of doc.matchAll(FILE_REF_PATTERN)) {
    const from = match.index ?? 0
    ranges.push({ from, to: from + match[0].length, card: fileToCard(match[1]), hidden: true })
  }

  // Page tokens hide like file tokens: the docked chip is the visual.
  PAGE_REF_PATTERN.lastIndex = 0
  for (const match of doc.matchAll(PAGE_REF_PATTERN)) {
    const from = match.index ?? 0
    ranges.push({ from, to: from + match[0].length, card: pageToCard(match[1]), hidden: true })
  }

  // Member tokens paint as plain `@名字` (W14a): a mention has to look like
  // one while it is being typed, so it gets neither a card nor a chip. A token
  // whose member is gone from the roster falls back to its bare id rather than
  // vanishing — a silently empty spot in the sentence is worse than an ugly one.
  MEMBER_REF_PATTERN.lastIndex = 0
  for (const match of doc.matchAll(MEMBER_REF_PATTERN)) {
    const from = match.index ?? 0
    const agentId = match[1]
    ranges.push({
      from,
      to: from + match[0].length,
      widget: new MemberRefWidget(membersById.get(agentId)?.name || agentId),
    })
  }

  ranges.push(...collectSkillTokenRanges(doc, skillsById))

  LEGACY_SKILL_REF_PATTERN.lastIndex = 0
  for (const match of doc.matchAll(LEGACY_SKILL_REF_PATTERN)) {
    const leading = match[1] || ''
    const skillName = match[2]
    const from = (match.index ?? 0) + leading.length
    const to = from + `/skill:${skillName}`.length
    ranges.push({ from, to, card: skillToCard(skillsByName.get(skillName.toLowerCase()), skillName) })
  }

  ranges.push(...collectKnownSkillRanges(doc, skillsByName))

  const slashMatch = doc.match(LEADING_SLASH_REF_PATTERN)
  if (slashMatch) {
    const commandId = slashMatch[1]
    const command = commandsById.get(commandId.toLowerCase())
    const skill = skillsByName.get(commandId.toLowerCase())
    if (command) {
      // Swallow the single separating space too, so the remaining text does
      // not start with an orphaned indent once the token is hidden.
      const tokenEnd = slashMatch[0].length
      ranges.push({
        from: 0,
        to: doc[tokenEnd] === ' ' ? tokenEnd + 1 : tokenEnd,
        card: commandToCard(command, commandId),
        hidden: true,
      })
    } else if (skill) {
      ranges.push({
        from: 0,
        to: slashMatch[0].length,
        card: skillToCard(skill, commandId),
      })
    }
  }

  return ranges.sort((a, b) => a.from - b.from || b.to - a.to)
}

function decorationFor(range: ReferenceRange): Decoration {
  if (range.hidden) return Decoration.replace({ inclusive: false })
  if (range.widget) return Decoration.replace({ widget: range.widget, inclusive: false })
  if (range.card) {
    return Decoration.replace({
      widget: new PromptRefWidget(range.card, range.from, range.to),
      inclusive: false,
    })
  }
  return Decoration.replace({ inclusive: false })
}

function buildDecorations(view: EditorView, lookups: ReferenceLookups): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  let lastTo = 0
  for (const range of collectReferenceRanges(view, lookups)) {
    if (range.from < lastTo) continue
    builder.add(range.from, range.to, decorationFor(range))
    lastTo = range.to
  }

  return builder.finish()
}

export function promptCardExtension(options: UserPrompt[] | PromptCardExtensionOptions = []) {
  const promptsInput = Array.isArray(options) ? options : options.prompts || []
  const skillsInput = Array.isArray(options) ? [] : options.skills || []
  const commandsInput = Array.isArray(options) ? [] : options.commands || []
  const membersInput = Array.isArray(options) ? [] : options.members || []

  const prompts = new Map<string, PromptCardData>(
    promptsInput.map(prompt => [prompt.id, {
      id: prompt.id,
      title: prompt.title,
      body: prompt.body,
      description: prompt.description,
    }]),
  )
  const skillsByName = new Map<string, SkillDefinition>(
    skillsInput.map(skill => [skill.name.toLowerCase(), skill]),
  )
  const skillsById = new Map<string, SkillDefinition>(
    skillsInput.map(skill => [skill.id, skill]),
  )
  const commandsById = new Map<string, CommandDefinition>(
    commandsInput.map(command => [command.id.toLowerCase(), command]),
  )
  const membersById = new Map<string, MemberRefData>(
    membersInput.map(member => [member.id, member]),
  )
  const lookups: ReferenceLookups = { prompts, skillsById, skillsByName, commandsById, membersById }

  const plugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view, lookups)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view, lookups)
      }
    }
  }, {
    decorations: value => value.decorations,
    provide: pluginRef => EditorView.atomicRanges.of(view => view.plugin(pluginRef)?.decorations || Decoration.none),
  })

  return [plugin]
}
