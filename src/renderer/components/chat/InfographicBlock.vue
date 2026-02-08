<template>
  <div
    class="infographic-wrapper"
    :class="{ 'has-error': hasError, 'is-code-view': showCode }"
  >
    <!-- 加载状态 -->
    <div
      v-if="isLoading"
      class="infographic-loading"
    >
      <div class="loading-spinner" />
    </div>

    <!-- 错误状态 -->
    <div
      v-else-if="hasError"
      class="infographic-error"
    >
      <div class="error-icon">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
          />
          <line
            x1="12"
            y1="8"
            x2="12"
            y2="12"
          />
          <line
            x1="12"
            y1="16"
            x2="12.01"
            y2="16"
          />
        </svg>
      </div>
      <div class="error-message">
        {{ errorMessage }}
      </div>
      <button
        class="retry-btn"
        @click="renderInfographic"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M23 4v6h-6M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        重试
      </button>
    </div>

    <!-- 图表区域容器（与代码区域互斥） -->
    <div
      v-show="!showCode && !isLoading && !hasError"
      class="infographic-content"
    >
      <!-- 图表容器（点击放大） -->
      <div
        ref="containerRef"
        class="infographic-canvas"
        @click="openPreview"
      />

      <!-- 悬浮操作按钮 -->
      <div class="infographic-actions">
        <button
          class="action-btn"
          :title="showCode ? '隐藏代码' : '查看代码'"
          @click="toggleCode"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </button>
        <button
          class="action-btn"
          title="导出 PNG"
          @click="exportPNG"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect
              x="3"
              y="3"
              width="18"
              height="18"
              rx="2"
            />
            <circle
              cx="8.5"
              cy="8.5"
              r="1.5"
            />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </button>
        <button
          class="action-btn"
          title="导出 SVG"
          @click="exportSVG"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line
              x1="12"
              y1="15"
              x2="12"
              y2="3"
            />
          </svg>
        </button>
        <button
          class="action-btn"
          :title="copyLabel"
          @click="copyConfig"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect
              x="9"
              y="9"
              width="13"
              height="13"
              rx="2"
              ry="2"
            />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 代码预览区域（使用与普通代码块一致的样式） -->
    <div
      v-if="showCode && !isLoading && !hasError"
      class="code-block-container"
    >
      <div class="code-block-header">
        <div class="code-block-lang">
          infographic
        </div>
        <div class="code-block-actions">
          <button
            class="code-block-copy"
            :title="copyLabel"
            @click="copyConfig"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect
                x="9"
                y="9"
                width="13"
                height="13"
                rx="2"
                ry="2"
              />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>{{ copyLabel }}</span>
          </button>
          <button
            class="code-block-copy"
            title="查看图表"
            @click="toggleCode"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M3 3v18h18" />
              <path d="M18 17V9" />
              <path d="M13 17V5" />
              <path d="M8 17v-3" />
            </svg>
            <span>图表</span>
          </button>
        </div>
      </div>
      <pre><code class="hljs">{{ rawCode }}</code></pre>
    </div>

    <!-- 全屏预览遮罩层 -->
    <Teleport to="body">
      <Transition name="preview-fade">
        <div
          v-if="showPreview"
          class="infographic-preview-overlay"
          @click="closePreview"
        >
          <div
            class="preview-container"
            @click.stop
          >
            <div
              class="preview-canvas"
              :style="{
                transform: `scale(${previewScale}) translate(${previewPosition.x / previewScale}px, ${previewPosition.y / previewScale}px)`,
                cursor: isDragging ? 'grabbing' : 'grab'
              }"
              @wheel.prevent="handleWheel"
              @dblclick="resetPreview"
              @mousedown="startDrag"
              @mousemove="onDrag"
              @mouseup="endDrag"
              @mouseleave="endDrag"
              v-html="previewContent"
            />

            <!-- 缩放控制栏 -->
            <div class="preview-controls">
              <button
                title="缩小"
                @click="zoomOut"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line
                    x1="5"
                    y1="12"
                    x2="19"
                    y2="12"
                  />
                </svg>
              </button>
              <span class="zoom-level">{{ Math.round(previewScale * 100) }}%</span>
              <button
                title="放大"
                @click="zoomIn"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line
                    x1="12"
                    y1="5"
                    x2="12"
                    y2="19"
                  />
                  <line
                    x1="5"
                    y1="12"
                    x2="19"
                    y2="12"
                  />
                </svg>
              </button>
              <button
                title="重置"
                @click="resetPreview"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
              </button>
            </div>

            <button
              class="preview-close"
              title="关闭"
              @click="closePreview"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line
                  x1="18"
                  y1="6"
                  x2="6"
                  y2="18"
                />
                <line
                  x1="6"
                  y1="6"
                  x2="18"
                  y2="18"
                />
              </svg>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import type { InfographicConfig } from '@shared/ipc/infographics'

interface Props {
  config?: InfographicConfig
  syntax?: string  // DSL 语法字符串
  syntaxType?: 'json' | 'dsl'  // 语法类型
  isStreaming?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  syntaxType: 'json'
})

const containerRef = ref<HTMLElement | null>(null)
const isLoading = ref(true)
const hasError = ref(false)
const errorMessage = ref('')
const copyLabel = ref('复制')
const showCode = ref(false)
const showPreview = ref(false)

// 预览缩放和拖拽状态
const previewScale = ref(1)
const previewPosition = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })

// 打开预览（重置缩放状态）
function openPreview() {
  showPreview.value = true
  previewScale.value = 1
  previewPosition.value = { x: 0, y: 0 }
}

function closePreview() {
  showPreview.value = false
  isDragging.value = false
}

// 缩放控制
function handleWheel(e: WheelEvent) {
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  previewScale.value = Math.min(3, Math.max(0.5, previewScale.value + delta))
}

function zoomIn() {
  previewScale.value = Math.min(3, previewScale.value + 0.25)
}

function zoomOut() {
  previewScale.value = Math.max(0.5, previewScale.value - 0.25)
}

function resetPreview() {
  previewScale.value = 1
  previewPosition.value = { x: 0, y: 0 }
}

// 拖拽平移
function startDrag(e: MouseEvent) {
  isDragging.value = true
  dragStart.value = {
    x: e.clientX - previewPosition.value.x,
    y: e.clientY - previewPosition.value.y
  }
}

function onDrag(e: MouseEvent) {
  if (!isDragging.value) return
  previewPosition.value = {
    x: e.clientX - dragStart.value.x,
    y: e.clientY - dragStart.value.y
  }
}

function endDrag() {
  isDragging.value = false
}

// 获取原始代码
const rawCode = computed(() => {
  if (props.syntaxType === 'dsl' && props.syntax) {
    return props.syntax
  } else if (props.config) {
    return JSON.stringify(props.config, null, 2)
  }
  return ''
})

// 获取预览内容（直接复制当前渲染的 SVG）
const previewContent = computed(() => {
  if (containerRef.value) {
    return containerRef.value.innerHTML
  }
  return ''
})

// 切换代码显示
function toggleCode() {
  showCode.value = !showCode.value
}

// Infographic 实例（动态导入以支持懒加载）
let infographicInstance: any = null
let resourceLoaderRegistered = false

// 资源缓存
const svgTextCache = new Map<string, string>()
const pendingRequests = new Map<string, Promise<string | null>>()

// 注册资源加载器（用于加载图标和插图）
// registerResourceLoader 和 loadSVGResource 是独立导出的函数，不是 Infographic 的静态方法
async function registerResourceLoaderOnce(
  registerResourceLoader: any,
  loadSVGResource: any
) {
  if (resourceLoaderRegistered) return
  resourceLoaderRegistered = true

  registerResourceLoader(async (config: { data: string; scene: string }) => {
    const { data, scene } = config

    try {
      const key = `${scene}::${data}`
      let svgText: string | null = null

      // 1. 检查缓存
      if (svgTextCache.has(key)) {
        svgText = svgTextCache.get(key) || null
      }
      // 2. 检查是否有进行中的请求
      else if (pendingRequests.has(key)) {
        svgText = await pendingRequests.get(key) || null
      }
      // 3. 发起新请求
      else {
        const fetchPromise = (async (): Promise<string | null> => {
          try {
            let url: string | null = null

            if (scene === 'icon') {
              url = `https://api.iconify.design/${data}.svg`
            } else if (scene === 'illus') {
              url = `https://raw.githubusercontent.com/balazser/undraw-svg-collection/refs/heads/main/svgs/${data}.svg`
            } else {
              return null
            }

            if (!url) return null

            const response = await fetch(url, { referrerPolicy: 'no-referrer' })

            if (!response.ok) {
              console.error(`HTTP ${response.status}: Failed to load ${url}`)
              return null
            }

            const text = await response.text()

            if (!text || !text.trim().startsWith('<svg')) {
              console.error(`Invalid SVG content from ${url}`)
              return null
            }

            svgTextCache.set(key, text)
            return text
          } catch (fetchError) {
            console.error(`Failed to fetch resource ${key}:`, fetchError)
            return null
          }
        })()

        pendingRequests.set(key, fetchPromise)

        try {
          svgText = await fetchPromise
        } catch (error) {
          pendingRequests.delete(key)
          console.error(`Error loading resource ${key}:`, error)
          return null
        } finally {
          pendingRequests.delete(key)
        }
      }

      if (!svgText) {
        return null
      }

      const resource = loadSVGResource(svgText)

      if (!resource) {
        console.error(`loadSVGResource returned null for ${key}`)
        svgTextCache.delete(key)
        return null
      }

      return resource
    } catch (error) {
      console.error('Unexpected error in resource loader:', error)
      return null
    }
  })
}

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
    // registerResourceLoader 和 loadSVGResource 是独立导出的函数
    const { Infographic, registerResourceLoader, loadSVGResource } = await import('@antv/infographic')

    // 注册资源加载器（仅在首次导入时注册）
    await registerResourceLoaderOnce(registerResourceLoader, loadSVGResource)

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

    // 创建新实例
    infographicInstance = new Infographic({
      container: containerRef.value,
      width: '100%',
      height: 'auto',
      theme: getCurrentTheme()
    } as any)

    // 根据语法类型选择渲染方式
    if (props.syntaxType === 'dsl' && props.syntax) {
      // DSL 语法：使用 render(syntax) 方法
      await infographicInstance.render(props.syntax)
    } else if (props.config) {
      // JSON 格式：使用 render() 方法并传入配置
      // 构建渲染配置
      const renderConfig = {
        template: props.config.template,
        data: props.config.data,
        theme: props.config.theme || getCurrentTheme(),
        width: props.config.width || '100%',
        height: props.config.height || 400,
        padding: props.config.padding || 20
      }
      await infographicInstance.render(renderConfig as any)
    }

    // 等待字体加载后重新渲染以确保正确显示
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (infographicInstance && props.syntaxType === 'dsl' && props.syntax) {
          infographicInstance.render(props.syntax)
        }
      }).catch((e: Error) => console.error('Font loading error:', e))
    }

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
    // 根据语法类型决定复制的内容
    const configStr = props.syntaxType === 'dsl' && props.syntax
      ? props.syntax
      : JSON.stringify(props.config, null, 2)
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

// 监听配置变化（同时支持 config 和 syntax）
watch(
  () => [props.config, props.syntax],
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

/* 代码视图时（加载中或手动查看），wrapper 透明，让代码块样式生效 */
.infographic-wrapper.is-code-view {
  background: transparent;
  border-color: transparent;
}

/* 代码块操作按钮组 */
.code-block-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 加载状态 */
.infographic-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
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

/* 图表区域容器 */
.infographic-content {
  position: relative;
}

/* 图表容器 */
.infographic-canvas {
  padding: 16px;
  cursor: zoom-in;
}

/* 悬浮操作按钮 */
.infographic-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 4px;
  padding: 4px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  border-radius: 8px;
  opacity: 0;
  transform: translateY(-4px);
  transition: all 0.2s ease;
  z-index: 10;
}

html[data-theme='light'] .infographic-actions {
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.infographic-content:hover .infographic-actions {
  opacity: 1;
  transform: translateY(0);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

html[data-theme='light'] .action-btn {
  color: rgba(0, 0, 0, 0.6);
}

html[data-theme='light'] .action-btn:hover {
  background: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.9);
}

.action-btn svg {
  width: 16px;
  height: 16px;
}

/* 全屏预览遮罩层 */
.infographic-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.preview-container {
  position: relative;
  width: 90vw;
  height: 90vh;
  background: var(--bg-elevated, #1a1a1a);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

html[data-theme='light'] .preview-container {
  background: #fff;
}

.preview-canvas {
  padding: 32px;
  transform-origin: center center;
  user-select: none;
  transition: transform 0.05s ease-out;
}

.preview-canvas :deep(svg) {
  display: block;
}

/* 缩放控制栏 */
.preview-controls {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  border-radius: 24px;
  z-index: 10;
}

.preview-controls button {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preview-controls button:hover {
  background: rgba(255, 255, 255, 0.25);
}

.zoom-level {
  min-width: 55px;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
}

.preview-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: 10;
}

.preview-close:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

/* 预览动画 */
.preview-fade-enter-active,
.preview-fade-leave-active {
  transition: opacity 0.2s ease;
}

.preview-fade-enter-active .preview-container,
.preview-fade-leave-active .preview-container {
  transition: transform 0.2s ease;
}

.preview-fade-enter-from,
.preview-fade-leave-to {
  opacity: 0;
}

.preview-fade-enter-from .preview-container {
  transform: scale(0.95);
}

.preview-fade-leave-to .preview-container {
  transform: scale(0.95);
}
</style>
