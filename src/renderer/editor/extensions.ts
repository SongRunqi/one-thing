import type { Extension } from '@codemirror/state'
import { Compartment, EditorState } from '@codemirror/state'
import {
  defaultHighlightStyle,
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
  EditorView,
  keymap,
  placeholder as placeholderExtension,
  type ViewUpdate,
} from '@codemirror/view'
import {
  DEFAULT_EDITOR_SETTINGS,
  normalizeEditorSettings,
} from '@shared/defaults/settings'
import { languageExtension } from './languages'
import type { EditorLanguage, EditorProfile, EditorSettings } from './types'

export interface EditorCompartments {
  tabSize: Compartment
  readOnly: Compartment
  theme: Compartment
  wrapping: Compartment
  placeholder: Compartment
  language: Compartment
  completion: Compartment
}

export interface BuildEditorExtensionsOptions {
  profile: EditorProfile
  language?: EditorLanguage
  path?: string
  placeholder?: string
  readOnly: boolean
  spellcheck: boolean
  settings: Required<EditorSettings>
  compartments: EditorCompartments
  onTransaction: (update: ViewUpdate) => void
  onHeightChange: () => void
  onFocus: () => void
  onBlur: () => void
  onKeydown: (event: KeyboardEvent) => void
  onCompositionStart: () => void
  onCompositionEnd: () => void
}

export { DEFAULT_EDITOR_SETTINGS, normalizeEditorSettings }

export function createEditorCompartments(): EditorCompartments {
  return {
    tabSize: new Compartment(),
    readOnly: new Compartment(),
    theme: new Compartment(),
    wrapping: new Compartment(),
    placeholder: new Compartment(),
    language: new Compartment(),
    completion: new Compartment(),
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
    options.compartments.theme.of(themeExtension(options.profile, options.spellcheck)),
    options.compartments.wrapping.of(wrappingExtension(options.settings.lineWrapping)),
    options.compartments.placeholder.of(placeholderExtensions(options.placeholder)),
    options.compartments.language.of(languageExtensions(
      options.settings,
      options.language,
      options.path,
    )),
    options.compartments.completion.of(completionExtensions(options.settings.completionEnabled)),
  ]

  return extensions
}

export function tabSizeExtensions(tabSize: number): Extension[] {
  return [
    EditorState.tabSize.of(tabSize),
    indentUnit.of(' '.repeat(tabSize)),
  ]
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

export function languageExtensions(
  settings: Required<EditorSettings>,
  language?: EditorLanguage,
  path?: string,
): Extension[] {
  if (!settings.syntaxHighlighting) return []
  return [
    ...languageExtension(language, path),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  ]
}

export function completionExtensions(enabled: boolean): Extension {
  return enabled ? autocompletion() : []
}

export function themeExtension(profile: EditorProfile, spellcheck: boolean): Extension {
  const isComposer = profile === 'composer'
  const isInlineMessage = profile === 'inline-message'
  const fontFamily = profile === 'code-file' || profile === 'markdown-document'
    ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    : 'var(--font-sans)'

  return EditorView.theme({
    '&': {
      height: 'auto',
      minHeight: 'var(--editor-min-height)',
      color: 'var(--editor-text, var(--text-input, var(--text)))',
      backgroundColor: 'transparent',
      fontFamily,
      fontSize: isInlineMessage ? 'var(--message-font-size, 15px)' : 'var(--editor-font-size, 15px)',
      lineHeight: isComposer ? '1.6' : '1.55',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-scroller': {
      maxHeight: 'var(--editor-max-height)',
      overflow: 'auto',
      fontFamily: 'inherit',
      lineHeight: 'inherit',
    },
    '.cm-content': {
      minHeight: 'var(--editor-min-height)',
      padding: isComposer ? '12px 0 0 0' : '0',
      caretColor: 'var(--accent)',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    },
    '.cm-line': {
      padding: '0',
    },
    '.cm-placeholder': {
      color: 'var(--text-input-placeholder, var(--text-muted))',
      userSelect: 'none',
      pointerEvents: 'none',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--accent)',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'rgba(var(--accent-rgb, 59, 130, 246), 0.22) !important',
    },
    '.cm-gutters': {
      display: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: 'transparent',
    },
    '&[contenteditable="true"]': {
      WebkitUserModify: spellcheck ? 'read-write' : 'read-write-plaintext-only',
    },
    '.cm-scroller::-webkit-scrollbar': {
      width: '4px',
    },
    '.cm-scroller::-webkit-scrollbar-track': {
      background: 'transparent',
    },
    '.cm-scroller::-webkit-scrollbar-thumb': {
      background: 'var(--scrollbar-thumb)',
      borderRadius: '2px',
    },
  })
}
