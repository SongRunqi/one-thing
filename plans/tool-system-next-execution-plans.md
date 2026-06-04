# Tool System Remaining Work Execution Plans

本文针对当前需要注意的 8 点中的 **1-7** 制定执行计划，明确排除第 8 点“实际 app smoke test”。

目标不是一次性全部实现，而是把每一项拆成可执行、可验证、可回滚的工程计划。

---

## 总体优先级

建议执行顺序：

1. **Electron test harness 修复**：先让测试基础设施稳定，否则后续改动验证成本高。
2. **权限架构上移**：这是长期架构核心，必须作为独立主任务推进，目标是把 `Permission.ask()` 从具体 tools 内部迁移到 Orchestrator / Permission Policy。
3. **session/workspace allow scope 实现**：在权限上移的 Policy 层中实现真实 scoped grants，默认 UI 仍保持 once allow。
4. **bash tree-sitter classifier**：提升 Normal 模式下 bash auto-run 的安全边界。
5. **Sensitive file policy 扩展**：风险低、收益高。
6. **Rollback UI 完善**：当前已有后端和初版 UI，可以继续打磨。
7. **read API 统一**：影响 tool schema，需要谨慎迁移。

## 必须显式纳入的主任务

### A. 权限架构上移（Phase 1-5 已落地）

这是后续所有权限工作的前置架构任务，不是可选优化。

当前状态：

```text
Orchestrator 负责调度 / barrier / queued 状态
ToolEffect / PermissionPolicy 类型与策略已落地
read/edit/write/bash 已提供 analyze(args, ctx)
MCP execution path 生成 mcp ToolEffect
PermissionPolicy 统一执行 allow / ask / deny，tool 内部不再直接调用 Permission.ask()
```

目标状态：

```text
tool args ready
→ Orchestrator analyze ToolEffect
→ build preview
→ PermissionPolicy decide allow / ask / deny
→ Orchestrator emits awaiting-permission
→ approve 后 execute
```

成功标准：

- `edit.ts` / `write.ts` / `read.ts` 不再直接调用 `Permission.ask()`。
- bash / MCP 后续也迁移到同一 policy。
- awaiting-permission 状态由 Orchestrator 明确发出，而不是 tool promise 卡住后由 UI 猜。

### B. Session / Workspace scoped grants

这个任务要和权限上移配套实现：scope grant 不应散落在 tool 内部，而应由 PermissionPolicy 统一匹配。

默认主按钮仍是 once allow；session/workspace 放在 secondary dropdown 中。

---

# 1. Permission 架构上移计划

## 当前状态

`Permission.ask()` 已从具体 tool 内部迁出：

- `src/main/tools/builtin/edit.ts`
- `src/main/tools/builtin/write.ts`
- `src/main/tools/builtin/bash.ts`
- `src/main/tools/builtin/read.ts`
- MCP execution path

当前由 `executeToolDirectly` 执行 analyze → PermissionPolicy → execute。这样 Orchestrator / backend 在工具执行前拥有：

- effect analysis
- preview
- permission decision
- awaiting-permission state
- reject/approve lifecycle

## 目标状态

引入统一三阶段工具协议：

```ts
analyze(args, ctx) -> ToolEffect
preview(args, ctx) -> ToolPreview
execute(args, ctx) -> ToolResult
```

Orchestrator 负责：

```text
parse args
→ analyze effect
→ preview if needed
→ permission policy
→ execute
→ emit authoritative status
```

Tool 内部不再直接弹 permission。

## 分阶段执行

### Phase 1: 类型与接口落地 ✅ 已完成

新增：

```text
src/main/tools/core/tool-effect.ts
src/main/tools/core/permission-policy.ts
```

定义：

```ts
type ToolEffectKind =
  | 'read'
  | 'file_edit'
  | 'file_write'
  | 'file_destructive_edit'
  | 'bash'
  | 'mcp'
  | 'external_directory'
  | 'sensitive_file_read'

interface ToolEffect {
  kind: ToolEffectKind
  resources: string[]
  barrier: boolean
  external?: boolean
  sensitive?: boolean
  metadata?: Record<string, unknown>
}
```

### Phase 2: 只接入 read/edit/write analyze ✅ 已完成

先不动 bash/MCP。

- `read.analyze`: read + sensitive_file_read / external_directory
- `edit.analyze`: file_edit / file_destructive_edit
- `write.analyze`: file_write

初期可以保留 tool 内部 `Permission.ask()`，但 Orchestrator 先记录 effect。

### Phase 3: Orchestrator 托管 permission for edit/write/read ✅ 已完成

把 edit/write/read 的 Permission.ask 从 tool 内迁出。

工具变为：

```text
preview-only logic
execute-only logic
```

### Phase 4: bash/MCP 迁移 ✅ 已完成

- bash 使用 classifier 输出 ToolEffect
- MCP 默认 `mcp` effect
- external directory 合并进统一 policy

### Phase 5: 删除 legacy permission paths ✅ 已完成

清理：

- tool 内部 Permission.ask ✅
- legacy directory-permissions fallback ✅
- bash/MCP 分散 permission ask ✅

## 涉及文件

主要：

```text
src/main/engine/stream/tool-orchestrator.ts
src/main/engine/stream/tool-execution.ts
src/main/tools/core/tool.ts
src/main/tools/core/tool-effect.ts
src/main/tools/core/permission-policy.ts
src/main/tools/builtin/read.ts
src/main/tools/builtin/edit.ts
src/main/tools/builtin/write.ts
src/main/tools/builtin/bash.ts
src/main/mcp/*
```

## 测试计划

新增：

```text
src/main/tools/core/__tests__/permission-policy.test.ts
src/main/engine/__tests__/tool-orchestrator-policy.test.ts
```

覆盖：

- Normal: read allow, edit/write ask
- Auto Accept Edits: edit/write allow, bash ask
- Danger: all allow except hard deny
- sensitive read ask
- external directory ask
- rejected barrier discards queued tail

## 验收标准

- Orchestrator 能在 execute 前知道 tool effect。
- edit/write/read permission 不再由 tool 内部直接 ask。
- 前端 awaiting-permission 只来自后端事件。
- `bun run typecheck` 通过。
- policy/orchestrator focused tests 通过。

## 风险

- 一次性迁移过大会破坏 tool execution。
- 建议 read/edit/write 先迁，bash/MCP 后迁。

---

# 2. Session / Workspace Allow Scope 实现计划（更激进版）

## 当前问题

当前主线是 Permission Mode，优点是简单，但有一个实际缺口：

- 某些 bash pattern / external directory / MCP tool 在一个 session 中会反复出现。
- 用户如果每次都点 Allow，会被打断。
- 只靠 Auto Accept Edits 不能覆盖 bash、MCP、external directory、sensitive read 等场景。
- 但直接恢复旧的 always/workdir UX 又会造成不可控授权。

因此更激进的方案是：**实现 scope 能力，但用保守 UI 暴露**。

## 目标状态

实现 first-class scoped permission grants：

```ts
type PermissionScope = 'once' | 'session' | 'workspace'
```

默认主按钮仍然是简单的：

```text
Allow / Reject / Reject with instruction
```

但在 permission panel 的 secondary menu 中提供：

```text
Allow once
Allow for this session
Allow in this workspace
```

不做全局 always。
不做复杂 Permission Center 第一版。
但必须有最小 revoke 能力。

## 设计原则

1. **scope 是真实后端能力，不只是 UI 文案。**
2. **默认仍是 once allow**，避免用户误授长期权限。
3. **session grant 随 session 生命周期存储**，跨重启可以保留在 session metadata 中。
4. **workspace grant 按 workspace / workingDirectory 绑定**，不能全局漂移。
5. **没有 global always。**
6. **hard deny 永远优先于 scope allow。**
7. **sensitive file / external directory 可单独配置是否允许 workspace grant**，初期建议 sensitive file 不提供 workspace allow。
8. **所有 grant 都写入 audit log**，便于未来做 Permission Center 或 revoke UI。

## 权限决策优先级

```text
hard deny
→ active pending reject
→ dangerous mode allow
→ scoped deny / revoke state
→ workspace grant
→ session grant
→ permission mode auto allow
→ ask
```

说明：

- hard deny 包括 `sudo`、`rm -rf /`、`curl | sh` 等。
- Dangerously Allow All 仍不覆盖 hard deny。
- Auto Accept Edits 仍只自动 file edit/write。
- scoped grants 只减少重复 ask，不改变 hard safety boundary。

## Grant key 设计

统一 key：

```ts
interface PermissionGrantKey {
  type: string
  pattern: string
  workingDirectory?: string
  toolName?: string
}
```

存储 record：

```ts
interface PermissionGrant {
  id: string
  scope: 'session' | 'workspace'
  type: string
  pattern: string | string[]
  sessionId?: string
  workspaceRoot?: string
  createdAt: number
  updatedAt: number
  createdFrom: {
    messageId: string
    toolCallId?: string
    title: string
  }
  metadata?: Record<string, unknown>
  revokedAt?: number
}
```

## 存储策略

### Session grants

存入 session metadata：

```text
SessionMeta.permissionGrants[]
```

优点：

- 跟随 session。
- 分支 session 可以选择是否复制。
- 重启后仍保留，符合用户对“this session”的直觉。

### Workspace grants

存入：

```text
~/.onething/permissions/workspace-grants.json
```

按 workspace root 分组：

```ts
Record<workspaceRoot, PermissionGrant[]>
```

workspaceRoot 必须 path.resolve 后存储。

## UI 暴露策略

### 第一版 permission panel

主按钮：

```text
Allow
Reject
Reject with instruction
```

`Allow` 仍等价 once。

旁边加一个 very subtle dropdown：

```text
▾
- Allow once
- Allow for this session
- Allow in this workspace
```

约束：

- sensitive file read：只显示 once / session，不显示 workspace。
- external directory：显示 workspace 但文案必须明确目录。
- bash：显示 pattern，例如 `git status *`。
- mcp：显示 tool name。

### 最小 revoke UI

不做完整 Permission Center，但要提供当前 session 内 revoke：

在 InputBox 附近 mode menu 中增加：

```text
Clear session grants
```

workspace grants 第一版可以只提供 Settings 中的 JSON/open folder，或命令式入口，后续再做管理 UI。

## 分阶段执行

### Phase 1: 后端 Grant Store ✅ 已完成第一阶段

新增：

```text
src/main/permission/permission-grants.ts
src/main/permission/__tests__/permission-grants.test.ts
```

实现：

```ts
addGrant(grant)
matchGrant(input)
revokeGrant(id)
clearSessionGrants(sessionId)
listSessionGrants(sessionId)
listWorkspaceGrants(workspaceRoot)
```

### Phase 2: Permission.ask 接入 scope 参数 ✅ 已完成第一阶段

扩展 response：

```ts
type Permission.Response = 'once' | 'session' | 'workspace' | 'reject'
```

当前已经有 legacy 类型，需收敛成新语义。

`respond()` 中：

- once：resolve only
- session：写 session grant + resolve
- workspace：写 workspace grant + resolve
- reject：reject

`ask()` 前：

```text
先查 grants，命中直接 allow
未命中再根据 mode 判断 auto allow
最后 emit request
```

注意：hard deny 不走 Permission.ask，应由 classifier/policy 先拒绝。

### Phase 3: IPC / command 支持 ✅ 已完成第一阶段

扩展现有：

```text
command:permission-respond
```

支持 decision：

```ts
'once' | 'session' | 'workspace' | 'reject'
```

新增 IPC：

```text
permission:list-grants
permission:revoke-grant
permission:clear-session-grants
```

### Phase 4: UI dropdown ✅ 已完成第一阶段

修改：

```text
src/renderer/components/chat/ChatPanel.vue
src/renderer/components/common/AllowSplitButton.vue
src/renderer/composables/usePermissionShortcuts.ts
```

快捷键策略：

- Enter = allow once
- Shift+Enter = allow session（可选，需避免误触）
- Esc/D = reject

### Phase 5: Workspace grant 最小管理

先不做完整 Center，只做：

- Settings Tools tab 显示 workspace grants 数量。
- 按钮：Clear workspace grants for current workspace。
- 后续再做明细列表。

## 涉及文件

```text
src/main/permission/index.ts
src/main/permission/permission-grants.ts
src/main/permission/directory-permissions.ts  // 可能逐步废弃
src/main/stores/sessions.ts
src/main/session/session.ts
src/shared/events/session-commands.ts
src/shared/ipc/channels.ts
src/preload/index.ts
src/renderer/components/chat/ChatPanel.vue
src/renderer/components/common/AllowSplitButton.vue
src/renderer/components/settings/ToolsSettingsTab.vue
src/renderer/composables/usePermissionShortcuts.ts
```

## 测试计划

新增：

```text
src/main/permission/__tests__/permission-grants.test.ts
src/main/permission/__tests__/permission-scope-flow.test.ts
src/renderer/components/chat/__tests__/permission-scope-ui.test.ts
```

覆盖：

- session allow 命中同 session。
- session allow 不跨 session。
- workspace allow 命中同 workspace。
- workspace allow 不跨 workspace。
- revoke 后立即失效。
- sensitive read 不提供 workspace allow。
- hard deny 不被 session/workspace allow 覆盖。
- Auto Accept Edits 与 session/workspace grants 优先级正确。
- `Clear session grants` 生效。

## 验收标准

- 用户可以选择 allow once/session/workspace。
- 默认 Allow 仍是 once。
- 不存在 global always。
- session grants 可清除。
- workspace grants 可最小化清除。
- hard deny 无法被 grant 绕过。
- focused tests + typecheck 通过。

## 风险与缓解

### 风险：重新引入复杂权限心智

缓解：

- 主按钮保持 Allow once。
- session/workspace 藏在 dropdown。
- 不做 always。

### 风险：workspace grant 过宽

缓解：

- pattern 必须明确展示。
- sensitive file 不给 workspace allow。
- external directory workspace grant 必须绑定具体 resolved directory。

### 风险：旧 directory-permissions 与新 grants 冲突 ✅ 已处理

处理结果：

- 新 PermissionGrantStore 统一匹配 session/workspace grants。
- 旧 directory-permissions fallback 已移除。
- `src/main/permission/directory-permissions.ts` 已删除。


---

# 3. Bash Tree-sitter Classifier 计划

## 当前问题

当前已实现 lightweight classifier：

```text
src/main/tools/core/bash-classifier.ts
```

它能分段处理 `&&`、`;`、`|`，但不是完整 shell AST。

复杂语法风险：

- subshell
- command substitution
- heredoc
- function
- nested quoting
- process substitution

## 目标状态

参考 OpenCode，引入 tree-sitter-bash：

```text
command string
→ parse shell AST
→ extract command nodes
→ classify each command node
→ aggregate allow/ask/deny
```

## 分阶段执行

### Phase 1: dependency spike

确认依赖能在 Electron/Vite/Bun 下工作：

- `web-tree-sitter`
- `tree-sitter-bash`

创建 spike：

```text
src/main/tools/core/bash-parser-tree-sitter.ts
```

只做 parse，不接执行。

### Phase 2: AST command extraction

实现：

```ts
extractBashCommands(command: string): Array<{
  text: string
  head: string
  args: string[]
  nodeType: string
}>
```

覆盖：

- simple command
- pipeline
- && / ||
- ;
- subshell
- command substitution

### Phase 3: classifier backend 可切换

当前 public API 不变：

```ts
classifyBashCommand(command)
```

内部变成：

```text
try tree-sitter
fallback lightweight parser
```

### Phase 4: external directory extraction

对以下命令做参数路径解析：

- cd
- rm
- cp
- mv
- mkdir
- touch
- chmod
- chown

把 external path 输出成 ToolEffect metadata。

## 涉及文件

```text
src/main/tools/core/bash-classifier.ts
src/main/tools/core/bash-parser-tree-sitter.ts
src/main/tools/core/__tests__/bash-classifier.test.ts
src/main/tools/builtin/bash.ts
package.json
```

## 测试计划

新增复杂 case：

```bash
(cat a && rm b)
echo $(cat secret)
cat <<EOF > file
foo
EOF
if git status; then rm x; fi
find . -name '*.ts' | xargs grep foo
```

## 验收标准

- tree-sitter 可用时用 AST 分类。
- tree-sitter 初始化失败时 fallback lightweight classifier。
- 现有 bash-classifier tests 全通过。
- 新复杂 shell tests 通过。

## 风险

- wasm bundling 在 Electron main 中可能麻烦。
- 需要先 spike，不要直接替换当前稳定实现。

---

# 4. Rollback UI 完善计划（Phase 1-2 已完成，Phase 4 局部错误文案已完成）

## 当前状态

已完成：

- audit snapshot 后端记录
- apply undo core
- `rollbackFile({ auditPath })` IPC
- completed edit/write diff card rollback action

## 当前不足

- rollback 后跨重载/跨 session 的持久状态标记仍待事件化。
- 没有全局 toast（当前已做局部 inline 错误文案）。
- 二次确认已完成。
- rollback 成功后当前 tool card 会显示“Rolled back”。
- 文件变更后的失败提示已从按钮 title 扩展为 inline error。

## 目标状态

用户在 diff card 上点击 rollback 后：

1. 二次确认。
2. 调用 hash-revalidated rollback。
3. 成功后显示“Rolled back”。
4. 失败时显示明确错误：文件之后被修改，无法安全回滚。
5. 可选：发送 session event 更新该 tool call 的 rollback metadata。

## 分阶段执行

### Phase 1: UI 状态增强 ✅ 已完成

在 `ToolStepItem.vue`：

- rollback running
- rollback success
- rollback failed
- 显示 inline status badge

### Phase 2: 二次确认 ✅ 已完成

简单 confirm：

```ts
window.confirm('Rollback this file change?')
```

后续再做 custom dialog。

### Phase 3: rollback event 持久化

新增事件：

```ts
file:rollback-applied
```

或更新 toolCall：

```ts
changes.rollbackStatus = 'applied'
changes.rolledBackAt = Date.now()
```

### Phase 4: toast ✅ 局部错误文案已完成

接入现有 notification/toast 系统；如果没有，先局部 error text。

## 涉及文件

```text
src/renderer/components/chat/ToolStepItem.vue
src/renderer/stores/helpers/tool-step-view.ts
src/shared/ipc/tools.ts
src/main/ipc/files.ts
src/main/events/*
```

## 测试计划

- 有 auditPath 时显示 rollback button。
- 无 auditPath 不显示。
- 点击成功后调用 rollbackFile。
- rollback 失败显示错误。
- 已回滚状态不再重复 rollback 或二次提示。

## 验收标准

- 用户能从 diff card 安全 rollback。
- 失败原因明确。
- rollback 状态可追踪。

---

# 5. Sensitive File Policy 扩展计划

## 当前状态

已实现第一阶段，并已完成 matcher 扩展与 read metadata 完善：

```text
src/main/tools/core/sensitive-files.ts
```

覆盖：

- `.env*`
- `.pem`
- `.key`
- `.p12`
- `.pfx`
- `.env.example` / `.env.sample` 允许
- `~/.ssh/id_*`
- `.aws/credentials` / `.aws/config`
- `.kube/config`
- `*credentials*.json`
- `*service-account*.json`
- `*token*`

## 目标状态

扩展为统一 sensitive resource policy，可用于：

- read
- edit
- write
- bash file arguments
- future ToolEffect policy

## 扩展规则

新增敏感模式：

```text
~/.ssh/id_*
.aws/credentials
.aws/config
.gcp/*credentials*.json
azure profile/token files
.kube/config
.netrc
.npmrc
.pypirc
.envrc
*.secret
*credentials*.json
*service-account*.json
```

## 分阶段执行

### Phase 1: matcher 扩展 ✅ 已完成

增强：

```ts
classifySensitiveFile(filePath)
```

输出：

```ts
{
  sensitive: boolean
  category?: 'env' | 'ssh' | 'cloud' | 'token' | 'certificate'
  reason?: string
}
```

### Phase 2: read policy 完善 ✅ 已完成

read 继续 ask，metadata 已增加 category/reason。

### Phase 3: write/edit policy 接入

编辑敏感文件应 ask，即使 Auto Accept Edits 是否放行需要产品决定。

建议初始策略：

- Normal: ask
- Auto Accept Edits: ask sensitive edits
- Danger: allow except hard deny

### Phase 4: bash path extraction 复用

bash classifier/tree-sitter 后能提取 path 时，调用 sensitive matcher。

## 涉及文件

```text
src/main/tools/core/sensitive-files.ts
src/main/tools/builtin/read.ts
src/main/tools/builtin/edit.ts
src/main/tools/builtin/write.ts
src/main/tools/core/bash-classifier.ts
```

## 测试计划

- `.env` ask
- `.env.example` allow
- `~/.ssh/id_rsa` ask
- `.aws/credentials` ask
- `service-account.json` ask
- normal json allow

## 验收标准

- sensitive matcher 有充分单元测试。
- read/edit/write 对敏感文件行为一致。
- metadata 能告诉 UI 为什么敏感。

---

# 6. Electron Test Harness 修复计划

## 当前问题

部分测试会失败：

```text
SyntaxError: Export named 'app' not found in module .../node_modules/electron/index.js
```

影响：

- provider tests
- main IPC tests
- permission tests
- broader integration tests

## 目标状态

让 main-process tests 可以稳定 mock Electron。

## 分阶段执行

### Phase 1: 定位测试环境

检查：

```text
vitest config
bun test behavior
node_modules/electron/index.js export shape
现有 setup files
```

### Phase 2: 建立 electron mock

新增：

```text
test/setup/electron-mock.ts
```

mock：

```ts
app
ipcMain
ipcRenderer
BrowserWindow
shell
dialog
nativeTheme
```

### Phase 3: 配置 alias/mock

根据 test runner 选择：

- Vitest: `vi.mock('electron', ...)`
- Bun: preload setup 或测试文件局部 mock

### Phase 4: 清理局部 workaround

让 provider/main tests 可直接运行。

## 涉及文件

```text
vitest.config.*
test/setup/electron-mock.ts
src/main/**/__tests__/*.test.ts
src/permission/__tests__/permission.test.ts
```

## 测试计划

目标命令：

```bash
bun test src/main/providers/builtin/__tests__/codex.test.ts
bun test src/main/providers/builtin/__tests__/deepseek.test.ts
bun test src/main/permission/__tests__/permission.test.ts
bun test src/main/tools/builtin/__tests__/file-revalidation.test.ts
```

## 验收标准

- 上述 Electron 相关 tests 不再因 electron import 失败。
- 不影响 packaged Electron runtime。
- focused tests + typecheck 继续通过。

## 风险

- Bun test 与 Vitest mock API 差异。
- 需要避免 mock 泄露到真实 runtime。

---

# 7. Read API 统一计划

## 当前状态

当前文件工具 API：

```ts
edit({ path, edits })
write({ path, content })
read({ path, offset, limit })
```

read/edit/write 均只接受 `path`；旧 alias 已移除。

## 目标状态

统一为：

```ts
read({ path, offset?, limit? })
```

## 分阶段执行

### Phase 1: 只保留 path schema ✅ 已完成

```ts
z.object({
  path: z.string(),
})
```

运行时直接使用 `args.path`，不再做 alias normalization。

### Phase 2: 更新 fixtures / UI helpers ✅ 已完成

全 repo 搜索：

```text
read/edit/write arguments 均使用 path
streamingArgs 包含 path
```

替换 read 示例为 `path`。

### Phase 3: 移除旧 alias ✅ 已完成

已移除 schema、registry normalization、tool implementation、UI helper fallback 和测试 fixture 中的旧 alias 主路径。

## 涉及文件

```text
src/main/tools/builtin/read.ts
src/renderer/stores/helpers/tool-preview.ts
src/renderer/stores/helpers/tool-step-view.ts
src/renderer/components/chat/ChatPanel.vue
src/main/providers/builtin/__tests__/*
src/renderer/stores/__tests__/*
docs/tools.md
```

## 测试计划

- read relative path works
- read absolute path works
- missing path is rejected
- UI preview shows filename for path
- tool schema exposes path to model

## 验收标准

- AI-facing read API 文档为 `path`。
- Typecheck 通过。
- focused renderer preview tests 通过。
- 迁移窗口结束后 repo 中无旧 path alias fixtures。

---

## 排除项：8. 实际 app smoke test

本计划按要求排除第 8 点，不展开 smoke test 计划。

---

## 完成定义

本计划文档完成后，后续执行可以按以下单位推进：

1. 先修 Electron test harness。
2. 再做 Permission 架构上移的 Phase 1。
3. 再做 bash tree-sitter spike。
4. 并行做 sensitive policy 扩展和 rollback UI polish。
5. 最后做 read API 统一与 permission scope RFC。
