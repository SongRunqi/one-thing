# 能力注册表:把「跳过审批的目录」收敛成一等公民

状态:设计中,未实施。阶段零(variable 审批)待开工。
日期:2026-07-15
前置阅读:`packages/core/permission/permission-policy.ts`、`packages/onething-runtime/src/variables/types.ts`

---

## 1. 背景

系统里"AI 对某个目录可以不经审批地做某事"这件事,今天散在**五个互不知道对方的地方**:

| 类别 | 现状 | 维度 | 谁声明 |
| --- | --- | --- | --- |
| app-owned 可写目录 | `configureAppOwnedWritablePaths`(2026-07-15 新增),只有 todo 一家 | 路径 | 代码 |
| safe 工具 | 17 个工具 | 工具 | 代码 |
| `read` 放行 | `permission-policy.ts` 里一行 `filter(e => e.kind !== 'read')` | 全局硬编码 | 代码 |
| 权限模式 | ToolsSettingsTab(normal / auto-accept-edits / dangerously-allow-all) | 全局 | 用户 |
| grants | 审批弹窗点"总是允许"→ `workspace-grants.json` | 路径 | 用户 |

用户的观察是对的:**不管什么场景,本质都是「app 跳过了对某个目录的某组动作的审批」**。既然是同一件事,就该有同一个表达、同一处管理、同一份审计。

## 2. 调查结论(带证据)

这一节是本文档最有价值的部分,都是实测而非印象。

### 2.1 `permissionGuard` 是标签,不是闸门

`packages/core/tools/permission-guards.ts:17-29`:`safe` / `sandboxed` / `internal-check` / `permission-gated` **四个值同时在 injectable 和 auto-execute 两个集合里**。这个字段对"要不要审批"没有任何影响,只被渲染端 `SystemPromptPanel.vue:623` 拿去显示。

真正的闸门是 `analyze?(args, ctx) → { effects, preview }`(`packages/onething-runtime/src/tools/tool.ts:146`)。**无 effect = 无审批。**

推论:`variable` 工具从不审批,不是因为它标着 `safe`,而是因为它**没有 analyze**。

### 2.2 变量系统已经是一座能力桥(而且已经在漏)

`src/main/plugins/builtin/note-skills.ts:31-41`:

```ts
getDirs: () => [store.getAiNoteDir(), store.getUserNoteDir(), store.getWorkNoteDir()],
onVariableChange: handler => getVariablesStore().subscribe(handler),
invalidateSkillsCache,
```

变量 `ai_note_dir` 决定 **SKILL.md 从哪些目录被发现**,且 `recursive: true`;变量一变,skills 缓存立即失效重扫。这不是 context 里的文本,是执行时行为。

`src/main/variables/channel-guard.ts:20-22` 已经意识到这类变量是特权,禁止外部身份(网关 IM 联系人)写它们。**但只防外部身份,不防 AI 自己。**

而 `packages/onething-runtime/src/variables/providers/notes.ts:40,48` 是 `readonly: false` + 实现了 `set()`。结合 2.1:

> **AI 今天就能零审批地执行 `variable set ai_note_dir=/anywhere`**,把递归 skill 发现根指到任意目录。
> `ai_note_dir` 默认 `~/.onething/memory`(`src/main/variables/index.ts:141-142`),既是 SOUL/MEMORY/daily 的家,又是 skill 根。

这是阶段零要堵的洞,独立于本设计的其余部分。

### 2.3 memory 不在路径这条线上

memory 走 `soul_get` / `soul_update` / `memory` / `memory_get` 四个专用工具(`packages/onething-runtime/src/plugins/soul-memory.ts:196-218`),不用 write/edit,因此不需要路径豁免。

但按第 1 节的抽象看,**这依然是"对 memory 目录跳过审批",只是用"专用工具"而非"路径白名单"来表达**。同一件事的两种衣服。是否统一,见 §7 待决。

### 2.4 grants 有 API,无 UI

`permission/index.ts:242` 响应 `'workdir'` → `addGrant({ scope: 'workspace', ... })` → 持久化到 `~/.onething/permissions/workspace-grants.json`。

`listPermissionGrants` / `revokePermissionGrant` 的 IPC 和 preload 都存在(`src/renderer/platform/web.ts:1110-1112`、`types/index.ts:616-627`),**但没有任何 .vue 消费它们**。

用户点过的每一次"总是允许",看不见、撤不掉。这是当前最大的**用户可见**缺口,也是权限设置页最该装的东西。

### 2.5 `read` 不是全放行,是黑名单

`read.ts:257` → `classifySensitiveFile()`(`runtime/tools/sensitive-files.ts:46`),`.env*` / `.ssh/id_*` / `.aws/credentials` 发 `sensitive_file_read`,**会审批**。

但不在黑名单上的一切静默可读。黑名单永远漏。

### 2.6 写在 cwd 里也是要审批的

`decidePermission` 不看 `effect.external`。normal 模式下,cwd 内的 `file_write` 同样弹审批(除非命中 grant 或 auto-accept-edits)。

**这条决定了 §5 阶段二的成本模型**:read 若与 write 完全对称,首次进仓库会炸出一串审批。

## 3. 核心不变量

> **变量对能力是只读投影;能力的变更必须经用户同意。**

变量系统天然是 AI 可写的(那是它的价值)。能力天然是特权的。桥必须单向:

- 能力 → 变量:投影(AI 看得见、用得上)✅
- 变量 → 能力:声明(AI 自己发权限)❌

否则整个权限系统被一个不返回 effect 的工具旁路。

但"❌"不等于堵死。按用户意见:**AI 可以提议,用户点同意** —— 走现有审批弹窗即可(见阶段零)。

## 4. 架构

```
CapabilityRegistry                    ← 唯一事实来源(core)
  id:         'todo.sessions'
  directory:  () => string            ← resolver,不是静态路径
  effects:    ['file_write','file_edit','file_destructive_edit']
  authority:  'builtin' | 'user'      ← AI 永远不在这个枚举里
  projectAs?: 'ai_todo_dir'           ← 可选:投影成只读变量
```

`directory` **必须是 resolver 而非静态字符串**:server 侧 todo store 是 per-owner 的(`apps/server/src/runtime.ts:1124` `todoPlanStoresByOwner`),路径随 owner 变,静态列表表达不了。

四个消费方,互不知道对方:

- **权限策略**(core)查它 → 取代 `configureAppOwnedWritablePaths`
- **变量系统**(runtime)投影成 `readonly: true` 变量
- **设置页**(宿主)读写 `authority: 'user'` 部分
- **note-skills 等**改为读 registry,而不是读变量(切断 2.2 的漏)

### 4.1 分层依据

`packages/core/__tests__/architecture-boundaries.test.ts` 守着硬约束:

```
core     ← 不许 import runtime / gateway / electron / src/main|renderer|preload
runtime  ← 可 import core;不许 electron / gateway / 宿主
gateway  ← 只许 import core
宿主      ← 最上层
```

职责是**机制 vs 产品**:

| | core | runtime |
| --- | --- | --- |
| 定位 | 不知道 onething 是什么的机器 | onething **具体**是什么 |
| 工具 | `core/tools/`:registry、effect 词汇表、guard 分类(**框架**) | `runtime/tools/builtin/`:read/write/edit/bash(**真工具**) |
| 权限 | `core/permission/`:什么是 grant、怎么裁决 | `runtime/tools/sensitive-files.ts`:哪些文件算敏感(**产品判断**) |

因此:

- **core**:capability 的类型、包含性判定、`decidePermission` 查询它
- **runtime**:注册具体能力(todo / note 目录)、投影成变量
- **宿主**:从 settings 解析真实路径、用户自定义项、IPC

样板是现成的 grants:core 定 `PermissionGrantStorage` 接口 → runtime 实现文件存储 → `src/main/permission/permission-grants.ts` 接真实路径。

## 5. 阶段

**阶段零 —— variable 加 analyze**(独立,不依赖其余部分)
能力型变量的 `set`/`delete` 返回 effect → 走现有审批弹窗;普通变量无 effect → 零摩擦,运行时状态面板体验不变。堵住 §2.2 的洞。

**阶段一 —— core 落 CapabilityRegistry**
把 `configureAppOwnedWritablePaths` 迁进去。行为不变,纯重构 + 单测。

**阶段二 —— read 接入**
read 发真 effect,走同一条链;删掉 `permission-policy.ts:88` 的硬编码特例;"cwd 内可读"变成一条 `authority: 'builtin'` 的 capability(可见、可审计、可停用);sensitive 黑名单退化成 deny capability(deny 优先)。

关键区分:**统一机制 ≠ 统一默认**。机制统一后,放行从「代码里的 filter」变成「一条能力声明」——`read` 不再是永久放行,而是被声明的、可撤的。默认值是独立旋钮,避免 §2.6 的审批爆发。

**阶段三 —— 权限设置页**
主体是 grants 审计(§2.4 的真缺口):列出 workspace/session grants、单条撤销、按目录批量撤销、全部清空。附 registry 只读展示 + 停用开关。权限模式从 ToolsSettingsTab 迁过来。

**阶段四 —— 变量投影**
registry 项投影成只读变量,AI 在 context 里看到自己有哪些目录能力。

## 6. 已知盲点

1. **过宽路径静默降级**:`isTooBroadToOwn` 拦下 `~` 后只是退回询问,无任何反馈。用户会以为配置生效了。一旦列表用户可编辑,静默失败不可接受 —— 拒绝必须可见。
2. **双编辑点漂移**:todo 目录已在 GeneralSettingsTab 可改。权限页若再放一个可改路径 = 两处编辑同一个值。主张:路径归通用设置,权限页只显示解析结果 + 豁免开关。
3. **"停用"的后果**:停掉 todo 豁免 ≠ 更安全一点,而是**每勾一个复选框弹一次审批**,功能实质报废。UI 必须直说。
4. **auto-accept-edits 下 registry 完全多余**:该模式本就放行所有 file_write/file_edit。页面须说明,否则用户改半天没效果。
5. **server / gateway 不认这张表**:`configureAppOwnedWritablePaths` 只在 `src/main` 装配一处。这是"三套独立引擎装配"的老账。
6. **符号链接**:白名单用 `path.resolve`,不解 symlink。当前需先拿到 bash 批准(bash 不吃豁免)才可利用,风险可控;开放用户自定义目录后面变大。`decidePermission` 是同步的,realpath 要 IO,且目标常常尚不存在。
7. **命名会误导**:这张表只管写(`file_write`/`file_edit`/`file_destructive_edit`),不管 bash、不管 mcp。叫"目录权限"会让用户以为整个目录给了 AI。
8. **多 profile**:多用户 memory 的 memoryScopeId / server 的 per-owner store,路径随身份变。

## 7. 已决(2026-07-15)

三项拍板,决定了阶段二/三/五的形态:

### 7.1 read 默认值:cwd 内的普通文件免审批

- cwd + `workingDirectoryRoots` 内的**非敏感**文件 → 免审批读。这是一条 `authority: 'builtin'` 的能力,在设置页可见、可停用,**而不是** `permission-policy.ts:88` 里那行硬编码 filter。
- 敏感文件(`sensitive-files.ts` 那张表)→ 仍然审批,表达为 deny 能力,deny 优先。
- cwd 之外、且不在任何 registry 能力目录内 → 审批。
- **write/edit 在 cwd 内维持现状(照旧审批)**。放宽写入是另一个量级的决定,且会让 `auto-accept-edits` 模式失去意义。

结果:`read` 不再是"永久放行",而是"被声明的放行" —— 用户诉求达成,同时不产生 §2.6 的审批爆发。

### 7.2 `authority: 'user'` 开放

用户可以自加免审批目录。因此 §6.1(过宽路径静默降级)**从"建议修"升级为阻塞项**:用户可编辑意味着拒绝必须可见,不能默默退回询问让用户以为配置生效了。

`isTooBroadToOwn` 的约束(根目录、home 本身、home 的祖先)对 user 项同样生效,且必须给出可见反馈。

### 7.3 safe 工具收编

memory 四件套(`soul_get`/`soul_update`/`memory`/`memory_get`)等本质是目录豁免的工具,改为:工具发真 effect → 策略查 registry → 命中能力则放行。

**行为不变,但从"隐式的工具属性"变成"显式的、可审计的能力声明"** —— 这正是第 1 节要的收敛。纯计算类 safe 工具(`time`/`calculator`/`fart`)不涉及文件系统,不在收编范围。

## 8. 遗留待决

- 无(见 §6 盲点,均为实施注意事项而非决策点)。
