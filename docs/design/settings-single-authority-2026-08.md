# 设置系统重构方案：主进程单一权威 + 渲染层去设置化

**版本 2**（2026-08-06 重写）。v1 的形态是"主进程权威 + 整包投影到每个窗口"，
被否决——投影出去的副本仍要靠推送保持同步，而"同步"本身就是问题来源。
本版改为：**渲染层大部分根本不持有设置**。

现状问题清单见 `docs/audit/settings-system-map-2026-08-06.md`。

---

## 〇、定稿架构

1. **开局只读一次**，之后读永不碰磁盘。
2. **主进程一个内存权威**；进程内所有消费者拿同一个对象引用。
3. **读自由，写加锁**；锁必须包住 read-modify-write，写完立即落盘。
4. **渲染层不持有设置整包**；只留必须在浏览器侧同步求值的几个字段，
   其余改为**向主进程要结果**，而不是要原料。

---

## 一、现状：设置一共有几份

按"持有型副本"（存在某处、跨时间存活、可能与权威分叉）统计：

| # | 位置 | 形态 | 能写回? |
|---|---|---|:---:|
| 1 | `repository.state.value`（`app/stores/settings.ts:6`） | **权威** | ✅ |
| 2 | `app/providers/model-registry.ts:415` 捕获的 `const settings` | 跨整个异步刷新持有的引用 | ❌ 危险 |
| 3 | `settingsStore.settings`（`stores/settings.ts:81`） | 深拷贝整包，**每渲染进程一份** | ❌ 危险 |
| 4 | `SettingsPage.localSettings`（`:323, :526`） | 再深拷贝一份 | ❌ 危险 |
| 5 | `SettingsPage.originalSettings`（`:324, :527`） | 整包的 JSON 字符串快照，供 diff | 只读 |
| 6-10 | localStorage：`cached-theme` / `cached-color-theme` / `cached-theme-id`×3 / `cached-theme-css` / `CHAT_FONT_CACHE_KEY` | 字段级镜像，首屏防闪烁 | 只读 |
| 11 | `apps/server` 自己的 authority | 独立进程 | ✅ |
| 12 | CLI daemon 自己的 authority | 独立进程 | ✅ |
| 13 | `~/.onething/settings.json` | 磁盘 | — |

| 场景 | 整包副本数 |
|---|---:|
| 只开主窗 | 3 |
| 打开设置窗 | 6 |
| 叠加模型刷新 | 7 |
| 再叠加 server | 8 |

**副本多不致命，能整包写回的路径才致命。现在有 4 条：**

```
#1 权威        → saveSettings()                       ✅ 应该有
#2 刷新期快照   → saveSettings(settings)               ❌ 用几秒前的整包覆盖
#3 渲染层 store → saveAIProviderDefault / updateTheme … ❌ 用本窗快照覆盖
#4 设置页草稿   → 500ms 防抖整包回写                    ❌ 用开窗那一刻的快照覆盖
```

`#2` 还额外**就地改权威对象**：

```ts
const settings = getSettings();                       // 拿到权威的引用
(settings.ai.providers as Record<string, any>)[pid] = {};  // 直接改权威
saveSettings(settings);
await refreshAllOnethingProviderModels({ getSettings: () => settings, ... })
                                        // ↑ 整个网络期间都用这份，回来再整体写回
```

---

## 二、三个必须先讲清的判断

### 判断一：光加锁挡不住丢写，写入 API 必须换形

`settings-repository.ts:81-89` 的 `save()` **已经有跨进程文件锁**：

```ts
save(settings: TSettings): TSettings {
  return withFileLockSync(`${fileOptions.filePath}.lock`, () =>
    saveCoreCachedJsonFile(this.state, fileOptions, settings),
  )
}
```

但它锁的是"把这个对象写进文件"，而**对象是调用方在锁外算好的**：

```
A: getSettings() → S0        B: getSettings() → S0
                             B: save(S0+x)【持锁】→ 磁盘 = S0+x
A: save(S0+y)【持锁】→ 磁盘 = S0+y          ← B 的 x 消失
```

两次都规规矩矩持了锁，改动照样丢。**锁的位置错了，得往前挪，把"改"也包进去。**
因此写入必须从 `save(整包)` 变成 `mutate(fn)`，`fn` 在锁内拿到当时最新值。

### 判断二："读一次 use everywhere"在主进程已经成立

`app/stores/settings.ts:6` 是模块级 `const`，主进程从 `whenReady` 活到 `quit`，
中间不重启。`getSettings()` 就是 `return this.state.value`——不拷贝、不序列化、不读盘。

```
主进程堆（一个 V8 堆）
  settings 对象 ← engine / tool executor / MCP / gateway / scheduler / permission …
                  全部拿到【同一个对象引用】，零成本，永不陈旧
```

**目标形态在主进程内已经是现实。** 需要补的只有判断一的锁。

注意区分两个词：主进程变量是**常驻内存**（进程活着就在），不是**持久化**（进程死了还在）。
后者是 settings.json 的职责。

### 判断三：渲染层的设置读，大部分是"要原料"而不是"必须"

渲染层读设置的规模：**21 个文件、116 处引用**，45 处在 `.vue` 里。按段分布：

| 读的是 | 次数 | 性质 |
|---|---:|---|
| `settings.general`（theme / 字体 / 密度） | 21 | **只能在渲染层**——要写进 CSS 变量，模板同步求值 |
| `settings.ai`（providers / model） | 35 | **不必在渲染层**——是决策逻辑，原料在主进程更近 |
| `voice` / `chat` / `music` / `tools` | 17 | 多数是决策 |

`settings.ai` 那 35 处，读它是为了**算出**"有哪些可选模型"、"这个会话该用哪个 provider"。
这些计算在主进程做是零成本的。渲染层真正要的是**算完的结果**——一个几百字节的列表，
而不是 148KB 的 `models[]` 原料。

这也解释了审计报告第五节 B 那三份互不一致的聚合
（`useModelLedger` / `ModelSelector` / `AgentConfigForm`）：
**每一份都拿到了原料，于是每一份都自己下厨。** 不给原料只给成品，三套自然合成一套。

同理，`stores/helpers/provider-model.ts` 是引擎侧 `getEffectiveProviderConfig` 的
**手写镜像**，文件顶部注释明写"两侧必须逐条一致，任何分歧就是'选了 deepseek、
账单记在 codex'那类事故"。改成向主进程要结果之后，这份镜像**整个删掉**——
不存在两份实现，就不可能不一致。

---

## 三、目标形态

```
┌──────────────────────────────────────────────────────────────────┐
│ 主进程                                                            │
│                                                                   │
│   settings authority（模块级常驻，唯一真相）                       │
│     ├── getSettings()  → 返回引用，无锁，零成本                    │
│     └── mutateSettings(fn) ─┐                                     │
│                             │ withFileLock（包住整个 R-M-W）      │
│              ┌──────────────▼───────────────┐                     │
│              │ 1 读内存 → 2 next = fn(cur)  │                     │
│              │ 3 normalize → 4 写内存        │                     │
│              │ 5 落盘 → 6 通知进程内订阅者   │                     │
│              └──────────────────────────────┘                     │
│                                                                   │
│   派生结果 API（读权威、算好、只吐结果）                            │
│     models:list()            → 可选模型列表（替代三套聚合）         │
│     models:resolveForSession → 该会话的 provider+model（替代镜像）  │
│     settings:readSection(k)  → 冷段整段（设置页专用）              │
└───────▲──────────────────────────────┬───────────────────────────┘
        │ IPC                          │ IPC
        │ mutate(patch) → 返回新值      │ 结果（几百字节，用完即弃）
        │                              ▼
┌───────┴───────────────────────────────────────────────────────────┐
│ 渲染进程 ×N                                                        │
│                                                                    │
│   常驻：general 热切片（theme/字体/密度，几 KB）← 必须同步读        │
│   临时：各视图当场问来的结果，组件卸载即释放                        │
│   不再持有：providers 整包 / apiKey / 148KB models / MCP / skills   │
│   不存在：任何能把整包写回去的路径                                  │
└────────────────────────────────────────────────────────────────────┘
```

---

## 四、API 契约

### 主进程侧

`packages/onething-runtime/src/app/stores/settings.ts` 改成：

```ts
/** 读。无锁、同步、返回引用。启动后永不碰磁盘。 */
export function getSettings(): AppSettings

/**
 * 写。唯一入口。fn 在跨进程锁内执行，入参是当时最新的权威值。
 * 返回落盘后的新值。
 */
export function mutateSettings(fn: (current: AppSettings) => AppSettings): AppSettings

/** 语法糖，内部就是 mutateSettings。 */
export function patchSettings<K extends keyof AppSettings>(
  section: K,
  patch: (current: AppSettings[K]) => AppSettings[K],
): AppSettings

/** 启动时调用一次；再调是 no-op。 */
export function initializeSettings(): Promise<AppSettings>

/** 进程内订阅，替代现在散落的手写副作用调用链。 */
export function onSettingsChanged(fn: (next: AppSettings, prev: AppSettings) => void): () => void
```

**删除**：

| 旧 API | 原因 |
|---|---|
| `saveSettings(settings)` | 整包写，丢写源头 |
| `saveSettingsAsync(settings)` | 同上；且现在只是 `save()` 的包装（`:56-58`），异步是假的 |
| `invalidateSettingsCache()` | 与"开局只读一次"冲突 |
| `updateSettingsInMemory(settings)` | 内存与磁盘分叉的口子 |
| `get()` 里的 sync fallback（`settings-repository.ts:71-72`） | 同上 |

`getSettings()` 返回的对象**不得就地修改**。P0 阶段先对顶层与各段做一层浅冻结
（不深冻结 `ai.providers[x].models`——148KB 数组深冻结代价不可接受），
配合把 `model-registry.ts:415` 那类就地改全部改掉。

### IPC 侧

| 通道 | 方向 | 载荷 |
|---|---|---|
| `settings:mutate` | R→M（invoke） | `{ section, path[], value }`，返回改后的**相关切片** |
| `settings:read-section` | R→M（invoke） | `section` 名，返回该段 |
| `settings:hot-changed` | M→R（推送） | **只推 general 热切片**，几 KB |
| `models:list` | R→M（invoke） | 可选模型列表（算好的） |
| `models:resolve-for-session` | R→M（invoke） | `{ providerId, model }` |

IPC 传不了闭包，所以渲染层的写是**patch 描述**，主进程把它翻译成 `mutateSettings(fn)`。

推送只保留热切片一条。冷段不推——设置页每次打开重新拉，关掉就没了，
不存在"陈旧"这个状态。

---

## 五、渲染层三分法

| 类别 | 内容 | 生命周期 | 拿法 |
|---|---|---|---|
| **热切片** | `theme`、`general.colorTheme/baseTheme/themeId/darkThemeId/lightThemeId`、`typographyDensity`、`messageListDensity`、`chat.chatFontZh/En`、`chatFontSize` | 窗口存活期常驻 | 启动拉一次 + `settings:hot-changed` 推送 |
| **结果** | 可选模型列表、当前会话的 provider+model、语音可用性… | 视图存活期 | 用时 invoke，组件卸载即释放 |
| **冷段** | `ai.providers` 详情、`mcp`、`acp`、`skills`、`tools`、`network` | 设置页打开期 | `settings:read-section` 按需拉 |

判定标准很简单：**能不能容忍异步？** 能异步的一律不常驻。
只有"模板同步求值 + 写进 CSS 变量"这一类留在热切片里。

localStorage 那 6 个镜像**保留**。它们是纯只读、只在 Vue 起来之前读一次防闪烁、
从不参与回写——这正是"良性缓存"与"危险副本"的分界：**是否具备写回能力**。

---

## 六、多进程边界

```
主进程          ← 权威（mutateSettings + 文件锁）
  │ IPC = 结构化克隆（序列化 + 拷贝，不是引用）
  ▼
渲染进程 ×N     ← 热切片常驻 + 结果临时持有
```

渲染进程读不到主进程内存——这是 OS 的进程隔离，不是 Electron 的能力缺陷。
任何数据过边界都变成拷贝。所以渲染层要么持有拷贝，要么不持有；本方案选后者
（除热切片外）。

窗口生命周期（已核实，**无需改动**）：

| 窗口 | 生命周期 |
|---|---|
| 设置窗 | `settings-window.ts:35` 打开时 `new BrowserWindow`，`:64` 关闭即销毁 |
| todo-plan / 图片预览 | 同上，销毁 |
| 搜索窗 | `search-window.ts:275` 用 `hide()` 复用（为 Cmd+F 秒开） |

即"用时才开、关掉就没"已经成立。要修的是 `App.vue:1093` 那个**无条件**的
`loadSettings()`——同一段代码里已读水位、dock 徽标都做了 `isAuxiliaryWindow` 保护，
唯独设置没有，导致图片预览窗、voice runtime 窗也各自拉了 513KB。

其他宿主：`apps/server` 与 CLI daemon 是完全独立的 OS 进程，各有一份权威。
跨宿主靠 `StoreLock` 互斥。**审计发现 `apps/server/src` 里找不到 `StoreLock.acquire`
调用**（CLAUDE.md 声称有），P0 需落实；否则 desktop 与 server 同跑就是两份权威各写各的，
文件锁保得住格式、保不住内容。

---

## 七、分期

### P0 — 核心换形（不改调用方）

1. `settings/settings-repository.ts` 新增 `mutate(fn)`：
   `withFileLockSync` 内 读 → fn → normalize → 写内存 → 落盘。
   锁超时策略改 `onTimeout: 'throw'`（`file-mutex.ts:184-191` 现在是 best-effort 无锁执行，
   在写路径上等于静默丢写）。
2. `app/stores/settings.ts` 导出新 API；旧 `saveSettings` 保留为废弃壳，
   内部转成 `mutate(() => settings)`，迁移期行为不变。
3. `get()` 去掉 sync fallback，未初始化直接抛错（暴露漏调 `initializeSettings()` 的宿主）。
4. 加进程内 `onSettingsChanged` 订阅表。
5. 落实 `apps/server` 的 `StoreLock.acquire('server')`。

验收：现有测试全绿；新增并发 mutate 测试（两个 mutate 交错，两处改动都在）。

### P1 — 主进程 28 处调用点迁移

现存整包写入调用点 **28 处**（v1 说的 43 是把接口声明和已退役的 soul-memory 算进去了）：

| 文件 | 处数 |
|---|---:|
| `skills/ipc-operations.ts` | 5 |
| `providers/model-registry.ts` | 3 |
| `mcp/server-orchestration.ts` | 3 |
| `acp/ipc-operations.ts` | 3 |
| `app/headless/backend.ts` | 4 |
| `app/providers/model-registry.ts` | 2 |
| `app/voice/service.ts` / `app/music/service.ts` | 2 |
| `apps/electron/src/main/ipc/{settings,music,mcp,acp}.ts` | 4 |
| `settings/settings-save.ts`、`apps/electron/src/settings/ipc-host.ts` | 2 |

重点是 `model-registry`：那个"await 前抓快照、await 后整体回写"必须改成
**await 之后**才进 mutate，且只合并自己那几个字段（`models` / `modelsLastFetched`）；
`:415` 的就地改权威一并删掉。

验收：runtime 内 `saveSettings(` 只剩废弃壳；boundary/单测全绿。

### P2 — 渲染层去设置化（**本方案的主体**）

分四步，可独立合并：

**P2.1 结果 API 落地**
- 主进程新增 `models:list`、`models:resolve-for-session`。
- 实现直接复用引擎侧现成的 `getEffectiveProviderConfig` 与 provider registry，
  不新写聚合规则。

**P2.2 消灭三套聚合与一份镜像**
- `ModelSelector.vue:279-292, 398-425`、`useModelLedger.ts:98-138`、
  `AgentConfigForm.vue:651-659` 三处改为调 `models:list`。
- `stores/helpers/provider-model.ts` **整个删除**，调用方改调
  `models:resolve-for-session`。这同时消灭"两份手写解析链必须逐条一致"这条长期债。

**P2.3 写入路径收敛**
- `settings:save` → `settings:mutate`（patch 描述）。
- `platformApi.saveSettings` → `mutateSettings(patch)`；web 端对应 `PATCH /api/settings`。
- 删掉 `stores/settings.ts` 里 5 处裸赋值（`updateAIProvider:336`、`updateAPIKey:353`、
  `updateModel:358`、`updateTemperature:363` …）。
- `saveAIProviderDefault:377`、`updateProviderThinking:407`、`updateTheme:454` 改发 patch。

**P2.4 热/冷切分**
- `settingsStore.settings` 整包退休，换成 `hotSettings`（几 KB）。
- 冷段访问改 `settings:read-section`。
- `App.vue:1093` 的 `loadSettings()` 加 `isAuxiliaryWindow` guard；副窗口只取热切片。

### P3 — 设置页草稿模型拆除

`SettingsPage` 现在的 `localSettings`（`:323, :526`）+ `originalSettings`（`:324, :527`）
+ 500ms 防抖（`:653-666`）+ 不 flush 的 `onUnmounted`（`:800-805`），四样一起拆：

- 各 Tab 的 `emit('update:settings', 整包)` 改为 `emit('patch', { section, path, value })`。
- `localSettings` 退化为"当前打开的那几个冷段"，不再是整包。
- 防抖去掉——patch 是字段级的，直接写。
- 实施前先确认设置页的保存 UX：`SettingsActionBar.vue` 存在但 `SettingsPage.vue` 未引用，
  `:516` 附近有个"有无改动"判断。要看清是纯自动保存还是有显式确认。

验收：`grep 'update:settings'` 在 `components/settings/` 下归零。

### P4 — 存储瘦身

1. **`storage` / `evals` 补回 `mergeWithDefaults`**（`defaults/settings.ts:504-577`）——
   这两段现在每次加载都被静默丢弃，`settings.storage.sessionFormat` 是死开关。
2. **模型目录缓存搬出 settings.json**：
   `providers[x].models` / `modelsLastFetched` 占全文件 96%（本机 268KB / 513KB，
   openrouter 一家 148KB），是可再生缓存，不该跟配置同生共死。
   移到 `~/.onething/cache/provider-models/<providerId>.json`，加一次性迁移。

   **这一期直接决定写入成本**：write-through 每次 mutate 都落盘，
   带着半兆缓存写，模型刷新期会是高频大写。P4 不做，P0 就得给落盘加防抖——
   那与"改后立即更新文件"的语义有出入，是个取舍。

---

## 八、验收标准

不写成"缓存只剩一份"——那既做不到（进程隔离）也不必要（只读缓存无害）。写成：

1. **渲染层不存在任何一条能把设置整包写回去的路径。**
   `grep` 渲染层无 `saveSettings(整包)` 形态；所有写都是 patch 描述。
2. **主进程内没有跨 await 持有的 settings 引用。**
   `model-registry` 那类捕获全部消除。
3. **并发 mutate 不丢写。** 单测覆盖：两个 mutate 交错执行，两处改动都在。
4. **跨窗口不丢写。** 手工复现：设置窗开着 → 主窗换模型 → 设置窗动开关 →
   模型改动仍在。
5. **模型列表只有一份实现。** 三处聚合与一份解析镜像全部删除。
6. **副窗口不再拉整包。** 图片预览窗内存里没有 `providers`。

---

## 九、风险与取舍

| 风险 | 处置 |
|---|---|
| 落盘变高频（write-through + 513KB） | P4 搬走缓存；否则 P0 加落盘防抖（有语义出入） |
| `getSettings()` 返回引用被就地改 | 浅冻结两层 + 迁移期删净裸赋值；深冻结代价不可接受 |
| 结果 API 引入异步，视图需处理 loading | 只影响冷路径；热切片仍同步 |
| 28 处一次性迁移风险 | P0 保留废弃壳，P1 可分批合并 |
| desktop / server 并发两份权威 | P0 落实 server 的 StoreLock |
| 文件锁超时 best-effort 无锁执行 | 写路径改 `onTimeout: 'throw'`，宁可失败不静默丢写 |

---

## 十、不在本方案内

审计同期发现、与本方案无因果，单独排期：

- **模型归属分裂**（`settings.ai.provider` vs Default Agent 的 `model` 绑定）。
  已定方向"聊天链路不吃 agent 配置"，切口是两个咽喉点：
  `app/engine/stream-engine.ts:193-212` 与 `stores/helpers/provider-model.ts:72-81`。
  这是 ★ 失效那个 bug 的直接根因，**不依赖本方案，可以先修**。
  （注：P2.2 会删掉 `provider-model.ts`，两件事在那一处会交汇，先修 bug 更简单。）
- `AgentConfigForm.vue:701-711` 切 provider 时自动填 `modelChoices[0]`，替用户做决定。
