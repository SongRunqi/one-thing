<template>
  <div class="infographic-editor">
    <!-- 头部 -->
    <div class="editor-header">
      <h2 class="editor-title">信息图表编辑器</h2>
      <div class="header-actions">
        <button class="action-btn" @click="createNew" title="新建">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          新建
        </button>
      </div>
    </div>

    <!-- 主体内容 -->
    <div class="editor-body">
      <!-- 左侧：模板选择和配置 -->
      <div class="editor-sidebar">
        <!-- 模板选择 -->
        <div class="section">
          <div class="section-header">
            <span class="section-title">模板</span>
          </div>
          <div class="template-grid">
            <button
              v-for="template in templates"
              :key="template.id"
              class="template-item"
              :class="{ active: currentConfig.template === template.id }"
              @click="selectTemplate(template.id)"
              :title="template.description"
            >
              <div class="template-icon">{{ template.icon }}</div>
              <span class="template-name">{{ template.name }}</span>
            </button>
          </div>
        </div>

        <!-- 数据配置 -->
        <div class="section">
          <div class="section-header">
            <span class="section-title">数据配置</span>
            <button class="icon-btn" @click="addItem" title="添加项目">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>

          <!-- 标题 -->
          <div class="form-group">
            <label>标题</label>
            <input
              v-model="currentConfig.data.title"
              type="text"
              class="form-input"
              placeholder="输入标题..."
              @input="updatePreview"
            />
          </div>

          <!-- 描述 -->
          <div class="form-group">
            <label>描述</label>
            <input
              v-model="currentConfig.data.desc"
              type="text"
              class="form-input"
              placeholder="输入描述..."
              @input="updatePreview"
            />
          </div>

          <!-- 项目列表 -->
          <div class="items-list">
            <div
              v-for="(item, index) in (currentConfig.data.items || [])"
              :key="index"
              class="item-card"
            >
              <div class="item-header">
                <span class="item-index">{{ index + 1 }}</span>
                <button class="icon-btn delete" @click="removeItem(index)" title="删除">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div class="item-fields">
                <input
                  v-model="item.label"
                  type="text"
                  class="form-input small"
                  placeholder="标签"
                  @input="updatePreview"
                />
                <input
                  v-model="item.desc"
                  type="text"
                  class="form-input small"
                  placeholder="描述"
                  @input="updatePreview"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- JSON 编辑 -->
        <div class="section">
          <div class="section-header">
            <span class="section-title">JSON 配置</span>
            <button
              class="icon-btn"
              :class="{ active: showJson }"
              @click="showJson = !showJson"
              title="切换 JSON 视图"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
            </button>
          </div>
          <div v-if="showJson" class="json-editor">
            <textarea
              v-model="jsonText"
              class="json-textarea"
              @input="parseJson"
              :class="{ error: jsonError }"
            ></textarea>
            <div v-if="jsonError" class="json-error">{{ jsonError }}</div>
          </div>
        </div>
      </div>

      <!-- 右侧：预览 -->
      <div class="editor-preview">
        <div class="preview-header">
          <span class="preview-title">预览</span>
          <div class="preview-actions">
            <button class="action-btn small" @click="exportPNG">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              PNG
            </button>
            <button class="action-btn small" @click="exportSVG">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              SVG
            </button>
            <button class="action-btn small" @click="copyMarkdown">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              {{ copyLabel }}
            </button>
          </div>
        </div>
        <div class="preview-container" ref="previewRef">
          <div v-if="previewError" class="preview-error">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{{ previewError }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue'
import type { InfographicConfig, InfographicItem } from '@shared/ipc/infographics'
import { INFOGRAPHIC_TEMPLATES } from '@shared/ipc/infographics'

// 模板列表（添加图标）
const templates = INFOGRAPHIC_TEMPLATES.map(t => ({
  ...t,
  icon: getTemplateIcon(t.category)
}))

function getTemplateIcon(category: string): string {
  const icons: Record<string, string> = {
    flow: '→',
    list: '≡',
    grid: '⊞',
    comparison: '⚖',
    hierarchy: '⌂',
    timeline: '◷',
    chart: '📊'
  }
  return icons[category] || '◆'
}

// 当前配置
const currentConfig = reactive<InfographicConfig>({
  template: 'list-row-simple-horizontal-arrow',
  width: '100%',
  height: 400,
  data: {
    title: '示例标题',
    desc: '示例描述',
    items: [
      { label: '步骤 1', desc: '第一步描述' },
      { label: '步骤 2', desc: '第二步描述' },
      { label: '步骤 3', desc: '第三步描述' }
    ]
  }
})

// UI 状态
const showJson = ref(false)
const jsonText = ref('')
const jsonError = ref('')
const previewError = ref('')
const copyLabel = ref('复制')
const previewRef = ref<HTMLElement | null>(null)

// Infographic 实例
let infographicInstance: any = null

// 更新 JSON 文本
function updateJsonText() {
  jsonText.value = JSON.stringify(currentConfig, null, 2)
}

// 解析 JSON
function parseJson() {
  try {
    const parsed = JSON.parse(jsonText.value)
    Object.assign(currentConfig, parsed)
    jsonError.value = ''
    renderPreview()
  } catch (e: any) {
    jsonError.value = e.message
  }
}

// 选择模板
function selectTemplate(templateId: string) {
  currentConfig.template = templateId
  updatePreview()
}

// 添加项目
function addItem() {
  if (!currentConfig.data.items) {
    currentConfig.data.items = []
  }
  currentConfig.data.items.push({
    label: `项目 ${currentConfig.data.items.length + 1}`,
    desc: '描述'
  })
  updatePreview()
}

// 删除项目
function removeItem(index: number) {
  currentConfig.data.items?.splice(index, 1)
  updatePreview()
}

// 创建新图表
function createNew() {
  currentConfig.template = 'list-row-simple-horizontal-arrow'
  currentConfig.data = {
    title: '新图表',
    desc: '',
    items: [
      { label: '步骤 1', desc: '描述' },
      { label: '步骤 2', desc: '描述' },
      { label: '步骤 3', desc: '描述' }
    ]
  }
  updatePreview()
}

// 更新预览（防抖）
let previewTimeout: ReturnType<typeof setTimeout> | null = null
function updatePreview() {
  updateJsonText()
  if (previewTimeout) clearTimeout(previewTimeout)
  previewTimeout = setTimeout(() => {
    renderPreview()
  }, 300)
}

// 获取当前主题
function getCurrentTheme(): 'default' | 'dark' | 'light' {
  const htmlTheme = document.documentElement.getAttribute('data-theme')
  return htmlTheme === 'light' ? 'light' : 'dark'
}

// 渲染预览
async function renderPreview() {
  if (!previewRef.value) return

  previewError.value = ''

  try {
    const { Infographic } = await import('@antv/infographic')

    if (infographicInstance) {
      try {
        infographicInstance.destroy()
      } catch (e) {
        // 忽略
      }
    }

    previewRef.value.innerHTML = ''

    // 使用 as any 绕过严格类型检查
    infographicInstance = new Infographic({
      container: previewRef.value,
      width: '100%',
      height: 400,
      template: currentConfig.template,
      data: currentConfig.data as any,
      theme: getCurrentTheme(),
      padding: 20
    } as any)

    await infographicInstance.render()
  } catch (e: any) {
    console.error('Preview render error:', e)
    previewError.value = e.message || '渲染失败'
  }
}

// 导出 PNG
async function exportPNG() {
  if (!infographicInstance) return
  try {
    const dataUrl = await infographicInstance.toDataURL({ type: 'png', dpr: 2 })
    downloadDataUrl(dataUrl, `infographic-${Date.now()}.png`)
  } catch (e) {
    console.error('Export error:', e)
  }
}

// 导出 SVG
async function exportSVG() {
  if (!infographicInstance) return
  try {
    const dataUrl = await infographicInstance.toDataURL({ type: 'svg', embedResources: true })
    downloadDataUrl(dataUrl, `infographic-${Date.now()}.svg`)
  } catch (e) {
    console.error('Export error:', e)
  }
}

// 下载文件
function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// 复制 Markdown
async function copyMarkdown() {
  const markdown = '```infographic\n' + JSON.stringify(currentConfig, null, 2) + '\n```'
  try {
    await navigator.clipboard.writeText(markdown)
    copyLabel.value = '已复制!'
    setTimeout(() => {
      copyLabel.value = '复制'
    }, 2000)
  } catch (e) {
    console.error('Copy error:', e)
  }
}

// 生命周期
onMounted(() => {
  updateJsonText()
  nextTick(() => renderPreview())
})

onUnmounted(() => {
  if (infographicInstance) {
    try {
      infographicInstance.destroy()
    } catch (e) {
      // 忽略
    }
  }
})

// 监听主题变化
watch(
  () => document.documentElement.getAttribute('data-theme'),
  () => {
    renderPreview()
  }
)
</script>

<style scoped>
.infographic-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
}

/* 头部 */
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.editor-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--text);
}

.header-actions {
  display: flex;
  gap: 8px;
}

/* 主体 */
.editor-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* 侧边栏 */
.editor-sidebar {
  width: 320px;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 16px;
}

.section {
  margin-bottom: 20px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 模板网格 */
.template-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.template-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.template-item:hover {
  border-color: var(--accent);
}

.template-item.active {
  border-color: var(--accent);
  background: rgba(var(--accent-rgb), 0.1);
}

.template-icon {
  font-size: 20px;
}

.template-name {
  font-size: 11px;
  color: var(--text);
  text-align: center;
}

/* 表单 */
.form-group {
  margin-bottom: 12px;
}

.form-group label {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s ease;
}

.form-input:focus {
  border-color: var(--accent);
}

.form-input.small {
  padding: 6px 10px;
  font-size: 12px;
}

/* 项目列表 */
.items-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.item-index {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
}

.item-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* JSON 编辑器 */
.json-editor {
  margin-top: 8px;
}

.json-textarea {
  width: 100%;
  height: 200px;
  padding: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
}

.json-textarea:focus {
  border-color: var(--accent);
}

.json-textarea.error {
  border-color: var(--error, #ef4444);
}

.json-error {
  margin-top: 6px;
  font-size: 12px;
  color: var(--error, #ef4444);
}

/* 预览区域 */
.editor-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.preview-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}

.preview-actions {
  display: flex;
  gap: 8px;
}

.preview-container {
  flex: 1;
  overflow: auto;
  padding: 20px;
}

.preview-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  color: var(--error, #ef4444);
}

/* 按钮 */
.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  border-color: var(--accent);
}

.action-btn.small {
  padding: 6px 10px;
  font-size: 12px;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: var(--bg-elevated);
  color: var(--text);
}

.icon-btn.active {
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--accent);
}

.icon-btn.delete:hover {
  color: var(--error, #ef4444);
}
</style>
