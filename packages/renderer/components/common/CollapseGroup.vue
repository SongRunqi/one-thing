<template>
  <Space
    as="div"
    class="collapse-group"
    direction="vertical"
    :size="spacing"
    align="stretch"
    :class="{
      'has-group-header': hasGroupHeader,
      'is-title-hovered': isGroupTitleHovered,
      'is-actions-hovered': isGroupActionsHovered,
    }"
    :data-accordion="accordion"
  >
    <LayoutGrid
      v-if="hasGroupHeader"
      class="collapse-group-header"
      as="div"
      columns="minmax(0, 1fr) auto"
      :column-gap="{ base: 'sm', md: 'md' }"
      row-gap="xs"
      align-items="center"
    >
      <Space
        as="div"
        class="collapse-group-title"
        direction="horizontal"
        size="xs"
        align="center"
        @mouseenter="isGroupTitleHovered = true"
        @mouseleave="isGroupTitleHovered = false"
      >
        <span
          v-if="$slots['title-icon']"
          class="collapse-group-title-icon"
          aria-hidden="true"
        >
          <slot
            name="title-icon"
            :title="title"
            :accordion="accordion"
            :expanded-keys="currentExpandedKeys"
            :hovered="isGroupTitleHovered"
            :actions-hovered="isGroupActionsHovered"
          />
        </span>

        <slot
          name="title"
          :title="title"
          :accordion="accordion"
          :expanded-keys="currentExpandedKeys"
          :hovered="isGroupTitleHovered"
          :actions-hovered="isGroupActionsHovered"
        >
          <span class="collapse-group-title-text">{{ title }}</span>
        </slot>
      </Space>

      <Space
        v-if="$slots.actions"
        as="div"
        class="collapse-group-actions"
        direction="horizontal"
        size="xs"
        align="center"
        @mouseenter="isGroupActionsHovered = true"
        @mouseleave="isGroupActionsHovered = false"
      >
        <slot
          name="actions"
          :title="title"
          :accordion="accordion"
          :expanded-keys="currentExpandedKeys"
          :hovered="isGroupActionsHovered"
          :title-hovered="isGroupTitleHovered"
        />
      </Space>
    </LayoutGrid>

    <slot />
  </Space>
</template>

<script setup lang="ts">
import { computed, provide, ref, useSlots, watch } from 'vue'
import LayoutGrid from './LayoutGrid.vue'
import Space from './Space.vue'
import type { SpaceSize } from './space'
import {
  collapseGroupKey,
  type CollapseGroupContext,
  type CollapsePanelContentVariant,
  type ExpandIconDisplay,
  type CollapsePanelKey,
  type CollapsePanelVariant,
  type ExpandIconPosition,
} from './collapse'

const props = withDefaults(defineProps<{
  title?: string
  modelValue?: CollapsePanelKey[]
  accordion?: boolean
  defaultCollapsed?: boolean
  defaultExpandedKeys?: CollapsePanelKey[]
  variant?: CollapsePanelVariant
  contentVariant?: CollapsePanelContentVariant
  expandIconPosition?: ExpandIconPosition
  expandIconDisplay?: ExpandIconDisplay
  spacing?: SpaceSize
}>(), {
  title: '',
  modelValue: undefined,
  accordion: false,
  defaultCollapsed: false,
  defaultExpandedKeys: () => [],
  variant: undefined,
  contentVariant: undefined,
  expandIconPosition: undefined,
  expandIconDisplay: undefined,
  spacing: 'small',
})

const emit = defineEmits<{
  'update:modelValue': [keys: CollapsePanelKey[]]
  change: [keys: CollapsePanelKey[]]
}>()

const slots = useSlots()
const registeredKeys = new Set<CollapsePanelKey>()
const isGroupTitleHovered = ref(false)
const isGroupActionsHovered = ref(false)
const isControlled = computed(() => props.modelValue !== undefined)
const expandedKeys = ref(new Set(normalizeKeys(props.modelValue ?? props.defaultExpandedKeys)))
const currentExpandedKeys = computed(() => [...expandedKeys.value])
const hasGroupHeader = computed(() =>
  Boolean(props.title || slots.title || slots['title-icon'] || slots.actions)
)

watch(() => props.modelValue, (value) => {
  if (value === undefined) return
  expandedKeys.value = new Set(normalizeKeys(value))
})

watch(() => props.accordion, () => {
  if (expandedKeys.value.size <= 1) return
  commitExpanded(new Set(normalizeKeys([...expandedKeys.value])))
})

function normalizeKeys(keys: CollapsePanelKey[]): CollapsePanelKey[] {
  return props.accordion ? keys.slice(0, 1) : keys
}

function commitExpanded(nextKeys: Set<CollapsePanelKey>) {
  const normalized = new Set(normalizeKeys([...nextKeys]))
  if (!isControlled.value) {
    expandedKeys.value = normalized
  }
  const payload = [...normalized]
  emit('update:modelValue', payload)
  emit('change', payload)
}

function registerPanel(key: CollapsePanelKey, defaultExpanded: boolean) {
  if (registeredKeys.has(key)) return
  registeredKeys.add(key)

  if (expandedKeys.value.has(key)) return
  if (isControlled.value || props.defaultCollapsed || props.defaultExpandedKeys.length > 0 || !defaultExpanded) {
    return
  }

  if (props.accordion && hasRegisteredExpandedKey()) return

  const next = new Set(expandedKeys.value)
  next.add(key)
  expandedKeys.value = next
}

function unregisterPanel(key: CollapsePanelKey) {
  registeredKeys.delete(key)
}

function isExpanded(key: CollapsePanelKey, fallbackExpanded: boolean): boolean {
  if (expandedKeys.value.has(key)) return true
  if (registeredKeys.has(key) || isControlled.value || props.defaultCollapsed || props.defaultExpandedKeys.length > 0) {
    return false
  }
  return fallbackExpanded
}

function hasExpanded(keys: CollapsePanelKey[]): boolean {
  return keys.some(key => expandedKeys.value.has(key))
}

function setExpanded(key: CollapsePanelKey, expanded: boolean) {
  const next = props.accordion && expanded
    ? new Set<CollapsePanelKey>([key])
    : new Set(expandedKeys.value)

  if (expanded) {
    next.add(key)
  } else {
    next.delete(key)
  }

  commitExpanded(next)
}

function hasRegisteredExpandedKey(): boolean {
  return [...registeredKeys].some(key => expandedKeys.value.has(key))
}

const context: CollapseGroupContext = {
  get accordion() {
    return props.accordion
  },
  get variant() {
    return props.variant
  },
  get contentVariant() {
    return props.contentVariant
  },
  get expandIconPosition() {
    return props.expandIconPosition
  },
  get expandIconDisplay() {
    return props.expandIconDisplay
  },
  registerPanel,
  unregisterPanel,
  isExpanded,
  hasExpanded,
  setExpanded,
}

provide(collapseGroupKey, context)
</script>

<style scoped>
.collapse-group {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.collapse-group > :deep(.app-space__item) {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.collapse-group :slotted(*) {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.collapse-group :slotted(.collapse-panel) {
  width: 100%;
}

.collapse-group-header {
  min-width: 0;
  max-width: 100%;
  min-height: 24px;
}

.collapse-group-title {
  min-width: 0;
  max-width: 100%;
  color: var(--ui-text-muted-fg);
  justify-self: stretch;
}

.collapse-group-title :deep(.app-space__item) {
  min-width: 0;
  max-width: 100%;
}

.collapse-group-title :deep(.app-space__item:last-child) {
  flex: 1 1 auto;
}

.collapse-group-title-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--ui-text-muted-fg);
}

.collapse-group.is-title-hovered .collapse-group-title-icon {
  color: var(--ui-text-primary-fg);
}

.collapse-group-title-text {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-secondary-fg);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collapse-group.is-title-hovered .collapse-group-title-text {
  color: var(--ui-text-primary-fg);
}

.collapse-group-actions {
  min-width: 0;
  max-width: 45%;
  justify-self: end;
}
</style>
