<template>
  <div class="infographic-wrapper" :class="{ 'has-error': hasError }">
    <!-- 加载状态 -->
    <div v-if="isLoading" class="infographic-loading">
      <div class="loading-spinner"></div>
      <span>正在渲染图表...</span>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="hasError" class="infographic-error">
      <div class="error-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <div class="error-message">{{ errorMessage }}</div>
      <button class="retry-btn" @click="renderInfographic">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
        重试
      </button>
    </div>

    <!-- 图表容器 -->
    <div v-show="!isLoading && !hasError" ref="containerRef" class="infographic-canvas"></div>

    <!-- 操作按钮 -->
    <div v-if="!isLoading && !hasError" class="infographic-actions">
      <button class="action-btn" @click="exportPNG" title="导出 PNG">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>PNG</span>
      </button>
      <button class="action-btn" @click="exportSVG" title="导出 SVG">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <span>SVG</span>
      </button>
      <button class="action-btn" @click="copyConfig" title="复制配置">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <span>{{ copyLabel }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import type { InfographicConfig } from '@shared/ipc/infographics'

interface Props {
  config: InfographicConfig
  isStreaming?: boolean
}

const props = defineProps<Props>()

const containerRef = ref<HTMLElement | null>(null)
const isLoading = ref(true)
const hasError = ref(false)
const errorMessage = ref('')
const copyLabel = ref('复制')

// Infographic 实例（动态导入以支持懒加载）
let infographicInstance: any = null

// 获取当前主题
function getCurrentTheme(): 'default' | 'dark' | 'light' {
  const htmlTheme = document.documentElement.getAttribute('data-theme')
  return htmlTheme === 'light' ? 'light' : 'dark'
}

// 渲染信息图表
async function renderInfographic() {
  if (!containerRef.value || props.isStreaming) return

  isLoading.value = true
  hasError.value = false
  errorMessage.value = ''

  try {
    // 动态导入 @antv/infographic（懒加载）
    const { Infographic } = await import('@antv/infographic')

    // 销毁旧实例
    if (infographicInstance) {
      try {
        infographicInstance.destroy()
      } catch (e) {
        // 忽略销毁错误
      }
      infographicInstance = null
    }

    // 清空容器
    containerRef.value.innerHTML = ''

    // 创建新实例 - 使用 as any 绕过严格类型检查
    // 因为 @antv/infographic 的类型定义较为严格，但实际 API 支持更灵活的配置
    infographicInstance = new Infographic({
      container: containerRef.value,
      width: props.config.width || '100%',
      height: props.config.height || 400,
      template: props.config.template,
      data: props.config.data as any,
      theme: props.config.theme || getCurrentTheme(),
      padding: props.config.padding || 20
    } as any)
    await infographicInstance.render()

    isLoading.value = false
  } catch (error: any) {
    console.error('Infographic render error:', error)
    hasError.value = true
    errorMessage.value = error.message || '渲染失败'
    isLoading.value = false
  }
}

// 导出为 PNG
async function exportPNG() {
  if (!infographicInstance) return

  try {
    const dataUrl = await infographicInstance.toDataURL({
      type: 'png',
      dpr: 2
    })
    downloadDataUrl(dataUrl, `infographic-${Date.now()}.png`)
  } catch (error) {
    console.error('Export PNG error:', error)
  }
}

// 导出为 SVG
async function exportSVG() {
  if (!infographicInstance) return

  try {
    const dataUrl = await infographicInstance.toDataURL({
      type: 'svg',
      embedResources: true
    })
    downloadDataUrl(dataUrl, `infographic-${Date.now()}.svg`)
  } catch (error) {
    console.error('Export SVG error:', error)
  }
}

// 复制配置
async function copyConfig() {
  try {
    const configStr = JSON.stringify(props.config, null, 2)
    await navigator.clipboard.writeText(configStr)
    copyLabel.value = '已复制!'
    setTimeout(() => {
      copyLabel.value = '复制'
    }, 2000)
  } catch (error) {
    console.error('Copy config error:', error)
  }
}

// 降级下载方法
function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// 监听配置变化
watch(
  () => props.config,
  () => {
    if (!props.isStreaming) {
      nextTick(() => renderInfographic())
    }
  },
  { deep: true }
)

// 监听流式状态
watch(
  () => props.isStreaming,
  (newVal, oldVal) => {
    if (!newVal && oldVal) {
      // 流式结束，开始渲染
      nextTick(() => renderInfographic())
    }
  }
)

// 监听主题变化
function handleThemeChange() {
  if (!props.isStreaming) {
    renderInfographic()
  }
}

onMounted(() => {
  // 监听主题变化
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'data-theme') {
        handleThemeChange()
      }
    })
  })

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  })

  // 初始渲染
  if (!props.isStreaming) {
    renderInfographic()
  }
})

onUnmounted(() => {
  // 清理实例
  if (infographicInstance) {
    try {
      infographicInstance.destroy()
    } catch (e) {
      // 忽略销毁错误
    }
    infographicInstance = null
  }
})
</script>

<style scoped>
.infographic-wrapper {
  position: relative;
  margin: 16px 0;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
}

.infographic-wrapper.has-error {
  border-color: var(--error, #ef4444);
}

/* 加载状态 */
.infographic-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  gap: 12px;
  color: var(--muted);
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 错误状态 */
.infographic-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  gap: 12px;
  color: var(--error, #ef4444);
}

.error-icon {
  opacity: 0.7;
}

.error-message {
  font-size: 14px;
  text-align: center;
  max-width: 300px;
  word-break: break-word;
}

.retry-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(var(--accent-rgb), 0.1);
  border: 1px solid var(--accent);
  border-radius: 8px;
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.retry-btn:hover {
  background: rgba(var(--accent-rgb), 0.2);
}

/* 图表容器 */
.infographic-canvas {
  min-height: 200px;
  padding: 16px;
}

/* 操作按钮 */
.infographic-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid var(--border);
}

html[data-theme='light'] .infographic-actions {
  background: rgba(0, 0, 0, 0.03);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: var(--accent);
}

html[data-theme='light'] .action-btn {
  background: rgba(0, 0, 0, 0.04);
}

html[data-theme='light'] .action-btn:hover {
  background: rgba(0, 0, 0, 0.08);
}

.action-btn svg {
  opacity: 0.7;
}

.action-btn span {
  font-weight: 500;
}
</style>
