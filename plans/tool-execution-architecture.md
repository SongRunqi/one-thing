# Tool Execution Architecture

## Goals

普通工具调用必须满足：

```text
一个 active tool 没有结束，下一个普通 tool 不显示、不请求权限、不执行。
```

后台服务类 bash 是例外：

```text
bash tool 完成后释放队列；后台进程进入 BackgroundJobRegistry 单独管理。
```

## Execution Lanes

```text
ExecutionCoordinator
├─ SerialForegroundQueue      // 默认普通工具
├─ ExplicitParallelGroups     // 明确并行任务
└─ BackgroundJobRegistry      // 后台 bash/service
```

## SerialForegroundQueue

默认所有普通 tool 都进入串行前台队列：

- `read`
- `grep`
- `find`
- `ls`
- `edit`
- `write`
- `bash`
- `variable`
- `time`
- `web_search`
- `project_dirs`
- MCP tools
- custom tools

规则：

```text
active 未 terminal → hidden tail 不显示、不执行
```

Terminal 状态：

```text
completed
failed
rejected
cancelled
```

## Tool State Machine

```text
hidden
→ visible
→ awaiting_permission
→ executing
→ completed

→ failed
→ rejected
→ cancelled
```

| 状态 | 显示 | 行为 |
|---|---|---|
| hidden | 否 | 已收集但没轮到 |
| visible | 是 | 当前 active tool |
| awaiting_permission | 是 | 等用户确认 |
| executing | 是 | 真正执行中 |
| completed | 是 | 成功完成 |
| failed | 是 | 工具失败 |
| rejected | 是 | 用户拒绝 |
| cancelled | 是 | 取消/中断 |

## Queue Advancement Policy

### completed

```text
active completed
→ release active
→ run next hidden tool
```

### failed

失败不终止当前 batch：

```text
active failed
→ record failed tool result
→ release active
→ continue next hidden tool
```

### rejected

拒绝终止当前 batch：

```text
active rejected
→ record rejected tool result
→ discard hidden tail
→ next AI turn with rejected result
```

### cancelled

#### 用户 stop

```text
active cancelled
→ discard hidden tail
→ stop whole response
→ no continuation
```

#### tool-level/system cancel

```text
active cancelled
→ record cancelled result
→ discard hidden tail
→ next AI turn with cancelled result
```

## When AI Receives Tool Results

AI 不会实时收到 tool result；tool result 只会在下一轮 LLM request 中进入上下文。

### failed

```text
A failed
B completed
C completed
→ batch 完成
→ next AI sees: A failed + B result + C result
```

### rejected

```text
A rejected
→ discard B/C
→ next AI sees: A rejected
```

### cancelled

```text
A cancelled
→ discard B/C
→ next AI sees cancelled
```

用户 stop 除外，不触发下一轮 AI。

## Parallel Tool Calls

普通工具不默认并行。

并行只允许显式语义：

```text
ExplicitParallelGroup
```

适用场景：

- 多 agent fanout
- 专门 batch 工具
- 明确声明的 parallel operation

UI 表现为一个 group：

```text
Using parallel agents
  - agent A running
  - agent B running
```

并行 group 不和普通 tool queue 混在一起。

## Bash Classification

### Foreground bash

例如：

```bash
npm test
bun run build
```

行为：

```text
bash active
→ queue blocked
→ command exits
→ completed/failed
→ queue continues
```

### Background bash

例如：

```bash
npm run dev &
nohup server ...
```

行为：

```text
bash active
→ shell invocation runs
→ shell exits
→ detect background process group
→ create BackgroundJob
→ bash tool completed
→ queue continues
```

后台服务继续跑，但不再占用 active tool。

## BackgroundJobRegistry

必须实现独立后台任务管理。

```ts
interface BackgroundJob {
  id: string
  command: string
  cwd: string
  shellPid: number
  pgid: number
  childPids: number[]
  status: 'running' | 'exited' | 'killed' | 'unknown'
  startedAt: number
  endedAt?: number
  logPath?: string
  ports?: number[]
}
```

功能：

- register background process group
- refresh status
- detect ports
- read/tail logs
- stop job
- cleanup on app exit

## Background Process Tracking

### Unix

每个 bash invocation 用 detached process group：

```ts
detached: true
pgid = child.pid
```

停止：

```ts
process.kill(-pgid, 'SIGTERM')
process.kill(-pgid, 'SIGKILL')
```

状态：

```bash
pgrep -g <pgid>
ps -o ...
lsof -i
```

### Windows

使用：

```bash
taskkill /F /T /PID <pid>
```

## Bash Output and Logs

### foreground bash

- output streamed to tool UI
- output accumulator handles truncation

### background bash

- startup output shown as bash result
- long-running output goes to `logPath`
- UI can show/tail logs from BackgroundJobRegistry

需要参考 Pi 的 `waitForChildProcess` 行为：

```text
child exit 后，不因后台子进程继承 stdio 而卡死
```

即：

```text
exit 后等短 grace period
destroy pipes
complete bash tool
```

## UI Rules

普通 tool list：

```text
只显示 active + settled tools
不显示 hidden tail
不显示 queued 普通工具
```

后台任务单独显示：

```text
Background services
- npm run dev
  port 8000
  running
  Stop
  Logs
```

## Implementation Components

```text
ExecutionCoordinator
  ├─ SerialForegroundQueue
  ├─ ToolRunner
  ├─ ParallelGroupRunner
  ├─ BashProcessManager
  └─ BackgroundJobRegistry
```

### SerialForegroundQueue

- collect tool calls
- publish active
- execute active
- apply terminal policy
- hide/discard tail

### ToolRunner

- analyze
- permission ask
- execute
- normalize result status

### BashProcessManager

- spawn shell
- track process group
- detect background
- stream output
- kill foreground

### BackgroundJobRegistry

- store jobs
- monitor status
- expose IPC to renderer
- stop jobs
- logs/ports

## Behavior Examples

### failed continues

```text
A read failed
B grep completed
C bash completed
→ next AI sees all three results
```

### rejected stops

```text
A read permission rejected
→ B/C hidden discarded
→ next AI sees A rejected
```

### foreground bash

```text
Using npm test
→ tests finish
→ next tool starts
```

### background bash

```text
Using npm run dev &
→ Started background service on port 8000
→ queue continues
Background panel:
  npm run dev  running  Stop
```

## Summary

```text
普通工具严格串行；
失败继续 batch；
拒绝/取消截断 batch；
并行只能显式 group；
后台 bash 从 foreground tool lifecycle 中分离出来，由 BackgroundJobRegistry 长期追踪和控制。
```
