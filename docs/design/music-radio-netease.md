# 音乐电台(AI DJ + 网易云)方案文档

日期:2026-07-15(v6:工具删除,改为 skill + bash 直驱 ncm-cli;后台常驻 TUI 撑 mpv)
状态:已实施并真机验证(应用自动起 keepalive → `queue add --next` + `next` 放指定歌曲成功)

> **2026-07-16 重要更正**:§2.2.2 中"只有 TUI 能撑住 daemon"的**根因论证是错的**(源头是我编造的一个 `originalId`),
> "TUI 下 `state` 残缺""可播性无法预测"两条结论也已被实测推翻。**代码里的 TUI 暂时保留**,但理由变了 ——
> 见 **§2.2.3**(无 TUI 实测、冷启动之谜、六条死路、`stop`≠`pause`、`state` 无 paused 状态)。
> 读本文任何关于播放链路的段落之前,先读 §2.2.3。
调研输入:网易云开放平台文档全量抓取、官方 ncm-cli 实测、QQ 音乐开放平台横评、11 个开源播放器接入方式核对、AI DJ/TTS 方案对比、仓库基础设施摸底

## 0. 路线决策(结论先行)

### v6 定稿(2026-07-15 夜,用户拍板):删工具,skill + bash 直驱

**`music` 工具已删除。** 用户原话:"工具我觉得没必要啊,我们可以不用工具,只用这个 bash 来执行,因为我们不是提供了一个 skill 吗"。

理由不是"少写代码",是封装本身在亏钱:

- **71 条 vs 4 条**:ncm-cli 的命令树由服务端下发(`ncm-cli commands` 取),共 71 条服务端命令 + 18 条静态命令。我们的工具只暴露了 4 条(recommend/search/lyric/play)。热评、心动模式、听歌排行、我的歌单、播客、AI 写歌全在外面,每加一条就得改代码发版。
- **所有 bug 都活在封装的缝里**:`play` 在 TUI 下被拒绝的那句 `{"success":false,"message":"TUI 正在运行，请使用 queue add..."}` 被我们的 wrapper 吞掉(它按退出码判断成功,而 ncm-cli 拒绝时 **exit 0**),于是每首歌都"没音源",重试机制把它放大成 40~70 秒静默。模型直接读 bash 输出的话,它自己就读懂并改用 queue add 了。
- **合规**:官方 skill 带内容安全校验、非播控命令必须带 `--userInput`、配额超限原样告知——我们的工具一条都没实现。

落地:

- **`resources/skills/netease-music-cli`**(网易官方 skill,Apache-2.0,含 LICENSE)。**两处本地改动必须随升级保留**:① 凭证/登录改指设置页(官方原版教模型跑 `config set privateKey`,私钥会永久落进会话历史);② 播放改 `queue add --next` + `next`(本应用常驻 TUI,`play` 被拒)。
- **`resources/skills/onething-music-radio`**(我们的):只讲 DJ 人设、选曲判断、串词素材(歌词/热评/听歌历史),CLI 用法 delegate 给上面那份。
- **未装 `ncm-cli-setup`**(官方):它教模型 `npm install -g` 和 `config set privateKey`,与设置页职责重叠,且是"两个真相来源"——模型迟早跟着它把私钥要进对话。
- **bash 白名单**(`packages/onething-runtime/src/tools/bash-classifier.ts`):播控与只读命令自动放行(否则"下一首"都要弹审批),写账号/发布/上传/花积分/改凭证的一律 ask。`song lyric` 放行而 `song like` 要问——开发中就有人误按 `h` 把用户的红心取消了。
- **保留** `MusicSetupService` + `NcmCliDriver`(仅 setup)+ 设置页向导:privateKey 不能走聊天、不能进 argv(`ps` 可见),这是唯一不能交给模型的部分。
- **已删**:`music` 工具(两处)、`RadioService`(节目单/轮询/自动切歌/跳死歌)、driver 的播放段、track/player-state 解析、配额计数(模型走 bash 花的额度我们看不见,留个永远是 0 的数字只会骗人)。

### v5 形态改版(2026-07-15,已被 v6 取代)

电台窗口删除,能力交给 AI(`music` 工具 + skill)。窗口/`#/music` 路由/侧栏 Radio/`MUSIC_*_WINDOW`+`MUSIC_COMMAND` 通道均已删除,这部分依然有效;`music` 工具本身在 v6 被删。本文 §3 起的窗口/播放器 UI 设计仅作历史保留。

### 协议路线(v1–v4 历史)

**主路线:官方 ncm-cli(个人开发者合规通道)。** 决策走过四轮:

1. v1 初判"官方无 API"→ 有误;
2. v2 发现官方个人通道 ncm-cli,定为主路线;
3. v3 实测确认 ncm-cli 局限(无播放 URL/无热评/配额/版权池小)后,一度改推 api-enhanced 逆向路线(生态事实标准,体验完整);
4. **v4 定稿:用户权衡后选 ncm-cli,求稳**——官方许可、零封号风险、不受"上游被网易法务打掉"的历史重演影响(Binaryify 2024 删库殷鉴在前)。代价是接受体验降级:无真 ducking/crossfade(音频在它的 mpv 里)、DJ 素材无热评、切歌靠轮询、每日配额、版权池小于 App。

协议层收拢在 **MusicBackend 接口**之后:api-enhanced 逆向实现(§7-B)作为第二后端保留设计,若日后官方通道停摆或体验实在不达标,可切换,renderer/DJ 层代码不动。

其余路线均已排除:网易厂商 OpenAPI 仅企业商务;QQ 音乐"暂不支持个人开发者"、商务邀约制,更封闭;伴生模式(mediaremote-adapter)零数据能力,最后兜底。

## 1. 需求

用户在外部写代码时,应用作为"电台"持续播放网易云音乐;由 AI 主持人(DJ)在歌曲衔接处用语音讲解:推荐理由、歌曲/歌手背景、串场词等,类似 Spotify AI DJ 的中文版。

产品形态:
- 常驻**电台悬浮小窗**(mini-player):封面、歌名、播放控制、DJ 开关、"下一首"、"讲讲这首歌"。写代码时悬浮在角落。
- 主窗口 sidebar 入口;设置页新增"音乐电台"分组。
- 可选进阶:聊天里自然语言点歌/换台。

## 2. 调研结论沉淀(四轮)

### 2.1 网易云官方开放平台

- 能力齐全(播放直链到 Hi-Res、私人FM、日推、OAuth2、会员收银台),但**接口组授权入口只在厂商(企业)控制台**;个人 privateKey 平台代发、签名可行,卡在接口组授权。FAQ:"个人场景:暂不支持,仅可使用 ncm-cli"。API 文档公开可读 ≠ 可调。
- **个人入驻**(2026-03 起):成年实名,姓名+手机+邮箱+应用描述,"符合条件即会被通过"(近自动审核),控制台发 appId/privateKey,每日调用配额在应用详情页查看。

### 2.2 ncm-cli 实测能力(主路线依据)

npm `@music163/ncm-cli`(0.1.6 @ 2026-06,网易官方前端组维护;Agent Skills 在 github.com/NetEase/skills)。官方定位"给 AI Agent 当工具":**默认 JSON 输出**、无交互子进程、每命令独立进程。

| 能力 | 命令 | 备注 |
|---|---|---|
| 播控 | `play/pause/resume/stop/next/prev/seek/volume/state/queue` | 后端 **mpv**(必装);orpheus 遥控本机 App 但**无 state**,不可用于编排 |
| 队列 | `queue add --encrypted-id/--next` | 文档写明也接受**音频 URL**(待实测能否插 TTS 音频) |
| 推荐 | `recommend daily`(30首)/ `recommend fm`(私人FM)/ `recommend heartbeat`(心动) | 另有雷达歌单、红心歌单、最近播放、听歌排行 |
| 内容 | `search`(JSON 带 `visible`/`plLevel` 可播性)/ `song lyric` / **`comment list-hot`(热评)** / `album get --descFlag` | ~~无评论/热评命令~~ **已更正**,见下 |
| 账号 | `login`(终端二维码)/ `login --background`(Agent 代理登录) | 凭证 AES 加密存 `~/.config/ncm-cli/` |

> **更正(v6)**:早期调研结论"ncm-cli 无热评"**是错的**。`manifest.json` 里有 `comment list-hot`(还有 `comment post`/`reply`)。这条错误结论一路影响了 §2.4 的防幻觉设计("无热评素材后,事实类内容只从歌词/元数据 grounding")——**网易云热评本来就是这个产品的灵魂,是 DJ 串词最好的素材**,现在它回来了(已写进 `onething-music-radio` skill 的素材表)。
>
> 教训:命令树是服务端下发的,`--help` 和 bundle 里都看不全。**权威来源只有 `ncm-cli commands` 和 `manifest.json`**。完整清单:71 条服务端命令,14 组(song/playlist/album/search/user/recommend/cloud/note/comment/podcast/cloudupload/artist/aisong)。

硬约束:**不暴露播放 URL**(音频只能从它的 mpv 出声);无切歌事件推送(~1s 轮询 `state`);每日调用上限(超限返"请求总量超限");SVIP 也播不了部分歌(版权池小);CLI 闭源(dist 混淆),不可捆绑分发,引导用户 `npm i -g` 自装;0.1.x 早期,daemon 状态同步偶有抖动。

#### 2.2.1 真机实测补充(2026-07-15,ncm-cli 0.1.6)

命令树与参数**由服务端下发**,不在 bundle 里(grep `keyword` 零命中)。权威 schema 缓存在 `~/.config/ncm-cli/cache/manifest.json`——排查参数先读它,别猜:

- `search song --keyword <kw> --limit <n>`(≤300,建议 ≤100);`song lyric --songId <加密ID>`
- `recommend daily --limit <n>`(最大 40);`recommend fm --type mode --code DEFAULT --limit 3`(三个参数**都必填**,缺了就 HTTP 400;每次固定给 3 首)

数据字段(与文档命名不同,以实测为准):

- 加密 ID 在 **`id`**(32 hex),明文数字 ID 在 `originalId`;`play` 两个都要
- `duration` 是**毫秒**;`plLevel` 是**音质档**(`lossless`/`hires`),不是可播标志,只有 `none` 才不可播
- 歌词有**三个**字段:`lyric`(逐行 LRC)/`transLyric`(翻译)/`txtLyric`(非滚动)。`noLyric: true` 的歌 `lyric` 为空但 `txtLyric` 有内容,**必须兜底**

播放链路(踩坑最深,均为静默失败):

- **`play` 什么都不返回**:无 stdout,且**永远 exit 0**——歌正常播、版权被拒、daemon 连不上,三者退出码完全一样。只能靠轮询 `state` 判断是否真在播。
  **原因(2026-07-16 查明)**:`play` 会立刻 fork 一个**脱离的后台播放进程**(`PPID=1`、stdin/stdout 都是 `/dev/null`),父进程 275ms 就 exit 0 走人。真正干活、也真正撑着 daemon 的是那个孩子。所以"父进程退出码"从来就与播放结果无关。
- ~~**listing 字段无法预测可播性**~~ **这条是错的(2026-07-16 推翻)**:实测 `search song` 的 30 条结果里,`visible` / `playFlag` / `plLevel` / `userMaxBr` **完全线性相关,无一例外**:

  | | `visible` | `playFlag` | `plLevel` | `userMaxBr` |
  |---|---|---|---|---|
  | 可播(9/30) | `true` | `true` | `lossless` / `hires` | `999000` |
  | 不可播(21/30) | `false` | `false` | **`none`** | **`0`** |

  **判据就是 `visible: true`**(官方 skill 里"如果歌曲的 visible 为 false,则是无法播放的"那句连写了两遍,它一开始就告诉我们了)。因此**"试播 → 失败跳下一首"那套重试机制没有存在必要**,选歌时按 `visible` 过滤即可。注意可播比例很低(实测 9/30),不过滤的话失败率会很难看。
  早期那条错误结论多半来自一次样本恰好同质的探针,它一路支撑了 `RadioService` 里的跳歌逻辑。
- **好歌起播也慢**:mpv 缓冲期间 `state` 同样报 `stopped`,且 `title`/`queueLength`/`position` 都不区分"缓冲中"与"被拒",确认窗口太短会把好歌误判成死歌
#### 2.2.2 播放器选型:mpv 靠 PTY 常驻 tui 打通(2026-07-15 定案 → **2026-07-16 根因被推翻,方案暂留**)

> ## ⚠️ 本节的论证是错的,读之前先看 §2.2.3
>
> 下面这套"只有 tui 能撑住 daemon"的推理,**建立在一个我编造的 `originalId` 上**:ID 配错 → 接口 400 → CLI 把它报成 `daemon 无响应（3s 超时）` → 播放从未真正开始 → daemon 因**没东西可播**而退出 → 我把这个**结果**读成了**原因**,于是发明了 TUI keepalive。
>
> 已被 2026-07-16 实测推翻的具体条目:
>
> - ❌「只有 tui 长持连接」→ **撑住 daemon 的是 `play` 自己 fork 出去的那个后台进程**(PPID=1)。实测无 TUI 连播 5 分钟到自然播完。
> - ❌「TUI 模式下 `track` 是 null、`queueLength` 是 0」→ **那是 TUI 造成的**,不是 CLI 的限制。无 TUI 时 `state` 给全:`title`/`position`/`duration`/`progress`/`queueLength`。
> - ❌「`play` 被拒是设计,不是 bug」→ 是设计没错,**但那堵墙是我们自己砌的**——TUI 是我们起的。没有 TUI 就没有拒绝。
>
> **代码暂时保留 TUI**,理由**不是**上面这些,而是 §2.2.3 那个尚未查明的冷启动问题:TUI 启动时那个惹人厌的"自播每日推荐",恰好就是一次成功的冷启动,之后 daemon 一直热着。**我们想消灭的行为,正是让它能跑的原因。** 拆 TUI 之前必须先解决冷启动。

原始论证(留档,已证伪):

1. daemon 在最后一个客户端断开约 8s 后自杀(`无活跃连接,daemon 自动退出`)—— 现象属实,但它退出是**因为没东西可播**,不是因为没人连着
2. ~~`play`/`state`/`queue` 全是短连接,发完即断~~ —— `state`/`queue` 属实,**`play` 不是**(见上)
3. ~~唯一长持连接的客户端是 `tui`~~ —— **错**
4. 表现为 `play` exit 0、无输出、`state` 恒 stopped、**全程零错误信号** —— 现象属实,至今仍是冷启动失败的表现

排除过的错误猜想(留档,别重走):非版权(日志无 `获取失败`)、非 stdin 关闭(`sleep 30 |` 顶住 stdin **更糟**,`play` 疑似会等 stdin,关 stdin 才对)、非 npx 包装、非版本旧(0.1.6 即最新)、非竞态(连发 6 次 play 摁住 daemon 照样不播)。静态分析走不通:dist 混淆,字符串 grep 零命中。

**解法:`tui` 需要的是真终端,不是人。** `apps/electron/src/music/pty-host.ts` 用 node-pty 在后台起 `ncm-cli tui`、把它渲染的画面直接丢弃——纯粹给 daemon 找个说话的对象,零界面。

**但常驻 TUI 之后,驱动方式必须换:`play` 会被明确拒绝**

```json
{ "success": false,
  "message": "TUI 正在运行，请使用 `ncm-cli queue add` 添加歌曲到播放队列，或关闭 TUI 窗口后再使用 play 命令" }
```

**这不是 bug,是 ncm-cli 在告诉我们正确姿势**;而且它 **exit 0**,只看退出码的话完全看不出来。正确姿势(真机验证):

```bash
ncm-cli queue add --encrypted-id <加密ID> --original-id <原始ID> --next
ncm-cli next        # → 正在切换到下一首 → 晴天 - 周杰伦
ncm-cli state       # → playing pos=4.3
```

于是 mpv 全能力回来了,orpheus 降级为 macOS 备选:

| | mpv(默认) | orpheus |
|---|---|---|
| 出声 | ✅ 靠 `playerHost` 常驻 tui | ✅ 直接可用 |
| 放指定歌 | `queue add --next` + `next`(**不是 `play`**) | `play` 第一首 + `queue add` 其余 |
| `state` | ✅ status/position 可用 → **能判断播完**,DJ 串词才有落点 | ❌ `云音乐模式下不支持 state 命令` |
| 平台 | ✅ 跨平台 | **仅 macOS** |

**TUI 模式下的读数差异**(模型必须知道,已写进 skill):`state` 只有 `status`/`position` 可信,`track` 是 `null`、`queueLength` 是 `0`;**当前曲目要从 `ncm-cli queue` 的 `label` + `current: true` 读**,或从 `next` 的返回消息读。另外 TUI 启动时会自己加载每日推荐并开播,换歌单前要 `queue clear`。

> **更正(2026-07-16)**:上面这段**只在挂着 TUI 时成立,而 TUI 是我们自己挂的**。我曾把它写成 CLI 的固有限制,并据此为状态栏设计了一整套"轮询 `queue` 认曲目 / 读私有 `play-session.json`"的脏方案。**无 TUI 时一条 `ncm-cli state` 就全有了**:
>
> ```json
> { "status": "playing", "title": "可惜没如果 - 林俊杰",
>   "position": 241.16, "duration": 298.29, "progress": "4:01 / 4:58",
>   "currentIndex": 0, "queueLength": 1 }
> ```

> **【血泪陷阱,后人必看】不要在持有 PTY 的那个进程里用 `spawnSync` 跑 ncm-cli。**
> 它阻塞事件循环 10 秒,node-pty 的 `onData` 排不上队 → PTY 缓冲写满 → **TUI 被饿死** → 所有命令报 `daemon 无响应（3s 超时）`。我们因此连续几小时误判"queue add 不可用""TUI 和 CLI 是两个世界""mpv 是死路",差点退回 orpheus。应用的 runner 用异步 spawn,不受影响。
> **判据**:TUI 画面在播(`▸ 秋风 ♥`)+ 日志有 `开始播放`,而 `state` 说 stopped → 一定是你把 TUI 饿死了,不是 ncm-cli 的错。
> 另一个伪装成 daemon 故障的错误:**ID 配错**(加密 ID 与 originalId 不配对)时 API 返回 400,CLI 也报成 `daemon 无响应（3s 超时）`。两个都必须原样从上一步响应里取。

架构影响:orpheus 下**没有可编排的状态**,所以按官方 skill 的做法——`play` 第一首 + `queue add` 其余,不轮询、不自动切歌(App 自己会跳)。

keepalive 的两个约束:**新起的 tui 会恢复上次的队列**,所以首次 `ensure()` 返回 `started: true` 时要先 `queue clear` 再交我们的节目单;**退出时必须 dispose**,否则 PTY 子进程活过应用、音乐继续放(挂在 `before-quit` 的 `shutdownMusicService`)。

> **踩过的坑**
>
> - `setCredentials` 曾强制 `config set player mpv`(理由是"编排需要 state"),结果用户手动改好 orpheus 后,**一存凭证就被悄悄改回 mpv、再次没声音**。已删并加回归测试。教训:别替用户改他显式选过的配置。
> - node-pty 的 `prebuilds/*/spawn-helper` 被 bun 装成 0644,报 `posix_spawnp failed`——**错误信息完全不提权限**。已加 `scripts/fix-node-pty-perms.mjs` 进 postinstall。
>
> 真机验证入口:`MUSIC_LIVE_PROBE=1 npx vitest run packages/onething-runtime/src/tools/builtin/__tests__/music-tool-live.probe.test.ts`(会真出声);日志 `~/.config/ncm-cli/app.log`。

#### 2.2.3 冷启动之谜 + 无 TUI 实测(2026-07-16)

起点是用户一句"好像不需要 tui?"。他是对的,而且他自己在终端里放了一首满 5 分钟的歌来证明。

**一、可靠的实测结论(可复现)**

| 场景 | 结果 |
|---|---|
| 无 TUI 播放 | ✅ 能。实测连播 5 分钟到 `队列已播放完毕`,全程无 TUI |
| **热 daemon(正在放着)下再 `play` 切歌** | ✅ **4/4 全中** |
| 热 daemon 下 `queue add --next` + `next` | ✅ |
| **冷启动(无 daemon)单发 `play`** | ❌ **约 20%**(全天约 30 次里 6 次成功) |
| `state` / `stop` 在无 daemon 时会不会拉起 daemon | **不会**。日志零新增、进程零新增 → **查状态是零副作用的**(状态栏空闲轮询安全) |
| `--player mpv` / `--bitrate 128`(未文档化的 flag) | 与成败无关(带着的失败,不带的成功) |

**二、三个进程,别搞混**

| 进程 | 命令行 | 生命周期 |
|---|---|---|
| **daemon** | `node .../bin/ncm-cli`(**无参数**) | 失去客户端约 8s 后自退 |
| **play 客户端** | `node .../ncm-cli play --song …`,**PPID=1**、stdin `/dev/null` | 自己 daemonize,活多久就撑 daemon 多久 |
| **mpv** | `mpv --no-video --input-ipc-server=…/mpv.sock --idle` | 跟着 daemon 走 |

查活:`ps -axo pid=,command= | grep "bin/ncm-cli$"` / `ls ~/.config/ncm-cli/player-daemon.sock` / 日志 `PlayerDaemon] daemon (启动|自动退出)`。
**陷阱**:别用 `pgrep -f ncm-cli` —— 它会匹配 `tail -f ~/.config/ncm-cli/app.log` 这种**路径里带 ncm-cli 的无关进程**,害我的"等 daemon 退干净"循环永远等不到冷。必须锚定结尾。

**三、`stop` ≠ `pause`(用户发现,后果很重)**

- **`stop` 是把播放会话拆掉**,之后 `UnifiedPlayService` 判"无活动" → 30s → daemon 退出 → **下一次 play 掉回冷启动硬币**。
- **`pause` 是安全的**:实测暂停 **50 秒** daemon 仍活、`position` 冻结不动、`resume` 正常恢复。
- ⇒ **状态栏的暂停键必须用 `pause`/`resume`,绝不能用 `stop`。**
- ⇒ 我此前每发探针都用 `stop` 清场,等于**每次亲手砸掉热 daemon,把自己扔回硬币**。"冷启动 20%"这个数字有相当部分是测试脚手架自己制造的场景;真实用法(放着 A 再放 B)走的是热路径。

**四、`state` 没有 `paused` 状态(必踩的坑)**

```
pause 后:  status=stopped  position=7.0(冻结)  daemon 活   ← 明明是暂停
resume 后: status=playing  position=11.2
```

暂停和停止**是同一个字**。只能靠旁证推断:

| 判据 | 含义 |
|---|---|
| `status=stopped` + `position > 0` + daemon 活 | **暂停中** |
| `status=stopped` + `position = 0` | 真停了 |

**五、冷启动失败长什么样**

```
[DaemonClient] 启动 daemon 进程...
[PlayerDaemon] daemon 就绪，监听 …/player-daemon.sock
[DaemonClient] daemon 就绪
[UnifiedPlayService] 已启动，等待命令...
                                          ← 这 3 秒里一个网络请求都没有
[play --song] 后台播放失败: daemon 无响应（3s 超时）
[PlayerDaemon] 无活跃连接，daemon 自动退出   ← 8s 后
```

成功时的样子:`已启动，等待命令` → **1.9s 后** `GET song/detail/get/v2` → `正在播放`。
**即"命令在一个已连接的客户端与一个正在监听的 daemon 之间丢了"。** 注意:失败时歌曲 ID **根本没被发出去过** —— 所以**冷启动失败与 ID 无关**(用户曾怀疑 ID 会变;`秋风` 的隔夜老 ID 今天成功播过多次)。

**六、六条死路(全部由我提出、又被我自己的实验推翻。别重走)**

| # | 假说 | 证伪方式 |
|---|---|---|
| 1 | 残留的死 socket | 失败时 `player-daemon.sock` 根本不存在 |
| 2 | 空转 daemon 吞命令 | `stop` 后 daemon 2s 就退,且随后 play 成功 |
| 3 | 被 `kill` 的 daemon 没清理 | kill 后确实全废,但清理干净后仍失败 |
| 4 | `play-session.json` 脏 | 移走该文件后仍失败 |
| 5 | 重试可预热 | 1.5s 后补一发:**0/3,更糟** |
| 6 | `.retrieve-cooldown` 冷却 | 冷却龄 161→225s 与成败无关;删掉它 **0/4** |

`.retrieve-cooldown` 是个毫秒时间戳(`ls -a` 才看得见);bundle 里唯一的 "retrieve" 出现在 `retrieveReportAction` 的 `await` 里,与听歌上报有关。

**七、听歌记录污染(现在就在发生)**

日志实锤 `POST /openapi/music/basic/play/data/record` 带 `alg: alg-music-rec_cm_openDaily_daily` / `sourceType: dailySong` ——**每起一次 TUI,就往用户的网易云账号里记一次没人点的每日推荐**,污染听歌记录与后续推荐。静音也拦不住上报,只能靠尽快 `stop` 缓解(上报通常要听满一定时长才计数)。这是保留 TUI 的一笔隐性成本。

**八、已修复(2026-07-16,均带回归测试,且都验证过"旧代码下测试为红")**

| # | Bug | 修法 |
|---|---|---|
| **1** | **打包双击后整条链是哑的,而设置页显绿灯** | `mergeMissingEnv` 是"缺了才填",而 launchd **一定**给了 PATH → 那个专修打包环境的机制**恰好永远修不了 PATH**。新增 `mergePathEnv`:登录 shell 的 PATH 与当前 PATH **取并集**(登录 shell 在前、去重;并集而非替换 → 只可能让命令变得可解析,不可能弄丢一个)。一处修好 bash 工具、pty-host 与所有全局 CLI。**已在真打包版验证**(见下)。 |
| **2** | 登录失败变成 unhandled rejection | `handle.done.finally(…)` 的返回值无人 catch,而 `done` 在超时/spawn 失败(ENOENT,正是 #1 的场景)时 reject。改为先 `.catch` 记日志再 `.finally`。 |
| **3** | 配额超限被伪装成"未配置",向导让用户重填凭证 | `checkLogin`/`isConfigured` 的 catch-all 改为**只吞真·未登录**,`OnethingMusicQuotaError` 原样抛出;`refreshEnv` 捕获后**保持上一次 stage**、只记 `lastError`。探针失败不再降级(重填一个没问题的 privateKey 帮不上忙,还多花配额)。 |
| **6** | `getPlayer` 失败静默当成 mpv | 删掉 `catch { value = 'mpv' }`。它读起来无害,但调用方会据此**给选了 orpheus 的用户起一个 TUI 并真的出声**——只因一次 `config get` 抽风。与 `setCredentials` 强改 mpv 是同一家族的 bug。 |
| **7** | keepalive 触发是**正则**,fail-silent;而且 `state` 也会触发 | 改用已有的 `splitCommandSegments` + `parseCommand`(懂 `&&`/`;`/`|`,会剥 `env FOO=1` 前缀)。**触发集收窄为 `play`/`next`/`prev`/`queue add`** —— 唤醒 keepalive = 起 TUI = 出声,所以判据不是"需要 daemon"而是"**用户要声音了**"。`state`/`queue`/`stop`/`pause`/`volume`/`seek` 全部移出:问一句"在放什么"就开始放歌,是"开应用就放歌"换了扇门;没有 daemon 时为了"暂停"而起一个会自播的 TUI 更荒谬。副带:`echo "ncm-cli play"`、`grep "ncm-cli play" docs/` 不再误触发,而 `env X=1 ncm-cli play` 不再漏判。 |
| **4** | 每日推荐可能漏网,漏了就再也没人清 | 旧逻辑"等 15s → clear 一次"会输:`recommend daily` 实测 4.5–11s 且方差大,清早了它的 fetch 随后落地 → **没人点的歌一直放,且再没有代码会清它**。改为"停 → 复查":`stop` + `queue clear`,之后再盯 6s,又冒出来就再清一轮;它一直没开播也要清(TUI 会恢复上次的队列)。轮询 500ms → 300ms(更快停 → 上报更少)。这段**此前一个测试都没有**,现已可测(注入时钟)。 |

**BUG-1 的打包版验证方法(留档,这类 bug 只在打包版出现)**

```bash
bun run build:unpack
rm -f ~/.onething/login-shell-env.json          # 强制走真的登录 shell
# 剥成 launchd 交给 GUI app 的样子:PATH 只有系统四项,没有 homebrew
env -i HOME="$HOME" USER="$USER" SHELL=/bin/zsh PATH=/usr/bin:/bin:/usr/sbin:/sbin \
  ./release/mac-arm64/onething.app/Contents/MacOS/onething 2>&1 | grep "\[Env\]"
# 期望:[Env] Repaired PATH from login shell: …:/opt/homebrew/bin:…:/usr/bin:/bin:/usr/sbin:/sbin
```

**别用 `ps eww` 看**:它读的是进程**启动时**栈上的环境副本,`setenv()`(Node 改 `process.env` 时走的)在堆上另分配 → **`ps eww` 看不见我们的修复**。实测:一个把 PATH 改成 `/MUTATED:…` 的 node 进程,`ps eww` 仍显示原值。用这个方法测会得到一个**假阳性**(`open` 会把调用方 shell 的 PATH 传进去,看起来像"修好了")。要看运行时的值,只能让应用自己报——这也是 `[Env] Repaired PATH` 那行日志存在的另一个理由。

未做:**BUG-5**(TUI 意外死亡无人知)、**BUG-8**(Windows 未验证)—— 都与 TUI 去留耦合,等冷启动有定论再说。

**九、结论**

冷启动那个"exit 0 / stdout 空 / 什么都没播 / 零错误"的失败,**原因未知**,六条路走死。在它查明之前:

- **别拆 TUI** —— 它是目前唯一能稳定出声的办法,哪怕当初的理由是错的。
- 但要知道**它的代价**:node-pty、不请自来的音乐、听歌记录污染。而如果冷启动只在"一次会话的第一首"发生一次,这笔买卖大概率不划算 —— 失败重试一次即可,不值得为它常驻一个会自己放歌的终端进程。
- 查明冷启动的关键线索:**热 = 100%,冷 ≈ 20%**;失败时命令根本没送到 daemon。

### 2.3 已排除路线备忘

- **QQ 音乐开放平台**:能力更全(播放直链到全景声、每日30首、三码合一 OAuth、官方 MCP `iot-mcp.y.qq.com`)但"暂不支持个人开发者申请接入",申请链接都要联系商务。若未来开放个人,官方 MCP 最值得回看。
- **开源生态实况**(11 项目核对):全部走逆向、无一走官方;法律打击针对基础设施(Binaryify 2024 被网易法务打到删库、listen1 2017 被 QQ 音乐 DMCA)而非使用者;活最久的是"本体零协议"插件化架构(LX Music 52k★/MusicFree 25k★)。若切逆向备胎,依赖锁 `@neteasecloudmusicapienhanced/api`(唯一活跃 fork),抄 go-musicfox(扫码登录+UNM)与 AlgerMusicPlayer(本地服务化+unblockMusic.ts)。
- **UNM 解灰 / mediaremote 伴生**:分别是逆向路线的灰歌补充、最后兜底,主路线用不上。

### 2.4 AI DJ 先例与台词生成

- **Spotify AI DJ**:选曲(个性化引擎+LLM 节目单)→ 台词(LLM+人工核验事实)→ TTS,歌曲间隙插播 ~30 秒——**间隙插播本来就是主形态**,ncm-cli 路线不损失这个核心。
- **FlowState-Radio**(最贴近的开源先例):DeepSeek 选歌 + DJ 串词 + FIFO jobQueue **在上一首播放期间预生成**;segment 类型 + dedupKey 去重。
- **日落电台**:网易云听歌数据 → 品味档案 → DJ 播报,LLM 结构化输出 `{say, play[], reason, segue, mood}`。
- **防幻觉**:事实类内容只从可引用的素材 grounding——歌词(`song lyric`)、**热评(`comment list-hot`,v6 更正:它一直都在)**、听歌历史(`user history`/`listen-ranking`)、专辑简介(`album get --descFlag`);推荐理由结合时段与写代码场景是 LLM 自由发挥区。不知道就别编:一个讲得很自信的错故事比不讲糟得多。

### 2.5 TTS 选型(复用 voice 域)

| 方案 | 价格 | 结论 |
|---|---|---|
| **阿里百炼 CosyVoice(qwen)** | ~2 元/万字符,有免费额度 | **首选:voice 域已支持 qwen TTS,零新增接入** |
| MiniMax speech-2.6-turbo | ≈4 元/万汉字,音色复刻 9.9 元 | 次选,想要更好音色时加 provider |
| OpenAI gpt-4o-mini-tts | ≈$0.015/分钟 | voice 域已支持,现成选项 |
| edge-tts / 本地 kokoro | 免费 | 只做 dev 兜底,不进主链路 |

成本量级:~12 首/小时 × 150 汉字串词 ≈ TTS 0.7 元/小时 + LLM <0.1 元/小时,可常开。

### 2.6 仓库基础设施复用

- **强复用**:voice 域 TTS(`voice:synthesize` 返回 audioBase64)、IPC 新域模板(channels.ts + src/main/ipc/*.ts + preload)、设置系统四处模板(voice 是范本)、悬浮小窗模板(apps/electron/src/window/ 的 todo-plan-window,routeHash 加载独立路由)。
- **需新建**:ncm-cli 驱动层、编排器、电台小窗 UI。
- **弱复用**:scheduler 分钟级粒度,切歌靠 state 轮询,不走 scheduler(整点节目可选用)。

## 3. 方案架构

```
┌─ Electron Renderer ─────────────────────────────────────────────┐
│  电台小窗(独立 BrowserWindow,routeHash=#/radio)+ sidebar 入口│
│  radioStore (pinia)                                             │
│   ├─ 节目单(日推/FM/心动,过滤 visible=false / plLevel=none) │
│   ├─ 播放状态镜像(来自 main 的 state 轮询事件)               │
│   └─ DJ 语音播放:<audio> 播 TTS blob(音乐在 mpv,互不占用) │
└───────────────┬─────────────────────────────────────────────────┘
                │ platformApi(music:* IPC + music:state 事件)
┌───────────────┴─────────────────────────────────────────────────┐
│  Electron Main:src/main/ipc/music.ts                           │
│   ├─ NcmCliDriver(packages/onething-runtime/src/music/,      │
│   │   Electron-free,MusicBackend 接口的第一实现):            │
│   │    spawn('ncm-cli', [...], --output json) + 解析/重试      │
│   │    环境检测(node/ncm-cli/mpv)、login --background 代理   │
│   │    state 轮询循环(播放中 1s,空闲停)→ 事件广播          │
│   │    配额守卫:计数 + "请求总量超限"降级(哑巴电台模式)    │
│   ├─ RadioConductor(编排器):                                 │
│   │    选曲(recommend daily/fm JSON)→ 维护节目单            │
│   │    尾声检测(duration - position < N 秒)→ 触发 DJ 流程   │
│   │    切歌:pause → renderer 播 TTS → 完毕 next/resume       │
│   │    伪 ducking(可选):TTS 前 volume 25 → 说完 volume 100 │
│   └─ DJ 管线:素材(song lyric + 元数据 + 听歌排行钩子)      │
│        → LLM 串词(复用 provider 系统,结构化输出)            │
│        → voice:synthesize 预生成(qwen CosyVoice 首选)        │
└─────────────────────────────────────────────────────────────────┘
         │ 子进程                          │ 已有基础设施
   ncm-cli daemon → mpv 出声         voice 域 TTS
```

关键决策:

1. **驱动器放 main(经 runtime 包),不放 apps/server**:凭证由 ncm-cli 自管(~/.config/ncm-cli/)、没有音频流要代理、声音只在本机出——server 的三个存在理由都不成立。核心逻辑收进 `packages/onething-runtime/src/music/` 保持 Electron-free,未来 server 想复用再挂。
2. **MusicBackend 接口先行**:NcmCliDriver 是第一实现;api-enhanced 逆向实现(§7-B)作第二实现保留,切换不动上层。
3. **音乐轨与 DJ 轨物理分离**:音乐在 mpv,DJ 语音走 renderer `<audio>`(voice 域 TTS 输出)。插播时序 = 尾声检测 → `pause` → 播 TTS → `next`;若 Phase -1 实测 `queue add <TTS音频URL> --next` 可行,则 TTS 直接进 mpv 队列,衔接更顺滑。
4. **强制 mpv 后端**(orpheus 无 state);设置页环境检测引导 `brew install mpv` + `npm i -g @music163/ncm-cli`。
5. **TTS 与串词全部预生成**(上一首播放期间跑完),间隙零等待;DJ 失败静默跳过,绝不阻塞音乐。
6. **配额意识贯穿**:数据类命令(recommend/lyric/search)计数+缓存(日推缓存当天);超限进"哑巴电台"(继续播已排队列,DJ 停播报)。

### DJ 台词管线

```
节目单选定下一首
  → 素材:元数据(歌名/歌手/专辑/tag)+ song lyric 前几行
    (+ 可选:听歌排行/最近播放,做"你最近常听"个性化钩子)
  → LLM(现有 provider,结构化输出):
     { say: string,          // 串场词,120~200 汉字
       mood: string,          // 供语速/音量微调
       factConfidence: 'grounded' | 'soft' }
     约束:歌手/专辑背景等事实仅从素材推断,无素材支撑用
     "印象/据说"级弱断言;推荐理由结合时段与写代码场景;
     dedupKey 防复读
  → voice:synthesize 预生成音频,入 DJ 队列
  → 尾声触发 → (可选 volume 25)→ pause → 播 DJ 语音 → next
```

### 首次引导向导(全部在应用内完成,零终端操作)

电台小窗/设置页首次打开时走四步向导,每步由 main 侧 NcmCliDriver 代理执行:

1. **环境检测**:检查 `ncm-cli`/`mpv` 是否可用(`--version` 探测);缺失时一键安装(main spawn `npm i -g @music163/ncm-cli` / `brew install mpv`,流式回显安装日志;npm/brew 本身缺失才降级为展示手动指引)
2. **凭证录入**:UI 表单填 appId + privateKey → main 代理 `ncm-cli config set`(privateKey 经 stdin/临时文件传递,避免出现在进程 argv 被 ps 看到;应用自身不持久化密钥,只存"已配置"布尔态——密钥真身只活在 ncm-cli 的 AES 加密配置里)
3. **扫码登录**:代理 `ncm-cli login --background`,解析输出的二维码内容渲染进小窗,轮询 `login --check` 直到成功
4. **自检**:跑一次 `recommend daily --limit 1` + `state` 验证全链路,展示结果与今日剩余配额

### 设置(`MusicSettings`,挂 `AppSettings`)

- 环境:ncm-cli/mpv 检测状态、重新配置凭证入口(复用向导步骤)
- 账号:登录状态 + 重新扫码 + 退出
- 播放:电台源(私人FM / 每日推荐 / 心动模式 / 红心歌单)
- DJ:开关、播报频率(每首/隔 N 首/仅整点)、人格 preset(深夜电台/元气早间/毒舌乐评人)、TTS 音色(复用 voice 设置)、伪 ducking 开关
- 配额:今日调用计数展示、超限降级提示

## 4. 实施计划

**Phase -1 — 前置(已完成 2026-07-15)**
- ✅ 开放平台个人入驻完成,appId/privateKey 已到手,**每日配额 5000 次**(很宽裕:~12 首/小时的选曲+歌词一天用不到十分之一)
- 原计划的终端手动实测(state 字段可靠度、`queue add` 能否插非网易音频)**并入 Phase 0 开发联调**:引导向导做好后凭证从应用内录入,两项实测在真机联调时验证,queue 时序不通就走 pause 时序(方案已双轨设计)

**Phase 0 — 能听(已实施 2026-07-15,待真机走查)**
- ✅ `packages/onething-runtime/src/music/`:MusicBackend 接口 + NcmCliDriver + RadioService(节目单/尾声检测/配额守卫);35 个单测
- ✅ `apps/electron/src/music/`:IPC 注册器 + process-runner(spawn 能力注入,PATH 补 homebrew;privateKey 走 0600 临时文件不进 argv)
- ✅ `apps/electron/src/window/music-window.ts` + window/index.ts 的 open/hide/toggle + 窗口尺寸记忆
- ✅ `src/main/music/{service,ipc}.ts` + handlers.ts 注册;configured/source 回写 settings
- ✅ shared:`ipc/music.ts` 类型 + MUSIC_* 通道 + MusicSettings 三件套
- ✅ preload/types/web stub(web 端返回"仅桌面端可用")
- ✅ renderer:`stores/music.ts` + `components/music/MusicWindow.vue`(四步向导 + 画线风播放器)+ App.vue `#/music` 路由 + sidebar Radio 入口
- 真机走查清单(需用户凭证):① 向导四步能否零终端跑通;② state 的 position/duration 精度与抖动;③ `queue add <本地音频/URL> --next` 能否插入非网易音频(决定 Phase 1 插播时序);④ 私人 FM 连播与自动切歌

实施中踩到并修复的坑(供后续 Phase 参考):
- **vite alias 表是前缀匹配 + 有兜底项**:`@onething/electron-host/window` 与 `@onething/runtime` 的兜底会把未登记的子路径吞成 `index.ts/music-window`。**每个新子路径必须在 electron.vite.config.ts 显式登记**(package.json exports 不够,typecheck 也发现不了——只有 build 会炸)。
- **ncm-cli `config list` 有两种输出**:未配置时是 `尚未配置。…` 整句,配置后才是 `appId: xxx (凭证文件)` 列表(真机实测,与文档推断不同)。
- **ncm-cli 硬错误只走 stderr、stdout 为空**(如未设 API key),不是解析失败,不该告警。
- **`config`/`logout` 不吐 JSON**(早于 `--output json` 约定):`config set` 成功打印 `✓ 已设置 appId = x`、失败打印中文说明并 **exit 1**;`--output json` 传给它会被静默忽略。所以这类命令必须走 `runCliText`(按退出码判成败),用 `runCli` 强求 JSON 会在"写入其实已成功"之后抛错——首次真机就踩了:appId 已落盘、privateKey 因抛错没写成,配置卡在半截。**播控/state/login --check/recommend 才是 JSON 命令。**
- 只读真机探测挂在 `ncm-cli-live.probe.test.ts`(`MUSIC_LIVE_PROBE=1` 开启,只调 --version/config list/login --check/state,绝不写配置)。

**Phase 1 — DJ 开口(~2 天)**
- RadioConductor:节目单维护、尾声检测、插播时序(按 Phase -1 实测定)
- DJ 管线:素材聚合 → LLM 结构化串词 → `voice:synthesize` 预生成 → DJ 队列;dedup
- 小窗显示串词文本;设置页"音乐电台"分组
- 验收:两首歌之间 DJ 中文播报推荐理由,切歌无等待,DJ 失败不影响音乐

**Phase 2 — 电台质感(~1.5 天)**
- 伪 ducking(volume 25→100)、mood 驱动语速、"讲讲这首歌"即点即讲
- 电台源切换、心动模式、听歌排行个性化钩子("你这个月第 N 次循环这首")
- 超限降级(哑巴电台)、daemon 状态抖动容错(异常重试/重启)、不可播歌曲过滤与跳过提示

**Phase 3 — 可选进阶**
- 聊天内自然语言点歌/换台(music tool 进现有 tool 体系;官方 NetEase/skills 的 SKILL.md 可直接参考命令拼法)
- 编码情境感知:DJ 串词引用当前 goal/session 主题("这首歌陪你把那个播放器 bug 修完")
- scheduler 整点节目(报时+新歌速递);MiniMax TTS/音色复刻;热评素材补充评估(§7-B 混合模式)

## 5. 风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| 每日调用超限 | 中(数字未知) | 计数+缓存;日推缓存当天;超限哑巴电台;入驻后第一时间确认配额 |
| CLI 0.1.x 不稳(daemon 抖动、闭源难排查) | 中 | state 异常重试/重启 daemon;`diag report`;版本 pin + upgrade 提示 |
| 版权池小,SVIP 也播不了部分歌 | 确定发生 | 过滤 visible/plLevel,跳过并提示;接受(合规的代价) |
| 官方调整个人政策/下线 CLI | 低-中 | MusicBackend 抽象,api-enhanced 备胎(§7-B)可切 |
| DJ 幻觉(无热评 grounding) | 中 | 事实仅从歌词/元数据推断+弱断言;后期评估热评补充 |
| TTS 断供 | 低 | 主链路付费 API(qwen 已接入);DJ 失败静默跳过 |
| 分发合规 | 低 | 不捆绑 ncm-cli(闭源混淆),引导自装;功能默认关闭 |

## 6. 体验上限对照(自知之明)

相对逆向自建播放器,ncm-cli 路线放弃了:真 ducking/crossfade(音频流不在我们手里)、热评素材、`audio.ended` 精确事件(改为轮询)、无配额限制。保住了:官方合规、零封号风险、核心体验(个性化选曲 + DJ 间隙播报——这与 Spotify AI DJ 主形态一致)。若实施后觉得体验不达标,切 §7-B。

## 7. 备选方案(已考虑,保留设计)

- **A. QQ 音乐官方平台**:能力全但个人完全关门(商务邀约制)。未来开放个人时优先看它的官方 MCP。
- **B. 逆向 api-enhanced 自建播放器**(v3 曾定为主路线,完整设计已评审过):apps/server 起 /api/music/* 域(`@neteasecloudmusicapienhanced/api` 库 require + 扫码登录 + cookie 落 server + `/stream` 音频代理解 Web Audio 跨域静音)+ renderer Web Audio 双 GainNode(尾奏 ducking ~22% + equal-power crossfade)+ 热评素材 + UNM 解灰(`match()`,抄 AlgerMusicPlayer unblockMusic.ts)。体验上限最高,风险=违反 ToS/账号(对策:小号+低频只读+限速+不分发)。**作为 MusicBackend 第二实现,官方通道停摆或体验不达标时启用**;也可做混合模式(播放走 ncm-cli,仅热评走逆向只读)。
- **C. 伴生模式(mediaremote-adapter)**:读本机网易云 App 正在播放 + DJ 叠加,零数据能力,最后兜底。
- **D. 内嵌网页版 webview**:无编排能力,放弃。

## 8. 参考

- ncm-cli: npm `@music163/ncm-cli` · 产品页 https://music.163.com/st/ncmcli · 官方 Skills https://github.com/NetEase/skills · 官方技术博客 https://segmentfault.com/a/1190000047685734
- 网易云开放平台(个人接入指南/FAQ): https://developer.music.163.com/st/developer/document
- api-enhanced(备胎): https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced · UNM: https://github.com/UnblockNeteaseMusic/server · AlgerMusicPlayer: https://github.com/algerkong/AlgerMusicPlayer · go-musicfox: https://github.com/go-musicfox/go-musicfox
- QQ 音乐开放平台(横评): https://developer.y.qq.com/docs/openapi
- AI DJ 先例:FlowState-Radio https://github.com/Jonhow324/FlowState-Radio · writ-fm https://github.com/keltokhy/writ-fm · Spotify AI DJ 拆解 https://medium.com/@ragyashraf/spotifys-new-ai-dj-architecture-and-technical-overview-ea7d35f0b487
- TTS:百炼 CosyVoice https://help.aliyun.com/zh/model-studio/cosyvoice-large-model-for-speech-synthesis/ · MiniMax https://platform.minimaxi.com/docs/guides/pricing-paygo
