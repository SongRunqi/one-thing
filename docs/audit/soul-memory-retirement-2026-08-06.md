# soul-memory 退役记录（2026-08-06）

整树拔除，不留继任者。AI 不再有任何跨会话记忆能力，只剩会话历史本身。

净变更：**91 个文件，删 16,989 行，增 115 行**（37 个文件整体删除，54 个文件修改）。

---

## 1. 退役范围决策

| 维度 | 决定 |
| --- | --- |
| 代码 | 整树拔除，插件本体 + 所有宿主侧接线全删 |
| 继任者 | 无。不做轻量替代，不留过渡层 |
| 存量数据 | 归档到 `~/.onething/memory/legacy-backup/`，一字节不删 |
| usage 账本 | `source: 'memory'` 枚举**保留**，否则历史 JSONL 记录无法归类 |

---

## 2. 退了哪些地方

按层从叶到根。删除顺序刻意由叶及根，让 typecheck 一路当探针。

### 2.1 整体删除的文件（37）

| 位置 | 内容 | 行数 |
| --- | --- | --- |
| `packages/onething-runtime/src/plugins/soul-memory.ts` | 插件本体（产品层纯逻辑） | 4630 |
| `packages/onething-runtime/src/app/plugins/builtin/soul-memory.ts` | 装配层入口 + 工具/命令/钩子注册 | 1286 |
| `packages/onething-runtime/src/memory/` | 整个模块（append / capture-actions / diagnostics-logger / managed-files / prompt-context / review / types / workspace / ipc + 测试） | ~1400 |
| `packages/onething-runtime/src/app/memory/` | 装配层 workspace + diagnostics | ~174 |
| `packages/onething-runtime/src/prompts/tasks/` | 三个 soul-memory 专属任务提示词的加载器 | 13 |
| `packages/onething-runtime/src/prompts/content/memory-{rules,review,capture,daily-note}.md` | 提示词文案 | — |
| `packages/shared/ipc/memory.ts` | 11 个 IPC 通道的类型契约 | — |
| `apps/electron/src/main/ipc/memory.ts`、`apps/electron/src/ipc/memory.ts` | 两棵 IPC 树各一份 handler | — |
| `packages/renderer/components/memory/MemoryPanelContent.vue` | 工作区记忆面板 | — |
| `packages/renderer/components/settings/MemorySettingsTab.vue` | 设置页记忆 tab | — |
| `scripts/cleanup-legacy-user-memory.mjs` | 旧迁移脚本 | — |
| 相关测试 ×8 | core-soul-memory / soul-memory-capture / MemoryPanelContent / MemorySettingsTab / ipc 等 | ~800 |

### 2.2 逐处修改（54 个文件）

**renderer（UI 层）**

- `SettingsPage.vue` — 删 Memory tab 项、组件挂载、`Brain` 图标 import；改一处解释 segmented-control 的注释（原文举 Memory 为例）
- `MediaPanel.vue` — 删 memory 面板 section、nav 项、`WorkspacePanelNav` 联合类型成员、`Brain` import、`normalizeNav` 分支
- `App.vue` / `sidebar/Sidebar.vue` — `WorkspacePanel` 联合类型删 `'memory'`；Sidebar 的 `workspaceActions` 删条目 + `Brain` import
- `types/index.ts` — 删 13 个 `Memory*` 类型 re-export、11 个 platform API 方法签名
- `platform/web.ts` — 删 11 个 `/api/memory/*` 方法
- `stores/chat.ts`、`stores/helpers/content-parts.ts` — 删 `pushLoadingMemory`、transient 判定里的 `loading-memory` 分支
- `components/chat/MessageItem.vue`、`message/MessageThinking.vue`、`message/MessageBubble.vue` — 删 `isLoadingMemory` computed、`loadingMemory` prop、"Extracting memory" 状态行、渲染跳过分支
- `styles/agent-space.css` — 删 `.agent-ledger .ledger-select` 规则组（36 行，详见 §4.2）

**传输层**

- `packages/shared/ipc/channels.ts` — 删 11 个通道常量
- `packages/shared/ipc/index.ts` — 删 13 个 memory 类型 + 6 个 SoulMemory 设置类型的 re-export
- `packages/shared/ipc/settings.ts` — 删 5 个 `SoulMemory*Settings` 接口 + `GeneralSettings.soulMemory` 字段
- `packages/shared/ipc/chat.ts` — 删 `ContentPart` 的 `loading-memory` 成员 + `isTransientPart` 分支
- `apps/electron/src/preload/bridge.ts` — 删 11 个 bridge 方法
- `apps/electron/src/main/ipc/handlers.ts` — 删 `registerMemoryHandlers` import + 调用
- `apps/electron/package.json` — 删 `./ipc/memory` export 映射

**server**

- `apps/server/src/http.ts` — 删 10 条路由、`handleMemoryCall` 分发器、10 个 handler 常量、`RuntimeMemoryMethod` 类型
- `apps/server/src/runtime.ts` — 删 2 个 import 块、plugin catalog 条目、2 个 owner-scoped Map、5 个 context 工厂函数（诊断日志器 / 插件 store / 状态变更 / workspace 保障 / overview 构建）、`createMemoryHandlersForContext`、facade 的整个 `memory:` 段、`serverMemoryRoot`、`serverMemoryLogDir`、shutdown 里的 clear

**core / engine**

- `packages/core/runtime-facade.ts` — 删 `RuntimeMemoryAdapter` 接口（10 个方法）+ options/readonly/freeze 三处字段
- `packages/core/engine/agent-loop-runtime.ts` — 删 `CoreAgentLoopActiveMemorySettings`、`CoreAgentLoopActiveMemoryLoadingPlan`、`shouldEmitActiveMemoryLoading`、`planAgentLoopActiveMemoryLoading`（详见 §4.1）
- `packages/core/engine/index.ts` — 删对应 4 个导出
- `packages/onething-runtime/src/agent-loop/stream-runtime.ts` — 删 `general.soulMemory` 设置类型、两处 `sendActiveMemoryPart` 适配器签名、传递、以及 prompt 构建前后的指示器发送块
- `packages/onething-runtime/src/app/engine/stream/agent-loop-runtime.ts` — 删 `sendActiveMemoryPart` 实现

**装配与配置**

- `packages/onething-runtime/src/app/plugins/loader.ts` — 删 builtin 注册条目
- `packages/onething-runtime/src/plugins/index.ts` — 删 barrel re-export
- `packages/shared/defaults/settings.ts` — 删 5 个 `DEFAULT_SOUL_MEMORY_*` 常量、`LegacySoulMemoryCaptureSettings`、5 个 normalize 函数、defaults 与 mergeWithDefaults 的挂载点（约 180 行）
- `onething.aliases.ts` — 删 21 条 alias（详见 §4.3）
- `scripts/headless-boundary-check.ts` — 删 22 个规则组 + 21 个检查函数 + 顶层调用，共 **1101 行**（详见 §4.4）

**注释订正（4 处）** —— soul-memory 曾是这些机制的举例对象，插件没了但机制还在，注释改为描述机制本身：
`app/engine/prompt/system-prompt.ts`（群聊 persona 隔离的理由）、`app/engine/stream/agent-loop-executor.ts`（协作会话跳过后置车道的理由）、`app/engine/triggers/session-toc.ts`（idle timer 模式的出处）、`app/usage/index.ts`（账本生产者清单）。

### 2.3 测试处置

| 处置 | 文件 | 说明 |
| --- | --- | --- |
| 整块删除 | `settings.test.ts`（describe）、`http.test.ts`（it，177 行）、`core-agent-loop-runtime.test.ts`（2 个 it）、`web.test.ts`（it）、`content-parts.test.ts`（1 个 describe + 2 个 it）、`chat-reasoning.test.ts`、`agent-loop-runtime-multimodal.test.ts`、`MessageThinking.test.ts` | 被测行为已不存在 |
| 换成存活的对象 | `http.test.ts` / `web.test.ts` / `prompt-context.test.ts` 里把 `'soul-memory'` 当"任意插件 id"用的字符串 → `'note-skills'`；`MediaPanel.test.ts` / `App.container-layout.test.ts` 里把 memory 面板当"任意面板"用的断言 → `tasks` / `agents` | **测试意图保住了**：验的是插件启停、面板缓存挂载，与 memory 无关 |
| 删除文件 | `apps/electron/src/ipc/__tests__/memory.test.ts` | 被测模块已删 |

---

## 3. 验证结果

| 项 | 结果 |
| --- | --- |
| `bun run typecheck` | 通过。仅剩 `ToolResultRenderer.bash.test.ts` 2 处错误 —— **退役前既有**，文件未被本次改动触及 |
| `bun run test` | **858 文件 / 7270 用例全绿**，1 skipped |
| `bun run boundary:gate` | ok，零新红。**28 → 13** 条已知失败 |
| `bun run ui:gate` | ok，零新红。**70 → 63** 条已知违规 |

两条棘轮基线均已重录收紧：

- `docs/audit/boundary-baseline-2026-07-25.txt` — 15 条 baseline 失败随规则组一起消失（其中 14 条是 soul-memory 专属规则，1 条是 Electron 主进程外观规则）
- `docs/audit/ui-baseline-2026-08-06.txt` — 7 条治愈，其中 4 条来自 `MemorySettingsTab.vue` 的 `title-attr`，另 3 条（`MessageList.vue` / `MessageActions.vue` 的 `raw-teleport`）是先前已修但未重录的存量

> 全量测试中曾偶发 `AIProviderTab.interaction.test.ts` 失败一次；单独跑通过，`git stash` 后跑也通过，复跑全量同样通过 —— 并发串扰的 flaky，与本次改动无关。

---

## 4. 拔除过程中的意外发现

这四条都不是「删 soul-memory」本身，而是它长在树上这几个月留下的疤。

### 4.1 core 骨架层认识一个具体的内置插件

`packages/core/engine/agent-loop-runtime.ts` 里有：

```ts
export interface CoreAgentLoopActiveMemorySettings {
  general?: { soulMemory?: { enabled?: boolean; activeMemory?: { enabled?: boolean; timeoutMs?: number } } }
}
export function shouldEmitActiveMemoryLoading(ctx): boolean {
  const soulMemory = ctx.settings.general?.soulMemory
  return soulMemory?.enabled !== false && soulMemory?.activeMemory?.enabled !== false
}
```

`packages/core` 是**零依赖的架构最底层**，理应对任何具体功能一无所知。它却硬编码了一个内置插件的设置路径和 15000ms 默认超时。`architecture-boundaries.test.ts` 查的是 import 方向，查不出这种「知识泄漏」——没有 import，只有对配置形状的假设。

### 4.2 流协议里有插件专属的 chunk 类型

`loading-memory` 这个 `ContentPart` 类型贯穿 **5 层**：

```
packages/shared/ipc/chat.ts  (协议定义)
  → packages/core/engine/agent-loop-runtime.ts  (plan 函数产出 startPart)
    → packages/onething-runtime/src/agent-loop/stream-runtime.ts  (发送)
      → packages/renderer/stores/{chat,helpers/content-parts}.ts  (归约)
        → packages/renderer/components/chat/message/MessageThinking.vue  ("Extracting memory")
```

一个插件想在气泡里显示"正在取记忆"，代价是在共享流协议里加一个成员，然后五层各改一遍。

附带：`.agent-ledger .ledger-select` 这组 CSS 住在**共享**样式表 `styles/agent-space.css` 里，唯一消费者却是 `MemorySettingsTab.vue`。`AgentConfigForm.vue` 里甚至有一条注释专门交代"这个类留着给 MemorySettingsTab 用"。插件的 UI 让共享样式表长出了只服务它的规则。

### 4.3 alias 表里有 10 条指向不存在文件的死登记

清理 `onething.aliases.ts` 时移除 21 条 `@onething/runtime/memory/*`，其中 **10 条指向的文件早就不存在了**：

```
active-memory  canonical  database  daily-context  dreaming
flush  graph  hermes-file-memory  indexer  search
```

这些是 Memory v2 重构后的残留。之所以能长期无人发现：**tsconfig 的通配符 `@onething/runtime/*` 接受任何子路径，typecheck 永远不报错**，而死 alias 又没人 import，构建期也碰不到。缺失的 alias 只在运行时炸，多余的 alias 则永远静默。

### 4.4 架构守卫脚本里有 1101 行插件专属规则

`scripts/headless-boundary-check.ts` 里有 22 个 soul-memory 专属规则组（`MAIN_MEMORY_REVIEW_FORBIDDEN_PATTERNS`、`MAIN_SOUL_MEMORY_DREAMING_FORBIDDEN_PATTERNS`……）和 21 个对应的检查函数。这些是当年把 soul-memory 从主进程迁到 runtime 时写的防回流规则。

一个插件在守卫脚本里占 1101 行，而守卫脚本全文才一万多行。这些规则在插件退役的这一刻全部变成死代码 —— 它们保护的边界两侧都不存在了。

---

## 5. 存量数据归档

`scripts/archive-soul-memory.mjs`，**默认 dry-run**：

```bash
node scripts/archive-soul-memory.mjs          # 打印计划，不动任何文件
node scripts/archive-soul-memory.mjs --apply  # 执行
```

⚠️ `--apply` 前必须先停掉桌面 app 和任何在跑的 server —— 两者都持有 store 锁，并发写会落进一棵搬到一半的树里。

搬运映射（**move，不删**，参照 `sessions/legacy-backup` 先例）：

| 原位置 | 归档位置 |
| --- | --- |
| `memory/{SOUL.md,daily/,…}` | `memory/legacy-backup/default/…` |
| `agents/<id>/{SOUL.md,MEMORY.md,memory/}` | `memory/legacy-backup/agents/<id>/…` |
| `agents/<id>/plugin-data/soul-memory.*` | `memory/legacy-backup/agents/<id>/plugin-data/…` |
| `memory-logs/` | `memory/legacy-backup/memory-logs/` |

脚本还会清掉 `settings.json` 里的死配置 `general.soulMemory` —— 实测 `mergeWithDefaults`
**原样保留未知键**（不吞、不报错），所以这段配置会一直躺在那儿。重写前先备份到
`settings.json.bak-<时间戳>`。

脚本幂等：已在 `legacy-backup/` 下的内容跳过，目标已存在则告警不覆盖。本机 dry-run 结果为 19 条待归档（1 个默认 workspace + 12 个 agent 的 SOUL.md + 2 个 sqlite + daily 目录等）+ 1 处死配置。

**本次未执行 `--apply`** —— 需要先停服务，时机由使用者决定。

## 5.1 构建验证

typecheck 与测试之外，三个产物均已确认可构建：

| 命令 | 结果 |
| --- | --- |
| `bun run server:build` | ✓ 759 modules，`dist/server/main.js` |
| `bun run web:build` | ✓ |
| `bun run build`（electron） | ✓ main + preload + renderer |

## 5.2 文档同步

- `CLAUDE.md` — 记忆子系统条目改写为退役说明
- `docs/codebase-structure.md` — `plugins/` 条目移除 soul-memory.ts
- `docs/audit/settings-system-map-2026-08-06.md` — 同日快照，**数字保持原样未回改**，加同日后置更正说明
- `docs/design/memory-system-v2.md`、`docs/design/multi-user-memory-notes.md` — 加"已失效"横幅（保留为历史设计记录）
- 其余带日期戳的历史审计/设计文档（`memory-system-audit-2026-07-12.md`、`prompt-inventory.md`、`architecture-review-2026-07-26.md` 等）**不改** —— 它们是当时的真实记录

---

## 6. 相关文档

插件系统为什么撑不住这样一个插件、该往哪里长，见
[`docs/design/plugin-system-capabilities-and-evolution.md`](../design/plugin-system-capabilities-and-evolution.md)。
