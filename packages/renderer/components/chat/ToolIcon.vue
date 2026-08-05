<template>
  <span
    class="tool-icon"
    :class="`icon-${status}`"
    :title="label"
    aria-hidden="true"
  >
    <component
      :is="icon"
      :size="13"
      :stroke-width="1.75"
    />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ToolRenderStatus } from '@/stores/helpers/tool-status'
import { getToolIcon } from '@/stores/helpers/tool-ui-registry'

const props = defineProps<{
  toolName: string
  status: ToolRenderStatus
  label?: string
}>()

const icon = computed(() => getToolIcon(props.toolName))
</script>

<style scoped>
.tool-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 18px;
  color: var(--activity-title-fg, var(--ui-tool-text-faint-fg));
  transition: color 0.15s ease, opacity 0.15s ease;
}

.tool-icon.icon-queued,
.tool-icon.icon-pending,
.tool-icon.icon-cancelled {
  opacity: 0.55;
}

.tool-icon.icon-streaming-input,
.tool-icon.icon-executing {
  color: var(--ui-tool-accent-fg, var(--ui-accent-primary-fg));
}

.tool-icon.icon-awaiting-confirmation {
  color: var(--ui-status-warning-fg);
  animation: tool-icon-attention 2s ease-in-out infinite alternate;
}

.tool-icon.icon-failed,
.tool-icon.icon-rejected {
  color: var(--ui-tool-danger-text-fg, var(--ui-status-danger-fg));
}

@keyframes tool-icon-attention {
  from {
    opacity: 0.55;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tool-icon.icon-awaiting-confirmation {
    animation: none;
  }
}
</style>
