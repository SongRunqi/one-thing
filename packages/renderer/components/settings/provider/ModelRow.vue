<template>
  <div
    class="model-row"
    :class="{ 'is-selected': selected, 'is-active': isActive, 'is-highlighted': highlighted }"
    role="button"
    tabindex="0"
    @click="$emit('open-config')"
    @keydown.enter.prevent="$emit('open-config')"
    @keydown.space.prevent="$emit('open-config')"
  >
    <!-- Checkbox governs "shows up in the chat model picker" — a different
         thing from "is the active model", which is the pill on the right. -->
    <span
      class="model-check"
      :class="{ checked: selected }"
      role="checkbox"
      tabindex="0"
      :aria-checked="selected"
      :aria-label="selected ? `Deselect ${model.id}` : `Select ${model.id}`"
      @click.stop="$emit('toggle')"
      @keydown.enter.prevent.stop="$emit('toggle')"
      @keydown.space.prevent.stop="$emit('toggle')"
    >
      <Check
        v-if="selected"
        :size="11"
      />
    </span>

    <span class="model-body">
      <span class="model-line-primary">
        <span class="model-name">{{ model.name || model.id }}</span>
        <span
          v-if="isCustom"
          class="model-tag"
        >自定义</span>
      </span>
      <span class="model-line-meta">
        <span class="model-id">{{ model.id }}</span>
        <span
          v-if="contextLabel"
          class="model-meta-item"
          :class="{ overridden: contextOverridden }"
        >{{ contextLabel }}</span>
        <span
          v-if="outputLabel"
          class="model-meta-item"
          :class="{ overridden: outputOverridden }"
        >{{ outputLabel }}</span>
      </span>
    </span>

    <span class="model-caps">
      <Tooltip
        v-for="cap in capabilities"
        :key="cap.key"
        :text="cap.label"
      >
        <component
          :is="cap.icon"
          :size="13"
        />
      </Tooltip>
    </span>

    <span class="model-trailing">
      <span
        v-if="isActive"
        class="model-active-pill"
      >当前</span>
      <Button
        v-else
        unstyled
        native-type="button"
        class="model-set-active"
        @click.stop="$emit('set-active')"
      >设为当前</Button>
      <span class="model-open-hint">
        配置
        <ChevronRight :size="13" />
      </span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check, ChevronRight } from 'lucide-vue-next'
import Button from '@/components/common/Button.vue'
import Tooltip from '@/components/common/Tooltip.vue'
import type { OpenRouterModel } from '@/types'

interface CapabilityBadge {
  key: string
  label: string
  icon: unknown
}

const props = defineProps<{
  model: OpenRouterModel
  selected: boolean
  isActive: boolean
  isCustom: boolean
  highlighted: boolean
  capabilities: CapabilityBadge[]
  /** Effective context window, after overrides. 0 = unknown. */
  contextLength: number
  contextOverridden: boolean
  /** Effective max output. 0 = unknown / falls back to provider default. */
  maxOutput: number
  outputOverridden: boolean
  formatTokens: (value: number) => string
}>()

defineEmits<{
  (e: 'toggle'): void
  (e: 'open-config'): void
  (e: 'set-active'): void
}>()

const contextLabel = computed(() =>
  props.contextLength > 0 ? `${props.formatTokens(props.contextLength)} 上下文` : '',
)

const outputLabel = computed(() =>
  props.maxOutput > 0 ? `${props.formatTokens(props.maxOutput)} 输出` : '',
)
</script>

<style scoped>
.model-row {
  display: flex;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 0 4px 0 2px;
  border-bottom: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border));
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-default);
}
.model-row:hover {
  background: var(--ui-state-hover-bg);
}
.model-row:focus-visible {
  outline: 2px solid var(--settings-accent, var(--ui-accent-primary-fg));
  outline-offset: -2px;
}
.model-row.is-highlighted {
  background: var(--ui-state-selected-bg);
}

/* Checkbox */
.model-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  color: transparent;
  transition: border-color var(--duration-fast) var(--ease-default);
}
.model-check:hover {
  border-color: var(--settings-ink-3, var(--ui-text-muted-fg));
}
.model-check:focus-visible {
  outline: 2px solid var(--settings-accent, var(--ui-accent-primary-fg));
  outline-offset: 2px;
}
.model-check.checked {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg));
  color: var(--settings-accent, var(--ui-accent-primary-fg));
}

/* Identity — takes the remaining width, so nothing ever scrolls sideways. */
.model-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.model-line-primary {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.model-name {
  overflow: hidden;
  color: var(--settings-ink, var(--ui-text-primary-fg));
  font-size: 13px;
  font-weight: 520;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-tag {
  flex: 0 0 auto;
  padding: 0 4px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  font-size: 10px;
}
.model-line-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  font-size: 11px;
}
.model-id {
  overflow: hidden;
  flex: 0 1 auto;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-meta-item {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}
.model-meta-item.overridden {
  color: var(--settings-accent, var(--ui-accent-primary-fg));
}

/* Capability glyphs */
.model-caps {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
}

/* Trailing: active state + the affordance that this row opens a page. */
.model-trailing {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 0 0 auto;
  min-width: 108px;
}
.model-active-pill {
  padding: 1px 6px;
  border: 1px solid var(--settings-accent, var(--ui-accent-primary-fg));
  color: var(--settings-accent, var(--ui-accent-primary-fg));
  font-size: 10px;
  line-height: 16px;
}
.model-set-active {
  padding: 1px 6px;
  border: 1px solid transparent;
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  font-size: 11px;
  line-height: 16px;
  opacity: 0;
  transition:
    opacity var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default);
}
.model-row:hover .model-set-active,
.model-set-active:focus-visible {
  opacity: 1;
}
.model-set-active:hover {
  border-color: var(--settings-rule, var(--ui-border-default-border));
  color: var(--settings-ink, var(--ui-text-primary-fg));
}
.model-open-hint {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  font-size: 11px;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-default);
}
.model-row:hover .model-open-hint,
.model-row:focus-visible .model-open-hint {
  opacity: 1;
}
</style>
