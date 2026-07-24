<script lang="ts">
import {
  cloneVNode,
  Comment,
  createTextVNode,
  defineComponent,
  Fragment,
  h,
  isVNode,
  Text,
  type Component,
  type PropType,
  type StyleValue,
  type VNode,
} from 'vue'
import {
  createSpaceItemStyle,
  createSpaceStyle,
  type SpaceAlignment,
  type SpaceDirection,
  type SpaceSize,
  type SpaceSpacer,
} from './space'

export default defineComponent({
  name: 'Space',
  inheritAttrs: false,
  props: {
    as: {
      type: [String, Object, Function] as PropType<string | Component>,
      default: 'div',
    },
    direction: {
      type: String as PropType<SpaceDirection>,
      default: 'horizontal',
    },
    size: {
      type: [String, Number, Array] as PropType<SpaceSize>,
      default: 'small',
    },
    wrap: {
      type: Boolean,
      default: false,
    },
    spacer: {
      type: [String, Number, Object] as PropType<SpaceSpacer>,
      default: undefined,
    },
    separator: {
      type: [String, Number, Object] as PropType<SpaceSpacer>,
      default: undefined,
    },
    align: {
      type: String as PropType<SpaceAlignment>,
      default: undefined,
    },
    alignment: {
      type: String as PropType<SpaceAlignment>,
      default: undefined,
    },
    fill: {
      type: Boolean,
      default: false,
    },
    fillRatio: {
      type: Number,
      default: 100,
    },
  },
  setup(props, { attrs, slots }) {
    return () => {
      const children = flattenSpaceChildren(slots.default?.() ?? [])
      const hasSpacer = hasSpaceSpacer(props, slots)
      const shouldWrapItems = hasSpacer || props.fill
      const isHorizontal = props.direction === 'horizontal'
      const nodes = shouldWrapItems ? createWrappedNodes(children, props, slots, hasSpacer) : children

      return h(props.as as string | Component, {
        ...attrs,
        class: [
          'app-space',
          `app-space--${props.direction}`,
          {
            'has-item-wrapper': shouldWrapItems,
            'is-wrap': isHorizontal && (props.wrap || props.fill),
            'is-fill': props.fill,
          },
          attrs.class,
        ],
        style: [
          createSpaceStyle(props),
          attrs.style as StyleValue,
        ],
      }, nodes)
    }
  },
})

function createWrappedNodes(
  children: VNode[],
  props: {
    direction: SpaceDirection
    fill: boolean
    fillRatio: number
    spacer?: SpaceSpacer
    separator?: SpaceSpacer
  },
  slots: {
    spacer?: (props: { index: number }) => unknown
    separator?: (props: { index: number }) => unknown
  },
  hasSpacer: boolean,
): VNode[] {
  const nodes: VNode[] = []

  children.forEach((child, index) => {
    nodes.push(h('div', {
      class: 'app-space__item',
      key: child.key ?? `item-${index}`,
      style: createSpaceItemStyle(props),
    }, [child]))

    if (hasSpacer && index < children.length - 1) {
      nodes.push(h('div', {
        class: 'app-space__separator',
        key: `separator-${index}`,
      }, renderSpacer(props, slots, index)))
    }
  })

  return nodes
}

function flattenSpaceChildren(children: unknown): VNode[] {
  const nodes: VNode[] = []

  function visit(child: unknown) {
    if (child === null || child === undefined || typeof child === 'boolean') return

    if (Array.isArray(child)) {
      child.forEach(visit)
      return
    }

    if (isVNode(child)) {
      if (child.type === Comment || isEmptyTextNode(child)) return
      if (child.type === Fragment && Array.isArray(child.children)) {
        child.children.forEach(visit)
        return
      }
      nodes.push(child)
      return
    }

    if (typeof child === 'string') {
      if (!child.trim()) return
      nodes.push(createTextVNode(child))
      return
    }

    if (typeof child === 'number') {
      nodes.push(createTextVNode(String(child)))
    }
  }

  visit(children)
  return nodes
}

function isEmptyTextNode(node: VNode): boolean {
  return node.type === Text && typeof node.children === 'string' && node.children.trim() === ''
}

function hasSpaceSpacer(
  props: { spacer?: SpaceSpacer; separator?: SpaceSpacer },
  slots: { spacer?: unknown; separator?: unknown },
): boolean {
  return Boolean(
    slots.spacer ||
    slots.separator ||
    (props.spacer !== undefined && props.spacer !== null) ||
    (props.separator !== undefined && props.separator !== null),
  )
}

function renderSpacer(
  props: { spacer?: SpaceSpacer; separator?: SpaceSpacer },
  slots: {
    spacer?: (props: { index: number }) => unknown
    separator?: (props: { index: number }) => unknown
  },
  index: number,
): string | number | VNode | VNode[] {
  const slot = slots.spacer ?? slots.separator
  if (slot) return slot({ index }) as string | number | VNode | VNode[]

  const spacer = props.spacer ?? props.separator
  if (isVNode(spacer)) return cloneVNode(spacer)
  return spacer ?? ''
}
</script>

<style scoped>
.app-space {
  box-sizing: border-box;
  display: flex;
  min-width: 0;
  max-width: 100%;
  gap:
    var(--app-space-row-gap, 8px)
    var(--app-space-column-gap, 8px);
  align-items: var(--app-space-align-items, center);
}

.app-space--horizontal {
  flex-direction: row;
  flex-wrap: nowrap;
}

.app-space--horizontal.is-wrap {
  flex-wrap: wrap;
}

.app-space--vertical {
  flex-direction: column;
}

.app-space__item {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
}

.app-space--horizontal > .app-space__item {
  display: inline-flex;
}

.app-space--vertical > .app-space__item {
  display: flex;
}

.app-space--horizontal.is-fill > .app-space__item {
  flex-grow: 1;
  min-width: var(--app-space-fill-ratio, 100%);
}

.app-space--vertical.is-fill > .app-space__item {
  width: var(--app-space-fill-ratio, 100%);
}

.app-space__separator {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  color: var(--ui-text-secondary-fg, var(--text-muted));
}
</style>
