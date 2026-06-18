import type { Extension } from '@codemirror/state'
import { Compartment, EditorState } from '@codemirror/state'
import {
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import { autocompletion } from '@codemirror/autocomplete'
import { searchKeymap } from '@codemirror/search'
import {
  drawSelection,
  EditorView,
  keymap,
  placeholder as placeholderExtension,
  type ViewUpdate,
} from '@codemirror/view'
import { tags } from '@lezer/highlight'
import {
  DEFAULT_EDITOR_SETTINGS,
  normalizeEditorSettings,
} from '@shared/defaults/settings'
import { languageExtension } from './languages'
import { markdownLivePreviewExtension } from './markdown-live-preview'
import type { MarkdownLivePreviewOptions } from './markdown-live-preview'
import type { EditorLanguage, EditorProfile, EditorSettings } from './types'

export interface EditorCompartments {
  tabSize: Compartment
  readOnly: Compartment
  theme: Compartment
  selection: Compartment
  wrapping: Compartment
  placeholder: Compartment
  language: Compartment
  completion: Compartment
  markdownLivePreview: Compartment
  promptCards: Compartment
}

export interface BuildEditorExtensionsOptions {
  profile: EditorProfile
  language?: EditorLanguage
  path?: string
  placeholder?: string
  readOnly: boolean
  spellcheck: boolean
  markdownLivePreview: boolean
  markdownLivePreviewOptions?: MarkdownLivePreviewOptions
  promptCards?: Extension[]
  settings: Required<EditorSettings>
  compartments: EditorCompartments
  onTransaction: (update: ViewUpdate) => void
  onHeightChange: () => void
  onFocus: () => void
  onBlur: () => void
  onKeydown: (event: KeyboardEvent) => void
  onPaste: (event: ClipboardEvent) => void
  onCompositionStart: () => void
  onCompositionEnd: () => void
}

export { DEFAULT_EDITOR_SETTINGS, markdownLivePreviewExtension, normalizeEditorSettings }

export function createEditorCompartments(): EditorCompartments {
  return {
    tabSize: new Compartment(),
    readOnly: new Compartment(),
    theme: new Compartment(),
    selection: new Compartment(),
    wrapping: new Compartment(),
    placeholder: new Compartment(),
    language: new Compartment(),
    completion: new Compartment(),
    markdownLivePreview: new Compartment(),
    promptCards: new Compartment(),
  }
}

export function buildEditorExtensions(options: BuildEditorExtensionsOptions): Extension[] {
  const extensions: Extension[] = [
    options.compartments.tabSize.of(tabSizeExtensions(options.settings.tabSize)),
    history(),
    options.compartments.readOnly.of(readOnlyExtensions(options.readOnly)),
    EditorView.updateListener.of((update) => {
      options.onTransaction(update)
      if (update.docChanged || update.geometryChanged || update.viewportChanged) {
        options.onHeightChange()
      }
    }),
    EditorView.domEventHandlers({
      focus: () => {
        options.onFocus()
      },
      blur: () => {
        options.onBlur()
      },
      keydown: (event) => {
        options.onKeydown(event)
        return event.defaultPrevented
      },
      paste: (event) => {
        options.onPaste(event)
        return event.defaultPrevented
      },
      compositionstart: () => {
        options.onCompositionStart()
      },
      compositionend: () => {
        options.onCompositionEnd()
      },
    }),
    keymap.of([
      indentWithTab,
      ...searchKeymap,
      ...historyKeymap,
      ...defaultKeymap,
    ]),
    options.compartments.selection.of(selectionExtensions(options.markdownLivePreview)),
    options.compartments.theme.of(themeExtension(options.profile, options.spellcheck)),
    options.compartments.wrapping.of(wrappingExtension(options.settings.lineWrapping)),
    options.compartments.placeholder.of(placeholderExtensions(options.placeholder)),
    options.compartments.language.of(languageExtensions(
      options.settings,
      options.language,
      options.path,
    )),
    options.compartments.completion.of(completionExtensions(options.settings.completionEnabled)),
    options.compartments.markdownLivePreview.of(markdownLivePreviewExtension(
      options.markdownLivePreview,
      options.markdownLivePreviewOptions,
    )),
    options.compartments.promptCards.of(options.promptCards || []),
  ]

  return extensions
}

export function tabSizeExtensions(tabSize: number): Extension[] {
  return [
    EditorState.tabSize.of(tabSize),
    indentUnit.of(' '.repeat(tabSize)),
  ]
}

export function selectionExtensions(markdownLivePreview: boolean): Extension[] {
  // Rich Markdown preview behaves more like a document than a code buffer.
  // CodeMirror's drawn selection intentionally fills rectangular line spans,
  // which looks like selecting padding/widgets around live-preview blocks.
  return markdownLivePreview ? [] : [drawSelection()]
}

export function readOnlyExtensions(readOnly: boolean): Extension[] {
  return [
    EditorView.editable.of(!readOnly),
    EditorState.readOnly.of(readOnly),
  ]
}

export function wrappingExtension(enabled: boolean): Extension {
  return enabled ? EditorView.lineWrapping : []
}

export function placeholderExtensions(text?: string): Extension {
  return text ? placeholderExtension(text) : []
}

const plainHighlightFallback = 'var(--hg-syntax-plain-fg, var(--ui-text-primary-fg, currentColor))'

function cmHighlight(token: string, fallback = plainHighlightFallback) {
  return {
    color: `var(--hg-${token}-fg, ${fallback})`,
    backgroundColor: `var(--hg-${token}-bg, transparent)`,
    fontStyle: `var(--hg-${token}-font-style, normal)`,
    fontWeight: `var(--hg-${token}-font-weight, 400)`,
    textDecoration: `var(--hg-${token}-text-decoration, none)`,
  }
}

const appHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.modifier, tags.operatorKeyword],
    ...cmHighlight('syntax-keyword'),
  },
  {
    tag: [tags.atom, tags.bool, tags.null],
    ...cmHighlight('syntax-atom'),
  },
  {
    tag: [tags.number, tags.integer, tags.float],
    ...cmHighlight('syntax-number'),
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp],
    ...cmHighlight('syntax-string'),
  },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    ...cmHighlight('syntax-comment'),
  },
  {
    tag: [tags.definition(tags.variableName)],
    ...cmHighlight('syntax-definition'),
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    ...cmHighlight('syntax-function'),
  },
  {
    tag: tags.variableName,
    ...cmHighlight('syntax-variable'),
  },
  {
    tag: tags.propertyName,
    ...cmHighlight('syntax-property'),
  },
  {
    tag: [tags.typeName, tags.className, tags.namespace],
    ...cmHighlight('syntax-type'),
  },
  {
    tag: [tags.tagName, tags.attributeName],
    ...cmHighlight('syntax-tag'),
  },
  {
    tag: [tags.punctuation, tags.bracket, tags.separator],
    ...cmHighlight('syntax-punctuation'),
  },
  {
    tag: [tags.invalid, tags.deleted],
    ...cmHighlight('syntax-invalid', 'var(--ui-status-danger-fg, var(--text-error))'),
  },
  {
    tag: tags.inserted,
    ...cmHighlight('syntax-inserted', 'var(--ui-status-success-fg, var(--text-success))'),
  },
  {
    tag: tags.heading,
    ...cmHighlight('syntax-heading'),
  },
  {
    tag: tags.link,
    ...cmHighlight('syntax-link', 'var(--ui-text-link-fg, var(--text-link))'),
  },
  {
    tag: tags.emphasis,
    ...cmHighlight('syntax-emphasis'),
  },
  {
    tag: tags.strong,
    ...cmHighlight('syntax-strong'),
  },
])

export function languageExtensions(
  settings: Required<EditorSettings>,
  language?: EditorLanguage,
  path?: string,
): Extension[] {
  if (!settings.syntaxHighlighting) return []
  return [
    ...languageExtension(language, path),
    syntaxHighlighting(appHighlightStyle, { fallback: true }),
  ]
}

export function completionExtensions(enabled: boolean): Extension {
  return enabled ? autocompletion() : []
}

export function themeExtension(profile: EditorProfile, spellcheck: boolean): Extension {
  const isComposer = profile === 'composer'
  const isInlineMessage = profile === 'inline-message'
  const isMarkdownDocument = profile === 'markdown-document'
  const fontFamily = profile === 'code-file'
    ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    : 'var(--font-sans)'

  return EditorView.theme({
    '&': {
      height: 'auto',
      minHeight: 'var(--editor-min-height)',
      color: 'var(--editor-text, var(--ui-editor-text-fg, var(--text-input, var(--text))))',
      backgroundColor: 'transparent',
      fontFamily,
      fontSize: isInlineMessage ? 'var(--message-font-size, 15px)' : 'var(--editor-font-size, 15px)',
      lineHeight: isComposer ? '1.6' : '1.55',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-scroller': {
      maxHeight: isMarkdownDocument ? 'none' : 'var(--editor-max-height)',
      overflowX: 'auto',
      overflowY: 'auto',
      scrollbarWidth: 'thin',
      scrollbarColor: 'color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted, var(--muted))) 42%, transparent) transparent',
      scrollbarGutter: 'stable',
      fontFamily: 'inherit',
      lineHeight: 'inherit',
    },
    '.cm-content': {
      minHeight: 'var(--editor-min-height)',
      padding: isComposer ? '12px 18px 0 0' : '0',
      cursor: 'text',
      caretColor: 'var(--ui-editor-caret-fg, var(--editor-caret, var(--text-input, var(--text))))',
      whiteSpace: 'pre',
      wordBreak: 'normal',
    },
    '.cm-content.cm-lineWrapping': {
      width: isComposer ? '100%' : 'min(100%, var(--editor-soft-wrap-width, 88ch))',
      maxWidth: '100%',
      minWidth: isComposer ? '100%' : '0',
      boxSizing: 'border-box',
      flexGrow: isComposer ? '1' : '0',
      flexShrink: isComposer ? '0' : '1',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      overflowWrap: 'anywhere',
    },
    '.cm-content.cm-lineWrapping .cm-line': {
      maxWidth: '100%',
      whiteSpace: 'inherit',
      overflowWrap: 'inherit',
    },
    '.cm-line': {
      padding: '0',
      cursor: 'text',
      boxSizing: 'border-box',
    },
    '.cm-placeholder': {
      color: 'var(--ui-editor-placeholder-fg, var(--text-input-placeholder, var(--text-muted)))',
      userSelect: 'none',
      pointerEvents: 'none',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeft: '1.2px solid var(--ui-editor-caret-fg, var(--editor-caret, var(--text-input, var(--text))))',
      marginLeft: '-0.6px',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'var(--ui-editor-selection-bg, color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 22%, transparent)) !important',
    },
    '.cm-gutters': {
      display: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: 'transparent',
    },
    '.cm-content[contenteditable="true"]': {
      WebkitUserModify: spellcheck ? 'read-write' : 'read-write-plaintext-only',
    },
    '.prompt-ref-widget': {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      boxSizing: 'border-box',
      minHeight: '24px',
      maxWidth: '220px',
      margin: '0 2px',
      padding: '2px 7px',
      border: '1px solid color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 28%, var(--ui-border-default-border, var(--border)))',
      borderRadius: '7px',
      background: 'color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 9%, transparent)',
      color: 'var(--ui-text-primary-fg, var(--text))',
      verticalAlign: 'baseline',
      cursor: 'default',
      lineHeight: '18px',
    },
    '.prompt-ref-widget.is-skill': {
      borderColor: 'var(--ui-status-success-border, var(--ui-border-default-border, var(--border)))',
      background: 'var(--ui-status-success-bg, transparent)',
    },
    '.prompt-ref-widget.is-command': {
      borderColor: 'color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted, var(--muted))) 24%, var(--ui-border-default-border, var(--border)))',
      background: 'color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted, var(--muted))) 7%, transparent)',
    },
    '.prompt-ref-widget-icon': {
      width: '14px',
      height: '14px',
      borderRadius: '4px',
      display: 'inline-grid',
      placeItems: 'center',
      background: 'color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 18%, transparent)',
      color: 'var(--ui-accent-primary-fg, var(--accent))',
      fontSize: '9px',
      fontWeight: '700',
    },
    '.prompt-ref-widget.is-skill .prompt-ref-widget-icon': {
      background: 'var(--ui-status-success-bg, transparent)',
      color: 'var(--ui-status-success-fg, var(--success, #2f8f5b))',
    },
    '.prompt-ref-widget.is-command .prompt-ref-widget-icon': {
      background: 'color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted, var(--muted))) 16%, transparent)',
      color: 'var(--ui-text-muted-fg, var(--text-muted, var(--muted)))',
      fontSize: '11px',
    },
    '.prompt-ref-widget-title': {
      minWidth: '0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      fontSize: '0.92em',
      fontWeight: '650',
    },
    '.prompt-ref-widget-close': {
      width: '0',
      height: '16px',
      flexShrink: '0',
      display: 'inline-grid',
      placeItems: 'center',
      marginLeft: '0',
      padding: '0',
      border: '0',
      borderRadius: '5px',
      background: 'transparent',
      color: 'var(--ui-text-muted-fg, var(--muted))',
      cursor: 'pointer',
      font: 'inherit',
      fontSize: '13px',
      lineHeight: '1',
      overflow: 'hidden',
      opacity: '0',
      transform: 'scale(0.92)',
      pointerEvents: 'none',
      transition: 'width 120ms ease, margin 120ms ease, opacity 120ms ease, transform 120ms ease, background 120ms ease, color 120ms ease',
    },
    '.prompt-ref-widget:hover .prompt-ref-widget-close, .prompt-ref-widget:focus-within .prompt-ref-widget-close': {
      width: '16px',
      marginLeft: '1px',
      opacity: '1',
      transform: 'scale(1)',
      pointerEvents: 'auto',
    },
    '.prompt-ref-widget-close:hover': {
      background: 'var(--ui-status-danger-bg, transparent)',
      color: 'var(--ui-status-danger-fg, var(--danger, #d14))',
    },
    '.prompt-ref-widget-popover': {
      position: 'absolute',
      left: '0',
      bottom: 'calc(100% + 8px)',
      width: 'min(420px, 70vw)',
      maxHeight: '260px',
      display: 'none',
      flexDirection: 'column',
      gap: '7px',
      padding: '10px 11px',
      border: '1px solid var(--ui-border-default-border, var(--border))',
      borderRadius: '8px',
      background: 'var(--ui-surface-panel-bg, var(--panel, var(--bg)))',
      color: 'var(--ui-text-primary-fg, var(--text))',
      boxShadow: '0 16px 42px rgba(0, 0, 0, 0.2)',
      zIndex: '50',
      whiteSpace: 'normal',
    },
    '.prompt-ref-widget:hover .prompt-ref-widget-popover, .prompt-ref-widget:focus .prompt-ref-widget-popover': {
      display: 'flex',
    },
    '.prompt-ref-widget-description': {
      color: 'var(--ui-text-muted-fg, var(--muted))',
      fontSize: '12px',
    },
    '.prompt-ref-widget-content': {
      overflow: 'auto',
      whiteSpace: 'pre-wrap',
      fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
      fontSize: '12px',
      lineHeight: '1.45',
    },
    '.cm-scroller::-webkit-scrollbar': {
      width: '10px',
      height: '10px',
    },
    '.cm-scroller::-webkit-scrollbar-track': {
      background: 'transparent',
    },
    '.cm-scroller::-webkit-scrollbar-thumb': {
      background: 'color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted, var(--muted))) 42%, transparent)',
      borderRadius: '999px',
      border: '2px solid transparent',
      backgroundClip: 'padding-box',
    },
    '.cm-scroller::-webkit-scrollbar-thumb:hover': {
      background: 'color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted, var(--muted))) 62%, transparent)',
      backgroundClip: 'padding-box',
    },
    '.cm-scroller::-webkit-scrollbar-corner': {
      background: 'transparent',
    },
  })
}
