<template>
  <div
    ref="rootRef"
    class="markdown-document-editor"
    :data-surface="surface"
  >
    <div
      v-if="toolbar && !readonly"
      class="markdown-document-toolbar"
      aria-label="Markdown formatting"
    >
      <button
        v-for="item in toolbarItems"
        :key="item.command"
        class="markdown-command-button"
        type="button"
        :title="item.title"
        :aria-label="item.title"
        @click="runCommand(item.command)"
      >
        <component
          :is="item.icon"
          :size="15"
        />
      </button>
    </div>

    <TextEditor
      ref="editorRef"
      class="markdown-document-textarea"
      :model-value="modelValue"
      profile="markdown-document"
      language="markdown"
      :placeholder="placeholder"
      :read-only="readonly"
      :min-height="minHeight"
      :max-height="maxHeight"
      :spellcheck="spellcheck"
      :markdown-live-preview="true"
      @update:model-value="emit('update:modelValue', $event)"
      @transaction="emit('transaction', $event)"
      @focus="emit('focus')"
      @blur="emit('blur')"
      @keydown="handleKeydown"
      @paste="handlePaste"
      @cancel="emit('cancel')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
  Table2,
  Underline,
} from 'lucide-vue-next'
import TextEditor from './TextEditor.vue'
import {
  applyMarkdownCommand,
  normalizeMarkdownFeatures,
  type MarkdownCommand,
  type MarkdownDocumentEditorHandle,
  type MarkdownDocumentSurface,
  type MarkdownFeatureSet,
} from './markdown-document'
import type {
  EditorCursorLineInfo,
  EditorHandle,
  EditorSelection,
  EditorSetValueOptions,
  EditorTransaction,
} from './types'

interface Props {
  modelValue: string
  placeholder?: string
  surface?: MarkdownDocumentSurface
  documentId?: string
  readonly?: boolean
  features?: MarkdownFeatureSet
  toolbar?: boolean
  minHeight?: number
  maxHeight?: number
  spellcheck?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '',
  surface: 'document',
  documentId: '',
  readonly: false,
  features: undefined,
  toolbar: false,
  minHeight: 160,
  maxHeight: 100000,
  spellcheck: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  transaction: [payload: EditorTransaction]
  focus: []
  blur: []
  command: [command: MarkdownCommand]
  openLink: [href: string]
  openImage: [payload: { src: string; alt: string }]
  keydown: [event: KeyboardEvent]
  paste: [event: ClipboardEvent]
  cancel: []
}>()

const rootRef = ref<HTMLElement | null>(null)
const editorRef = ref<EditorHandle | null>(null)
const features = computed(() => normalizeMarkdownFeatures(props.features))
const toolbarItems = computed(() => {
  const items: Array<{ command: MarkdownCommand; title: string; icon: unknown }> = [
    { command: 'heading-1', title: 'Heading 1', icon: Heading1 },
    { command: 'heading-2', title: 'Heading 2', icon: Heading2 },
    { command: 'heading-3', title: 'Heading 3', icon: Heading3 },
    { command: 'bold', title: 'Bold', icon: Bold },
    { command: 'italic', title: 'Italic', icon: Italic },
    { command: 'strikethrough', title: 'Strikethrough', icon: Strikethrough },
    { command: 'underline', title: 'Underline', icon: Underline },
    { command: 'inline-code', title: 'Inline code', icon: Code2 },
    { command: 'link', title: 'Link', icon: Link },
    { command: 'bullet-list', title: 'Bulleted list', icon: List },
    { command: 'ordered-list', title: 'Numbered list', icon: ListOrdered },
    { command: 'blockquote', title: 'Quote', icon: Quote },
    { command: 'horizontal-rule', title: 'Divider', icon: Minus },
  ]

  if (features.value.tasks) items.splice(9, 0, { command: 'task-list', title: 'Task list', icon: ListChecks })
  if (features.value.codeBlocks) items.push({ command: 'code-block', title: 'Code block', icon: Code2 })
  if (features.value.tables) items.push({ command: 'table', title: 'Table', icon: Table2 })
  if (features.value.images) items.push({ command: 'image', title: 'Image', icon: Image })
  return items
})

function runCommand(command: MarkdownCommand) {
  if (props.readonly) return
  const editor = editorRef.value
  if (!editor) return
  const result = applyMarkdownCommand(editor.getValue(), editor.getSelection(), command)
  editor.setValue(result.content)
  nextTick(() => {
    editor.setSelection(result.selection.from, result.selection.to)
    editor.focus()
  })
  emit('command', command)
}

function handleKeydown(event: KeyboardEvent) {
  emit('keydown', event)
  if (event.defaultPrevented || event.isComposing || props.readonly) return

  const command = event.metaKey || event.ctrlKey
  const key = event.key.toLowerCase()
  if (!command) return

  if (key === 'b') return preventAndRun(event, 'bold')
  if (key === 'i') return preventAndRun(event, 'italic')
  if (key === 'e') return preventAndRun(event, 'inline-code')
  if (key === 'k') return preventAndRun(event, 'link')
  if (event.altKey && key === '1') return preventAndRun(event, 'heading-1')
  if (event.altKey && key === '2') return preventAndRun(event, 'heading-2')
  if (event.altKey && key === '3') return preventAndRun(event, 'heading-3')
  if (event.shiftKey && (event.key === '7' || event.code === 'Digit7')) return preventAndRun(event, 'ordered-list')
  if (event.shiftKey && (event.key === '8' || event.code === 'Digit8')) return preventAndRun(event, 'bullet-list')
  if (event.shiftKey && (event.key === '9' || event.code === 'Digit9')) return preventAndRun(event, 'task-list')
}

function preventAndRun(event: KeyboardEvent, command: MarkdownCommand) {
  event.preventDefault()
  runCommand(command)
}

function handlePaste(event: ClipboardEvent) {
  emit('paste', event)
}

function handleOpenLink(event: Event) {
  const detail = (event as CustomEvent<{ href?: string }>).detail
  const href = detail?.href
  if (href) emit('openLink', href)
}

function handleOpenImage(event: Event) {
  const detail = (event as CustomEvent<{ src?: string; alt?: string }>).detail
  if (detail?.src) emit('openImage', { src: detail.src, alt: detail.alt || '' })
}

function focus() {
  editorRef.value?.focus()
}

function blur() {
  editorRef.value?.blur()
}

function getValue(): string {
  return editorRef.value?.getValue() ?? props.modelValue
}

function getSelectedText(): string {
  return editorRef.value?.getSelectedText() ?? ''
}

function setValue(value: string, options?: EditorSetValueOptions) {
  editorRef.value?.setValue(value, options)
}

function getSelection(): EditorSelection {
  return editorRef.value?.getSelection() ?? { from: 0, to: 0 }
}

function setSelection(from: number, to = from) {
  editorRef.value?.setSelection(from, to)
}

function replaceRange(from: number, to: number, text: string) {
  editorRef.value?.replaceRange(from, to, text)
}

function scrollToTop() {
  editorRef.value?.scrollToTop()
}

function getScrollTop(): number {
  return editorRef.value?.getScrollTop() ?? 0
}

function setScrollTop(scrollTop: number) {
  editorRef.value?.setScrollTop(scrollTop)
}

function getCursorLineInfo(): EditorCursorLineInfo {
  return editorRef.value?.getCursorLineInfo() ?? {
    lineNumber: 1,
    totalLines: 1,
    from: 0,
    to: 0,
    text: '',
  }
}

onMounted(() => {
  rootRef.value?.addEventListener('markdown-open-link', handleOpenLink)
  rootRef.value?.addEventListener('markdown-open-image', handleOpenImage)
})

onBeforeUnmount(() => {
  rootRef.value?.removeEventListener('markdown-open-link', handleOpenLink)
  rootRef.value?.removeEventListener('markdown-open-image', handleOpenImage)
})

defineExpose<MarkdownDocumentEditorHandle>({
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
  applyCommand: runCommand,
})
</script>

<style scoped>
.markdown-document-editor {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  color: var(--text);
}

.markdown-document-toolbar {
  flex: 0 0 auto;
  min-height: 34px;
  padding: 0 2px 8px;
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
}

.markdown-document-toolbar::-webkit-scrollbar {
  display: none;
}

.markdown-command-button {
  width: 28px;
  height: 28px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
}

.markdown-command-button:hover {
  color: var(--text);
  border-color: var(--border);
  background: color-mix(in srgb, var(--bg-elevated, var(--panel)) 72%, transparent);
}

.markdown-document-textarea {
  flex: 1 1 auto;
  min-height: 0;
}
</style>
