# 提示词评估体系:仪器层 + 反馈循环设计方案

状态:设计稿,未实施。
日期:2026-07-07
前置阅读:`packages/onething-runtime/src/prompts/builder.ts`(被评估对象),
`packages/onething-runtime/src/prompts/system-prompt-snapshot.ts`(fixture 导出复用其上下文收集),
`docs/design/session-storage-jsonl.md`(设计文档格式参考)

---

## 1. 背景与问题

### 1.1 现状

系统提示词由单一装配器构建(`packages/onething-runtime/src/prompts/builder.ts`,
"directory at top, copy below"),各段(agent / voice / workdir / known projects /
skills / AGENTS.md / plugins)为独立函数条件拼装。已有基础设施:

- `__tests__/builder.test.ts`(73 行):3 条断言级测试,只覆盖"包含某字符串"。
- `system-prompt-snapshot.ts`(510 行)+ snapshot IPC:能把构建提示词的完整上下文收集为结构化对象,当前仅用于调试展示。

### 1.2 问题

**当前没有任何手段回答"提示词好不好"**,具体缺口分两层:

1. **工程层不可见**:改一段措辞后,最终提示词的逐字变化在 PR 里不可见;
   token 成本(装 50 个 skills 后系统提示词多大)不可观测;AGENTS.md 32KB
   字节截断可能切坏 UTF-8 多字节字符(`builder.ts` `subarray` 处)。
2. **效果层不可测**:每段指令是否真的改变模型行为,无从验证。改动只能
   "感觉上好像好了";修 A 场景弄坏 B 场景无法察觉;各 provider(Claude /
   DeepSeek / Kimi / codex)上同一提示词表现差异未知。

### 1.3 核心认知(设计讨论结论)

- snapshot 测试**不是评估**,只是变更可见性,但它是评估的前置工程(保证被评估物 = 线上物)。
- 成熟评估体系五部件缺一不可:**评估集(数据)、判定器、运行器(处理非确定性)、基线、结果留存**。
- 评估集的瓶颈是**用例来源**:必须主要来自真实使用中的失败,凭空编造的用例测的是想象中的问题。真实失败现场是易逝的,采集通路必须先于 harness 存在。
- 离线评估与在线评价是上下游:**在线负责发现问题**(真实、连续、免维护),**离线负责验证修复**(可控、可重复、可对比)。改动不能拿真实用户重放验证,发现的问题不能只靠离线考题覆盖。
- 仪器堆在一起不构成改进,还需要**诊断 → 调整 → 确认**的循环机制(失败分类账本、单假设实验、上线趋势确认)与体系自维护(用例退役、judge 校准)。

## 2. 目标与非目标

### 目标

- G1:任何提示词改动在 PR diff 中逐字可审(golden 快照),token 成本分段可观测且有上限断言。
- G2:真实失败案例可一键(或自动)固化为可重放的评估 fixture。
- G3:离线评估:固定用例 × 真实模型 × 重复 k 次,输出改动前后对比表,结果留存可追溯。
- G4:在线评价:每轮任务完成后自动汇总隐式信号,采样 LLM judge,低分自动附带 fixture。
- G5:建立每周诊断、单假设调整、上线确认的闭环,以及账本 / 实验日志两个持久 artifact。
- G6:体系自维护:饱和用例退役、judge 与人工判断的一致率复校。

### 非目标

- 不做自动提示词优化(DSPy/GEPA 式),循环中"调整"环节保持人工决策。
- 离线评估不进 CI(花钱、慢、有方差);只有 Phase 0 的快照/预算测试进 CI。
- 不做评估 dashboard;JSONL + Markdown 账本足够单人使用。
- 不评估模型/工具本身的能力缺陷(账本中归因不到提示词段落的类别,输出为结论即止)。

## 3. 体系总览

```
┌─ 仪器层 ────────────────────────────────────────────────┐
│ Phase 0 快照+预算   (CI,确定性)   提示词变成了什么样?     │
│ Phase 2 离线评估集  (手动,真模型) 改动修好了吗?           │
│ Phase 1/3 在线评价  (自动,每轮)   真实使用哪里在翻车?      │
└─────────────────────────────────────────────────────────┘
┌─ 循环层 ────────────────────────────────────────────────┐
│        收集(自动,每轮)              诊断(每周,半自动)      │
│  在线记录+隐式信号+👎 ────→ 聚类失败→归因段落→排优先级    │
│        ↑                                    ↓            │
│  确认(上线后看趋势)                  调整(每次一个假设)    │
│  同类失败率下降? ←──── 改一段→离线全量验证→合并打版本号   │
└─────────────────────────────────────────────────────────┘
┌─ 自维护 ─── 饱和用例退役 · judge 一致率复校(每月) ───────┘
```

数据存放约定:**策展物进仓库**(`evals/` 下的用例、精选 fixture、账本、实验日志),
**运行时数据进用户数据目录**(`~/.onething/evals/` 下的在线记录、自动导出 fixture)。

## 4. Phase 总览

| Phase | 内容 | 依赖 | 触发方式 | 预估 |
|---|---|---|---|---|
| 0 | golden 快照 + token 预算(工程层) | 无 | CI 每次提交 | ~半天 |
| 1 | 采集通路:fixture 导出 + 隐式信号 + 👎 | snapshot 机制(已有) | 每轮自动 | ~1 天 |
| 2 | 离线评估 harness + 首批用例 | Phase 1 攒 1–2 周 fixture | 手动 | ~1 天 |
| 3 | LLM judge(采样)+ 校准流程 | Phase 1 有真值积累 | 每轮采样自动 | ~半天+校准 |
| 4 | 循环 artifact:账本 + 实验日志 + 周节奏 | Phase 2/3 有数据 | 每周人工 | 流程性 |
| 5 | 消融开关 + 体系自维护 | Phase 2/4 稳定 | 每月人工 | ~半天 |

关键顺序约束:**Phase 1 先于 Phase 2**(用例攒不了快进,harness 随时能搭);
**Phase 3 后于 Phase 1**(judge 需要隐式信号筛选值得审的 turn + 真值校准)。
Phase 0 与 Phase 1 互相独立,可并行。

## 5. Phase 详细设计

### Phase 0:golden 快照 + token 预算(进 CI)

新增文件:

```
packages/onething-runtime/src/prompts/__tests__/
├── prompt-golden.test.ts          # 快照 + 预算断言
├── fixtures/
│   ├── scenarios.ts               # 场景矩阵定义(CoreBuildPromptContextOptions 工厂)
│   └── fake-project/              # 含嵌套 AGENTS.md 的真实小 fixture 目录
│       ├── AGENTS.md
│       └── sub/AGENTS.md
└── golden/
    ├── minimal.md                 # 每个场景一个 golden 文件,提交进仓库
    ├── desktop-full.md
    ├── codex-split.md
    ├── voice.md
    ├── agents-md.md
    ├── windows.md / linux.md
    └── _budget.json               # 分段 token 估算快照
```

要点:

- 用 vitest `toMatchFileSnapshot`;golden 用 `.md` 提交,review 看的是"模型将看到什么"。
- 场景矩阵覆盖每个条件分支:无工具无 skills / 全量桌面(工具+skills+active project+known projects)/ codex developer 拆分 / voice / AGENTS.md 嵌套 / 三平台。
- 锁死非确定输入:`now` 固定日期(builder 已支持)、`homeDir`/`platform` 走 host adapter(已支持)、AGENTS.md 指向 `fake-project/` fixture 目录(读真实 fs,比 mock 干净)、`collectPluginPromptContext` 置空。
- 预算:每段字符数 + 估算 token(chars/3.5 近似,不引 tokenizer),写入 `_budget.json` 快照;硬断言"desktop-full 总 token < 上限"与"单段不超配额"。
- 顺手修:`loadAgentsMdInstructions` 32KB 截断改为按字符边界安全截断;
  `knownProjects` 的 `as CorePromptKnownProjects` cast 收紧类型。

### Phase 1:采集通路(fixture 导出 + 隐式信号 + 👎)

**1a. fixture 导出通路。** 复用 `system-prompt-snapshot.ts` 的上下文收集,新增序列化出口:

```
packages/onething-runtime/src/evals/
├── fixture.ts                     # snapshot → eval fixture JSON(可重放 buildOnethingPrompt 的最小闭包)
└── index.ts
```

fixture 内容 = `CoreBuildPromptContextOptions` 的可序列化子集 + 当轮用户消息 +
provider/model + promptVersion。写入 `~/.onething/evals/fixtures/auto/<date>-<sessionId>-<turn>.json`。

**1b. 隐式信号汇总。** turn 结束时聚合已流经 EventBus 的事件为一条评价记录:

```
packages/onething-runtime/src/evals/turn-evaluator.ts   # 信号聚合、记录写入、judge 采样决策(Phase 3 接入)
src/main/engine/triggers/turn-evaluation.ts             # post-chat trigger 接入(同 triggers/ 现有模式)
```

信号来源(均为现有事件/命令,无新增埋点):

| 信号 | 来源 | 语义 |
|---|---|---|
| retried | `command:retry-message` | 强负 |
| editResent | `command:edit-and-resend` | 强负(没理解意图) |
| permissionDenied | permission 响应 | 负(想做用户不想要的事) |
| toolErrors | 工具执行结果 | 硬失败计数 |
| streamAborted | stream 异常收尾 | 硬失败 |
| nextTurnGap | 下轮用户消息间隔/是否新话题 | 弱正(隐性通过) |

注意 retried/editResent 发生在 turn 结束**之后**,记录采取"先落盘、后补写"策略:
turn 结束写基础记录,后续命令到达时按 turnId 回填(JSONL 场景下追加一条 amend 记录,读取时合并)。

记录写入 `~/.onething/evals/online/records.jsonl`,格式见 §6.3。

**1c. 👎 = 标记失败按钮。** 定位是一键采集失败现场的调试工具,不是统计指标。
点击 = 导出 fixture + 落一条 `explicit: "down"` 的负分记录。按 CLAUDE.md 的 IPC 四步走:
`src/shared/ipc/channels.ts` 加通道 → `src/shared/ipc/evals.ts` 类型 →
`src/main/ipc/evals.ts` handler → `src/preload/create-api.ts` 暴露;
renderer 在消息 actions 区加入口(`src/renderer/components/chat/message/`)。

**promptVersion 的定义**(打包后无 git):启动时对"固定上下文构建的骨架提示词"取
hash(即 Phase 0 的 minimal 场景输出的 sha256 前 8 位),随 app version 一并写入每条记录。
提示词常量任何变化 → hash 变化,可与仓库 commit 对照。

### Phase 2:离线评估 harness

```
evals/                             # 仓库根目录(策展物)
├── cases/
│   └── <case-id>.yaml
├── fixtures/                      # 从 auto/ 精选拷入的 fixture
├── run.mjs                        # runner:走 apps/server(:8787)或直连 runtime agent-loop
├── results.jsonl                  # 每次运行追加一行(§6.4)
├── triage.md                      # Phase 4 账本
└── experiments.md                 # Phase 4 实验日志
```

**用例三要素** = fixture(重建上下文)+ 固定用户消息 + 可判定预期。判定两档:

- 硬判定(优先):首个工具调用名/参数断言、输出含/不含某 pattern(如 voice 场景不含代码块)。
- LLM judge(兜底,软性预期):复用 Phase 3 的 judge,起步阶段可全部不用。

**单轮优先**:大部分用例判定"模型第一步意图"即结束,工具不真实执行,fixture 路径
无需真实存在。多轮用例(如"读了 SKILL.md 后是否照做")需在用例里预写工具 mock 结果,
起步阶段不做。

**runner 行为**:每条用例跑 k 次(默认 5),报每条得分(通过次数/k)与总均分;
支持 `--case <id>` 单跑、`--provider <id>` 指定 provider、`--runs <k>`;
运行结束追加 `results.jsonl` 并打印与上一条同 provider 记录的逐用例对比表。

**首批用例来源**(10–20 条即可开跑):

1. 每段提示词指令 → 一条预期行为(Known Projects 段 → "在 A 目录问 B 项目的事应先切目录";Skills 段 → "任务命中 skill 描述应 read 该 SKILL.md";Voice 段 → "无代码块、短句")。
2. Phase 1 攒到的真实失败 fixture(优先级更高,逐步替换编造用例)。

**基线要求**:每次对比至少含"改动前 vs 改动后";定期加跑一次"裸基线"
(仅 `ONETHING_DEFAULT_SYSTEM_PROMPT`,无各段)——精心设计的段落跑不赢裸基线即为废话证据。

### Phase 3:LLM judge(采样 + 校准)

```
packages/onething-runtime/src/evals/judge.ts   # judge prompt、调用(走现有 provider 体系,配置指定便宜模型)、结果解析
```

- **采样策略**:仅审"带负面隐式信号的 turn" + 随机 10%;全量不审。
- **judge 输出**:score(0–1)、category(失败归类枚举,与账本类别对齐)、reason 一句话。
- **校准流程**(上线前置):从 Phase 1 积累的可疑 turn + 👎 记录中取 ≥20 条人工标注,
  跑 judge 对比一致率;< 85% 则改 judge prompt 重测。此后分歧率纳入 Phase 5 月度复校。
- judge 结果回填在线记录的 `judge` 字段;离线 harness 的软判定复用同一 judge 实现。

### Phase 4:诊断-调整循环(流程 + artifact)

**诊断(每周,半自动)**:脚本/便宜模型读本周 `records.jsonl` 低分记录,聚类出
`evals/triage.md` 账本草稿,人工核对:

```
| 失败类别 | 本周 | 累计 | 归因段落 | 状态 |
|---|---|---|---|---|
| 没切工作目录 | 4 | 11 | Known Projects 段 | 待修 |
```

归因段落是关键列——builder 分段结构使每类失败可映射到具体段落;映射不到的类别
即"问题不在提示词"的结论。

**调整(每次一个假设)**:从账本挑一个类别 → 写下假设(改哪段、预期哪些用例分数变化)→
只改那一段 → **离线评估集全量跑**(防过拟合:目标用例升、其余不降才通过)→ 合并 →
一条记录进 `evals/experiments.md`(假设、diff 链接、离线前后分数、上线日期)。

**确认(上线后 2–3 周)**:账本该类别标"已修,观察中";按 promptVersion 前后对比在线
记录中该类别频次。降 → 关闭;未降 → 离线用例不代表真实分布,把新失败补进评估集,回到诊断。

### Phase 5:消融 + 体系自维护

- **消融开关**:builder 加 `disabledSections?: string[]`(各段已是独立函数,改动小);
  runner 支持 `--disable <section>`;完整 vs 去段的通过率差 = 该段行为贡献分,不降则删。
- **饱和用例退役**(每月):连续多轮 5/5 的用例移入"回归哨兵"组(仅全量验证时跑,
  不计主分数),主评估集始终由"当前还会失败的用例"构成。
- **judge 复校**(每月):周核对中记录的人工 vs judge 分歧率抬头即修 judge prompt。

## 6. 数据格式

### 6.1 eval fixture(`fixtures/*.json`)

```json
{
  "version": 1,
  "capturedAt": "2026-07-07T21:32:00+08:00",
  "promptVersion": "a3f2c1d8",
  "provider": "claude", "model": "...",
  "context": { "workingDirectory": "...", "knownProjects": {...}, "skills": [...],
                "toolNames": [...], "hasTools": true, "platform": "darwin", "...": "CoreBuildPromptContextOptions 可序列化子集" },
  "userMessage": "帮我把 transreader 的翻译超时改成 30 秒",
  "sessionRef": { "sessionId": "...", "turnId": "..." }
}
```

### 6.2 离线用例(`cases/*.yaml`)

```yaml
id: known-projects-switch
fixture: fixtures/2026-07-03-wrong-dir.json
userMessage: "帮我把 transreader 的翻译超时改成 30 秒"   # 省略则用 fixture 内原句
expect:
  firstToolCall: { name: switch_work_directory }
  # 或 output: { notContains: "```" } / judge: { rubric: "..." }
notes: 真实翻车 2026-07-03,原始表现为直接在 start-electron 内 edit
```

### 6.3 在线评价记录(`~/.onething/evals/online/records.jsonl`)

```jsonl
{"ts":"...","sessionId":"...","turnId":"...","promptVersion":"a3f2c1d8","provider":"claude","model":"...",
 "signals":{"retried":true,"editResent":false,"toolErrors":0,"permissionDenied":false,"streamAborted":false},
 "explicit":null,
 "judge":{"score":0.3,"category":"missed-directory-switch","reason":"..."},
 "fixtureRef":"fixtures/auto/2026-07-07-xxx.json"}
```

### 6.4 离线运行结果(`evals/results.jsonl`)

```jsonl
{"ts":"...","promptVersion":"b8e401","gitCommit":"...","provider":"claude","runs":5,
 "evalSetSize":20,"scores":{"known-projects-switch":1.0,"voice-no-codeblock":0.8},
 "mean":0.86,"disabled":[],"cost":"$0.84"}
```

## 7. 执行节奏

| 频率 | 动作 | 自动化 |
|---|---|---|
| 每次提交 | Phase 0 快照/预算测试 | CI 全自动 |
| 每轮对话 | 信号采集、记录、低分/👎 存 fixture | 全自动 |
| 每次改提示词 | 单假设 → 离线全量前后对比 → 实验日志 | 脚本跑,人判断 |
| 每周 | 聚类 → 账本草稿 → 核对、挑下一个假设 | 模型草稿,人决策 |
| 每月 | 在线趋势复盘、用例退役、judge 复校 | 手动 ~半小时 |

## 8. 风险与开放问题

- **隐式信号单条很吵**(重试可能只是换个说法):只用于聚合趋势与 judge 筛选,不对单条较真。
- **judge 未校准前分数是噪声**:校准(§Phase 3)为 judge 上线的硬前置,不可跳过。
- **方差淹没效应**:k=5 下 ±1 次仍是噪声;对比结论要求目标用例呈"稳定失败→稳定通过"
  级别的变化,微小均分差不作数。
- **fixture 序列化边界**:`CoreBuildPromptContextOptions` 含函数/宿主对象的部分
  (host adapters、plugins)需在导出时降级为静态值;plugins 段在离线重放中默认置空,
  是否需要保真重放待 Phase 2 实际用例检验。
- **多 provider 矩阵成本**:评估集 × provider 数 × k 次,起步只跑主力 provider,
  换模型时按需单跑。
- **gateway 场景**(WeChat/Telegram)的信号语义不同(无 retry 按钮),Phase 1 先只
  覆盖 Electron/desktop turn,gateway 接入待定。
