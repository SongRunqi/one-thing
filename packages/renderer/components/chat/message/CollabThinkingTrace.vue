<template>
  <div class="collab-thinking-trace">
    <button
      type="button"
      class="trace-line"
      :aria-expanded="expanded"
      :title="expanded ? '收起思考过程' : '展开思考过程'"
      @click="expanded = !expanded"
    >
      <span
        class="trace-caret"
        :class="{ open: expanded }"
        aria-hidden="true"
      >›</span>
      <span class="trace-label">{{ label }}</span>
    </button>

    <div
      v-if="expanded"
      class="trace-body"
    >
      <MessageBubble
        role="assistant"
        :content="message.content || ''"
        :content-parts="message.contentParts"
        :tool-calls="message.toolCalls"
        :steps="message.steps"
        :session-id="message.sessionId"
        @open-file="(filePath: string) => emit('openFile', filePath)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Room thinking trace (W14b 说话即行动,
 * docs/design/multi-agent-collab-im.md §4.5 / §3.6 痕迹级).
 *
 * The turn is no longer speech: what the model produced is the agent's
 * THINKING, and only its `say` calls reach the room. The record still has to
 * be inspectable — the audit principle is "过程可见但不冒充发言" — so it
 * renders as one hairline that unfolds:
 *
 *     › 思考过程 · 2 步
 *
 * 11px muted ink, no card, no frame, no icon, no signature, no avatar (the
 * group's signature belongs to what the agent SAID). Unfolded it shows the
 * turn's own body through the ordinary bubble, so the tool panels look exactly
 * like they do everywhere else in the app — a second rendering of tool calls
 * would be a second thing to keep in sync.
 */
import { computed, ref } from 'vue'
import type { ChatMessage } from '@/types'
import { formatCollabThinkingTraceLabel } from '@onething/runtime/collab'
import MessageBubble from './MessageBubble.vue'

const props = defineProps<{ message: ChatMessage }>()

const emit = defineEmits<{ openFile: [filePath: string] }>()

const expanded = ref(false)

/** Steps = the tool calls the turn made; the count is the only thing worth
 *  advertising before the row is unfolded. */
const label = computed(() =>
  formatCollabThinkingTraceLabel(props.message.toolCalls?.length ?? 0))
</script>

<style scoped>
.collab-thinking-trace {
  /* Spacing is the room's, not this component's (W15): every vertical gap in
     the stream is owned by MessageList's gap table. */
  margin: 0;
  /* The trace is not inside `.message`, so it never received the W15c outdent —
     it already sits on the speech axis and an indent here would push it off. */
  padding-left: 0;
}

.trace-line {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  font-size: 11px;
  line-height: 1.5;
  letter-spacing: 0.02em;
  color: var(--ui-text-muted-fg);
  user-select: none;
}

.trace-line:hover .trace-label {
  color: var(--ui-text-secondary-fg);
}

.trace-caret {
  display: inline-block;
  font-size: 12px;
  line-height: 1;
  /* 120ms — well inside §3.6's 200ms ceiling, and the only motion in the row. */
  transition: transform 120ms ease;
}

.trace-caret.open {
  transform: rotate(90deg);
}

.trace-body {
  margin-top: 6px;
  padding-left: 10px;
  border-left: 1px solid var(--ui-border-default-border, var(--border-color));
}
</style>
