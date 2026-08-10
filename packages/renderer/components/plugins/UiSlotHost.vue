<template>
  <div
    v-if="visibleSlots.length || failedCount || chipCollapsedDrawers.length"
    class="ui-slot-host"
    :data-anchor="anchor"
    :data-side="side || undefined"
    :data-chip-shell="chipShell || undefined"
    :style="hostStyle"
  >
    <!-- chipShell:块穿 StatusChip 的**静态**壳(无浮层)进 S 状态带。
         换的只有外壳 —— 清单、顺序、容量裁决、失败折叠、重拉时机全部走
         上面同一条路,锚点契约零变化(composer-bands §3.2)。 -->
    <template
      v-for="slot in visibleSlots"
      :key="`${slot.pluginId}:${slot.slotId}`"
    >
      <StatusChip
        v-if="chipShell"
        data-ambient-anchor="status.chip"
      >
        <UiSlotBlock
          :entry="slot"
          :session-id="sessionId ?? null"
          :message-id="messageId ?? null"
          :max-height="maxHeight"
        />
      </StatusChip>
      <!-- 抽屉块(F 期):壳与开合钮**由宿主画**(宪法第 1 条),插件只按
           ctx.drawerState 返回两档的树。展开是原地长高(块内滚动),不是浮层 ——
           不涉 teleport,E 期的浮层判例在这里没有射程。 -->
      <div
        v-else-if="isDrawerEntry(slot)"
        class="ui-slot-drawer"
        :data-drawer-state="drawerStateFor(slot)"
        :data-ambient-anchor="blockAmbientAnchor"
      >
        <div class="ui-slot-drawer-body">
          <UiSlotBlock
            :entry="slot"
            :session-id="sessionId ?? null"
            :message-id="messageId ?? null"
            :drawer-state="drawerRenderStateFor(slot)"
            :max-height="drawerHeightFor(slot)"
          />
        </div>
        <div class="ui-slot-drawer-controls">
          <Tooltip :text="drawerStateFor(slot) === 'expanded' ? `${slot.label} — 收成一行` : `${slot.label} — 展开`">
            <button
              type="button"
              class="ui-slot-drawer-btn"
              :aria-label="drawerStateFor(slot) === 'expanded' ? `${slot.label} — 收成一行` : `${slot.label} — 展开`"
              :aria-expanded="drawerStateFor(slot) === 'expanded' ? 'true' : 'false'"
              @click="toggleDrawer(slot)"
            >
              <ChevronUp
                v-if="drawerStateFor(slot) === 'expanded'"
                :size="13"
                :stroke-width="2"
              />
              <ChevronDown
                v-else
                :size="13"
                :stroke-width="2"
              />
            </button>
          </Tooltip>
          <Tooltip :text="`${slot.label} — 收进状态带`">
            <button
              type="button"
              class="ui-slot-drawer-btn is-mini"
              :aria-label="`${slot.label} — 收进状态带`"
              @click="collapseDrawer(slot)"
            >
              <X
                :size="11"
                :stroke-width="2"
              />
            </button>
          </Tooltip>
        </div>
      </div>
      <UiSlotBlock
        v-else
        :entry="slot"
        :session-id="sessionId ?? null"
        :message-id="messageId ?? null"
        :max-height="maxHeight"
        :data-ambient-anchor="blockAmbientAnchor"
      />
    </template>
    <!-- 全收的抽屉退位到 S 状态带:一枚静态 chip(拼图图标 + manifest label)
         就是它剩下的入口,点一下回到收起前的那一档。档住在 ui-anchor-registry
         (两个挂点读同一份),不在两个组件里各存一份。 -->
    <template v-if="chipShell">
      <StatusChip
        v-for="slot in chipCollapsedDrawers"
        :key="`drawer:${slot.pluginId}:${slot.slotId}`"
        data-ambient-anchor="status.chip"
      >
        <button
          type="button"
          class="ui-slot-drawer-chip"
          :aria-label="`${slot.label} — 展开回输入框上方`"
          @click="restoreDrawer(slot.pluginId, slot.anchor, slot.slotId)"
        >
          <Puzzle
            :size="12"
            :stroke-width="2"
          />
          <span class="ui-slot-drawer-chip-label">{{ slot.label }}</span>
        </button>
      </StatusChip>
    </template>
    <!-- 加载失败的块不占容量,折叠为一个聚合指示(详情在设置页)。
         否则 3 个坏插件能永久占满整条锚点带。 -->
    <Tooltip
      v-if="failedCount"
      :text="failedTitles"
    >
      <span class="ui-slot-failed">
        {{ failedCount }} plugin block{{ failedCount > 1 ? 's' : '' }} not running
      </span>
    </Tooltip>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, ChevronUp, Puzzle, X } from 'lucide-vue-next'
import StatusChip from '@/components/common/StatusChip.vue'
import Tooltip from '@/components/common/Tooltip.vue'
import UiSlotBlock from './UiSlotBlock.vue'
import {
  UI_ANCHOR_CAPACITY_MIRROR,
  computeAnchorOverflow,
  drawerMaxHeight,
  drawerStateOf,
  isDrawerSlot,
  restoreDrawer,
  setDrawerState,
  useCollapsedDrawerSlots,
  useVisibleAnchorUiSlots,
  type PluginContributedUiSlot,
  type UiSlotSide,
} from '@/workspace/ui-anchor-registry'

/**
 * 锚点宿主(R5.x-c):把一个具名锚点上该渲染的插件块画出来。
 *
 * 职责只有装配:块清单来自 ui-anchor-registry(全局规范顺序 + unsupported
 * 过滤都在那里),容量裁决(maxBlocks 截断 / 失败块不占容量 / 全收抽屉不占
 * 容量)在 computeAnchorOverflow;渲染本身每块一个 UiSlotBlock(共享内核)。
 *
 * F 期多出来的一件事:**抽屉壳**。声明了 drawer 的块外面多一层壳 + 两枚
 * 宿主画的钮(⌄/⌃ 展开⇄半收、✕ 全收);全收的块在 chipShell 挂点上退位成
 * 一枚 chip。三态本身住在注册表里,这里只读它、切它。
 */
const props = withDefaults(defineProps<{
  anchor: string
  /** 当前会话;切换时每个块都会重拉(render ctx 的 sessionId 随之变化)。 */
  sessionId?: string | null
  /** 仅消息级锚点(message.footer):该宿主所属的消息 id,透传给每个块。 */
  messageId?: string | null
  /**
   * 每块穿 StatusChip 静态壳(S 状态带用)。**只影响外壳**:块清单、全局
   * 规范顺序、容量裁决、失败折叠一个字节都不变。
   *
   * F 期起它还多一个职责:全收抽屉的 chip 挂在这一支上(S 带是"退了位的
   * 东西还剩一个入口"的归口)。
   */
  chipShell?: boolean
  /**
   * 仅分侧锚点(I 期,composer.aside):这个挂点画的是哪一侧。
   * 清单、容量裁决都按侧走 —— 每侧是一个独立的席位池,不是同一条带的两半。
   */
  side?: UiSlotSide | null
}>(), {
  sessionId: null,
  messageId: null,
  chipShell: false,
  side: null,
})

/**
 * 氛围层地标(L0,ambient-landmarks-2026-08 §5):**输入框一带的块**是可落面。
 * message.footer 的块住在气泡里 —— 气泡区在氛围语义里是"天空"(滚一格全错位),
 * 那是明确的否决项,所以这里按挂点查表而不是一律挂。
 * chip 壳形态的块另有 `status.chip`,不走这一支。
 *
 * I 期两个新锚点(两翼 / 正下方)都贴着输入框、都不随消息列表滚动 ——
 * 与 composer.above 同一片可落面,照规矩加进白名单,插件零改动就有雪。
 */
const AMBIENT_ANCHOR_BY_UI_ANCHOR: Record<string, string> = {
  'composer.above': 'composer.block',
  'composer.aside': 'composer.block',
  'composer.below': 'composer.block',
}

const visibleSlots = useVisibleAnchorUiSlots(props.anchor, props.side ?? undefined)
const blockAmbientAnchor = computed(() =>
  (props.chipShell ? undefined : AMBIENT_ANCHOR_BY_UI_ANCHOR[props.anchor]),
)
const maxHeight = UI_ANCHOR_CAPACITY_MIRROR[props.anchor]?.maxHeight ?? 32
/**
 * 横向预算(I 期):只有容量表给了 `maxWidth` 的锚点才有(今天 = 两翼)。
 * 数字仍然只有**一个**出处 —— 容量表镜像;组件不写第二份 48。
 */
const maxWidth = UI_ANCHOR_CAPACITY_MIRROR[props.anchor]?.maxWidth
const hostStyle = computed(() => (maxWidth ? { maxWidth: `${maxWidth}px` } : undefined))

const overflow = computed(() => computeAnchorOverflow(props.anchor, props.side ?? undefined))
const failedCount = computed(() => overflow.value.failed.length)
const failedTitles = computed(() =>
  overflow.value.failed.map(slot => `${slot.pluginName}: ${slot.label}`).join('\n'),
)

// ── 抽屉三态 ────────────────────────────────

const collapsedDrawers = useCollapsedDrawerSlots()
/** 全收 chip 只画在 chip 壳挂点(S 带)上;别的挂点不越俎代庖。 */
const chipCollapsedDrawers = computed(() => (props.chipShell ? collapsedDrawers.value : []))

function isDrawerEntry(slot: PluginContributedUiSlot): boolean {
  return isDrawerSlot(slot)
}

function drawerStateFor(slot: PluginContributedUiSlot) {
  return drawerStateOf(slot.pluginId, slot.anchor, slot.slotId)
}

/**
 * 过线给块的那一档 —— 只可能是会渲染的两档:全收的块根本不在 visibleSlots 里
 * (它不占容量、不渲染),这里的收敛不是兜底,是把这条不变量写进类型。
 */
function drawerRenderStateFor(slot: PluginContributedUiSlot): 'expanded' | 'peek' {
  return drawerStateFor(slot) === 'expanded' ? 'expanded' : 'peek'
}

function drawerHeightFor(slot: PluginContributedUiSlot): number {
  return drawerMaxHeight(slot.anchor, drawerStateFor(slot))
}

/** ⌄/⌃:展开 ⇄ 半收。全收是另一枚钮 —— 一个控件不表达三态。 */
function toggleDrawer(slot: PluginContributedUiSlot): void {
  const next = drawerStateFor(slot) === 'expanded' ? 'peek' : 'expanded'
  setDrawerState(slot.pluginId, slot.anchor, slot.slotId, next)
}

function collapseDrawer(slot: PluginContributedUiSlot): void {
  setDrawerState(slot.pluginId, slot.anchor, slot.slotId, 'collapsed')
}
</script>

<style scoped>
.ui-slot-host {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

/* chip 壳形态:块并排成一行,块自身不再画自己的高度框。 */
.ui-slot-host[data-chip-shell] {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

/* 块在壳里以壳的高度为准(壳就是锚点容量的 24px),纵向滚动条在一枚 chip
   里没有意义 —— 溢出直接裁掉。`!important` 是压 UiSlotBlock 的内联
   max-height,容量数字本身仍由 UI_ANCHOR_CAPACITY_MIRROR 说了算。 */
.ui-slot-host[data-chip-shell] :deep(.ui-slot-block) {
  max-height: 100% !important;
  overflow: hidden;
  line-height: 1;
}

.ui-slot-failed {
  font-size: 11px;
  color: var(--ui-text-muted-fg);
  white-space: pre-line;
}

/* ── 抽屉壳(F 期) ───────────────────────────
   壳是宿主的:一行的内容区 + 右侧一组开合钮。高度由块的内联 max-height 决定
   (档位数字来自容量表),过渡走时长档位而不是字面量。 */
.ui-slot-drawer {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}

.ui-slot-drawer-body {
  flex: 1;
  min-width: 0;
}

/* 展开档:块内滚动(高度预算 expandedMaxHeight),不把输入框顶走。 */
.ui-slot-drawer-body :deep(.ui-slot-block) {
  transition: max-height var(--duration-normal) var(--ease-default);
}

.ui-slot-drawer[data-drawer-state='expanded'] .ui-slot-drawer-body :deep(.ui-slot-block) {
  overflow-y: auto;
}

.ui-slot-drawer-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.ui-slot-drawer-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ui-text-muted-fg);
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-default),
    background var(--duration-fast) var(--ease-default);
}

.ui-slot-drawer-btn.is-mini {
  width: 15px;
  height: 15px;
}

.ui-slot-drawer-btn:hover {
  background: var(--ui-state-hover-bg);
  color: var(--ui-text-primary-fg);
}

.ui-slot-drawer-btn:focus-visible {
  outline: 1px solid var(--ui-accent-primary-fg);
  outline-offset: 1px;
}

/* 全收后剩下的那枚 chip 的内容:壳(StatusChip)画外形,这里只画"它是可点的"。 */
.ui-slot-drawer-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 160px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1;
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-default);
}

.ui-slot-drawer-chip:hover {
  color: var(--ui-text-primary-fg);
}

.ui-slot-drawer-chip:focus-visible {
  outline: 1px solid var(--ui-accent-primary-fg);
  outline-offset: 2px;
}

.ui-slot-drawer-chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .ui-slot-drawer-body :deep(.ui-slot-block),
  .ui-slot-drawer-btn,
  .ui-slot-drawer-chip {
    transition: none;
  }
}
</style>
