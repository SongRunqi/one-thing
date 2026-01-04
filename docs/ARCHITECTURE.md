# 0neThing 整体架构设计

## 概述

0neThing 是一个基于 Electron 的 AI 聊天应用，采用 **Main Process + Renderer Process** 的经典 Electron 架构。项目使用 Vue 3 + TypeScript 作为前端框架，Vercel AI SDK 作为 AI 接口抽象层。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron |
| 前端框架 | Vue 3 + TypeScript |
| 状态管理 | Pinia |
| AI SDK | Vercel AI SDK (ai) |
| 数据存储 | SQLite (better-sqlite3) + sqlite-vec |
| IPC 通信 | Electron IPC |
| 构建工具 | Vite + esbuild |

## 目录结构

```
src/
├── main/                    # Electron 主进程
│   ├── index.ts             # 入口文件
│   ├── window.ts            # 窗口管理
│   ├── providers/           # AI 提供商系统
│   ├── storage/             # 存储层 (SQLite/File)
│   ├── stores/              # 主进程状态管理
│   ├── services/            # 业务服务
│   │   ├── ai/              # AI 相关服务
│   │   ├── auth/            # OAuth 认证
│   │   ├── memory/          # 记忆系统
│   │   ├── triggers/        # 触发器
│   │   └── tool-agent/      # 工具代理
│   ├── ipc/                 # IPC 处理器
│   ├── tools/               # 内置工具
│   ├── skills/              # Skills 系统
│   ├── mcp/                 # MCP 协议支持
│   └── permission/          # 权限管理
├── renderer/                # Vue 渲染进程
│   ├── main.ts              # 入口文件
│   ├── App.vue              # 根组件
│   ├── stores/              # Pinia 状态
│   ├── composables/         # Vue Composables
│   ├── components/          # Vue 组件
│   └── services/            # 前端服务
├── shared/                  # 共享代码
│   └── ipc/                 # IPC 类型定义
└── preload/                 # Preload 脚本
    └── index.ts             # 安全桥接
```

## 架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Renderer Process                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐  │
│  │   Vue 3     │  │   Pinia     │  │ Composables │  │  Components   │  │
│  │   App.vue   │  │   Stores    │  │  useChat    │  │  ChatWindow   │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └───────────────┘  │
│         │                │                │                             │
│         └────────────────┼────────────────┘                             │
│                          ▼                                              │
│                   ┌─────────────┐                                       │
│                   │  IPC Hub    │                                       │
│                   └──────┬──────┘                                       │
└──────────────────────────┼──────────────────────────────────────────────┘
                           │
                    Electron IPC
                           │
┌──────────────────────────┼──────────────────────────────────────────────┐
│                          ▼                                              │
│                   ┌─────────────┐                     Main Process      │
│                   │IPC Handlers │                                       │
│                   └──────┬──────┘                                       │
│                          │                                              │
│    ┌─────────────────────┼─────────────────────┐                       │
│    ▼                     ▼                     ▼                       │
│ ┌──────────┐      ┌─────────────┐      ┌─────────────┐                │
│ │Providers │      │  Services   │      │   Storage   │                │
│ │ (AI SDK) │      │Memory/Auth  │      │   SQLite    │                │
│ └────┬─────┘      └──────┬──────┘      └──────┬──────┘                │
│      │                   │                    │                        │
│      ▼                   ▼                    ▼                        │
│ ┌──────────┐      ┌─────────────┐      ┌─────────────┐                │
│ │   Tools  │      │    MCP      │      │   Skills    │                │
│ │ Registry │      │  Manager    │      │   Loader    │                │
│ └──────────┘      └─────────────┘      └─────────────┘                │
└─────────────────────────────────────────────────────────────────────────┘
```

## 数据流

### 1. 用户发送消息

```
User Input → InputBox.vue → useChatSession → chatStore.sendMessage()
    → window.electronAPI.sendMessageStream() → IPC
    → chat.ts (IPC Handler) → Provider.streamChatResponse()
    → Stream chunks back via IPC events
    → chatStore.handleStreamChunk() → UI Update
```

### 2. 工具调用流程

```
AI Response with tool_call → Tool Registry.execute()
    → Permission Check → Tool Execution
    → Result back to AI → Continue generation
```

### 3. 记忆提取流程

```
Chat Complete → Memory Extraction Trigger
    → AI extracts facts → EmbeddingService.embed()
    → SQLite Storage with vector → Memory Available for RAG
```

## 核心模块关系

```
┌─────────────────────────────────────────────────────────────────┐
│                        IPC Handlers                              │
│  chat.ts / sessions.ts / settings.ts / agents.ts / ...          │
└───────────────────────────────┬─────────────────────────────────┘
                                │ 调用
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│   Providers   │      │    Stores     │      │   Services    │
│  (AI 调用)    │      │  (状态管理)   │      │  (业务逻辑)   │
└───────┬───────┘      └───────┬───────┘      └───────┬───────┘
        │                      │                      │
        │              ┌───────┴───────┐              │
        │              ▼               ▼              │
        │      ┌─────────────┐ ┌─────────────┐       │
        │      │   SQLite    │ │    File     │       │
        │      │   Storage   │ │   Storage   │       │
        │      └─────────────┘ └─────────────┘       │
        │                                            │
        └────────────────────┬───────────────────────┘
                             ▼
                    ┌───────────────┐
                    │  Tool System  │
                    │  MCP / Skills │
                    └───────────────┘
```

## 模块职责说明

| 模块 | 职责 | 关键文件 |
|------|------|----------|
| **Providers** | AI 模型调用抽象 | `providers/index.ts` |
| **Storage** | 数据持久化 | `storage/sqlite-storage.ts` |
| **Stores (Main)** | 主进程状态 | `stores/sessions.ts` |
| **Stores (Renderer)** | UI 状态管理 | `renderer/stores/chat.ts` |
| **IPC Handlers** | 进程间通信 | `ipc/handlers.ts` |
| **Tools** | 内置工具实现 | `tools/builtin/` |
| **MCP** | MCP 协议支持 | `mcp/manager.ts` |
| **Skills** | Claude Code Skills | `skills/loader.ts` |
| **Memory** | 记忆/向量检索 | `services/memory/` |

## 扩展点

### 添加新的 AI 提供商

1. 在 `src/main/providers/builtin/` 创建新文件
2. 实现 `ProviderDefinition` 接口
3. 在 `builtin/index.ts` 中导出

### 添加新的内置工具

1. 在 `src/main/tools/builtin/` 创建新文件
2. 实现 `Tool` 接口
3. 在 `builtin/index.ts` 中导出

### 添加新的 IPC 通道

1. 在 `src/shared/ipc/channels.ts` 添加通道名
2. 在 `src/shared/ipc/` 对应文件添加类型
3. 在 `src/main/ipc/` 实现处理器
4. 在 `src/preload/index.ts` 暴露 API

## 相关文档

### 核心架构

- [Chat 架构](./architecture-chat.md)
- [MCP 架构](./architecture-mcp.md)
- [Skills 架构](./architecture-skills.md)
- [Tools 架构](./architecture-tools.md)

### 基础设施

- [Providers 系统](./providers.md)
- [Storage 存储层](./storage.md)
- [IPC 类型定义](./ipc-types.md)
- [IPC 处理器](./ipc-handlers.md)
- [IPC Hub](./ipc-hub.md)

### 状态管理

- [主进程 Stores](./main-stores.md)
- [渲染进程 Stores](./renderer-stores.md)

### 渲染进程

- [Vue Composables](./composables.md)
- [Vue 组件](./components.md)

### 业务服务

- [Memory 服务](./memory-service.md)
- [Memory 系统设计](./memory-system.md)
- [Auth 服务](./auth-service.md)
- [AI 服务](./ai-service.md)
- [触发器系统](./triggers.md)
