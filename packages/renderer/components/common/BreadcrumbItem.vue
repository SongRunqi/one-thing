<template>
  <li
    class="app-breadcrumb-item"
    :class="itemClasses"
  >
    <a
      v-if="hasLink"
      class="app-breadcrumb-item__content app-breadcrumb-item__link"
      :href="resolvedHref"
      :aria-current="isLast ? 'page' : undefined"
      @click="handleClick"
    >
      <slot />
    </a>
    <span
      v-else
      class="app-breadcrumb-item__content"
      :aria-current="isLast ? 'page' : undefined"
    >
      <slot />
    </span>

    <span
      v-if="!isLast"
      class="app-breadcrumb-item__separator"
      aria-hidden="true"
    >
      <component
        :is="resolvedSeparatorIcon"
        v-if="resolvedSeparatorIcon"
        class="app-breadcrumb-item__separator-icon"
      />
      <span
        v-else
        class="app-breadcrumb-item__separator-text"
      >
        {{ separatorText }}
      </span>
    </span>
  </li>
</template>

<script setup lang="ts">
import { computed, inject, toRaw } from 'vue'
import {
  breadcrumbContextKey,
  resolveBreadcrumbHref,
  type BreadcrumbNavigatePayload,
  type BreadcrumbSeparatorIcon,
  type BreadcrumbTo,
} from './breadcrumb'

defineOptions({
  name: 'BreadcrumbItem',
})

const props = withDefaults(defineProps<{
  to?: BreadcrumbTo
  replace?: boolean
  isLast?: boolean
}>(), {
  to: undefined,
  replace: false,
  isLast: false,
})

const emit = defineEmits<{
  click: [event: MouseEvent]
  navigate: [payload: BreadcrumbNavigatePayload]
}>()

const breadcrumb = inject(breadcrumbContextKey, null)

const separatorText = computed(() => breadcrumb?.separator.value ?? '/')
const resolvedSeparatorIcon = computed<BreadcrumbSeparatorIcon | undefined>(() => {
  const icon = breadcrumb?.separatorIcon.value
  return icon ? toRaw(icon) : undefined
})
const resolvedHref = computed(() => resolveBreadcrumbHref(props.to))
const hasLink = computed(() => Boolean(props.to !== undefined && resolvedHref.value))

const itemClasses = computed(() => ({
  'is-link': hasLink.value,
  'is-last': props.isLast,
}))

function handleClick(event: MouseEvent) {
  emit('click', event)

  if (!hasLink.value || event.defaultPrevented || isModifiedClick(event)) return

  event.preventDefault()
  emit('navigate', {
    to: props.to!,
    replace: props.replace,
    href: resolvedHref.value,
    event,
  })
}

function isModifiedClick(event: MouseEvent): boolean {
  return event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey
}
</script>

<style scoped>
.app-breadcrumb-item {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  list-style: none;
  color: var(--ui-text-muted-fg);
}

.app-breadcrumb-item__content {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: min(100%, 28ch);
  overflow: hidden;
  color: inherit;
  font: inherit;
  line-height: inherit;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 3px;
  transition:
    color var(--duration-fast, 0.15s) var(--ease-default, ease),
    box-shadow var(--duration-fast, 0.15s) var(--ease-default, ease);
}

.app-breadcrumb-item__link {
  cursor: pointer;
}

.app-breadcrumb-item__link:hover {
  color: var(--ui-text-primary-fg);
}

.app-breadcrumb-item__link:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px var(--ui-surface-app-bg),
    0 0 0 4px color-mix(in srgb, var(--ui-accent-primary-fg) 42%, transparent);
}

.app-breadcrumb-item.is-last {
  color: var(--ui-text-primary-fg);
}

.app-breadcrumb-item.is-last .app-breadcrumb-item__content {
  font-weight: 650;
}

.app-breadcrumb-item__separator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-width: 1.7em;
  padding: 0 0.46em;
  color: color-mix(in srgb, var(--ui-text-muted-fg) 72%, transparent);
  line-height: 1;
  user-select: none;
}

.app-breadcrumb-item__separator-icon {
  display: block;
  width: 1em;
  height: 1em;
  stroke-width: 2;
}

.app-breadcrumb-item__separator-text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0.5em;
}

@media (prefers-reduced-motion: reduce) {
  .app-breadcrumb-item__content {
    transition: none;
  }
}
</style>
