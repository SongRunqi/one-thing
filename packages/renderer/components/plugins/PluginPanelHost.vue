<template>
  <div
    ref="hostEl"
    class="plugin-panel-host"
  >
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

    <!-- 降级态(R7):连败达阈之后请求被通道**短路**,插件不再被调用。
         这与普通错误是两回事,所以给它专门的一态 —— 普通错误的 Retry 是"再试
         一次同一件事",而这里再点一次会被闸挡掉,必须显式说"绕过一次"。
         措辞只说**面板**不可用:插件的工具/命令/提示词此刻完全正常。 -->
    <SettingsEmptyState
      v-else-if="degraded"
      :title="`${panel.label} is switched off after repeated failures`"
      :description="degradedReason || `${panel.pluginName} kept failing here, so this panel stopped calling it. Everything else in the plugin still works.`"
    >
      <template #actions>
        <Button
          unstyled
          class="panel-retry"
          @click="render({ bypassDegraded: true })"
        >
          Try once more
        </Button>
      </template>
    </SettingsEmptyState>

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
import { onErrorCaptured, onMounted, ref, watch } from 'vue'
import Button from '@/components/common/Button.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import { SettingsEmptyState } from '@/components/settings/settings-primitives'
import PluginPanelNode from './PluginPanelNode.vue'
import { platformApi } from '@/platform'
import type { PluginWorkspacePanel } from '@/workspace/plugin-panel-types'
import { usePluginUiBlock } from './usePluginUiBlock'

const props = defineProps<{ panel: PluginWorkspacePanel }>()

const isDesktop = platformApi.environment !== 'web'

/** 根元素 —— IntersectionObserver 据此判断"块可见"(树级轮询只在可见时走)。 */
const hostEl = ref<HTMLElement | null>(null)

/*
 * 渲染逻辑全部在共享内核里(R5.x-c):这个壳只持有面板的两条专属语义 ——
 * web 端/未加载的呈现,与"切到另一个面板要重拉"。内核的行为由
 * PluginPanelHost 的既有测试钉住,抽壳不许改语义。
 */
const {
  tree,
  error,
  degraded,
  degradedReason,
  loading,
  render,
  invoke,
  observeVisibility,
} = usePluginUiBlock(() => ({
  pluginId: props.panel.pluginId,
  renderAction: `panel:render:${props.panel.panelId}`,
  invokeAction: `panel:action:${props.panel.panelId}`,
  notificationId: props.panel.panelId,
  enabled: isDesktop && props.panel.loaded,
}))

onMounted(() => {
  observeVisibility(hostEl.value)
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
  degraded.value = false
  degradedReason.value = ''
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
