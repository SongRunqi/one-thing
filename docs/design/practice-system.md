# 练习系统(Practice)设计 — 节律引擎 + 账本 + 隐线 UI

日期:2026-07-18
状态:P0-P5 已全部实施(实现与本文的偏差见文末「实施备注」)
UI 选型:`docs/design/practice-strip/five-options.html` **案一 · 隐线**(基线即界面)

## 1. 背景与目标

用户想要:

1. **凯格尔训练**:按「收 10″ / 放 5″ × 20 次 × 3 组」的节律引导练习,提示以音效为主(可开关)、视觉为辅。
2. **番茄钟**:开始时选分类(学习 / 看视频 / 写作…,可自定义)或起名,记录每一轮。
3. **手动补录**:程序没计时的锻炼(俯卧撑 3×20 等)也能记上,包括在聊天里对 agent 说一句就记上。
4. **AI 读出口**:agent 能查账、总结趋势、给渐进建议(收 10″→12″),但**只建议,不自动改参数**。

核心抽象:凯格尔与番茄钟是同一个东西——**相位循环计时器**(收/放 ↔ 专注/休息),
一个引擎、两份预设;**账本是系统中心**,计时器只是三个写入口之一。

非目标(首版不做):系统级分心监测、自动调参训练计划、headless server / 网关暴露、
番茄完成后从 agent 会话自动提炼"做了什么"。

## 2. 总体结构

```
练习账本 (JSONL, ~/.onething/practice/)
  ← ① 节律引擎:凯格尔/番茄跑完或中途放弃,自动落账
  ← ② 补录:隐线抽屉里的一行输入(俯卧撑 3×20)
  ← ③ agent 工具:聊天里说"刚做了 3 组俯卧撑每组 20 个"
  → ④ agent 查询 / 聚合视图:总结、趋势、渐进建议
```

分层与落位(镜像 token 计费 usage 的三层):

| 层 | 位置 | 内容 |
| --- | --- | --- |
| 纯逻辑 | `packages/onething-runtime/src/practice/` | types、账本读写与聚合、节律引擎状态机(可注入时钟,Electron-free) |
| main 装配 | `src/main/practice/` | 真实计时器驱动引擎、落账、config 读写 |
| IPC | `src/shared/ipc/practice.ts` + `src/main/ipc/practice.ts` + preload bridge | 命令、查询、1Hz 推送 |
| UI | `src/renderer/components/chat/PracticeStrip.vue` 等 | 案一隐线三态 + 音效 |

> ⚠️ 新增 runtime 子路径 `practice` 时,**两份 vite alias 表都要登记**
> (electron.vite.config.ts 与 apps/web/ 的 alias,见 variable 系统 v2 的教训)。
> `packages/onething-runtime` 不得引 Electron,由 architecture-boundaries 测试守着。

## 3. 数据层

### 3.1 账本

目录:`getStorePath()/practice/`(即 `~/.onething/practice/`),按月分文件:
`ledger-2026-07.jsonl`,一行一条,只追加。

```jsonc
// kind 三选一,对应字段三选一
{ "id": "p_01J…", "ts": "2026-07-18T21:04:00+08:00", "kind": "kegel",
  "source": "timer",            // timer | manual | agent
  "name": "凯格尔", "note": "",
  "kegel": { "holdSec": 10, "relaxSec": 5, "repsDone": 12, "repsTarget": 20,
             "setsDone": 2, "setsTarget": 3 } }

{ "id": "…", "ts": "…", "kind": "pomodoro", "source": "timer",
  "name": "学习",               // 分类;可选 label 起名
  "pomodoro": { "minutes": 25, "elapsedMin": 25, "completed": true, "label": "" } }

{ "id": "…", "ts": "…", "kind": "exercise", "source": "agent",
  "name": "俯卧撑",
  "exercise": { "sets": 3, "repsPerSet": 20, "durationMin": null } }
```

要点:

- **中途放弃也落账**(repsDone < repsTarget / completed: false)——放弃本身是有价值的数据。
- 读取容错:坏行跳过不炸(同 usage 账本策略)。
- 聚合 `summary.ts`:按 day / week / month 出各 kind 的次数、时长、完成率;
  周起点周一,时区取本地。

### 3.2 配置

`~/.onething/practice/config.json`(不进设置页 UI——遵循"设置只暴露必填项";
参数在隐线抽屉/练习视图内就地改):

```jsonc
{
  "kegel": { "holdSec": 10, "relaxSec": 5, "reps": 20, "sets": 3,
             "setRestSec": 60, "sound": true },
  "pomodoro": { "minutes": 25,
                "categories": ["学习", "看视频", "写作", "其他"] }
}
```

## 4. 节律引擎

`packages/onething-runtime/src/practice/engine.ts`,纯状态机,时钟注入(`now()`),
不含 setInterval——由 main 侧每秒喂 `tick(now)`。

状态:`idle → running → paused → (completed | abandoned) → idle`。
同一时刻**最多一个 session**(再次 start 先结算上一个为 abandoned)。

凯格尔相位序列:`hold(10s) → relax(5s)` × reps;组间 `setRest(60s)`;全组完成 → completed。
番茄相位序列:`focus(25min)` 单相位(首版不带休息相位,休息由用户自理)。

计时基于**绝对时间锚点**(startedAt + 相位表推算当前相位/余秒),不累计 interval 漂移;
暂停记录 pausedAt,恢复时平移锚点。

引擎输出事件(main 转发到 renderer):

- `practice:state` — start/pause/resume/stop/finish 时的全量状态(strip 挂载/重开窗口时也可拉取)
- `practice:tick` — 1Hz:`{ kind, phase, phaseSecLeft, rep, reps, set, sets }` 或番茄的 `{ elapsedSec, totalSec }`
- `practice:phase` — 相位切换沿:`hold-start | relax-start | set-rest-start | finished`,**renderer 音效以它为准**
- 结束(completed/abandoned)时 main 落账并发 `practice:state`

## 5. UI — 案一 · 隐线

练习条不占独立高度,住在 TabBar 已有的基线上。全局**只渲染一条**
(分屏时只挂主 panel 的 TabBar 下,实施时按布局取最顺的挂点)。

### 5.1 三态

**静默**:基线中央一段 38×3px 的墨(ink-40);hover 浮出 10px「练」字;点击展开。
无任何 session 且当天无记录时也保持这一段(它就是入口)。

**展开**(点击后,40px 抽屉,底边再画一条 hairline;点抽屉外或 Esc 收回):

```
凯格尔  收 10″ / 放 5″ × 20  开始   ·   番茄  [学习] 看视频 写作  25′   ·   补录一笔
```

- 数字文本可就地点改(点击变输入框),改完写回 config。
- 分类是文字 chip,选中者底部实线;`开始`/`25′` 是点线下划的动词。
- `补录一笔`点击后抽屉切换为一行输入:`名称 组×次(或 分钟)  记上`,回车落账收起。
- 抽屉尾部一个小喇叭字符切换音效开关(写回 config.kegel.sound)。

**运行 · 凯格尔**:抽屉收起,基线上一段居中的墨随相位生长/退回——
收 10″:从 38px 匀速长到 72% 宽;放 5″:退回。右下 10px 小注:`凯格尔 · 12/20 · 组 2/3`。
组间休息:墨段呼吸式淡入淡出,小注 `组间休息 41″`。

**运行 · 番茄**:基线从左向右按进度着墨,右下小注 `学习 · 剩 14′`。

运行中点击基线区域 = 展开控制抽屉(此时抽屉显示 暂停 / 结束 与当前进度文字)。
`prefers-reduced-motion` 时墨段不做宽度动画,只按相位切换两档宽度。

### 5.2 音效(renderer,WebAudio 合成,无资源文件)

由 `practice:phase` 驱动,音量常量压低:

- `hold-start`:短促清音(sine ~880Hz,80ms,快衰减)
- `relax-start`:低缓音(sine ~440Hz 滑向 330Hz,200ms)
- `set-rest-start` / `finished`:双音(低-高 / 高-低)

窗口关闭时无声属可接受(首版不做 main 侧兜底放音)。

### 5.3 挂接

`PracticeStrip.vue` 插在 TabBar 组件之下、正文之上,墨段用负 margin 与
TabBar 的 `::after` 基线重合。渲染进程状态放一个轻 Pinia store
(`stores/practice.ts`):订阅推送 + 挂载时 `getState()` 补拉,避免刷新丢状态。

## 6. IPC 与入口

### 6.1 通道(`src/shared/ipc/channels.ts` + `src/shared/ipc/practice.ts`)

请求/响应:`practice:start`(kegel | pomodoro+category)、`practice:pause`、
`practice:resume`、`practice:stop`、`practice:get-state`、`practice:log`(补录)、
`practice:summary`(range)、`practice:get-config`、`practice:set-config`。
推送:`practice:event`(state/tick/phase 信封),走 `IPCBridge.safeSend`。
renderer 一律经 `platformApi`,不直接摸 `window.electronAPI`。

### 6.2 命令面板(`src/renderer/services/commands/index.ts`)

- `开始凯格尔` — 按 config 直接起
- `开始番茄` — 二段选分类后起
- `补录练习` — 展开隐线抽屉并聚焦补录输入
- `结束当前练习` — 有 session 时可见

### 6.3 Agent 工具(`src/main/tools/builtin/practice.ts`)

单个 `practice` 工具,`action: "log" | "query"`。工具 description 保持宏观
("记录与查询用户的练习:凯格尔、番茄钟、体育锻炼"),参数细节归各字段 description。
`log` 落 exercise/补录条目(source: "agent");`query` 返回 summary 聚合 +
最近条目,供总结与渐进建议。写入低危,权限沿用内建工具默认档。

## 7. AI 总结与渐进建议

首版**不建独立侧线**:agent 通过 `practice` 工具的 `query` 拿到聚合数据,
在对话里总结("本周练了 5 天,平均 18/20,比上周稳;收紧可试 12″")。
scheduler 周报、写入 memory 日记等主动侧线,与 token 计费同理**主动缓做**,
等真实使用后再定。

## 8. 分阶段计划与验收

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| P0 账本层 | runtime `practice/`:types + JSONL 读写 + summary 聚合;alias 两表登记 | vitest:追加/读取/坏行容错/跨月/周界聚合全绿 |
| P1 引擎 | 纯状态机 + main 装配(真实计时、落账)+ IPC + 推送 | 假时钟单测:相位序列、暂停恢复平移、组间休息、abandoned 结算;手动起停可在 dev 里收到 tick |
| P2 隐线·凯格尔 | PracticeStrip 三态 + 墨段动画 + WebAudio 音效 + 命令面板前两条 | 真机完整跑一组凯格尔:音效对拍、放弃落账、刷新窗口状态不丢 |
| P3 番茄 | 分类 chip + 起名 + 运行态着墨 + 完成/放弃落账 | 真机跑一轮(可把 minutes 临时调小);小注与命令面板"结束当前练习"可用 |
| P4 补录 | 抽屉补录输入 + `practice` agent 工具(log/query) | 表单与聊天各记一条,账本可见;query 返回正确聚合 |
| P5 读出口 | workspace「练习」tab:账页式 day/week/month 视图 + 就地调参 | 视图数字与 summary 单测口径一致 |

每阶段独立可验收;P2 结束即可日常使用凯格尔。

## 9. 风险与注意

- **真机验证会写真实账本**(dev 数据目录 `~/.onething`):验证产生的测试条目要手动清掉,
  或验证前后核对账本;不要在验证中点会持久化 settings 的控件。
- 测试里 mock 文件系统路径时,`vi.mock` 相对路径按测试文件解析且错了不报错
  (电台事故教训)——practice 测试一律注入临时目录,不 mock 模块路径。
- TabBar 有 full/mid/slim 三档降级与分屏 focus 态,strip 的挂点与宽度要在三档下都核一遍。
- 引擎在 main,renderer 只是视图:任何"窗口不在也要走时"的行为以 main 状态为准。

## 10. 实施备注(2026-07-18,与上文的偏差)

- **ts 用 epoch ms(number),不是 ISO 字符串**——与 usage 账本一致,聚合分桶直接复用其
  本地时间桶逻辑。
- **命令入口落在 "/" slash 命令**(`/kegel`、`/pomodoro [分类]`、`/practice-stop`),
  注册进 `packages/core/slash-commands.ts` 共享注册表(有围栏测试强制同步)。
- **就地调参在隐线抽屉里**(收/放/次/组四个内联输入),练习 tab 是只读账页 + 最近条目。
- **工具在 runtime 侧定义**(`packages/onething-runtime/src/tools/builtin/practice.ts`,
  `createPracticeTool(adapters)`),main 只注入 log/query/recent 三个适配器。
- **alias 实登记了四处**:runtime package.json `exports`、electron.vite.config.ts、
  apps/server、apps/web(web 侧 platformApi 全部为惰性桩,勿从 renderer 值引
  `@onething/runtime/practice`——会把 node:fs 拖进浏览器包)。
- 推送通道:IPCBridge 新增公开方法 `sendToRenderer(channel, payload)`,practice 事件
  (state/tick/phase 信封 + settled 记录)走 `PRACTICE_EVENT`。
- 分屏时 strip 只在 `firstLeafId` 的主 panel 渲染一条(PanelTree 传
  `show-practice-strip`)。

### 展开态改版(2026-07-18 · 案二 · 墨签菜单)

首版 40px 抽屉会推动聊天布局且一行混排难读,已按
`docs/design/practice-strip/six-expand-options.html` 案二 +
`menu-detail.html` 详设重做:

- **展开态 = 菜单浮层**(SessionContextMenu 族,absolute 纯浮层,聊天布局零变化)。
  三种形态:idle 默认菜单(动词 + 灰字参数回显)/ 补录原地变身一行输入 /
  running 控制菜单(进度头 + 暂停/结束 + 查看进度)。
- **番茄二级分类选中即开始**;直接点主项用上次分类(`pomodoro.lastCategory`,
  每次开始时写回 config)。
- **设置全部住在练习 tab**:PracticePanelContent 顶部新增「参数」区
  (凯格尔五数字、番茄时长 + 分类增删、音效开关);菜单里只留音效开关 +
  「参数与账页 ›」直达项。
- 直达通道:PracticeStrip 派发 window 事件 `practice:open-workspace`,
  App.vue 监听后 `openWorkspacePanel('practice')`(与 todo-plan 同模式);
  WorkspacePanel 联合类型在 App.vue 与 Sidebar.vue 各有一份,都已加 'practice'。
- 键盘:↑↓ 移动、回车执行、→/← 进出二级、Esc 逐级退出。
