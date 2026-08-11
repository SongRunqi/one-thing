<template>
  <div
    class="plugin-status-line"
    :class="{ 'is-settled': isSettled }"
    role="status"
  >
    <span class="plugin-status-dot" />
    <span class="plugin-status-label">{{ part.label }}</span>
    <span
      v-if="elapsedLabel"
      class="plugin-status-elapsed"
    >{{ elapsedLabel }}</span>
    <span class="plugin-status-owner">{{ part.pluginId }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * 流内状态的一行(R6 的呈现件;计时是 2026-08-11 加的)。
 *
 * **为什么单独一个组件而不是留在 MessageBubble 里**:走秒需要一个 100ms 的时钟,
 * 而 MessageBubble 是每条消息都挂一个的组件 —— 时钟写在那里等于只要聊天窗开着
 * 就永远有一个 interval 在跑,哪怕一条状态都没有。放在这里,时钟的存活期与
 * "屏幕上真的有一根状态条"逐字相等(useDurationTicker 自己是 refcount 的,
 * 多条状态共用同一个 interval)。
 */
import { computed } from 'vue'
import type { ContentPart } from '@/types'
import { formatToolDuration } from '@/stores/helpers/tool-activity-view'
import { useDurationTicker } from '@/composables/useDurationTicker'

type PluginStatusPart = Extract<ContentPart, { type: 'plugin-status' }>

const props = defineProps<{ part: PluginStatusPart }>()

const now = useDurationTicker()

/** `durationMs` 有值 = 已结算:停止走秒,定格这个总数。 */
const isSettled = computed(() => typeof props.part.durationMs === 'number')

/**
 * 耗时。**渲染侧自算** —— 过线的事件只有起、变、落三条,`startedAt` 在整段期间
 * 是同一个值。没有 startedAt 的状态(插件经 api.status 挂的那种)不显示时间,
 * 而不是显示一个从 0 开始的假计时。
 */
const elapsedLabel = computed(() => {
  if (typeof props.part.durationMs === 'number') {
    return formatToolDuration(Math.max(0, props.part.durationMs))
  }
  if (typeof props.part.startedAt === 'number') {
    return formatToolDuration(Math.max(0, now.value - props.part.startedAt))
  }
  return ''
})
</script>

<style scoped>
/* 插件流状态:一行低调的指示器,不抢正文。 */
.plugin-status-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 2px 0;
  font-size: 12px;
  color: var(--ui-text-muted-fg);
}

.plugin-status-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ui-accent-primary-fg);
  animation: plugin-status-pulse 1.4s ease-in-out infinite;
}

/* 结算之后不再呼吸:一个还在转的圈和一件已经做完的事必须一眼分得开。 */
.plugin-status-line.is-settled .plugin-status-dot {
  animation: none;
  background: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
}

.plugin-status-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 时间是等宽的:走秒时数字宽度一变,后面的归属就会左右抖。 */
.plugin-status-elapsed {
  flex-shrink: 0;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

.plugin-status-owner {
  flex-shrink: 0;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  opacity: 0.7;
}

@keyframes plugin-status-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .plugin-status-dot { animation: none; }
}
</style>
