<template>
  <CollapseGroup
    class="nested-collapse-group"
    :class="groupClass"
    :model-value="modelValue"
    :accordion="accordion"
    :default-collapsed="defaultCollapsed"
    :default-expanded-keys="defaultExpandedKeys"
    :variant="variant"
    :content-variant="contentVariant"
    :expand-icon-position="expandIconPosition"
    :expand-icon-display="expandIconDisplay"
    :spacing="spacing"
    @update:model-value="emit('update:modelValue', $event)"
    @change="emit('change', $event)"
  >
    <NestedCollapseNode
      v-for="rootItem in items"
      :key="rootItem.key"
      :item="rootItem"
      :depth="0"
      :on-panel-change="handlePanelChange"
    >
      <template
        v-for="slotName in forwardedSlotNames"
        #[slotName]="slotScope"
      >
        <slot
          :name="slotName"
          v-bind="slotScope"
        />
      </template>
    </NestedCollapseNode>
  </CollapseGroup>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, useSlots } from 'vue'
import CollapseGroup from './CollapseGroup.vue'
import CollapsePanel from './CollapsePanel.vue'
import type { SpaceSize } from './space'
import type {
  CollapsePanelKey,
  CollapsePanelContentVariant,
  CollapsePanelVariant,
  ExpandIconDisplay,
  ExpandIconPosition,
  NestedCollapseItem,
  NestedCollapsePanelChange,
} from './collapse'

defineOptions({
  name: 'NestedCollapseGroup',
})

const _props = withDefaults(defineProps<{
  items: NestedCollapseItem[]
  modelValue?: CollapsePanelKey[]
  accordion?: boolean
  defaultCollapsed?: boolean
  defaultExpandedKeys?: CollapsePanelKey[]
  variant?: CollapsePanelVariant
  contentVariant?: CollapsePanelContentVariant
  expandIconPosition?: ExpandIconPosition
  expandIconDisplay?: ExpandIconDisplay
  spacing?: SpaceSize
  groupClass?: unknown
}>(), {
  modelValue: undefined,
  accordion: false,
  defaultCollapsed: false,
  defaultExpandedKeys: () => [],
  variant: undefined,
  contentVariant: undefined,
  expandIconPosition: undefined,
  expandIconDisplay: undefined,
  spacing: 'small',
  groupClass: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [keys: CollapsePanelKey[]]
  change: [keys: CollapsePanelKey[]]
  'panel-change': [change: NestedCollapsePanelChange]
}>()

const slots = useSlots()
const forwardedSlotNames = computed(() => Object.keys(slots))

function handlePanelChange(change: NestedCollapsePanelChange) {
  emit('panel-change', change)
}

interface NestedCollapseNodeProps {
  item: NestedCollapseItem
  depth: number
  onPanelChange: (change: NestedCollapsePanelChange) => void
}

const NestedCollapseNode = defineComponent<NestedCollapseNodeProps>({
  name: 'NestedCollapseNode',
  props: {
    item: {
      type: Object,
      required: true,
    },
    depth: {
      type: Number,
      required: true,
    },
    onPanelChange: {
      type: Function,
      required: true,
    },
  },
  setup(nodeProps, { slots: nodeSlots }) {
    return () => renderNestedCollapseNode(nodeProps, nodeSlots)
  },
})

function renderNestedCollapseNode(
  nodeProps: NestedCollapseNodeProps,
  nodeSlots: ReturnType<typeof useSlots>,
) {
  const item = nodeProps.item
  const children = item.children ?? []
  const hasChildren = children.length > 0

  if (item.panel === false) {
    return h(
      'div',
      {
        class: ['nested-collapse-container', item.class],
        'data-nested-collapse-depth': nodeProps.depth,
        ...item.attrs,
      },
      renderNestedChildren(item, children, nodeProps.depth, nodeProps.onPanelChange, nodeSlots),
    )
  }

  return h(
    CollapsePanel,
    {
      class: ['nested-collapse-panel', item.class],
      name: item.key,
      title: item.title ?? '',
      defaultCollapsed: item.defaultCollapsed ?? false,
      defaultExpandedWhenKeys: item.defaultExpandedWhenKeys ?? getDescendantKeys(item),
      disabled: item.disabled ?? false,
      collapsible: item.collapsible ?? true,
      eager: item.eager ?? false,
      status: item.status ?? 'idle',
      streaming: item.streaming ?? false,
      content: item.content,
      contentKind: item.contentKind ?? 'text',
      contentVariant: item.contentVariant,
      contentClass: item.contentClass,
      contentAttrs: item.contentAttrs,
      language: item.language ?? '',
      filePath: item.filePath ?? '',
      wrapContent: item.wrapContent ?? false,
      variant: item.variant,
      expandIconPosition: item.expandIconPosition,
      expandIconDisplay: item.expandIconDisplay,
      'data-nested-collapse-depth': nodeProps.depth,
      ...item.attrs,
      onChange: (expanded: boolean) => {
        nodeProps.onPanelChange({ item, expanded, depth: nodeProps.depth })
      },
    },
    {
      title: (panelScope: Record<string, unknown>) => renderOptionalSlot(nodeSlots.title, {
        ...panelScope,
        item,
        depth: nodeProps.depth,
        hasChildren,
      }, item.title ?? ''),
      icon: nodeSlots.icon
        ? (panelScope: Record<string, unknown>) => nodeSlots.icon?.({
          ...panelScope,
          item,
          depth: nodeProps.depth,
          hasChildren,
        })
        : undefined,
      actions: nodeSlots.actions
        ? (panelScope: Record<string, unknown>) => nodeSlots.actions?.({
          ...panelScope,
          item,
          depth: nodeProps.depth,
          hasChildren,
        })
        : undefined,
      default: hasChildren || nodeSlots.content
        ? (panelScope: Record<string, unknown>) => [
          ...(nodeSlots.content?.({
            ...panelScope,
            item,
            depth: nodeProps.depth,
            hasChildren,
          }) ?? []),
          ...renderNestedChildren(item, children, nodeProps.depth, nodeProps.onPanelChange, nodeSlots),
        ]
        : undefined,
    },
  )
}

function renderNestedChildren(
  item: NestedCollapseItem,
  children: NestedCollapseItem[],
  depth: number,
  onPanelChange: (change: NestedCollapsePanelChange) => void,
  nodeSlots: ReturnType<typeof useSlots>,
) {
  if (children.length === 0) return []

  return [
    h(
      'div',
      {
        class: ['nested-collapse-children', item.childrenClass],
        'data-nested-collapse-children-depth': depth + 1,
      },
      children.map(child => h(NestedCollapseNode, {
        key: child.key,
        item: child,
        depth: depth + 1,
        onPanelChange,
      }, nodeSlots)),
    ),
  ]
}

function renderOptionalSlot(
  slot: ReturnType<typeof useSlots>[string] | undefined,
  scope: Record<string, unknown>,
  fallback: string,
) {
  return slot?.(scope) ?? fallback
}

function getDescendantKeys(item: NestedCollapseItem): CollapsePanelKey[] {
  const keys: CollapsePanelKey[] = []
  for (const child of item.children ?? []) {
    if (child.panel !== false) {
      keys.push(child.key)
    }
    keys.push(...getDescendantKeys(child))
  }
  return keys
}
</script>

<style scoped>
.nested-collapse-group,
.nested-collapse-container,
.nested-collapse-children {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.nested-collapse-container,
.nested-collapse-children {
  display: flex;
  flex-direction: column;
}

.nested-collapse-container {
  gap: 6px;
}

.nested-collapse-children {
  gap: 6px;
}
</style>
