<template>
  <a
    ref="linkRef"
    class="app-link"
    :class="linkClasses"
    :href="resolvedHref"
    :target="resolvedTarget"
    :rel="resolvedRel"
    :role="isDisabled ? 'link' : undefined"
    :aria-disabled="isDisabled ? 'true' : undefined"
    :tabindex="isDisabled ? -1 : undefined"
    @click="handleClick"
  >
    <span
      v-if="showStartIcon"
      class="app-link-icon"
      aria-hidden="true"
    >
      <component
        :is="resolvedIcon"
        v-if="resolvedIcon"
      />
      <slot
        v-else
        name="icon"
      />
    </span>

    <span class="app-link-label">
      <slot />
    </span>

    <span
      v-if="showEndIcon"
      class="app-link-icon"
      aria-hidden="true"
    >
      <component
        :is="resolvedIcon"
        v-if="resolvedIcon"
      />
      <slot
        v-else
        name="icon"
      />
    </span>
  </a>
</template>

<script setup lang="ts">
import { computed, ref, toRaw, useSlots, type Component } from 'vue'
import { normalizeLinkUnderline, type LinkIconPosition, type LinkUnderline } from './link'

defineOptions({
  name: 'AppLink',
})

const props = withDefaults(defineProps<{
  href?: string
  target?: string
  rel?: string
  disabled?: boolean
  underline?: LinkUnderline
  icon?: Component
  iconPosition?: LinkIconPosition
}>(), {
  href: undefined,
  target: undefined,
  rel: undefined,
  disabled: false,
  underline: 'hover',
  icon: undefined,
  iconPosition: 'start',
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const slots = useSlots()
const linkRef = ref<HTMLAnchorElement | null>(null)

const isDisabled = computed(() => props.disabled)
const resolvedHref = computed(() => isDisabled.value ? undefined : props.href)
const resolvedTarget = computed(() => isDisabled.value ? undefined : props.target)
const resolvedRel = computed(() => {
  if (isDisabled.value) return undefined
  if (props.rel !== undefined) return props.rel
  return props.target === '_blank' ? 'noopener noreferrer' : undefined
})
const resolvedIcon = computed(() => props.icon ? toRaw(props.icon) : undefined)
const underlineMode = computed(() => normalizeLinkUnderline(props.underline))
const hasIcon = computed(() => Boolean(resolvedIcon.value) || Boolean(slots.icon))
const showStartIcon = computed(() => hasIcon.value && props.iconPosition === 'start')
const showEndIcon = computed(() => hasIcon.value && props.iconPosition === 'end')

const linkClasses = computed(() => [
  `app-link--underline-${underlineMode.value}`,
  {
    'is-disabled': isDisabled.value,
    'has-icon': hasIcon.value,
    'is-icon-start': showStartIcon.value,
    'is-icon-end': showEndIcon.value,
  },
])

function handleClick(event: MouseEvent) {
  if (isDisabled.value) {
    event.preventDefault()
    event.stopImmediatePropagation()
    return
  }

  emit('click', event)
}

function focus(options?: Parameters<HTMLElement['focus']>[0]) {
  linkRef.value?.focus(options)
}

function blur() {
  linkRef.value?.blur()
}

function getBoundingClientRect(): DOMRect {
  return linkRef.value?.getBoundingClientRect() ?? new DOMRect()
}

function contains(node: Node | null): boolean {
  return Boolean(node && linkRef.value?.contains(node))
}

defineExpose({
  blur,
  contains,
  focus,
  getBoundingClientRect,
})
</script>

<style scoped>
.app-link {
  --app-link-fg: var(--ui-text-link-fg);
  --app-link-hover-fg: var(--ui-text-link-hover-fg);
  --app-link-disabled-fg: var(--ui-text-disabled-fg);
  --app-link-focus-ring: color-mix(in srgb, var(--app-link-fg) 45%, transparent);
  --app-link-icon-gap: 0.34em;

  display: inline-flex;
  align-items: baseline;
  gap: var(--app-link-icon-gap);
  max-width: 100%;
  min-width: 0;
  border-radius: 3px;
  color: var(--app-link-fg);
  cursor: pointer;
  font: inherit;
  line-height: inherit;
  letter-spacing: 0;
  text-decoration-color: currentColor;
  text-decoration-thickness: from-font;
  text-underline-offset: 0.16em;
  vertical-align: baseline;
  transition:
    color var(--duration-fast, 0.15s) var(--ease-default, ease),
    box-shadow var(--duration-fast, 0.15s) var(--ease-default, ease),
    opacity var(--duration-fast, 0.15s) var(--ease-default, ease);
}

.app-link:hover:not(.is-disabled) {
  color: var(--app-link-hover-fg);
}

.app-link:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px var(--ui-surface-app-bg),
    0 0 0 4px var(--app-link-focus-ring);
}

.app-link--underline-always {
  text-decoration-line: underline;
}

.app-link--underline-hover {
  text-decoration-line: none;
}

.app-link--underline-hover:hover:not(.is-disabled) {
  text-decoration-line: underline;
}

.app-link--underline-none,
.app-link--underline-none:hover {
  text-decoration-line: none;
}

.app-link.is-disabled {
  color: var(--app-link-disabled-fg);
  cursor: not-allowed;
  opacity: 0.72;
  text-decoration-line: none;
}

.app-link-label {
  min-width: 0;
  overflow-wrap: anywhere;
}

.app-link-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 1em;
  height: 1em;
  line-height: 1;
  transform: translateY(0.1em);
}

.app-link-icon :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
  stroke-width: 2;
}

@media (prefers-reduced-motion: reduce) {
  .app-link {
    transition: none;
  }
}
</style>
