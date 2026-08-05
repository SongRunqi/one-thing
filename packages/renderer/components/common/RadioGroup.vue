<template>
  <div
    class="app-radio-group"
    :class="groupClasses"
    role="radiogroup"
    :aria-label="ariaLabel"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * RadioGroup — owns the selected value, the native `name` and the disabled flag
 * for the `Radio`s inside it. The children read all three through inject and
 * keep no copy, so there is exactly one source of truth per set.
 *
 * The group is optional: a lone `<Radio v-model value="x">` still works. See
 * `radio.ts` for why both dialects exist.
 */
import { computed, provide } from 'vue'
import { radioGroupKey, type RadioSize } from './radio'

let radioGroupIdCounter = 0

const props = withDefaults(defineProps<{
  modelValue?: unknown
  disabled?: boolean
  /** Native group name; generated when omitted. */
  name?: string
  size?: RadioSize
  /** `row` lays the options out inline; `column` stacks them. */
  direction?: 'row' | 'column'
  ariaLabel?: string
}>(), {
  modelValue: undefined,
  disabled: false,
  name: undefined,
  size: 'default',
  direction: 'column',
  ariaLabel: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
  change: [value: unknown]
}>()

const fallbackName = `app-radio-group-${++radioGroupIdCounter}`

const groupClasses = computed(() => [`app-radio-group--${props.direction}`])

provide(radioGroupKey, {
  name: () => props.name ?? fallbackName,
  value: () => props.modelValue,
  disabled: () => props.disabled,
  size: () => props.size,
  select: (value: unknown) => {
    if (props.disabled) return
    emit('update:modelValue', value)
    emit('change', value)
  },
})
</script>

<style scoped>
.app-radio-group {
  display: flex;
  min-width: 0;
}

.app-radio-group--column {
  flex-direction: column;
  gap: 6px;
}

.app-radio-group--row {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
}
</style>
