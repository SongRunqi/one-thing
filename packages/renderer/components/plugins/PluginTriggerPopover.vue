<template>
  <!-- 浮层一律 teleport(Popover 内核自带),且**与入口永不嵌套** ——
       入口是 <button>/菜单项,内容住在 body 上的浮层里。工具条与菜单都是
       overflow 裁剪语境,画在原地必然被切。 -->
  <Popover
    :open="!!entry"
    :anchor="anchorEl"
    :placement="placement"
    :offset="6"
    :z-offset="26"
    :surface="false"
    transition="none"
    :close-on="TRIGGER_CLOSE_ON"
    :aria-label="entry?.label"
    @update:open="onOpenChange"
  >
    <div
      v-if="entry"
      class="plugin-trigger-panel"
    >
      <div class="plugin-trigger-head">
        <span class="plugin-trigger-title">{{ entry.label }}</span>
        <span class="plugin-trigger-owner">{{ entry.pluginName }}</span>
      </div>
      <!-- 内容 = 共享内核(UiSlotBlock → usePluginUiBlock):四态壳
           (loading / error / degraded / tree)、latest-wins、请求通道、
           refresh 合流全部继承,一个字节都不重写。**UI 不执行插件代码**。
           key 挂在块上:换一个入口 = 换一棵树,必须重挂而不是复用实例。 -->
      <UiSlotBlock
        :key="`${entry.pluginId}:${entry.slotId}`"
        class="plugin-trigger-body"
        :entry="entry"
        :session-id="sessionId ?? null"
        :message-id="messageId ?? null"
        :max-height="maxHeight"
        @state="onBlockState"
      />
    </div>
  </Popover>
</template>

<script setup lang="ts">
/**
 * 触发式锚点的共享弹层壳(D 期,§9.3 第 3 条)。
 *
 * 它自己不认识"菜单项"还是"图标钮" —— 入口由挂点画,这里只负责:
 *  1. 锚定到入口元素并 teleport 到 body(定位/翻转/钳制/Esc/外点关闭全部
 *     来自既有浮层内核 `composables/floating`,不自造定位器);
 *  2. 打开即 render、关闭即销毁 —— Popover 的内容只在 open 时存在,
 *     UiSlotBlock 随之挂载/卸载,没有常驻实例;
 *  3. 把块的降级态向上报一声,好让挂点把入口**置灰而不是抹掉**。
 */
import Popover from '@/components/common/Popover.vue'
import UiSlotBlock from './UiSlotBlock.vue'
import type { PluginContributedUiSlot } from '@/workspace/ui-anchor-registry'
import type { FloatingPlacement } from '@/composables/floating/compute-position'

withDefaults(defineProps<{
  /** 当前打开的条目;null = 关着(内容随之销毁)。 */
  entry: PluginContributedUiSlot | null
  /** 弹层锚定的宿主元素(入口本身,或菜单入口所属的那枚按钮)。 */
  anchorEl: HTMLElement | null
  sessionId?: string | null
  /** 仅消息级锚点(message.actions):随 render payload 过线。 */
  messageId?: string | null
  /** 锚点容量给的弹层内容最大高度。 */
  maxHeight?: number
  placement?: FloatingPlacement
}>(), {
  sessionId: null,
  messageId: null,
  maxHeight: 320,
  placement: 'bottom-end',
})

const emit = defineEmits<{
  /** 内核自己关掉时(Esc / 外点)回帖 —— 挂点是开合状态的唯一门。 */
  close: []
  /** 块的四态汇报;挂点只消费 degraded(入口置灰)。 */
  state: [{ degraded: boolean; error: boolean }]
}>()

/** 冻结:每次渲染新对象会让内核的 closeOn getter 白跑一趟。
 *  scroll 特意关着 —— 弹层里可能是一张表,滚动读它是正常动作。 */
const TRIGGER_CLOSE_ON = { esc: true, outside: true } as const

function onOpenChange(open: boolean): void {
  if (!open) emit('close')
}

function onBlockState(state: { degraded: boolean; error: boolean }): void {
  emit('state', state)
}
</script>

<style scoped>
/* 弹层自带面(Popover 传了 :surface="false"),与 more-menu 同一套配方:
   浮层底 + 强边 + 浮层投影 token。 */
.plugin-trigger-panel {
  width: 280px;
  max-width: 320px;
  padding: 8px 10px;
  /* 菜单面而不是 floating 面:它常从 ⋯ 菜单点出来,与菜单同族才不打架
     (真机夜间实锤 floating 亮一档;与 StatusChip 浮层同一拍板)。 */
  background: var(--ui-surface-menu-bg, var(--ui-surface-elevated-bg));
  border: 1px solid var(--ui-border-strong-border);
  border-radius: 10px;
  box-shadow: var(--shadow-floating);
}

.plugin-trigger-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.plugin-trigger-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text-primary-fg);
}

.plugin-trigger-owner {
  font-size: 11px;
  color: var(--ui-text-muted-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-trigger-body {
  font-size: 12px;
}
</style>
