<template>
  <div class="plugin-panel-host">
    <!-- 方案 A(设计文档 §6):插件只在 Electron 桌面宿主执行。
         web 端不渲染假面板 —— 显示"仅桌面可用",而不是一棵空树。 -->
    <SettingsEmptyState
      v-if="!isDesktop"
      title="Available on desktop only"
      :description="`${panel.pluginName} runs on the desktop app. This server mirrors the plugin catalog read-only.`"
    />

    <!-- 入口渲染自 manifest,不需要插件跑起来 —— 于是加载失败时入口还在,
         并且能把失败这件事说出来,而不是变成一个点不开的死条目。 -->
    <SettingsEmptyState
      v-else-if="!panel.loaded"
      :title="`${panel.pluginName} is not running`"
      description="The plugin is enabled but failed to load. Check Settings › Plugins for the reason."
    />

    <div
      v-else-if="loading && !tree"
      class="plugin-panel-loading"
    >
      <div class="spinner" />
      <span>Loading…</span>
    </div>

    <!-- 软隔离的呈现面:render 超时/抛错时面板显示错误态,外壳不崩。
         连败达阈之后(R7)错误里会带上"这个面板已被降级"的说明 —— 但插件的
         工具/命令/提示词仍在工作,所以这里说的是**面板**不可用,不是插件坏了。 -->
    <ErrorNote
      v-else-if="error"
      variant="block"
      :message="error"
    >
      <template #actions>
        <Button
          unstyled
          class="panel-retry"
          @click="render()"
        >
          Retry
        </Button>
      </template>
    </ErrorNote>

    <div
      v-else-if="tree"
      class="plugin-panel-body"
    >
      <PluginPanelNode
        :node="tree.body"
        @action="invoke"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onErrorCaptured, onMounted, ref, watch } from 'vue'
import Button from '@/components/common/Button.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import { SettingsEmptyState } from '@/components/settings/settings-primitives'
import PluginPanelNode from './PluginPanelNode.vue'
import { platformApi } from '@/platform'
import { toast } from '@/composables/useToast'
import type { PluginPanelTreeData, PluginWorkspacePanel } from '@/workspace/plugin-panel-types'

const props = defineProps<{ panel: PluginWorkspacePanel }>()

const tree = ref<PluginPanelTreeData | null>(null)
const error = ref('')
const loading = ref(false)

const isDesktop = platformApi.environment !== 'web'

/**
 * latest-wins 的判据。
 *
 * 请求通道不保证按发出顺序返回:两次 render 并发时,先发的那次后到就会用一棵
 * 旧树盖掉新树,而且看不出哪里错了。每次发请求领一个号,只有最后领号的那次
 * 有资格写 tree/error。
 */
let renderToken = 0

/** trailing debounce 的定时器(通知触发的重拉合流到一次)。 */
let refreshTimer: ReturnType<typeof setTimeout> | undefined

/** 插件连打 refresh 时的合流窗口 —— main 侧已去重一层,这里兜住剩下的。 */
const REFRESH_DEBOUNCE_MS = 150

/**
 * render / action 都走 R2 的统一请求通道。
 *
 * 于是它们**免费**拿到 30s 预算、abort、以及 `request:<action>` 的熔断账 ——
 * 这里刻意不另起一套超时:两套超时语义迟早会打架。
 */
async function render(): Promise<void> {
  if (!isDesktop || !props.panel.loaded) return
  const token = ++renderToken
  loading.value = true
  error.value = ''
  try {
    const result = await platformApi.pluginRequest({
      pluginId: props.panel.pluginId,
      action: `panel:render:${props.panel.panelId}`,
    })
    // 期间又发过一次(或已经切走了):这次的结果作废。
    if (token !== renderToken) return
    if (result?.success) {
      tree.value = result.result as PluginPanelTreeData
    } else {
      error.value = result?.error || 'The plugin could not render this panel.'
    }
  } catch (e: any) {
    if (token !== renderToken) return
    error.value = e?.message || 'The plugin could not render this panel.'
  } finally {
    if (token === renderToken) loading.value = false
  }
}

/** 合流后的重拉 —— 通知触发的刷新都走它,不直接调 render。 */
function scheduleRender(): void {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => { void render() }, REFRESH_DEBOUNCE_MS)
}

async function invoke(input: { actionId: string; payload?: unknown }): Promise<void> {
  try {
    const result = await platformApi.pluginRequest({
      pluginId: props.panel.pluginId,
      action: `panel:action:${props.panel.panelId}`,
      payload: input,
    })
    if (!result?.success) {
      toast.error(result?.error || 'The plugin could not handle that action.')
      return
    }
    const outcome = (result.result ?? {}) as { refresh?: boolean; tree?: PluginPanelTreeData; notice?: string }
    if (outcome.notice) toast.info(outcome.notice)
    // 插件可以直接给新树(省一次往返),也可以只说"重拉一次"。
    // 直接给树也要领号,否则一次在飞的 render 回来会把它盖掉。
    if (outcome.tree) {
      renderToken += 1
      tree.value = outcome.tree
      error.value = ''
    } else if (outcome.refresh) {
      // 用户刚点了按钮,这一次不 debounce —— 等 150ms 会显得没反应。
      await render()
    }
  } catch (e: any) {
    toast.error(e?.message || 'The plugin could not handle that action.')
  }
}

/**
 * 插件主动刷新:走既有的 plugin:notification 轨(kind = 'panel-refresh')。
 * 不另开一条投递轨 —— §5.2 第 4 条的落地。
 */
let unsubscribe: (() => void) | undefined

onMounted(() => {
  void render()
  unsubscribe = platformApi.onPluginNotification?.((payload: any) => {
    if (payload?.kind !== 'panel-refresh') return
    if (payload.pluginId !== props.panel.pluginId) return
    if (payload.panelId && payload.panelId !== props.panel.panelId) return
    scheduleRender()
  })
})

onBeforeUnmount(() => {
  unsubscribe?.()
  clearTimeout(refreshTimer)
})

/**
 * 渲染期的错误边界。
 *
 * 描述树已经过了通道守卫,但守卫管的是**形状**;一棵形状合法的树照样可能让某个
 * 宿主原语在渲染中抛(比如 markdown 里的病态输入)。没有边界的话,那一抛会顺着
 * 组件树往上炸掉整个工作区 —— 软隔离在 UI 侧就漏了一个口子。
 */
onErrorCaptured((e: unknown) => {
  error.value = e instanceof Error ? e.message : 'This panel could not be rendered.'
  tree.value = null
  return false
})

// 切到另一个插件面板时重新拉一次。
watch(() => `${props.panel.pluginId}:${props.panel.panelId}`, () => {
  tree.value = null
  error.value = ''
  void render()
})
</script>

<style scoped>
.plugin-panel-host {
  min-width: 0;
  padding: 16px 18px;
  overflow: auto;
  height: 100%;
}

.plugin-panel-body {
  min-width: 0;
}

.plugin-panel-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 28px 16px;
  color: var(--ui-text-muted-fg);
  font-size: 13px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid color-mix(in srgb, var(--ui-text-muted-fg) 30%, transparent);
  border-top-color: var(--ui-accent-primary-fg);
  border-radius: 50%;
  animation: plugin-panel-spin 0.6s linear infinite;
}

@keyframes plugin-panel-spin {
  to { transform: rotate(360deg); }
}

.panel-retry {
  display: inline-flex;
  align-items: center;
  margin-top: 8px;
  padding: 3px 10px;
  border: 1px solid var(--ui-border-default-border);
  border-radius: 0;
  background: transparent;
  color: var(--ui-text-secondary-fg, var(--ui-text-primary-fg));
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  cursor: pointer;
}
</style>
