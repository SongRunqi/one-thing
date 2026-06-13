<template>
  <div
    ref="rootRef"
    class="filter-select"
    :class="{ open: isOpen, disabled }"
  >
    <Button
      unstyled
      class="filter-select-trigger"
      native-type="button"
      :aria-label="label"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      :disabled="disabled"
      @click="toggleMenu"
      @keydown="handleTriggerKeydown"
    >
      <component
        :is="selectedOption.icon"
        v-if="selectedOption?.icon"
        :size="14"
        :stroke-width="1.8"
        class="filter-select-icon"
      />
      <span class="filter-select-value">
        {{ selectedOption?.label || placeholder }}
      </span>
      <ChevronDown
        :size="14"
        :stroke-width="1.8"
        class="filter-select-chevron"
      />
    </Button>

    <Transition name="filter-select-menu">
      <div
        v-if="isOpen"
        class="filter-select-menu"
        role="listbox"
        :aria-label="label"
      >
        <Button
          v-for="option in options"
          :key="option.value"
          unstyled
          class="filter-select-option"
          :class="{ selected: option.value === modelValue }"
          native-type="button"
          role="option"
          :aria-selected="option.value === modelValue"
          :disabled="option.disabled"
          @click="selectOption(option.value)"
        >
          <component
            :is="option.icon"
            v-if="option.icon"
            :size="14"
            :stroke-width="1.8"
            class="filter-select-icon"
          />
          <span class="filter-select-option-label">{{ option.label }}</span>
          <Check
            v-if="option.value === modelValue"
            :size="14"
            :stroke-width="2"
            class="filter-select-check"
          />
        </Button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'

interface FilterSelectOption {
  value: string
  label: string
  icon?: Component
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: FilterSelectOption[]
  label: string
  placeholder?: string
  disabled?: boolean
}>(), {
  placeholder: 'Select',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)

const selectedOption = computed(() =>
  props.options.find(option => option.value === props.modelValue) || props.options[0]
)

function closeMenu() {
  isOpen.value = false
}

function toggleMenu() {
  if (props.disabled) return
  isOpen.value = !isOpen.value
}

function selectOption(value: string) {
  emit('update:modelValue', value)
  closeMenu()
}

function handleTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeMenu()
    return
  }

  if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
    event.preventDefault()
    isOpen.value = true
  }
}

function handlePointerDown(event: PointerEvent) {
  if (!rootRef.value?.contains(event.target as Node)) {
    closeMenu()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
})
</script>

<style scoped>
.filter-select {
  position: relative;
  min-width: 0;
}

.filter-select.open {
  z-index: calc(var(--z-dropdown, 1000) + 1);
}

.filter-select-trigger {
  display: inline-flex;
  align-items: center;
  width: 100%;
  height: 34px;
  min-width: 0;
  gap: 7px;
  padding: 0 9px 0 10px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  background: var(--ui-surface-input-bg, var(--bg-input, var(--bg)));
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, color 0.18s ease;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.03);
}

.filter-select-trigger:hover,
.filter-select.open .filter-select-trigger {
  color: var(--ui-text-primary-fg, var(--text));
  border-color: var(--ui-border-focus-border, var(--ui-accent-primary-fg, var(--accent)));
  background: var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg)));
}

.filter-select.open .filter-select-trigger {
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.03),
    0 0 0 1px var(--ui-border-focus-border, var(--ui-accent-primary-fg, var(--accent)));
}

.filter-select.disabled .filter-select-trigger {
  opacity: 0.55;
  cursor: default;
}

.filter-select-icon {
  flex: 0 0 auto;
  color: var(--ui-accent-primary-fg, var(--accent));
}

.filter-select-value,
.filter-select-option-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
}

.filter-select-value {
  flex: 1 1 auto;
  text-align: left;
}

.filter-select-chevron {
  flex: 0 0 auto;
  color: var(--ui-text-muted-fg, var(--muted));
  transition: transform 0.18s ease;
}

.filter-select.open .filter-select-chevron {
  transform: rotate(180deg);
}

.filter-select-menu {
  position: absolute;
  z-index: calc(var(--z-dropdown, 1000) + 20);
  top: calc(100% + 6px);
  left: 0;
  min-width: 100%;
  width: 100%;
  max-width: min(240px, calc(100vw - 24px));
  padding: 4px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg)));
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
}

.filter-select-option {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 128px;
  height: 30px;
  gap: 8px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.filter-select-option:hover {
  color: var(--ui-text-primary-fg, var(--text));
  background: var(--ui-state-hover-bg, var(--hover));
}

.filter-select-option.selected {
  color: var(--ui-accent-primary-fg, var(--accent));
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 11%, transparent);
}

.filter-select-check {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--ui-accent-primary-fg, var(--accent));
}

.filter-select-menu-enter-active,
.filter-select-menu-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.filter-select-menu-enter-from,
.filter-select-menu-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}
</style>
