<template>
  <Dropdown
    :open="show"
    :anchor="{ x, y }"
    :items="items"
    :min-width="minWidth"
    :z-layer="zLayer"
    placement="bottom-start"
    :offset="0"
    shield
    @select="$emit('select', $event)"
    @update:open="onOpenChange"
  />
</template>

<script setup lang="ts">
/**
 * ContextMenu — a Dropdown pinned to a pointer coordinate.
 *
 * Since P1 this is a wrapper, not an implementation: positioning, viewport
 * clamping, Esc/outside dismissal and the shield all come from the kernel
 * (`composables/floating/`). The props and events are unchanged, so its six
 * call sites did not have to move.
 *
 * Level: `modal` by default, not `dropdown` — a right-click menu has to be able
 * to open inside a dialog and sit on top of it. That was a hard-coded quirk
 * before (recorded in docs/design/ui-system.md §3); it is now a prop, which is
 * the "follow the host's level" option that note asked P1 to build.
 */
import Dropdown from './Dropdown.vue'
import type { ContextMenuItem } from './context-menu'
import type { FloatingZLayer } from '@/composables/floating/useFloatingLayer'

withDefaults(defineProps<{
  show: boolean
  /** Viewport coordinates of the invoking pointer (clientX / clientY). */
  x: number
  y: number
  items: ContextMenuItem[]
  minWidth?: number
  zLayer?: FloatingZLayer
}>(), {
  minWidth: 184,
  zLayer: 'modal',
})

const emit = defineEmits<{
  select: [id: string]
  close: []
}>()

function onOpenChange(open: boolean) {
  if (!open) emit('close')
}
</script>
