<script lang="ts">
import {
  Comment,
  Fragment,
  Text,
  cloneVNode,
  computed,
  defineComponent,
  h,
  isVNode,
  provide,
  toRaw,
  type PropType,
  type StyleValue,
  type VNode,
} from 'vue'
import BreadcrumbItem from './BreadcrumbItem.vue'
import {
  breadcrumbContextKey,
  normalizeBreadcrumbSeparator,
  type BreadcrumbSeparatorIcon,
} from './breadcrumb'

export default defineComponent({
  name: 'Breadcrumb',
  inheritAttrs: false,
  props: {
    separator: {
      type: String,
      default: '/',
    },
    separatorIcon: {
      type: [String, Object, Function] as PropType<BreadcrumbSeparatorIcon>,
      default: undefined,
    },
    ariaLabel: {
      type: String,
      default: 'Breadcrumb',
    },
  },
  setup(props, { attrs, slots }) {
    const resolvedSeparator = computed(() => normalizeBreadcrumbSeparator(props.separator))
    const resolvedSeparatorIcon = computed<BreadcrumbSeparatorIcon | undefined>(() =>
      props.separatorIcon ? toRaw(props.separatorIcon) : undefined,
    )

    provide(breadcrumbContextKey, {
      separator: resolvedSeparator,
      separatorIcon: resolvedSeparatorIcon,
    })

    return () => {
      const children = flattenBreadcrumbChildren(slots.default?.() ?? [])
      const lastIndex = children.length - 1
      const items = children.map((child, index) => cloneVNode(child, {
        isLast: index === lastIndex,
      }))

      return h('nav', {
        ...attrs,
        class: ['app-breadcrumb', attrs.class],
        style: attrs.style as StyleValue,
        'aria-label': (attrs['aria-label'] as string | undefined) ?? props.ariaLabel,
      }, [
        h('ol', { class: 'app-breadcrumb__list' }, items),
      ])
    }
  },
})

function flattenBreadcrumbChildren(children: unknown): VNode[] {
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

      if (child.type === Text && typeof child.children === 'string') {
        nodes.push(h(BreadcrumbItem, null, { default: () => child.children }))
        return
      }

      nodes.push(child)
      return
    }

    if (typeof child === 'string' && child.trim()) {
      nodes.push(h(BreadcrumbItem, null, { default: () => child }))
      return
    }

    if (typeof child === 'number') {
      nodes.push(h(BreadcrumbItem, null, { default: () => String(child) }))
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
.app-breadcrumb {
  display: flex;
  max-width: 100%;
  min-width: 0;
  color: var(--ui-text-muted-fg);
  font-family: var(--type-label-font, var(--font-sans));
  font-size: var(--type-label-size, 13px);
  font-weight: var(--type-label-weight, 500);
  line-height: var(--type-label-line-height, 1.35);
  letter-spacing: 0;
}

.app-breadcrumb__list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
