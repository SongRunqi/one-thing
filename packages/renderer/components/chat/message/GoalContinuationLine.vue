<template>
  <div class="goal-cont">
    <button
      type="button"
      class="cont-rule"
      :title="tooltip"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="rule" />
      <span
        class="tag"
        :class="{ warn: isBudget }"
      >⟳ {{ tag }}</span>
      <span class="rule end" />
    </button>
    <pre
      v-if="expanded"
      class="cont-body"
    >{{ content }}</pre>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  content: string
  timestamp?: number
}>()

const expanded = ref(false)

// Both drive templates carry "…continuation {{n}} of {{limit}}"; the count
// is a stall streak (real work resets it), not a lifetime allowance.
const counts = computed(() => /continuation (\d+) of (\d+)/.exec(props.content))
const isBudget = computed(() => props.content.includes('reached its token budget'))

const tag = computed(() => {
  if (isBudget.value) return 'BUDGET — WRAP UP'
  // No numbers on the rule: the count is a stall-detector internal, only
  // surfaced in the tooltip. A NUDGE appearing at all is the signal — the
  // agent stopped without declaring a disposition.
  return 'NUDGE'
})

const tooltip = computed(() => {
  if (isBudget.value) {
    return 'Goal token budget reached — the agent was asked to wrap up. Click to view the injected prompt.'
  }
  const numbered = counts.value ? ` (stall ${counts.value[1]} of ${counts.value[2]})` : ''
  return `The agent stopped without declaring continue/complete/pause — the system asked it to declare${numbered}. Real work resets the stall count. Click to view the injected prompt.`
})
</script>

<style scoped>
/* Blueprint tick, not a block: a dashed hairline with a 9px mono tag. It
   should read as machinery, weigh almost nothing, and still be findable. */
.goal-cont {
  margin: 2px 0;
}

.cont-rule {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 3px 0;
  border: 0;
  background: none;
  cursor: pointer;
  text-align: left;
}

.rule {
  flex: 1;
  border-top: 1px dashed var(--ui-border-default-border, var(--border-color));
  opacity: 0.55;
}

.rule.end {
  flex: 0 0 24px;
}

.tag {
  flex-shrink: 0;
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 1.5px;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg, var(--muted)));
  user-select: none;
}

.tag.warn {
  color: var(--ui-status-warning-fg, var(--warning-color, #d97706));
}

.cont-rule:hover .tag {
  color: var(--ui-text-secondary-fg, var(--text-secondary));
}

.cont-body {
  margin: 4px 0 0;
  padding: 8px 10px;
  border-left: 2px solid var(--ui-border-default-border, var(--border-color));
  color: var(--ui-text-secondary-fg, var(--text-secondary));
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}
</style>
