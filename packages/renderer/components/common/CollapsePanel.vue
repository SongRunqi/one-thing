<template>
  <BorderBox
    as="section"
    class="collapse-panel"
    :class="[
      `variant-${resolvedVariant}`,
      `content-${resolvedContentVariant}`,
      `icon-${resolvedExpandIconPosition}`,
      `icon-display-${resolvedExpandIconDisplay}`,
      `status-${status}`,
      {
        'is-expanded': isExpanded,
        'is-disabled': disabled,
        'is-static': !collapsible,
        'is-executing': isExecutingState,
        'is-running': isRunningState,
        'is-streaming': isStreamingState,
        'is-header-hovered': isHeaderHovered,
        'is-title-hovered': isTitleHovered,
        'is-actions-hovered': isActionsHovered,
        'is-icon-hovered': isIconHovered,
      },
    ]"
    :border-color="resolvedPanelBorderColor"
    :background="resolvedPanelBackground"
    :radius="resolvedPanelRadius"
    :width="1"
    padding="none"
  >
    <LayoutGrid
      :id="headerId"
      as="div"
      class="collapse-panel-header"
      role="button"
      :columns="headerGridColumns"
      :column-gap="{ base: 'xs', md: 'sm' }"
      row-gap="xs"
      align-items="center"
      :tabindex="disabled || !collapsible ? -1 : 0"
      :aria-expanded="isExpanded"
      :aria-controls="contentId"
      :aria-disabled="disabled ? true : undefined"
      @click="handleHeaderClick"
      @keydown.enter="handleHeaderKeydown"
      @keydown.space="handleHeaderKeydown"
      @mouseenter="isHeaderHovered = true"
      @mouseleave="isHeaderHovered = false"
    >
      <span
        v-if="collapsible && resolvedExpandIconPosition === 'start'"
        class="collapse-panel-icon"
        :class="{ 'is-expanded': isExpanded }"
        aria-hidden="true"
        @mouseenter="isIconHovered = true"
        @mouseleave="isIconHovered = false"
      >
        <slot
          name="icon"
          :expanded="isExpanded"
          :disabled="disabled"
          :collapsible="collapsible"
          :status="status"
          :running="isRunningState"
          :streaming="isStreamingState"
          :duration="durationText"
          :duration-ms="currentDurationMs"
          :hovered="isIconHovered"
          :header-hovered="isHeaderHovered"
          :title-hovered="isTitleHovered"
          :actions-hovered="isActionsHovered"
        >
          <ChevronDown
            class="collapse-panel-default-icon"
            :size="15"
          />
        </slot>
      </span>

      <Space
        as="div"
        class="collapse-panel-title"
        direction="horizontal"
        size="small"
        align="center"
        @mouseenter="isTitleHovered = true"
        @mouseleave="isTitleHovered = false"
      >
        <div class="collapse-panel-title-main">
          <slot
            name="title"
            :title="title"
            :expanded="isExpanded"
            :disabled="disabled"
            :collapsible="collapsible"
            :status="status"
            :running="isRunningState"
            :streaming="isStreamingState"
            :duration="durationText"
            :duration-ms="currentDurationMs"
            :hovered="isTitleHovered"
            :header-hovered="isHeaderHovered"
            :icon-hovered="isIconHovered"
            :actions-hovered="isActionsHovered"
            :toggle="toggle"
            :set-expanded="setExpanded"
          >
            <span
              v-if="$slots['title-icon']"
              class="collapse-panel-title-icon"
              aria-hidden="true"
            >
              <slot
                name="title-icon"
                :expanded="isExpanded"
                :disabled="disabled"
                :collapsible="collapsible"
                :status="status"
                :running="isRunningState"
                :streaming="isStreamingState"
                :duration="durationText"
                :duration-ms="currentDurationMs"
                :hovered="isTitleHovered"
                :header-hovered="isHeaderHovered"
                :icon-hovered="isIconHovered"
                :actions-hovered="isActionsHovered"
              />
            </span>
            <span class="collapse-panel-title-text">{{ title }}</span>
          </slot>
        </div>
        <span
          v-if="durationText"
          class="collapse-panel-duration"
        >{{ durationText }}</span>

        <span
          v-if="collapsible && resolvedExpandIconPosition === 'inline-end'"
          class="collapse-panel-icon"
          :class="{ 'is-expanded': isExpanded }"
          aria-hidden="true"
          @mouseenter="isIconHovered = true"
          @mouseleave="isIconHovered = false"
        >
          <slot
            name="icon"
            :expanded="isExpanded"
            :disabled="disabled"
            :collapsible="collapsible"
            :status="status"
            :running="isRunningState"
            :streaming="isStreamingState"
            :duration="durationText"
            :duration-ms="currentDurationMs"
            :hovered="isIconHovered"
            :header-hovered="isHeaderHovered"
            :title-hovered="isTitleHovered"
            :actions-hovered="isActionsHovered"
          >
            <ChevronDown
              class="collapse-panel-default-icon"
              :size="15"
            />
          </slot>
        </span>
      </Space>

      <Space
        v-if="$slots.actions"
        as="div"
        class="collapse-panel-actions"
        direction="horizontal"
        size="xs"
        align="center"
        data-collapse-panel-ignore-toggle
        @mouseenter="isActionsHovered = true"
        @mouseleave="isActionsHovered = false"
      >
        <slot
          name="actions"
          :expanded="isExpanded"
          :disabled="disabled"
          :collapsible="collapsible"
          :status="status"
          :running="isRunningState"
          :streaming="isStreamingState"
          :duration="durationText"
          :duration-ms="currentDurationMs"
          :hovered="isActionsHovered"
          :header-hovered="isHeaderHovered"
          :title-hovered="isTitleHovered"
          :icon-hovered="isIconHovered"
          :toggle="toggle"
          :set-expanded="setExpanded"
        />
      </Space>

      <span
        v-if="collapsible && resolvedExpandIconPosition === 'end'"
        class="collapse-panel-icon"
        :class="{ 'is-expanded': isExpanded }"
        aria-hidden="true"
        @mouseenter="isIconHovered = true"
        @mouseleave="isIconHovered = false"
      >
        <slot
          name="icon"
          :expanded="isExpanded"
          :disabled="disabled"
          :collapsible="collapsible"
          :status="status"
          :running="isRunningState"
          :streaming="isStreamingState"
          :duration="durationText"
          :duration-ms="currentDurationMs"
          :hovered="isIconHovered"
          :header-hovered="isHeaderHovered"
          :title-hovered="isTitleHovered"
          :actions-hovered="isActionsHovered"
        >
          <ChevronDown
            class="collapse-panel-default-icon"
            :size="15"
          />
        </slot>
      </span>
    </LayoutGrid>

    <Transition
      name="collapse-panel-body"
      @before-enter="setCollapseTransitionHeight"
      @enter="setCollapseTransitionHeight"
      @before-leave="setCollapseTransitionHeight"
      @leave="setCollapseTransitionHeight"
      @after-enter="clearCollapseTransitionHeight"
      @after-leave="clearCollapseTransitionHeight"
      @enter-cancelled="clearCollapseTransitionHeight"
      @leave-cancelled="clearCollapseTransitionHeight"
    >
      <div
        v-if="shouldRenderContent"
        v-show="isExpanded"
        class="collapse-panel-content-shell"
      >
        <div
          v-bind="contentAttrs"
          :id="contentId"
          class="collapse-panel-content"
          :class="[
            contentClass,
            { 'is-streaming-content': isStreamingState },
          ]"
          role="region"
          :aria-labelledby="headerId"
          :aria-live="isStreamingState ? 'polite' : undefined"
          :aria-busy="isStreamingState ? true : undefined"
        >
          <slot
            :expanded="isExpanded"
            :collapsible="collapsible"
            :status="status"
            :running="isRunningState"
            :streaming="isStreamingState"
            :duration="durationText"
            :duration-ms="currentDurationMs"
            :header-hovered="isHeaderHovered"
            :title-hovered="isTitleHovered"
            :actions-hovered="isActionsHovered"
            :icon-hovered="isIconHovered"
            :toggle="toggle"
            :set-expanded="setExpanded"
          >
            <template v-if="hasBuiltInContent">
              <div
                v-if="contentMetaText"
                ref="contentMetaRef"
                class="collapse-panel-content-meta"
              >
                {{ contentMetaText }}
                <!-- detached trigger:这行是被截断的元信息条,套 wrapper 会在
                     内容区里多出一个 inline-flex 盒子。trigger-el 模式下
                     Tooltip 自身 display:none。 -->
                <Tooltip
                  :trigger-el="contentMetaRef"
                  :text="contentMetaText"
                />
              </div>

              <pre
                v-if="contentKind === 'code'"
                class="collapse-panel-code-block"
                :class="{ wrap: wrapContent }"
                data-collapse-panel-code
              ><code :data-language="language || undefined">{{ normalizedContent }}</code></pre>

              <pre
                v-else
                class="collapse-panel-text-block"
                :class="{ wrap: wrapContent }"
                data-collapse-panel-text
              >{{ normalizedContent }}</pre>
            </template>
          </slot>
        </div>
      </div>
    </Transition>
  </BorderBox>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, inject, onBeforeMount, onUnmounted, ref, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import BorderBox from './BorderBox.vue'
import LayoutGrid from './LayoutGrid.vue'
import Space from './Space.vue'
import Tooltip from './Tooltip.vue'
import type { BorderRadius } from './border'
import {
  collapseGroupKey,
  type CollapsePanelContentKind,
  type CollapsePanelContentVariant,
  type CollapsePanelStatus,
  type ExpandIconDisplay,
  type CollapsePanelKey,
  type CollapsePanelVariant,
  type ExpandIconPosition,
} from './collapse'

const props = withDefaults(defineProps<{
  name?: CollapsePanelKey
  title?: string
  modelValue?: boolean
  autoExpanded?: boolean
  defaultCollapsed?: boolean
  defaultExpandedWhenKeys?: CollapsePanelKey[]
  disabled?: boolean
  collapsible?: boolean
  eager?: boolean
  status?: CollapsePanelStatus
  streaming?: boolean
  startedAt?: number | Date
  endedAt?: number | Date
  durationMs?: number
  showDuration?: boolean
  content?: string
  contentKind?: CollapsePanelContentKind
  contentVariant?: CollapsePanelContentVariant
  contentClass?: unknown
  contentAttrs?: Record<string, unknown>
  language?: string
  filePath?: string
  wrapContent?: boolean
  variant?: CollapsePanelVariant
  expandIconPosition?: ExpandIconPosition
  expandIconDisplay?: ExpandIconDisplay
}>(), {
  name: undefined,
  title: '',
  modelValue: undefined,
  autoExpanded: undefined,
  defaultCollapsed: false,
  defaultExpandedWhenKeys: () => [],
  disabled: false,
  collapsible: true,
  eager: false,
  status: 'idle',
  streaming: false,
  startedAt: undefined,
  endedAt: undefined,
  durationMs: undefined,
  showDuration: false,
  content: undefined,
  contentKind: 'text',
  contentVariant: undefined,
  contentClass: undefined,
  contentAttrs: () => ({}),
  language: '',
  filePath: '',
  wrapContent: false,
  variant: undefined,
  expandIconPosition: undefined,
  expandIconDisplay: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [expanded: boolean]
  change: [expanded: boolean]
}>()

const instance = getCurrentInstance()
const localKey = `collapse-panel-${instance?.uid ?? Math.random().toString(36).slice(2)}`
const group = inject(collapseGroupKey, null)
const internalExpanded = ref(props.modelValue ?? !props.defaultCollapsed)
const isHeaderHovered = ref(false)
const isTitleHovered = ref(false)
const isActionsHovered = ref(false)
const isIconHovered = ref(false)
const userControlledExpansion = ref(false)
const durationNow = ref(Date.now())
const contentMetaRef = ref<HTMLElement | null>(null)
const isControlled = computed(() => props.modelValue !== undefined)
const panelKey = computed<CollapsePanelKey>(() => props.name ?? localKey)
const fallbackExpanded = computed(() => props.modelValue ?? !props.defaultCollapsed)
const registrationDefaultExpanded = computed(() =>
  fallbackExpanded.value || (group?.hasExpanded(props.defaultExpandedWhenKeys) ?? false)
)
const headerId = computed(() => `${String(panelKey.value)}-header`)
const contentId = computed(() => `${String(panelKey.value)}-content`)

const resolvedVariant = computed<CollapsePanelVariant>(() =>
  props.variant ?? group?.variant ?? 'outlined'
)
const resolvedContentVariant = computed<CollapsePanelContentVariant>(() =>
  props.contentVariant ?? group?.contentVariant ?? (resolvedVariant.value === 'plain' ? 'plain' : 'panel')
)
const resolvedExpandIconPosition = computed<ExpandIconPosition>(() =>
  props.expandIconPosition ?? group?.expandIconPosition ?? 'end'
)
const resolvedExpandIconDisplay = computed<ExpandIconDisplay>(() =>
  props.expandIconDisplay ?? group?.expandIconDisplay ?? 'always'
)
const headerGridColumns = computed(() => {
  if (resolvedExpandIconPosition.value === 'start') {
    return 'auto minmax(0, 1fr) auto'
  }
  if (resolvedExpandIconPosition.value === 'inline-end') {
    return 'minmax(0, 1fr) auto'
  }
  return 'minmax(0, 1fr) auto auto'
})
const resolvedPanelBorderColor = computed(() =>
  resolvedVariant.value === 'outlined'
    ? 'var(--collapse-panel-border-soft)'
    : 'transparent'
)
const resolvedPanelBackground = computed(() =>
  resolvedVariant.value === 'outlined'
    ? 'var(--collapse-panel-bg)'
    : 'transparent'
)
const resolvedPanelRadius = computed<BorderRadius>(() =>
  resolvedVariant.value === 'outlined' ? 'sm' : 'none'
)

const isExpanded = computed(() => {
  if (isControlled.value) return props.modelValue === true
  if (group) return group.isExpanded(panelKey.value, fallbackExpanded.value)
  return internalExpanded.value
})

const isExecutingState = computed(() => props.status === 'executing')
const isStreamingState = computed(() => props.streaming || props.status === 'streaming')
const isRunningState = computed(() =>
  props.status === 'executing' ||
  props.status === 'streaming' ||
  isStreamingState.value
)
const shouldRenderContent = computed(() => props.eager || isStreamingState.value || isExpanded.value)
const currentDurationMs = computed(() => resolveDurationMs())
const normalizedContent = computed(() => props.content ?? '')
const hasBuiltInContent = computed(() => props.content !== undefined)
const contentMetaText = computed(() => {
  const parts = [props.filePath, props.language].filter(Boolean)
  return parts.join(' · ')
})
const durationText = computed(() => {
  if (!props.showDuration) return ''
  const duration = currentDurationMs.value
  return duration === null ? '' : formatDuration(duration)
})
const shouldTickDuration = computed(() =>
  props.showDuration &&
  isRunningState.value &&
  props.durationMs === undefined &&
  toTimestampMs(props.startedAt) !== null
)

let durationTimer: ReturnType<typeof setInterval> | null = null

onBeforeMount(() => {
  group?.registerPanel(panelKey.value, registrationDefaultExpanded.value)
})

onUnmounted(() => {
  group?.unregisterPanel(panelKey.value)
  stopDurationTimer()
})

watch(shouldTickDuration, (shouldTick) => {
  if (shouldTick) {
    startDurationTimer()
  } else {
    stopDurationTimer()
  }
}, { immediate: true })

watch(() => props.modelValue, (value) => {
  if (value === undefined || group) return
  internalExpanded.value = value
})

watch(() => props.autoExpanded, (value) => {
  if (value === undefined || isControlled.value || userControlledExpansion.value) return
  applyExpanded(value, false)
}, { immediate: true })

watch(() => props.name, (value, previous) => {
  userControlledExpansion.value = false
  if (!group) return
  group.unregisterPanel(previous ?? localKey)
  group.registerPanel(value ?? localKey, registrationDefaultExpanded.value)
})

function applyExpanded(expanded: boolean, emitEvents: boolean) {
  if (isControlled.value) {
    if (emitEvents) {
      emit('update:modelValue', expanded)
      emit('change', expanded)
    }
    return
  }

  if (group) {
    group.setExpanded(panelKey.value, expanded)
  } else {
    internalExpanded.value = expanded
  }

  if (emitEvents) {
    emit('update:modelValue', expanded)
    emit('change', expanded)
  }
}

function setExpanded(expanded: boolean) {
  if (props.disabled || !props.collapsible) return

  userControlledExpansion.value = true
  applyExpanded(expanded, true)
}

function toggle() {
  setExpanded(!isExpanded.value)
}

function handleHeaderClick(event: MouseEvent) {
  if (props.disabled || !props.collapsible || shouldIgnoreToggle(event)) return
  toggle()
}

function handleHeaderKeydown(event: KeyboardEvent) {
  if (props.disabled || !props.collapsible || event.target !== event.currentTarget) return
  event.preventDefault()
  toggle()
}

function shouldIgnoreToggle(event: MouseEvent): boolean {
  const target = event.target as HTMLElement | null
  const currentTarget = event.currentTarget as HTMLElement | null
  if (!target || !currentTarget || target === currentTarget) return false

  const ignoredElement = target.closest(
    'a,button,input,select,textarea,label,summary,[role="button"],[role="link"],[contenteditable="true"],[data-collapse-panel-ignore-toggle]'
  )

  return Boolean(ignoredElement && ignoredElement !== currentTarget && currentTarget.contains(ignoredElement))
}

function startDurationTimer() {
  durationNow.value = Date.now()
  if (durationTimer) return
  durationTimer = setInterval(() => {
    durationNow.value = Date.now()
  }, 1000)
}

function stopDurationTimer() {
  if (!durationTimer) return
  clearInterval(durationTimer)
  durationTimer = null
}

function resolveDurationMs(): number | null {
  if (typeof props.durationMs === 'number' && Number.isFinite(props.durationMs)) {
    return Math.max(0, props.durationMs)
  }

  const startedAt = toTimestampMs(props.startedAt)
  if (startedAt === null) return null

  const endedAt = toTimestampMs(props.endedAt)
  const end = endedAt ?? durationNow.value
  return Math.max(0, end - startedAt)
}

function toTimestampMs(value?: number | Date): number | null {
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? time : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  return null
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
}

function setCollapseTransitionHeight(element: Element) {
  const panel = element as HTMLElement
  const content = panel.firstElementChild instanceof HTMLElement
    ? panel.firstElementChild
    : null
  const measuredHeight = Math.max(
    0,
    panel.scrollHeight,
    content?.getBoundingClientRect().height ?? 0,
  )
  panel.style.setProperty('--collapse-panel-transition-height', `${measuredHeight.toFixed(2)}px`)
}

function clearCollapseTransitionHeight(element: Element) {
  const panel = element as HTMLElement
  panel.style.removeProperty('--collapse-panel-transition-height')
}
</script>

<style scoped>
.collapse-panel {
  --collapse-panel-border: var(--ui-border-default-border);
  --collapse-panel-border-soft: color-mix(in srgb, var(--collapse-panel-border) 58%, transparent);
  --collapse-panel-bg: var(--ui-surface-panel-bg);
  --collapse-panel-hover-bg: color-mix(in srgb, var(--ui-state-hover-bg) 70%, transparent);
  --collapse-panel-title-fg: var(--ui-text-primary-fg);
  --collapse-panel-muted-fg: var(--ui-text-muted-fg);

  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  color: var(--collapse-panel-title-fg);
}

.collapse-panel-header {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 38px;
  padding: 8px 10px;
  overflow: hidden;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: background-color var(--duration-fast) var(--ease-default), color var(--duration-fast) var(--ease-default);
}

.collapse-panel.variant-plain > .collapse-panel-header {
  min-height: 24px;
  padding: 0;
}

.collapse-panel-header:hover {
  background: var(--collapse-panel-hover-bg);
}

.collapse-panel.variant-plain > .collapse-panel-header:hover {
  background: transparent;
}

.collapse-panel-header:focus-visible {
  outline: none;
}

.collapse-panel-header:focus-visible {
  outline: 1.5px solid var(--ui-accent-primary-fg);
  outline-offset: -2px;
}

.collapse-panel.icon-display-hover:not(.is-expanded):not(.is-header-hovered) > .collapse-panel-header .collapse-panel-icon {
  opacity: 0;
}

.collapse-panel.icon-display-hover > .collapse-panel-header .collapse-panel-icon {
  transition: opacity var(--duration-fast) var(--ease-default), color var(--duration-fast) var(--ease-default);
}

.collapse-panel.icon-display-hover > .collapse-panel-header:focus-within .collapse-panel-icon {
  opacity: 1;
}

.collapse-panel-title {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  justify-self: stretch;
}

.collapse-panel-title :deep(.app-space__item) {
  min-width: 0;
  max-width: 100%;
}

.collapse-panel-title :deep(.app-space__item:first-child) {
  flex: 1 1 auto;
}

.collapse-panel.icon-inline-end .collapse-panel-title {
  justify-self: start;
}

.collapse-panel.icon-inline-end .collapse-panel-title :deep(.app-space__item:first-child) {
  flex: 0 1 auto;
}

.collapse-panel-title-main {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.collapse-panel.icon-inline-end .collapse-panel-title-main {
  flex: 0 1 auto;
}

.collapse-panel-title-main :slotted(*) {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.collapse-panel-title-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--collapse-panel-muted-fg);
}

.collapse-panel.is-title-hovered .collapse-panel-title-icon {
  color: var(--collapse-panel-title-fg);
}

.collapse-panel-title-text {
  min-width: 0;
  overflow: hidden;
  color: var(--collapse-panel-title-fg);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collapse-panel.is-running .collapse-panel-title-text {
  background:
    linear-gradient(
      90deg,
      var(--collapse-panel-title-fg) 0%,
      var(--collapse-panel-title-fg) 28%,
      var(--ui-accent-primary-fg) 50%,
      var(--collapse-panel-title-fg) 72%,
      var(--collapse-panel-title-fg) 100%
    );
  background-size: 220% 100%;
  color: transparent;
  -webkit-background-clip: text;
  background-clip: text;
  animation: collapse-panel-title-flow 1.35s linear infinite;
}

.collapse-panel-duration {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  min-height: 18px;
  color: var(--collapse-panel-muted-fg);
  font-family: var(--font-mono, monospace);
  font-size: 10.5px;
  font-weight: 550;
  line-height: 1.2;
  white-space: nowrap;
}

.collapse-panel-actions {
  min-width: 0;
  max-width: 45%;
  justify-self: end;
}

.collapse-panel-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: var(--collapse-panel-muted-fg);
  opacity: 1;
}

.collapse-panel-default-icon {
  transform: rotate(-90deg);
  transition: transform var(--duration-normal) var(--ease-default), color var(--duration-fast) var(--ease-default);
}

.collapse-panel-icon.is-expanded .collapse-panel-default-icon {
  transform: rotate(0deg);
}

.collapse-panel-header:hover .collapse-panel-icon .collapse-panel-default-icon {
  color: var(--collapse-panel-title-fg);
}

.collapse-panel-content-shell {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  transform-origin: top;
}

.collapse-panel-content {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 0;
  box-sizing: border-box;
  padding: 10px;
  /* overscroll-behavior 不能和 overflow: hidden 同时出现：Chrome 会把这个自己
     滚不动的盒子也当成 scroll container，滚轮既滚不动它、也不再往外层链——
     面板里的 think 正文、markdown 表格、工具结果区就全成了滚轮死区。
     （实测：hidden+contain 外层滚动量 0，hidden+auto 恢复正常。） */
  overflow: hidden;
  border-top: 1px solid var(--collapse-panel-border-soft);
}

.collapse-panel.content-plain > .collapse-panel-content-shell > .collapse-panel-content {
  padding: 0;
  border-top-color: transparent;
}

.collapse-panel.content-panel > .collapse-panel-content-shell > .collapse-panel-content {
  padding: 10px;
  border-top-color: var(--collapse-panel-border-soft);
}

.collapse-panel.variant-plain.content-panel > .collapse-panel-content-shell > .collapse-panel-content {
  border: 1px solid var(--collapse-panel-border-soft);
  border-radius: 6px;
  background: var(--collapse-panel-bg);
}

.collapse-panel-content :slotted(*) {
  min-width: 0;
  box-sizing: border-box;
}

.collapse-panel-content.is-streaming-content {
  border-top-color: color-mix(in srgb, var(--ui-accent-primary-fg) 18%, var(--collapse-panel-border-soft));
}

.collapse-panel-content-meta {
  min-width: 0;
  margin: 0 0 8px;
  overflow: hidden;
  color: var(--collapse-panel-muted-fg);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collapse-panel-code-block,
.collapse-panel-text-block {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  margin: 0;
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--collapse-panel-border) 48%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-state-hover-bg) 70%, transparent);
  color: var(--ui-text-primary-fg);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  line-height: 1.55;
}

.collapse-panel-code-block,
.collapse-panel-text-block {
  max-height: min(360px, 42vh);
  padding: 10px 12px;
  white-space: pre;
  tab-size: 2;
}

.collapse-panel-code-block.wrap,
.collapse-panel-text-block.wrap {
  overflow-x: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.collapse-panel-code-block code {
  font: inherit;
}

.collapse-panel-code-block code[data-language]::before {
  content: attr(data-language);
  display: block;
  margin: 0 0 7px;
  color: var(--collapse-panel-muted-fg);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 650;
  line-height: 1;
  text-transform: uppercase;
}

.collapse-panel.is-disabled {
  opacity: 0.62;
}

.collapse-panel.is-disabled .collapse-panel-header {
  cursor: default;
}

.collapse-panel.is-static .collapse-panel-header {
  cursor: default;
}

.collapse-panel-body-enter-active,
.collapse-panel-body-leave-active {
  transition:
    max-height var(--duration-normal) var(--ease-out),
    opacity var(--duration-fast) var(--ease-default);
  will-change: max-height, opacity;
}

/* 同上：展开/收起动画期间也不能加 overscroll-behavior，否则这 180ms 里滚轮同样被吞。 */
.collapse-panel-body-enter-active > .collapse-panel-content,
.collapse-panel-body-leave-active > .collapse-panel-content {
  overflow: hidden;
  pointer-events: none;
}

.collapse-panel-body-enter-from,
.collapse-panel-body-leave-to {
  max-height: 0;
  opacity: 0;
}

.collapse-panel-body-enter-to,
.collapse-panel-body-leave-from {
  max-height: var(--collapse-panel-transition-height, 1200px);
  opacity: 1;
}

@keyframes collapse-panel-title-flow {
  from {
    background-position: 120% 0;
  }

  to {
    background-position: -120% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .collapse-panel-header,
  .collapse-panel-default-icon,
  .collapse-panel-title-text,
  .collapse-panel-body-enter-active,
  .collapse-panel-body-leave-active {
    transition: none;
    animation: none;
  }

  .collapse-panel.is-running .collapse-panel-title-text {
    color: var(--ui-accent-primary-fg);
  }
}
</style>
