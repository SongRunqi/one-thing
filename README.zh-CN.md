# onething · 一事

> 会动手的开源桌面 AI 助手:多模型接入、本地工具执行、目录级权限、事件驱动流式引擎。

[English](./README.md)

## 这是什么?

onething 是一款基于 Electron 的桌面 AI 应用。它把十余家模型接进同一个界面,
并且能在你的电脑上读写文件、执行命令、检索代码、调用技能(Skills)与 MCP
服务器——聊天之外,把事情做完。每一次工具执行都经过目录级权限确认,
会话数据全部保存在本地文件。

## 主要特性

- **多模型接入** — OpenAI、Claude(含 OAuth)、DeepSeek、Gemini、GitHub Copilot、OpenRouter、Kimi、智谱,以及任意 OpenAI 兼容接口。
- **本地工具执行** — Bash、文件读写编辑、glob/grep、计算器、联网搜索、待办计划、图片生成。
- **权限控制** — 按目录授权,敏感操作逐条向你确认。
- **项目上下文** — 项目目录、会话工作目录、笔记目录、上下文变量都可以喂给模型。
- **可扩展** — MCP 服务器、Codex 风格技能、本地插件、自定义主题。
- **本地存储** — 会话按 JSONL 逐条落盘,不经过任何中间服务器。

## 下载安装

macOS(Apple Silicon)、Windows、Linux 安装包见
[GitHub Releases](https://github.com/monotasking/one-thing/releases);
国内高速下载见官网(源码在 [`site/`](./site),部署方式见
[部署手册](./docs/deploy/website-tencent-hk.md))。

安装后打开设置(`Cmd/Ctrl + ,`),选择模型提供商并填入 API Key 即可开始。

## 从源码运行

```bash
bun install       # 安装依赖
bun run dev       # 开发模式(electron + web + server)
bun run build     # 生产构建
bun run test      # 测试
```

更多命令与架构说明见 [README](./README.md) 与 [CLAUDE.md](./CLAUDE.md)。

## 许可

开源项目,一个人在写。欢迎 issue 和 star。
