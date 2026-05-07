# 本次会话所有改动记录

## 一、功能移除

### 1. Memory 系统（完整移除）
**删除的文件/目录：**
- `src/main/services/memory/` — embedding service
- `src/main/services/memory-text/` — text memory storage, retriever, writer, manager, index, feedback, export
- `src/main/tools/builtin/memory.ts` — memory tool
- `src/main/services/triggers/text-memory-update.ts` — post-chat memory extraction trigger
- `src/main/ipc/memory.ts` — memory IPC handlers
- `src/main/ipc/agent-memory.ts` — agent memory IPC handlers
- `src/main/ipc/memory-feedback.ts` — memory feedback IPC handlers
- `src/main/ipc/chat/memory-helpers.ts` — chat memory helpers（`getTextFromContent` 移到 message-helpers.ts）
- `src/shared/ipc/memory.ts` — memory type definitions
- `src/shared/ipc/agent-memory.ts` — agent memory types
- `src/shared/ipc/memory-feedback.ts` — memory feedback types
- `src/renderer/stores/memory-manager.ts` — memory Pinia store
- `src/renderer/components/MemoryContent.vue`
- `src/renderer/components/MemoryEditor.vue`
- `src/renderer/components/windows/MemoryEditorWindow.vue`
- `src/renderer/components/chat/message/RetrievedMemoriesPanel.vue`
- `src/renderer/components/settings/EmbeddingSettingsPanel.vue`

**编辑的文件：**
- `src/main/ipc/handlers.ts` — 移除 memory handler 注册
- `src/main/index.ts` — 移除 `initializeTextMemory()` 调用
- `src/main/tools/builtin/index.ts` — 移除 MemoryTool
- `src/shared/ipc/channels.ts` — 移除 17 个 memory IPC channels
- `src/shared/ipc/index.ts` — 移除 memory type exports
- `src/preload/index.ts` — 移除 memory API methods、memoryFeedback router、openMemoryEditor
- `src/main/ipc/chat/tool-loop.ts` — 移除 memory filtering、agent interaction recording
- `src/main/engine/stream-engine.ts` — 移除 memory context loading（formatUserProfilePrompt 等）
- `src/main/services/prompt/builders.ts` — 移除 userProfilePrompt、agentMemoryPrompt
- `src/main/services/prompt/types.ts` — 移除 memory variables
- `src/main/ipc/chat/message-helpers.ts` — 移除 agentMemoryPrompt，添加 getTextFromContent
- `src/main/window.ts` — 移除 openMemoryEditorWindow
- `src/main/ipc/window.ts` — 移除 memory editor handler
- `src/main/storage/interfaces.ts` — 移除 IAgentMemoryStorage
- `src/main/storage/file-storage.ts` — 移除 FileAgentMemoryStorage
- `src/main/storage/sqlite-storage.ts` — 移除 SQLiteAgentMemoryStorage、embedding service stub
- `src/main/stores/paths.ts` — 移除 getAgentMemoryDir/Path
- `src/renderer/App.vue` — 移除 MemoryEditorWindow、openMemoryFile
- `src/renderer/components/MediaPanel.vue` — 移除 Memory tab
- `src/renderer/components/SettingsPage.vue` — 移除 Embedding tab
- `src/renderer/components/SettingsPanel.vue` — 移除 Embedding tab
- `src/renderer/components/chat/message/MessageBubble.vue` — 移除 RetrievedMemoriesPanel
- `src/renderer/types/index.ts` — 移除 memory type re-exports
- `src/shared/defaults/settings.ts` — EmbeddingSettings 保留但 UI 入口移除

### 2. Custom Agents 系统（完整移除）
**删除的文件/目录：**
- `src/main/services/custom-agent/` — executor, loader, tool-builder, custom-tool-executor
- `src/main/ipc/custom-agents.ts`
- `src/main/stores/custom-agents.ts`
- `src/main/tools/builtin/custom-agent.ts` — CustomAgentTool
- `src/shared/ipc/custom-agents.ts`
- `src/shared/ipc/agents.ts`
- `src/renderer/stores/custom-agents.ts`
- `src/renderer/components/AgentsContent.vue`
- `src/renderer/components/AgentGrid.vue`
- `src/renderer/components/CustomAgentCard.vue`
- `src/renderer/components/CustomAgentDialog.vue`
- `src/renderer/components/agent/` — CreateAgentPage, CreateAgentModal, BasicSection, PromptSection, ToolsSection, SettingsSection
- `src/renderer/components/windows/AgentEditorWindow.vue`
- `src/renderer/components/chat/AgentDropdown.vue`
- `src/renderer/components/chat/AgentExecutionPanel.vue`
- `src/renderer/components/chat/CreateAgentPage.vue`

**编辑的文件：**
- `src/main/ipc/handlers.ts` — 移除 registerCustomAgentHandlers, initializeCustomAgents
- `src/main/index.ts` — 移除 initializeCustomAgents 调用
- `src/main/tools/builtin/index.ts` — 移除 CustomAgentTool
- `src/shared/ipc/channels.ts` — 移除 12 个 CUSTOM_AGENT channels + OPEN_AGENT_EDITOR + AGENT_EDITOR_SAVED/CREATED
- `src/shared/ipc/index.ts` — 移除 agent type exports
- `src/preload/index.ts` — 移除所有 custom agent API methods + openAgentEditor + updateSessionAgent
- `src/main/ipc/chat/tool-loop.ts` — 移除 agent system prompt、agent context、agentIdForInteraction
- `src/main/engine/stream-engine.ts` — 移除 agent system prompt injection
- `src/main/window.ts` — 移除 openAgentEditorWindow
- `src/main/ipc/window.ts` — 清空（只剩 no-op）
- `src/main/agents/builtin-agents.ts` — BuiltinAgentMode 本地化定义（后来整个删除）
- `src/main/tools/builtin/skill.ts` — AgentPermissions 本地化定义
- `src/renderer/App.vue` — 移除 AgentEditorWindow、openAgentDialog、customAgentsStore、showAgentSettings
- `src/renderer/components/MediaPanel.vue` — 移除 Agents tab
- `src/renderer/components/sidebar/Sidebar.vue` — 移除 AgentGrid、customAgentsStore
- `src/renderer/components/chat/ChatWindow.vue` — 移除 rightSidebarStore（同时做了 right sidebar 移除）
- `src/renderer/components/chat/ChatHeader.vue` — 移除 agent-related props
- `src/renderer/types/index.ts` — 移除 agent type re-exports + ElectronAPI agent methods
- `src/renderer/composables/useTTS.ts` — AgentVoice 本地化定义

### 3. Workspace 系统（完整移除）
**删除的文件：**
- `src/shared/ipc/workspaces.ts`
- `src/main/ipc/workspaces.ts`
- `src/main/stores/workspaces.ts`
- `src/renderer/stores/workspaces.ts`
- `src/renderer/components/WorkspaceDialog.vue`
- `src/renderer/components/WorkspaceSwitcher.vue`
- `src/renderer/components/CreatePanel.vue`

**编辑的文件：**
- `src/main/ipc/handlers.ts` — 移除 registerWorkspaceHandlers
- `src/shared/ipc/channels.ts` — 移除 6 个 WORKSPACE channels + UPDATE_SESSION_AGENT
- `src/shared/ipc/index.ts` — 移除 workspace type exports
- `src/preload/index.ts` — 移除 workspace API methods、createSession 简化
- `src/main/ipc/sessions.ts` — 移除 workspace directory inheritance、UPDATE_SESSION_AGENT handler
- `src/main/stores/sessions.ts` — 移除 workspace import、createSession 简化、updateSessionAgent、deleteSessionsByWorkspace
- `src/main/stores/index.ts` — 移除 workspace exports、deleteSessionsByWorkspace、updateSessionAgent
- `src/main/store.ts` — 移除 workspace exports、updateSessionAgent
- `src/main/stores/paths.ts` — 移除 workspace/agent path functions + ensureStoreDirs entries
- `src/main/stores/app-state.ts` — 移除 currentWorkspaceId、pinnedAgentIds
- `src/main/ipc/chat/tool-loop.ts` — 移除 workspace system prompt injection
- `src/main/engine/stream-engine.ts` — 移除 workspace system prompt
- `src/renderer/App.vue` — 移除 WorkspaceDialog、workspacesStore、showWorkspaceDialog
- `src/renderer/components/sidebar/Sidebar.vue` — 移除 WorkspaceSwitcher
- `src/renderer/stores/sessions.ts` — 移除 workspace filtering、简化 createSession
- `src/renderer/components/chat/message/MessageSystem.vue` — 移除 workspacesStore references
- `src/renderer/types/index.ts` — 移除 workspace type re-exports
- `src/main/permission/workspace-permissions.ts` → 重命名为 `directory-permissions.ts`
- `src/main/permission/index.ts` — 更新 import

### 4. Ask/Build 模式（完整移除）
**删除的文件：**
- `src/main/agents/builtin-agents.ts`
- `src/renderer/components/chat/ModeToggle.vue`

**编辑的文件：**
- `src/shared/ipc/channels.ts` — 移除 SET_SESSION_BUILTIN_MODE、GET_SESSION_BUILTIN_MODE
- `src/shared/ipc/chat.ts` — 移除 BuiltinAgentMode type、builtinMode fields
- `src/shared/ipc/index.ts` — 移除 BuiltinAgentMode export
- `src/preload/index.ts` — 移除 setSessionBuiltinMode、getSessionBuiltinMode
- `src/main/ipc/sessions.ts` — 移除 SET/GET_SESSION_BUILTIN_MODE handlers
- `src/main/stores/sessions.ts` — 移除 updateSessionBuiltinMode
- `src/main/stores/index.ts` — 移除 updateSessionBuiltinMode export
- `src/main/store.ts` — 移除 updateSessionBuiltinMode export
- `src/main/ipc/chat/tool-execution.ts` — 移除 checkToolPermission import 和 builtin mode permission check
- `src/main/ipc/chat/tool-loop.ts` — 移除 builtinMode from buildSystemPrompt
- `src/main/engine/stream-engine.ts` — 移除 builtinMode
- `src/main/ipc/chat/message-helpers.ts` — 移除 BuiltinAgentMode import、builtinMode param
- `src/main/services/prompt/builders.ts` — 移除 BuiltinAgentMode、builtinMode
- `src/main/services/prompt/types.ts` — 移除 builtinMode from SystemPromptVariables
- `src/renderer/components/chat/InputBox.vue` — 移除 ModeToggle
- `src/renderer/types/index.ts` — 移除 BuiltinAgentMode、setSessionBuiltinMode、getSessionBuiltinMode

### 5. Plan 功能（完整移除）
**删除的文件：**
- `src/shared/ipc/plan.ts`
- `src/renderer/components/chat/PlanPanel.vue`
- `resources/templates/partials/context/plan-context.hbs`
- `resources/templates/partials/guidance/planning.hbs`

**编辑的文件：**
- `src/shared/ipc/channels.ts` — 移除 PLAN_UPDATED
- `src/shared/ipc/index.ts` — 移除 plan type exports
- `src/shared/ipc/chat.ts` — 移除 SessionPlan import、plan fields
- `src/renderer/types/index.ts` — 移除 plan type re-exports、onPlanUpdated
- `src/renderer/components/chat/InputBox.vue` — 移除 PlanPanel
- `src/preload/index.ts` — 移除 onPlanUpdated
- `src/main/stores/sessions.ts` — 移除 updateSessionPlan、getSessionPlan
- `src/main/ipc/chat/tool-loop.ts` — 移除 sessionPlan
- `src/main/ipc/chat/message-helpers.ts` — 移除 sessionPlan
- `src/main/engine/stream-engine.ts` — 移除 sessionPlan
- `src/main/services/prompt/builders.ts` — 移除 SessionPlan、transformPlan、sessionPlan
- `src/main/services/prompt/types.ts` — 移除 TemplatePlan、sessionPlan、PlanItemStatus
- `src/main/services/prompt/index.ts` — 移除 plan re-exports
- `src/main/services/prompt/helpers.ts` — 移除 planIcon helper
- `resources/templates/main/system-prompt.hbs` — 移除 ask-mode、planning、plan-context references

### 6. 其他工具移除
**删除的文件：**
- `src/main/tools/builtin/plan.ts` — Plan tool
- `src/main/tools/builtin/mouse.ts` — Mouse tool
- `src/main/tools/builtin/keyboard.ts` — Keyboard tool
- `src/main/tools/builtin/screenshot.ts` — Screenshot tool

**编辑：** `src/main/tools/builtin/index.ts` — 移除所有上述工具的 import 和注册

### 7. Right Sidebar（完整移除）
**删除的文件/目录：**
- `src/renderer/components/right-panel/` — RightPanel, index
- `src/renderer/components/right-sidebar/` — RightSidebar, tabs (GitTab, FilesTab, DocumentsTab), files (FileTreeItem), index
- `src/renderer/stores/right-sidebar.ts`

**编辑的文件：**
- `src/renderer/App.vue` — 移除 RightPanel、CommitDialog、DiffOverlay、Cmd+Shift+E
- `src/renderer/components/chat/ChatHeader.vue` — 移除 toggleRightSidebar button
- `src/renderer/components/chat/ChatWindow.vue` — 移除 rightSidebarStore
- `src/renderer/services/commands/files.ts` — 移除 rightSidebarStore（后来整个文件删除）
- `src/renderer/services/commands/git.ts` — 移除 rightSidebarStore（后来整个文件删除）

### 8. Commands 移除
**删除的文件：**
- `src/renderer/services/commands/files.ts` — /files command
- `src/renderer/services/commands/git.ts` — /git command
- `src/renderer/services/commands/cd.ts` — /cd command
- `src/renderer/components/chat/message/GitStatusPanel.vue`
- `src/renderer/components/chat/message/FilesChangedPanel.vue`

**编辑的文件：**
- `src/renderer/services/commands/index.ts` — commands 列表清空
- `src/renderer/components/chat/message/MessageSystem.vue` — 移除 git/files panels 和相关代码

### 9. MediaPanel 无用 tabs 移除
**删除的文件：**
- `src/renderer/components/infographic/InfographicEditor.vue`

**编辑：** `src/renderer/components/MediaPanel.vue` — 移除 Downloads、Infographics、Easels、Spaces、Boosts tabs

### 10. 残留模板清理
**删除的文件：**
- `resources/templates/main/ask-mode.hbs`
- `resources/templates/main/custom-agent.hbs`
- `resources/templates/partials/context/custom-tools.hbs`
- `resources/templates/memory/keyword-extraction.hbs`（及 memory/ 目录）

**编辑：** `src/main/services/prompt/types.ts` — 移除 CustomAgentVariables、KeywordExtractionVariables、TemplateCustomTool 等

## 二、InputBox 简化

**编辑：** `src/renderer/components/chat/InputBox.vue`
- 移除 hidden file input + AttachmentPreview + useAttachments composable
- 移除 Paperclip button
- 移除 ToolsMenu
- 移除 SkillsMenu
- 移除 ContextIndicator
- 移除 PlanPanel
- 简化 emits（移除 toolsEnabledChange、openToolSettings、attachments 参数）
- 简化 sendMessage（不再传 attachments）
- 移除 handlePaste

## 三、UI 调整

### 窗口白线修复
`src/main/window.ts` — Settings、Agent Editor（后来删除）、Image Preview 窗口加 `transparent: isMac, backgroundColor: isMac ? undefined : backgroundColor`

### Chat header 简化
`src/renderer/components/chat/ChatHeader.vue` — 去掉 border-bottom、去掉 AddressBar（WorkingDir + editable title）、替换为绝对定位居中 session 名称

### Empty state 简化
`src/renderer/components/chat/empty-state-themes/DefaultTheme.vue` — 从 logo+title+4 cards+动画球 简化为空 div

### Sidebar 调整
- `src/renderer/components/sidebar/SidebarHeader.vue` — 移除 search bar，只保留 traffic lights space
- `src/renderer/components/sidebar/SessionList.vue` — 移除顶部 New Chat 按钮
- `src/renderer/components/sidebar/Sidebar.vue` — 底部加 Media 按钮 + 设置按钮

### Cmd+W 恢复默认
- `src/main/window.ts` — 移除 "Close Chat" 菜单项
- `src/renderer/App.vue` — 移除 onMenuCloseChat listener

### Settings 功能
- `src/renderer/App.vue` — 添加 openSettings() 函数

## 四、Settings 页面重构

### SettingsPage.vue 布局
从 toolbar 改回 sidebar 布局，macOS System Settings 风格

### 移除 tabs
- Chat settings tab
- Embedding/Memory tab（memory 移除时已删）

### General tab 简化
`src/renderer/components/settings/GeneralSettingsTab.vue` — 移除 Animation Speed、Accent Color、Message Display（density + line height）

### Provider tab 重构（macOS 分组容器风格）
- `GlobalDefaultSelector.vue` — 垂直两行分组容器
- `AIProviderTab.vue` — 分组容器布局、输入框融入行内
- `ProviderModels.vue` — 搜索+模型列表在同一分组容器

### 去方框化（所有 tabs）
- `GeneralSettingsTab.vue` — theme-card、density-card、radio-item 去 border
- `AIProviderTab.vue` — provider-detail 去 border
- `GlobalDefaultSelector.vue` — 去 border/gradient
- `ProviderList.vue` — 去 border
- `ToolsSettingsTab.vue` — tool-item 去 border，改底部分割线
- `ShortcutsSettingsTab.vue` — shortcut-row 去 border，改底部分割线

## 五、日志优化

- `src/main/themes/index.ts` — 合并为 1 行初始化日志
- `src/main/themes/resolver.ts` — 修复 "Unknown color reference" 误报
- `src/main/services/prompt/prompt-manager.ts` — 合并为 1 行初始化日志
- `src/main/tools/registry.ts` — 合并为 1 行，移除执行日志
- `src/main/ipc/mcp.ts` — 精简
- `src/main/plugins/index.ts` + `loader/index.ts` — 精简
- `src/main/ipc/skills.ts` + `src/main/skills/loader.ts` — 精简
- `src/main/ipc/plugins.ts` — 移除 verbose logs

## 六、重命名
- `src/main/permission/workspace-permissions.ts` → `src/main/permission/directory-permissions.ts`

## 七、UI 重构（Phase 0-5 + 深度修复）

### Phase 0: 基础设施
- **安装依赖**: `reka-ui@2.9.2`, `@vueuse/motion@3.0.3`
- **Z-Index 层级体系**: `src/renderer/styles/variables.css` 新增 9 个语义化变量 (`--z-base` ~ `--z-max`)，替换 45 个文件中 73 处硬编码 z-index
- **Typography Scale**: `--font-size-xs(11px)` ~ `--font-size-2xl(20px)`
- **动画时长变量**: `--duration-fast/normal/slow`, `--ease-default/spring/out`
- **文档**: 新建 `docs/uioptimize/` (README + phase-0~5.md)

### Phase 1: 页面打开模式统一
- **MemoryEditor/CreateAgentPage → 独立窗口** (后在功能移除中删除)
  - 新建: `src/main/ipc/window.ts`, `src/renderer/components/windows/MemoryEditorWindow.vue`, `AgentEditorWindow.vue`
  - 修改: `src/main/window.ts`, `src/shared/ipc/channels.ts`, `src/preload/index.ts`, `src/renderer/App.vue`, `src/renderer/components/ChatContainer.vue`
- **BaseDialog**: 新建 `src/renderer/components/common/BaseDialog.vue` (Reka UI Dialog)
  - 重写: `DeleteConfirmDialog.vue`, `CommitDialog.vue`, `WorkspaceDialog.vue` 迁移使用 BaseDialog
- **MediaPanel 动画**: `src/renderer/components/MediaPanel.vue` 添加 slide-in/slide-out CSS

### Phase 2: 交互动画基础
- `AgentDropdown.vue` — `<Transition>` enter/leave 动画，移除旧 keyframes
- `ToolsMenu.vue` — `<Transition name="tools-menu">` enter/leave
- `SkillsMenu.vue` — 同上
- `SessionContextMenu.vue` — `<Transition name="ctx-menu">` spring enter + fast leave
- **新建** `src/renderer/components/common/BaseTooltip.vue` (Reka UI Tooltip)
- `CommandPicker.vue`, `FilePicker.vue`, `SkillPicker.vue`, `PathPicker.vue` — `<Transition name="picker-slide">`

### Phase 3: Chat 核心体验
- `MessageList.vue` — TransitionGroup leave/move 动画 (后全部移除)
- `ToolCallItem.vue` — 状态指示器 `<Transition name="status-swap" mode="out-in">` + executing pulse + error shake
- `AgentExecutionPanel.vue` — expand/collapse 过渡
- `MessageThinking.vue` — 增强 container-fade-enter (translateY)

### Phase 4: 布局优化
- `ChatContainer.vue` — `.panel-resizer` hover/active accent 高亮 + 宽度 4→6px
- `Sidebar.vue` — 过渡改用 CSS 变量
- `RightPanel.vue` — slide 动画 + resize handle 视觉反馈
- `SidebarResizeHandle.vue` — accent 高亮

### Phase 5: 视觉打磨
- `components.css` — `.btn` `:focus-visible` 双环 + `:active` scale(0.97)
- `main.css` — `.icon-btn` `:focus-visible` + `:active` scale(0.95)
- `components.css` — `.form-input:focus` accent glow box-shadow
- `components.css` — `.error-message`/`.success-message` slideIn 动画
- 硬编码颜色: `#ef4444` → `var(--danger)` (components.css, AgentGrid, AgentsContent), `#22c55e` → `var(--text-success)` (CreateAgentPage)

### 深度修复
- **Fix 1 — 消息列表动画**: `MessageList.vue` — 最终完全移除 TransitionGroup 动画 (`name=""`)，移除 `isInitialLoad` 和所有 `msg-list-*`/`msg-instant-*` CSS
- **Fix 2 — Tool Call 展开/收缩**: `ToolCallItem.vue` — `.slide-*` 移除 max-height 动画，改为纯 opacity 淡入淡出
- **Fix 3 — ContentPart 渲染顺序**: `MessageBubble.vue` — 移除 `firstTextPart` 分离逻辑，所有 contentParts 按原始顺序统一渲染，添加 `isLastTextPart()` helper
- **Fix 4 — 布局抖动**: `MessageThinking.vue` — `.container-fade-leave-active` 移除 `position: absolute`; `MessageBubble.vue` — `.content-wrapper` 移除 `transition: max-height`

### 新建文件汇总（全部已在后续功能移除中删除）

> **注意**: 以下文件在 UI 重构阶段创建，但后来在"一、功能移除"阶段（Memory/Agent/Workspace 整体删除）中被一并清理，**当前代码库中已不存在**。

| 文件 | 用途 | 状态 |
|------|------|------|
| `src/main/ipc/window.ts` | 独立窗口 IPC handler | ❌ 已删除（Agent/Memory 移除时） |
| `src/renderer/components/windows/MemoryEditorWindow.vue` | Memory Editor 窗口容器 | ❌ 已删除（Memory 移除时） |
| `src/renderer/components/windows/AgentEditorWindow.vue` | Agent Editor 窗口容器 | ❌ 已删除（Agent 移除时） |
| `src/renderer/components/common/BaseDialog.vue` | Reka UI 统一弹窗 | ❌ 已删除（Workspace 移除时，WorkspaceDialog/CommitDialog 一起删） |
| `src/renderer/components/common/BaseTooltip.vue` | Reka UI 统一 Tooltip | ❌ 已删除 |
| `docs/uioptimize/README.md` ~ `phase-5.md` | UI 优化文档 (7 文件) | ❌ 已删除 |

### 仍然存活的改动
以下改动涉及的文件仍在代码库中，效果仍然生效：
- **z-index 变量体系** — `variables.css` 中的 9 个变量 + 全部组件的替换
- **Typography / Animation 变量** — `variables.css`
- **按钮 focus/active 状态** — `components.css`, `main.css`
- **表单 focus glow** — `components.css`
- **error/success slideIn** — `components.css`
- **MessageList TransitionGroup 动画移除** — `MessageList.vue` (`name=""`)
- **ToolCallItem slide → opacity** — `ToolCallItem.vue`
- **ToolCallItem status-swap Transition** — `ToolCallItem.vue`
- **MessageBubble contentParts 顺序修复** — `MessageBubble.vue`（firstTextPart 移除）
- **MessageThinking 布局抖动修复** — `MessageThinking.vue`（position:absolute 移除）
- **MessageBubble max-height transition 移除** — `MessageBubble.vue`
- **Picker 动画** — `CommandPicker.vue`, `FilePicker.vue`, `SkillPicker.vue`, `PathPicker.vue`
- **ContextMenu 动画** — `SessionContextMenu.vue`
- **MediaPanel slide 动画** — `MediaPanel.vue`
- **Sidebar/SidebarResizeHandle 过渡** — `Sidebar.vue`, `SidebarResizeHandle.vue`
- **ChatContainer panel-resizer** — `ChatContainer.vue`
