# 0neThing

> 一个功能强大的 AI 聊天桌面应用，支持多模型、工具调用、记忆系统和 Agent 定制。

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron)
![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green)

## ✨ 特性

### 🤖 多 AI 提供商支持

- **OpenAI** (GPT-4, GPT-4o, o1, o3...)
- **Anthropic Claude** (Claude 3.5 Sonnet, Haiku...)
- **Claude Code** (OAuth 登录，使用 Claude Pro/Max 订阅)
- **DeepSeek** (DeepSeek-V3, DeepSeek-R1...)
- **Google Gemini** (Gemini 2.0 Flash, Pro...)
- **GitHub Copilot** (Device Flow OAuth)
- **OpenRouter** (统一接入多个模型)
- **自定义兼容 API**

### 🛠️ 工具调用系统

内置工具：
- `bash` - Shell 命令执行（沙盒模式）
- `read` / `write` / `edit` - 文件操作
- `glob` / `grep` - 文件搜索
- `get_current_time` - 获取当前时间
- `calculator` - 数学计算

扩展支持：
- **MCP (Model Context Protocol)** - 连接外部工具服务器
- **Skills** - Claude Code 风格的技能系统

### 🧠 记忆系统

- **用户画像 (UserFacts)** - 自动提取并记忆用户信息
- **Agent 记忆** - 每个 Agent 独立的交互记忆
- **向量检索** - 基于语义相似度的记忆召回
- **智能去重** - Mem0 风格的记忆管理（ADD/UPDATE/DELETE/NOOP）

### 🎭 Agent 系统

- 自定义 System Prompt
- 个性标签和主题色
- Emoji 或图片头像
- 独立的记忆空间

### 📁 工作空间

- 项目级隔离
- 独立工作目录
- 会话分组管理

## 🚀 快速开始

### 环境要求

- Node.js 18+
- pnpm 8+

### 安装

```bash
# 克隆仓库
git clone https://github.com/your-username/start-electron.git
cd start-electron

# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build
```

### 配置

首次启动后，在设置页面 (`Cmd/Ctrl + ,`) 配置 AI Provider：

1. 选择一个 AI 提供商
2. 输入 API Key（或使用 OAuth 登录）
3. 选择模型
4. 开始聊天！

## 📖 文档

详细文档位于 `/docs` 目录：

### 架构文档

- [整体架构](./docs/ARCHITECTURE.md) - 项目结构和设计概览
- [Chat 架构](./docs/architecture-chat.md) - 聊天系统详解
- [MCP 架构](./docs/architecture-mcp.md) - MCP 协议支持
- [Skills 架构](./docs/architecture-skills.md) - Skills 系统
- [Tools 架构](./docs/architecture-tools.md) - 工具系统

### 模块文档

| 模块 | 文档 | 说明 |
|------|------|------|
| **Providers** | [providers.md](./docs/providers.md) | AI 提供商系统 |
| **Storage** | [storage.md](./docs/storage.md) | SQLite 存储层 |
| **IPC 类型** | [ipc-types.md](./docs/ipc-types.md) | IPC 类型定义 |
| **IPC 处理器** | [ipc-handlers.md](./docs/ipc-handlers.md) | 主进程 IPC 处理器 |
| **IPC Hub** | [ipc-hub.md](./docs/ipc-hub.md) | 渲染进程事件中心 |
| **主进程 Stores** | [main-stores.md](./docs/main-stores.md) | 主进程状态管理 |
| **渲染进程 Stores** | [renderer-stores.md](./docs/renderer-stores.md) | Pinia 状态管理 |
| **Composables** | [composables.md](./docs/composables.md) | Vue Composables |
| **Components** | [components.md](./docs/components.md) | Vue 组件说明 |
| **Memory Service** | [memory-service.md](./docs/memory-service.md) | 记忆服务 |
| **Auth Service** | [auth-service.md](./docs/auth-service.md) | OAuth 认证 |
| **AI Service** | [ai-service.md](./docs/ai-service.md) | 模型注册 & Token 计算 |
| **Triggers** | [triggers.md](./docs/triggers.md) | 触发器系统 |

## 🏗️ 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 33 |
| 前端框架 | Vue 3 + TypeScript |
| 状态管理 | Pinia |
| AI SDK | Vercel AI SDK |
| 数据存储 | SQLite (better-sqlite3) + sqlite-vec |
| IPC 通信 | Electron IPC |
| 构建工具 | Vite + esbuild |

## 📂 项目结构

```
src/
├── main/                    # Electron 主进程
│   ├── providers/           # AI 提供商
│   ├── storage/             # 存储层
│   ├── stores/              # 主进程状态
│   ├── services/            # 业务服务
│   │   ├── ai/              # AI 服务
│   │   ├── auth/            # 认证服务
│   │   ├── memory/          # 记忆服务
│   │   └── triggers/        # 触发器
│   ├── ipc/                 # IPC 处理器
│   ├── tools/               # 内置工具
│   ├── skills/              # Skills 系统
│   └── mcp/                 # MCP 支持
│
├── renderer/                # Vue 渲染进程
│   ├── stores/              # Pinia 状态
│   ├── composables/         # Vue Composables
│   ├── components/          # Vue 组件
│   └── services/            # 前端服务 (IPC Hub)
│
├── shared/                  # 共享代码
│   └── ipc/                 # IPC 类型定义
│
└── preload/                 # Preload 脚本
```

## 🎯 路线图

- [ ] 多窗口支持
- [ ] 插件系统
- [ ] 云同步
- [ ] 移动端适配
- [ ] 更多 AI 提供商

## 🤝 贡献

欢迎贡献！请阅读 [贡献指南](./CONTRIBUTING.md) 了解详情。

## 📄 许可证

[MIT License](./LICENSE)

---

**Made with ❤️ by the 0neThing Team**
