# 设置系统现状图（2026-08-06）

起因：设置页给模型加 ★ 后，新建聊天不走该模型。追下去发现不是那一处的 bug，
而是设置系统的维护方式本身有结构问题。这份文档只描述**现状**，不含方案。

---

## 一、设置存在哪

单文件：`~/.onething/settings.json`（路径经 `getOnethingStorePath()` 解析，
`packages/onething-runtime/src/app/stores/paths.ts:80`）。

Schema：`AppSettings`，`packages/shared/ipc/settings.ts:264-279`，14 个顶层字段。

实测（本机）体积分布：

| 段 | 体积 | 说明 |
|---|---:|---|
| `ai` | 268,442 B | **占全文件 96%** |
| `skills` | 5,022 B | 42 个 skill 开关 |
| `general` | 1,969 B | 20 个键，含 shortcuts / editor / soulMemory / todoPlan 等嵌套段 |
| `acp` | 1,322 B | |
| `voice` | 1,306 B | |
| `tools` | 636 B | |
| `chat` | 301 B | |
| `mcp` | 199 B | |
| 全文件 | **513,880 B** | |

`ai` 段为什么这么大 —— **模型目录缓存被存进了配置文件**：

| provider | 体积 | 键 |
|---|---:|---|
| openrouter | 148,367 B | apiKey, model, selectedModels, **models**, **modelsLastFetched**, enabled |
| qwen | 36,789 B | …**models**, **modelsLastFetched**, modelCapabilitiesByModel, maxOutputByModel… |
| openai | 19,364 B | …**models**, **modelsLastFetched**, temperatureByModel |
| gemini | 18,669 B | 同上 |
| github-copilot | 12,547 B | 同上 |
| claude | 6,661 B | 同上 |

`models[]` 是从 models.dev / provider API 拉回来的**可再生缓存**，
和 apiKey / selectedModels 这类**用户配置**混在同一个对象里、同一个文件里、
同一次写入里。后果见第四节。

### schema 里有、磁盘上没有的两段

`AppSettings` 声明了 `storage?` 和 `evals?`（`shared/ipc/settings.ts:277-278`），
但 `mergeWithDefaults`（`packages/shared/defaults/settings.ts:504-577`）返回的对象里
**没有这两个字段**。它是唯一的 normalize 入口，读写都过它，所以这两段每次加载都被
静默丢弃 —— 磁盘上确实一个都没有。

直接后果：`settings.storage.sessionFormat`（JSONL / legacy-json 回滚开关，
CLAUDE.md 里写着可用）是个**死开关**，写进去也活不过一次读取。

---

## 二、后端：一条整包读-改-写链，没有 patch

`packages/onething-runtime/src/app/stores/settings.ts` 是全部入口，一共 6 个导出：

```
initializeSettings()      → repository.initialize()
getSettings(): AppSettings           ← 同步热路径，返回整包
saveSettings(settings: AppSettings)  ← 唯一写入 API，参数是整包
saveSettingsAsync(settings)          ← 同上，异步版
invalidateSettingsCache()
updateSettingsInMemory(settings)     ← 只改内存不落盘
```

**没有 `patchSettings(path, value)`，没有版本号，没有 CAS。**
每个想改一个字段的调用方，都必须：`getSettings()` → 深拷贝改一处 → `saveSettings(整包)`。

这样的调用点全仓库 **43 处**。分布：

| 位置 | 大致职责 |
|---|---|
| `app/providers/model-registry.ts:423, 427` | 模型目录刷新回写 |
| `providers/model-registry.ts:584, 627, 672` | 同上，产品层 |
| `app/music/service.ts:70` | 音乐配置 |
| `app/voice/service.ts:761` | 语音配置 |
| `app/plugins/builtin/soul-memory.ts:900, 913` | 记忆插件 |
| `app/headless/backend.ts:500, 507, 523, 529` | CLI daemon |
| `mcp/server-orchestration.ts:107, 142, 160` | MCP 增删改 |
| `skills/ipc-operations.ts:187, 217, 286, …` | skill 开关 |
| … | 其余散在各域 |

归一化：`mergeWithDefaults` 在 repository 的 `normalize` 钩子里
（`app/stores/settings.ts:9`），读和写都过。它是唯一的 schema 守门人，
也是第一节那个"吞掉 storage/evals"的地方。

---

## 三、渲染层：两条并存的写入路子

### 路子 A —— 设置页：整包 emit + 500ms 防抖

```
子组件（各 Tab）
  emit('update:settings', { ...props.settings, 改动 })   ← 造一个全新的整包
    ↓
SettingsPage.vue:165  @update:settings="handleSettingsUpdate"
SettingsPage.vue:562  localSettings.value = newSettings
    ↓
SettingsPage.vue:653-666  watch(localSettings, deep) → setTimeout 500ms
    ↓
settingsStore.saveSettings(整包) → platformApi.saveSettings(整包)
```

`useModelLedger.setDefault`（那颗 ★，`:184-197`）走的就是这条。

两个已确认的问题：
- `onUnmounted`（`SettingsPage.vue:800-805`）**不 flush** `saveTimeout`。
  点完开关 500ms 内关掉设置窗 → 改动丢失。
- `localSettings` 只在挂载时深拷贝一次（`SettingsPage.vue:542`），
  之后**永不再同步**。见第四节 D。

### 路子 B —— store 上的立即写小入口

`packages/renderer/stores/settings.ts` 里有几个自己 `await saveSettings(...)` 的函数，
不经过设置页、不防抖：

- `saveAIProviderDefault(provider, model)` `:377-398` — 注释自称"唯一持久化入口"
- `updateProviderThinking(...)` `:407-452`
- `updateTheme(...)` `:454`

聊天里的模型选择器走的是这条（`ModelSelector.vue:489`、`ThinkToggle.vue:575`）。

**同一件事（设全局默认模型）在两条路子上各有一个实现**：
设置页 ★ 走 A（防抖、可丢），聊天选择器走 B（立即、可靠）。

### 还有 5 处直接改 `settings.value.x = …` 不落盘

`updateAIProvider` `:336`、`updateAPIKey` `:353`、`updateModel` `:358`、
`updateTemperature` `:363` 等 —— 只动内存，等别人顺手保存。

---

## 四、跨进程：整包广播，接收端只有一个

Electron 下设置页是**独立 BrowserWindow**，两个窗口各持有一份完整 settings 副本。

```
任一窗口 save → IPC 'settings:save'
  → apps/electron/src/main/ipc/settings.ts:26 saveSettingsFromIpc
  → store.saveSettings(整包) + 一串副作用（proxy / 快捷键 / voice / MCP / ACP / gateway / todo watcher）
  → broadcastElectronSettingsChanged({ settings: 整包, exceptWebContentsId: 发送方 })
  → 其他窗口 'settings:changed'
```

订阅者全仓库**只有一个**：`packages/renderer/App.vue:1149`，它更新 `settingsStore.settings`。

**`SettingsPage.vue` 的 `localSettings` 不在订阅链上。**

于是有这个丢写场景（未实测，但链路成立）：

```
1. 打开设置窗 → localSettings = 当时的整包快照
2. 在主窗聊天里换个模型 → 路子 B 立即整包写盘 → 广播到设置窗
3. 设置窗的 settingsStore.settings 更新了，但 localSettings 还是第 1 步的旧快照
4. 在设置窗随便动一个开关 → 500ms 后把【旧快照 + 这一处改动】整包回写
5. 第 2 步的模型改动被静默回滚
```

同形态的另一处（后端）：`providers/model-registry.ts:633-670`
在 `await fetchModelsDevData()` **之前**抓 settings 快照，网络回来后整体 `saveSettings`。
那几百毫秒到几秒的窗口期内，任何来源的设置写入都会被整包回滚。

---

## 五、真相源分裂

同一个语义有多个存储位或多份实现的地方：

### A. "新聊天用哪个模型" —— 两个存储位

| 存储位 | 文件 | 优先级 |
|---|---|---|
| `settings.ai.provider` + `providers[x].model` | settings.json | **低** |
| Default Agent 的 `model` 绑定 | agents.json | **高** |

解析链（渲染层 `stores/helpers/provider-model.ts:51-91`，
引擎层 `providers/provider-config.ts:353-403`，两份手写镜像）：

```
session.modelPinned  →  agent 绑定  →  session.lastProvider  →  settings.ai.provider
```

新聊天草稿固定带 `agentId: 'default'`（`stores/sessions.ts:590`），
所以 Default Agent 一旦有绑定，`settings.ai.provider` 永远轮不到。
设置页的 ★ 却是按 `settings.ai.provider` 画的（`useModelLedger.ts:106-124`）——
UI 标着 A，实际跑 B。

本机实测：settings 是 `deepseek / deepseek-v4-flash`，
agents.json 里 Default Agent 是 `qwen / qwen3.8-max`，跑的是后者。

### B. "provider × 可选模型" —— 三份手写聚合

底层数据同源（`providers[x].selectedModels` + `settingsStore.getCachedModels()`），
但聚合规则各写各的：

| 位置 | 启用过滤 | 额外塞入 |
|---|---|---|
| `useModelLedger.ts:98-138` 设置页总账 | `isProviderConfigEnabled(cfg)` | 无 |
| `ModelSelector.vue:279-292, 398-425` 聊天选择器 | 自写 `hasModels` | 当前模型、custom default |
| `AgentConfigForm.vue:651-659` agent 表单 | **不过滤** | `config.model`、当前绑定 |

结果：同一个 provider 可能在总账里看不见、在聊天里能选、在 agent 表单里必然能选。
`composables/` 下没有共享的目录 composable。

### C. 配置 vs 缓存混存

`providers[x].models` / `modelsLastFetched` 是可再生缓存，却和 apiKey 一起
存在配置文件里、参与每一次整包写。第一节的 513KB 就是这么来的。

---

## 六、已确认的坏点清单

| # | 位置 | 症状 |
|---|---|---|
| 1 | `agents/store.ts` + `provider-model.ts:72-81` | Default Agent 绑定架空全局默认（★ 无效）——本次 bug 的直接根因 |
| 2 | `AgentConfigForm.vue:701-711` | 切 provider 时自动填 `modelChoices[0]`，替用户做决定；本机的 qwen3.8-max 就是这么写进去的 |
| 3 | `SettingsPage.vue:800-805` | `onUnmounted` 不 flush 防抖，关窗丢写 |
| 4 | `SettingsPage.vue:542` | `localSettings` 挂载后不再同步，跨窗口丢写 |
| 5 | `providers/model-registry.ts:633-670` | await 前抓快照、await 后整体回写，窗口期内的写入被回滚 |
| 6 | `defaults/settings.ts:504-577` | `mergeWithDefaults` 吞掉 `storage` / `evals`；`sessionFormat` 是死开关 |
| 7 | `app/stores/settings.ts` | 无 patch API，43 处整包读-改-写 |
| 8 | 三处 | 模型列表三份手写聚合，边界行为不一致 |
| 9 | `useModelLedger.ts:184-197` vs `settings.ts:377` | "设全局默认"两套实现，一套可丢一套可靠 |

---

## 七、一句话总结

设置系统只有一个 API：**读整包、写整包**。
所有多方协作（两个窗口、43 个后端调用点、一个异步网络刷新）都在这一个 API 上
靠"谁最后写谁赢"来协调，没有字段级写入、没有版本号、没有冲突检测。
再加上可再生缓存和用户配置混存，让每次写入都要搬运半兆数据。

模型归属那个 bug，是这套机制上长出来的其中一颗果子。
