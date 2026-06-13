<script lang="ts">
import {
  Comment,
  Fragment,
  Text,
  computed,
  defineComponent,
  h,
  isVNode,
  provide,
  type PropType,
  type StyleValue,
  type VNode,
} from 'vue'
import {
  normalizeTimelineMode,
  timelineContextKey,
  type TimelineMode,
} from './timeline'

export default defineComponent({
  name: 'Timeline',
  inheritAttrs: false,
  props: {
    reverse: {
      type: Boolean,
      default: false,
    },
    mode: {
      type: String as PropType<TimelineMode>,
      default: 'start',
    },
  },
  setup(props, { attrs, slots }) {
    const resolvedMode = computed(() => normalizeTimelineMode(props.mode))

    provide(timelineContextKey, {
      mode: resolvedMode,
    })

    return () => {
      const children = flattenTimelineChildren(slots.default?.() ?? [])
      const orderedChildren = props.reverse ? [...children].reverse() : children

      return h('ul', {
        ...attrs,
        class: [
          'app-timeline',
          `app-timeline--mode-${resolvedMode.value}`,
          {
            'is-reverse': props.reverse,
          },
          attrs.class,
        ],
        style: attrs.style as StyleValue,
      }, orderedChildren)
    }
  },
})

function flattenTimelineChildren(children: unknown): VNode[] {
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

    if (typeof child === 'string' && child.trim()) {
      nodes.push(h('li', { class: 'app-timeline-text-item' }, child))
      return
    }

    if (typeof child === 'number') {
      nodes.push(h('li', { class: 'app-timeline-text-item' }, String(child)))
    }
  }

  visit(children)
  return nodes
}

function isEmptyTextNode(node: VNode): boolean {
  return node.type === Text && typeof node.children === 'string' && node.children.trim() === ''
}
</script>

<style scoped>
.app-timeline {
  --app-timeline-rail-width: 18px;
  --app-timeline-gap: 12px;
  --app-timeline-item-gap: 18px;
  --app-timeline-line-color: color-mix(in srgb, var(--ui-border-default-border, var(--border)) 78%, transparent);
  --app-timeline-node-default-color: var(--ui-text-muted-fg, var(--muted));

  display: block;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--ui-text-primary-fg, var(--text));
}

.app-timeline-text-item {
  display: block;
  padding: 0 0 var(--app-timeline-item-gap);
  color: var(--ui-text-primary-fg, var(--text));
}

.app-timeline-text-item:last-child {
  padding-bottom: 0;
}
</style>
