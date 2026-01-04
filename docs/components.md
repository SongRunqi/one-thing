# Vue 组件说明

## 概述

本项目的 Vue 组件位于 `src/renderer/components/` 目录，采用模块化组织结构。组件设计遵循以下原则：

- **单一职责**：每个组件专注于一个功能
- **Props Down, Events Up**：使用 props 传递数据，emit 事件向上通信
- **Composition API**：全部使用 `<script setup>` 语法

## 目录结构

```
src/renderer/components/
├── App.vue                    # 根组件
├── ChatContainer.vue          # 聊天主容器
│
├── chat/                      # 聊天相关组件
│   ├── ChatWindow.vue         # 聊天窗口
│   ├── ChatHeader.vue         # 聊天头部
│   ├── InputBox.vue           # 输入框
│   ├── MessageList.vue        # 消息列表
│   ├── MessageItem.vue        # 单条消息
│   ├── StepsPanel.vue         # 工具调用步骤面板
│   ├── ToolCallItem.vue       # 工具调用项
│   ├── ModelSelector.vue      # 模型选择器
│   ├── SkillsMenu.vue         # Skills 菜单
│   ├── ToolsMenu.vue          # 工具菜单
│   ├── EmptyState.vue         # 空状态
│   └── message/               # 消息子组件
│       ├── MessageBubble.vue  # 消息气泡
│       ├── MessageActions.vue # 消息操作按钮
│       └── MessageThinking.vue# 思考中状态
│
├── sidebar/                   # 侧边栏组件
│   ├── Sidebar.vue            # 侧边栏主组件
│   ├── SidebarHeader.vue      # 侧边栏头部
│   ├── SessionList.vue        # 会话列表
│   ├── SessionItem.vue        # 会话项
│   └── SessionContextMenu.vue # 右键菜单
│
├── settings/                  # 设置相关组件
│   ├── SettingsPage.vue       # 设置页面
│   ├── GeneralSettingsTab.vue # 通用设置
│   ├── ChatSettingsTab.vue    # 聊天设置
│   ├── ToolsSettingsTab.vue   # 工具设置
│   ├── ShortcutsSettingsTab.vue # 快捷键设置
│   └── provider/              # AI Provider 设置
│       ├── AIProviderTab.vue  # Provider 标签页
│       ├── ProviderList.vue   # Provider 列表
│       └── ProviderModels.vue # 模型选择
│
├── memory/                    # 记忆系统组件
│   ├── MemoryContent.vue      # 记忆内容页
│   ├── MemoryCard.vue         # 记忆卡片
│   ├── FactCard.vue           # 用户事实卡片
│   └── AddMemoryModal.vue     # 添加记忆弹窗
│
├── common/                    # 通用组件
│   ├── Tooltip.vue            # 工具提示
│   ├── ImagePreview.vue       # 图片预览
│   └── ErrorBoundary.vue      # 错误边界
│
├── AgentDialog.vue            # Agent 创建/编辑弹窗
├── AgentGrid.vue              # Agent 网格展示
├── WorkspaceDialog.vue        # 工作空间弹窗
└── WorkspaceSwitcher.vue      # 工作空间切换器
```

## 核心组件详解

### ChatWindow

聊天窗口的主要容器，整合消息列表和输入框。

```vue
<template>
  <div class="chat-window">
    <ChatHeader />
    <MessageList :messages="messages" />
    <StepsPanel v-if="hasActiveSteps" />
    <InputBox @send="handleSend" />
  </div>
</template>
```

**Props**：
| Prop | 类型 | 说明 |
|------|------|------|
| sessionId | string | 当前会话 ID |

**内部使用**：
- `useChatSession(sessionId)` - 获取会话状态

---

### MessageList

消息列表，处理消息渲染和滚动行为。

```vue
<template>
  <div class="message-list" ref="listRef">
    <MessageItem
      v-for="message in messages"
      :key="message.id"
      :message="message"
      @regenerate="handleRegenerate"
      @branch="handleBranch"
    />
  </div>
</template>
```

**Props**：
| Prop | 类型 | 说明 |
|------|------|------|
| messages | ChatMessage[] | 消息数组 |

**特性**：
- 自动滚动到底部（新消息时）
- 流式消息时平滑滚动
- 支持虚拟滚动（大量消息时）

---

### InputBox

消息输入框，支持多行输入和附件。

```vue
<template>
  <div class="input-box">
    <textarea
      v-model="content"
      @keydown="handleKeydown"
      placeholder="发送消息..."
    />
    <div class="attachments" v-if="attachments.length">
      <!-- 附件预览 -->
    </div>
    <div class="actions">
      <button @click="handleSend">发送</button>
    </div>
  </div>
</template>
```

**Emits**：
| Event | Payload | 说明 |
|-------|---------|------|
| send | { content, attachments } | 发送消息 |

**功能**：
- Enter/Cmd+Enter 发送（可配置）
- 图片粘贴/拖拽上传
- @ 提及（Skills、Tools）
- 上下键历史记录

---

### StepsPanel

工具调用步骤展示面板。

```vue
<template>
  <div class="steps-panel">
    <div
      v-for="step in steps"
      :key="step.id"
      class="step-item"
      :class="step.status"
    >
      <div class="step-header">
        <span class="step-icon">{{ getStepIcon(step) }}</span>
        <span class="step-title">{{ step.title }}</span>
        <span class="step-status">{{ step.status }}</span>
      </div>
      <div class="step-content" v-if="expanded">
        <ToolCallItem :toolCall="step.toolCall" />
      </div>
    </div>
  </div>
</template>
```

**Step 状态**：
| Status | 含义 | 图标 |
|--------|------|------|
| pending | 等待执行 | ⏳ |
| running | 执行中 | 🔄 |
| awaiting-confirmation | 等待用户确认 | ⚠️ |
| completed | 完成 | ✅ |
| failed | 失败 | ❌ |

---

### ModelSelector

模型选择器，支持多 Provider 和模型搜索。

```vue
<template>
  <div class="model-selector">
    <button @click="showPanel = true">
      {{ currentModel }}
    </button>
    <ModelSelectorPanel
      v-if="showPanel"
      :providers="providers"
      :selectedProvider="currentProvider"
      :selectedModel="currentModel"
      @select="handleSelect"
    />
  </div>
</template>
```

**功能**：
- Provider 分组展示
- 模型搜索过滤
- 最近使用记录
- 模型能力标签（Tool、Vision、Reasoning）

---

### Sidebar

侧边栏，包含会话列表和快捷操作。

```vue
<template>
  <aside class="sidebar" :style="{ width: sidebarWidth }">
    <SidebarHeader />
    <SessionList :sessions="filteredSessions" />
    <SidebarResizeHandle @resize="handleResize" />
  </aside>
</template>
```

**功能**：
- 可拖拽调整宽度
- 会话按时间分组（今天、昨天、更早）
- 工作空间切换
- Agent 置顶

---

### AgentDialog

Agent 创建/编辑弹窗。

```vue
<template>
  <div class="agent-dialog">
    <div class="avatar-section">
      <!-- 头像选择：Emoji 或 图片 -->
    </div>
    <input v-model="name" placeholder="Agent 名称" />
    <textarea v-model="systemPrompt" placeholder="System Prompt" />
    <div class="personality-tags">
      <!-- 个性标签 -->
    </div>
    <div class="color-picker">
      <!-- 主题色选择 -->
    </div>
  </div>
</template>
```

**Props**：
| Prop | 类型 | 说明 |
|------|------|------|
| agent | Agent? | 编辑模式时传入 |
| mode | 'create' \| 'edit' | 模式 |

**Emits**：
| Event | Payload | 说明 |
|-------|---------|------|
| save | Agent | 保存 Agent |
| delete | string | 删除 Agent |

## 组件通信模式

### 1. Props 传递

```vue
<!-- 父组件 -->
<MessageItem :message="msg" :readonly="true" />

<!-- 子组件 -->
const props = defineProps<{
  message: ChatMessage
  readonly?: boolean
}>()
```

### 2. 事件向上

```vue
<!-- 子组件 -->
const emit = defineEmits<{
  (e: 'regenerate', messageId: string): void
  (e: 'branch', messageId: string): void
}>()

<!-- 父组件 -->
<MessageItem @regenerate="handleRegenerate" />
```

### 3. Provide/Inject

```vue
<!-- 祖先组件 -->
provide('theme', computed(() => settings.theme))

<!-- 后代组件 -->
const theme = inject('theme')
```

### 4. Store 共享

```vue
<!-- 任意组件 -->
import { useSettingsStore } from '@/stores/settings'
const settingsStore = useSettingsStore()
```

## 组件设计规范

### 命名规范

- 组件文件：PascalCase（如 `ChatWindow.vue`）
- 组件名：与文件名一致
- 多词组合：避免单词组件名

### Props 规范

```typescript
// 推荐：使用 TypeScript 类型定义
const props = defineProps<{
  message: ChatMessage
  readonly?: boolean
}>()

// 可选：添加默认值
const props = withDefaults(defineProps<{
  message: ChatMessage
  readonly?: boolean
}>(), {
  readonly: false
})
```

### Emits 规范

```typescript
// 推荐：类型化 emits
const emit = defineEmits<{
  (e: 'update', value: string): void
  (e: 'delete', id: string): void
}>()
```

### 样式规范

```vue
<style scoped>
/* 使用 scoped 避免样式泄漏 */
.component-name {
  /* 根元素使用组件名作为类名 */
}
</style>
```

## 相关文档

- [Composables](./composables.md) - Vue Composables
- [Renderer Stores](./renderer-stores.md) - Pinia 状态管理
