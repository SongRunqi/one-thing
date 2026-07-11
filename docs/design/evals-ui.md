# 评估体系 UI:Review 与 Run 面板设计方案

状态:设计稿,未实施。
日期:2026-07-08
前置阅读:`docs/design/prompt-evaluation.md`(评估体系总设计,Phase 0-2 已落地)

---

## 1. 背景与问题

评估体系的数据链路已经打通,但全部出入口都在 CLI 和裸文件上:

| 已有能力 | 当前入口 | 问题 |
|---|---|---|
| 在线评价记录 | `~/.onething/evals/online/records.jsonl` | 只能 cat/jq,负信号 turn 无法直观翻阅 |
| 自动导出的失败 fixture | `~/.onething/evals/fixtures/auto/*.json` | 无列表、无预览,"每周翻一遍低分记录"没有翻的地方 |
| 离线评估运行 | `bun run evals`(evals/run.mjs) | 改提示词后要切终端、配 env var、读控制台输出 |
| 运行历史与对比 | `evals/results.jsonl` | 前后对比表只在运行结束的 stdout 里闪现一次 |
| 周诊断账本 | `bun run evals:diagnose` → `evals/triage.md` | 生成和阅读都脱离使用现场 |

后果:闭环里"每周诊断"和"改动前后对比"两个人工环节摩擦太大,体系会因为没人看而荒废。
需要一个 UI 侧的入口,把 **review(看数据)** 和 **run(跑评估)** 收进 app 本体。

## 2. 目标与非目标

### 目标

- G1:在 app 内直观翻阅在线评价记录(按负信号/类别/日期过滤),每条可展开看信号、judge 结果、fixture。
- G2:在 app 内一键运行离线评估(选用例、次数、消融段落、provider),实时进度,结束后自动呈现与上一次运行的对比表。
- G3:fixture → case 的提升动作 UI 化:看到一个典型失败,点一下即可生成 `evals/cases/*.yaml` 草稿。
- G4:运行结果与 CLI 完全互通:UI 跑的结果照常追加 `evals/results.jsonl`,CLI 跑的结果照常显示在 UI 历史里。
- G5:模型调用复用 app 已配置的 provider 体系(不再依赖 `EVALS_API_KEY` env var),评估走的请求管线与真实聊天一致。

### 非目标

- 不做多用户/远程评估服务;这是单机开发者工具。
- 不做用例 yaml 的完整可视化编辑器;提升动作生成草稿,精修仍在编辑器里做。
- 不改变 CLI 入口;`bun run evals` 与 UI 并存,数据格式不分叉。
- judge 校准视图放最后可选阶段,不阻塞前三个阶段。

## 3. 关键设计决策

### D1:UI 位置 —— SettingsPage 新增 "Evals" 导航项

复用现有 settings 体系(`src/renderer/components/SettingsPage.vue` 的 `navItems`,
与 Prompts/Memory 同级),内部四个子视图:**Records / Fixtures / Runs / Cases**。
不开新窗口——评估是低频面板型操作,settings 的 Section/Row 组件体系直接够用。

### D2:runner 宿主 —— 核心逻辑上移 runtime 包,主进程执行

现状 `evals/run.mjs` 依赖 bun 直接 import `builder.ts`,Electron 主进程(Node)无法复用。
方案:把 runner 核心提取为 TS 模块,CLI 退化为薄壳:

```
packages/onething-runtime/src/evals/
├── runner.ts        # 新:核心循环(loadCases/runCase/k 次重复/score 聚合/results 追加)
├── case-file.ts     # 新:case yaml 解析 + 生成(从 run.mjs 的 parseCaseFile 移入并补齐序列化)
├── model-call.ts    # 新:单轮非流式调用接口,注入式(见 D3)
├── fixture.ts       # 已有
├── turn-evaluator.ts# 已有
└── judge.ts         # 已有

evals/run.mjs         # 薄壳:parse argv → 调 runner.ts(bun 运行)
src/main/ipc/evals.ts # 新增 handlers:调 runner.ts(Electron 主进程运行)
```

主进程本来就编译整个 runtime 包,`builder.ts` 天然可用——UI 跑评估用的是与线上完全同一份 builder。

### D3:模型调用 —— 注入式客户端,UI 走 app provider 体系

`runner.ts` 不内置 HTTP 客户端,接受一个 `callModel(messages, tools) => {content, toolCalls}` 注入:

- **CLI 注入**:现有 `evals/runner/model-client.mjs` 的 OpenAI-compatible fetch(保留 env var 用法)。
- **主进程注入**:走 `src/main/providers/` 现有 provider 注册表做单轮非流式调用,
  UI 里直接从已配置的 provider/model 下拉选择。
  这同时让评估请求经过与真实聊天相同的消息转换管线,保真度高于裸 fetch。

### D4:仓库路径 —— `settings.evals.repoDir`

cases/results/triage 属于策展物,存在仓库里;打包后的 app 不知道仓库在哪。
新增设置项 `settings.evals.repoDir`(dev 模式默认取 app 源码根)。
未配置时 UI 优雅降级:**Records/Fixtures 永远可用**(读用户数据目录),
Runs/Cases 显示"配置评估仓库目录"的空状态引导。

### D5:运行进度 —— 事件推送,单实例并发

主进程 run 期间通过 `evals:run-progress` 事件推送(沿用 `onTodoPlanChanged` 的
preload listener 模式);同时只允许一个运行实例,重复触发返回 busy。

## 4. Phase 总览

| Phase | 内容 | 依赖 | 预估 |
|---|---|---|---|
| 1 | Review(只读):Records 审阅 + Fixtures 列表 + Runs 历史 | 无 | ~1 天 |
| 2 | Run:runner 核心提取 + provider 注入 + 运行面板 + 进度流 + 对比表 | Phase 1 骨架 | ~1.5 天 |
| 3 | 闭环动作:fixture→case 提升、case 退役、triage 草稿按钮 | Phase 1/2 | ~1 天 |
| 4 | (可选)judge 校准视图:人工标注 vs judge 一致率 | Phase 3 + judge 上线 | 待定 |

价值排序即实施排序:Phase 1 解决"没地方看"(当前最痛),Phase 2 解决"没地方跑",
Phase 3 把设计文档里的每周闭环动作变成点击。

## 5. Phase 详细设计

### Phase 1:Review(只读)

**IPC(按 CLAUDE.md 四步)**:

- `src/shared/ipc/channels.ts`:`EVALS_LIST_RECORDS` / `EVALS_LIST_FIXTURES` / `EVALS_READ_FIXTURE` / `EVALS_LIST_RESULTS`
- `src/shared/ipc/evals.ts`:请求/响应类型(见 §6)
- `src/main/ipc/evals.ts`:handlers。records 读取必须复用 `scripts/diagnose-weekly.mjs`
  的 amend 合并逻辑——把该逻辑同样提取进 `packages/onething-runtime/src/evals/records.ts`
  (`loadMergedRecords()`),脚本与 IPC 共用,避免两处实现漂移
- `apps/electron/src/preload/bridge.ts` + `src/renderer/types/index.ts` + `src/renderer/platform/web.ts`(降级 stub)

**UI**:

```
src/renderer/components/settings/evals/
├── EvalsSettingsTab.vue      # 容器 + 子视图切换(Records/Fixtures/Runs/Cases)
├── EvalsRecordsView.vue      # 记录列表:默认只看负信号;过滤器(类别/日期/provider);
│                             #   行内展示信号徽标(retried/editResent/toolErrors/👎),
│                             #   展开显示 judge 结果与 fixtureRef
├── EvalsFixturesView.vue     # fixture 列表(auto/ + 手动),点击预览 JSON(复用现有代码块组件)
└── EvalsRunsView.vue         # results.jsonl 历史:每次运行一行(时间/均分/用例数/k/disabled),
                              #   选中两行显示逐用例对比表(↑↓→ 与 delta)
```

Pinia store:`src/renderer/stores/evals.ts`(加载态、过滤条件、当前选中 run 对)。
SettingsPage 注册:`navItems` 增加 `{ id: 'evals', label: 'Evals' }` + 懒加载 tab 组件。

### Phase 2:Run

**runner 提取**(D2/D3):`runner.ts` 导出:

```ts
interface RunEvalsOptions {
  repoDir: string
  caseIds?: string[]          // 空 = 全部 active
  runs: number                // k,默认 5
  disabledSections?: string[]
  includeSentinel?: boolean
  callModel: EvalModelCaller  // 注入
  onProgress?: (e: EvalRunProgressEvent) => void
  signal?: AbortSignal        // UI 取消
}
runEvals(options): Promise<EvalRunResultEntry>   // 同时追加 results.jsonl
```

`evals/run.mjs` 改为解析 argv → 组装 options(callModel 用现有 model-client)→ 调 `runEvals`。
迁移后删除 run.mjs 内的重复实现,保持行为等价(对照现 results.jsonl 字段)。

**IPC**:`EVALS_RUN_START` / `EVALS_RUN_CANCEL` + 推送事件 `EVALS_RUN_PROGRESS`。
progress 事件粒度:case 开始 / 单次 run 结束(pass/fail + reason)/ case 得分 / 全部完成。

**UI**:`EvalsRunsView.vue` 顶部增加运行面板:

- 用例多选(默认全部)、k 次数、消融段落多选(builder 的 section 名列表:agent/voice/…/plugins)、
  provider+model 下拉(读现有 provider 配置)
- 运行中:每 case 一行实时更新 `passes/k`,总进度条,取消按钮
- 结束:自动选中"本次 vs 上一次"渲染对比表(复用 Phase 1 的对比组件)

**约束**:单实例;运行期间禁止再次触发;app 退出时 abort。

### Phase 3:闭环动作

- **fixture → case 提升**:`EvalsFixturesView` 每条 fixture 增加"提升为用例"按钮 →
  弹出表单(id/description/expect 类型三选:firstToolCall/contains/notContains + 值)→
  `EVALS_PROMOTE_FIXTURE`:拷贝 fixture 到 `<repoDir>/evals/fixtures/`,
  用 `case-file.ts` 序列化生成 `<repoDir>/evals/cases/<id>.yaml`。生成后提示
  "跑一次确认它在当前提示词下失败"(一键触发单 case run)。
- **case 退役**:`EvalsRunsView` 对比表中,近 3 次运行均 1.0 的 case 标记 🏁,
  提供"移入 sentinel"按钮(`EVALS_RETIRE_CASE`:mv 到 `evals/cases/sentinel/`)。
- **triage 草稿**:Records 视图顶部"生成本周诊断草稿"按钮(`EVALS_GENERATE_TRIAGE`,
  复用 `records.ts` + 现 diagnose 逻辑,同样提取共用),生成后在 UI 内预览并提示已写入
  `evals/triage.md`。
- **记录 → 会话跳转**:record 行提供"打开会话"(已有 session 跳转机制),
  方便复盘当时对话全文。

### Phase 4(可选):judge 校准视图

Records 展开面板中增加人工标注控件(同意/不同意 judge + 修正类别),
标注写入 `~/.onething/evals/online/labels.jsonl`;
视图顶部显示 judge-人工一致率与分歧列表。达到设计文档的"一致率 ≥85% 才可信"检查线。

## 6. IPC 数据契约(`src/shared/ipc/evals.ts` 增量)

```ts
// Phase 1
interface EvalsListRecordsRequest { negativeOnly?: boolean; category?: string; sinceTs?: string; limit?: number }
interface EvalsListRecordsResponse { success: boolean; records?: TurnEvalRecordView[]; error?: string }
interface EvalsListFixturesResponse { success: boolean; fixtures?: Array<{ path: string; capturedAt: string; provider: string; sessionId: string; userMessagePreview: string }>; error?: string }
interface EvalsListResultsResponse { success: boolean; entries?: EvalRunResultEntry[]; error?: string }

// Phase 2
interface EvalsRunStartRequest { caseIds?: string[]; runs: number; disabledSections?: string[]; providerId: string; model: string }
interface EvalsRunProgressEvent { type: 'case-start' | 'attempt-done' | 'case-done' | 'run-done' | 'error'; caseId?: string; attempt?: number; pass?: boolean; reason?: string; score?: number; entry?: EvalRunResultEntry }

// Phase 3
interface EvalsPromoteFixtureRequest { fixturePath: string; caseId: string; description: string; expect: { firstToolCall?: string; contains?: string; notContains?: string } }
```

`TurnEvalRecordView` = `TurnEvalRecord`(amend 合并后)+ `hasFixture: boolean`。

## 7. 风险与开放问题

- **主进程 fs 扫描量**:records.jsonl 单文件追加,长期会变大;Phase 1 先做尾部 N 条 +
  日期过滤读取,超过阈值(如 5MB)时提示归档。不建索引(遵守"主进程不进数据库"原则)。
- **provider 非流式单轮调用**:现有 provider 栈以流式为主,Phase 2 需确认各 provider
  的非流式路径;不可用时降级为"收流拼接"。
- **web 构建**:evals UI 依赖主进程 fs 与 provider,apps/web 下整个 tab 显示不可用状态
  (platformApi capabilities 增加 `evals: boolean`)。
- **case yaml 序列化**:现 parser 是手写 mini-YAML,生成侧必须与其解析能力严格对齐
  (只用它支持的扁平结构),`case-file.ts` 加 round-trip 测试。
```
