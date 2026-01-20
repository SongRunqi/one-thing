# 0neThing

> A powerful AI chat desktop app with multi-provider support, built-in tools, and intelligent memory.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron)
![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript)
![License](https://img.shields.io/badge/License-MIT-green)

## What is 0neThing?

0neThing is an Electron-based desktop application that brings together multiple AI providers (OpenAI, Claude, DeepSeek, Gemini, etc.) with a powerful tool execution system and semantic memory. Think of it as a local AI assistant that can remember context, execute commands, and work with your filesystem—all within a clean, customizable interface.

## Key Features

- **🤖 Multi-Provider Support** - OpenAI, Claude (including Claude Code OAuth), DeepSeek, Gemini, GitHub Copilot, OpenRouter, and custom APIs
- **🛠️ Built-in Tools** - Bash execution, file operations (read/write/edit), search (glob/grep), and more
- **🧠 Intelligent Memory** - Semantic memory system with vector search that remembers user facts and conversation context
- **🎭 Custom Agents** - Create personalized agents with custom prompts, memory isolation, and unique personalities
- **📁 Workspace Management** - Organize conversations by project with isolated working directories
- **🔌 Extensible** - MCP (Model Context Protocol) and Skills system support

## Quick Start

```bash
# Install dependencies (using bun)
bun install

# Development mode
bun run dev:all

# Build for production
bun run build:electron
```

### First-Time Setup

1. Launch the app
2. Open settings (`Cmd/Ctrl + ,`)
3. Choose an AI provider and enter your API key (or use OAuth)
4. Start chatting!

## Building & Releasing

### Development Build

```bash
# Run all build steps (renderer + main + preload)
bun run build

# Test packaging without full distribution
bun run build:unpack
```

### Platform-Specific Builds

```bash
# Build for specific platforms
bun run build:mac     # macOS (DMG + ZIP)
bun run build:win     # Windows (NSIS + Portable)
bun run build:linux   # Linux (AppImage + DEB)
```

### Creating a Release

Use the automated release script:

```bash
# Create and push a new release tag
bun run release 1.0.0
```

Or manually:

```bash
# Update version in package.json, commit, and tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

The GitHub Actions workflow will automatically build and create a draft release. See [RELEASE.md](./RELEASE.md) for detailed instructions.

## Architecture

0neThing follows Electron's three-process model:

- **Main Process** - Node.js backend with SQLite storage, AI providers, tool execution, and memory management
- **Renderer Process** - Vue 3 frontend with Pinia state management
- **Preload Script** - Type-safe IPC bridge between main and renderer

Key technologies: Electron, Vue 3, TypeScript, Vercel AI SDK, SQLite + sqlite-vec, Pinia

## Documentation

See `/docs` for detailed documentation:

- [Architecture Overview](./docs/ARCHITECTURE.md)
- [Chat System](./docs/architecture-chat.md)
- [Providers](./docs/providers.md)
- [Storage Layer](./docs/storage.md)
- [Memory System](./docs/memory-service.md)
- [Tools & MCP](./docs/architecture-tools.md)

Or check [CLAUDE.md](./CLAUDE.md) for quick guidance when working with this codebase.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 33 |
| Frontend | Vue 3 + TypeScript + Pinia |
| AI SDK | Vercel AI SDK |
| Database | SQLite (better-sqlite3) + sqlite-vec |
| Build | Vite + esbuild |

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## License

[MIT License](./LICENSE)

---

**Built with ❤️ using Electron + Vue + AI**
