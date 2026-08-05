<template>
  <Button
    ref="buttonRef"
    unstyled
    class="allow-button"
    native-type="button"
    @click="emit('confirm', 'once')"
  >
    Allow
    <!-- detached trigger:这是权限账页里的分段按钮,外层 wrapper 会切断它与
         相邻段之间的负 margin 拼接。trigger-el 模式下 Tooltip 自身 display:none。 -->
    <Tooltip
      :trigger-el="buttonEl"
      text="Allow (Enter)"
    />
  </Button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from '@/components/common/Button.vue'
import Tooltip from '@/components/common/Tooltip.vue'

const buttonRef = ref<InstanceType<typeof Button> | null>(null)
const buttonEl = computed<HTMLElement | null>(
  () => (buttonRef.value?.$el as HTMLElement | undefined) ?? null,
)

type PermissionResponse = 'once'

const emit = defineEmits<{
  confirm: [response: PermissionResponse]
}>()
</script>

<style scoped>
.allow-button {
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-sm, 8px);
  font-size: var(--font-size-sm, 12px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  border: 1px solid var(--ui-status-success-border);
  background: var(--ui-status-success-bg, transparent);
  color: var(--ui-status-success-fg);
  transition: all var(--duration-fast) var(--ease-default);
}

.allow-button:hover {
  background: var(--ui-status-success-bg, transparent);
  border-color: var(--ui-status-success-fg);
}

.allow-button:active {
  transform: scale(0.97);
}
</style>
