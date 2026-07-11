# Variable 系统 v2:易变性分层与缓存友好的上下文变量

状态:Phase 0-5 全部已实施(2026-07-10)。
验收:全量测试 3023 pass / 0 fail;typecheck:node 零错误;
golden 与 baseline 快照重生成,diff 仅含预期两项(变量段移至末尾、新增 variable 持久化引导行)。
实施偏差:排序落在 registry.list()(provider chunk 内按 name 排序,工具输出与 inspector 一并受益),
而非 format 层;turnText 适配器为新增 buildTurnContextText(host adapter),原
buildContextVariablesPromptText 签名未变(内部改走双通道);Phase 5 的 promptCaching
为 opt-in,仅官方 claude / claude-code 注册点开启,自定义 anthropic 兼容端点不受影响。
新 provider 子路径需同步 vitest.config.ts 与 electron.vite.config.ts 的显式 alias 表(本次已补)。
后续增补(2026-07-11,定位修订为"运行时状态面板"后):BackgroundJobsProvider(自动上板,行内无活时长);
自定义变量开放 volatility="turn"(快变状态走回合注入,更新不再打穿 static 前缀);
context-update 约定以常量段进 system prompt(最新块覆盖旧块)。
2026-07-11 后台任务按会话隔离:BackgroundJob 记录 sessionId(bash ctx →
createOperations → registerBackgroundJob 两个登记点),看板严格匹配本会话;
bash_output/kill_bash 对他会话任务一律回"Unknown job"(读前拦截,避免游标副作用与 id 泄漏),
无主任务(sessionId 缺失)工具侧放行、看板侧不显示。
已知未修盲点:apps/server 的 registry 装配清单与 Electron 主进程重复且缺新 provider、
updatedAt 未在工具输出渲染。
日期:2026-07-08(设计)/ 2026-07-10(实施)
前置阅读:`docs/design/prompt-evaluation.md`(在线信号采集,Phase 4 依赖);
`docs/design/prompt-content-separation-delivery.md`(提示词已抽离到 `prompts/content/*.md`,
本方案涉及的提示词文案改动一律落在 content 文件,且受 `prompt-golden.test.ts`
逐字节 golden 快照约束——改动段落顺序或文案需同步重生成快照)

---

## 1. 背景与问题

### 1.1 现状

变量系统的骨架是完整的:`VariableRegistry`(provider 注册、按 session 串行写、
`onExternalChange` 订阅、global/session 双作用域)+ `variable` 工具(list/set/append/
remove/delete)+ Context inspector。但整条链路上:

- **消费端只有一个**:`formatVariablesForPrompt` 把变量拍平成文本,由
  `prompts/builder.ts` 的 `context-variables` section(提示词分离改造后约 L115)
  注入 developer prompt,位置在 sections 数组**中部**
  (runtime-context/workdir/projects 之后,skills/os/agents-md/plugins 之前)。
- **写入端只有一个**:模型自己调 `variable` 工具,且没有 prompt 层面的引导,
  实际调用频率很低。
- **provider 全是静态存储**:core(workdir)、session-store、global-store 三个,
  接口里 `list()` 每次读取都重新求值、支持只读变量的能力完全没有被用上——
  没有任何动态/计算型变量(datetime、git branch、会话统计等)。
- **重复注入**:workdir 既有独立段(builder.ts 的 `workdir` section,约 L108),
  又出现在 context-variables 段里(core provider 的 workdir 变量),同一信息两份。
- **渲染顺序不保证确定性**:输出顺序 = provider priority + 各 store 的插入序,
  没有显式排序;同一组变量在不同时刻/重启后可能渲染出不同字节序列。

### 1.2 KV cache 约束

前缀缓存(OpenAI/DeepSeek/Kimi 自动前缀缓存,Anthropic 显式 breakpoint)的规则:
**请求前缀中位置 N 的任何字节变化,使 N 之后的全部缓存失效**。请求布局是
`tools → system/developer → history messages`,变量段在 system 区,排在全部历史之前。
推论:

1. 变量段每变一次,**整个会话历史的缓存全部失效**。长会话(几万 token 历史)
   一次变量变更 = 一次全量重算。低频的用户/模型主动写入可以接受;
   但如果天真地把 datetime 这类每回合都变的值放进变量段,等于**每回合全量 miss**,
   缓存彻底废掉。
2. 非确定性渲染顺序 = 无谓的缓存失效:值没变,字节变了。
3. 仓库目前没有任何 `cache_control` 设置:对自动前缀缓存的 provider,上述规则
   已经生效;对 Anthropic,显式 breakpoint 未启用,缓存收益本来就没有兑现
   (见 Phase 5)。

### 1.3 现有求值时机(设计依赖的事实)

`buildContextVariablesPromptText` 在每次流式生成开始时调用一次
(`stream-runtime.ts:556` 的 `buildPromptForHistory`),同一回合内的多步 tool loop
不重新求值。即变量快照是**回合级新鲜**,这个粒度 v2 保持不变。

## 2. 目标与非目标

**目标**

1. 变量按易变性分层,易变值不进 system 前缀,缓存命中率不因动态变量而劣化。
2. 打开动态只读 provider 的能力(datetime、git branch、channel/profile 等)。
3. 渲染确定性:同一组值 → 同一字节序列。
4. 消除 workdir 双重注入。
5. 变量引发的缓存失效可观测。

**非目标(留待后续单独设计)**

- `{{var}}` 插值进 skills/agents/scheduler prompt(战略方向,需要单独 spec
  界定插值发生的层,避免工具参数注入面)。
- 项目级变量预设(`.onething/variables.json`,direnv 式加载)。
- Context inspector 的编辑交互改版。

## 3. 设计原则

1. **按易变性分层**:`static`(跨回合基本不变)/ `turn`(每回合可能变)/
   `on-demand`(只在模型主动查询时给)。
2. **前缀只放稳定内容**:system/developer 区只渲染 static 变量;
   turn 变量走对话尾部注入(Phase 2),on-demand 变量只出现在 `variable` 工具输出里。
3. **append-only**:注入到历史里的内容永不回溯修改——改历史 = 改前缀 = 全量 miss。
4. **接受"变更即 miss",但要看得见**:static 变量被写入时的一次性失效是合理代价,
   用遥测量化频率,不做复杂的规避设计。

## 4. 方案总览(Phase 划分)

| Phase | 内容 | 性质 |
|---|---|---|
| 0 | 渲染确定性 + workdir 去重 + 变量段后移 | 低成本清理,立即降低无谓失效 |
| 1 | `volatility` 元数据 + 双通道 format 层 | 核心机制 |
| 2 | 回合级上下文注入(append-only turn context) | turn 变量的落点 |
| 3 | 动态只读 provider 集(datetime/git/channel) | 兑现能力 |
| 4 | 写入引导 + 缓存失效遥测 | 使用率与可观测 |
| 5 | Anthropic 显式 cache breakpoint | 独立优化,与本方案叠加 |

Phase 0-1 无行为风险可先行;2 依赖 1;3 依赖 1(turn 类依赖 2);4、5 独立。

## 5. 各 Phase 详细设计

### Phase 0:确定性渲染与段落整理

改动集中在 `variables/format.ts` 与 `prompts/builder.ts`:

1. **排序**:`formatVariablesForPrompt` 输出前按 `(providerPriority, name)` 排序,
   保证同值同字节。
2. **workdir 去重**:workdir 从 context-variables 段的渲染中剔除
   (format 层跳过,变量本身保留——工具 list、inspector 不受影响),
   builder 的独立 `workdir` 段作为唯一渲染点;或反向(删独立段、保变量段),
   取决于哪边的措辞对模型更有效,建议保留信息更丰富的独立段。
3. **变量段后移**:`context-variables` 移到 developer sections 末尾
   (agents-md 之后、plugins 之前或最后)。变量变更时,失效跨度从
   "skills+os+agents-md+plugins+历史"缩小到"仅历史"。skills/os 等大段稳定内容
   留在前缀更靠前的位置。
4. 快照哈希(`contextVariablesHash`)逻辑不变,自动获得确定性。
5. **golden 快照**:第 2、3 项都会改变组装后的 prompt 字节序列,
   `prompts/__tests__/prompt-golden.test.ts` 的 golden fixtures 需同批重生成,
   并人工过目 diff 确认只有预期变化。

### Phase 1:volatility 元数据与双通道 format

`variables/types.ts`:

```ts
export type VariableVolatility = 'static' | 'turn' | 'on-demand'

export interface ContextVariable {
  // ...现有字段
  volatility?: VariableVolatility   // 缺省 'static',现有三个 provider 零改动
}
```

format 层拆为双通道:

```ts
export interface VariablePromptSections {
  systemText: string   // 仅 static —— 进 developer prompt 的 # Context Variables 段
  turnText: string     // 仅 turn —— 交给 Phase 2 的回合注入
}
export function splitVariablesForPrompt(vars: ContextVariable[], opts?): VariablePromptSections
```

- `on-demand` 变量两个通道都不进,只在 `variable` 工具的 list 输出与 inspector 出现。
- `buildContextVariablesPromptText(sessionId)` 适配器签名改为返回结构化结果,
  `stream-runtime.ts:556` 与 `system-prompt-snapshot.ts:472` 两个调用点同步更新。
- 校验:registry 不允许模型对 `turn`/`on-demand` 变量执行 set(它们都应是
  provider 计算出的只读值);`volatility` 由 provider 声明,不暴露给工具参数。

### Phase 2:回合级上下文注入

**机制**:构建请求时,在**最新一条 user message 之后**附加一个上下文块:

```
<context-update>
- datetime: 2026-07-08 14:00 (+08:00, hour granularity)
- git_branch: redesign/prompt-assembly
</context-update>
```

实现落点:`stream-runtime.ts` 的 `buildPromptForHistory` 在拿到
`historyMessages` 后、交给 `buildPrompt` 前,把 turnText 包装为一条紧跟最新
user message 的 user-role 补充内容(或 message 的附属 part,取决于
`agentMessagesFromHistory` 的内容模型,实施时确认)。

**缓存关键规则**:

1. **append-only**:历史中已存在的 `<context-update>` 块原样保留,
   永不回溯删除或改写。删除历史中的块 = 前缀变化 = 全量 miss,比多留几十个
   token 贵得多。
2. **去抖**:仅当 turnText 与上一次注入的内容不同时才注入新块。
   datetime 用小时粒度后,连续对话大多数回合不产生新块。
3. **持久化**:注入块作为消息记录的附属字段写入 `messages.jsonl`
   (类似现有 dehydrate 的思路,渲染层不显示或折叠显示),
   重建历史时按存储值原样重放——保证重建后的请求字节与原请求一致,缓存不受
   重建影响。不持久化的方案(重建时重新生成)会让每次重建都产生一次全量 miss,不取。
4. **粒度量化**:时间类变量由 provider 负责量化(默认小时);
   format 层不做隐式截断以外的加工。

**token 预算**:去抖 + 小时粒度下,一个 8 小时的长会话新增注入块 ≤ 8 个,
每个 ~30 token,可忽略。

### Phase 3:动态只读 provider

在 `variables/providers/` 新增,全部 `readonly: true`、不注册写方法:

| 变量 | volatility | 说明 |
|---|---|---|
| `datetime` | turn | 小时粒度 + 时区;`Current date`(builder.ts `core()` 内,日粒度)保留在 core 段,二者粒度不同不算重复,实施时统一措辞 |
| `git_branch` | turn | workdir 的当前分支,workdir 无 git 则不输出;实现上缓存 stat,避免每回合 spawn |
| `session_stats` | on-demand | 消息数/近似 token 用量,模型查询自我调节用 |
| `channel` / `profile` | static | gateway channel identity → profile,多用户 memory 的 scope 链路复用;会话生命周期内不变,进前缀安全 |

每个 provider 是独立小文件,按需分批落地;datetime + git_branch 先行,
作为 Phase 2 机制的验收用例。

### Phase 4:写入引导与遥测

1. **prompt 引导**:在 `prompts/content/tool-guidelines.md` 加一条
   (提示词分离后文案改动只落 content 文件,golden 快照同批重生成):
   发现用户稳定偏好或任务关键状态时,用 `variable` 工具持久化
   (session 作用域为默认;与 memory 的分工写进两边工具描述:
   variable = 小、结构化、每轮进 prompt 的控制面;memory = 大、检索式的知识面)。
   现有 `tool-workspace-rules.md` 与 `known-projects-instructions.md` 已经在
   引导模型调 `variable` 改 workdir,新增引导沿用同一模式与措辞风格。
2. **缓存失效遥测**:每回合记录 `systemText` 哈希与上一回合是否一致
   (`contextVariablesHash` 已有,补一个 turn 间比较与计数),
   作为 prompt-evaluation 在线信号之一。上线后用它验证:
   static 段变更频率应接近于零,turn 注入块的新增频率应明显低于回合数。
3. `variable` 工具调用频率本身进在线信号,验证 Phase 4.1 的引导是否有效。

### Phase 5:Anthropic 显式 cache breakpoint(独立项)

现状没有任何 `cache_control`,Anthropic 系 provider 实际没有缓存收益,
本方案对它是"为未来铺路"。单独一个小改动:通过 AI SDK 的
`providerOptions.anthropic.cacheControl` 在 (a) tools 之后、(b) system/developer
之后、(c) 倒数第二条历史消息处设 breakpoint。与 Phase 0-2 叠加后,
变量写入只失效 (b) 之后的段,tools 前缀仍命中。
实施时机不依赖前四个 Phase,可与 Phase 0 同批。

## 6. 兼容与风险

- **接口兼容**:`volatility` 可选、缺省 static,现有 provider/store/IPC 零改动;
  `buildContextVariablesPromptText` 签名变更只涉及两个调用点。
- **模型行为风险**:turn 变量从 system 段移到对话尾部后,模型对它的"注意力"
  位置变化。datetime/git_branch 属于事实类信息,尾部注入通常更接近当前回合、
  效果只会更好;仍以 Phase 3 落地后人工回归为准。
- **存储格式**:Phase 2 的注入块字段是 messages.jsonl 的向后兼容扩展
  (旧记录无此字段 = 无注入),不触发迁移。
- **测试**:format 双通道与排序是纯函数,单测直接覆盖;append-only 与去抖
  在 stream-runtime 层加回归测试(同值不注入、变值注入、重建字节一致)。
