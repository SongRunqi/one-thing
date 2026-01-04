# Vue Composables 文档

## 概述

Composables 是 Vue 3 的可复用逻辑单元，位于 `src/renderer/composables/` 目录。本项目中的 Composables 遵循以下原则：

1. **薄封装**：大部分逻辑委托给 Pinia Store
2. **单一职责**：每个 Composable 专注于一个功能域
3. **响应式**：充分利用 Vue 的响应式系统

## 目录结构

```
src/renderer/composables/
├── useChatSession.ts      # 会话级聊天状态代理
├── useShortcuts.ts        # 全局键盘快捷键
├── useMarkdownRenderer.ts # Markdown 渲染工具
└── useTTS.ts              # 文字转语音 (TTS)
```

## Composable 详解

### 1. useChatSession

**文件**：`useChatSession.ts`

为单个会话提供状态访问和操作的代理层。

```typescript
function useChatSession(sessionIdRef: MaybeRef<string | undefined>) {
  // 返回
  return {
    // 响应式状态
    messages: ComputedRef<ChatMessage[]>
    isLoading: ComputedRef<boolean>
    isGenerating: ComputedRef<boolean>
    error: ComputedRef<string | null>
    errorDetails: ComputedRef<string | null>

    // 计算属性
    messageCount: ComputedRef<number>
    userMessages: ComputedRef<ChatMessage[]>
    assistantMessages: ComputedRef<ChatMessage[]>

    // 操作方法
    sendMessage(content: string, attachments?: MessageAttachment[]): Promise<boolean>
    editAndResend(messageId: string, newContent: string): Promise<boolean>
    regenerate(messageId: string): Promise<boolean>
    stopGeneration(): Promise<boolean>
    clearError(): void
    updateMessage(messageId: string, updates: Partial<ChatMessage>): void
    loadMessages(): Promise<void>
  }
}
```

**设计说明**：
- 接受 `MaybeRef<string>` 参数，支持响应式 sessionId
- 自动监听 sessionId 变化，触发消息加载
- 所有操作委托给 `useChatStore()`
- IPC 监听器由全局 IPC Hub 管理，无需手动设置

**使用示例**：

```vue
<script setup lang="ts">
import { useChatSession } from '@/composables/useChatSession'
import { useSessionsStore } from '@/stores/sessions'
import { storeToRefs } from 'pinia'

const sessionsStore = useSessionsStore()
const { currentSessionId } = storeToRefs(sessionsStore)

// 自动响应当前会话变化
const {
  messages,
  isGenerating,
  sendMessage,
  stopGeneration,
} = useChatSession(currentSessionId)

async function handleSend(text: string) {
  await sendMessage(text)
}
</script>
```

---

### 2. useShortcuts

**文件**：`useShortcuts.ts`

全局键盘快捷键管理。

```typescript
interface ShortcutHandlers {
  onNewChat?: () => void
  onCloseChat?: () => void
  onToggleSidebar?: () => void
  onFocusInput?: () => void
  onOpenSettings?: () => void
}

function useShortcuts(handlers: ShortcutHandlers = {}) {
  return {
    matchShortcut: (event: KeyboardEvent, shortcut: KeyboardShortcut) => boolean
    formatShortcut: (shortcut: KeyboardShortcut) => string
  }
}
```

**内置快捷键**：

| 功能 | 快捷键 | 说明 |
|------|--------|------|
| 新建对话 | 可配置 | 创建新会话 |
| 关闭对话 | 可配置 | 删除当前会话 |
| 切换侧边栏 | 可配置 | 显示/隐藏侧边栏 |
| 聚焦输入框 | 可配置 | 跳转到输入框 |
| 打开设置 | Cmd/Ctrl + , | 打开设置页面 |

**快捷键匹配逻辑**：

```typescript
function matchShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  if (!shortcut || !shortcut.key) return false

  // 匹配按键
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false

  // 匹配修饰键
  if (!!shortcut.ctrlKey !== event.ctrlKey) return false
  if (!!shortcut.altKey !== event.altKey) return false
  if (!!shortcut.shiftKey !== event.shiftKey) return false
  if (!!shortcut.metaKey !== event.metaKey) return false

  return true
}
```

**使用示例**：

```vue
<script setup lang="ts">
import { useShortcuts } from '@/composables/useShortcuts'

useShortcuts({
  onNewChat: () => createNewChat(),
  onToggleSidebar: () => toggleSidebar(),
  onOpenSettings: () => router.push('/settings'),
})
</script>
```

---

### 3. useMarkdownRenderer

**文件**：`useMarkdownRenderer.ts`

Markdown 渲染和文本处理工具。

```typescript
function useMarkdownRenderer() {
  return {
    renderMarkdown: (content: string, isUserMessage?: boolean) => string
    escapeHtml: (text: string) => string
    cleanReasoningContent: (content: string) => string
    stripMarkdown: (content: string) => string
  }
}
```

**功能说明**：

| 函数 | 用途 |
|------|------|
| `renderMarkdown` | 渲染 Markdown 到 HTML，用户消息仅转义+换行 |
| `escapeHtml` | HTML 实体转义 |
| `cleanReasoningContent` | 清理推理模型的 XML 标签 (`<think>`, `<thinking>`) |
| `stripMarkdown` | 去除 Markdown 格式（用于 TTS） |

**代码块渲染**：

```typescript
// 自定义 fence 渲染器
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const code = token.content
  const lang = token.info.trim() || 'text'

  // 使用 highlight.js 高亮
  let highlighted = hljs.highlight(code, { language: lang }).value

  // 返回带复制按钮的代码块
  return `<div class="code-block-container">
    <div class="code-block-header">
      <div class="code-block-lang">${lang}</div>
      <button class="code-block-copy" data-code="${encodeURIComponent(code)}">Copy</button>
    </div>
    <pre><code class="hljs language-${lang}">${highlighted}</code></pre>
  </div>`
}
```

---

### 4. useTTS

**文件**：`useTTS.ts`

文字转语音功能，使用 Web Speech API。

```typescript
interface VoiceOption {
  voiceURI: string
  name: string
  lang: string
  localService: boolean
  default: boolean
}

function useTTS() {
  return {
    // 状态
    isSupported: Ref<boolean>
    isSpeaking: Ref<boolean>
    isPaused: Ref<boolean>
    availableVoices: Ref<VoiceOption[]>

    // 操作
    speak: (text: string, voiceConfig?: AgentVoice) => Promise<void>
    stop: () => void
    pause: () => void
    resume: () => void
    togglePause: () => void

    // 辅助函数
    getVoicesByLang: (lang: string) => VoiceOption[]
    getChineseVoices: () => VoiceOption[]
    getEnglishVoices: () => VoiceOption[]
    previewVoice: (voiceURI: string, sampleText?: string) => Promise<void>
  }
}
```

**语音配置**：

```typescript
interface AgentVoice {
  enabled: boolean
  voiceURI?: string
  rate?: number    // 0.1 - 10
  pitch?: number   // 0 - 2
  volume?: number  // 0 - 1
}
```

**使用示例**：

```vue
<script setup lang="ts">
import { useTTS } from '@/composables/useTTS'
import { stripMarkdown } from '@/composables/useMarkdownRenderer'

const { speak, stop, isSpeaking, availableVoices } = useTTS()

async function readAloud(message: string) {
  const plainText = stripMarkdown(message)
  await speak(plainText, {
    enabled: true,
    rate: 1.2,
    pitch: 1,
  })
}
</script>
```

**特性**：
- **全局状态**：`isSpeaking`、`isPaused` 等状态在组件间共享
- **语音懒加载**：Chrome 异步加载语音列表，自动处理
- **Agent 语音**：支持为不同 Agent 配置不同语音

## Composable vs Store

| 特性 | Composable | Pinia Store |
|------|------------|-------------|
| 状态持久性 | 组件生命周期 | 应用生命周期 |
| 共享范围 | 按需导入 | 全局单例 |
| 适用场景 | UI 逻辑、工具函数 | 业务状态、跨组件数据 |
| 响应式 | 返回 Ref/Computed | 内部状态响应式 |

本项目的设计选择：
- **业务状态** → Pinia Store (`chatStore`, `sessionsStore`)
- **UI 辅助** → Composable (`useShortcuts`, `useMarkdownRenderer`)
- **Store 代理** → Composable (`useChatSession` 代理 `chatStore`)

## 相关文档

- [Renderer Stores](./renderer-stores.md) - Pinia 状态管理
- [Components](./components.md) - 组件说明
