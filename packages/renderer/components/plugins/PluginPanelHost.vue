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

    <!-- 软隔离的呈现面:render 超时/抛错时面板显示错误态,外壳不崩。 -->
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
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
 * render / action 都走 R2 的统一请求通道。
 *
 * 于是它们**免费**拿到 30s 预算、abort、以及 `request:<action>` 的熔断账 ——
 * 这里刻意不另起一套超时:两套超时语义迟早会打架。
 */
async function render(): Promise<void> {
  if (!isDesktop || !props.panel.loaded) return
  loading.value = true
  error.value = ''
  try {
    const result = await platformApi.pluginRequest({
      pluginId: props.panel.pluginId,
      action: `panel:render:${props.panel.panelId}`,
    })
    if (result?.success) {
      tree.value = result.result as PluginPanelTreeData
    } else {
      error.value = result?.error || 'The plugin could not render this panel.'
    }
  } catch (e: any) {
    error.value = e?.message || 'The plugin could not render this panel.'
  } finally {
    loading.value = false
  }
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
    if (outcome.tree) tree.value = outcome.tree
    else if (outcome.refresh) await render()
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
    void render()
  })
})

onBeforeUnmount(() => {
  unsubscribe?.()
})

// 切到另一个插件面板时重新拉一次。
watch(() => `${props.panel.pluginId}:${props.panel.panelId}`, () => {
  tree.value = null
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
