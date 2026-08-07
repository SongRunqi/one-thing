# Provider 抽象收口

> 目标：agent 在使用 provider 时对底层是谁完全无感知。
> 立项 2026-08-06，P0–P4 同日实施。本文于 2026-08-07 按实施结果重写。
> 代码引用为 2026-08-07 的行号。变更记录见 §13。

---

## 0. 一句话状态

**抽象本来就存在，主链路上一直是干净的。** 这个方案做的是收口：把漏到抽象外面的
provider 名字收回去，把并存的第二条消费面拆掉。

到 2026-08-07：`packages/core` 已不认识任何 provider，并有架构测试锁着。
29 个文件 **+404 / −2293**，新增 3 个文件（424 行）。全量 860 文件 / 7265 用例全绿，
`boundary:gate` 无新增失败。

剩余工作全部与 **ACP** 有关，加上三处产品层的零散特判（见 §11）。

---

## 1. 现状：抽象是三层

### 1.1 契约层（`packages/core`，零依赖）

`packages/core/agent-loop/types.ts:367`：

```ts
export interface AgentProvider {
  id: string
  capabilities?: AgentModelCapabilities
  getModelCapabilities?: (model: string) => AgentModelCapabilities | Promise<AgentModelCapabilities>
  capabilitiesAreSelfDeclared?: boolean          // ← P2 新增
  streamTurn?: (request: AgentTurnRequest) => AsyncIterable<AgentTurnStreamEvent>
  runTurn?: (request: AgentTurnRequest) => Promise<AgentTurn>
}
```

**就两个方法。** 入参 `AgentTurnRequest`（types.ts:352）已归一化：

```ts
{ model, messages, tools?, toolChoice?, requestedOutputModalities?,
  temperature?, maxTokens?, thinking?, reasoningEffort?, abortSignal?, turn }
```

出参是归一化事件流 `AgentTurnStreamEvent`：`text-delta` / `reasoning-delta` /
`tool-call-start|delta|done` / `provider-data` / `finish` /
`tool-metadata|partial-result|result`（后三个只对 `externallyExecuted` 的调用有效）。

`runAgentLoop`（runner.ts:461）只认这个接口，一句 provider id 判断都没有。

**`streamTurn` 与 `runTurn` 的实际关系**（P0 查明，值得记住）：
`stream.ts:337` 先判 `isAgentStreamingProvider` 就早退，而仓库里 7 个 provider
**全部实现了 `streamTurn`** —— 所以 `runTurn` 分支在生产中不可达。它不是死代码，
是契约上一个受支持、但没有内建 provider 走到的扩展点。覆盖它的是
`packages/core/agent-loop/stream.test.ts`（P0 新增，8 例）。

### 1.2 实现层（`packages/onething-runtime/src/agent-loop/providers/`）

| 文件 | 覆盖 |
| --- | --- |
| `claude.ts` | Anthropic 线协议 |
| `codex.ts` | ChatGPT 订阅 / Responses API |
| `gemini.ts` | Google |
| `deepseek.ts` | DeepSeek（含模型名 → thinking 推断，P4 下沉） |
| `openai-compatible.ts` | openai / openrouter / kimi / zhipu / qwen / grok / copilot … |
| `acp.ts` | 本地 ACP agent |
| `../../external-agents/provider.ts` | Claude Code CLI 等外部 agent |

差异**被参数化，不是被 if-else**。`openai-compatible` 靠
`reasoningStyle: 'openai-effort' | 'openrouter-reasoning' | 'thinking-type'`、
`maxTokensField`、`includeAssistantReasoning`、`supportsVision/Reasoning`
这几个旋钮，一个实现吃掉九家。这是这套设计里做得最对的地方。

### 1.3 注册表（`factory.ts`）

```ts
registerAgentProviderRuntime(providerId, factory, { replace })   // factory.ts:201
createAgentProviderFromRuntime(providerId, config, options)      // factory.ts:229
```

一个 `Map<string, AgentProviderRuntimeFactory>`，15 个内建注册 + `custom-*` 前缀兜底。
**这是全仓唯一的 `providerId → 实现` 映射点。**

上面套一层 `withPerModelCapabilities`（factory.ts:253）：把能力账本
（`model-capability.ts`）的判定盖到 provider 自报的能力上，让 copilot / openrouter
这种一 provider 多模型的场景**按模型**而不是按 provider 解析能力。
自述能力的 provider 跳过这层（factory.ts:241）。

---

## 2. 差异是怎么被消化的：能力协商

这是「无感知」的机制本体，后续所有改动都要遵守它。

`AgentModelCapabilities`（types.ts:32）：

```ts
{ capabilities: AgentCapability[]        // 'tool-calls' | 'reasoning' | 'vision-input' | …
  inputModalities, outputModalities, toolResultModalities?
  supportsTools?, supportsStructuredToolResults?, supportsReasoning?
  supportsStreaming?, supportsForcedToolUse?
  maxInputTokens?, maxOutputTokens? }
```

`packages/core/agent-loop/capabilities.ts` 提供一组**纯函数探针**。runner 用探针降级，
**从不问对面是谁**。

其中 `supportsForcedToolUse`（types.ts:47）的注释写明了这套设计的口径，是后续新增
能力位的模板：

> 严格 opt-in——没说支持就当不支持。因为不认识这个参数的端点会直接 400，
> 把一个本来能跑的回合弄挂；沉默要解释成「不」，而不是「试试看」。

**新增能力位沿用这条：正向能力宽容（默认支持），破坏性能力严格（默认不支持）。**

---

## 3. 五处漏点与现状

| # | 漏点 | 状态 |
| --- | --- | --- |
| ① | 并存的旧消费面（`provider-facade` + `provider-routing`） | **大部分已收**，仅剩 ACP generate 路由 |
| ② | config 里的 per-provider 字段（`zhipuApiMode` 等穿透 9 文件） | ✅ 已收进 `providerOptions` |
| ③ | options 里的 per-provider 钩子 | **部分**：OAuth 已泛化，ACP 两个钩子未动 |
| ④ | factory 里的能力逃逸（`providerId === 'acp' \|\| …`） | ✅ 改为 `capabilitiesAreSelfDeclared` |
| ⑤ | 零散 id 特判 | **部分**：deepseek thinking 已下沉，另 3 处未动 |

### 漏点 ① 的关键事实：旧消费面 80% 是死码

立项时清点：`provider-facade.ts` 暴露 10 个出口，其中 **8 个零生产调用方**，
唯一引用来自 `deepseek-agent-routing.test.ts`(1114 行) 和 `provider-facade.test.ts`
—— **测试在给死码续命**。活着的只有 `generateChatResponse`（3 处）和
`generateChatTitle`（2 处），而且五处要的都是同一件事：**一次性文本补全、零工具**。

> 查死码时注意排除注释：`app/mcp/bridge.ts:129` 和
> `engine/stream/message-helpers.ts:526` 只在注释里提到这些 API，按文件名匹配会误判。

### 漏点 ② 的病根不是丑，是静默失败

`CoreAgentLoopProviderRuntimeConfigFor` 是一个 `Pick<>` **白名单**：没被列名的字段
会被静默丢弃，typecheck 保持绿，只有在真机上看到请求打到错误 endpoint 才会发现。
与 `settings-merge-whitelist-bug` 记的 `mergeWithDefaults` 吞掉 `settings.storage`
是同一个病。

现在拿掉 `providerOptions` 会产生 **7 个 typecheck 错误**（已变异验证）。

---

## 4. 两个正确样板

**`createUtilityProvider`**（`app/providers/utility-provider.ts:81`）—— 后台一次性调用的
标准姿势：解析 toolCallModel → 查配置 → 解析 auth → 建 provider。
消费者：`app/toc/index.ts`、`app/engine/triggers/skill-review.ts`。

**`requestDumper`** —— 它已经从 `codexRequestDumper` 泛化过一次，是仓库内现成的
「per-provider 钩子怎么泛化」先例。P1 的 `refreshOAuthToken` 照抄了它。

---

## 5. 分期总览

| 期 | 内容 | 状态 | 实测 |
| --- | --- | --- | --- |
| **P0** | 删死码 | ✅ | −1805 行 |
| **P1** | 运行时契约收口：`providerOptions` + OAuth 钩子泛化 | ✅ | ≈ 0 |
| **P2** | 能力自述 `capabilitiesAreSelfDeclared` | ✅ | +10/−5 |
| **P3** | deepseek 路由收口（原「搬 5 个调用点」，已改做法） | ✅ | −488 行 |
| **P4** | deepseek thinking 下沉 + 完工判据架构测试 | ✅ | ≈ −40 |
| **R1** | ACP 收口（决策门 + 两步） | ⬜ 待做 | — |
| **R2** | 产品层零散特判 | ⬜ 待做 | — |

P0–P4 已全部完成。R1/R2 是重新划分出来的剩余工作（见 §11），**不是原方案的 P3/P4 残余**
—— 原方案对它们的定性是错的，见 §13。

---

## 6. P0 — 删死码 ✅

**目标**：删掉零生产调用方的旧出口，把旧消费面缩到只剩两个真调用者。

**前置（实施中发现，原方案没有）**：新增 `packages/core/agent-loop/stream.test.ts`
覆盖 `runTurn` 分支。原方案把「deepseek 在新路无覆盖」列为唯一风险，核查后 deepseek
覆盖充分，真正零覆盖的是 `runTurn`（`runner.test.ts` 里出现 0 次），而它的唯一
守护恰好就是待删的 3 个死用例。

**动作**：

1. `provider-facade.ts` 公开接口 10 → 2 个成员（`generateChatResponse` /
   `generateChatTitle`）；`generateChatResponseWithReasoning` **降级为模块内 const**
   （它是前者的内部实现，不是死码）；删随之失去调用方的 5 个 helper 与 19 个失效 import
2. `app/providers/index.ts` 删 8 个 re-export 包装
3. `provider-routing.ts` 删三个 stream 函数及其 Options 接口
4. `agent-turn.ts` 删三个 stream 函数 + 两个 Options 接口
5. 测试**逐用例裁剪**（不是整文件删）：`deepseek-agent-routing.test.ts` 17 → 8 例、
   `agent-turn.test.ts` 5 → 2 例、`provider-routing.test.ts` 23 → 15 例、
   `provider-facade.test.ts` 2 → 1 例
6. `scripts/headless-boundary-check.ts`：2 条规则摘掉已删符号，2 条整条移除

**保留**：`generateChatResponse` / `generateChatTitle` 及其依赖链
（`runOnethingUtilityAgentTurn`、`mergeOnethingSystemMessagesForGenerateIfNeeded`、
`streamOnethingACPChatResponseWithTools`、`generateOnethingChatResponseWithReasoning`）。

**验证**：三次变异（缓冲化、去掉 abort 包裹、合成不去重）全部被新测试抓到。

---

## 7. P1 — 运行时契约收口 ✅

**目标**：per-provider 的旋钮和钩子不再出现在通用契约上。

### 7.1 `providerOptions` 不透明袋

**只动运行时契约，不动存储形状。** `settings.ai.providers[id]` 里的
`zhipuApiMode` 等是已落盘的用户配置，settings UI 也正当地需要按名编辑它们。

新增 `providers/provider-options.ts`（87 行）承载唯一那张表：

```ts
pickOnethingProviderOptions(providerId, storedConfig)            // 打包
readOnethingZhipuOptions(bag) / readOnethingQwenOptions(bag)     // 拆包 + 校验
```

**打包点**：`providers/provider-config.ts` 的 `withResolvedProviderBaseUrl`。它是
`getEffectiveProviderConfig` 三个分支的必经点，而且**已经**在按 apiMode/region
解析 baseUrl —— 一处改动覆盖全链路。

**第二个打包点**：`app/providers/utility-provider.ts`。后台工作直接读
`settings.ai.providers[id]`，不走 `getEffectiveProviderConfig`。漏了它，zhipu
coding-plan / qwen intl 账号的旁路调用会静默打到错误 endpoint。

**拆包点即校验点**：袋子是 `Record<string, unknown>`，narrow 在各 provider 的 factory 里做。

随之从运行时路径摘掉三个字段：`AgentProviderRuntimeConfig`（factory.ts:45）、
`CoreAgentLoopProviderRuntimeConfigLike` + 其 `Pick<>`、`agent-runtime-route.ts` 的透传。

### 7.2 钩子泛化

| 原 | 现 |
| --- | --- |
| `codexRefreshOAuthToken?: (force) => …` | `refreshOAuthToken?: (providerId, force) => …` |
| `codexRequestDumper?`（已 deprecated） | 删 |
| `acpStreamPrompt?` / `acpCwd?` | **未动**，见 §11 R1 |

`authService` 本来就按 providerId 索引，之前只因为选项名而变成 codex 专属。

**验证**：新增 `provider-options.test.ts`（6 例）。变异：拿掉打包 → 2 例红；
**从 core 的 `Pick<>` 拿掉 `providerOptions` → 7 个 typecheck 错误**。

---

## 8. P2 — 能力自述 ✅

`AgentProvider` 新增 `capabilitiesAreSelfDeclared?: boolean`。`acp.ts` 与
`external-agents/provider.ts` 各声明一行；`factory.ts:241` 的 id 特判改成读标志。

今天只有 `claude-code-agent` 走 `createExternalAgentProvider`，所以行为与改动前**完全
一致** —— 变的是「再接一个外部 agent 要不要回来改这一行」。

给 `claude-code-integration-v2.md` 记的 `supportsTools:false` 病根一个结构性出口：
能力由 provider 自报，不再被外部表反查。

**实施细节**：自述的 provider 被**原样返回**，只有 `capabilities` 没有
`getModelCapabilities`。断言必须走 `resolveAgentModelCapabilities`（消费者真正用的
入口，会回落到 `provider.capabilities`），直接调 `getModelCapabilities?.()` 拿到 undefined。

---

## 9. P3 — deepseek 路由收口 ✅

> 原方案这一期叫「搬 5 个调用点」。做法已整个替换，理由见 §13 调整 B。

**做法：保住签名、换掉内脏。** `generateChatResponse(providerId, config, messages, options)`
本身就是三个调用点要的 API，问题只在它内部还走 acp/deepseek/agent 三路由。
所以调用点**一行不改**，零迁移风险，也自动保住了 `collab/roster.ts:85` 记的
「裸调用：零工具、不读看板、不写变量」语义和 `thinking:false`。

**前置：P4 的 deepseek thinking 下沉**（见 §10）。deepseek 路由不是冗余的 ——
逐字比对后差异有两处，其中 temperature 那条是**假差异**（`deepseek.ts` 早就自己做了），
真差异只剩「`thinking` 未指定时按模型名推断」。而五个调用点里**只有 `context-compact`
不传 `thinking`**，直接删会静默改掉 deepseek reasoner 上的上下文压缩行为。

**动作**：

- `OnethingProviderRuntimeRoute` 的 `kind` 三选一 → 两选一，deepseek 走通用 agent 路
- 删 `generateWithOnethingDeepSeekAgent`、`createOnethingDeepSeekAgentRuntimeProvider`、
  `isOnethingDeepSeekProviderRuntime`、`deepSeekAgentRequestDumpContext`、
  `createOnethingDeepSeekAgentProvider`、facade 的 `generateWithDeepSeek`
- 那条 2026-08-02 的计费回归保障（deepseek generate 必须带 usage）改走新的通用 agent
  路径，断言不变 —— 它守的正是收口后的真实链路

**实测行数**：`provider-facade.ts` 559 → 287；`provider-routing.ts` 823 → 570；
`agent-turn.ts` 516 → 263；`agent-runtime-route.ts` 76。

---

## 10. P4 — deepseek thinking 下沉 + 完工判据 ✅

> 原方案把这一期排在 P3 之后。实际第一项是 P3 的**前置**，见 §13 调整 C。

### 10.1 deepseek thinking 下沉

`thinking-options.ts` 的 deepseek 分支删掉：它与通用分支的唯一差异是「未配置 effort
时兜底 high」，而 `deepseek.ts` 本来就把 effort 钳到 high/max，让它自己兜底即可。
新增 `isDeepSeekThinkingModel` + `resolveDeepSeekThinking`。

**实施中抓到一个险些引入的行为扩大**：把模型名推断放进 provider 后，主聊天链路上
deepseek-v4 不配 toggle 会开始发 `reasoning_effort: high`（此前不发）。修法是区分
「显式要求 thinking」与「按模型名推断」，只有前者兜底 effort：

```ts
const effort = request.reasoningEffort
  ?? (request.thinking === "enabled" ? "high" : undefined)
```

与两条旧路径逐一比对确认等价：旧 generate 路由推断 thinking 但不发 effort ✓；
旧 chat 路径 toggle 开启时发 high ✓。

### 10.2 完工判据架构测试

`packages/core/__tests__/architecture-boundaries.test.ts` 新增
"keeps the provider-agnostic layers free of provider names"：
`packages/core/agent-loop` 与 `packages/core/engine` 下不得出现 provider id 比较，
也不得出现 `zhipuApiMode` / `qwenApiMode` / `qwenRegion` / `codexNativeTools` /
`codexRefreshOAuthToken` / `codexRequestDumper`。

匹配前**先剥注释** —— 要禁的是「代码按 provider 分叉」，不是「不许把这段历史写在旁边」。
变异：往 core 塞回一行 `zhipuApiMode` → 用例红。

---

## 11. 剩余工作

### R1 — ACP 收口（一个决策门 + 两步）

原方案把 ACP 拆成了两处（P1 的钩子、P3 的路由）分开定性，都低估了。它其实是**一个
主题**：ACP 在这套抽象里仍是二等公民。而且两步有依赖 —— 若先做 R1.2，R1.1 的目标会
变，验证要做两遍。

**R1.0 决策门（先做）**：确认「ACP generate 走 `acp.ts` 的 `streamTurn`」是否可接受。
两条路径**不等价**：

| | `acp.ts` streamTurn | 现 generate 路由 |
| --- | --- | --- |
| prompt | 完整消息数组 | 只取最后一条 user 消息（**system 被丢掉**） |
| cwd | `workingDirectory ?? cwd() ?? '.'` | `workingDirectory \|\| config.baseUrl \|\| default` |
| localSessionId | `options.localSessionId` | `debugSessionId` |

切过去很可能是**改进**（system 提示词目前是被丢的），但它改变 ACP agent 实际收到的
内容，**必须真机验证**。

**R1.1（决策为「可接受」时）**：删 ACP generate 路由。收益立刻兑现 ——
`kind` 从两选一变一选一，`agent-runtime-route.ts`（76 行）整个消失，
`provider-routing.ts` 再掉一大截，漏点 ① 彻底关闭。

**R1.2（独立，建议延后）**：`acpStreamPrompt`/`acpCwd` 并入 `externalAgentConnectors`。
两者形状根本不同 —— ACP 是 `streamPrompt(model, {...})` 的一次性调用，
`ExternalAgentConnector` 是带 `capabilities`/`interrupt`/`steer`/`dispose` 的有状态对象。
并入要重写 `acp.ts` 的事件词汇并补出生命周期，是有 ACP 行为风险的真重构。

**建议：等接第三个本地 agent 时再做。** 现在走这个形状的只有 ACP 一个，
`externalAgentConnectors` 已经是它那一类的通用槽位 —— 为一个成员做抽象是过度设计。

### R2 — 产品层零散特判

| 项 | 位置 | 判断 |
| --- | --- | --- |
| `part.provider === 'codex'` | `agent-loop/providers/provider-data.ts:43` | **值得做**。改按 `type` 判断，但要先确认不会漏掉别的 provider 的生图 payload |
| `codexNativeTools` 归入 `providerOptions` | 穿透 3 文件 | **值得做**，但它同时是 UI 可见的设置项，要连带确认设置页链路 |
| `id → family` 改 `capabilityFamily` | `model-capability.ts:134-145` | **建议不做**，见 §12 |
| kimi 分支 | `thinking-options.ts:97` | **建议不做**，见 §12 |

这些都在**产品层**，不影响已由架构测试锁死的 core 边界，优先级低于 R1。

---

## 12. 明确不做的事

- **前端 id 判断**：`ProviderIcon.vue`、`ConnectionsSection.vue`、`ModelSelector.vue`
  是呈现层，图标和文案本来就该按家分。
- **`model-capability.ts` 的 28 处字面量**：它是能力账本，知道哪家什么样是它的职责。
  **含 134-145 的 `id → family` 映射** —— 立项时列为待改，重新评估后撤回：
  改成 `capabilityFamily` 字段要动整张账本，而账本按家族归一本就是它的正当工作，
  风险大于收益。
- **`thinking-options.ts` 的 kimi 分支**：与 deepseek 不同，kimi 的 k3 /
  always-thinking 规则是真的按模型族分叉。下沉需要 `openai-compatible` 提供
  per-provider 钩子 —— 为一家 provider 加一个扩展点，不划算。
- **落盘的 settings 形状**：只在运行时契约上收口（§7.1）。改存储要写迁移。
- **插件式 provider 加载**：`registerAgentProviderRuntime` + `custom-*` 已经够了。

---

## 13. 变更记录

> 2026-08-07 按 P0–P4 实施结果重写。原方案的分期结构、行号、以及对 P3/P4 的定性
> 都与实际不符，本节记录改了什么、为什么、哪些是新增的。

### 结构性调整

**调整 A — 剩余工作从「P3/P4 残余」重划为 R1/R2。**
原方案把 ACP 的两件事分别塞进 P1（钩子）和 P3（路由），把三处特判塞进 P4。
实施后发现 ACP 是一个主题且**两步有依赖**（先做 connector 并入，generate 路由的
目标就变了，验证要做两遍）。现在合并为 R1，并**新增一个决策门 R1.0** ——
因为 ACP 两条路径不等价，必须先真机确认再决定后面怎么走。

**调整 B — P3 的做法整个替换（新增做法）。**
原方案要新建 `createProviderRef` + `generateUtilityText` 并迁移 5 个调用点。
实施时发现 `generateChatResponse` 的签名本身就是那三个调用点要的 API，问题只在
内部路由。改为「保住签名、换掉内脏」，调用点一行不改。
**原因**：零迁移风险，且自动保住了 `roster.ts:85` 的「裸调用」语义和 `thinking:false`
—— 按原方案搬反而要小心翼翼地手工维护这两条。

**调整 C — P4 第①项提为 P3 前置（新增依赖）。**
原方案把「deepseek thinking 下沉」排在 P3 之后。实测 deepseek 路由不冗余：
`thinking` 未指定时它按模型名推断，而五个调用点里 `context-compact` 恰好不传
`thinking`。不先下沉就删路由，会静默改掉 deepseek reasoner 上的压缩行为。

**调整 D — P0 新增前置步骤。**
原方案称 P0 唯一风险是「deepseek 在新路无覆盖」。核查后 deepseek 覆盖充分，
真正零覆盖的是 `runTurn`（`runner.test.ts` 里 0 次，7 个 provider 全实现、
`stream.ts:348` 在调）。新增 `stream.test.ts` 8 例作为删死码的前置。

**调整 E — §12 新增两条「不做」。**
`model-capability.ts:134-145` 的 `capabilityFamily` 和 `thinking-options.ts` 的
kimi 分支，立项时列为待改，重新评估后判定风险/收益不划算，移入不做清单并写明理由。

**调整 F — 文档结构重排。**
原文成了「原计划 + 错误标注 + bis 存档」三层叠加，`bis` 小节里还出现重复的
9.1/9.2/9.3 编号，已经不能当计划读。本次按「现状 → 机制 → 漏点 → 各期 → 剩余」
重排，实施结果直接写进对应期，不再保留 bis 存档；被推翻的判断集中记在本节。

### 事实更正

| 原文 | 实际 | 影响 |
| --- | --- | --- |
| 旧消费面 8 个出口全是死码 | 其中 `generateChatResponseWithReasoning` 是 `generateChatResponse` 的内部实现 | 处置从「删除」改为「降级为模块内函数」 |
| 删 `deepseek-agent-routing.test.ts` 整文件 | 17 个用例里 8 个测还活着的 `generateChatResponse`，覆盖六家 provider | 改为逐用例裁剪；整文件删会静默丢掉六家覆盖 |
| P0 后 `kind` 三分支消失 | P0 只消掉 stream 侧；generate 侧到 P3 才少一支，ACP 那支至今还在 | 分期表与完工判据同步修正 |
| `provider-facade.ts` 559 → 231 行 | **559 → 287** | 上一版数字写错，已更正 |
| `provider-routing.ts` 823 → 330 行 | **823 → 570** | 同上 |
| `acpStreamPrompt` 并入 connector 是机械改名 | 形状根本不同，是有行为风险的真重构 | 从 P1 拆出为 R1.2，并建议延后 |
| ACP generate 可直接切通用路径 | 两条路径不等价（system 提示词、cwd、sessionId 都不同） | 新增 R1.0 决策门 + 真机验证 |

### 实施中抓到的问题（不属于方案错误）

- **险些引入的行为扩大**：deepseek 模型名推断下沉后，主聊天链路会开始发
  `reasoning_effort: high`（此前不发）。已改为区分「显式要求」与「推断」，
  只有前者兜底 effort，并与两条旧路径逐一比对确认等价。
- **一次归因错误**：全量测试首跑 `apps/server/src/http.test.ts` 有 1 例失败，
  当时判为「本次改动引起」。同一份代码复跑全绿、隔离跑 47/47 通过 —— 是时序 flake。
  该用例 ~3.9s，对并发敏感，值得单独盯。

---

## 14. 完工判据

R1 做完后，下面这条命令应当只在 §12 允许的位置有命中：

```bash
grep -rnE "(providerId|provider\.id|providerType)\s*===\s*'(codex|claude|claude-code|claude-code-agent|deepseek|gemini|openai|anthropic|acp|qwen|zhipu|github-copilot)'" \
  --include='*.ts' packages apps | grep -v '__tests__'
```

即：`model-capability.ts`（账本自身）、`thinking-options.ts`（kimi）与 `renderer/`
（呈现层）之外，零命中。

core 一侧已由 `packages/core/__tests__/architecture-boundaries.test.ts` 的
"keeps the provider-agnostic layers free of provider names" 固化（P4 已加）。
