<template>
  <label
    class="filter-search"
    :class="{ 'has-value': modelValue.length > 0 }"
  >
    <Search
      :size="14"
      :stroke-width="1.8"
      class="filter-search-icon"
    />
    <input
      :value="modelValue"
      type="search"
      class="filter-search-input"
      :placeholder="placeholder"
      :aria-label="label"
      @input="emitValue"
    >
    <Button
      v-if="modelValue.length > 0"
      unstyled
      class="filter-search-clear"
      native-type="button"
      title="Clear search"
      :aria-label="clearLabel"
      @click="emit('update:modelValue', '')"
    >
      <X
        :size="13"
        :stroke-width="2"
      />
    </Button>
  </label>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { Search, X } from 'lucide-vue-next'

withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  label?: string
  clearLabel?: string
}>(), {
  placeholder: 'Search',
  label: 'Search',
  clearLabel: 'Clear search',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function emitValue(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<style scoped>
.filter-search {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 0;
  height: 34px;
  color: var(--ui-text-muted-fg);
  background: var(--ui-surface-input-bg);
  border: 1px solid var(--ui-border-default-border);
  border-radius: 8px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.03);
}

.filter-search:focus-within {
  color: var(--ui-text-primary-fg);
  border-color: var(--ui-border-focus-border, var(--ui-accent-primary-fg));
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.03),
    0 0 0 1px var(--ui-border-focus-border, var(--ui-accent-primary-fg));
}

.filter-search-icon {
  flex: 0 0 auto;
  margin-left: 10px;
  pointer-events: none;
}

.filter-search-input {
  min-width: 0;
  width: 100%;
  height: 100%;
  padding: 0 10px 0 7px;
  border: none;
  outline: none;
  color: var(--ui-text-primary-fg);
  background: transparent;
  font: inherit;
  font-size: 12.5px;
}

.filter-search.has-value .filter-search-input {
  padding-right: 30px;
}

.filter-search-input::-webkit-search-cancel-button {
  appearance: none;
}

.filter-search-input::placeholder {
  color: var(--ui-text-muted-fg);
}

.filter-search-clear {
  position: absolute;
  right: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 23px;
  height: 23px;
  padding: 0;
  border: none;
  border-radius: 6px;
  color: var(--ui-text-muted-fg);
  background: transparent;
  cursor: pointer;
}

.filter-search-clear:hover {
  color: var(--ui-text-primary-fg);
  background: var(--ui-state-hover-bg);
}
</style>
