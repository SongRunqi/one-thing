<template>
  <div
    v-if="entries.length > 0"
    class="collab-typing"
  >
    <span class="typing-who">
      <template
        v-for="(entry, index) in entries"
        :key="entry.id"
      >
        <span
          v-if="index > 0"
          class="typing-sep"
        >、</span>
        <AgentAvatar
          class="typing-avatar"
          :avatar="entry.avatar"
          :avatar-image="entry.avatarImage"
          :size="12"
        />
        <span class="typing-name">{{ entry.name }}</span>
      </template>
    </span>
    <span class="typing-verb">正在输入</span>
    <span
      class="typing-dots"
      aria-hidden="true"
    >
      <span class="typing-dot" />
      <span class="typing-dot" />
      <span class="typing-dot" />
    </span>
  </div>
</template>

<script setup lang="ts">
/**
 * IM typing line (docs/design/multi-agent-collab-im.md §2.4 / §3.6): a trace,
 * not a panel — 11px ink-grey, three 2px dots breathing out of phase, no fill
 * and no frame. Renders nothing when the room is quiet; silence is a legal
 * state and must not reserve a row.
 */
import { computed } from 'vue'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import { AGENT_AVATAR_FALLBACK } from '@/components/common/agent-avatar'
import { useAgentsStore } from '@/stores/agents'
import { useCollabTypingAgents } from '@/composables/useCollabTyping'

const props = defineProps<{
  sessionId?: string
}>()

const agentsStore = useAgentsStore()

// 订阅 / 过期脉搏 / 名册懒加载都在 composable 里(C1 起活卡片的"正在执行"
// 吃同一条,所以那套接线不再属于这一个组件)。
const typingIds = useCollabTypingAgents(computed(() => props.sessionId))

// 署名走 displayAgent(域模型 M4):找不到的 id 显示墓碑「已注销」,而不是一串
// 原始 uuid。退休的成员本来就不会再被激活,所以这一行几乎只在"打字中途被退休"
// 这种窄缝里看得到墓碑 —— 但那一瞬也不该露出 id。
const entries = computed(() => typingIds.value.map(agentId => {
  const identity = agentsStore.displayAgent(agentId)
  return {
    id: agentId,
    name: identity.name,
    avatar: identity.avatar || AGENT_AVATAR_FALLBACK,
    avatarImage: identity.avatarImage,
  }
}))
</script>

<style scoped>
.collab-typing {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  padding: 0 2px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--ui-text-muted-fg);
  user-select: none;
}

.typing-who {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.typing-avatar {
  margin-right: 2px;
}

.typing-sep {
  margin-right: 2px;
}

.typing-dots {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 3px;
}

/* 2px ink specks. They breathe on opacity only — no scale, no travel, no
   bounce; the row's height never changes. */
.typing-dot {
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.3;
  animation: collab-typing-breath 1.2s ease-in-out infinite;
}

.typing-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes collab-typing-breath {
  0%,
  100% {
    opacity: 0.3;
  }

  50% {
    opacity: 0.8;
  }
}

@media (prefers-reduced-motion: reduce) {
  .typing-dot {
    animation: none;
    opacity: 0.55;
  }
}
</style>
