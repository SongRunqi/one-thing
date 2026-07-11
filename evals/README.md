# 提示词评估体系使用手册

体系设计:`docs/design/prompt-evaluation.md` · UI 设计:`docs/design/evals-ui.md` · 实现进度:`docs/design/evals-ui-progress.md`

这套系统回答两个问题:**真实使用中提示词在哪里翻车?**(在线采集)和**改动提示词后到底变好没有?**(离线评估)。

```
真实使用 → 每轮自动记信号 → 负信号自动存 fixture ─┐
              ↑ 点 👎 手动标记失败现场 ──────────────┤
                                                    ↓
        每周看 Records/跑 triage → 典型失败提升为 case
                                                    ↓
        改提示词 → 前后各跑一次离线评估 → 对比表验证 → 上线后看在线趋势
```

---

## 一、快速开始

### 前置条件

| 环境 | repoDir(cases/results 所在仓库) | 模型调用 |
|---|---|---|
| dev 模式 | 自动 = 仓库根目录,零配置 | CLI:`EVALS_API_KEY` 环境变量;UI:app 里已配置的 provider |
| 打包版 | 需在设置里配 `evals.repoDir` | 同上 |

### 30 秒上手

```bash
# 跑全部用例,每条重复 3 次(默认 deepseek-v4-pro @ api.deepseek.com)
DEEPSEEK_API_KEY=sk-xxx bun run evals

# 改一段提示词之后再跑一次,结尾自动打印和上一次的对比表:
#   known-projects-switch: 0.33 → 1.00 ↑+0.67
bun run evals
```

或打开 **Settings → Evals → Runs**,选 provider/model,点 Start Run。

---

## 二、CLI 参考

```bash
bun run evals                                    # 全部 active 用例,k=3
bun run evals -- --case <id>                     # 只跑一条用例
bun run evals -- --runs 5                        # 每条重复 5 次(上限 10)
bun run evals -- --disable known-projects        # 消融:禁用某段提示词后跑
bun run evals -- --disable skills --disable os   # 可多个
bun run evals -- --full                          # 连 sentinel(退役)用例一起跑

bun run evals:diagnose                           # 生成周诊断草稿 → evals/triage.md
bun run evals:diagnose -- --weeks 2              # 统计最近 2 周
```

环境变量:`EVALS_API_KEY`(必需,或 `DEEPSEEK_API_KEY` / `OPENAI_API_KEY`)、`EVALS_BASE_URL`(默认 `https://api.deepseek.com`,任何 OpenAI-compatible 端点)、`EVALS_MODEL`(默认 `deepseek-v4-pro`)。UI 侧 Runs 表单默认选中 deepseek provider + deepseek-v4-pro。

**可消融的段落名**(必须精确匹配,来自 `builder.ts` 的 section 注册表):
`agent` `voice` `runtime-context` `workdir` `active-project` `known-projects` `context-variables` `skills` `os` `agents-md` `plugins`

---

## 三、每个功能内部做了什么

### 1. 在线信号采集(全自动,无感)

**做什么**:每轮对话结束后记录这一轮的质量信号。

**内部**:`src/main/engine/triggers/turn-evaluation.ts` 作为 post-chat trigger(priority 1000,最后执行)在每轮流结束后触发 → 从本轮消息里提取信号:
- `toolErrors`:本轮 assistant 消息中 `status === 'failed'` 的工具调用数
- `streamAborted`:最后一条 assistant 消息无内容(流异常中断)
- `retried` / `editResent`:发生在 turn 结束**之后**,由 `src/main/ipc/handlers.ts` 拦截 `command:retry-message` / `command:edit-and-resend` 时按 (sessionId, turnId) 追加 amend 记录,读取时合并回原记录

每条记录写入 `~/.onething/evals/online/records.jsonl`(一行一 JSON),带 promptVersion(提示词骨架的 sha256 前 8 位)、provider、model。**带负信号的 turn 自动把当时的完整上下文导出为 fixture**(工作目录、known projects、skills、工具列表、用户消息)存到 `~/.onething/evals/fixtures/auto/`。

核心代码:`packages/onething-runtime/src/evals/turn-evaluator.ts`(记录)、`fixture.ts`(导出)、`records.ts`(读取+amend 合并,CLI 和 UI 共用同一份实现)。

### 2. 👎 按钮(手动标记)

**做什么**:消息操作栏点 👎 = 一键保存失败现场。

**内部**:renderer 把 `sessionId` / `messageId`(作为 turnId)/ 消息内容通过 `platformApi.recordEvalsDownvote` 发到主进程 → 主进程用 sessionId 反查真实 session,取出 workingDirectory、lastProvider、lastModel、该目录下的 skills 列表 → 组装成可重放的 fixture 落盘,并写一条 `explicit: "down"` 的记录。**上下文在服务端解析,不信任 renderer 传参**——这保证 fixture 真的能重现当时的提示词。

### 3. 离线评估运行(CLI / UI 共用一个核心)

**做什么**:固定用例 × 真实模型 × 重复 k 次,输出每条用例的通过率。

**内部**:核心循环在 `packages/onething-runtime/src/evals/runner.ts`,CLI(`evals/run.mjs`)和主进程 IPC 都调用它。每次运行:

1. **加载用例**:扫描 `evals/cases/*.yaml`(mini-YAML parser 在 `case-file.ts`)
2. **重建上下文**:读用例指向的 fixture,喂给**线上同一份** `buildOnethingPrompt()`(`packages/onething-runtime/src/prompts/builder.ts`)——所以你改 builder 里任何一段话,评估结果立刻反映;`--disable` 参数直接传给 builder 的 `disabledSections`
3. **调模型**:runner 本身不含 HTTP 客户端,由调用方注入 `callModel`——CLI 注入 OpenAI-compatible fetch(env var 配置),UI 注入 `evals-provider-adapter.ts`(读 app 的 provider apiKey/baseUrl)。温度固定 0
4. **判定**:`evaluator.ts` 硬判定——`firstToolCall`(第一个工具调用名)、`contains` / `notContains`(输出含/不含某文本)
5. **重复 k 次**:模型非确定,单次结果无意义;得分 = 通过次数/k
6. **落盘**:追加一条到 `evals/results.jsonl`,带真实 promptVersion hash、provider、model。**被取消的运行不落盘**(避免半次运行污染基线);无 API key 时在任何请求前退出

### 4. 消融(`--disable <section>`)

**做什么**:去掉一段提示词跑评估,分数不降 = 那段话是废话。

**内部**:builder 的 `buildRuntimeSystemPrompt` 把每个 developer 段落注册为 `[名字, 内容]` 对,`disabledSections` 是个 Set 过滤。这是回答"这段提示词值不值得留"的终极手段——比任何主观判断都硬。

### 5. Settings → Evals 四个视图

| 视图 | 做什么 | 内部 |
|---|---|---|
| **Records** | 翻在线记录,默认只显示负信号 turn;可按类别/日期过滤;展开看信号徽标、judge 结果;顶部可生成 triage 草稿 | IPC `EVALS_LIST_RECORDS` → `records.ts` 的 amend 合并 → 分页返回;消息预览按页从 fixture 读取(成本有界) |
| **Fixtures** | 列出自动导出 + 👎 的失败现场,预览 JSON;**"提升为用例"**:填 id + 选判定方式 → 生成 `evals/cases/<id>.yaml` | fixture 拷入 `evals/fixtures/`,`case-file.ts` 的 `generateCaseYaml` 生成(与 parser 严格 round-trip 对齐,多行消息用块标量) |
| **Runs** | 运行面板(provider/model/k/消融段落/用例多选)+ 实时进度 + 历史列表 + 任选两次运行的逐用例对比表(↑↓→ delta) | `EVALS_RUN_START` 预检凭据(OAuth/无 key 快速失败)→ 后台跑 runner → `EVALS_RUN_PROGRESS` 事件推送;单实例锁,取消走 AbortSignal |
| **Cases** | 用例列表 + 详情;连续 3 次满分的标 🏁,一键**退役**到 sentinel 组 | `EVALS_RETIRE_CASE` = mv 到 `evals/cases/sentinel/`;sentinel 只在 `--full` 时跑,不计主分数——主评估集始终由"还会失败的用例"构成 |

### 6. 周诊断(triage)

**做什么**:把一段时间的负信号记录聚类成账本草稿——哪类失败多、归因到提示词哪一段。

**内部**:`records.ts` 的 `generateTriageReport`:合并 amend → 过滤负信号 → 按 judge 类别(无 judge 时按信号)聚类 → 按 `CATEGORY_TO_SECTION` 映射到 builder 段落(如 `missed-directory-switch` → Known Projects 段)→ 生成 Markdown 表格追加到 `evals/triage.md`。CLI(`bun run evals:diagnose`)和 UI 按钮走同一份代码。

### 7. LLM judge(已有基础设施,未接线)

`judge.ts` 定义了 8 个失败类别、judge prompt、鲁棒的 JSON 输出解析。设计要求先用人工标注校准(一致率 ≥85% 才可信),故尚未接入自动流程——records 里的 `judge` 字段目前为 null。

---

## 四、数据文件一览

| 路径 | 内容 | 谁写 |
|---|---|---|
| `~/.onething/evals/online/records.jsonl` | 每轮一条评价记录(+amend 行) | turn trigger / retry 拦截 / 👎 |
| `~/.onething/evals/fixtures/auto/*.json` | 自动导出的失败现场 | 负信号 / 👎 |
| `evals/cases/*.yaml` | 评估用例(策展物,进 git) | 手写 / UI 提升 |
| `evals/cases/sentinel/*.yaml` | 退役用例(回归哨兵) | UI 退役 |
| `evals/fixtures/*.json` | 用例引用的 fixture(进 git) | 手写 / UI 提升时拷入 |
| `evals/results.jsonl` | 每次离线运行一条结果 | runner(CLI 和 UI 共写,格式互通) |
| `evals/triage.md` | 周诊断账本 | diagnose 脚本 / UI 按钮 |
| `evals/experiments.md` | 提示词改动实验日志 | 你手写(假设→diff→前后分数) |

## 五、用例 YAML 格式

```yaml
id: known-projects-switch
description: >
  用户在别的目录问 transreader 的事,应先切工作目录
fixture: known-projects-transreader.json   # 相对 evals/fixtures/
userMessage: How do I configure the transreader project?   # 省略则用 fixture 内的
expect:
  firstToolCall: variable        # 三选一:期望的第一个工具调用名
  # contains: "some text"        # 或:输出必须包含
  # notContains: "```"           # 或:输出不得包含
  notes: >
    2026-07-03 真实翻车。注释性说明,不参与判定。
```

注意:这是手写 mini-YAML parser(`case-file.ts`),只支持扁平结构 + `>`/`|` 块标量,不要写嵌套对象/数组。

## 六、日常节奏建议

| 频率 | 动作 |
|---|---|
| 每轮对话 | 什么都不用做(自动采集);翻车就点 👎 |
| 每周 ~10 分钟 | Records 翻负信号 / `bun run evals:diagnose`;典型失败在 Fixtures 里提升为用例 |
| 每次改提示词 | 改前改后各跑一次 `bun run evals`,看对比表;结论记进 `experiments.md` |
| 每月 | Cases 视图退役饱和用例(🏁) |

**判读提醒**:k=3~5 下 ±1 次通过是噪声;可信的结论是"稳定失败(0/5)→ 稳定通过(5/5)"级别的变化,微小均分差不作数。
