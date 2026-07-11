# 失败现场快照:提示词分段版本化 + 请求视图捕获设计方案

状态:S1-S4 已实施(2026-07-09),review 修复轮已落地(2026-07-10,见文末附录)。
日期:2026-07-08
前置阅读:`docs/design/prompt-evaluation.md`(评估体系总设计)、`docs/design/evals-ui.md`(UI,Phase 1-3 已落地)、
`docs/design/session-storage-jsonl.md`(会话 jsonl 存储)、`docs/design/prompt-evaluation.md` 中 fixture 定义

---

## 1. 背景与问题

### 1.1 现状

评估体系已落地:在线信号采集、负信号自动导出 fixture、👎 标记、离线 runner、Evals UI。
fixture 保存的是 **builder 的输入**(workingDirectory / knownProjects / skills / toolNames / platform / userMessage),
重放时用当前代码的 `buildOnethingPrompt()` 重建提示词。

### 1.2 三个断点

**断点一:重建 ≠ 当时。** 回看两周前的失败时,fixture 重建出的是**今天的**提示词,不是模型当时看到的那份。
promptVersion hash 能告知"版本变过",但读旧版原文只能翻 git——归因链在"这段提示词当时是怎么写的"处断裂。
且现有 promptVersion 生产路径走 `computeStaticPromptVersion()`(仅 hash 4 个常量:默认系统提示词/Tool
Guidelines/Workspace Rules/Known Projects 指令),`initPromptVersion()` 只在测试中调用——改
`voice-speak-mode.md`、`os-*.md` 或 builder 拼装结构均不改变 hash,归因有盲区。

**断点二:存储视图 ≠ 发送视图。** 本仓库在会话存储与模型请求之间已有三层变换:
F4 会话脱水(工具结果/steps 瘦身,14.6MB→567KB)、F5 收口重建 + 能力感知转换(图片外置、按 provider
转换消息格式)、context compaction(长会话压成 summary + 基线)。`sessions/<id>/messages.jsonl`
是原始档案,模型实际收到的 history 是变换后的**请求视图**。若 compaction 压丢关键信息导致翻车,
查原始 jsonl 会得出"上下文明明有"的错误结论——凶手(压缩后的 summary)不在那份文件里。
此外原始 jsonl 可变(edit-and-resend/retry/删除/分支会改写)、可删(会话删除),不适合作为证据载体。

**断点三:多轮不可重放。** fixture 只含触发轮的单条 userMessage,依赖前几轮铺垫的失败
(评估体系最有价值的一类)只能靠 sessionRef 人工复盘,无法进入离线回归。

### 1.3 关键工程事实(已验证,决定方案形态)

`runAgentLoopPostResponseHooks`(`src/main/engine/stream/agent-loop-executor.ts:151` 附近)已接收:

- `prepared.systemPrompt`:当轮**实际发送**的完整 system prompt(string),源自
  `packages/onething-runtime/src/agent-loop/stream-runtime.ts:577` 的 `buildPromptForHistory()`
- `prepared.runtime.messages`:`agentMessagesFromHistory()` 能力感知转换后的最终请求消息数组(`AgentMessage[]`)
- `historyMessages`:转换前的 history

即:**字节级的"当时现场"已流经 post-response 管线,只差透传到 TriggerContext 并落盘**。
无需重建,无需在请求路径新增构建。唯一缺口是 builder 拼装后丢弃了段名,需要暴露命名 sections。

## 2. 目标与非目标

### 目标

- G1:每轮在线记录带**分段 hash**(`sectionHashes`),可聚合回答"同类失败是否集中在某段提示词的某个版本下"。
- G2:promptVersion 重定义为全部段 hash 的联合 hash,消除现有 4 常量盲区;向后兼容旧记录。
- G3:负信号/👎 时落盘**渲染后分段提示词全文**——失败发生时模型看到的每一段原文可直接阅读。
- G4:负信号/👎 时落盘**请求视图上下文**(变换后的完整消息数组),jsonl 格式,复用 core 的 jsonl codec。
- G5:UI 可查看快照:按段折叠的提示词(归因段高亮)、逐条消息的上下文。
- G6:runner 支持灌入上下文快照做**多轮重放**,case 格式相应扩展。

### 非目标

- 不改变 session 本身的存储(messages.jsonl 保持原样,角色 = 人工回溯档案,经 sessionRef 跳转)。
- 不对正常轮次存全文快照(仅 hash);不做快照的远程上传/同步。
- 不在快照中内联图片二进制(沿用外置引用)。
- 不做快照浏览的全文搜索(需要时属 apps/server 索引职责)。

## 3. 关键设计决策

### D1:捕获,不重建

快照数据取自 `prepared`(§1.3),即实际发出的请求本身。重建方案(trigger 里再 build 一次)被否决:
plugins/memory 段动态、Current date 等因素使重建结果与实际请求存在偏差,而归因证据必须字节级可信。

### D2:双层存储——每轮轻记录,负信号全量

| 层 | 内容 | 频率 | 单条成本 |
|---|---|---|---|
| 记录层 | `sectionHashes` + 现有 sessionRef 引用 | 每轮 | ~200 字节 |
| 快照层 | 分段提示词全文 + 请求视图 jsonl | 仅负信号/👎 | 几 KB ~ 几百 KB |

分段 hash 每轮都有,才能做"失败 × 段版本"的聚合归因;全文只在需要证据时落盘。

### D3:快照文件用 jsonl 格式,复用 core codec

上下文快照 `.context.jsonl` 一行一条消息,复用
`packages/core/session/storage/jsonl/codec.ts`(`encodeJsonlMessageLine` / `decodeJsonlLine`,含
header 行与逐行容错),与会话存储同构:追加式写、可流式读、坏行跳过。
**利用的是 jsonl 的格式与工具,不引用 session 的原文件**(理由见 §1.2 断点二)。

### D4:builder 暴露命名 sections

`buildRuntimeSystemPrompt` 内部已是 `[name, content]` 对(消融改造时引入),但 `compact()` 后丢名。
改造:`CoreBuildPromptResult` 与 `buildOnethingSystemPrompt` 返回值增加可选
`sections: Array<{ name: string; content: string }>`(system 块记为 `system` 段),
沿 `buildPromptForHistory` → `prepared` 透传。纯附加字段,不影响既有消费方。

### D5:promptVersion := hash(所有段 hash 按名排序拼接)

- 段 hash = sha256(段内容).slice(0, 8)。
- 会话级 promptVersion 由当轮实际 sections 计算——**同一时刻不同会话的 promptVersion 可能不同**
  (skills/AGENTS.md 因目录而异),这是特性不是缺陷:归因粒度从"代码版本"细化到"该会话实际提示词版本"。
- 另保留**骨架版本**(`skeletonVersion`,minimal 场景重算,app 启动时初始化一次)用于跨会话粗归组;
  旧记录的 `9d555ca3`(静态 4 常量 hash)自然过渡为历史版本号,不迁移。

### D6:多轮重放向后兼容

case 增加可选 `context: <file>.context.jsonl`;runner 读到则灌入完整历史(fixture 的 userMessage
成为最后一条),读不到则维持现状单轮。旧 case 零改动。

## 4. Phase 总览

| Phase | 内容 | 依赖 | 预估 |
|---|---|---|---|
| S1 | builder 暴露 sections;sectionHashes 进记录;promptVersion 重定义 | 无 | ~半天 |
| S2 | 捕获管线:prepared → TriggerContext → 负信号落三件套快照;👎 同路径 | S1 | ~1 天 |
| S3 | UI:Records/Fixtures 快照查看(按段折叠/归因高亮/上下文逐条);triage 聚合"失败 × 段版本" | S2 | ~1 天 |
| S4 | 多轮重放:case 格式扩展 + runner 灌历史 + UI 提升动作带上下文 | S2 | ~1 天 |

S1 独立可先行(立即修掉 promptVersion 盲区);S3/S4 可并行。

## 5. Phase 详细设计

### S1:分段版本化

**builder**(`packages/onething-runtime/src/prompts/builder.ts` + `packages/core/engine/system-prompt.ts`):

- `buildRuntimeSystemPrompt` 返回值增加 `sections`(含 `system` 段;plugins 各片段合并为一个 `plugins` 段,
  与消融粒度一致);`CoreBuildPromptResult.sections?` 类型补充。
- 新增 `packages/onething-runtime/src/evals/section-hash.ts`:
  `hashSections(sections) → { sectionHashes: Record<string, string>, promptVersion: string }`。

**记录**(`packages/onething-runtime/src/evals/turn-evaluator.ts`):

- `TurnEvalRecord` 增加 `sectionHashes?: Record<string, string>`;`recordTurn` 接收并写入。
- promptVersion 改传当轮计算值;`getPromptVersion()` 保留为骨架版本(app 启动时
  `initPromptVersion(minimal 场景输出)` 接线,修掉"只在测试调用"的问题)。

**Phase 0 快照测试同步**:golden 测试增加 sections 断言,防止段名/段界漂移
(段名是消融、hash、归因三方共享的契约)。

### S2:捕获管线与三件套落盘

**透传链**(全部为可选字段,零破坏):

```
stream-runtime.ts  prepare 返回值增加 sections(来自 buildPromptForHistory)
        ↓
agent-loop-executor.ts  runAgentLoopPostResponseHooks 已持有 prepared + historyMessages
        ↓
packages/core/engine/agent-loop-executor.ts  runAgentLoopPostResponseHooksWithAdapters
        组装 trigger context 时附加:
        promptCapture?: { systemPrompt, sections, requestMessages }
        ↓
packages/core/engine/triggers.ts  CoreTriggerContext 增加 promptCapture? 字段
        ↓
src/main/engine/triggers/turn-evaluation.ts  取用
```

**落盘**(`turn-evaluator.ts` 负信号分支 + `recordExplicitDown`):

```
~/.onething/evals/fixtures/auto/<date>-<session>-<turn>.json           # 现有 fixture
~/.onething/evals/fixtures/auto/<date>-<session>-<turn>.prompt.json    # 分段提示词全文
~/.onething/evals/fixtures/auto/<date>-<session>-<turn>.context.jsonl  # 请求视图
```

fixture 增加 `promptSnapshotRef` / `contextSnapshotRef` 字段。写入失败不阻断聊天流
(沿用 trigger 的静默容错)。

**👎 路径注意**:downvote 发生在 turn 结束后,promptCapture 已不在内存。方案:turn 结束时把
promptCapture 暂存于 session 级 LRU(仅最近 N=5 轮,内存),👎 时按 turnId 取;取不到则降级为
仅 fixture(现状),记录 `explicit:"down"` 照常。

### S3:UI 与聚合归因

- **Records 展开面板**:有快照的记录显示两个 tab——"提示词"(按段折叠,triage 类别映射到的
  归因段默认展开并高亮)、"上下文"(逐条消息,role 徽标,工具结果折叠)。
- **Fixtures 视图**:列表行显示是否带快照;预览含三件套切换。
- **triage 增强**(`records.ts` 的 `generateTriageReport`):对每个失败类别,统计其归因段落的
  hash 分布,输出如 `known-projects 段: cd34ef56 ×9, ef56ab12 ×2`——直接指认"可能导致问题的
  提示词版本";账本表格增加"段版本分布"列。
- IPC:`EVALS_READ_SNAPSHOT`(按 fixture 路径读 .prompt.json / .context.jsonl,上下文分页读)。

### S4:多轮重放

- **case 格式**:`context: <name>.context.jsonl`(可选,相对 `evals/fixtures/`)。
- **runner**(`runner.ts`):有 context 时,historyMessages = 快照消息(末条为 userMessage,
  若 case 覆写 userMessage 则替换末条);无 context 维持现状。判定仍作用于最终回复。
- **提升动作**(UI promote + IPC):勾选"包含上下文"时把 `.context.jsonl`(与 `.prompt.json`)
  一并拷入 `evals/fixtures/` 并写入 case 的 `context` 字段。
- **注意**:重放时系统提示词仍由**当前 builder** 重建(这是特性——测"新提示词能否救回旧失败");
  想复现原始行为时,快照 .prompt.json 供人工对照,不自动注入。

## 6. 数据格式

### 6.1 记录层增量(records.jsonl)

```jsonc
{ ...现有字段,
  "promptVersion": "3fa9c210",          // 当轮 sections 联合 hash(D5)
  "skeletonVersion": "9d555ca3",        // 骨架版本(向后衔接旧字段语义)
  "sectionHashes": { "system": "9d555ca3", "workdir": "1a2b3c4d",
                      "known-projects": "cd34ef56", "skills": "77889900", "os": "abcd1234" } }
```

### 6.2 提示词快照(.prompt.json)

```jsonc
{ "version": 1, "capturedAt": "...", "promptVersion": "3fa9c210",
  "sections": [
    { "name": "system",         "hash": "9d555ca3", "content": "You are onething, ..." },
    { "name": "workdir",        "hash": "1a2b3c4d", "content": "# Work Directory\n..." },
    { "name": "known-projects", "hash": "cd34ef56", "content": "# Known Projects\n..." } ],
  "truncated": [] }               // 被截断的段名列表(见 §7)
```

### 6.3 上下文快照(.context.jsonl)

首行 header(复用 codec),此后一行一条**请求视图**消息(AgentMessage 序列化):

```jsonl
{"v":2,"sessionId":"b46c5972-...","kind":"evals-context","turnId":"1282b698-..."}
{"seq":1,"m":{"role":"user","content":"帮我把超时改成 30 秒"}}
{"seq":2,"m":{"role":"assistant","content":"...","toolCalls":[{"toolCallId":"1","toolName":"edit","args":{}}]}}
{"seq":3,"m":{"role":"tool","content":[{"type":"tool-result","toolCallId":"1","result":"..."}]}}
{"seq":4,"m":{"role":"user","content":"不对,是 transreader 项目的"}}
```

保留字段:role / content / toolCalls / tool 结果(已脱水)/ reasoningContent。
不保留:providerData 中的宿主态、图片二进制(保留外置引用路径)。

### 6.4 case 扩展

```yaml
id: compaction-lost-instruction
fixture: compaction-lost.json
context: compaction-lost.context.jsonl    # 新增,可选
expect:
  contains: "30 秒"
```

## 7. 体积与截断策略

- 记录层:每轮 +~200B,忽略不计。
- `.prompt.json`:大头是 skills/AGENTS 段;单段上限 32KB(与 AGENTS_MAX_BYTES 对齐),
  超限存 hash + 前 32KB,段名记入 `truncated`。
- `.context.jsonl`:请求视图已经过脱水,典型几十~几百 KB;总上限默认 2MB
  (`settings.evals.snapshotMaxBytes`),超限保留 header + 首条 user + 末 N 条,中段替换为一行
  `{"omitted": <count>}` 标记——重放时该快照标记为"不完整,仅供阅读"。
- 清理:快照随 fixture 走,不单独清理;后续若需要,按 `records.jsonl` 归档策略一并处理(遗留项)。

## 8. 风险与开放问题

- **AgentMessage 序列化边界**:`prepared.runtime.messages` 含 provider 相关结构,S2 需定义白名单
  序列化(§6.3),防止把不可序列化宿主对象写盘;以 3 个 provider(deepseek/claude/openai-compatible)
  的真实请求做序列化回归样本。
- **👎 的 LRU 窗口**:N=5 轮内存暂存,超窗后点 👎 只有 fixture 无快照——可接受的降级,UI 注明。
- **段名契约**:消融、sectionHashes、triage 归因映射三方共享段名;golden 测试锁定,改名视为破坏性变更。
- **多轮重放的判定语义**:灌入历史后模型可能先回应历史中的悬挂工具调用;S4 需在 runner 中把
  快照末尾规整为"以 user 消息收尾"(必要时丢弃末尾悬挂的 assistant/tool 消息)。
- **records.jsonl 体积**(遗留自 UI 方案 §7):sectionHashes 使其增速略升,归档提示阈值维持 5MB 计划未实施。

---

## 附录:Review 修复轮(2026-07-10)

初版实施 review 后按序修复:

| # | 问题 | 修复 |
|---|------|------|
| 1 | 四件套快照对每轮无条件落盘(违背 D2),实测 43 个正常轮次 39MB,O(N²) 增长无清理 | turn 结束仅负信号(toolErrors/streamAborted)落盘;正常轮次只进 LRU;retry/edit amend 与 👎 从 LRU 补写并把 refs 写入 amend 记录(records.ts 合并);downvote 的 take→get 防止先 👎 后 retry 取不到;已清理存量垃圾 108 文件 24.4MB |
| 2 | .request.json 与 .context.jsonl 双份存完整消息数组(冗余 45%) | request 快照 v2:去掉 messages/systemPrompt,只留 model/tools/toolChoice/temperature/maxTokens + messageCount |
| 3 | §7 截断策略未实现 | 段 32KB 上限(hash 仍为全文 hash,truncated 列表);context 总量 2MB 上限(保 header+首条+尾部,{omitted} 标记);`settings.evals.snapshotMaxBytes` 可配 |
| 4 | 多轮重放把 role:"tool" 原样发给 API → 400 | runner 新增 `flattenContextMessages`:toolCalls 渲染为 `[tool call]` 行,tool 结果折叠进前一条 assistant(截断 1500 字符),孤儿结果转 user 行;已用真实捕获验证(13 条含 system/tool → 8 条纯 user/assistant) |
| 5 | snapshot.ts 第三处内联 joint-hash 公式 | 收敛到 section-hash.ts 的 hashSections 唯一实现 |

新增测试:`__tests__/runner-context.test.ts`(6)、`__tests__/snapshot.test.ts`(5);另修初版引入的 2 个 typecheck 错误(测试 fixture 缺 sections、store 非法 cast)。全量 3002 测试通过。
