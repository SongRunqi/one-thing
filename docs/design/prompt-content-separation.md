# 提示词与代码分离(Prompt Content Separation)

状态:设计稿(未实施)
日期:2026-07-08
关联:`docs/design/prompt-evaluation.md`(评估体系)、`docs/superpowers/specs/2026-06-09-prompt-assembly-redesign-design.md`(装配重设计,已落地)

## 1. 背景与问题

系统提示词装配已经收口到单一装配器(`packages/onething-runtime/src/prompts/builder.ts`,配 golden 快照测试),但**提示词文本本身仍然硬编码在 `.ts` 源码里**,散落在多处:

| 类别 | 位置 | 规模 | 形态 |
|---|---|---|---|
| 记忆子任务提示词(5 段) | `packages/onething-runtime/src/plugins/soul-memory.ts` L5967 / L5981 / L6011 / L6351 / L6933 | 合计 ~1200 行,单段最大 ~580 行(capture) | 字符串数组 `.join('\n')`,**纯静态,无插值** |
| 记忆规则注入块 | `packages/onething-runtime/src/memory/workspace.ts:37` `SOUL_MEMORY_RULES_PROMPT` | 多行模板字面量 | 静态 |
| 系统提示词常量 | `packages/onething-runtime/src/prompts/system-prompt.ts`(默认 prompt / 工具准则 / 工作区规则 / known-projects 指令) | ~17 行 | 静态字符串与数组 |
| builder 内嵌短块 | `builder.ts`:voice 模式(L157 附近)、平台指令(os_darwin/win32/linux)、skills 包裹模板、AGENTS.md 包裹模板 | 各 2–15 行 | 静态为主 |
| 上下文压缩提示词 | `packages/core/engine/compact-prompt.ts` | ~22 行 | 静态指令块 + 尾部动态拼接(`messages`、`previousSummary`) |

痛点:

- 改提示词措辞的 diff 混在代码 diff 里,review 时难以看清"到底改了哪些话"。
- 大段文本让宿主文件膨胀(`soul-memory.ts` ~7600 行,其中 ~1200 行是 prompt)。
- 提示词无法被非代码工具直接消费(评估体系、文档、外部 review)。
- 字符串数组 + `.join('\n')` 的写法既不好读也不好写。

## 2. 目标与非目标

**目标**

1. 提示词文本以纯 Markdown 文件存在,一段 prompt 一个 `.md` 文件。
2. 代码只保留**组装逻辑**(条件增删 section、动态拼接),不保留文案。
3. 迁移零行为变化:装配产物逐字节一致,golden 测试兜底。
4. 三个宿主(Electron、apps/server、apps/web)与 vitest 全部继续工作,不引入构建脚本。

**非目标**

- 不迁移工具 `description`(与 schema、执行逻辑强耦合,且都是短句,就近定义更可维护)。
- 不迁移 gateway 渠道文案(`packages/gateway/src/core/`)——那是面向用户的 UX 文案,不是模型提示词,单独治理。
- 不引入模板条件逻辑(if/loop)——结构性拼接留在 TypeScript 里,模板只做纯文本 + 简单占位符替换。
- 不做 codegen(见 §7 备选方案)。
- 不在本次引入 frontmatter 元数据 / prompt 版本号(留给 prompt-evaluation 体系落地时决策,见 §8)。

## 3. 技术方案:`.md` + Vite `?raw` 导入

### 3.1 可行性依据(已核实)

所有执行路径都走 Vite/Rollup 管线,对 `?raw` 导入原生支持:

- Electron main / preload / renderer:`electron.vite.config.ts` 中三者均为 Vite 构建(main 配 `externalizeDepsPlugin`,相对路径的 `.md?raw` 是源码资产而非依赖,不受影响)。
- apps/server:`vite build --config apps/server/vite.config.ts`。
- apps/web:vite。
- 测试:vitest(vite transform 管线)。
- `tsc` 仅做 `--noEmit` 类型检查(`typecheck:node` / `typecheck:web`),只需 ambient 声明。
- bun 只用于运行 `.mjs` 脚本与 vite CLI,不直接执行含 `?raw` 的 TS 源码。

注:CLAUDE.md 技术栈表中"tsc main"的描述已过时,main 实际由 Vite 打包,迁移时顺手更正。

### 3.2 类型声明

```ts
// 放入 typecheck:node 与 typecheck:web 都能覆盖到的 d.ts(如已有全局 env.d.ts 则追加)
declare module '*.md?raw' {
  const content: string
  export default content
}
```

落地时确认 `tsconfig.node.json` 与 `tsconfig.web.json` 的 include 范围都覆盖该声明文件;若 packages 有独立 tsconfig,同样需要覆盖。

### 3.3 目录约定

每个含提示词的包内建 `content/` 目录,只放 `.md`,不放代码:

```
packages/onething-runtime/src/prompts/
├── builder.ts                  # 装配器,改为 import md(逻辑不动)
├── system-prompt.ts            # 变薄:从 content/ 导入后 re-export,保持既有导出名
├── content/                    # ← 纯提示词文本
│   ├── default-system.md
│   ├── tool-guidelines.md
│   ├── tool-workspace-rules.md
│   ├── known-projects-instructions.md
│   ├── voice-speak-mode.md
│   ├── os-darwin.md
│   ├── os-win32.md
│   ├── os-linux.md
│   ├── memory-rules.md         # ← memory/workspace.ts 迁入
│   ├── memory-review.md        # ← soul-memory.ts 五件套迁入
│   ├── memory-capture.md
│   ├── memory-dreaming.md
│   ├── memory-flush.md
│   └── memory-daily-note.md
└── tasks/
    └── index.ts                # 记忆子任务提示词的类型化出口(import ?raw + re-export)

packages/core/engine/
├── compact-prompt.ts           # 变薄:静态指令块来自 content/,动态尾部拼接留在函数里
└── content/
    └── compact.md
```

core 层不能依赖 runtime(架构边界测试强制),因此 core 自建 `content/`,与 runtime 遵循同一约定即可,不需要共享基础设施。

### 3.4 占位符与插值约定

- **本次迁移的所有 prompt 均为静态文本**(已核实:soul-memory 五件套区间内的 `${...}` 全部位于周边编排代码,不在 prompt 常量内),Phase 1–3 不需要占位符机制。
- compact prompt 的动态部分(`messages`、`previousSummary`)属于"动态尾部拼接",按"文案进 md、组装留代码"的边界,保留在 `buildContextCompactPrompt` 函数里,md 只承载静态指令块。
- 若未来出现真正需要在文案中间插值的 prompt,约定使用 `{{name}}` 占位符 + 一个严格模式的 `renderTemplate(text, params)` helper(缺参抛错),包装函数用类型签名锁定参数。**在需要之前不预先实现。**

### 3.5 换行与格式细节

- 现有字符串数组以 `.join('\n')` 拼装;迁移到 md 后用 `import raw` 的原文。注意两点,golden 对比时容易踩:
  1. md 文件末尾的换行符:编辑器通常自动补一个 `\n`,而 `.join('\n')` 结果无尾随换行。包装层统一 `raw.replace(/\n$/, '')`(或约定 md 不带尾随换行并加 lint),保证逐字节一致。
  2. 数组里的空字符串元素对应 md 里的空行,逐行核对。
- 迁移期间用一次性脚本对比"旧常量 === 新导入"逐段断言(可写成临时测试,迁完删除)。

## 4. 迁移清单(分阶段)

每个阶段独立可合入、可回滚,完成后跑 `bun run typecheck && bun run test`。

### Phase 0:基建(半小时级)

1. 添加 `*.md?raw` ambient 声明,确认两个 typecheck 配置都覆盖。
2. 建 `packages/onething-runtime/src/prompts/content/` 目录。
3. 更正 CLAUDE.md 技术栈表中 "tsc main" 的描述。

### Phase 1:soul-memory 五件套 + 记忆规则(收益最大)

1. 从 `plugins/soul-memory.ts` 抽出五段常量为五个 `.md`(见 §3.3 文件名)。
2. 新建 `prompts/tasks/index.ts`:`import raw from '../content/memory-review.md?raw'` 并以原常量名导出(`CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT` 等)。
3. `plugins/soul-memory.ts` 改为从 `../prompts/tasks` import,并**保留原名 re-export**——下游引用不破:
   - `src/main/plugins/builtin/soul-memory.ts`(import CORE_ 常量)
   - `src/main/plugins/__tests__/core-soul-memory.test.ts`
   - `packages/onething-runtime/src/memory/flush.ts`
4. `memory/workspace.ts` 的 `SOUL_MEMORY_RULES_PROMPT` 同法迁入 `content/memory-rules.md`,原位置保留 re-export(下游:`memory/prompt-context.ts`、`src/main/memory/workspace.ts`)。
5. 临时等价断言测试(§3.5)通过后删除。

预期效果:`soul-memory.ts` 瘦身约 1200 行;提示词可独立 review。

### Phase 2:系统提示词短块

1. `prompts/system-prompt.ts` 四个常量迁入 `content/`。注意 `ONETHING_TOOL_GUIDELINES` / `ONETHING_TOOL_WORKSPACE_RULES` 目前是**数组**——先确认消费方是否依赖数组形态:
   - 若消费方只是 join 后进文本,md 化为 bullet list,导出改为字符串,消费方同步调整;
   - 若确有逐条编程消费,保留数组导出,md 每行一条、包装层 split。
2. `builder.ts` 内嵌块迁入 `content/`:`VOICE_SPEAK_MODE`、三段平台指令、默认 fallback(L132)。skills/AGENTS.md 的 XML 包裹模板属于组装结构,含插值且逐行拼接,**留在代码里**。
3. golden 快照(`prompts/__tests__/golden/*.md`)应零 diff;有 diff 即为迁移错误。

### Phase 3:core 层 compact prompt

1. 建 `packages/core/engine/content/compact.md`,承载静态指令块。
2. `compact-prompt.ts` 变薄:import md + 动态尾部拼接。
3. 确认 `packages/core/__tests__/architecture-boundaries.test.ts` 通过(core 无新增对 runtime 的依赖)。

### Phase 4(后续,不在本次范围)

- frontmatter 元数据(id/version/description/token budget)与 `getPromptVersion()` 版本体系对接——依赖 prompt-evaluation 落地节奏。
- 为 `tasks/` 下每段子任务 prompt 补 golden 快照与 token 预算断言(复制系统提示词已有范式)。

## 5. 测试与回归策略

- **既有兜底**:`prompt-golden.test.ts`(系统提示词逐字节)、`builder.test.ts`、`core-soul-memory.test.ts`、架构边界测试。
- **迁移期专用**:每段 prompt 的"旧常量 === 新导入"等价断言(临时,迁完删)。
- **验收命令**:`bun run typecheck && bun run test && bun run build:check`。
- HMR:dev 下 vite 对 `?raw` 资产的修改会触发热更新,改 md 即时生效,无额外配置。

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| md 尾随换行 / 空行导致产物不一致 | §3.5 归一化 + 等价断言测试 |
| 某个消费路径不走 Vite(未来引入) | 届时切换到 codegen 方案(§7),content/ 目录与文件不变,只换消费方式 |
| tsconfig include 漏掉 d.ts 导致 typecheck 报错 | Phase 0 单独验证两个 typecheck 命令 |
| 下游 import 断裂 | 所有原导出名保留 re-export;grep 验证无遗漏 |

## 7. 备选方案(记录取舍)

- **codegen(md → `.gen.ts`)**:构建脚本把 content/*.md 编译成生成的 TS 常量,生成物入库 + CI staleness 校验。对任意消费方(bun 直跑、node 直跑)都健壮,但多一层构建环节与心智负担。当前所有消费方都是 Vite,不需要;若未来出现非 Vite 消费方再切换,content/ 资产可原样复用。
- **运行时 `fs.readFile`**:直接排除——apps/web 是浏览器环境无文件系统;Electron 打包需要 extraResources 配置与 dev/prod 路径分叉;还引入异步初始化。
- **保持 TS、仅拆纯 prompt 模块**:最省事,但达不到"代码与提示词分离"的目标(diff 混杂、非代码工具不可消费),仅作为中间态无长期价值。

## 8. 与 prompt-evaluation 体系的衔接

`docs/design/prompt-evaluation.md` 规划了 prompt 版本号 + 在线信号采集 + golden/token 预算。本方案是它的前置整备:提示词集中为纯文本资产后,版本号可以直接由 content/ 文件内容 hash 派生,fixture 导出与离线评估可以直接读取 md 而不必执行代码。Phase 4 的 frontmatter 决策届时一并做。
