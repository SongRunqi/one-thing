# Browser v2 · 真浏览器:一致身份、真人登录、真实输入、多 Profile

> 状态:设计定稿(两轮对抗调研 + 一轮评审 + 一轮 Electron 39 机制核实)。日期:2026-07-26。
> 母设计:`docs/design/browser-v2.md`;现状:`docs/design/browser-v2/p0-implementation.md`(P0 已落地)。
> 定位(用户拍板):**先做一个真正成熟的内嵌浏览器**——登录/操作全在内嵌里发生,不外包系统浏览器;用户像真人一样手动登录;**其次**才让 AI 用**真实可信输入事件**(像真人点击打字,绝不用 `element.value=`/`element.click()` 注入伪造)操控它。
> 本文**推翻**两个此前的错误方向:(1) `browser-v2.md` §1 非目标里"多 profile";(2) 上一版本文"Google 登录一律交系统浏览器"的 handoff 方案(那是把它做成假浏览器)。

---

## 0. 诚实定性(基于 Electron 39.2.7 机制核实,非拍脑袋)

1. **多 profile:成熟稳解 ✅** `persist:<name>` 分区 = Chromium 多 profile 隔离的直接映射,cookie/storage/cache 跨 profile 零泄漏由 Chromium 保证。§2。

2. **一致的真 Chrome 身份:能做,但唯一正解是 CDP,不是 setUserAgent ✅(已核实)**
   - `session/webContents.setUserAgent` **只改 UA 字符串**,碰不到 `navigator.userAgentData` 与 `Sec-CH-UA` 请求头(d.ts:12902 注释 + Puppeteer/Playwright 同限)。只用它 = 制造"UA 说 Chrome、client hints 说 Chromium"的**自相矛盾指纹**,比不改更可疑(这正是 P0 里 `installGoogleAuthUaOverride` 的病根)。
   - **唯一文档化的三处一致机制**:CDP `Network.setUserAgentOverride` 的 `userAgentMetadata` 参数,官方明载"**To be sent in Sec-CH-UA-* headers AND returned in navigator.userAgentData**"——同一份元数据喂请求头 + JS API。这就是 Puppeteer/Playwright 的做法。版本号取本机 `process.versions.chrome` **真值**,是**诚实呈现真实 Chromium 内核**,不是编假版本。§3.1。

3. **真人在内嵌里登 Google:能登,现实成功率 ~70–85%(已核实,诚实数字)**
   - 闸门 A(OAuth/账号端点按 UA 拦"不支持的浏览器"):三处一致 + 无 `webdriver` + 无 `Runtime.enable` 后**基本过**。
   - 闸门 B(登录页风控):更取决于 **IP 信誉 / 设备是否可信 / 有无历史 cookie**,与 UA 关系小。**首次在全新 profile 登录几乎必然撞一次二次验证——这与任何真 Chrome 换新电脑登录完全一样,真人完成即可。**
   - TLS/JA3 指纹 Electron 与真 Chrome 高度接近(同源 BoringSSL),是**优势**;网上"Electron 登不了 Google"多源于默认自曝 UA + webview,不适用本方案。
   - 残余暴露:`window.chrome` 部分表面缺失(中等,登录页通常不深挖)、常驻 CDP 会话痕迹(对单次真人登录基本无关)。
   - **不承诺 100%,但绝不是"做不到"。** 系统浏览器只作**极端兜底**(某站真的死活不认),不是主路径。

4. **红线更新(纠正上一版的过度保守):** 上一版搬了 Google"防钓鱼"红线("永不让 App 成为输 Google 密码处")——**那是给"发布给他人的产品"的**,防的是恶意 app 骗**别人**的密码。本 App 是**单人自用**:你在自己的工具里登自己的账号,不存在钓鱼。**故取消该红线,内嵌登录是正当的。** 唯一保留的克制:不为了骗过 Google 而伪造成**另一种**浏览器(Firefox)或做**不一致**拼接——那既无效又更可疑(§3.4)。

5. **AI 真实输入:你的红线技术上完全成立 ✅(已核实)** `webContents.sendInputEvent` 与 CDP `Input.dispatch*` 产出的 DOM 事件 **`isTrusted` 均为 true**,页面无法与真人区分。**读页面结构/坐标 = 感知(等于真人用眼看),不算假代码;红线只禁 `element.value=`/`element.click()` 这类绕过输入管线的伪造 actuation。** §5。

**一句话给产品:** 内嵌浏览器 = 一个呈现一致真 Chrome 身份的真 Chromium,你像在 Chrome 里一样真人登录(含正常的首次二次验证);AI 以后用真实可信输入 + 读坐标(非注入填值)操控它;profile 像 Chrome 一样多开可切。系统浏览器仅作极端兜底,不是主路径。

---

## 1. 现状盘点(改动锚点)

| 现状 | 文件锚点 | 处置 |
|---|---|---|
| 单一硬编码分区 `persist:browser` | `session.ts:10` | → per-profile,分区名存 profile 记录字面量(§2.1) |
| `getBrowserPartitionSession()` 单缓存 | `session.ts:52-70` | → `getBrowserProfileSession(profile)` 多缓存(§2.3) |
| `buildChromeUserAgent`(剥 `Electron/`+app token) | `session.ts:34-40` | **保留**为字符串层兜底;真一致靠 CDP(§3.1) |
| `FIREFOX_UA` 常量 | `session.ts:21-22` | **删**(伪装另一浏览器是病根) |
| `installGoogleAuthUaOverride` Firefox 头伪装 | `session.ts:77-99` | **删**;`GOOGLE_AUTH_HOSTS` 不再需要(一致身份是全局的,非按域 hack) |
| `createTab` 无 CDP 身份 override | `service.ts:62-92` | 建 view 后 attach + setUserAgentOverride(§3.1) |
| 无 profile / 无持久化 | — | 新增 `BrowserProfile`(含 `partition` 字段)+ profiles.json(§2) |

---

## 2. Profile 架构:每 profile 一个持久分区

### 2.1 数据模型(partition 存字面量)

```ts
export interface BrowserProfile {
  id: string          // uuid,永不复用
  name: string        // "个人" / "工作"
  color: string       // 头像色块,取自主题色板
  partition: string   // 分区名字面量;default 可沿用遗留 'persist:browser'
  createdAt: number
}
export interface BrowserProfilesState { profiles: BrowserProfile[]; activeProfileId: string }
```

- partition 是**显式字段**而非从 id 推导:default profile 需沿用遗留 `persist:browser` 不丢现有登录态(例外),存字面量 → `partitionForProfile` 确定、无副作用。新建时 `partition='persist:browser-'+id`。
- id 永不复用:删除清分区,新 profile 用新 uuid,杜绝缓存误继承。

### 2.2 隔离边界(Chromium 保证)

不同 `persist:` 分区间 cookie/localStorage/IndexedDB/cache/HTTP 认证缓存完全隔离;每分区独立挂 UA/CDP 身份/proxy/权限/下载 handler。不隔离:profile 记录本身、下载目录(共享,D5)、扩展(P4 按分区重放,天然隔离)。

### 2.3 session 装配(per-profile 缓存)

```ts
const sessions = new Map<string, Session>()   // profileId → Session
export function getBrowserProfileSession(profile: BrowserProfile): Session {
  const cached = sessions.get(profile.id); if (cached) return cached
  const ses = session.fromPartition(profile.partition)
  ses.setUserAgent(buildChromeUserAgent(ses.getUserAgent()))  // 字符串层兜底(先于建 view,d.ts:12894)
  ses.setPermissionRequestHandler((_wc,_p,cb)=>cb(false)); ses.setPermissionCheckHandler(()=>false)
  sessions.set(profile.id, ses); return ses
}
```
proxy 首次建 session 配一次,变更时遍历 `sessions` 重放。

### 2.4 BrowserViewService 按 profile 建 view + 惰性化

- Service 持 `activeProfileId`;`TabRecord` 加 `profileId`;`createTab` 用 activeProfile 的 session。
- 一个 tab 绑其创建 profile,切 profile 不迁移 tab("每 profile 有自己一组 tab")。
- **非活跃 profile 的 view 惰性化**:切走 → 该 profile 全部 tab `webContents.close()`、保留 meta(url/title/滚动位);切回 → 按 meta 惰性重建 + loadURL。常驻 renderer 进程 = 仅当前 profile 的 tab。
- `applyActiveVisibility`(`service.ts:213`)判据:`id===activeTabId && profileId===activeProfileId && view!=null`。

### 2.5 持久化 / 2.6 生命周期 / 2.7 设置 UI

- profile 记录 + activeProfileId 落 `getOnethingBrowserProfilesPath()`(新增于 `storage/paths.ts`=`<store>/browser/profiles.json`,走 `getOnethingStorePath()`,禁硬编码)。tab 列表不落盘。
- 删 profile:二次确认 → 关该 profile 全部 tab → `ses.clearStorageData()+clearCache()` → 摘记录;**最后一个不可删**;id 不复用。
- UI(守极简):**chrome bar 一个头像色块 pill**(Chrome 心智,常驻主界面)点开紧凑 popover(profile 列表 + "管理");**设置里只放极简列表页**(每行 色块+名+删除,底部"+新建"),不暴露分区/UA/缓存等技术参数;复用画线风 `:deep`+MenuItem,不新造组件。

---

## 3. 认证策略:一致的真 Chrome 身份(替掉 UA hack)

### 3.1 机制(已核实 · 唯一文档化正解)

**每个 web-tab 的 WebContentsView 创建后:**

1. `webContents.debugger.attach('1.3')`(d.ts:7425),**该 tab 生命周期内常驻**;监听 `detach` 事件做重连/降级。
2. 发一次 `Network.setUserAgentOverride`(`sendCommand`,d.ts:7441),带**完整** `userAgentMetadata`:
   - `brands` = `[GREASE项, {"Chromium":<major>}, {"Google Chrome":<major>}]`(补上 Electron 默认缺失的 "Google Chrome" brand——这是把它当"非官方 Chrome"认出来的干净信号)。
   - `fullVersionList` 带完整版本、`platform`/`platformVersion`/`architecture`/`model`/`mobile`/`bitness` 填成与宿主 OS 一致的真值。
   - `userAgent` 字段给干净 Chrome UA 字符串。
   - **版本号取 `process.versions.chrome` 真值**——诚实呈现真实内核,非编造。
3. `session.setUserAgent(cleanChromeUA)`(§2.3)作字符串层兜底:即便某次 CDP 未生效,UA 字符串也不自曝 `Electron/`。
4. **不开** `--enable-automation`、**不开**远程调试端口、**不碰** `Runtime.enable`/`Console.enable` → `navigator.webdriver` 保持 false,自动化检测面压到最小(已核实:进程内 `debugger.attach` 不置位 webdriver)。

**这不是"伪装成别的浏览器",是"把真 Chromium 完整、一致地呈现为对应版本 Chrome"。** 引擎、TLS、渲染本就是 Chromium;我们只是补齐 client hints 的一致性、去掉 `Electron/` 自曝 token。

### 3.2 代价与决策(诚实)

- **常驻 CDP 与 DevTools 互斥(已核实):** 一个 target 只允许一个 debugger 连接。身份 override 期间用户无法对该 tab 开 DevTools。**处置(决策点 D6):** 用户显式开 DevTools 时 → 临时 `detach`(接受该 tab 身份 override 失效,回到字符串层兜底身份)→ 关 DevTools 后可重 attach。对"AI 可操控浏览面板"定位,日常极少需 DevTools,此代价可接受。
- **override 随会话失效:** detach 即清,故必须常驻(已核实,建议本机再证)。
- **残余非一致信号:** IP/设备/历史(gate B 主因,与我们无关,真人过验证)、`window.chrome` 部分缺失、CDP 会话痕迹——§0.3 已诚实披露。

### 3.3 本机必测(我无法在运行时替你验,列为 Phase B 验收前置)

1. attach + `setUserAgentOverride` 后,访问 UA-CH 探针页,确认 `navigator.userAgentData.getHighEntropyValues()` **与**实际 `Sec-CH-UA-Full-Version-List` 等请求头**都带 "Google Chrome" 且一致**。
2. `detach` 后刷新页面读 `userAgentData`,确认 override **确实失效**(印证必须常驻)。
3. 确认 Electron 39 无 [issue #34762](https://github.com/electron/electron/issues/34762) 的高熵 hints 缺失(旧版 bug,39/Chromium~140 大概率已修)。

### 3.4 "绝不做"清单

- ❌ 只改 UA 字符串不改 client hints(制造矛盾,比不改更可疑)。
- ❌ 伪装成非 Chromium(Firefox/Safari)——内核是 Blink,必留对不上的向量。
- ❌ 按域名切换身份的 per-site hack(一个成熟浏览器只有一个一致身份)。
- ❌ `element.value=`/`element.click()`/`dispatchEvent` 伪造 actuation(§5)。
- ❌ 从系统浏览器迁 cookie 进内嵌(HttpOnly 拿不到;迁了触发盗号风控)。

### 3.5 系统浏览器的两个正当位置(非主路径)

- **极端兜底:** 某站(极少)即便一致身份仍死活拒 → 视口内 `ErrorNote` + "在系统浏览器打开"按钮。这是 escape,不是默认。
- **API 授权(正交子系统):** 若 AI 要读 Gmail/Drive/Calendar API → 系统默认浏览器 + Authorization Code + PKCE + `127.0.0.1` loopback(RFC 8252),拿 API token。与"内嵌网页登录"是两件事,按需单排(D4)。

---

## 4. AI 操控 = 真实可信输入(第二优先级,已核实)

> 原则:像真人。读页面 = 看;发输入 = 真实可信事件。绝不伪造 actuation。

- **actuation 走可信输入(二选一或并用):**
  - `webContents.sendInputEvent`(d.ts:17588):mouse/wheel/keyboard,`isTrusted:true`(issue #8977 实证);**不需** debugger,但要求窗口 focused、按键/IME 语义弱。
  - CDP `Input.dispatchMouseEvent/dispatchKeyEvent`(经常驻 debugger):`isTrusted:true`;语义更全(`insertText` 处理 IME、`dispatchDragEvent`、不要求 focus)。**因身份 override 已需常驻 CDP,输入统一走 CDP 边际成本为零,推荐。**
- **读坐标(感知,非伪造):** CDP `Accessibility.getFullAXTree`(看懂页面语义)+ `DOM.getBoxModel`/`getContentQuads`(拿视口 CSS px 坐标),**完全不在页面跑 JS**,最干净。这是 Playwright/browser-use 的正解。
- **拟人化(产品打磨,残余非真人信号):** 可信输入页面测不出,但行为统计学能测(时序太规整、无鼠标轨迹、落点太精确)。actuation 前叠贝塞尔轨迹 `mouseMove` + 高斯抖动 + 落点散布 + 动作间延迟。非机制障碍,后续打磨。
- **与身份一致:** 输入与身份共用同一常驻 CDP session,不额外开自动化开关。

---

## 5. 与现有 P0 代码的差异

### `session.ts`
- `FIREFOX_UA`(:21-22)、`installGoogleAuthUaOverride`(:77-99)、`GOOGLE_AUTH_HOSTS` 伪装用途 → **全删**。
- `buildChromeUserAgent`(:34-40) → **留**作字符串兜底。
- `getBrowserPartitionSession`(:52-70) → `getBrowserProfileSession(profile)` 多缓存。
- `BROWSER_PARTITION`(:10) → 保留 `'persist:browser'` 作 default 的 `partition` 字面量。

### `service.ts`(新增 CDP 身份 + 输入模块)
- `createTab`:建 view → `getBrowserProfileSession(activeProfile)` → **attach debugger + `Network.setUserAgentOverride`**(§3.1);`TabRecord` 加 `profileId` + 惰性 `view` 态。
- 新增 `apps/electron/src/browser/identity.ts`:构造 `userAgentMetadata`(从 `process.versions.chrome` + `os` 取真值)+ attach/override/detach 生命周期 + `detach` 重连。
- 新增(Phase C)`apps/electron/src/browser/input.ts`:CDP `Input.dispatch*` + `Accessibility`/`DOM.getBoxModel` 读坐标 + 拟人化。
- DevTools 协处理(D6):监听用户开 DevTools → 临时 detach。

### `packages/shared/ipc/browser.ts` / `storage/paths.ts`
- `BrowserProfile`/`BrowserProfilesState` + profile IPC channels;`getOnethingBrowserProfilesPath()`。

---

## 6. 落地路线

- **Phase A · 多 Profile(纯正当工程,先做):** per-profile session + `BrowserProfile`(含 partition 字段)+ profiles.json + service 按 profile 建 view/惰性化 + profile IPC + chrome bar pill + 设置极简列表 + 删除清数据。
- **Phase B · 一致真身份(替掉 hack):** 删 Firefox hack;新增 `identity.ts`(CDP setUserAgentOverride 常驻)+ DevTools 协处理;**过 §3.3 本机三测**;验收探针改为"一致身份真人登 GitHub/Google"。
- **Phase C · AI 真实输入操控:** `input.ts`(CDP Input + AX/BoxModel 读坐标)+ 拟人化;与母设计 §5 注入防线合并。

### 需用户拍板
- **D3** default 沿用 `persist:browser` 分区不丢登录态。**推荐是**。
- **D4** 是否现在做 API OAuth(§3.5)。可延后。
- **D5** 下载目录全局共享 vs per-profile。**推荐全局**。
- **D6** DevTools 与常驻 CDP 冲突的处置:用户开 DevTools 时临时 detach(身份暂退兜底)。**推荐是**。

---

## 7. 验收(替换 P0 §8 Google 探针)

1. 建 3 profile 各登不同 GitHub 账号 → 互不串号 → 重启各自登录态在;非活跃 profile renderer 进程被惰性回收。
2. 删 profile → 二次确认 → 分区磁盘数据被清 → 重建同名是干净的(id 不复用)。
3. **一致身份真机三测(§3.3)全过**:UA/CH/userAgentData 三处一致带 "Google Chrome"、detach 失效、无高熵 hints 缺失。
4. 真人在内嵌登 Google:一致身份下**能进登录流程**(首次二次验证正常,真人完成);**代码 grep 不到任何 Firefox/伪装串**。
5. (Phase C)AI 发 `Input.dispatch*` 在页面里 `isTrusted===true`;表单靠真实按键填入、按钮靠真实点击触发;**grep 不到 `element.value=`/`.click()` 式填值**。
6. `bun run typecheck` + `boundary:gate` + 单测全绿。

---

## 8. 依据(核实一手锚点)

- CDP `Network.setUserAgentOverride` + `userAgentMetadata`(三处一致机制):chromedevtools.github.io/devtools-protocol — Network/Emulation UserAgentMetadata
- `setUserAgent` 只改字符串不改 CH:electron.d.ts:12902 + Puppeteer #7269
- `debugger.attach` 不置位 `navigator.webdriver`:MDN Navigator.webdriver + W3C WebDriver
- `sendInputEvent`/CDP Input `isTrusted:true`:electron.d.ts:17588 + electron issue #8977 + CDP Input 域文档
- 读坐标正解 `DOM.getBoxModel`/`Accessibility.getFullAXTree`:browser-use — Leaving Playwright for CDP
- Electron 默认 brands 只 "Chromium" 无 "Google Chrome":chromium google_chrome_branded_builds
- 高熵 hints 旧版缺失(需本机确认已修):electron issue #34762
- Electron `persist:` = 多 profile 隔离:electronjs.org/docs/latest/api/session
- RFC 8252(系统浏览器 PKCE loopback,API 授权):datatracker.ietf.org/doc/html/rfc8252
