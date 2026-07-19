# Token 计费系统设计

状态:P0-P2 全部落地,未提交。侧线 LLM 调用(标题生成/memory/context-compact)记账留有已知缺口,见下方"实施状态"。
日期:2026-07-13

## 目标

- 全量计量每一次 LLM 调用的 token 消耗(含 cache read/write、reasoning),换算成 USD 成本。
- 订阅制 provider(Codex OAuth、Claude Code OAuth、Copilot)按同模型**官方 API 单价**折算等值成本,并打上标签标明来源平台,UI 上与真实 API 开销区分展示。
- 不做预算/配额强制(原 P3 方案取消),纯计量与可视化。

## 现状盘点(已有基础)

| 能力 | 位置 | 状态 |
| --- | --- | --- |
| 每轮 usage 采集 | `src/main/engine/stream/agent-loop-executor.ts` `syncAccumulatedUsage`/`syncLastTurnUsage`(约 :381) | ✅ 已通,input/output/total |
| usage 持久化 | assistant `ChatMessage.usage` + session meta(`src/main/stores/sessions.ts:364` `updateSessionTokenUsage`) | ✅ 随 JSONL 落盘 |
| 模型单价 | `ModelCapabilityEntry.pricing { input, output, cacheRead, cacheWrite }` USD/1M,models.dev 刷新,存 settings.json(`packages/onething-runtime/src/providers/model-registry.ts:674`) | ✅ 数据现成,无人消费 |
| 来源渠道 | 命令链 `channel?: string`('ipc' \| 'telegram' \| 'cli' \| 'api')+ `origin?: MessageOrigin`(`src/shared/events/session-commands.ts`) | ✅ platform 标签可直接派生 |
| 批量记账先例 | goals 域 per-turn recordUsage → 内存累计 → 事件 flush(`src/main/goals/`) | ✅ 模式可复用 |
| server 端点 | `/api/chat/token-usage`、`/api/providers/:id/usage`(`apps/server/src/http.ts:238,366`) | ✅ 可扩展 |

## 缺口

1. **共享 usage 形状缺 cache/reasoning 字段**。`cachedInputTokens`/`reasoningTokens` 只在 codex provider 内部(`packages/onething-runtime/src/providers/codex.ts:394`),未上抛。claude/claude-code 已开 promptCaching,Anthropic cache write 1.25x、read 0.1x,不采集就算错。
2. **没有成本计算**:pricing × usage 从未发生。
3. **没有可聚合账本**:usage 散在 session 消息里,跨会话聚合需全量扫(302MB/1.4s,不可行)。
4. **副线 LLM 调用是计量盲区**:evals adapter(`src/main/ipc/evals-provider-adapter.ts`)确认直调;标题生成、memory review 等后台调用需在实施时逐一审计接入。

## 账本 Schema

`~/.onething/usage/usage-YYYY-MM.jsonl`,append-only,每次 provider 请求(每轮)一条:

```jsonc
{
  "ts": 1770000000000,
  "sessionId": "…",            // 副线调用可为 null
  "providerId": "claude-code",
  "modelId": "claude-fable-5",
  "platform": "electron",       // 来源渠道: electron | telegram | wechat | cli | api | server
  "source": "chat",             // 调用类别: chat | title | memory | goal | evals | …
  "billing": "subscription",    // 'api' = 真实计费 | 'subscription' = 订阅折算(官方 API 价)
  "usage": {
    "input": 1200, "output": 350,
    "cacheRead": 8000, "cacheWrite": 0,
    "reasoning": 120, "total": 9550
  },
  "unitPrice": { "input": 3, "output": 15, "cacheRead": 0.3, "cacheWrite": 3.75 }, // USD/1M,写入时快照
  "costUSD": 0.0091,
  "partial": false              // abort 导致 usage 不完整时标 true
}
```

设计要点:

- **写入时快照单价**:价格日后变动不影响历史账;保留原始 tokens 仍可重算。
- **订阅折算**:`billing: 'subscription'` 条目用同模型官方 API 单价算 `costUSD`,UI 必须带"订阅折算"标签,不与真实开销混同相加(汇总时分列)。models.dev 单价为 0 且非订阅时 `costUSD: null`,UI 显示 "—",绝不显示 $0.00。
- **成本公式**:`(input − cacheRead) × p.input + cacheRead × p.cacheRead + cacheWrite × p.cacheWrite + output × p.output`,除以 1M。注意各 provider 的 input 口径不同(Anthropic 的 input_tokens 不含 cache 部分,OpenAI 的 prompt_tokens 含 cached_tokens),归一层负责统一为"input 含 cacheRead、cacheWrite 单列"的口径。
- **重试/编辑重发照常记账**:按实际发出的请求记。
- 月度文件天然分片;不引入数据库,符合"Electron main 不加 DB"的架构约束。

## 分阶段实施

### P0 — usage 形状扩展与 per-provider 归一

- `src/shared/ipc/chat.ts` / `ui-message.ts`(TokenUsage)/ `src/shared/events/session-events.ts`:usage 增加可选 `cacheReadTokens` / `cacheWriteTokens` / `reasoningTokens`。旧数据无这些字段,读取全部按 0 处理,无迁移。
- `packages/onething-runtime/src/providers/stream-provider-adapter.ts`:新增 usage 归一层(参照附件链路的 per-provider 映射)。已知映射:
  - Anthropic:`providerMetadata.anthropic.cacheCreationInputTokens` / `cacheReadInputTokens`;
  - OpenAI/Codex:`input_tokens_details.cached_tokens`、`output_tokens_details.reasoning_tokens`(codex.ts 已解析,上抛即可);
  - DeepSeek:`prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`。
  - ⚠️ AI SDK v6 fullStream 返回 provider 原生字段名(踩过坑),映射必须逐 provider 真机验证。
- `packages/core/engine/`(stream-runtime / agent-loop-runtime)与 `src/main/engine/stream/agent-loop-executor.ts`:累计与透传扩展字段。

### P1 — 账本与 recordUsage 服务

- 纯逻辑(Electron-free)放 `packages/onething-runtime/src/usage/`:
  - `ledger.ts`:记录 shape、成本计算、月文件 append、summary 聚合;
  - 参照 memory 的 `createOnethingMemoryIpcHandlers` 工厂模式,fs/路径注入。
- 接线放 `src/main/usage/index.ts`:
  - 单一入口 `recordUsage(entry)`,内存排队 + 异步 append(参照 goals 的 batched flush);
  - 挂点 1(主链路):agent-loop 每轮 usage 回调处,ctx 里现成有 `providerConfig.model`、providerId、sessionId;platform 从命令的 `channel`/`origin` 透传(需在 ctx 上带一份);
  - 挂点 2(副线):evals adapter、标题生成、memory review 等直调点逐一接入,`source` 标类别;
  - `billing` 判定:providerId ∈ 订阅集合(codex、claude-code、copilot 及其别名)→ 'subscription',否则 'api';
  - EventBus 全局事件 `usage:recorded` 供 UI 实时刷新。
- 单价查询:`getModelById` / ModelCapabilityEntry(settings.json 缓存),miss 时 `unitPrice: null` 照记 tokens。

### P2 — 聚合、UI 与 server

- 聚合:**日桶是唯一持久化粒度**——内存内按 天 × provider × model × platform × billing 累计,`~/.onething/usage/summary.json` 缓存(记录已聚合到的文件偏移,启动增量补算,避免读全月 JSONL)。
  - week / month 视图不单独存储,查询时从日桶上卷:week 按 ISO 周(周一起始,本地时区),month 按自然月;日桶按本地时区切分(`ts` 是 epoch ms,切桶时用本地日期)。
  - 查询接口统一为 `getUsageSummary({ granularity: 'day' | 'week' | 'month', range })`,返回各桶的分维度小计,day/week/month 三种视图走同一条代码路径。
- IPC:`src/shared/ipc/channels.ts` + `src/shared/ipc/usage.ts` + `src/main/ipc/usage.ts` + `src/preload/create-api.ts`(标准四步)。
- UI:设置页新增用量面板(画线风):
  - 粒度切换:日 / 周 / 月 三档(唯一的交互控件,类似档位切换,不算违反设置页简洁原则);
  - 当期总成本(API 实付 与 订阅折算 分列,订阅条目带 platform tag 徽标);
  - 按桶条形图(日视图=近 30 天,周视图=近 12 周,月视图=近 12 个月)+ 按模型/按 platform 表格;
  - 只展示,除粒度切换外不加可调参数。
- server:`apps/server/src/http.ts` 加 `/api/usage/summary`、`/api/usage/records`(复用 adapter 模式)。

## 实施状态(2026-07-13)

- **P0 已落地**:共享 usage 形状(`AgentUsage`/`CoreAgentLoopUsage`/`TokenUsage`/`ChatMessage.usage`)扩了 `cacheReadTokens`/`cacheWriteTokens`/`reasoningTokens`;claude/codex/deepseek/openai-compatible/gemini 五个 provider 的 per-provider 归一层已接线并测试覆盖。
- **P1 已落地**:`packages/onething-runtime/src/usage/`(ledger.ts + pricing.ts + summary.ts,17 个单测)+ `src/main/usage/index.ts` 的单一 `recordUsage()` 入口,已挂在 `agent-loop-executor.ts` 的 `syncLastTurnUsage`(主聊天链路,try/catch 隔离故障不影响聊天)和 `evals-provider-adapter.ts`(evals 场景,`source: 'evals'`)。
- **P1 部分未完成 — 已知缺口**:标题生成(`packages/core/engine/core-stream-engine.ts:937`)、memory capture/review(`src/main/plugins/builtin/soul-memory.ts:560,671`)、context-compact 摘要(`src/main/engine/context-compact.ts:202`)三处后台调用都走共享的 `generateChatResponse`(`src/main/providers/index.ts:128` → `provider-facade.ts:409` → `provider-routing.ts:464 generateOnethingTextChatResponse`),该函数当前只返回 `Promise<string>`,usage 在 `generateOnethingChatResponseWithReasoning` 内部已经拿到(经由 `runUtilityAgentTurn`)却在最终返回对象里被丢弃。要接上这三处计费,需要给 `generateChatResponse` 加一个可选 `onUsage` 副信道(不改动现有 `Promise<string>` 返回契约,向后兼容),跨 provider-routing.ts/provider-facade.ts 两层线性穿透即可,不需要动 ACP/streamChatResponseWithReasoning 分支。这几处调用量相对主聊天链路很小(标题生成几十到几百 token),暂缓,风险(改动核心 provider 抽象层的通用函数)与收益不成比例,留作后续任务。
- **P2 已落地**:day/week/month 聚合(`computeOnethingUsageSummary`/`getOnethingUsageSummary`,ISO 周一起始、自然月,5 个单测覆盖跨周/跨月上卷);IPC 通道 `usage:get-summary`(channels.ts + shared/ipc/usage.ts + main/ipc/usage.ts + preload bridge.ts + renderer platformApi,electron/web 双实现);`RuntimeUsageAdapter` 加入 `packages/core/runtime-facade.ts` 的通用 facade,apps/server 接了单租户版 `/api/usage/summary`(`OnethingUsageLedger` 指向共享的 `dataRoot`,未做多租户 owner 隔离——见下方坑);设置页 `UsageSettingsPanel.vue` 挂在 GeneralSettingsTab(画线风,天/周/月切换 + API/订阅双成本 + 按模型/平台展开表,4 个组件测试)。
- **全链路已验证**:`bun run typecheck:node`/`typecheck:web` 全绿;单元测试覆盖 ledger/pricing/summary(17)+ IPC/server(47+4)+ UI(4)。

## 已知坑 / 开放问题

- **生图计费**:pricing 只有 token 维度;OpenRouter shape 有 `pricing.image` 但当前全为 '0'。生图请求先只记 tokens(costUSD: null),后续再补 per-image 价格表。
- **abort 部分 usage**:agent-loop-executor 目前只在 provider 真正发出 'finish' chunk 时才有 usage 可记;中断多数情况下 'finish' 根本不会到达,`partial: true` 字段已预留但实际很少被触发,后续如需更精细的中断记账要在 abort 路径上补一次尽力而为的 usage 快照。
- **ProviderUsageCard 语义保持**:该卡展示 Codex 官方配额、明确不含 cost(有测试锁定),新用量面板是独立组件,不动它。
- **货币**:一律 USD,不做汇率。
- **apps/server 单租户简化**:`RuntimeUsageAdapter.getSummary` 在 apps/server 的实现直接用一个进程级 `OnethingUsageLedger`,没有走已有的 per-owner/multi-tenant 隔离(`*ByOwner` map 那一套)。个人/单用户部署没问题;真要给 gateway 多用户网关做计费隔离,需要把 ledger 实例化改成按 owner 建,这块被明确列为 P3(配额)之外的范畴,未做。
- **标题生成/memory capture&review/context-compact 摘要未接账**:三处都走共享的 `generateChatResponse`(`src/main/providers/index.ts:128` → `provider-facade.ts:409` → `provider-routing.ts:464`),该函数只返回 `Promise<string>`,usage 在 `generateOnethingChatResponseWithReasoning` 内部已经算出却在返回时被丢弃。修法是给 `generateChatResponse` 加一个可选 `onUsage` 副信道(不改动现有返回契约),线性穿透 provider-routing.ts/provider-facade.ts 两层即可。这几处调用量相对主聊天链路很小,评估后判断"改动核心 provider 抽象层通用函数"的风险与"多计一点后台调用的 token"的收益不成比例,本轮暂缓。
