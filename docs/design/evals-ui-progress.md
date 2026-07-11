# Evals UI 实现进度报告

> 日期：2026-07-08 | 设计文档：`docs/design/evals-ui.md`
> Phase 1-3 已完成 + review 修复轮已落地（见 §七），Phase 4（可选）未实施。

---

## 一、总体完成情况

| Phase | 内容 | 状态 |
| ------- | ------ | ------ |
| 1 | 只读 Review（Records / Fixtures / Runs / Cases） | ✅ 完成 |
| 2 | Run 面板 + runner 核心提取 + provider 注入 | ✅ 完成 |
| 3 | 闭环动作（promote / retire / triage / session 跳转） | ✅ 完成 |
| 4 | judge 校准视图 | ❌ 未实施（标记为可选） |

---

## 二、新增文件清单

### 2.1 Runtime Package（共享核心）

| 文件 | 说明 |
| ------ | ------ |
| `packages/onething-runtime/src/evals/records.ts` | 从 `diagnose-weekly.mjs` 提取的 records 管理模块：`loadMergedRecords()`(amend 合并)、`recordHasNegative()`、`generateTriageReport()` 等 |
| `packages/onething-runtime/src/evals/case-file.ts` | Case YAML 解析 + 生成器（`parseCaseYaml` / `generateCaseYaml`），含 round-trip 测试 |
| `packages/onething-runtime/src/evals/evaluator.ts` | 从 `evals/runner/evaluator.mjs` 转换的 TypeScript 评估器（`evaluate` / `evaluateHard`） |
| `packages/onething-runtime/src/evals/model-call.ts` | 可注入的模型调用接口定义（`EvalModelCaller` type） |
| `packages/onething-runtime/src/evals/runner.ts` | 核心 runner 循环（从 `evals/run.mjs` 提取）：`runEvals(options)` — 接受注入式 `callModel` |
| `packages/onething-runtime/src/evals/__tests__/case-file.test.ts` | case-file 的 round-trip 测试（6 个测试，全部通过） |

### 2.2 主进程

| 文件 | 说明 |
|------|------|
| `src/main/ipc/evals-provider-adapter.ts` | Provider 适配器：`createEvalsModelCaller(providerId, model)` 从 settings 读 API key/base URL，构建 `EvalModelCaller` 注入 runner |

### 2.3 渲染进程（UI）

| 文件 | 说明 |
| ------ | ------ |
| `src/renderer/stores/evals.ts` | Pinia store：管理 records/fixtures/results/cases 状态，运行进度，对比逻辑 |
| `src/renderer/components/settings/evals/EvalsSettingsTab.vue` | 容器组件：4 个子视图切换（Records / Fixtures / Runs / Cases） |
| `src/renderer/components/settings/evals/EvalsRecordsView.vue` | Records 视图：过滤器（负信号/类别/日期/provider）、展开详情（signal 徽标、judge、fixtureRef）、triage 生成、session 跳转 |
| `src/renderer/components/settings/evals/EvalsFixturesView.vue` | Fixtures 视图：列表 + JSON 预览、promote-to-case 对话框（id/description/expect 类型/值） |
| `src/renderer/components/settings/evals/EvalsRunsView.vue` | Runs 视图：运行面板（provider/model/k-runs/消融段落/用例选择）、进度条+per-case 进度、运行历史列表、双选对比表（↑↓→ delta）、正确的退役判断（3 次连续 1.0） |
| `src/renderer/components/settings/evals/EvalsCasesView.vue` | Cases 视图：用例列表 + 详情、退役到 sentinel |

---

## 三、关键修改的文件

| 文件 | 改动内容 |
| ------ | ---------- |
| `src/shared/ipc/channels.ts` | 新增 13 个 evals IPC 通道常量（`EVALS_LIST_RECORDS` 等） |
| `src/shared/ipc/evals.ts` | 完整重写：定义所有 request/response 类型（Phase 1-3） |
| `src/shared/ipc/index.ts` | 新增所有 evals 类型的 re-export |
| `src/shared/ipc/settings.ts` | 新增 `EvalsSettings { repoDir?: string }` + AppSettings.evals 字段 |
| `src/main/ipc/evals.ts` | 完整重写：实现所有 IPC handler（listRecords/listFixtures/readFixture/listResults/listCases + runStart/runCancel + promoteFixture/retireCase/generateTriage）。**`runEvalsInBackground` 现在调用 runtime 的 `runEvals()` 而非重复实现** |
| `src/main/ipc/handlers.ts` | 已有 `registerEvalsHandlers()` 调用（未改动） |
| `apps/electron/src/preload/bridge.ts` | 新增 15+ 个 evals API 方法（`evalsListRecords` 等） |
| `src/renderer/types/index.ts` | `ElectronAPI` 新增所有 evals 方法签名 |
| `src/renderer/platform/web.ts` | 新增 evals 方法的 web stub（返回 `success: false`） |
| `scripts/diagnose-weekly.mjs` | 改用 `@onething/runtime` 导入共享的 `records.ts` 模块（不再有独立 amend 合并逻辑） |
| `evals/run.mjs` | 退化为薄壳 CLI：解析 argv → 组装 model-caller → 调 `runEvals()` |
| `packages/onething-runtime/src/evals/index.ts` | 新增 evaluator / records / case-file / model-call / runner 的 export |
| `src/renderer/components/SettingsPage.vue` | navItems 新增 `{ id: 'evals', label: 'Evals', icon: Sparkles }` + 模板新增 `<EvalsSettingsTab>` |

---

## 四、架构关键决策落实

### D1：UI 位置

- ✅ SettingsPage.vue 的 navItems 新增 Evals 项，组件在 `src/renderer/components/settings/evals/`
- ✅ 4 个子视图切换（Records / Fixtures / Runs / Cases）

### D2：Runner 宿主

- ✅ 核心 runner 提取为 `packages/onething-runtime/src/evals/runner.ts`
- ✅ CLI `evals/run.mjs` 退化为薄壳（~180 行）
- ✅ 主进程 IPC handler 调用 `runEvals()`（不重复实现 runner 逻辑）

### D3：模型调用注入式

- ✅ `runner.ts` 接受注入式 `EvalModelCaller`（不内置 HTTP 客户端）
- ✅ CLI 通过 env var + fetch 注入
- ✅ UI 通过 `evals-provider-adapter.ts` 注入，读取 app 已配置的 provider 凭据（apikey/baseUrl 来自 settings）
- ⚠️ model call 暂用直接 fetch（non stream）。设计文档 §7 标注"需确认各 provider 的非流式路径"，必要时降级为收流拼接

### D4：仓库路径 `settings.evals.repoDir`

- ✅ 新增 `EvalsSettings { repoDir }` 类型
- ✅ dev 模式默认当前目录；打包后需配置
- ✅ Records / Fixtures 永远可用（读用户数据目录）
- ✅ Runs / Cases 显示空状态引导

### D5：运行进度

- ✅ 通过 `EVALS_RUN_PROGRESS` 推送事件
- ✅ preload `onEvalsRunProgress` listener
- ✅ 单实例（`activeRunAbort` 检查）

---

## 五、已知限制 & 待办

1. **provider 非流式调用**：当前 model call 用 bare fetch（OpenAI-compatible），未走 provider 栈的 `prepareCallOptions` + AI SDK。对 OpenAI-compatible provider 工作正常，但对 OAuth provider（Gemini、Claude）可能失败。见设计文档 §7 风险。
2. **Phase 4 judge 校准视图**：标记为可选，未实施。需 Phase 3 judge 上线后再做。
3. **消融段落选择**：Run form 硬编码了 7 个可禁用 section（agent/voice/skills/tools/knownProjects/platform/plugins），理想情况下应动态从 builder.ts 读取。
4. **主进程 records.jsonl 文件变大**：设计文档建议超过 5MB 时提示归档，当前未实现。
5. **Web 构建**：evals stubs 返回统一错误消息，但未在 `PlatformCapabilities` 增加 `evals: false` 标记。

---

## 六、测试

- `packages/onething-runtime/src/evals/__tests__/case-file.test.ts`：7 个 round-trip 测试（含多行 userMessage），全部通过
- 全项目 typecheck：通过（仅 1 个预存错误在 `packages/core/engine/core-stream-engine.ts`，与本改动无关）
- 全量 vitest：2980 passed / 1 skipped
- 端到端冒烟（本地 mock OpenAI server）：真实 builder → 注入 caller → evaluator → results 条目
  归因字段验证通过（promptVersion=真实 hash、provider/model 正确）；`--disable known-projects`
  消融验证 mock 侧收到的系统提示词确实无 Known Projects 段

---

## 七、Review 修复轮（2026-07-08）

初版实现 review 后修复的问题：

| # | 问题 | 修复 |
|---|------|------|
| 1 | `getRepoDir()` dev/packaged 判断写反（`process.defaultApp` dev 下为 true），dev 返回 null、打包后返回 cwd | 改用 `app.isPackaged`：dev → cwd，打包 → 需显式配置 |
| 2 | CLI 提示 SKIP 后仍发真实请求（401 计为 FAIL 并污染 results.jsonl） | 无 key 时在 runEvals 前 `process.exit(1)` |
| 3 | results 条目硬编码 `provider:"injected"`、`promptVersion:"active"`，归因失效 | runner 接受 `providerLabel`/`modelLabel`，promptVersion 用 `getPromptVersion()` 真实 hash；条目新增 `model` 字段 |
| 4 | 主进程 IPC 保留了 parseCaseFile/generateCaseYaml 私有副本且已漂移（不去引号） | 删除副本，统一走 `@onething/runtime` 的 case-file.ts（"no duplicate implementations" 至此才成立） |
| 5 | `generateCaseYaml` 对多行 userMessage 生成非法 YAML（quoted 标量内裸换行） | 多行改用块标量 `userMessage: >`；新增 round-trip 测试 |
| 6 | 取消竞态：cancel 立即置空锁允许并发 run；被取消的半次运行进 results 历史 | cancel 只 abort、由 finally 清锁；runner aborted 时不落盘（条目带 `aborted` 标记仅用于 UI 展示）；results 写入改为 appendFileSync |
| 7 | runtime `parseCaseFile` 在 ESM 里用 `require`（潜在 ReferenceError） | 顶部 `import fs` |
| 8 | Records 视图 `userMessagePreview` 恒为空 | 从 fixtureRef 读 fixture 的 userMessage（仅当前分页，成本有界） |
| 9 | Run 表单列出 OAuth provider（必然失败）；无预检 | 下拉过滤 `requiresOAuth`；`EVALS_RUN_START` 增加 `resolveEvalsCredentials` 预检，失败快速返回 |
| 10 | 消融 checkbox 的 key 与 builder section 名不匹配（`knownProjects`/`platform`/`tools` 均无效） | 改为 builder 真实 section 名全集（11 个：agent/voice/runtime-context/workdir/active-project/known-projects/context-variables/skills/os/agents-md/plugins） |
| 11 | Evals 视图 21 处硬编码 hex 颜色 + 9 处从 fg 派生背景/边框（违反主题守卫测试） | 全部改为 `--ui-status-{danger,success,info,warning}-{fg,bg,border}` 语义 token |
| 12 | 新 UI 引入的 3 个测试失败（SettingsPage 搜索断言、web.test ElectronAPI 解析器不兼容 tab 缩进、ui-token 守卫） | 分别更新断言、解析器改为匹配单层缩进（tab 或 2 空格）、颜色 token 化 |

另：`evals/results.jsonl` 中 9 条无 key/stub 冒烟产生的全 0 分垃圾条目已清空（正是 #2/#3 要防止的污染）。

### 遗留（保持原状）

- provider 非流式调用仍为 OpenAI-compatible bare fetch（OAuth provider 由预检明确拒绝，不再静默失败）
- Phase 4 judge 校准视图未实施（设计标记为可选）
- records.jsonl 超 5MB 归档提示未实现
