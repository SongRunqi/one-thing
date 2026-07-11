/**
 * Font Registry
 * Central definition of available fonts for the app.
 * To add a new font:
 *   1. Install the font package (e.g., bun add @fontsource-variable/xxx)
 *   2. Import it in src/renderer/styles/main.css
 *   3. Add an entry here
 * System font stacks can be added directly without a package import.
 */

export interface FontDefinition {
  id: string
  name: string           // Display name in settings UI
  family: string         // CSS font-family value
  category: 'sans-serif' | 'serif' | 'monospace'
  lang: 'en' | 'zh' | 'both'  // Primary language support
  preview?: string       // Preview text for settings UI
  webfont?: boolean      // Requires @font-face file download (false/missing for system fonts)
  weights?: number[]     // Available font weights for preload spec generation
}

export const FONT_REGISTRY: FontDefinition[] = [
  // --- System fonts ---
  {
    id: 'system-ui',
    name: 'System UI',
    family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI"',
    category: 'sans-serif',
    lang: 'en',
    preview: 'The quick brown fox jumps over the lazy dog',
  },
  {
    id: 'system-cjk',
    name: '系统字体 System Chinese',
    family: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC"',
    category: 'sans-serif',
    lang: 'zh',
    preview: '你好世界 Hello World',
  },

  // --- Sans-serif ---
  {
    id: 'public-sans',
    name: 'Public Sans',
    family: "'Public Sans Variable'",
    category: 'sans-serif',
    lang: 'en',
    preview: 'The quick brown fox jumps over the lazy dog',
    webfont: true,
    weights: [400, 500, 600],
  },
  {
    id: 'noto-sans-sc',
    name: '思源黑体 Noto Sans SC',
    family: "'Noto Sans SC Variable'",
    category: 'sans-serif',
    lang: 'zh',
    preview: '你好世界 Hello World',
    webfont: true,
    weights: [400, 500, 600],
  },

  // --- Serif / Kai ---
  {
    id: 'lora',
    name: 'Lora',
    family: "'Lora Variable'",
    category: 'serif',
    lang: 'en',
    preview: 'The quick brown fox jumps over the lazy dog',
    webfont: true,
    weights: [400, 500, 600],
  },
  {
    id: 'noto-serif-sc',
    name: '思源宋体 Noto Serif SC',
    family: "'Noto Serif SC Variable'",
    category: 'serif',
    lang: 'zh',
    preview: '你好世界 Hello World',
    webfont: true,
    weights: [400, 500, 600],
  },
  {
    id: 'lxgw-wenkai',
    name: '霞鹜文楷 LXGW WenKai',
    family: "'LXGW WenKai'",
    category: 'serif',
    lang: 'zh',
    preview: '你好世界 Hello World',
    webfont: true,
    weights: [400, 700],
  },
  {
    id: 'lxgw-wenkai-screen',
    name: '霞鹜文楷屏幕版 WenKai Screen',
    family: "'LXGW WenKai Screen'",
    category: 'serif',
    lang: 'zh',
    preview: '你好世界 Hello World',
    webfont: true,
    weights: [400],
  },
  {
    id: 'georgia',
    name: 'Georgia',
    family: 'Georgia',
    category: 'serif',
    lang: 'en',
    preview: 'The quick brown fox jumps over the lazy dog',
  },
]

/** Defaults */
export const DEFAULT_FONT_EN = 'public-sans'
export const DEFAULT_FONT_ZH = 'noto-sans-sc'
export const SYSTEM_FONT_EN = 'system-ui'
export const SYSTEM_FONT_ZH = 'system-cjk'

/** Get a font definition by ID */
export function getFontById(id: string): FontDefinition | undefined {
  return FONT_REGISTRY.find(f => f.id === id)
}

/** Get fonts filtered by language */
export function getFontsByLang(lang: 'en' | 'zh'): FontDefinition[] {
  return FONT_REGISTRY.filter(f => f.lang === lang || f.lang === 'both')
}

/**
 * ~100 high-frequency CJK characters covering common unicode-range subsets.
 * Used to trigger woff2 font downloads via document.fonts.load().
 */
export const CJK_PRELOAD_SAMPLE =
  '这是一段测试文本用于预载中文字体文件启动会话列表服务器抓包进入笔记目录设置页面' +
  '主题颜色基色排版密度聊天字体英文字体中文字体系统字体黑体宋体文楷屏幕版代码编辑器' +
  '文件路径下载上传删除复制粘贴剪切重命名新建保存刷新搜索替换配置管理工具命令运行' +
  '完成失败警告错误信息提示确认取消返回前进退出登录注册账号密码邮箱手机验证码' +
  '人工智能模型对话消息回复思考工具权限请求选择全部部分批次处理进度加载等待超时' +
  '连接断开重连同步上传下载缓存清理恢复导入导出备份还原升级更新版本发布安装卸载'

/**
 * Build a list of document.fonts.load() arguments for one or two font IDs.
 * Filters to webfont entries, expands weights, and pairs each spec with a sample.
 * Unknown IDs are silently skipped (consistent with buildFontFamily rendering).
 * System fonts (no webfont) produce no entries.
 */
export function buildFontLoadSpecs(
  enId?: string,
  zhId?: string
): Array<{ spec: string; sample: string }> {
  const result: Array<{ spec: string; sample: string }> = []
  const enFont = getFontById(enId || DEFAULT_FONT_EN)
  const zhFont = getFontById(zhId || DEFAULT_FONT_ZH)

  for (const font of [enFont, zhFont]) {
    if (!font || !font.webfont) continue
    const weights = font.weights ?? [400]
    const sample = font.lang === 'zh'
      ? CJK_PRELOAD_SAMPLE
      : 'The quick brown fox jumps over the lazy dog'
    for (const w of weights) {
      result.push({ spec: `${w} 14px ${font.family}`, sample })
    }
  }
  return result
}

/**
 * Build a CSS font-family string from EN + ZH font IDs.
 * English font goes first (no CJK glyphs), Chinese font as fallback for CJK characters.
 */
export function buildFontFamily(enId?: string, zhId?: string): string {
  const enFont = getFontById(enId || DEFAULT_FONT_EN)
  const zhFont = getFontById(zhId || DEFAULT_FONT_ZH)

  const parts: string[] = []
  if (enFont) parts.push(enFont.family)
  if (zhFont) parts.push(zhFont.family)

  // Determine generic fallback from the fonts' categories
  const hasSerif = enFont?.category === 'serif' || zhFont?.category === 'serif'
  const fallback = hasSerif
    ? "Georgia, Cambria, serif"
    : "ui-sans-serif, system-ui, -apple-system, sans-serif"

  parts.push(fallback)
  return parts.join(', ')
}
