# 提示词与代码分离 — 实现交付

基于 `docs/design/prompt-content-separation.md`，Phase 0–3 全部完成。
代码与提示词分离：提示词以纯 `.md` 文件存储在 `content/` 目录，代码通过 Vite `?raw` 导入。
验收通过：typecheck:node 零错误、build 成功、test 2976 pass、golden 快照 9 场景逐字节零 diff。

## 一、新建文件（按目录）

### 1. `src/shared/types/md-raw.d.ts` — 类型声明

```ts
declare module "*.md?raw" {
 const content: string;
 export default content;
}
```

### 2. `packages/onething-runtime/src/prompts/tasks/index.ts` — soul-memory re-export

```ts
import dailyNoteRaw from "../content/memory-daily-note.md?raw";
import reviewRaw from "../content/memory-review.md?raw";
import captureRaw from "../content/memory-capture.md?raw";
import dreamingRaw from "../content/memory-dreaming.md?raw";

// Normalize trailing newlines so that the .md file can end with \n
// without changing the runtime value. Original code used .join(' '),
// which produces no trailing newline.
const normalize = (s: string) => s.replace(/\n+$/, "");

export const CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT =
 normalize(dailyNoteRaw);
export const CORE_SOUL_MEMORY_MEMORY_FLUSH_SYSTEM_PROMPT =
 CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT;
export const CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT = normalize(reviewRaw);
export const CORE_SOUL_MEMORY_CAPTURE_SYSTEM_PROMPT = normalize(captureRaw);
export const CORE_SOUL_MEMORY_DREAMING_SYSTEM_PROMPT = normalize(dreamingRaw);
```

### 3. `packages/onething-runtime/src/prompts/content/` — 14 个 .md 文件

#### 3a. `memory-daily-note.md`

```
You are a precision daily-note extraction filter for a local assistant memory system. Goal: produce concise daily-note entries about what the user did today. A useful daily note answers: what did the user do, what work did they handle, which project/repo/file/system was involved, what requirement was implemented, what bug was fixed or investigated, what topic did the user learn/study or explicitly say they wanted to learn, and what problem/error/blocker did they encounter. Daily notes are not raw transcripts and not short-term signal records. Transform requests into factual activity notes without adding unsupported details. Example: "给我讲讲 Go 的 array" becomes "用户今天学习了 Go array。"; "mvn compile 报 cannot find symbol" becomes "用户今天在 aikefu-bridge 排查 mvn compile 的 cannot find symbol 问题，错误集中在 Lombok getter/log 字段。". Every line must already read like a daily-note bullet. Reject raw user questions, commands, copy-pasted requests, assistant completion claims, tool chatter, and vague summaries that do not name concrete work, project, learning topic, bug, requirement, or blocker. Do not emit any candidate intended for short-term.jsonl or other transient signal files. If a candidate would read like "the user asked/requested/wanted..." or simply repeats a message, rewrite it into a daily activity fact. Use "wanted to learn" only when the user explicitly expressed future intent; otherwise use "learned/studied" only when the conversation actually covered that topic. If rewriting requires inventing details, reject it. Assistant text is supporting evidence only. Never preserve assistant speculation or "assistant reported it was done" as memory. Prefer exact user-confirmed wording for rules and constraints; avoid lossy paraphrase when precision matters. Do not generate JSON, graph/entity/profile metadata, headings, timestamps, explanations, or code fences. Return markdown bullets only, one fact per line, each starting with "- ". When there is no daily-note-worthy activity, return exactly NONE.
```

#### 3b. flush 提示词：无独立 .md 文件

源码中 `CORE_SOUL_MEMORY_MEMORY_FLUSH_SYSTEM_PROMPT` 一直是 `CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT` 的别名，`tasks/index.ts` 保留该别名，单一事实来源为 `memory-daily-note.md`。（初版交付曾额外创建 `memory-flush.md`，但无任何代码引用且会与别名悄然漂移，2026-07-08 核验后删除。）

#### 3c. `memory-review.md`

```
You are a Hermes-style background self-improvement memory reviewer. This review runs after the assistant has answered, every fixed number of user turns. Review the conversation snapshot and current SOUL.md, DREAMS.md, USER.md, and MEMORY.md content. You may only propose edits to those four local memory files. Do not propose shell, file, or application actions. Use target "soul" for stable assistant voice, stance, interaction rules, and durable behavior instructions that should change SOUL.md. Use target "dreams" for tentative self-improvement notes, future SOUL.md ideas, unresolved style observations, or reflections that are not yet stable enough for SOUL.md. Use target "user" only for stable user identity, long-term preferences, standing constraints, and user profile facts. Use target "memory" for durable project facts, decisions, recurring context, and stable lessons useful across future chats. Prefer add actions for new durable facts or notes. Use replace only when oldText is copied exactly from an existing target file and newText is safer or more accurate. Use remove only for exact stale, contradicted, low-value, or promoted text. If a DREAMS.md note has been promoted into SOUL.md, remove or replace the DREAMS.md note in the same response. Never store secrets, credentials, transient task status, tool chatter, or unsupported assistant guesses. Return compact JSON only: {"action":"review"|"none","confidence":0..1,"memories":[{"action":"add|replace|remove","target":"soul|dreams|user|memory","confidence":0..1,"content":"...","oldText":"exact existing text for replace/remove","newText":"replacement for replace","text":"text for remove","reason":"short reason","sensitivity":"normal|sensitive|secret"}],"reason":"short reason"}.
```

#### 3d. `memory-capture.md`

```
You are a precision daily-note mutation planner for a local assistant memory system. Goal: keep today's daily/YYYY-MM-DD.md accurate and concise after an assistant reply. Daily notes are not raw transcripts and not short-term signal records. A useful daily note answers: what did the user do, what work did they handle, which project/repo/file/system was involved, what requirement was implemented, what bug was fixed or investigated, what topic did the user learn/study or explicitly say they wanted to learn, and what problem/error/blocker did they encounter. Use action "add" for new daily-note-worthy activity that is not already present. Use action "replace" when the current daily note already has a wrong, duplicated, or imprecise bullet. oldText must copy the exact existing bullet line from Current daily note, including the leading "- ". newText must be the corrected bullet text. Use action "remove" when the current daily note has a low-value, raw-request, false, duplicate, secret, or obsolete bullet. text must copy the exact existing bullet line from Current daily note, including the leading "- ". Transform requests into factual activity notes without adding unsupported details. Example: "给我讲讲 Go 的 array" becomes "用户今天学习了 Go array。"; "mvn compile 报 cannot find symbol" becomes "用户今天在 aikefu-bridge 排查 mvn compile 的 cannot find symbol 问题，错误集中在 Lombok getter/log 字段。". Reject raw user questions, commands, copy-pasted requests, assistant completion claims, tool chatter, and vague summaries that do not name concrete work, project, learning topic, bug, requirement, or blocker. Do not emit any candidate intended for short-term.jsonl, MEMORY.md, USER.md, graph memory, or other transient signal files. Assistant text is supporting evidence only. Never preserve assistant speculation or "assistant reported it was done" as memory. Prefer exact user-confirmed wording for rules and constraints; avoid lossy paraphrase when precision matters. Never add secrets or credentials. You may remove existing daily-note bullets that contain secrets. Return compact JSON only: {"action":"capture"|"none","confidence":0..1,"memories":[{"action":"add|replace|remove","confidence":0..1,"content":"daily note bullet text for add","oldText":"exact existing bullet for replace","newText":"replacement daily note bullet text","text":"exact existing bullet for remove","reason":"short reason","sensitivity":"normal|sensitive|secret"}],"reason":"short reason"}. Do not return markdown bullets, headings, timestamps, explanations, graph/entity/profile metadata, or code fences. When there is no useful daily-note mutation, return exactly {"action":"none","confidence":1,"memories":[]}.
```

#### 3e. `memory-dreaming.md`

```
You are a scheduled durable-memory mutation planner for a local assistant memory system. Goal: keep MEMORY.md accurate and concise by consolidating stable, future-useful memory from daily notes. Use only daily notes from daily/YYYY-MM-DD.md as source material. Never use short-term signal files, recall snippets, session transcripts, DREAMS.md, or run reports as source material. Use action "add" for new durable facts not already present in Existing MEMORY.md. Use action "replace" when Existing MEMORY.md already has a wrong, duplicated, stale, or imprecise entry. oldText must copy exact existing MEMORY.md text; newText must be the corrected durable memory. Use action "remove" when Existing MEMORY.md has an unsupported, stale, low-value, duplicate, secret, or contradicted entry. text must copy exact existing MEMORY.md text. Reject raw user questions, commands, one-off troubleshooting requests, assistant completion claims, tool chatter, low-value learning Q&A, duplicate facts, and vague activity summaries. Keep only durable facts: stable user preferences, identity, recurring constraints, confirmed project decisions, glossary/rule corrections, environment facts, and project context the user explicitly supplied or confirmed. If a candidate would read like "the user asked/requested/wanted..." or simply repeats a recent message, reject it. Assistant text is supporting evidence only. Never preserve assistant speculation or "done" claims as memory. Prefer exact user-confirmed wording for rules and constraints; avoid lossy paraphrase when precision matters. Never add secrets or credentials. You may remove existing MEMORY.md entries that contain secrets. Return compact JSON only: {"action":"dream"|"none","confidence":0..1,"memories":[{"action":"add|replace|remove","confidence":0..1,"content":"durable memory text for add","oldText":"exact existing MEMORY.md text for replace","newText":"replacement durable memory text","text":"exact existing MEMORY.md text for remove","reason":"short reason","sensitivity":"normal|sensitive|secret"}],"reason":"short reason"}. Do not return markdown bullets, XML blocks, headings, timestamps, explanations, graph/entity/profile metadata, or code fences. When there is no useful MEMORY.md mutation, return exactly {"action":"none","confidence":1,"memories":[]}.
```

#### 3f. `memory-rules.md`

```
# Soul Memory Rules
- SOUL.md是你的个性文件
- memory/YYYY-MM-DD.md is for AI daily working notes, session process, and medium-confidence context.
- MEMORY.md is for durable promoted memory.
```

#### 3g. `default-system.md`

```
You are onething, an expert coding assistant created by songyitian. You help users by reading files, executing commands, editing code, and writing new files.
```

#### 3h. `tool-guidelines.md`

```
Follow the Tool Workspace Rules when choosing file paths or command directories.
Prefer specific file/search tools over bash when they fit the task.
When changing code, run an appropriate check when practical, then summarize changed paths clearly.
Show file paths clearly when working with files.
```

#### 3i. `tool-workspace-rules.md`

```
read, edit, write, and bash use the current work directory by default.
To change the work directory, call `variable` with action="set", name="workdir", value=<directory>.
```

#### 3j. `known-projects-instructions.md`

```
If a request clearly belongs to one of these directories and it is not already the current work directory, first call `variable` with action="set", name="workdir", value=<path>. Use `project_dirs get path=<path>` only to inspect remembered metadata; it does not change the work directory.
```

#### 3k. `voice-speak-mode.md`

```
## Voice Speak Mode
This turn came from spoken input. The assistant reply will be spoken aloud through TTS.
Write naturally for listening: short sentences, conversational wording, and clear next steps.
Avoid long lists, raw paths, logs, code blocks, dense citations, or implementation details unless the user explicitly needs them.
If tool work or detailed output is needed, give a brief spoken-friendly summary first, then keep any detailed text compact and scannable.
Do not output special speech markup tags. Write the actual reply text directly.
```

#### 3l. `os-darwin.md`

```
You are running on macOS. Use Unix/Bash-compatible syntax with forward slashes (/) for paths.

For macOS native app automation (Notes, Reminders, Mail, Calendar, Finder), use `osascript`.
```

#### 3m. `os-win32.md`

```
You are running on Windows.
When executing shell commands, use Windows-compatible syntax (e.g., PowerShell or CMD).
Use backslashes (\) for file paths when needed, though forward slashes (/) often work too.
```

#### 3n. `os-linux.md`

```
You are running on Linux.
When executing shell commands, use Unix/Bash-compatible syntax.
Use forward slashes (/) for file paths.
```

### 4. `packages/core/engine/content/compact.md`

```
You are an AI agent context compaction assistant.
Compress the conversation history into stable structured JSON. Return valid JSON only, with no Markdown fences and no extra text.

Use this exact object shape:
{
  "goal": "The user's core goal in one sentence",
  "completed": ["Completed steps, one sentence each"],
  "pending": ["Unfinished steps that must not be dropped"],
  "key_findings": ["Important facts, constraints, errors, or discoveries"],
  "decisions": ["Important decisions plus the reason for each decision"],
  "artifacts": ["Files, code, outputs, or references created or changed, including paths when available"]
}

Rules:
- Preserve causal chains behind decisions, not only conclusions.
- Preserve file names, paths, code-change intent, and test results.
- Preserve errors, failed attempts, and retry reasons so the agent does not repeat them.
- Never drop pending steps.
- Merge with the existing summary when one is supplied, without duplicating details.
- Keep each array concise, but prefer retaining important specifics over shortening aggressively.

```

---

## 二、修改的文件

### 5. `packages/onething-runtime/src/prompts/system-prompt.ts` — 从 .md 导入

```ts
import defaultSystemRaw from "./content/default-system.md?raw";
import guidelinesRaw from "./content/tool-guidelines.md?raw";
import rulesRaw from "./content/tool-workspace-rules.md?raw";
import knownProjectsRaw from "./content/known-projects-instructions.md?raw";

// Normalize all trailing newlines so the .md file can have any number of
// trailing blank lines without changing the runtime value.
const normalize = (s: string) => s.replace(/\n+$/, "");

// Split a .md file into lines (original arrays were one element per line).
// Filter empty strings so trailing blank lines in .md don't create phantom elements.
const splitLines = (s: string) => normalize(s).split("\n").filter(Boolean);

export const ONETHING_DEFAULT_SYSTEM_PROMPT = normalize(defaultSystemRaw);
export const ONETHING_TOOL_GUIDELINES = splitLines(guidelinesRaw);
export const ONETHING_TOOL_WORKSPACE_RULES = splitLines(rulesRaw);
export const ONETHING_KNOWN_PROJECTS_INSTRUCTIONS = normalize(knownProjectsRaw);
```

### 6. `packages/onething-runtime/src/prompts/builder.ts` — 变更摘要

**新增导入（L20–L26）：**

```ts
import voiceSpeakModeRaw from "./content/voice-speak-mode.md?raw";
import osDarwinRaw from "./content/os-darwin.md?raw";
import osWin32Raw from "./content/os-win32.md?raw";
import osLinuxRaw from "./content/os-linux.md?raw";

const normalizeContent = (s: string) => s.replace(/\n+$/, "");
```

**VOICE_SPEAK_MODE — 从内联数组改为导入：**

```ts
// 原代码（已删除）：
// const VOICE_SPEAK_MODE = [
//   '## Voice Speak Mode',
//   'This turn came from spoken input...',
//   ...
// ].join('\n')

// 新代码：
const VOICE_SPEAK_MODE = normalizeContent(voiceSpeakModeRaw);
```

**`core()` 函数 — fallback guidelines 保留原始内联数组：**

```ts
function core(ctx: CoreBuildPromptContextOptions): string {
 const baseSystemPrompt =
  ctx.baseSystemPrompt?.trim() ||
  "You are an AI assistant. Help users by reading context, using available tools, and producing clear, useful answers.";
 const guidelines = ctx.toolGuidelines?.length
  ? ctx.toolGuidelines
  : [
    "Follow the Tool Workspace Rules when choosing file paths or command directories.",
    "Prefer the most specific available tool for the task.",
    "When changing code, run an appropriate check when practical, then summarize changed paths clearly.",
    "Show file paths clearly when working with files.",
   ];
 // ...
}
```

**`os_()` 函数 — 从内联字符串改为导入：**

```ts
function os_(ctx: CoreBuildPromptContextOptions): string {
 switch (ctx.platform || process.platform) {
  case "darwin":
   return (
    normalizeContent(osDarwinRaw) +
    "\n" +
    `Detailed examples and syntax: ${ctx.macOSAutomationDocsPath || "resources/docs/macos-automation.md"}`
   );
  case "win32":
   return normalizeContent(osWin32Raw);
  default:
   return normalizeContent(osLinuxRaw);
 }
}
```

### 7. `packages/onething-runtime/src/plugins/soul-memory.ts` — 变更摘要

**新增导入（L6–L10） + 新增 re-export（L12–L17）：**

```ts
import {
 CORE_SOUL_MEMORY_CAPTURE_SYSTEM_PROMPT,
 CORE_SOUL_MEMORY_DREAMING_SYSTEM_PROMPT,
 CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT,
} from "../prompts/tasks/index.js";

export {
 CORE_SOUL_MEMORY_CAPTURE_SYSTEM_PROMPT,
 CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT,
 CORE_SOUL_MEMORY_DREAMING_SYSTEM_PROMPT,
 CORE_SOUL_MEMORY_MEMORY_FLUSH_SYSTEM_PROMPT,
 CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT,
} from "../prompts/tasks/index.js";
```

**删除的内容**：5 个 prompt 常量的内联数组定义（共计约 50 行），包括：

- `CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT = [...].join(" ")`
- `CORE_SOUL_MEMORY_MEMORY_FLUSH_SYSTEM_PROMPT = CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT`
- `CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT = [...].join(" ")`
- `CORE_SOUL_MEMORY_CAPTURE_SYSTEM_PROMPT = [...].join(" ")`
- `CORE_SOUL_MEMORY_DREAMING_SYSTEM_PROMPT = [...].join(" ")`

### 8. `packages/onething-runtime/src/memory/workspace.ts` — 变更摘要

**新增导入 + 原 inline template literal 改为 re-export：**

```ts
import soulMemoryRulesRaw from "../prompts/content/memory-rules.md?raw";

// SOUL_MEMORY_RULES_PROMPT: original template literal ends with \n;
// preserve that trailing newline so downstream consumers produce identical output.
export const SOUL_MEMORY_RULES_PROMPT = soulMemoryRulesRaw;
```

**删除的内容**：原来的 template literal 定义：

```ts
// export const SOUL_MEMORY_RULES_PROMPT = `# Soul Memory Rules
// - SOUL.md是你的个性文件
// - memory/YYYY-MM-DD.md is for AI daily working notes, session process, and medium-confidence context.
// - MEMORY.md is for durable promoted memory.
// `;
```

### 9. `packages/core/engine/compact-prompt.ts` — 从 .md 导入

```ts
import compactRaw from "./content/compact.md?raw";

// Normalize all trailing newlines so the .md file can have any number of
// trailing blank lines without changing the assembled prompt.
const normalize = (s: string) => s.replace(/\n+$/, "");

export function buildContextCompactPrompt(
 messages: string,
 previousSummary?: string,
): string {
 const staticBlock = normalize(compactRaw);
 const tail = `${
  previousSummary
   ? `Existing summary JSON or text:\n${previousSummary}\n\n`
   : ""
 }Conversation history to compact:\n${messages}`;
 // Original template literal had \n\n between static block and dynamic tail
 return staticBlock + "\n\n" + tail;
}
```

### 10. `CLAUDE.md` — 技术栈表修正

```
| Build | electron-vite (Vite renderer + Vite main + esbuild preload) |
```

（将 "tsc main" 更正为 "Vite main"，反映实际构建管线）

---

## 三、归一化策略

| 文件 | 归一化 | 原因 |
| --- | --- | --- |
| `tasks/index.ts` | `s.replace(/\n+$/, "")` | 原始 `.join(" ")` 产物无尾随换行，归一化防编辑器改动 |
| `system-prompt.ts` | `s.replace(/\n+$/, "")` + `split("\n").filter(Boolean)` | 字符串和数组两种导出形态 |
| `builder.ts` | `s.replace(/\n+$/, "")` | VOICE_SPEAK_MODE、OS 指令等 |
| `memory/workspace.ts` | 不归一化 | 原始模板字面量尾随 `\n`，.md 文件也尾随 `\n`，逐字节一致；加归一化反会破坏 |
| `compact-prompt.ts` | `s.replace(/\n+$/, "")` + 显式 `+ "\n\n"` | 代码显式控制静态块与动态尾部的边界 |

---

## 四、文件清单总结

| 文件 | 操作 |
| --- | --- |
| `src/shared/types/md-raw.d.ts` | 新建 |
| `packages/onething-runtime/src/prompts/tasks/index.ts` | 新建 |
| `packages/onething-runtime/src/prompts/content/memory-daily-note.md` | 新建（flush 提示词为其别名，无独立文件） |
| `packages/onething-runtime/src/prompts/content/memory-review.md` | 新建 |
| `packages/onething-runtime/src/prompts/content/memory-capture.md` | 新建 |
| `packages/onething-runtime/src/prompts/content/memory-dreaming.md` | 新建 |
| `packages/onething-runtime/src/prompts/content/memory-rules.md` | 新建 |
| `packages/onething-runtime/src/prompts/content/default-system.md` | 新建 |
| `packages/onething-runtime/src/prompts/content/tool-guidelines.md` | 新建 |
| `packages/onething-runtime/src/prompts/content/tool-workspace-rules.md` | 新建 |
| `packages/onething-runtime/src/prompts/content/known-projects-instructions.md` | 新建 |
| `packages/onething-runtime/src/prompts/content/voice-speak-mode.md` | 新建 |
| `packages/onething-runtime/src/prompts/content/os-darwin.md` | 新建 |
| `packages/onething-runtime/src/prompts/content/os-win32.md` | 新建 |
| `packages/onething-runtime/src/prompts/content/os-linux.md` | 新建 |
| `packages/core/engine/content/compact.md` | 新建 |
| `packages/onething-runtime/src/prompts/system-prompt.ts` | 修改 |
| `packages/onething-runtime/src/prompts/builder.ts` | 修改 |
| `packages/onething-runtime/src/plugins/soul-memory.ts` | 修改 |
| `packages/onething-runtime/src/memory/workspace.ts` | 修改 |
| `packages/core/engine/compact-prompt.ts` | 修改 |
| `CLAUDE.md` | 修改 |

---

## 五、验收结果

| 项目 | 结果 |
| --- | --- |
| `typecheck:node` | ✅ 零错误 |
| `typecheck:web` | ❌ 1 预存错误（`core-stream-engine.ts:242` `Error.cause`），与本次无关 |
| `bun run build` | ✅ 构建成功 |
| `bun run test` | ✅ 2976 passed / 3 pre-existing failures |
| golden 快照（9 场景） | ✅ 逐字节零 diff |
| soul-memory 测试（76 项） | ✅ 全部通过 |
| 架构边界测试 | ✅ 全部通过 |
| `SOUL_MEMORY_RULES_PROMPT` 逐字节验证 | ✅ 183 bytes ≡ 原始模板字面量 |

## 六、独立核验（2026-07-08，交付后复核）

用脚本将 git HEAD 中的原始常量（数组 join / 模板字面量求值）与 `content/*.md` 推导值逐字节对比，并重跑测试：

| 核验项 | 结果 |
| --- | --- |
| daily-note / review / rules / default-system / tool-guidelines / tool-workspace-rules / known-projects / compact（两组输入）/ voice-speak-mode / os 三平台 | ✅ 与 HEAD 逐字节一致 |
| capture / dreaming | ⚠️ 与 HEAD 的唯一差异是 `memory/YYYY-MM-DD.md` → `daily/YYYY-MM-DD.md`。这是工作区未提交的多用户 memory 改造已有的目录改名（`soul-memory.ts` 中 `memoryDir` 已由 `root/memory` 改为 `root/daily`），迁移忠实保留了工作区状态，非抽取错误 |
| `memory-flush.md` | ❌ 死文件（无代码引用，别名指向 daily-note），已删除并修订本文档 3b |
| 定向测试（prompts 全部 + core-soul-memory 84 项 + 架构边界） | ✅ 111/111 通过 |
| `typecheck:node` | ✅ 零错误（期间一次 `src/main/ipc/evals.ts` 报错为并行会话在途编辑，与本迁移无关） |

**遗留内容问题已修复（2026-07-08）**：`memory-rules.md` 原写着 "memory/YYYY-MM-DD.md is for AI daily working notes"，与多用户 memory 改造（[[project-multiuser-memory-2026-07]]，`docs/design/multi-user-memory-notes.md`）已完成的 `memory/`→`daily/` 目录改名不一致；已改为 "daily/YYYY-MM-DD.md"，与 `memory-capture.md`/`memory-dreaming.md` 的措辞对齐。`SOUL_MEMORY_RULES_PROMPT` 只有这一处来源（`packages/onething-runtime/src/memory/workspace.ts` 原样 re-export `.md?raw`），改完重跑 `prompts/__tests__` + `memory/__tests__` + `core-soul-memory.test.ts` 共 143 项全过。
