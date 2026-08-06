# 插件系统：现状能力与演进方向

写于 soul-memory 退役之后（2026-08-06）。那次拔除动了 91 个文件、删了 16,989 行 —— 代价本身就是最好的诊断报告。退役记录见
[`docs/audit/soul-memory-retirement-2026-08-06.md`](../audit/soul-memory-retirement-2026-08-06.md)。

这份文档回答三件事：**现在支持什么**、**为什么 soul-memory 撑不住**、**要真正可插拔该往哪长**。

---

## 从这里开始：现在的处境

> 给没有上下文的读者（包括未来的自己）。三分钟读完这一节，就知道我们站在哪。

### 产品事实

**onething 现在没有任何跨会话记忆能力。** AI 记不住上一次对话说过什么，只有当前会话的历史。

这是 2026-08-06 主动做的决定，不是 bug、不是待办。原先承担记忆的 soul-memory 插件
（SOUL.md 人格文件 + MEMORY.md 长期记忆 + 每日笔记 + 自动 capture/review + 工作区面板 + 设置页）
已整树删除，**且明确不留继任者**。用户磁盘上的旧记忆文件不删，归档在
`~/.onething/memory/legacy-backup/`（经 `scripts/archive-soul-memory.mjs`）。

### 为什么退

**不是因为"记忆这个功能不好"，而是因为它作为一个插件是失败的。**

它想做一个完整的产品功能（自己的界面、配置、数据、状态指示），但插件 API 对这些的扩展点是 **0**，
于是每一样都绕过插件系统、直接改宿主：11 个 IPC 通道、10 条 HTTP 路由、共享流协议里加成员、
`packages/core` 骨架层里塞进它的配置路径、架构守卫脚本里 1101 行专属规则……
最后拔它要动 91 个文件。

对照组说明了这不是"功能复杂就必然如此"：同期的 `note-skills` 用 3 个 API、`log-monitor` 用 4 类 API，
**宿主侧越界 0 行**。

> 一句话：**soul-memory 从来不是一个真正的插件，它只是一段恰好被 `loader.ts` 注册了的宿主代码。**

### 现在的插件系统能干什么

能干「**给 AI 加能力**」：注册工具、斜杠命令、订阅事件、注入系统提示词、贡献技能根、
挂后置钩子、定时任务。这部分做得不错，而且是同级公民（插件注册的工具走真实注册表、带权限管控）。

不能干「**给产品加功能**」：面板、设置界面、请求通道、数据目录、状态指示 —— 一个都没有。
详见 §1.1（有什么）、§1.4（有注册表但够不着）、§1.5（治理层空白）。

### 如果将来还想要记忆

可以再做，但**别在补齐 P0–P4 之前做**（见第三部分）。今天重做一遍记忆，会一字不差地重蹈
soul-memory 的覆辙 —— 因为让它越界的那些缺口，一个都还没补。

这也是把这份文档和退役记录**分成两份**的原因：退役记录讲"怎么拆的"，这份讲"为什么会拆成这样、
以及怎么让下一个功能不用这么拆"。

### 状态

| 项 | 状态 |
| --- | --- |
| soul-memory 代码退役 | ✅ 完成（typecheck / 7270 测试 / 三个 build / 两条棘轮全过） |
| 存量数据归档 | ⏳ 脚本就绪，**待执行** `--apply`（需先停 app 与 server） |
| 插件系统增强 P0–P7 | ❌ **全部未开工**，本文档是方案，不是记录 |

---

## 第一部分：现有插件系统支持到什么地步

### 1.1 能力清单

契约在 `packages/core/plugins/types.ts` 的 `CorePluginAPI`，装配层实现在
`packages/onething-runtime/src/app/plugins/api.ts`。插件拿到的 `api` 对象，全部能力如下：

| 能力 | API | 成色 |
| --- | --- | --- |
| 注册工具 | `registerTool(tool)` | **完整**。走真实工具注册表，带 zod 参数校验、`permissionGuard`（默认 `permission-gated`）、执行上下文（sessionId / abortSignal / metadata 回调）。与内置工具同级公民 |
| 订阅事件 | `on(eventType, handler)` | **完整**。挂 EventBus 的 `onAnySession`，返回退订函数，自动带 `Plugin:<id>` 归属标记 |
| 注册斜杠命令 | `registerCommand(name, opts)` | **完整**。命令上下文可 `steer` / `followUp` / `notify` / `exec` 子进程 |
| 干预会话 | `steer()` / `followUp()` | **完整**。直接调 StreamEngine，带 pluginId 归属 |
| 注入系统提示词 | `registerPromptContextProvider(id, provider)` | **完整**。异步 provider，能读 sessionId / settings，返回带 `source` 标记的段落。soul-memory 的记忆规则就是走这条通道注入的 —— **这条没有越界** |
| 压缩前钩子 | `beforeContextCompact(id, hook)` | 完整 |
| 回复后钩子 | `afterAssistantResponse(id, hook)` | 完整。soul-memory 的 capture / review 后置车道靠它 |
| 贡献技能根 | `registerSkillRoot(provider)` | 完整。note-skills 全靠这一个 |
| 键值存储 | `store` | **弱**。单个 JSON 文件的同步 KV（`<store>/agents/<agentId>/plugin-data/<pluginId>.json`），每次 `set` 全量重写。无 schema、无迁移、无并发保护 |
| 定时任务 | `scheduler` | 完整。scoped 到 pluginId，随 dispose 自动清理 |
| 提示用户 | `ui.notify(message, level)` | **极弱**。就是往 EventBus 发一条 toast。这是插件能触达 UI 的**唯一**手段 |
| 生命周期 | `onDispose(cb)` | 完整。停用/重载时反注册工具、退订事件、清定时器 |

### 1.2 加载与分发

- **内置插件**：`packages/onething-runtime/src/app/plugins/loader.ts` 里硬编码一张表（id + manifest + entry + enabled）。加一个内置插件 = 改这个文件
- **用户插件**：从 `<store>/plugins/<name>/` 扫描，读 `manifest.json`，动态 `import()` 入口文件；支持 `needsInstall` 检测并自动跑 npm install；与内置同名则跳过并告警
- **启停**：`PluginSettings { enabled?: Record<string, boolean> }`，存在**独立文件**里（`getCorePluginSettingsPath()`），**不在 `AppSettings` 中** —— `AppSettings` 根本没有 `plugins` 字段。可运行时开关，走完整 dispose/reload。这一点在 P0 里很关键：插件配置早就有自己的家，soul-memory 当年去改 `AppSettings.general` 是绕了远路
- **可见度**：设置页 Plugins tab 显示名称、版本、状态（Active/Error/Disabled）、描述、命令数、启停开关

### 1.3 三个内置插件的实际用量 —— 规律在这里

| 插件 | 用到的 API | 宿主侧越界改动 |
| --- | --- | --- |
| `note-skills` | `registerSkillRoot`、`onDispose`、`id` | **0** |
| `log-monitor` | `registerTool`、`registerCommand`×4、`on`、`ui` | **0** |
| `soul-memory` | `registerTool`×3、`registerCommand`×2、`afterAssistantResponse`×2、`registerPromptContextProvider`、`store`×5、`ui`×2 | **七层，16,989 行** |

前两个插件干干净净，一行宿主代码都不用改。soul-memory 用的 API 只比它们多两三种，代价却差了四个数量级。

**差别不在用得多，在于它想要 API 根本没提供的东西。**

### 1.4 够得着与够不着的注册表

产品里有一批注册表，`register*` 函数都好端端导出着，宿主自己在用 —— 但**插件 API 里没有对应的 host 通道**，插件够不着。这类缺口和 §1.1 的性质不同：不是"机制不存在"，是"机制存在但没开口子"。

| 注册表 | 位置 | 插件可达 |
| --- | --- | --- |
| 工具 | `app/tools/registry.ts` | ✅ `registerTool` |
| 系统提示词段 | `app/engine/prompt/plugin-context.ts` | ✅ `registerPromptContextProvider` |
| 技能根 | `app/skills/plugin-roots.ts` | ✅ `registerSkillRoot` |
| 生命周期钩子 | `app/plugins/lifecycle.ts` | ✅ `beforeContextCompact` / `afterAssistantResponse` |
| **AI provider** | `app/providers/registry.ts` → `registerProvider` | ❌ |
| **变量提供者** | `app/variables/index.ts` → `registerVariableProvider` | ❌ |
| **权限能力** | `app/permission/capabilities.ts` → `registerBuiltinCapabilities` | ❌ |
| **IM 渠道连接器** | `app/channel/connector-registry.ts` → `registerIMConnector` | ❌ |
| **后置触发器** | `app/engine/triggers/index.ts` → `registerBuiltinTriggers` | ❌（只开了 `afterAssistantResponse` 一个钩子，触发器注册表本身够不着） |
| **后台作业** | `tools/background-jobs.ts` | ❌ |
| **主题** | `themes/index.ts` → `loadCustomThemes` | ❌ 走的是独立的目录加载机制，与插件系统无关 |

补这一类的成本远低于 §2 那些越界项 —— 大多是在 `api.ts` 的 `host` 对象里加一行转发。真正要想清楚的是**卸载语义**（一个插件注册的 provider 被停用时，正在用它的会话怎么办）。

### 1.5 治理层：安全、版本、隔离

这一层不是"能力"，是插件系统作为一个**第三方代码宿主**该有的约束。目前基本是空的。

| 项 | 现状 |
| --- | --- |
| **执行沙箱** | ❌ 无。用户插件是 `importEntry: entryPath => import(entryPath)`（`app/plugins/loader.ts:108`）—— 裸动态 import，跑在 **Electron 主进程内**，拥有完整 Node 权限：`fs`、`child_process`、`net` 全都能碰 |
| **权限声明** | ❌ 无。manifest 里没有"这个插件需要哪些能力"的字段，装之前无从判断它会做什么 |
| **版本兼容** | ❌ 假的。`PluginManifest.minAppVersion` 在 `core/plugins/types.ts` 里声明了，**全代码库零处消费** —— 声明了不检查 |
| **错误隔离** | ⚠️ 部分。加载期的异常会被 catch 并记进 `definition.error`（设置页显示 Error 状态）；但插件**注册进去之后**的运行期异常没有专门的隔离边界 |
| **插件间依赖/通信** | ❌ 无。没有 `dependencies` 声明，没有插件互相取用对方能力的通道 |
| **自定义事件** | ❌ 插件只能订阅（`api.on`）和发 toast（`api.ui.notify`），不能往 EventBus 发自定义事件 |
| **热重载** | ⚠️ 生命周期完整（`disablePlugin` → dispose → `enablePlugin` → 重新 load），但 ESM `import()` 有模块缓存，改了代码重新启用**拿到的还是旧模块**，得重启进程 |

其中安全模型这条最值得单独说，因为它和产品里已有的严谨形成了刺眼的不对称：

> AI 想调一个工具，要过 `permissionGuard`（插件注册的工具默认还是最严的 `permission-gated`），要弹窗让用户逐次批准，还有 channel affinity 防跨通道伪造。
> 而**插件代码本身**装上就跑在主进程里，不需要任何批准，就能读写任意文件、起任意子进程、连任意网络。

被严格管控的是 AI 的行为，完全不设防的是承载 AI 的代码。今天只有三个内置插件所以不痛；一旦真的想要第三方插件生态，这是**先决条件**，不是优化项。

### 1.6 插件系统的自我定位

`PluginsSettingsTab.vue` 开头那句话把边界说得很准：

> Plugins extend onething with custom tools, commands, and event handlers.

工具、命令、事件处理器 —— 这就是当前插件系统**真正**支持的东西，而且支持得很好。它是一套「**给 AI 加能力**」的系统，不是一套「**给产品加功能**」的系统。

---

## 第二部分：soul-memory 为什么必须越界

soul-memory 想做的不只是给 AI 加工具，它想做一个**完整的产品功能**：有自己的界面、自己的配置、自己的数据、自己的状态指示。插件 API 一样都给不了，于是每一样都得去宿主里手写。

| 它需要的 | API 有吗 | 实际怎么做的 | 代价 |
| --- | --- | --- | --- |
| 工作区面板 | ❌ | 直接写 `MemoryPanelContent.vue`，在 `MediaPanel.vue` 里加 section、nav 项、`WorkspacePanelNav` 联合类型成员；`App.vue`、`Sidebar.vue` 各自的 `WorkspacePanel` 类型也要跟着改 | 4 个文件的联合类型必须手工保持同步 |
| 设置界面 | ❌ | 写 `MemorySettingsTab.vue`，在 `SettingsPage.vue` 里加 tab 定义、组件挂载、图标 import | 设置页每加一个插件就长一块 |
| 配置存储 | ❌（只有无 schema 的 KV） | 在 `@shared/ipc/settings.ts` 里加 5 个接口 + `GeneralSettings.soulMemory` 字段，在 `defaults/settings.ts` 里加 5 个默认值常量 + 5 个 normalize 函数 | ~180 行，且 normalize 的合法性由手写代码保证 |
| 前端调后端 | ❌ | 11 个 IPC 通道常量 + 类型契约 + 两棵 IPC 树各一份 handler + preload bridge 11 个方法 | 加一个通道要改 5 处（CLAUDE.md 明文记载的流程） |
| web 端等价能力 | ❌ | server 10 条 HTTP 路由 + 分发器 + `RuntimeMemoryAdapter`（**加进 `packages/core` 的 facade**）+ web platform 11 个方法 | Electron 与 web 两套，得手工保持一致 |
| 气泡里的状态指示 | ❌ | 往共享流协议 `ContentPart` 加 `loading-memory` 成员，然后 core → runtime → store → 组件五层各改一遍 | 见退役记录 §4.2 |
| 自己的数据目录 | ❌ | 自行在 store 下开 `memory/`、`agents/<id>/memory/`、`memory-logs/`、`plugin-data/*.sqlite` | 插件删了没人认领，只能事后补归档脚本 |
| 独占的样式 | ❌ | 类写进**共享**样式表 `styles/agent-space.css` | 插件走后留下 36 行死 CSS |

还有两笔隐性债，是「插件长期存在」自动产生的：

- **架构守卫脚本里 1101 行专属规则**（22 个规则组 + 21 个检查函数）。当年从主进程迁移时写的防回流规则，插件一走全成死代码
- **`packages/core` 被污染**。零依赖的骨架层里出现了 `general.soulMemory.activeMemory.timeoutMs` 和 15000ms 默认值。`architecture-boundaries.test.ts` 查 import 方向，查不出这种没有 import 的「知识泄漏」

### 结论

> 当前插件系统对「**给 AI 加能力**」的插件是够用甚至优雅的（note-skills 3 个 API 搞定，log-monitor 零越界）。
> 对「**带自己界面、配置和数据的产品功能**」，它提供的扩展点是 **0**。
> 这类插件不是"用起来麻烦"，而是**根本不通过插件系统实现** —— 它只是一段恰好被 `loader.ts` 注册了的宿主代码。

拔 soul-memory 之所以要动 91 个文件，是因为它**从来就不是一个真正的插件**。

---
## 第三部分：方案

**总目标**：让一个带界面、配置、数据的功能，只靠插件 API 就能完整实现 —— 安装即生效，卸载即干净。

**唯一验收判据 —— 拆除测试**：把插件删掉后，宿主树 `git diff` 应为空。
今天 `note-skills` 和 `log-monitor` 过得了，`soul-memory` 过不了。

**三条线是正交的，别混在一份排期里**：

| 线 | 解决的问题 | 什么时候必须做 |
| --- | --- | --- |
| **A 线（P0–P4）** | 自家插件写起来要越界 | 想再做 soul-memory 那种功能之前 |
| **B 线（P6）** | 想扩展的东西够不着 | 具体需要某个注册表时，按需逐个开 |
| **C 线（P7）** | 敢不敢让别人写插件 | **只有要做第三方生态时**；只跑自家插件可以一直欠着 |

P5 是防复发，随时可做。

---

### P0 — 插件自有配置（声明式 schema）

**现状**：插件想要一段可持久化、有默认值、能在设置页里改的配置，API 没有。soul-memory 因此改了
`@shared/ipc/settings.ts`（5 个接口 + `GeneralSettings.soulMemory`）和 `defaults/settings.ts`
（5 个常量 + 5 个 normalize 函数），约 180 行；设置页还得单开一个 tab。

**关键前提（§1.2）**：插件设置本来就有独立的家 —— `PluginSettings`，存在 `getCorePluginSettingsPath()`
指向的文件里，**完全不碰 `AppSettings`**。所以 P0 不需要动任何全局设置结构。

**接口**

```ts
// 插件侧
const config = api.registerSettings({
  schema: z.object({
    enabled: z.boolean().default(true),
    interval: z.number().int().min(1).max(200).default(10),
    directory: z.string().default(''),
  }),
  // 可选：呈现提示。不给就由 schema 推导控件类型
  ui: {
    interval: { label: 'Review interval', hint: '每几轮触发一次' },
    directory: { control: 'directory-picker' },
  },
})

config.get()                      // 类型安全、已 normalize、已填默认值
config.onChange(next => { … })    // 用户在设置页改动时触发
```

**存储**：`PluginSettings` 加一个字段，与 `enabled` 平级 ——

```ts
export interface PluginSettings {
  enabled?: Record<string, boolean>
  config?: Record<string, unknown>   // 新增：pluginId -> 该插件的配置对象
}
```

**落地步骤**

1. `packages/core/plugins/types.ts` — `PluginSettings` 加 `config`；`CorePluginAPI` 加 `registerSettings`
2. `packages/core/plugins/api-builder.ts` — 加 `host.readPluginConfig / writePluginConfig` 转发，schema 校验与默认值填充在这里做（zod 已是既有依赖）
3. `packages/core/plugins/loader.ts` — 加 `getPluginConfigFromSettings` / `setPluginConfigInSettings`，与现有 `getPluginEnabledFromSettings` 同构
4. `packages/onething-runtime/src/app/plugins/api.ts` — host 对象接上读写
5. `packages/renderer/components/settings/PluginsSettingsTab.vue` — 每个插件卡片下方按 schema **自动渲染**配置区（复用 `SettingsField` / `SettingsGroup` 等既有原语，天然符合 `docs/design/ui-system.md`）

**影响面**：5 个文件，全部是新增，`AppSettings` **零改动**。

**验收**：把 log-monitor 的某个硬编码常量改成 `registerSettings` 声明的配置项，设置页自动出现该项，改动后重启保持 —— 全程不新增任何 `@shared` 类型。

**风险**：schema 演进（插件升级后字段变了）。第一版就把 `schema` 的 zod `.catch()` / `.default()` 当作迁移手段，别自己发明迁移框架。

---

### P1 — 插件自有数据目录与卸载生命周期

**现状**：`api.store` 是单个 JSON 文件的同步 KV，每次 `set` 全量重写，无 schema、无并发保护。
插件要存别的（目录、sqlite、日志）只能自己在 store 下面开地方 —— soul-memory 开了
`memory/`、`agents/<id>/memory/`、`memory-logs/`、`plugin-data/*.sqlite` 四处。
**插件删除后没人认领这些数据**，这次只能事后补一个归档脚本。

**接口**

```ts
api.storage.dir()                  // <store>/plugin-data/<pluginId>/ —— 宿主保证存在
api.storage.json('index.json', schema)   // 带 schema 的读写，替代裸 KV
```

**宿主契约**（这是本期的重点，不是 API 本身）

| 事件 | 行为 |
| --- | --- |
| 插件停用 | 数据**保留**原地 |
| 插件卸载 | 宿主自动把目录移到 `<store>/plugin-data/legacy-backup/<pluginId>-<日期>/` |
| 插件写 `plugin-data/<pluginId>/` 之外 | 视为违规（先告警，后续可由 P7 沙箱强制） |

归档路径沿用既有先例：`sessions/legacy-backup/`、以及本次的 `memory/legacy-backup/`。

**落地步骤**

1. `packages/core/plugins/store.ts` — 分文件 + 原子写（写临时文件再 rename），替换现在的全量重写
2. 新增 `packages/core/plugins/storage.ts` — `api.storage` 的实现
3. `packages/onething-runtime/src/app/plugins/manager.ts` — `uninstallPlugin` 里加归档动作
4. manifest 加可选 `dataDir` 声明（不声明就是默认目录）

**验收**：装一个写数据的测试插件 → 卸载 → 数据出现在 `legacy-backup/` 下，`plugin-data/<id>/` 消失，全程无需人工脚本。

**依赖**：无。可与 P0 并行。

---

### P2 — 插件贡献 UI（面板与视图）

**现状**：插件触达 UI 的唯一手段是 `ui.notify` 弹 toast。soul-memory 因此手写了
`MemoryPanelContent.vue` + `MemorySettingsTab.vue`，并且要在
`MediaPanel.vue` / `App.vue` / `Sidebar.vue` / `App.container-layout.test.ts` **四处**手工同步
`WorkspacePanel` 联合类型，样式还只能写进共享的 `styles/agent-space.css`（走后留下 36 行死 CSS）。

**关键取舍：不要让插件塞 Vue 组件进渲染进程。**
用户插件是动态 `import()` 来的第三方代码，塞组件等于把渲染进程交出去。两条路：

- **声明式 UI（推荐先走）**：插件返回一棵**受限的描述树**（list / form / table / markdown / button + action id），宿主用自己的组件渲染。安全、主题一致、自动符合 `docs/design/ui-system.md` 的 token 与浮层规则。**足以覆盖 `MemoryPanelContent` 那种「文件列表 + 预览 + 几个按钮」的形态**
- **iframe/webview 沙箱**：完全自由，但要单独解决主题继承、通信、CSP。留给真正需要自定义画布的插件，**不在第一版**

**接口**

```ts
api.registerWorkspacePanel({
  id: 'memory',
  label: 'Memory',
  icon: 'brain',                  // 图标用名字，不是组件引用
  async render(ctx) {
    return ui.stack([
      ui.list({ items: files.map(f => ({ title: f.name, subtitle: f.mtime })) }),
      ui.button({ label: 'Rebuild index', action: 'rebuild' }),
    ])
  },
  async onAction(actionId, payload) { … },
})
```

**面板注册表取代硬编码联合类型** —— 这是本期最实在的收益：

```ts
// 之前：4 处手写
type WorkspacePanelNav = 'media' | 'memory' | 'agents' | 'tasks' | …
// 之后：单一事实来源
type WorkspacePanelNav = typeof panelRegistry[number]['id']
```

**落地步骤**

1. 新增面板注册表（内置面板先注册进去，行为不变）
2. `MediaPanel.vue` / `App.vue` / `Sidebar.vue` 改为读注册表，删掉手写联合类型
3. 定义描述树 schema + 渲染器（复用既有 UI 原语）
4. `api.registerWorkspacePanel` 接上

**验收**：用声明式 UI 重写一个现有内置面板（建议拿 Tasks 或 Practice 试炼），视觉与交互不退化；之后新增面板不再改 `App.vue` / `Sidebar.vue`。

**风险**：描述树的表达力边界。**明确原则 —— 表达力不够就补原语，不要开后门放任意 HTML/JS。**

---

### P3 — 插件自有请求通道

**现状**：插件的 UI 想调后端，得自己开 IPC 通道。soul-memory 开了 11 个通道（+ 类型契约 + 两棵 IPC 树各一份 handler + preload 11 个方法），web 端等价能力又是 10 条 HTTP 路由 + `RuntimeMemoryAdapter`（**加进了 `packages/core` 的 facade**）+ web platform 11 个方法。Electron 与 web 两套手工同步。

**现成的地基**：`packages/core/ipc/index.ts` 已经有 `defineRouter` / `getChannelName(domain, method)` / `RouteConfig` —— **不需要从零设计路由**。

**接口**

```ts
// 插件侧
api.registerRequestHandler('overview', async (payload, ctx) => ({ files: [...] }))

// UI 侧：宿主统一提供，Electron 与 web 各实现一次，之后所有插件复用
platformApi.pluginRequest(pluginId, 'overview', payload)
```

**落地**：Electron 侧一个 `plugin:request` 通道按 `pluginId + action` 分发；server 侧一条
`/api/plugins/:id/:action`。**通道只加一次，此后任何插件零成本获得 Electron + web 双端能力。**

**验收**：一个插件注册 handler 后，在 Electron 与 web 两端都能调通，且没有在 `@shared/ipc/channels.ts` 里新增任何常量。

**依赖**：若 P2 走声明式 UI，P3 的需求会小很多（action id 已经够用）。但插件要做自定义视图、或要被外部调用时仍然需要。**建议在 P2 之后做**，届时通信形态已经清楚。

---

### P4 — 流协议扩展点

**现状**：`loading-memory` 作为 `ContentPart` 的一个成员，贯穿
`shared/ipc/chat.ts` → `core` → `runtime` → renderer store → `MessageThinking.vue` **五层**。
一个插件想在气泡里显示"正在取记忆"，代价是改共享流协议。

**方案**：协议里只加**一个**泛化成员，插件想显示什么是**数据**，不是类型。

```ts
// 协议：只此一个成员
| { type: 'plugin-status'; pluginId: string; label: string }

// 插件侧
api.emitTransientStatus(sessionId, { label: 'Extracting memory' })
```

渲染层只认 `plugin-status` 一种类型，`isTransientPart` 里只加一次判断。

**验收**：新插件显示自定义状态，`packages/shared/ipc/chat.ts` **零改动**。

**依赖**：无，小而独立。可以最先做（工作量最小，能立刻验证"泛化优于枚举"这条思路）。

---

### P5 — 边界守卫的通用化（防复发）

**现状**：`scripts/headless-boundary-check.ts` 里曾有 22 个 soul-memory 专属规则组 + 21 个检查函数，
共 **1101 行**，随插件退役全部变成死代码。同时 `packages/core` 里曾藏着
`general.soulMemory.activeMemory.timeoutMs` —— 现有 `architecture-boundaries.test.ts` 只查 import
方向，**查不出这种没有 import 的知识泄漏**。

**三条**

1. **规则按目录，不按符号名**。那 22 个规则组本质只表达一件事：「这段逻辑该在 runtime，不该回流主进程」。应是一条通用的目录规则，而不是逐条枚举函数名的正则
2. **给 core 加"不认识具体功能"检查**：`packages/core` 里不允许出现任何已知 pluginId / 内置功能名的字符串字面量与属性名
3. **alias 存在性断言**：`onething.aliases.ts` 每条 alias 的目标文件必须存在。这次清出 **10 条指向不存在文件的死登记**，能潜伏那么久是因为 tsconfig 通配符让 typecheck 永远不报错（退役记录 §4.3）

**验收**：故意在 `packages/core` 里写一个 `general.somePlugin.x` 读取 → 守卫报错；故意加一条指向不存在文件的 alias → CI 报错。

**依赖**：无。**随时可做，且做了就能防住下一次。**

---

### P6 — 开放够不着的注册表（B 线）

**现状**：§1.4 那张表 —— AI provider、变量提供者、权限能力、IM 连接器、后置触发器、后台作业，
`register*` 函数都导出着，宿主自己在用，插件够不着。

**成本**：单条通常就是在 `api.ts` 的 `host` 对象里加一行转发 + `CorePluginAPI` 加一个方法。

**真正要想清楚的是卸载语义**，这才是本期的实质工作：

| 注册表 | 停用时的问题 |
| --- | --- |
| AI provider | 正在用该 provider 的会话怎么办？（拒绝停用 / 降级到默认 / 让会话失败） |
| 变量提供者 | 提示词里已注入的变量引用如何收敛 |
| 权限能力 | 已授予的 grant 是否随插件消失 |
| IM 连接器 | 在线连接怎么优雅断开 |

**建议**：**不要一次性全开**。按实际需求逐个开，每开一个把卸载语义写进本文档。第一个候选建议是
**变量提供者**（无状态、卸载语义最简单），拿它验证整套模式。

**依赖**：无，但建议在 P1（生命周期契约）之后，届时"卸载"已有统一说法。

---

### P7 — 治理层：安全、版本、隔离（C 线）

**现状**：§1.5。用户插件裸 `import()` 跑在主进程，完整 Node 权限；manifest 无权限声明；
`minAppVersion` 声明了但**全库零处消费**；无插件间依赖；ESM 模块缓存导致热重载拿到旧模块。

**这里的不对称值得反复强调**：

> AI 调一个工具要过 `permissionGuard`、要用户逐次批准、还有 channel affinity 防伪造；
> 而插件代码本身装上就能读写任意文件、起任意子进程、连任意网络，**不需要任何批准**。

**分三步，按代价递增**

1. **`minAppVersion` 真正生效**（半天工作量）：加载前比对版本，不匹配则标记 `error` 不加载。**声明了就该检查，这是最低成本的诚实**
2. **manifest 权限声明 + 安装时告知**（中等）：`permissions: ['fs:read', 'net', 'shell']`，安装/启用时展示给用户。**先做知情，再做强制** —— 即使不强制，可见性本身就有价值
3. **真沙箱**（大）：worker 线程 / `vm` 上下文 / 独立进程，按声明的权限注入受限的能力对象

**判断**：**只跑自家三个内置插件的话，这一整期可以一直欠着**。一旦要开第三方生态，第 3 步是**先决条件而非优化项** —— 那时再补的代价会远大于现在。

---

## 分期与依赖

```
P4 (流协议)      ── 独立，最小，建议先做验证思路
P5 (守卫)        ── 独立，做了就防住下一次
P0 (配置)        ── 独立，性价比最高
P1 (数据/生命周期) ── 独立
      ↓
P2 (声明式 UI)   ── 最大一块，建议拿现有内置面板试炼
      ↓
P3 (请求通道)    ── 待 P2 定下通信形态
      
P6 (开放注册表)  ── 建议在 P1 之后（卸载语义已统一）；按需逐个开
P7 (治理)        ── 独立，仅第三方生态时必需
```

**建议顺序**：`P5 → P4 → P0 → P1 → P2 → P3`，P6 按需插入，P7 看是否做生态。

先做 P5 和 P4 的理由：都小、都独立、都能立刻验证方向对不对，而且 P5 做完之后，后面几期的实现本身就受守卫保护。

**最终验收**：P0–P4 完成后，重新实现一个 soul-memory 级别的插件（有面板、有设置、有数据、有状态指示），
应当**不需要改动任何宿主文件**；把它删掉，宿主树 `git diff` 应为空。

---

## 一句话

今天的插件系统是一套**给 AI 加能力**的系统，做得不错；要它承载**带界面的产品功能**，缺的不是某个 API，
而是「插件可以拥有自己的配置、数据、界面和通道」这个前提。补齐这个前提之前，任何这类功能都只会是
「一段恰好被 loader 注册了的宿主代码」，而拔除它的代价，就是这次的 16,989 行。
