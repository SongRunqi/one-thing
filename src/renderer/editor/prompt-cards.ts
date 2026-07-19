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
import { PROMPT_REF_PATTERN, SKILL_REF_PATTERN } from '@shared/prompt-references'
import { createDomButton, unmountDomButtons } from '@/components/common/dom-button'
import type { CommandDefinition } from '@/types/commands'

export interface PromptCardData {
  id: string
  title: string
  body: string
  description?: string
}

type ReferenceCardKind = 'prompt' | 'skill' | 'command'

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
  card: ReferenceCardData
}

export interface PromptCardExtensionOptions {
  prompts?: UserPrompt[]
  skills?: SkillDefinition[]
  commands?: CommandDefinition[]
}

const LEGACY_SKILL_REF_PATTERN = /(^|\s)\/skill:([^\n]+?)(?=\s{2,}|$)/g
const LEADING_SLASH_REF_PATTERN = /^\/([a-zA-Z0-9_-]+)(?=\s|$)/

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
      'border: 1px solid var(--ui-border-default-border, var(--border))',
      'border-radius: 8px',
      'background: var(--ui-surface-panel-bg, var(--panel, var(--bg)))',
      'color: var(--ui-text-primary-fg, var(--text))',
      'box-shadow: 0 16px 42px rgba(0, 0, 0, 0.22)',
      'z-index: 10000',
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
      description.style.cssText = 'color: var(--ui-text-muted-fg, var(--muted)); font-size: 12px;'
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

  private positionPopover(anchor: HTMLElement): void {
    if (!this.popover) return
    const gap = 8
    const viewportPad = 12
    const anchorRect = anchor.getBoundingClientRect()
    const popoverRect = this.popover.getBoundingClientRect()
    const width = popoverRect.width || Math.min(420, window.innerWidth - viewportPad * 2)
    const height = popoverRect.height || 80

    const left = Math.min(
      Math.max(viewportPad, anchorRect.left),
      Math.max(viewportPad, window.innerWidth - width - viewportPad),
    )
    let top = anchorRect.top - height - gap
    if (top < viewportPad) {
      top = anchorRect.bottom + gap
    }
    top = Math.min(
      Math.max(viewportPad, top),
      Math.max(viewportPad, window.innerHeight - height - viewportPad),
    )

    this.popover.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
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

function collectReferenceRanges(
  view: EditorView,
  prompts: Map<string, PromptCardData>,
  skillsById: Map<string, SkillDefinition>,
  skillsByName: Map<string, SkillDefinition>,
  commandsById: Map<string, CommandDefinition>,
): ReferenceRange[] {
  const ranges: ReferenceRange[] = []
  const doc = view.state.doc.toString()

  PROMPT_REF_PATTERN.lastIndex = 0
  for (const match of doc.matchAll(PROMPT_REF_PATTERN)) {
    const from = match.index ?? 0
    const to = from + match[0].length
    const promptId = match[1]
    ranges.push({ from, to, card: promptToCard(prompts.get(promptId), promptId) })
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
    if (command || skill) {
      ranges.push({
        from: 0,
        to: slashMatch[0].length,
        card: command ? commandToCard(command, commandId) : skillToCard(skill, commandId),
      })
    }
  }

  return ranges.sort((a, b) => a.from - b.from || b.to - a.to)
}

function buildDecorations(
  view: EditorView,
  prompts: Map<string, PromptCardData>,
  skillsById: Map<string, SkillDefinition>,
  skillsByName: Map<string, SkillDefinition>,
  commandsById: Map<string, CommandDefinition>,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  let lastTo = 0
  for (const range of collectReferenceRanges(view, prompts, skillsById, skillsByName, commandsById)) {
    if (range.from < lastTo) continue
    builder.add(range.from, range.to, Decoration.replace({
      widget: new PromptRefWidget(range.card, range.from, range.to),
      inclusive: false,
    }))
    lastTo = range.to
  }

  return builder.finish()
}

export function promptCardExtension(options: UserPrompt[] | PromptCardExtensionOptions = []) {
  const promptsInput = Array.isArray(options) ? options : options.prompts || []
  const skillsInput = Array.isArray(options) ? [] : options.skills || []
  const commandsInput = Array.isArray(options) ? [] : options.commands || []

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

  const plugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view, prompts, skillsById, skillsByName, commandsById)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view, prompts, skillsById, skillsByName, commandsById)
      }
    }
  }, {
    decorations: value => value.decorations,
    provide: pluginRef => EditorView.atomicRanges.of(view => view.plugin(pluginRef)?.decorations || Decoration.none),
  })

  return [plugin]
}
