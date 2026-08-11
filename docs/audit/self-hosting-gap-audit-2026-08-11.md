# 自举开发差距审计(用 onething 开发 onething)

2026-08-11,只读审计。服务 `docs/design/plugin-dogfooding-2026-08.md` 的最高层:
工具用自己造自己。基准 = 一场真实编码代理托管会话所依赖的能力,A-F 六维逐项
对照 onething 现状。完整逐项证据(文件:行)见审计原始报告;本文保留结论与工单。

## 一句话总判断

第一步(读代码、改文件、跑测试)今天就完全够用;**卡死在第三步 —— 派工**:
唯一派工路径 `board start` 只能给自己开工,worker 的 cwd 被无条件切到
`~/.onething/collab-rooms/<roomId>` 根本看不见仓库,跑完父会话不被唤醒,拿回的
是一条 200 字符状态行;而第二步"找出所有引用点"已经因为**桌面档没注册 Grep**
退化成 bash rg + 30KB 截断,同 run 工具轮一多还会被自动压缩**静默吞掉中间轮**
(history.ts:750 已知 P0,docs/design/history-rebuild.md:449 有修法未实施)。

## 亮点(比预期强的)

- **edit 比"先读后改"更强**:多块编辑 + 唯一性/不重叠校验 + 审批→执行间文件
  重校验(被改过要求重读)。对单会话是护栏的等价升级;对多代理并发不等价。
- **bash 后台任务**真增量分页(run_in_background + BashOutput/KillBash);超限
  自动全量落盘可续读。
- **todo-plan 是最强呈现载体**:磁盘真 markdown + ProseMirror + 独立窗,agent
  直接 read/edit,todo 目录预授权不弹框 —— 走查清单/报告的天然容器。
- **外部 agent 连接器是派工最好的地基**:claude-code-connector 真跑 CLI,cwd
  正确,协作工具经进程内 MCP 注回;CollabWorkerMindPort 单方法可换实现。
- **强制原语已存在**:插件层 tool-call-intercept(allow/block/rewrite,单次
  fail-closed)就是"验证门"的形状 —— 缺的只是 skill→intercept 的桥。

## 三疑点专项结论

1. **工具面**:精细度不缺,缺检索与 git —— Grep/Glob 实现完整但只注册在
   server 只读档,桌面等于无;git 零原语只能裸 bash(读子命令免审批是唯一照顾)。
2. **collab 当派工**:机器全造好了(spawn/任务书/并发闸/结果回投/产出采集),
   四个语义正好反着 —— assign≠launch、完成只 fold 不唤醒且不带 summary、
   worker cwd 强制群 folder、回报硬截 200 字符。全部源自"它是群聊看板"这个
   前提,每条单看都是对的产品决策。另有疑似 bug:task-requeued 不重开 worker,
   与工具描述不符。
3. **skills 承载硬约束**:承载不了 —— allowed-tools 是 UI 会骗人的装饰(被
   展示、无判定读它)、无脚本 runner、无步骤态、子文件索引了但从不告知模型。
   正解按自举纪律一:开发纪律做成**内置插件**(intercept 桥),不是给 skills
   加执行力。

## 安全债(审计顺带实锤,独立于自举也该修)

- **auto-accept-edits 可无提示写盘上任意绝对路径**:write/edit 不发
  external_directory effect(只塞 metadata),policy 的 auto-accept 分支不读
  —— 断链。P0。
- checkFileAccess 是空壳(void 掉参数直接 resolve);write/edit 连它都不走。
- 危险命令硬 deny 名单薄:git push --force / git reset --hard / 路径限定
  sudo / sh -c 包裹全落在 ask(一层弹窗深)。
- 敏感文件分类只接了 read:.env/id_rsa 可被无标记覆写、被 find 泄出。
- file-mutation 审计数据很好(sha256+全文+diff)但 bash 改文件零审计、无 UI
  无读者、密钥明文入库。

## 工单

### P0(没它没法干活)

| # | 工单 | 量级 |
| --- | --- | --- |
| 1 | Grep 进桌面全量档(实现现成,注册 + ripgrep adapter) | 小时级 |
| 2 | 项目纪律文件对齐:builder 候选名加 CLAUDE.md;32KB 上限对齐(现 41.7KB 被截);根 AGENTS.md 是 2026-05 的过期描述 | 小时级 |
| 3 | ~~派工工具(Task)~~ **已交付**(2026-08-11 批 5):builtin `task`,只进桌面全量档。`app/tasks/dispatch.ts` = createSessionWithoutFocus + `command:send-message` + 终端事件订阅;**没接 scheduler/agent-task-runner** —— 侦查发现那条链是「定时触发 agent 跑一轮」,与派工无关(见下方勘误) | 2-3 天 |
| 4 | worker cwd:任务自带 workingDirectory 时不覆盖 | 小时级 |
| 5 | ~~完成回流唤醒 + 带 summary~~ **已交付**(同批):走 `deliverInternalMessage`(即插件 sendMessage 的三态矩阵 + 链长/频率闸,现在是一本账两个租户),`triggerTurn:true` = 空闲起轮 / 在忙降级 steer。**200 字符没有被放宽,是被绕开了** —— 派工回投不经过 collab 的回报链,collab 那条截断原样保留,一个字没动 | 1-2 天 |
| 6 | 多代理写隔离:worktree-per-worker 或 file-mutation-queue 写前 stale 检查 | 2-3 天 |
| 7 | 修 run 内压缩吞工具上下文(tail 锚点改 run 起点,方案已在 history-rebuild.md:449) | 1-2 天 |
| 8 | auto-accept-edits 越界写盘洞(补发 effect 接断链) | 小时级 |

### P1(能干但痛)

9 git 脏树感知进权限卡(1-2天) · 10 boot 时 in-flight 修复扫描(1天) ·
11 危险命令 deny 补漏(半-1天) · 12 敏感文件分类接 write/edit/find(小时) ·
13 allowed-tools 真生效或摘掉(小时/1-2天) · 14 测试结果结构化面板(1-2天) ·
15 权限 grants 管理界面(IPC 全有,1天) · 16 find/grep 溢出落盘可续(小时) ·
17 修 task-requeued(小时) · 18 skill→intercept 验证门桥(2-3天)

### P2(锦上添花)

19 git diff 视图(复用 GoalReviewWorkbench 换数据源) · 20 审计 UI+undo ·
21 skill 子文件披露 · 22 plan 模式(PermissionMode 第四态) · 23 后台 bash
结束推消息 · 24 context meter 构成分解 · 25 read 支持 PDF

## 勘误(2026-08-11 批 5 实施时侦查出来的)

- **P0-3 写的「scheduler/agent-task-runner 链已具备」是错的**。
  `scheduler/agent-task-runner.ts` 干的是「到点了,把一条预设指令喂给某个 agent 跑
  一轮」—— 触发源是时间,目标是既有会话,没有「开一条新会话、跑完回来找我」这层
  语义。真正可复用的是另外四段:`createSessionWithoutFocus`(会话)、
  `command:send-message`(驱动)、`eventBus.onAny` 上的 `stream:*` 终端事件(等)、
  插件信使的投递矩阵(唤醒)。派工是把这四段接起来,不是给调度器加一个入口。
- **「工作会话不注册 task 工具」在实现上是两层**。注册表是全局的,工具的可见性
  不是 —— 但既有的可见性机制(`resolveAgentToolSurface`)是一份 **allowlist**,
  只有配了 agent 的回合才有;一条没有 agent 的派工会话拿不到它。于是新增了一条
  会话级**屏蔽**(`sessionHiddenToolIds`,agent-loop 组工具表时应用):它答的是
  「这条会话的形态决定了哪些工具在这里根本不成立」,与 agent 无关。执行时的
  `nested` 拒绝保留为兜底 —— 工具面是给模型看的,闸才是不能被绕过的。

## 与自举纪律的对账

P0 里 5 条(派工 / worker cwd / 完成唤醒 / 文件隔离 / intercept 桥)落在
纪律一第二分支:"插件 API 做不了 → 系统自己也需要 → 名正言顺的系统工程"。
它们不是为插件补的门,是 onething 自己开发 onething 第一天就会撞上的墙。
