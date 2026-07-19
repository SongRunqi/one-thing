# 音乐状态栏 + 双播放器模式(v7 方案,待拍板)

> 承接 `docs/design/music-radio-netease.md` v6(删 music 工具、skill + bash 直驱 ncm-cli、后台常驻 TUI 撑 mpv)。
> 本文只谈方案,未实施。
>
> **2026-07-16 更新**:§2 原本设计了一套"轮询 `ncm-cli queue` 认曲目 + 读私有 `play-session.json` + MediaRemote"的脏方案,
> 前提是"TUI 下 `state` 只给 status/position,track 是 null"。**那个前提是错的 —— 残缺是 TUI 造成的,不是 CLI 的限制。**
> 无 TUI 时一条 `ncm-cli state` 就给全:`title`/`position`/`duration`/`progress`/`queueLength`。§2 已按实测重写。
> 详见 `music-radio-netease.md` §2.2.3。

## 0. 结论先行

1. 状态栏是 composer 的 **flyout**,不是 dock row —— 挂 `.composer-anchor`(`InputBox.vue:1445`,注释原话 "never affects layout"),`position:absolute; bottom:100%`,天然零布局占位。
2. **收起态不是一条细条,是寄生在两个已有位置**:歌词进 placeholder(那块区域本来就在),`NOW PLAYING ♪` 进 composer 上沿的 frame tag(`.composer-frame-label` 本来就是 absolute)。新增 DOM 高度 = 0。
3. hover composer 上沿 → 展开成一行浮层(曲目/进度/歌词/控件/模式 chip);移开 → 收起。
4. 数据源:**主进程轮询 `ncm-cli state` + 渲染进程本地插值**。不刮 PTY 帧,不上 MediaRemote。
5. **只在 mpv + keepalive 活着时才有栏**。orpheus 下没有 `state`,栏降级成"由网易云 App 播放"一行,不假装有进度和歌词。

## 1. 两种播放器模式

`settings.music.playerBackend` 已经存在(`MusicSettingsTab.vue`),本方案不新造抽象,就是 CLI 的两个后端。

| | **mpv(内置播放器,推荐)** | **orpheus(网易云音乐 App,macOS)** |
| --- | --- | --- |
| 出声方式 | 我们的 PTY 里常驻 `ncm-cli tui` 撑住 daemon → mpv | 唤起本机网易云 App |
| `state` | ✅ **全字段**:`status`/`title`/`position`/`duration`/`progress`/`queueLength`(挂着 TUI 时才残缺,见 §2) | ❌ `云音乐模式下不支持 state 命令` |
| 曲目身份 | ✅ `state.title`(显示串;加密 id 另说,见 §2) | 拿不到 |
| 队列控制 | ✅ `queue add --next` + `next`(`play` 在 TUI 下被拒是设计) | ❌ 队列是 App 的,`queue clear` 无效 |
| 进度条 | ✅ | ❌ |
| 同步歌词 | ✅ | ❌(没有 position 就没有同步) |
| 暂停/切歌键 | ✅ | ❌ |
| 跨平台 | ✅ | 仅 macOS |

**切换点两处,同一条 IPC**(`MUSIC_SETUP` / `setPlayerBackend`):设置页 → 音乐;状态栏展开态的模式 chip。

**切换语义(踩过的坑,必须保留)**:

- 切到 orpheus → 停 keepalive(`src/main/music/ipc.ts` 已实现)。
- 切到 mpv → **绝不起 keepalive**。TUI 一起来就自播每日推荐,切个单选框不该出声。等模型下一条播控 bash 命令懒启动(`prepareForCommand` 钩子)。
- 存凭证/登录 **绝不顺手改 player** —— 这是历史上"用户手动选了 orpheus,一存凭证被悄悄改回 mpv"的原 bug。

## 2. 数据从哪来(全篇最难的一问)

现状:模型走 bash 驱动 ncm-cli,**渲染进程对播放一无所知**。栏要活,得先解决这个。

### 候选

| 路线 | 判断 |
| --- | --- |
| **A. 主进程轮询 `ncm-cli state`** | ✅ **选它,而且它一条就够了**(见下)。 |
| B. 刮 PTY 帧 | ❌ 全屏 ANSI 重绘的混淆 TUI,要维护屏幕缓冲、解析画面,版本一升静默错位。而且 TUI 本身可能要被拆掉。 |
| C. macOS MediaRemote(给 orpheus 补状态) | ❌ 私有框架,macOS 15.4 起对调用者收紧;要写原生模块,且仅 mac。为一个降级模式付原生代价,不值。 |
| D. 读 `~/.config/ncm-cli/*.json` 私有文件 | ❌ **不再需要**(`state` 全给了),也不该要:私有格式、无兼容承诺。 |

### A:一条 `state` 全给了(2026-07-16 实测,无 TUI)

```json
{ "status": "playing", "title": "可惜没如果 - 林俊杰",
  "position": 241.16, "duration": 298.29, "progress": "4:01 / 4:58",
  "currentIndex": 0, "queueLength": 1 }
```

曲名、进度、总长、格式化好的 `progress` 全在里面。原设计里"轮询 `queue` 认曲目 / 刮 `play-session.json` / 反查 `search song`"那一整套**全部删除**。

**两个实测到的硬约束:**

1. **`state` 是零副作用的**:无 daemon 时跑它**不会**拉起 daemon(日志零新增、进程零新增),也不会出声 → **空闲轮询安全**。
2. **`state` 没有 `paused` 状态**,暂停报成 `stopped`。必须靠旁证推断:

   | 判据 | 含义 |
   | --- | --- |
   | `status=stopped` + `position > 0` + daemon 活 | **暂停中** |
   | `status=stopped` + `position = 0` | 真停了 |

   栏和 variable 都不能直接把 `status` 当真。

### 轮询细节(方案 A)

- **开关**:仅 `playerBackend==='mpv'` 且有 daemon 存活时开;无 daemon 即停(`ps -axo pid=,command= | grep "bin/ncm-cli$"`,零成本,比起进程跑 `state` 便宜)。dormant 时零进程、零栏。
- **节奏**:playing 5s;paused 30s。
- **进度**:渲染进程插值 `position + (now - anchoredAt)`,250ms tick,每次轮询重锚。暂停/seek 由下次轮询纠偏(最差 5s 漂移)。**不要**每秒发 IPC。
- **曲目身份**:`state.title`(`"可惜没如果 - 林俊杰"`)。**但它是显示串,不是 id** —— 歌词接口要加密 id。取 id 的办法只剩:模型 `queue add`/`play` 时用的就是 id,若播控走类型化工具则应用直接知道;走纯 bash 则拿不到 → **歌词功能取决于播控是否走工具**(见 `music-radio-netease.md` 的方案三讨论)。宁可不显示歌词,也不要用 title 反查 `search song`(3–15s、花配额、可能配错歌)。
- **歌词**:换歌时**一次** `ncm-cli song lyric --songId <加密id>`(3–15s,异步,不挡栏),LRC 解析成 `[{t,text}]`,per-song 缓存。`noLyric:true` 时 `lyric` 空但 `txtLyric` 有内容必须兜底 —— 那是无时间戳的纯文本,**不进 placeholder**(没法同步),只在展开态显示。

**成本要诚实**:每次 `state` 都是起一个 node 进程,实测本地命令 0.16–0.5s。5s 一次 ≈ 单核 3–10% 常驻(只在放歌时)。这是本方案最大的代价。**实施前先量一版**(§8.2);若超预算,退到"每首歌只锚一次 + hover 时补锚"(单锚插值 4 分钟漂移可接受,但暂停就漂了)。

**铁律**:轮询用异步 spawn。持 PTY 的进程里跑 `spawnSync` 会饿死 TUI,并伪装成 `daemon 无响应（3s 超时）` —— 这个坑吃过几小时。

### IPC

新增 `MUSIC_NOW_PLAYING` 事件(主 → 渲染),**变化才发**(曲目 / 状态 / 歌词到货 / 新锚点)。渲染侧 `music` store 持 `{ track, status, positionAnchor, lyrics }`。

## 3. 收起态:零占位

1. **歌词 → placeholder**。`composerPlaceholder`(`InputBox.vue:811`)已经是多路复用(`Listening...` / `Transcribing...` / `Ask anything...`),歌词是第四路。
   **优先级:voice > 歌词 > 默认**;有草稿时 placeholder 本来就消失;等待权限/正在生成时让位给功能提示。这条是氛围,绝不能盖住功能。
2. **frame tag**:`COMPOSER` → `NOW PLAYING ♪`(参照 voice 的 elapsed 后缀写法)。这是唯一常驻可见痕迹,也是 hover 靶。
3. dock 一行不加。新增高度 0。

## 4. 展开态:hover flyout

- **挂载**:`.composer-anchor` 下,`position:absolute; bottom:100%; left:0; right:0`;`pointer-events` 只给栏本身。
  **冲突点**:`.command-feedback` 也是 `bottom:100%` 的浮层。规则:command-feedback 优先,它在时音乐栏不展开。
- **触发**:hover 上沿热区/frame tag → 120ms 延迟展开(防误触);离开 → 180ms 延迟收起(容忍鼠标走斜线)。动画语汇直接复用 dock-row 的 `0.18s ease + translateY(6px)`。
- **内容**(画线风,单行):`NOW PLAYING` tag · ▸ 曲名 - 歌手 · 1px 进度线(不是圆角进度条)· `1:23 / 3:21` · ⏸ ⏭ · 音量 · 模式 chip `内置 ▾`。
- **可达性**:hover-only 不可达。frame tag 做成 button,focus 也展开;展开态控件必须能 Tab 到。`aria-live="polite"` **只报曲目变化**,不报进度和歌词(否则读屏被刷屏)。

**播控走哪条路**:新增 `MUSIC_COMMAND`(pause/resume/next/prev/volume/seek)→ 主进程直接 spawn ncm-cli,不经模型。注意 v5 删过一个同名通道(窗口播放器时代),这次是**有意重开**,但只服务这条栏。
**风险:两个指挥**(用户点暂停 vs 模型正在编排)。缓解:栏只管"当下这首"的即时控制,不碰队列编排;模型的下一条 `queue add` 照常赢。

## 5. orpheus 的诚实降级

没有 `state`、没有队列控制、没有 position → **没有进度、没有同步歌词、没有暂停键**。不糊弄。

- 栏显示:`NOW PLAYING · 网易云音乐 App` + 最后已知曲目 + "打开 App"(`jumpUrl: orpheus://`)+ 模式 chip。
- placeholder 歌词:**不做**。硬塞静态歌词是骗人。
- 展开态一行小字说明少了什么、为什么,以及"切到内置播放器可获得进度与歌词"。

## 6. 状态机

```
dormant(无 keepalive)          → 无栏、零轮询
  ↓ 模型跑播控 bash(prepareForCommand)
keepalive 起 → TUI 自播每日推荐 → silenceKeepaliveAutoPlay 轮询到 playing 后 queue clear
  ↓ 【静默期内绝不发 now-playing】
真正的 queue add --next + next   → 栏出现
```

**必须处理**:TUI 自播的"秋风"会在静默期内真的 playing。栏若不屏蔽,用户会看到一首没点过的歌闪 15 秒 —— 那正是"开应用就放歌"那个 bug 的视觉版。

## 7. 风险

| 风险 | 对策 |
| --- | --- |
| 轮询进程成本 | 先量(§8.2);超预算退单锚插值 |
| `queue` 不吐加密 id | 退 `play-session.json`;再不行不显示歌词 |
| 私有 json 变格式 | 只当信号,退回纯轮询 |
| 用户与模型双指挥 | 栏不碰队列编排 |
| 歌词抢 placeholder | 优先级 voice > 歌词 > 默认;有草稿即让位 |
| hover-only 不可达 | frame tag 可 focus,控件可 Tab |
| flyout 撞 command-feedback | 后者优先 |

## 8. 待验证

**已验(2026-07-16,见 `music-radio-netease.md` §2.2.3)**:`state` 无 TUI 时给全字段 ✅;`state` 零副作用、不拉起 daemon ✅;`state` 无 `paused` 状态 ⚠️;`pause` 安全、暂停 50s daemon 不死、`resume` 正常 ✅;`stop` 会拆掉会话、害下一次起播掉回冷启动 ⚠️。

**仍待验**:

1. `ncm-cli state` 真实耗时 ×20 采样 —— 决定轮询节奏。
2. orpheus 下有没有任何可读状态 —— 决定降级态能否显示曲目(目前假设:没有)。
3. **冷启动可靠性**(约 20%,原因未知)—— 它决定 TUI 拆不拆,而 TUI 决定这条栏什么时候有数据。

## 9. 实施顺序(拍板后)

- **P0** 数据线:watcher + `MUSIC_NOW_PLAYING` + store,无 UI,console 验证。
- **P1** 收起态:frame tag + placeholder 歌词。
- **P2** 展开态 flyout(只读)。
- **P3** 播控 + 模式 chip。
- **P4** orpheus 降级态。

P0/P1 就已经交付"不占空间的音乐感知";P2 之后才是完整的栏。
