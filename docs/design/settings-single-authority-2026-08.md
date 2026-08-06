# 设置系统重构方案：单一内存权威

定稿架构（用户 2026-08-06）：

> 设置开局只读一次，全局为一个内存设置存储，read 都允许，修改加锁，改后更新设置文件。

现状问题清单见 `docs/audit/settings-system-map-2026-08-06.md`。本文档只讲怎么改。

---

## 一、目标形态

```
                     ┌──────────────────────────────────────┐
   boot ──读一次──▶  │   settings authority (进程内单例)     │
                     │                                       │
   getSettings() ───▶│   value: AppSettings   ← 唯一权威      │──▶ 返回引用，无锁
   （任意频率，无锁） │                                       │
                     │   mutateSettings(fn) ─┐               │
   mutateSettings ──▶│                       │ withFileLock  │
                     │      ┌────────────────▼────────────┐  │
                     │      │ 1. 读当前内存值              │  │
                     │      │ 2. next = fn(current)       │  │
                     │      │ 3. next = normalize(next)   │  │
                     │      │ 4. 写内存                    │  │
                     │      │ 5. 同步落盘 settings.json    │  │
                     │      │ 6. 通知订阅者                │  │
                     │      └─────────────────────────────┘  │
                     └──────────────────────────────────────┘
```

四条不变量：

1. **读永远不碰磁盘。** 启动后 `getSettings()` 只返回内存值，没有 sync fallback、没有 invalidate。
2. **写永远不接受整包。** 唯一写入口是 `mutateSettings(fn)`，`fn` 在锁内拿到**当时最新**的值。
3. **锁包住整个 read-modify-write**，不只是落盘那一瞬。
4. **内存与磁盘同步推进**：mutate 返回时，磁盘已经是新值。

---

## 二、关键判断：为什么写入 API 必须换形

方案里"修改加锁"这一条，如果保持现在 `saveSettings(settings: AppSettings)` 的签名，
**锁挡不住丢写**。

现在 `settings-repository.ts:81-89` 的 `save()` 已经有跨进程文件锁了：

```ts
save(settings: TSettings): TSettings {
  return withFileLockSync(`${fileOptions.filePath}.lock`, () =>
    saveCoreCachedJsonFile(this.state, fileOptions, settings),
  )
}
```

它锁住的是"把这个对象写进文件"，但**对象是调用方在锁外算好的**。所以：

```
A: getSettings()  → 拿到快照 S0
B: getSettings()  → 拿到快照 S0
B: 改 x，saveSettings(S0+x)  → 【锁】写盘 → 磁盘 = S0+x
A: 改 y，saveSettings(S0+y)  → 【锁】写盘 → 磁盘 = S0+y   ← B 的 x 没了
```

两次写都规规矩矩持了锁，B 的改动照样消失。审计报告第四节那个跨窗口丢写场景
（设置窗持旧快照 → 覆盖主窗的模型改动），就是这个形状。

**结论：锁必须包住 read-modify-write 整体，因此 `fn` 必须在锁内执行。**
这是把 43 处后端调用点和整条渲染层写入链都要改的原因，也是本方案的成本大头。

---

## 三、新 API 契约

`packages/onething-runtime/src/app/stores/settings.ts` 改成：

```ts
/** 读。无锁、同步、O(1)。启动后永不碰磁盘。 */
export function getSettings(): AppSettings

/**
 * 写。唯一入口。
 * fn 在跨进程锁内执行，入参是当时最新的权威值。
 * 返回落盘后的新值。
 */
export function mutateSettings(fn: (current: AppSettings) => AppSettings): AppSettings

/** 语法糖，内部就是 mutateSettings。 */
export function patchSettings<K extends keyof AppSettings>(
  section: K,
  patch: (current: AppSettings[K]) => AppSettings[K],
): AppSettings

/** 启动时调用一次。之后再调是 no-op。 */
export function initializeSettings(): Promise<AppSettings>

/** 订阅变更（进程内）。用于替代现在散落的手写副作用调用。 */
export function onSettingsChanged(listener: (next: AppSettings, prev: AppSettings) => void): () => void
```

**删除**的旧 API：

| 旧 API | 为什么删 |
|---|---|
| `saveSettings(settings)` | 整包写，丢写源头 |
| `saveSettingsAsync(settings)` | 同上；且它现在只是 `save()` 的包装（`:56-58`），异步是假的 |
| `invalidateSettingsCache()` | 与"开局只读一次"直接冲突 |
| `updateSettingsInMemory(settings)` | 内存与磁盘分叉的口子 |
| `get()` 里的 sync fallback（`settings-repository.ts:71-72`） | 同上 |

`getSettings()` 返回的对象**不得就地修改**。第一期先靠约定 + `mutate` 后对顶层与
各段做一层浅冻结（不深冻结 `ai.providers[x].models`，148KB 的数组深冻结代价太大）；
后续可加 boundary 规则禁止 `getSettings().x =` 形态的赋值。

---

## 四、多进程边界：谁是"全局唯一"

"全局一个内存存储"在 Electron 下必须落到**主进程**。渲染进程是另一个 V8，
它拿不到那个单例，只能持有副本。

```
┌─────────────────────────────────────────────────────────────┐
│ main process           ← 权威 (mutateSettings + 文件锁)      │
│   settings authority                                         │
└───────▲───────────────────────────────────┬─────────────────┘
        │ IPC 'settings:mutate'             │ IPC 'settings:changed'
        │ （字段级意图，不是整包）           │ （整包，刷副本）
        │                                   ▼
┌───────┴───────────────────────────────────────────────────────┐
│ renderer (主窗 / 设置窗 各一份)                                │
│   settingsStore.settings  ← 只读副本，只由广播更新             │
│   任何写 → 发 mutate 意图，等广播回来才变                      │
└───────────────────────────────────────────────────────────────┘
```

规则：

- 渲染层**不再** `platformApi.saveSettings(整包)`。改为发送"改哪一段、怎么改"的意图。
- 意图的可序列化形态：IPC 传不了闭包。用 **section + 路径 + 值** 的 patch 描述，
  主进程侧把它翻译成 `mutateSettings(fn)`。
  例：`{ section: 'ai', path: ['providers', 'deepseek', 'model'], value: 'deepseek-v4-pro' }`。
- 广播改为**发给所有窗口，包含发起方**。现在 `apps/electron/src/main/ipc/settings.ts:58`
  的 `exceptWebContentsId: event.sender?.id` 要去掉 —— 发起方不再持有权威，
  必须和别人一样等广播。

其他宿主：

- **apps/server**：独立进程，自己一份 authority。审计时发现 `apps/server/src` 里
  **没有 StoreLock.acquire 调用**（CLAUDE.md 声称有），实施 P0 时需确认；
  若确实没有，desktop 与 server 同时跑会各持一份"开局只读一次"的内存值，
  跨进程文件锁能保证文件不损坏，但保证不了两边内存一致。
  这一条要么补上 StoreLock，要么显式接受"同一 store 不并发跑两个宿主"。
- **CLI daemon**：`daemon-server.ts:45` 已 `acquire('daemon')`，与 desktop 互斥，无新问题。

---

## 五、分期实施

### P0 — 核心换形（不改任何调用方）

1. `packages/onething-runtime/src/settings/settings-repository.ts`
   新增 `mutate(fn)`：`withFileLockSync` 内 read → fn → normalize → 写内存 → 落盘。
   保留 `save()` 但标 `@deprecated`，内部实现改成 `mutate(() => settings)`，
   这样旧调用点在迁移期间行为不变。
2. `app/stores/settings.ts` 导出新 API；旧 API 保留并标记废弃。
3. `get()` 去掉 sync fallback，未初始化直接抛错（暴露漏掉 `initializeSettings()` 的宿主）。
4. 加进程内 `onSettingsChanged` 订阅表。

验收：现有测试全绿；新增 repository 并发 mutate 测试（两个 mutate 交错，两处改动都在）。

### P1 — 后端 43 处调用点迁移

按域逐个换成 `mutateSettings` / `patchSettings`。重点两处：

- `providers/model-registry.ts:584, 627, 672` 和 `app/providers/model-registry.ts:423, 427`
  —— 审计第 5 条那个"await 前抓快照、await 后整体回写"必须改成
  **await 之后**才进 mutate，只合并自己那几个字段（`models` / `modelsLastFetched`）。
- `mcp/server-orchestration.ts:107, 142, 160`、`skills/ipc-operations.ts` 等
  ——都是"改一段"，直接 `patchSettings('mcp', …)`。

验收：`grep saveSettings(` 在 runtime 里只剩废弃壳；boundary/单测全绿。

### P2 — 渲染层写入收敛（**这一期才真正修掉丢写**）

1. IPC：`settings:save` 换成 `settings:mutate`，请求体是 patch 描述。
   主进程 handler（`apps/electron/src/main/ipc/settings.ts:26`）在 `mutateSettings` 内
   跑现有那串副作用（proxy / 快捷键 / voice / MCP / ACP / gateway / todo watcher）。
2. `platformApi`：`saveSettings` → `mutateSettings(patch)`；web 端（`platform/web.ts`）
   对应 `PATCH /api/settings`。
3. `stores/settings.ts`：
   - `settings.value` 变只读副本，只由 `onSettingsChanged` 广播赋值。
   - 删掉 5 处 `settings.value.x = …` 的裸赋值（`updateAIProvider:336`、
     `updateAPIKey:353`、`updateModel:358`、`updateTemperature:363` …）。
   - `saveAIProviderDefault:377`、`updateProviderThinking:407`、`updateTheme:454`
     改成发 patch。
4. 广播去掉 `exceptWebContentsId`。

验收：跨窗口丢写场景手工复现不再发生（设置窗开着 → 主窗换模型 → 设置窗动开关 →
模型改动仍在）。

### P3 — 设置页草稿模型改造

`SettingsPage.vue` 现在的 `localSettings`（`:331, :542`）是开窗时的一次性深拷贝，
配 500ms 防抖整包回写（`:653-666`），且 `onUnmounted` 不 flush（`:800-805`）。
在新架构下这三样都要拆：

- 各 Tab 的 `emit('update:settings', 整包)` 改成 `emit('patch', { section, path, value })`。
- `localSettings` 退化为纯展示绑定（直接用 `settingsStore.settings`），或只保留
  真正需要"暂存后确认"的表单段（如自定义 provider 对话框）。
- 防抖去掉：patch 是字段级的，直接写没有性能问题（前提是 P4 把 models 缓存搬走）。
- 实施前需确认设置页当前的保存 UX：`SettingsActionBar.vue` 存在但 `SettingsPage.vue`
  里没有引用，`:516` 附近有个"有无改动"的判断函数。要先看清是纯自动保存还是有显式确认。

验收：关窗丢写不再发生；`grep 'update:settings'` 在 settings 目录下归零。

### P4 — 清理

1. **`storage` / `evals` 补回 `mergeWithDefaults`**（`defaults/settings.ts:504-577`）。
   这两段现在每次加载都被静默丢弃，`settings.storage.sessionFormat` 是死开关。
2. **模型目录缓存搬出 settings.json。**
   `providers[x].models` / `modelsLastFetched` 占了全文件 96%（本机 268KB / 513KB，
   openrouter 一家 148KB）。它是可再生缓存，不该参与配置的每一次写。
   建议移到 `~/.onething/cache/provider-models/<providerId>.json`，
   `settingsStore.getCachedModels` 与 `model-registry` 改读新位置，
   加一次性迁移（首次启动搬走并从 settings 删字段）。

   **这一期直接决定 P0 的写入成本**：write-through 每次 mutate 都要落盘，
   带着半兆缓存写，模型刷新时会成为高频大写。如果 P4 不做，
   P0 需要给落盘加一层短防抖（与"改后更新文件"的语义有出入，是个取舍）。

---

## 六、风险与取舍

| 风险 | 处置 |
|---|---|
| 落盘变高频（write-through + 513KB） | P4 搬走缓存；否则 P0 加落盘防抖 |
| `getSettings()` 返回引用被就地改 | 浅冻结两层 + 迁移期把裸赋值全删；深冻结代价不可接受 |
| 43 处调用点一次性迁移风险大 | P0 保留废弃壳，P1 可分批合并 |
| desktop / server 并发时两份内存 authority | P0 先确认 server 是否真的 acquire StoreLock |
| 文件锁超时会 best-effort 无锁执行（`file-mutex.ts:184-191`） | mutate 路径改成 `onTimeout: 'throw'`，宁可失败也不静默丢写 |

---

## 七、不在本方案内

以下是审计报告里同期发现、但与本方案无因果的，单独排期：

- **模型归属分裂**（`settings.ai.provider` vs Default Agent 的 `model` 绑定）——
  你已定方向"聊天链路不吃 agent 配置"，切口在
  `app/engine/stream-engine.ts:193-212` 与 `stores/helpers/provider-model.ts:72-81`，
  两个咽喉点。这是当前那个 ★ 失效 bug 的直接根因，**不依赖本方案，可以先修**。
- **`AgentConfigForm.vue:701-711`** 切 provider 时自动填 `modelChoices[0]`。
- **模型列表三份手写聚合**（`useModelLedger` / `ModelSelector` / `AgentConfigForm`）。
