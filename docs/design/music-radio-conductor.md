# 电台方案:AI 是推荐引擎,机器只保证不断流

> **播放层 v3(2026-07-16 深夜,有声实验后重写)**:ncm-cli 的 daemon 队列管线被实测判死——
> `play` 的脱离子进程只认自己拉起的 daemon 且硬限 3 秒握手,daemon 启动撞上 manifest 联网
> 重校验(~5s)必输(整晚 0/12);§7.5 的直拉 daemon 对 `state`/`pause` 有效但 `play` 永远
> 看不见它;即便 play"赢"了,子进程仍可能超时退出 → daemon 失去唯一客户端,4 秒后带着音乐
> 一起死。唯一每次都响的组合:**`NCM_LEGACY_PLAY=1 ncm-cli play --song`(旧版进程内播放)
> + socket 运输命令(pause/resume/seek/volume/state)**;此模式下 `queue add` 一律被拒。
> 因此现行架构:**conductor 亲自当队列**——歌停了就从节目单(或 onDeck)取下一首逐首
> legacy 起播,不再触碰 ncm-cli 的队列;DJ 开台也不再亲自起播(整批进收件箱,起播归
> conductor);daemon 预拉(§7.5)废弃为 no-op。文中涉及 queue add 喂歌的段落均以本注为准。

> **实施状态(2026-07-16)**:P0/P1/P2 已全部落地(runtime:radio-store /
> reliable-runner / radio-conductor / radio-render + content;main:radio.ts 接线、
> `source:'radio'` 注册、skip 记录、radio-resume;变量 music provider;SKILL.md 电台节;
> 状态栏停摆态恢复键)。30 个新测试全绿。**待真机联调**:§9 清单 + DJ 首轮开台全链路。
> P3 歌词、P4 串词未做。
>
> 2026-07-16,v2。v1 的续歌走网易 heartbeat 被否决:「结合 AI 如果仍然让 app 的推荐来做,
> 不如我直接用 app」——电台的灵魂就是 AI 按时间、心情、品味选歌,这是本方案的第一原则。
> 前置:方案乙音乐状态栏已落地(now-playing watcher + composer flyout),AI 通过
> netease-music-cli skill + bash 直驱 ncm-cli。实测事实见 music-radio-netease.md §2.2.3
> (热 daemon 100% 可靠、冷启动 ≈20%、stop≠pause、state 无副作用)。

## 0. 两条硬需求,一对张力

1. **选歌必须是 AI 的品味**:按时间(深夜/清晨/工作中)、心情(对话里说的、开台时说的)、
   长期口味(云端听歌历史)来选。网易的推荐算法一概不用——用它就失去了做这个电台的意义。
2. **可用性必须是机器级的**:歌不能断流,播放/暂停必须能手动点、点了必须生效。

张力在于:AI 选歌有延迟、有失败率、有成本;而"下一首无缝接上"要求毫秒级确定性。
**解法:节目单缓冲池(programme pool)。** AI 提前编排节目单,机器从节目单机械喂歌。
AI 的延迟和失败被缓冲池吸收,永远不站在"下一首能不能响"的关键路径上。

## 1. 架构:DJ 编节目单,放歌员照单喂歌

```
   用户「放点适合下雨天的歌」/「有点累,来点轻的」/「换个台」
              │ (正常对话,主会话)
   ┌──────────▼───────────────────────────────┐
   │ DJ = 模型                                 │  开台:写 brief(意图/心情)+ 编首批节目单
   │  · 开台/换台:在主会话直接完成             │  续批:后台被叫醒,编下一批
   │  · 续批:专属「电台」会话,后台 turn        │  选歌依据:brief + 当地时间 + 已播/跳歌
   │  选歌手段:skill + bash(search/历史/红心)  │  + 云端听歌历史 —— 全是 AI 的判断
   └──────────┬───────────────────────────────┘
              │ 写 programme.json(节目单:已解析好 id 的歌序列)
   ┌──────────▼───────────────────────────────┐
   │ 放歌员 = RadioConductor(main,确定性代码)  │  队列见底 → 从节目单取歌 queue add(热态,实测可靠)
   │  · 不选歌、不调接口、不碰网易推荐          │  节目单见底 → 叫醒 DJ 编下一批
   │  · 零 token、零延迟                        │  DJ 失联 → 播完现有节目单,状态如实上报
   └──────────┬───────────────────────────────┘
              ncm-cli daemon ──▶ 🔊
              │ state(无副作用)
   ┌──────────▼───────────────────────────────┐
   │ 感知层:now-playing watcher(已有)          │──▶ 状态栏(手动控制) / music 变量 / 歌词
   └──────────────────────────────────────────┘
```

两个水位、两种动作:

| 水位 | 阈值 | 动作 | 性质 |
| ---- | ---- | ---- | ---- |
| 播放队列 | 剩 ≤1 首 | 节目单 → `queue add` | 机械,毫秒级,热 daemon 实测 100% |
| 节目单 | 剩 ≤3 首 | 叫醒 DJ 编下一批(8~12 首) | 智能,分钟级也无妨——缓冲池兜着 |

一小时的电台 ≈ 1~2 次 DJ 后台 turn,成本可控;但每一首歌都是 AI 挑的。

## 2. Phase 总览

| Phase | 交付 | 依赖 |
| ----- | ---- | ---- |
| **P0 不断流** | programme pool + RadioConductor 喂歌 + radio-dj agent(出厂人设)+ DJ 续批唤醒 + MusicReliableRunner(§7) | 无 |
| **P1 手动控制补全** | 状态栏加"从停止恢复播放"(走 keepalive 可靠路径);暂停时长极限实测 | 方案乙 |
| **P2 模型感知** | `music` 变量:status + 曲名 + 电台意图(严守无活动时长约束) | P0 |
| **P3 歌词** | 当前歌 id → `song lyric` → 缓存 → placeholder/状态栏当前行 | 方案乙 |
| **P4 AI DJ 串词**(暂缓) | TTS 播报、节目感 | voice 线 |

P0 上线即是电台;P1 补齐可用性承诺;P2/P3 独立可裁剪。

## 3. P0:节目单驱动的不断流

### 3.1 电台档案(brief + programme + inbox)

> **2026-07-16 真机修订:单写者规则。** 初版让 DJ 直接读写 programme.json,真机暴露了
> 读-改-写竞态:DJ turn 要几分钟,期间 conductor 在弹歌喂播放器,DJ 的过期整写会把已播
> 的歌复活(一首歌连放三遍)或丢掉旧批次。现行规则:**DJ 只写 `programme-inbox.json`
> (整体覆盖,只放新批);conductor 是 programme.json 的唯一写者**,每 tick `mergeInbox()`
> 合并收件箱,按 programme 内 encryptedId + 已播/在列 title 去重。DJ 从此不需要"保留已有
> 条目"这种模型最容易搞砸的指令。另:DJ 的 bash 纪律禁止 `| python3 -c` 这类内联脚本管道
> (分类器判 ask,后台会话弹窗无人批=冻死),只允许裸 ncm-cli 与 head/grep 类白名单过滤。

`~/.onething/music/` 下两个文件,模型写(经 skill 指引),conductor 只读:

```jsonc
// radio-brief.json —— 电台的「为什么」
{
  "active": true,
  "startedAt": "2026-07-16T10:00:00Z",
  "intent": "下雨天,安静的中文民谣",     // 用户开台时的意图/心情,人话
  "sessionId": "<电台DJ会话id>",          // 续批唤醒的目标会话
  "played": [ { "title": "...", "at": "..." } ],   // 近 50 首,续批时给 DJ 看
  "skipped": [ { "title": "...", "at": "..." } ]   // 跳歌 = 最强负反馈,直接进 DJ 上下文
}

// programme.json —— 电台的「接下来放什么」(AI 已解析好 id)
{
  "entries": [
    { "encryptedId": "…32hex…", "originalId": "12345", "title": "岁月神偷 - 金玟岐",
      "note": "雨天+民谣,承接上一首的钢琴底" }   // note 可选,DJ 给自己留的编排理由
  ]
}
```

### 3.2 DJ 是一个真 agent:人设、提示词、工具面全走现有系统

「电台主持人怎么讲话」不是硬编码字符串,而是 agent 系统里的一等公民。三层提示词,
各自映射到已有机制,变化频率一层比一层快:

| 层 | 内容 | 载体 | 谁改 |
| -- | ---- | ---- | ---- |
| **人设**(怎么讲话、选歌纪律) | 「你是深夜电台 DJ,话少,选歌看重情绪连贯…」+ 禁区(不碰 like/dislike 等) | `radio-dj` agent 的 `systemPrompt`(OnethingAgentDefinition) | 出厂默认,**用户可在 agent 管理页改** |
| **本台意图**(这次放什么) | 「下雨天,安静的中文民谣」+ 心情 | `radio-brief.json`,开台时写 | 模型(随对话) |
| **本次任务**(续批指令) | brief 摘要 + 当地时间 + 已播/跳歌 → 「编下一批 8~12 首」 | 续批 prompt 模板,`content/*.md` + `?raw`(提示词与代码分离的既有约定,goal 的 `renderGoalContinuationPrompt` 同款做法) | 代码模板渲染 |

接线全是现成的:

- **prompt 组装零新机制**:电台会话是一个 `agentId: 'radio-dj'` 的普通会话,builder
  (`prompts/builder.ts`)自动把 agent 的 systemPrompt 组进系统提示词的 agent 段;
- **工具面跟着 agent 走**:netease-music-cli skill 绑定到 radio-dj(skills root 的
  agentId 绑定已落地),DJ 天生带选歌工具,别的 agent 不被这个 skill 打扰;
- **出厂人设放 `content/radio-dj.md`**,首次开台若 radio-dj agent 不存在则用它创建;
  此后**用户的修改永远优先,升级不覆盖**(不静默覆盖用户选择的老原则)。

**开台(主会话)**:用户一句「放点下雨天的歌」→ 主会话模型只做两件事:把意图/心情写进
brief、确保电台会话存在,然后立刻回话「交给 DJ 了」。**选歌永远不在主会话发生**——
主会话的 agent 可能是工作助理人设,它不该带着自己的人设选歌;全部编排都出自 radio-dj。
代价是第一首歌慢十几秒(DJ turn 要跑 search),主会话的即时回话把这段等待变成节目感。

**续批(电台会话,后台 turn)**:conductor 发现节目单剩 ≤3 首时,向电台会话发
`command:send-message`,`source: 'radio'` + `origin: { transport: 'api' }`——
goal 续推(`goals/kick.ts` 的 `emitGoalDrive`)同款引擎直驱:系统内部 turn 不走
ChannelSessionRouter(幽灵会话/污染 memoryProfileId 的既有教训),渲染端可照 goal
的先例把它折叠成一行续推说明。DJ 在会话里照常用 bash 跑 search、把新一批追加进
programme。电台会话在侧栏可见,它的记录天然就是「AI 为什么放这首」的编排日志。

**换台/关台(主会话)**:用户说「换个风格」→ 模型改 brief.intent、清 programme 重编;
「别放了」→ `active:false` + `queue clear`。

### 3.3 放歌员:conductor 的全部职责

挂在已有 now-playing watcher 上,不加新轮询:

- `queueLength - currentIndex ≤ 1` 且 programme 非空 → 取下一首 `queue add`
  (此刻必有歌在放,daemon 必热,落在实测 100% 可靠路径);
- programme 剩 ≤3 → 触发 DJ 续批(有防抖:上一次续批 turn 未结束不重发);
- **DJ 失联兜底(不许偷偷换成网易推荐)**:续批失败重试 2 次后,如实上报——brief 记
  `lastError`,music 变量(P2)带一句「节目单快见底,DJ 没接上」,播完现有节目单自然结束。
  电台可以停,但不能背着用户换成别人的品味;
- 冲突规则:用户(经模型)手动点的歌天然在队列前面,conductor 只在见底时补,从不抢。

### 3.4 刻意不做

- conductor 不调任何网易推荐接口(heartbeat/daily/fm 全部不用——那是 v1 被否的路线);
- conductor 不自己起冷播放(起播只走 bash keepalive 链路);
- 无自动开台:AI 不主动放歌,电台永远由用户发起;
- 零新增设置项:方针是对话产物,不进设置页。

## 4. P1:手动控制的可用性承诺

方案乙已有:暂停/继续/下一首/上一首(热 daemon 上实测可靠),且刻意无 stop。补齐:

- **停了之后能一键再开**:状态栏在「电台 active 但没在响」时给一个播放键,走
  `ensureMusicPlayerKeepalive` + play 的实测可靠链路(和 bash 起播同路),不裸碰冷启动;
- **暂停时长极限实测**:已验证暂停 50s daemon 存活、恢复正常;需要补测暂停 10 分钟/1 小时
  后 resume 是否仍可靠。若长暂停会掉 daemon,恢复键降级为"从当前节目单重新起播"同一首;
- 按钮点了必须有反馈:失败时状态栏闪错误一句话,而不是静默没反应(现有 lastError 通道)。

## 5. P2:`music` 变量

照 background-jobs 模子:`music: 播放中「岁月神偷」 · 电台:下雨天民谣(节目单剩 6 首)`

- 数据源:watcher 缓存 + brief/programme,零新增子进程;
- **值里无 position/时长**(守 turn-channel 去重的老约束),只在切歌/状态变化时变;
- 跳歌密集、DJ 失联等状态也从这里进模型视野,主会话里模型能自然接话「要不要换个风格?」。

## 6. P3:歌词

queue.json 取当前歌 encrypted id → `song lyric --songId`(逐行 + 翻译)→ main 按歌缓存
→ 随 now-playing 推送附带 → renderer 用已有 250ms 插值时钟对时间轴,当前行进 composer
placeholder(原始愿景)/展开态状态栏。输入框有内容或聚焦时立即让位;拿不到就安静降级。

## 7. ncm-cli 可靠性:哪些能保证,哪些只能规避

「能否保证」按命令类别拆开答——四类命令,四种可靠性,不能混为一谈:

| 类别 | 实测可靠性 | 策略 |
| ---- | ---------- | ---- |
| **热态传输**(queue add/next/pause/resume) | **100%**(play 4/4、queue add+next ✓) | conductor 喂歌只用这类;写后 `state` 读回闭环确认 |
| **只读**(state/queue) | 无副作用、不拉起 daemon(实测零日志零进程增量) | 随便轮询;失败保留上个答案(watcher 已如此) |
| **服务端**(search/lyric/history…) | = 网络 + auth + 配额 | 分类重试(2 次退避);配额错误(QuotaError)单独上报不重试 |
| **冷启动**(无 daemon 时 play) | **≈20%,原因未知**(六个假设全被实验否定) | **不承诺,架构上绕开**:起播只走 keepalive TUI 链路;conductor 永不冷启 |

在此之上,P0 交付一个 **MusicReliableRunner**(conductor 的唯一出口),把已踩过的坑
固化成代码,而不是指望每个调用点都记得:

1. **信封解析,不信 exit code**:`exit 0 ≠ 成功`,拒绝以 `{success:false}` + exit 0
   返回(`extractNcmCliJson` 已有,统一收口);
2. **写后读回**:每个改变播放状态的命令后跟一次 `state`,以读回结果为准——
   「pause 之后 state 显示还在放」按失败处理并重试一次;
3. **分类重试**:服务端 2 次退避、热态传输 1 次、冷启 0 次(交给 keepalive);
4. **daemon 死亡自愈**(顺手收编 BUG-5):watcher 的 socket 检测发现「电台 active
   但 daemon 没了」→ 走 keepalive 重启链路 + 从节目单当前位置重新起播,
   music 变量如实记一句「播放器中途重启过」;
5. **失败出口唯一**:重试耗尽 → brief.lastError + music 变量 + 状态栏一句话,
   绝不静默吞。

结论:**电台运行中的可靠性可以保证**(喂歌全程在实测 100% 的热路径上,加读回闭环和
死亡自愈);**唯一保证不了的是冷启动**,方案是让它永远不出现在关键路径上——电台只在
「用户显式开台/恢复」时冷启,且只走 keepalive 这条实测可行的链路,失败就明说重试,
不装作在放歌。

## 7.5 去 TUI 化(2026-07-16 实验结论:可行)

keepalive TUI 存在的全部理由是「daemon 需要常驻客户端才活着 + 只有 TUI 能可靠拉起 daemon」。
实验把两条都推翻了:

1. **daemon 可以直接拉起**:dist 里有 `if (process.env.NCM_DAEMON === '1') runDaemon()`。
   `NCM_DAEMON=1 ncm-cli`(无参数)spawn 后 **~500ms socket 就位**,`state` 正常应答;
2. **无客户端不会死**:直拉的 daemon 空转 45s 仍存活(含一次 state 短连接后)——
   「8 秒没客户端就退出」对这种拉法不成立;
3. **入口必须是 `play`**:`queue add` 对"无播放会话"仍拒绝(播放进程 ≠ daemon)。
   但 play 打热 daemon 正是实测 100% 的路径——冷启动的 3s 握手竞态在 daemon 已就位时不存在。

**替代架构**:`ensureDaemon()`(spawn + 等 socket)取代 `ensureMusicPlayerKeepalive()`,
起播 = ensureDaemon → `play --song`。连带消灭:PTY、TUI 自动播放的静音舞蹈、每日推荐刷
播放记录、队列恢复打架;skill 里「play 会被拒,用 queue add」的特例也一并作废(直拉模式
没有 TUI,play 不再被拒)。

**上线前必须过的两个真机测试(有声)**:
- ensureDaemon 后 `play --song` 真的出声,且歌与歌之间队列自动推进(无常驻客户端时
  detached play child 是否撑到队尾——TUI 曾经兜着这一点);
- daemon 长空转(小时级)是否有隐藏退出定时——有也无妨,ensureDaemon 重拉即可,但要知道。

另:`NCM_LEGACY_PLAY=1` 走旧版进程内播放路径,留作备用旋钮,未测。

## 8. 风险与开关

| 风险 | 处置 |
| ---- | ---- |
| DJ 续批延迟/失败 | 缓冲池吸收;失败如实上报,绝不静默换网易推荐 |
| 后台 turn 的会话污染 | 复用 goal 续推的引擎直驱,绕 ChannelSessionRouter(既有教训) |
| queue.json 格式变化(私有文件) | 只读 + 防御解析;字段假设首次联调实测确认 |
| 续批成本 | 8~12 首/批 ≈ 1~2 turn/小时;续批 turn 上下文只带 brief 摘要,不带主会话历史 |
| 冷启动 ≈20% 未解 | 起播只走 keepalive 链路;谜题解开前不变 |
| 联调污染账号 | 验证只用 state/queue/search 读路径;like/dislike/评论一律不碰 |

## 9. 待实测清单(P0 联调第一步)

1. `queue.json` 的 `items[]` 字段结构(现为空,需一次真机播放确认字段名);
2. 长暂停(10min/1h)后 resume 可靠性,决定 P1 恢复键的降级策略;
3. 后台续批 turn 的引擎直驱路径在本 repo 的最小接线(goal 续推代码作参照);
4. `song lyric` 的时间轴格式(LRC 风格 or 结构化 JSON)。
