# PROJECT_STATUS.md - 0neThing 项目状态

> 最后更新: 2026-02-07 23:57 | PM: Qiqi

## 📋 项目概述

**0neThing** 是一个基于 Electron 的 AI 对话应用，支持多种 AI 提供商、自定义 Agent、工具调用、记忆系统等功能。

| 属性 | 值 |
|------|-----|
| 类型 | Electron 桌面应用 |
| 前端 | Vue 3 + TypeScript + Pinia |
| 后端 | Electron Main Process |
| AI SDK | Vercel AI SDK |
| 包管理 | pnpm |

---

## 📊 代码规模

| 指标 | 数值 |
|------|------|
| 源文件数 | 357 (.ts + .vue) |
| 依赖包数 | 78+ |
| 目录结构 | main / preload / renderer / shared |

### 目录分布

```
src/
├── main/       # Electron 主进程 (IPC、服务、工具)
├── preload/    # 预加载脚本 (IPC 桥接)
├── renderer/   # Vue 前端 (组件、stores、composables)
└── shared/     # 共享类型和常量
```

---

## 🔌 AI 提供商 (10个)

| Provider | SDK |
|----------|-----|
| OpenAI | @ai-sdk/openai |
| Claude | @ai-sdk/anthropic |
| Gemini | @ai-sdk/google |
| DeepSeek | @ai-sdk/deepseek |
| 智谱 | 自定义实现 |
| Kimi | OpenAI 兼容 |
| OpenRouter | OpenAI 兼容 |
| Claude Code | OAuth |
| GitHub Copilot | OAuth |
| 自定义 | custom- 前缀 |

---

## 🛠️ 核心模块

### Pinia Stores (10个)

| Store | 职责 | 依赖 |
|-------|------|------|
| sessions | 会话管理 | chat, workspaces, settings |
| chat | 聊天核心、流式处理 | sessions (动态) |
| settings | 全局设置、Provider 配置 | themes (动态) |
| themes | JSON 主题系统 | settings |
| workspaces | 工作区管理 | 独立 |
| custom-agents | Agent 管理 | workspaces |
| memory-manager | 记忆文件管理 | 独立 |
| media | 生成媒体管理 | 独立 |
| ui-messages | UIMessage 格式 (迁移中) | 独立 |
| right-sidebar | 侧边栏状态 | sessions |

### 核心服务

| 服务 | 位置 | 职责 |
|------|------|------|
| Provider Registry | main/providers/ | AI 提供商统一接口 |
| Tool Registry | main/tools/ | 工具注册和执行 |
| Custom Agent | main/services/custom-agent/ | Agent 加载和执行 |
| Memory | main/services/memory-text/ | 记忆系统 |
| IPC Handlers | main/ipc/ | IPC 处理器 |

---

## ✅ 近期改进 (2026-02-07)

| 阶段 | 改进 | 状态 |
|------|------|------|
| Phase 1 | Vitest 测试框架 | ✅ Done |
| Phase 2 | TypeScript 严格模式 | ✅ Done |
| Phase 3 | Vue TS 严格修复 | ✅ Done |
| Phase 4 | InputBox 拆分 (1339→743行) | ✅ Done |
| Phase 5 | IPC Router 抽象层 | ✅ Done |

---

## 📁 关键文档

| 文档 | 说明 |
|------|------|
| ARCHITECTURE.md | 架构分析 (1017行) |
| ISSUES.md | 问题和技术债清单 |
| ROADMAP.md | 迭代路线图 |
| CLAUDE.md | AI 开发指南 |

---

## 🔧 开发命令

```bash
bun dev           # 开发模式
bun run build     # 构建
bun run build:mac # 打包 Mac DMG/ZIP
bun test          # 运行测试
bun run typecheck # 类型检查
```

---

## 📦 打包状态

| 平台 | 状态 | 输出 |
|------|------|------|
| macOS arm64 | ✅ 成功 | `release/0neThing-0.1.0-arm64.dmg` (213MB) |
| Windows | 🔘 未测试 | — |
| Linux | 🔘 未测试 | — |

### 打包说明

- **打包器**: electron-builder v26.4.0
- **签名**: ad-hoc (无 Apple Developer 证书)
- **公证**: 跳过 (分发时需配置)
- **注意**: bun 不支持依赖树提取，使用 NPM collector

---

## 📈 健康指标

| 指标 | 状态 | 说明 |
|------|------|------|
| TypeScript | ✅ Strict | 严格模式已启用 |
| 测试框架 | ✅ Vitest | 已配置 |
| 测试覆盖 | ⚠️ 低 | 需要补充核心流程测试 |
| 文档 | ✅ 良好 | CLAUDE.md 全面 |
| 技术债 | ⚠️ 中等 | 见 ISSUES.md |

---

*Maintained by: Qiqi (PM)*
