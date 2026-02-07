# 0neThing - 项目状态总览

> 最后更新：2026-02-07 | 当前分支：`feature/typescript-strict` | 版本：0.1.0

---

## 一、已有功能列表

### 1. 核心对话系统
- 多轮对话（流式响应 + 中断控制）
- 消息编辑与重新发送
- 对话分支 (Branch)
- 自动生成对话标题
- Context Compacting（上下文自动压缩，长对话防溢出）
- Token 用量统计与显示
- AI 思考过程展示 (Reasoning Delta)

### 2. 多 AI 提供商支持
| 提供商 | 状态 |
|--------|------|
| OpenAI | ✅ |
| Claude (Anthropic) | ✅ |
| DeepSeek | ✅ |
| Gemini (Google) | ✅ |
| GitHub Copilot | ✅ |
| OpenRouter | ✅ |
| Kimi (月之暗面) | ✅ |
| 智谱 (ZhiPu) | ✅ |
| Claude Code (特殊模式) | ✅ |
| 自定义 OpenAI 兼容提供商 | ✅ |

- 基于 Vercel AI SDK (`ai` v6) 统一接入
- OAuth 认证流程（GitHub Copilot 等）
- 模型注册中心（含 OpenRouter 能力查询）
- 全局默认模型 & 会话级模型切换

### 3. 工具系统 (Tool Calling)
| 工具 | 说明 |
|------|------|
| bash / bash-v2 | 终端命令执行 |
| read | 文件读取 |
| write | 文件写入 |
| edit | 文件编辑（diff 替换） |
| glob | 文件模式匹配搜索 |
| grep | 内容正则搜索 |
| calculator | 数学计算 |
| get-current-time | 获取当前时间 |
| screenshot | 屏幕截图 |
| keyboard | 键盘模拟 |
| mouse | 鼠标模拟 |
| memory | 记忆读写 |
| plan | 计划制定 |
| delegate | 子代理委托 |
| skill | 技能调用 |
| custom-agent | 自定义代理调用 |

- 权限系统：工具执行前需用户确认，支持 session 级授权
- 沙箱机制：工具执行环境隔离
- 工具结果流式展示（ToolCallGroup / ToolCallItem）

### 4. 记忆系统
- **向量记忆** (sqlite-vec)：语义搜索、Embedding 服务、Mem0 风格衰减
- **文本记忆** (Markdown)：文件级记忆管理、关键词索引、标签系统
- **用户画像**：自动提取用户事实、手动管理
- **Agent 记忆**：独立记忆空间、关系追踪、交互记录
- **记忆反馈**：记忆检索质量评估
- 导入/导出、索引重建、统计信息

### 5. 自定义代理 (CustomAgent)
- 自定义系统提示词
- 可选工具集配置
- 独立记忆空间
- 代理内工具执行权限管理
- Pin 到侧边栏快速切换
- 创建/编辑/删除 UI

### 6. MCP (Model Context Protocol)
- MCP Server 管理（添加/连接/断开/刷新）
- MCP Tools / Resources / Prompts 支持
- 配置文件读取

### 7. 插件系统
- 本地 & npm 插件加载
- 插件 Hooks 机制
- Shell Context 注入
- 安装/卸载/启用/禁用/配置管理

### 8. Skills 系统
- 类 Claude Code 的 Skill 扩展
- Skill 创建/删除/启用管理
- Prompt Builder 动态构建

### 9. 会话管理
- 多会话、会话切换
- 置顶 / 归档 / 重命名
- 会话级模型配置 & 工作目录配置
- Builtin Mode 切换

### 10. 工作区 (Workspace)
- 多工作区管理
- 工作区切换、头像自定义
- 工作区级隔离

### 11. UI / UX
- 侧边栏（会话列表、可拖拽调整宽度）
- 右侧面板（文件树浏览、文档预览、Git 状态）
- 主题系统（自定义主题、系统主题跟随）
- 快捷键设置
- 图片预览 / 图片画廊
- Diff 显示 (DiffView / DiffOverlay)
- 信息图 (Infographic) 渲染
- Markdown 渲染（代码高亮、LaTeX 数学公式）
- 命令选择器 (CommandPicker) / 文件选择器 (FilePicker) / 路径选择器
- Plan 面板
- Agent 执行面板
- Commit 对话框
- 错误边界组件
- Lottie 动画支持

---

## 二、技术架构

### 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Electron 39 |
| 前端 | Vue 3 + TypeScript (strict mode) + Pinia |
| AI SDK | Vercel AI SDK v6 (`ai`, `@ai-sdk/*`) |
| 数据库 | SQLite (better-sqlite3) + sqlite-vec |
| 构建 | electron-vite (Vite 7 + tsc + esbuild) |
| 包管理 | Bun |
| 测试 | Vitest 4 |
| 代码质量 | ESLint 9 |
| Schema | Zod v4 |

### 三进程模型

```
Renderer (Vue 3 SPA)
    ↕ IPC (contextBridge)
Preload (CommonJS, esbuild)
    ↕ ipcMain/ipcRenderer
Main Process (Node.js, tsc)
    ├── Providers (AI SDK)
    ├── Tools (Sandbox)
    ├── Storage (SQLite)
    ├── Services (Memory, Auth, CustomAgent, Triggers)
    ├── MCP Client
    ├── Plugins
    └── Skills
```

### IPC 通信架构
- **channels.ts**: 统一频道常量定义（~100+ 频道）
- **Type-safe Router**: 基于 Zod schema 的类型安全路由层 (Phase 5)
- **Domain 分组**: chat / sessions / settings / models / providers / tools / mcp / memory / plugins / skills / workspaces / themes / oauth 等

### 数据流
```
用户输入 → chatStore → electronAPI.sendMessageStream()
→ IPC → stream-executor → Provider.streamChatResponse()
→ tool_call? → ToolRegistry.execute() → 权限检查 → 沙箱执行
→ 流式 chunk 回传 → UI 实时更新
→ 对话结束 → Triggers (记忆提取等)
```

### 目录结构概要

```
src/
├── main/           # 主进程 (~35 IPC handlers)
│   ├── ipc/        # 路由处理器
│   ├── providers/  # 10 个 AI 提供商
│   ├── tools/      # 17 个内置工具 + 核心框架
│   ├── services/   # 业务逻辑 (memory, auth, prompt, triggers, tool-agent, custom-agent)
│   ├── storage/    # SQLite 持久化
│   ├── mcp/        # MCP 客户端
│   ├── plugins/    # 插件加载器
│   └── skills/     # Skills 系统
├── renderer/       # 渲染进程
│   ├── stores/     # 10 个 Pinia stores
│   ├── components/ # ~90+ Vue 组件
│   └── composables/
├── shared/         # 共享类型 & IPC 定义 (~25 模块)
└── preload/        # 预加载脚本
```

---

## 三、待完成 / 进行中任务

### 当前进行中 (feature/typescript-strict 分支)

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 添加 Vitest 测试框架 | ✅ 完成 |
| Phase 2 | 启用 TypeScript strict mode | ✅ 完成 |
| Phase 3 | 修复 Vue 渲染器 TS strict 错误 | ✅ 完成 |
| Phase 4 | 重构 InputBox.vue 为 composables + 子组件 | ✅ 完成 |
| Phase 5 | 添加类型安全 IPC Router 层 | ✅ 完成 |
| Phase 6+ | 继续迁移剩余 IPC handlers 到 Router | 🔲 待完成 |

### 测试覆盖

目前仅有 4 个测试文件：
- `src/main/tools/core/__tests__/replacers.test.ts`
- `src/main/tools/core/__tests__/sandbox.test.ts`
- `src/main/tools/__tests__/registry.test.ts`
- `src/main/permission/__tests__/permission.test.ts`
- `src/shared/ipc/__tests__/router.test.ts`

**需要大幅增加测试覆盖**，优先级：
1. Services 层 (memory, custom-agent, triggers)
2. Provider 集成
3. 渲染器 stores
4. E2E 测试

### 待完成功能 / 改进

| 类别 | 任务 | 优先级 |
|------|------|--------|
| **架构** | IPC handlers 全量迁移到 type-safe Router | 高 |
| **架构** | 统一错误处理机制 | 中 |
| **测试** | 核心模块单元测试 (services, tools, providers) | 高 |
| **测试** | 组件测试 (Vue Test Utils) | 中 |
| **测试** | E2E 测试 (Playwright / Electron) | 低 |
| **功能** | 图片生成 (已有 IPC 通道，需完善) | 中 |
| **功能** | 文件回滚 (已有 IPC 通道) | 中 |
| **性能** | 大对话列表虚拟滚动 | 中 |
| **质量** | 移除废弃的 memory feedback 旧 IPC 通道 | 低 |
| **发布** | 完善 CI/CD (目前仅有 test workflow) | 中 |
| **发布** | 自动更新机制 | 中 |
| **文档** | 用户文档 / 使用指南 | 低 |
