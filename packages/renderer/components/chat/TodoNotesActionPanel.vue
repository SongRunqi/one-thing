<template>
  <Transition name="todo-action-panel">
    <div
      v-if="visible"
      ref="panelRef"
      class="todo-notes-action-panel todo-popover todo-popover-actions"
    >
      <label class="action-search todo-popover-search">
        <Search :size="15" />
        <input
          ref="inputRef"
          :value="query"
          placeholder="Search for actions..."
          spellcheck="false"
          @input="emit('update:query', ($event.target as HTMLInputElement).value)"
          @keydown.stop
        >
      </label>

      <div
        ref="listRef"
        class="action-list todo-popover-list"
      >
        <template
          v-for="(group, groupIndex) in groupedActions"
          :key="group.name"
        >
          <div
            :class="['action-section', { first: groupIndex === 0 }]"
          >
            <Button
              v-for="item in group.items"
              :key="item.action.id"
              text
              :class="['action-row', { selected: item.index === selectedIndex, disabled: item.action.enabled === false }]"
              :data-action-index="item.index"
              native-type="button"
              :disabled="item.action.enabled === false"
              @mouseenter="selectedIndex = item.index"
              @mousedown.prevent
              @click.stop="selectAction(item.action)"
            >
              <span class="action-icon">
                <component
                  :is="item.action.icon"
                  v-if="item.action.icon"
                  :size="16"
                />
              </span>
              <span class="action-copy">
                <strong>{{ item.action.title }}</strong>
                <small v-if="item.action.subtitle">{{ item.action.subtitle }}</small>
              </span>
              <span
                v-if="item.action.shortcut"
                class="shortcut-cluster"
              >
                <kbd
                  v-for="(part, shortcutIndex) in shortcutParts(item.action.shortcut)"
                  :key="`${item.action.id}-${shortcutIndex}-${part}`"
                  class="shortcut-keycap"
                >{{ part }}</kbd>
              </span>
            </Button>
          </div>
        </template>

        <div
          v-if="filteredActions.length === 0"
          class="action-empty"
        >
          No actions
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Search } from 'lucide-vue-next'
import { isEditableTarget } from '@/utils/editable-target'
import {
  TODO_NOTES_ACTION_GROUPS,
  type TodoNotesAction,
  type TodoNotesActionGroup,
} from './todo-notes-actions'

const props = defineProps<{
  visible: boolean
  query: string
  actions: TodoNotesAction[]
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  select: [action: TodoNotesAction]
  close: []
}>()

const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

const filteredActions = computed(() => {
  const query = props.query.trim().toLowerCase()
  return props.actions
    .filter(action => action.visible !== false)
    .filter((action) => {
      if (!query) return true
      return [
        action.title,
        action.subtitle,
        action.group,
        action.shortcut,
        ...(action.keywords || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
})

const groupedActions = computed(() => {
  return TODO_NOTES_ACTION_GROUPS
    .map((name: TodoNotesActionGroup) => ({
      name,
      items: filteredActions.value
        .map((action, index) => ({ action, index }))
        .filter(item => item.action.group === name),
    }))
    .filter(group => group.items.length > 0)
})

watch(
  () => [props.visible, props.query, filteredActions.value.length] as const,
  () => {
    selectedIndex.value = firstEnabledIndex()
    if (props.visible) {
      nextTick(() => {
        inputRef.value?.focus()
        scrollSelectedActionIntoView()
      })
    }
  },
  { immediate: true },
)

watch(selectedIndex, () => {
  scrollSelectedActionIntoView()
})

function firstEnabledIndex(): number {
  const index = filteredActions.value.findIndex(action => action.enabled !== false)
  return index < 0 ? 0 : index
}

function moveSelection(direction: number) {
  const actions = filteredActions.value
  if (!actions.length) return
  let next = selectedIndex.value
  for (let attempts = 0; attempts < actions.length; attempts += 1) {
    next = (next + direction + actions.length) % actions.length
    if (actions[next]?.enabled !== false) {
      selectedIndex.value = next
      return
    }
  }
}

function scrollSelectedActionIntoView() {
  if (!props.visible) return
  nextTick(() => {
    const row = listRef.value?.querySelector<HTMLElement>(`[data-action-index="${selectedIndex.value}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  })
}

function selectAction(action?: TodoNotesAction) {
  if (!action || action.enabled === false) return
  emit('select', action)
}

function shortcutParts(shortcut: string): string[] {
  return Array.from(shortcut.replace(/\s+/g, ''))
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.visible || event.isComposing) return
  const target = event.target as Node | null
  const insidePanel = !!(target && panelRef.value?.contains(target))
  // 面板外正在编辑别的输入框（如会话重命名）时完全让行：
  // 否则单字符会被抢焦点、Enter/Escape 会被这里吞掉。
  if (!insidePanel && isEditableTarget(event.target)) return
  if (target && !insidePanel && event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
    inputRef.value?.focus()
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    event.stopPropagation()
    moveSelection(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    event.stopPropagation()
    moveSelection(-1)
    return
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()
    selectAction(filteredActions.value[selectedIndex.value])
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown, true)
})
</script>

<style scoped>
.action-section {
  padding-top: 7px;
  margin-top: 7px;
  border-top: 1px solid var(--todo-rule-soft);
}

.action-section.first {
  padding-top: 0;
  margin-top: 0;
  border-top: 0;
}

.action-row {
  --app-button-height: auto;
  --app-button-min-width: 0;
  --app-button-padding-x: 0;
  --app-button-gap: 0;
  --app-button-font-size: inherit;
  --app-button-tone: var(--todo-text);
  --app-button-hover-fill: color-mix(in srgb, var(--todo-text) 10%, transparent);
  --app-button-hover-fg: var(--todo-text);
  --app-button-shadow: none;
  --app-button-hover-shadow: none;

  width: 100%;
  min-height: var(--todo-action-row-min-height, 52px);
  padding: 8px 10px;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: 10px;
  color: var(--todo-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
  font: inherit;
}

.action-row :deep(.app-button-content),
.action-row :deep(.app-button-label) {
  display: contents;
}

.action-row.selected,
.action-row:hover:not(:disabled) {
  background: color-mix(in srgb, var(--todo-text) 10%, transparent);
}

.action-row.disabled {
  cursor: default;
  opacity: 0.42;
}

.action-icon {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: color-mix(in srgb, var(--todo-text) 82%, transparent);
}

.action-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.action-copy strong,
.action-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-copy strong {
  font-size: 13.5px;
  font-weight: 650;
}

.action-copy small {
  color: var(--todo-muted);
  font-size: 11.5px;
  line-height: 1.2;
}

.shortcut-cluster {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.shortcut-keycap {
  min-width: 30px;
  height: 26px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  color: color-mix(in srgb, var(--todo-text) 72%, transparent);
  background: color-mix(in srgb, var(--todo-text) 12%, transparent);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

@container (max-width: 360px) {
  .action-row {
    grid-template-columns: 22px minmax(0, 1fr);
  }

  .shortcut-cluster {
    display: none;
  }
}

.action-empty {
  padding: 28px 12px;
  color: var(--todo-muted);
  text-align: center;
  font-size: 13px;
}

.todo-action-panel-enter-active,
.todo-action-panel-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}

.todo-action-panel-enter-from,
.todo-action-panel-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-4px);
}
</style>
