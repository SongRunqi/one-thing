<template>
  <Transition name="todo-action-panel">
    <div
      v-if="visible"
      ref="panelRef"
      :class="['todo-notes-action-panel', `surface-${surface}`]"
    >
      <label class="action-search">
        <Search :size="14" />
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
        class="action-list"
      >
        <template
          v-for="(group, groupIndex) in groupedActions"
          :key="group.name"
        >
          <div
            :class="['action-section', { first: groupIndex === 0 }]"
          >
            <button
              v-for="item in group.items"
              :key="item.action.id"
              :class="['action-row', { selected: item.index === selectedIndex, disabled: item.action.enabled === false }]"
              :data-action-index="item.index"
              type="button"
              :disabled="item.action.enabled === false"
              @mouseenter="selectedIndex = item.index"
              @click="selectAction(item.action)"
            >
              <span class="action-icon">
                <component
                  :is="item.action.icon"
                  v-if="item.action.icon"
                  :size="isStandalone ? 16 : 17"
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
            </button>
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Search } from 'lucide-vue-next'
import {
  TODO_NOTES_ACTION_GROUPS,
  type TodoNotesAction,
  type TodoNotesActionGroup,
} from './todo-notes-actions'

const props = defineProps<{
  visible: boolean
  query: string
  actions: TodoNotesAction[]
  surface?: string
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
const surface = computed(() => props.surface || 'chat-floating-card')
const isStandalone = computed(() => surface.value === 'standalone-window')

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
  if (target && !panelRef.value?.contains(target) && event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
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
.todo-notes-action-panel {
  position: absolute;
  top: var(--todo-popover-top, 44px);
  left: 50%;
  z-index: 6;
  width: var(--todo-popover-width, min(430px, calc(100% - 18px)));
  max-height: var(--todo-action-popover-max-height, min(286px, calc(100vh - 94px)));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--todo-rule);
  border-radius: var(--todo-popover-radius, 12px);
  background: color-mix(in srgb, var(--todo-card-bg) 94%, var(--ui-surface-app-bg, #fff) 6%);
  box-shadow: var(--todo-popover-shadow, 0 16px 42px rgba(0, 0, 0, 0.2));
  transform: translateX(-50%);
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.25;
  overflow: hidden;
}

.todo-notes-action-panel.surface-standalone-window {
  background: color-mix(in srgb, var(--todo-card-bg) 96%, var(--ui-surface-app-bg, #fff) 4%);
}

.action-search {
  height: var(--todo-popover-search-height, 38px);
  padding: 0 var(--todo-popover-search-padding-x, 12px);
  display: flex;
  align-items: center;
  gap: var(--todo-popover-search-gap, 8px);
  border-bottom: 1px solid var(--todo-rule-soft);
  color: var(--todo-muted);
  background: var(--todo-card-bg-soft);
  font-size: var(--todo-popover-search-font-size, 13px);
  line-height: 1.25;
}

.action-search svg {
  flex: 0 0 auto;
}

.action-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: var(--todo-text);
  background: transparent;
  font: inherit;
  line-height: inherit;
}

.action-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 7px;
}

.surface-standalone-window .action-list {
  padding: 7px;
}

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

.surface-standalone-window .action-section {
  padding-top: 6px;
  margin-top: 6px;
}

.action-row {
  width: 100%;
  min-height: 46px;
  padding: 7px 8px;
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  border: 0;
  border-radius: 10px;
  color: var(--todo-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
  font: inherit;
}

.surface-standalone-window .action-row {
  min-height: 38px;
  padding: 5px 8px;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  gap: 9px;
  border-radius: 10px;
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
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: color-mix(in srgb, var(--todo-text) 82%, transparent);
}

.surface-standalone-window .action-icon {
  width: 22px;
  height: 22px;
}

.action-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.action-copy strong,
.action-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-copy strong {
  font-size: 13px;
  font-weight: 650;
}

.surface-standalone-window .action-copy strong {
  font-size: 13px;
  font-weight: 620;
}

.action-copy small {
  color: var(--todo-muted);
  font-size: 11px;
}

.surface-standalone-window .action-copy small {
  display: none;
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

.surface-standalone-window .shortcut-cluster {
  gap: 4px;
}

.surface-standalone-window .shortcut-keycap {
  min-width: 24px;
  height: 22px;
  padding: 0 6px;
  border-radius: 7px;
  font-size: 11px;
  font-weight: 650;
}

@media (max-width: 460px) {
  .surface-standalone-window .action-row {
    grid-template-columns: 22px minmax(0, 1fr);
  }

  .surface-standalone-window .shortcut-cluster {
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
