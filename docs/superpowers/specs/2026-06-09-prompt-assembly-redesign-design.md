# Prompt 组装系统重新设计

**日期**: 2026-06-09
**状态**: 设计已确认，待写实现计划

## 背景与动机

当前 prompt 组装系统经历过两次演变：最初用 Handlebars (HBS) 模板文件组织（不喜欢 HBS 语法），期间引入了 prompt 追踪功能（segment/source/hash/reason），后来切换到 pi-agent 风格的代码字符串组装。结果是：

- **HBS 的遗留教训**：内容集中是对的，但模板语法不要。
- **追踪功能**：`segment / source / hash / reason / emittedThisTurn` 这套被判定为无价值。
- **pi-agent 代码组装**：灵活，但提示词四散，每个语义块一个独立 `formatXxx` 方法，顺序/条件埋在 `sections.push(...)` 序列里，管理麻烦。

**核心痛点**：作者不知道提示词分散在哪里，想改提示词只能问 AI。改一段文案需要在多个函数/文件之间查找。

**核心目标**：让提示词文案以「代码里的字符串」形式存在，组织成**一个文件、顶部目录、下方文案**的形态——改某段提示词只打开这一个文件、从目录定位、往下翻到对应文案即可，且改文字尽量不碰坏装配逻辑。

## 非目标（明确砍掉）

- ❌ **prompt 追踪**：`segment / source / hash / reason / emittedThisTurn` 全删，连带 `BuildPromptResult.systemPromptSegments`、`debugSections`、`PromptRequestMessage.sourceSegments`、`ChatInspectorPanel` 的按来源拆分显示。
- ❌ **增量 / 缓存**：纯性能优化，YAGNI。
- ❌ **任何模板控制流语法**（HBS / `{{#if}}` / `{{#each}}` 类）：作者明确排除。
- ❌ **block 注册表 / manifest / order 字段 / PromptBlock 接口**：设计探讨中曾提出，被否决为「机制过多、太乱」。

## 现状梳理（重构基线）

`src/main/engine/prompt/` 现有文件：

- `context.ts` — **当前活路径**。`buildPrompt` / `buildPromptSections` / `buildSystemSection` + 一串内联 `formatXxxContext` 函数 + `loadAgentsMdInstructions`。被 `stream-engine.ts:563`、`tool-loop.ts:399 & 1426`、`chat.ts:814` 调用。
- `builders.ts` — **几乎全是死代码**。`buildSystemPrompt`（仅 `message-helpers.ts` 一个 backward-compat re-export，无活调用）、`buildSkillsAwarenessPrompt / buildSkillsDirectPrompt / buildSkillsToolPrompt`（无活调用，且 `skills/prompt-builder.ts` 另有一份独立同名实现）。**唯一存活**：`buildContextCompactPrompt`（被 `context-compact.ts:228` 调用）。
- `plugin-context.ts` — 插件 prompt 片段收集，保留。
- `types.ts` — `PromptSegment`（含待删的 hash/marker/reason/emittedThisTurn）、`TemplateSkill`、`PromptActiveProject`、`PromptKnownProjects`。

当前 `buildPrompt` 行为：把所有 section 拼成**一条 system 字符串**（codex provider 例外：core 作为 `system` 消息、其余作为多条 `developer` 消息）。现状中只有「核心身份」是 `role: 'system'`，其余全部 `role: 'developer'`。

## 目标设计

### 形态：顶部目录 + 下方文案，单文件

整个系统提示词组装收敛为一个文件 `engine/prompt/system-prompt.ts`。顶部是一个组装函数（= 目录，一屏看清顺序 + 条件），下方是文案（static 为常量、dynamic 为函数）。

```ts
// engine/prompt/system-prompt.ts

export async function buildSystemPrompt(ctx: PromptContext): Promise<{ system: string; developer: string }> {
  const agents = await loadAgentsMd(ctx)        // 读文件的异步段，先 await
  const plugins = await collectPlugins(ctx)     // 插件片段，string[]

  return {
    system: CORE,                                // 仅核心身份是 system 组
    developer: join([                            // ← 目录：顺序 + 条件一屏看完
      agentPrompt(ctx),
      os(ctx),
      ctx.hasTools                 && PERMISSIONS,
      ctx.workingDirectory         && workdir(ctx),
      ctx.activeProject?.hasActive && activeProject(ctx),
      ctx.knownProjects?.hasAny    && knownProjects(ctx),
      ctx.skills.length            && skills(ctx),
      ctx.hasTools                 && toolCatalog(ctx),
      ctx.speakMode                && voiceSpeakMode(ctx),
      ctx.contextVariables?.trim() && contextVars(ctx),
      agents,
      ...plugins,                                // 插件末尾追加
    ]),
  }
}

// ───────── 文案：static 是常量 ─────────
const CORE = `You are onething, an expert coding assistant created by songyitian...`
const PERMISSIONS = `## Permission Context\n\nTool execution may require user approval...`

// ───────── 文案：dynamic 是函数 ─────────
function os(ctx: PromptContext): string {
  return ctx.os === 'macos' ? `...` : ctx.os === 'windows' ? `...` : `...`
}
function workdir(ctx: PromptContext): string {
  return `# Work Directory\nCurrent work directory: ${display(ctx.workingDirectory)}${roots(ctx)}${rules(ctx)}`
}
// roots / rules 等条件子段的文案放在同文件下方的小 helper 里
function roots(ctx: PromptContext): string { ... }
function rules(ctx: PromptContext): string { ... }
async function loadAgentsMd(ctx: PromptContext): Promise<string> { ... }  // 现有 loadAgentsMdInstructions 逻辑搬入
```

### `join` 辅助函数

```ts
function join(parts: Array<string | false | 0 | undefined | null>): string {
  return parts.filter(Boolean).map(s => String(s).trim()).filter(Boolean).join('\n\n')
}
```

`false`（来自 `cond && fn()` 短路）、`''`、`0`、`undefined` 一律被 `filter(Boolean)` 丢弃。注意 `ctx.skills.length && skills(ctx)` 在长度为 0 时返回数字 `0`，被 `Boolean` 正确过滤。

### static vs dynamic 判别

- **static**：文案不依赖 ctx → 写成常量（如 `CORE`、`PERMISSIONS`）。
- **dynamic**：依赖 ctx（插值、列表、平台分支、读文件）→ 写成函数，return 模板字符串。
- 规矩：只要分支依赖 ctx 或环境（OS 看平台、列表来自 skills），就算 dynamic；能此刻把最终文本写死的才算 static。

### Provider 分两组（不是 per-段 role）

`buildSystemPrompt` 返回 `{ system, developer }` 两个字符串：

- **system 组**：仅核心身份（`CORE`）。
- **developer 组**：其余所有段拼成的字符串。

组装到消息：

- **非 codex provider**：`system + '\n\n' + developer` 合成**一条 system 消息**（与现状一致）。
- **codex provider**：`system` 作为 system 消息、`developer` 作为 developer 消息（保留现状的两组分离行为）。

### `BuildPromptResult` 瘦身

```ts
interface BuildPromptResult {
  messages: PromptRequestMessage[]
  systemPrompt: string   // = system + '\n\n' + developer（用于 debug dump / 日志）
}
```

删除 `systemPromptSegments`、`debugSections`。`PromptRequestMessage` 删除 `sourceSegments` 字段。

### Debug dump（保留可观测性）

删追踪会丢失「这段 prompt 由谁产生」的运行时归因。零成本缓解：复用现有 `chat-logger.ts`，把 `buildSystemPrompt` 拼出的完整 `system + developer` 字符串落到日志 / 一个 debug 文件。不引入 segment/hash 机制，只 dump 完整字符串。`chat-logger.ts` 已有 `logRequestStart({ systemPrompt, systemPromptLength })`，扩展为完整 dump 即可。

## 文件结构

```
engine/prompt/
  system-prompt.ts    # ★ 顶部目录 + 下方全部文案，改 prompt 只来这里
  context.ts          # 只留 PromptContext 类型 + display() 等共享工具（或并入 system-prompt.ts）
  compact.ts          # 从 builders.ts 救出 buildContextCompactPrompt
  plugin-context.ts   # 不变
  types.ts            # 删除 PromptSegment 及追踪相关字段，保留 PromptContext / PromptActiveProject / PromptKnownProjects
  builders.ts         # 删除
```

## 受影响的调用方

- `stream-engine.ts:563`、`tool-loop.ts:399 & 1426`、`chat.ts:814` — `buildPrompt` 调用方，改用新返回结构（去 `systemPromptSegments` / `debugSections`）。
- `tool-loop.ts` ~790（`sourceSegments` 注入）、`stream-engine.ts:582-644`、`chat.ts:831-917` — 删除 segment 传递链。
- `shared/events/session-events.ts:173`、`providers/index.ts:1198/1203` — 删 `sourceSegments`。
- `renderer/components/chat/ChatInspectorPanel.vue:372-399` — 删除 `sourceSegments` 渲染块、`PromptSourceSegmentView` 类型、`openPromptSource`。
- `message-helpers.ts:402-403` — 删 `buildSystemPrompt` re-export。
- `context-compact.ts:5/228` — 改 import 到 `compact.ts`。

## 迁移阶段

1. **清理死代码**：删 `builders.ts` 的 `buildSystemPrompt` + 三套 skills 策略 + `message-helpers.ts` re-export；`buildContextCompactPrompt` 移到 `compact.ts`，更新 `context-compact.ts` 的 import。纯删除，零行为变化。
2. **抽 `system-prompt.ts`**：把 `context.ts` 的每个 `formatXxxContext` 原样迁成 `system-prompt.ts` 里的常量/函数，`buildPrompt` 改为调用 `buildSystemPrompt`。**输出字节级保持不变**，用现有 `__tests__/prompt-context.test.ts` 做回归基线（必要时补快照测试锁住完整 system + developer 输出）。
3. **删追踪**：去掉 `PromptSegment` 全链路（types / 调用方 / events / providers / ChatInspectorPanel），`BuildPromptResult` 瘦身为 `{ messages, systemPrompt }`。
4. **接 debug dump**：扩展 `chat-logger.ts` dump 完整 prompt 字符串。
5. **插件归一**：`collectPluginPromptContext` 作为 `collectPlugins(ctx)` 返回 `string[]`，在 `join` 末尾展开。

## 测试

- Phase 1：删除后跑 `bun run typecheck` + `bun run test`，确认无引用残留、无行为变化。
- Phase 2：快照测试锁住 `buildSystemPrompt` 对各种 ctx（有/无 tools、有/无 workdir、有/无 skills、各 OS、codex/非 codex）的完整输出，确认与旧 `buildPrompt` 字节一致。
- Phase 3：调整快照（结构变了但 prompt 文本应保持一致），确认渲染端 inspector 无报错。

## 已接受的代价（睁眼接受）

1. **dynamic 段文案与逻辑仍贴在一起**：带 `${}` 和三元条件的函数，改文案时会碰到逻辑。「改不坏」对 static 段 100%，对 dynamic 段只是「尽量」。这是不要 HBS 的必然代价。
2. **丢失运行时按来源归因**：inspector 不再能拆分显示某段由哪个块产生；靠读文件 + debug dump 弥补。
3. **单文件随块增长变长**：~11 块约 300 行尚可；长期块数增多时下半部分会变长卷轴，顶部目录始终干净。提示词块数量有限，短期非问题。
