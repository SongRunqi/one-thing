# 启动聊天字体 FOUT 消除:预载 + 配置缓存设计方案

状态:方案设计完成,待实施。
日期:2026-07-07
前置阅读:`src/renderer/main.ts` 的 `preloadCriticalFonts()` 注释(UI 字体预载的既有防线)

---

## 1. 背景与问题

### 1.1 现象

应用冷启动时,聊天区文本可见地"变化一次":恢复上次会话后,中文正文先以回退字体
(Noto Sans SC / PingFang SC)绘制,几百毫秒后整段切换为霞鹜文楷,字形、字宽、行内
排布同时跳动。

### 1.2 根因

用户聊天字体配置为 `chat.chatFontEn: "georgia"` + `chat.chatFontZh: "lxgw-wenkai-screen"`,
启动链路上有一个未覆盖的缺口:

1. `src/renderer/main.ts:46` 的 `preloadCriticalFonts()` 在 Vue mount 前只预载了
   **UI 字体**(Public Sans Variable + Noto Sans SC Variable 各 400/500/600)——
   这是早前为修复侧栏列表字体交换抖动加的防线,聊天字体不在其中。
2. 聊天字体 LXGW WenKai Screen 通过 `src/renderer/styles/main.css` 引入
   `lxgw-wenkai-screen-webfont/lxgwwenkaiscreen.css`,所有 `@font-face` 均为
   `font-display: swap`,且 CJK 字体按 unicode-range 切成大量 woff2 子集,
   只有对应文字上屏后才开始加载。
3. 会话恢复、`MessageList` 渲染时(`--font-body` 内联变量此时已就位,见 1.3 排除项),
   中文先用回退字体绘制;woff2 子集加载完成后浏览器执行 swap → 一次性跳变。

### 1.3 已排除的候选项

| 候选 | 排除依据 |
|------|----------|
| 主题闪变 | `index.html` 内联脚本已从 localStorage 预设 `data-theme` / `data-color-theme` / `cached-theme-css`,与用户设置一致 |
| typography density 后到 | 用户设置为默认 compact,`data-typography-density` 属性变化不产生视觉差异 |
| `--font-body` 变量后到 | 会话恢复发生在 `loadSettings()` 之后(`App.vue` onMounted 的 `Promise.all`),`MessageList.vue:358` 的内联 `--font-body` 在消息首次渲染前已就位 |

### 1.4 附带发现:`georgia` 是 dangling id

设置里的 `chatFontEn: "georgia"` 在 `FONT_REGISTRY`(`src/shared/fonts.ts:20`)中
**不存在**。`buildFontFamily`(`fonts.ts:112`)解析不到英文字体,产出的 font-family
链是 `'LXGW WenKai Screen', Georgia, Cambria, serif`——文楷自带 Latin 字形,
所以英文正文一直落在文楷 Latin 上,Georgia 只是从未命中的兜底。修复见 Phase E。

---

## 2. 设计原则

复用两个既有模式,不引入新机制:

- **localStorage 启动缓存**:`cached-theme` / `cached-color-theme` / `cached-theme-css`
  模式(`index.html:63`、`settings.ts:143`、`themes.ts:248`)。渲染进程设置是异步 IPC
  加载的,启动早期只能靠上一次运行留下的缓存。
- **mount 前字体预载**:`preloadCriticalFonts()` 的 `document.fonts.load()` + 1.5s
  race cap 模式(`main.ts:46-64`)。

目标:冷启动首屏聊天文本零交换;运行时换字体仍即时生效;首次启动(无缓存)不劣化。

---

## 3. 方案总览

| 阶段 | 内容 | 文件 | 性质 |
|------|------|------|------|
| A | 注册表增加 webfont 元数据 + 预载 spec 构建器 | `src/shared/fonts.ts` | 基础设施 |
| B | 聊天字体配置写入 localStorage 缓存 | `src/renderer/stores/settings.ts` | 数据链路 |
| C | 启动预载扩展:按缓存预载聊天字体 | `src/renderer/main.ts` | 核心修复 |
| D | 首屏消息实际文本的长尾预载 | `src/renderer/components/chat/MessageList.vue` | 兜底(可选,建议做) |
| E | 补 `georgia` 注册表条目 + 测试 | `src/shared/fonts.ts` + 测试 | 顺带 |

实施顺序 A→B→C 即可消除 99% 的可见跳变;D、E 独立可后补。

---

## 4. 分阶段设计

### Phase A:注册表元数据(src/shared/fonts.ts)

`FontDefinition` 增加两个可选字段:

```ts
webfont?: boolean    // 需要加载 @font-face 文件(system 字体为 false/缺省)
weights?: number[]   // 可用字重;用于生成预载 spec
```

标记现有条目:

| id | webfont | weights | 说明 |
|----|---------|---------|------|
| `public-sans` / `noto-sans-sc` / `lora` / `noto-serif-sc` | true | [400, 500, 600] | variable 字体,与现 main.ts 预载三档一致 |
| `lxgw-wenkai` | true | [400, 700] | regular + bold 两个包 |
| `lxgw-wenkai-screen` | true | [400] | 该包仅 400,粗体为合成,无需额外预载 |
| `system-ui` / `system-cjk` | — | — | 系统字体,不产生预载项 |

新增导出:

```ts
/** ~100 个高频汉字常量,覆盖常用 unicode-range 子集 */
export const CJK_PRELOAD_SAMPLE = '……'

export function buildFontLoadSpecs(
  enId?: string,
  zhId?: string
): Array<{ spec: string; sample: string }>
```

逻辑:按 id 解析(未知 id 回退 `DEFAULT_FONT_EN/ZH`,与 `buildFontFamily` 行为一致),
只保留 `webfont: true` 的条目,按 weights 展开为 `'{weight} 14px {family}'`;
sample 英文用 `'The quick brown fox'`,中文用 `CJK_PRELOAD_SAMPLE`。
main.ts 现有的六条硬编码 spec 改由它生成,形成单一事实来源。
(`document.fonts.load` 的 px 值不影响加载结果——同一 face,任意字号命中同一文件。)

### Phase B:配置缓存(src/renderer/stores/settings.ts)

```ts
const CHAT_FONT_CACHE_KEY = 'cached-chat-fonts'

function cacheChatFonts() {
  localStorage.setItem(CHAT_FONT_CACHE_KEY, JSON.stringify({
    en: settings.value.chat?.chatFontEn ?? null,
    zh: settings.value.chat?.chatFontZh ?? null,
  }))
}
```

两个写入点:

1. `loadSettings()` 成功赋值后(`settings.ts:215` 附近)——设置文件被外部修改后,
   下一次启动缓存自愈;
2. `saveSettings()` 成功后(`settings.ts:294` 附近)——设置页换字体后立即更新。

### Phase C:启动预载(src/renderer/main.ts)

改造 `preloadCriticalFonts()`:

1. UI 字体部分改为 `buildFontLoadSpecs(DEFAULT_FONT_EN, DEFAULT_FONT_ZH)`
   (行为等价于现有硬编码六条);
2. `try/catch` 读 `cached-chat-fonts`,有值则追加 `buildFontLoadSpecs(cached.en, cached.zh)`;
   无缓存(首次启动)跳过——此时聊天字体即默认值,已被第 1 步覆盖;
3. 按 spec 字符串去重后 `Promise.all(document.fonts.load(...))`。

现有 1.5s race cap(`main.ts:61`)保留不动。LXGW Screen 的 woff2 是本地磁盘子集文件,
高频子集总量约几百 KB,冷启动加载量级在 cap 内绰绰有余。
`#/todo-plan` 透明窗口会多预载一次聊天字体,无害,不做特判。

### Phase D:长尾兜底(src/renderer/components/chat/MessageList.vue)

CJK 按 unicode-range 子集化,Phase C 的高频样本覆盖不到历史消息里的生僻字——
那些字所在子集仍会在渲染后异步加载并 swap。

做法:`MessageList` 加一个 watcher,会话消息首次加载完成时,取最后 N 条
(首屏可见范围)消息文本,去重、剔除 ASCII、截取 ≤300 字符,对每个聊天字体 spec 调
`document.fonts.load(spec, chars)`。

**只主动触发加载,不做视觉门控**——本地文件一般 1~2 帧内就绪,残余交换窗口极小;
门控(加载完成前隐藏文本)会引入可感知的首屏延迟,不值得。

这一层对"切换到含生僻字的旧会话"场景也有改善,不只是启动。

### Phase E:georgia 条目 + 测试

**注册表补条目**(修复 1.4 的 dangling id):

```ts
{ id: 'georgia', name: 'Georgia', family: 'Georgia', category: 'serif', lang: 'en' }
```

无 `webfont` 标记,不产生预载项。注意:该修复会让英文正文外观变化
(文楷 Latin → 真 Georgia),属预期修正。

**测试**(vitest,沿用现有模式):

- `src/shared/__tests__/fonts.test.ts`:`buildFontLoadSpecs` 的 webfont 过滤、
  字重展开、未知 id 回退默认、system 字体不产生 spec;
- settings store 测试(参考 `src/renderer/stores/__tests__/appearance.test.ts`
  的 localStorage 断言模式):`loadSettings` / `saveSettings` 后
  `cached-chat-fonts` 写入正确;
- 手动验证:
  1. 清 localStorage 冷启动——验证首启无缓存路径不报错;
  2. 正常冷启动观察聊天中文是否仍有跳变;
  3. DevTools console:`document.fonts.check('14px "LXGW WenKai Screen"', '样本字')`
     确认预载生效。

---

## 5. 边界与风险

| 场景 | 行为 | 结论 |
|------|------|------|
| 缓存过期(设置文件被外部修改) | 该次启动按旧缓存预载,退化为现状(swap 一次);`loadSettings` 后缓存自愈 | 可接受 |
| 首次启动无缓存 | 只预载默认字体(即聊天字体默认值),无报错路径 | 正常 |
| web 构建(apps/web 共用 renderer 入口) | `document.fonts` 存在性判断已有(`main.ts:47`),行为一致 | 正常 |
| 生僻字子集 | Phase C 样本覆盖不到,Phase D 主动触发加载缩小交换窗口;不做门控,残余风险接受 | 可接受 |

**明确不做**:italic 变体预载(现状也没做);`lxgw-wenkai-webfont`(非 screen 版)
或全子集(~20MB)激进预载——浪费内存/IO。

## 6. 工作量估计

A+B+C 约 80 行改动,D 约 30 行,测试约 80 行;合计半天内。
