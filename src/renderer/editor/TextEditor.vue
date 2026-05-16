<template>
  <div
    ref="hostRef"
    class="text-editor"
    :class="`profile-${profile}`"
    :style="editorStyle"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorState } from '@codemirror/state'
import { EditorView, type ViewUpdate } from '@codemirror/view'
import {
  buildEditorExtensions,
  completionExtensions,
  createEditorCompartments,
  languageExtensions,
  markdownLivePreviewExtension,
  normalizeEditorSettings,
  placeholderExtensions,
  readOnlyExtensions,
  tabSizeExtensions,
  themeExtension,
  wrappingExtension,
} from './extensions'
import type {
  EditorCursorLineInfo,
  EditorHandle,
  EditorLanguage,
  EditorProfile,
  EditorSelection,
  EditorSettings,
  EditorTransaction,
  EditorSetValueOptions,
} from './types'

interface Props {
  modelValue: string
  profile?: EditorProfile
  language?: EditorLanguage
  path?: string
  placeholder?: string
  readOnly?: boolean
  minHeight?: number
  maxHeight?: number
  spellcheck?: boolean
  markdownLivePreview?: boolean
  settings?: EditorSettings
  selectOnFocus?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  profile: 'composer',
  language: 'plain',
  path: '',
  placeholder: '',
  readOnly: false,
  minHeight: 24,
  maxHeight: 200,
  spellcheck: true,
  markdownLivePreview: false,
  settings: undefined,
  selectOnFocus: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  focus: []
  blur: []
  submit: []
  cancel: []
  heightChange: [height: number]
  selectionChange: [selection: EditorSelection]
  transaction: [payload: EditorTransaction]
  keydown: [event: KeyboardEvent]
  paste: [event: ClipboardEvent]
  compositionstart: []
  compositionend: []
}>()

const hostRef = ref<HTMLElement | null>(null)
let view: EditorView | null = null
let resizeObserver: ResizeObserver | null = null
let internalUpdate = false
let heightFrame: number | null = null
const compartments = createEditorCompartments()

const effectiveSettings = computed(() => normalizeEditorSettings(props.settings))

const editorStyle = computed(() => ({
  '--editor-min-height': `${props.minHeight}px`,
  '--editor-max-height': `${props.maxHeight}px`,
}))

function createView() {
  if (!hostRef.value) return
  const state = EditorState.create({
    doc: props.modelValue,
    extensions: createExtensions(),
  })
  view = new EditorView({
    state,
    parent: hostRef.value,
  })
  view.contentDOM.setAttribute('spellcheck', props.spellcheck ? 'true' : 'false')
  scheduleHeightChange()
}

function createExtensions() {
  return buildEditorExtensions({
    profile: props.profile,
    language: props.language,
    path: props.path,
    placeholder: props.placeholder,
    readOnly: props.readOnly,
    spellcheck: props.spellcheck,
    markdownLivePreview: props.markdownLivePreview,
    settings: effectiveSettings.value,
    compartments,
    onTransaction: handleViewUpdate,
    onHeightChange: scheduleHeightChange,
    onFocus: () => {
      emit('focus')
      if (props.selectOnFocus) {
        nextTick(() => setSelection(0, getValue().length))
      }
    },
    onBlur: () => emit('blur'),
    onKeydown: (event) => {
      emit('keydown', event)
      if (event.defaultPrevented) return
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        emit('submit')
      }
      if (event.key === 'Escape') emit('cancel')
    },
    onPaste: (event) => {
      emit('paste', event)
    },
    onCompositionStart: () => {
      emit('compositionstart')
    },
    onCompositionEnd: () => {
      emit('compositionend')
    },
  })
}

function handleViewUpdate(update: ViewUpdate) {
  const selection = selectionFromState(update.state)
  const value = update.state.doc.toString()

  if (update.docChanged) {
    internalUpdate = true
    emit('update:modelValue', value)
    nextTick(() => {
      internalUpdate = false
    })
  }

  if (update.selectionSet) {
    emit('selectionChange', selection)
  }

  if (update.docChanged || update.selectionSet) {
    emit('transaction', {
      value,
      selection,
      docChanged: update.docChanged,
      selectionChanged: update.selectionSet,
    })
  }
}

function reconfigureView() {
  if (!view) return
  const settings = effectiveSettings.value
  view.dispatch({
    effects: [
      compartments.tabSize.reconfigure(tabSizeExtensions(settings.tabSize)),
      compartments.readOnly.reconfigure(readOnlyExtensions(props.readOnly)),
      compartments.theme.reconfigure(themeExtension(props.profile, props.spellcheck)),
      compartments.wrapping.reconfigure(wrappingExtension(settings.lineWrapping)),
      compartments.placeholder.reconfigure(placeholderExtensions(props.placeholder)),
      compartments.language.reconfigure(languageExtensions(settings, props.language, props.path)),
      compartments.completion.reconfigure(completionExtensions(settings.completionEnabled)),
      compartments.markdownLivePreview.reconfigure(markdownLivePreviewExtension(props.markdownLivePreview)),
    ],
  })
  view.contentDOM.setAttribute('spellcheck', props.spellcheck ? 'true' : 'false')
  scheduleHeightChange()
}

function getValue(): string {
  return view?.state.doc.toString() ?? props.modelValue
}

function getSelectedText(): string {
  if (!view) return ''
  const selection = view.state.selection.main
  if (selection.empty) return ''
  return view.state.sliceDoc(selection.from, selection.to)
}

function setValue(value: string, options: EditorSetValueOptions = {}) {
  if (!view) return
  const current = view.state.doc.toString()
  if (current === value) return
  const selection = getSelection()
  const scrollTop = view.scrollDOM.scrollTop
  const nextSelection = options.preserveSelection
    ? {
        anchor: Math.min(selection.from, value.length),
        head: Math.min(selection.to, value.length),
      }
    : { anchor: value.length }
  view.dispatch({
    changes: { from: 0, to: current.length, insert: value },
    selection: nextSelection,
  })
  if (options.preserveSelection) {
    view.scrollDOM.scrollTop = scrollTop
  }
}

function getSelection(): EditorSelection {
  return view ? selectionFromState(view.state) : { from: 0, to: 0 }
}

function setSelection(from: number, to = from) {
  if (!view) return
  const length = view.state.doc.length
  const safeFrom = Math.max(0, Math.min(from, length))
  const safeTo = Math.max(0, Math.min(to, length))
  view.dispatch({
    selection: { anchor: safeFrom, head: safeTo },
    scrollIntoView: true,
  })
}

function replaceRange(from: number, to: number, text: string) {
  if (!view) return
  const length = view.state.doc.length
  const safeFrom = Math.max(0, Math.min(from, length))
  const safeTo = Math.max(safeFrom, Math.min(to, length))
  view.dispatch({
    changes: { from: safeFrom, to: safeTo, insert: text },
    selection: { anchor: safeFrom + text.length },
    scrollIntoView: true,
  })
}

function scrollToTop() {
  if (!view) return
  view.scrollDOM.scrollTop = 0
}

function getScrollTop(): number {
  return view?.scrollDOM.scrollTop ?? 0
}

function setScrollTop(scrollTop: number) {
  if (!view) return
  view.scrollDOM.scrollTop = Math.max(0, scrollTop)
}

function getCursorLineInfo(): EditorCursorLineInfo {
  if (!view) {
    return {
      lineNumber: 1,
      totalLines: 1,
      from: 0,
      to: 0,
      text: '',
    }
  }
  const head = view.state.selection.main.head
  const line = view.state.doc.lineAt(head)
  return {
    lineNumber: line.number,
    totalLines: view.state.doc.lines,
    from: line.from,
    to: line.to,
    text: line.text,
  }
}

function selectionFromState(state: EditorState): EditorSelection {
  const selection = state.selection.main
  return { from: selection.from, to: selection.to }
}

function focus() {
  view?.focus()
}

function blur() {
  view?.contentDOM.blur()
}

function scheduleHeightChange() {
  if (heightFrame !== null) return
  heightFrame = requestAnimationFrame(() => {
    heightFrame = null
    const height = view?.dom.getBoundingClientRect().height ?? 0
    emit('heightChange', height)
  })
}

onMounted(() => {
  createView()
  if (hostRef.value) {
    resizeObserver = new ResizeObserver(scheduleHeightChange)
    resizeObserver.observe(hostRef.value)
  }
})

onBeforeUnmount(() => {
  if (heightFrame !== null) {
    cancelAnimationFrame(heightFrame)
    heightFrame = null
  }
  resizeObserver?.disconnect()
  resizeObserver = null
  view?.destroy()
  view = null
})

watch(
  () => props.modelValue,
  (value) => {
    if (internalUpdate || getValue() === value) return
    setValue(value, { preserveSelection: true })
  }
)

watch(
  () => [
    props.profile,
    props.language,
    props.path,
    props.placeholder,
    props.readOnly,
    props.spellcheck,
    props.markdownLivePreview,
    effectiveSettings.value.tabSize,
    effectiveSettings.value.lineWrapping,
    effectiveSettings.value.syntaxHighlighting,
    effectiveSettings.value.completionEnabled,
  ],
  () => reconfigureView()
)

defineExpose<EditorHandle>({
  focus,
  blur,
  getValue,
  getSelectedText,
  setValue,
  getSelection,
  setSelection,
  replaceRange,
  scrollToTop,
  getScrollTop,
  setScrollTop,
  getCursorLineInfo,
})
</script>

<style scoped>
.text-editor {
  width: 100%;
  min-height: var(--editor-min-height);
}

.text-editor :deep(.cm-editor) {
  width: 100%;
}

.profile-composer {
  --editor-text: var(--text-input);
}

.profile-inline-message,
.profile-markdown-document,
.profile-code-file {
  --editor-text: var(--text);
}
</style>
