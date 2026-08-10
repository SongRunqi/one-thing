# 插件能力扩张路线(2026-08-09,回应"何去何从")

> 起因:表达力战役(A–F)收官后,用户列出五类新诉求:换 InputBox 的 UI、
> 给气泡/markdown/代码块换 UI、往 workbench 加标签页、"Workspace" 插件、
> 对接 PopClip。本文逐个裁决,并把插件系统的演进定成**四条泳道 + 一片自留地**。
> 总原则不变(redesign §4.2 宪法):撞到能力墙的正确动作是**在墙上开一扇
> 有闸的门,而不是拆墙**;每扇门都是枚举出来的能力,永不开放通用 CSS/DOM 注入。

## 0. 四条泳道总览

| 泳道 | 已有 | 下一步(本文立项) |
| --- | --- | --- |
| **位置**(在哪出现) | 5 锚点(3 常显+2 触发)、双形态面板、抽屉(F 期) | **H1 workbench.tab**:插件面板作为右侧工作台标签页 |
| **内容**(长什么样) | 描述树 v2、webview | **H2 围栏渲染器**:接管特定 ``` 围栏的显示(display-only) |
| **外观**(什么风格) | L2 token 覆盖、L2.5 背景层(G 期,已设计) | **H3 皮肤包**:composer/气泡/代码块的枚举样式面 |
| **外部触达**(从哪进来) | —(空白) | **H4 深链/自动化**:`onething://` 深链路由到插件 action(PopClip 类接入) |

自留地(**不做**,理由见 §5):替换 InputBox/消息列表本体、通用 CSS/DOM 注入、
插件持有核心域模型(多 Workspace)。

## 1. H1:workbench.tab(标签页位置)

诉求:"给 workbench 加一个新标签页,点 + 的时候我的 item 在里面"。

- 审计当年判"不开"的理由是**成本**(tab.type 是编译期联合),不是红线。解法:
  联合加一个 `plugin` 变体(携 `pluginId + panelId`),内容渲染复用既有面板
  双形态(描述树/webview)—— 内容层零新协议,只是第三个"面板宿主位"
  (主工作区 MediaPanel / 弹层 / workbench tab)。
- 声明:`contributes.panels[].placements?: ('workspace' | 'workbench')[]`
  (缺省 workspace,现状);"+"菜单列出声明了 workbench 的插件面板。
- 成本:中。tab 持久化(workspace store v2 整树)要能容 plugin 变体,
  插件卸载后的 tab 复原(占位 + "插件已卸载"态,拆除快照)。

## 2. H2:围栏渲染器(内容泳道;对 markdown.block 红线的修正案)

诉求:"给 markdown/code block 一个 UI"。

- 旧红线 `markdown.block`(审计 §3)否掉的是**插件块写进消息历史** ——
  存储/回放/卸载语义全被污染。修正案的关键:**display-only、围栏作用域**:
  - 插件声明接管某种围栏:`contributes.fenceRenderers: [{ lang: 'chart', … }]`;
  - 消息历史里存的**永远是纯文本围栏**(存储零变化);渲染时宿主把该围栏
    交给插件的渲染面(描述树或 sandbox iframe,复用 C 期全套);
  - 插件不在场/已卸载 → 回落为普通代码块。**残留问题不存在**,因为源真相
    从未离开纯文本 —— 这与 VS Code 的 markdown-it 扩展模型同构。
- 语言名冲突:全局规范顺序后者胜 + 设置页可见;内置围栏(mermaid 等若有)
  永远优先于插件。
- 成本:中高(MessageMarkdown 的渲染管线开口 + per-围栏实例的生命周期,
  消息列表未虚拟化,webview 形态的围栏须懒挂载 + 上限)。

## 3. H3:皮肤包(外观泳道;"换 UI"的合法形态)

诉求:"给 input box 设计一个 UI、给 user 气泡一个 UI、给代码块一个 UI"。

- **整体替换是红线**(§5),但"换一副长相"的合法路径是把这些部件的样式面
  **枚举成 token 包 + 结构档位**:
  - composer:边框形态(图纸描边/实底/无框)、圆角档、内边距密度、
    工具条排布档 —— 结构档位是宿主实现的有限变体,插件选;
  - 气泡:радиус档、密度档、用户/AI 配色 token(已有 bg.message.* 一族)、
    引用条样式档;
  - 代码块:highlight 主题(themes 的 highlights 族已存在,L2 白名单放开
    这一族即可)+ 头部/边框档。
- 形态:`contributes.theme.skin = { composer?: {...档位}, bubble?: {...},
  code?: {...} }` —— 全是枚举值,校验白名单,与 token 覆盖同一条合成链、
  同一个"后者胜"。装前披露 `restyles the composer / message bubbles`。
- 成本:中(每个档位都是宿主侧真实现;第一批档位从用户自己的需求挑,
  不预铺想象需求)。

## 4. H4:深链/自动化(外部触达泳道;PopClip 类接入)

诉求:"写一个翻译插件,装到 PopClip 上,选中文字触发它"。

- 缺的是**从外部世界打进插件的门**。地基全在:R2 请求通道(预算/熔断)、
  插件 action、单实例桌面 app。补一条:
  1. OS 级 URL scheme `onething://`(Electron setAsDefaultProtocolClient,
     单实例转发到主实例);
  2. 路由:`onething://plugin/<pluginId>/<action>?payload=<json>` →
     经**同意闸**(首次调用弹确认"允许外部应用触发 <插件> 的 <action>?",
     按 (pluginId, action) 记忆,设置页可撤)→ 走既有请求通道;
  3. 声明:`contributes.externalActions: [{ action, label }]` —— 只有声明过
     的 action 可被外部触达(声明先于代码),装前披露;
  4. 回程:v1 单向触发(PopClip 场景够用:触发翻译 → 结果进会话/通知);
     需要同步返回值的场景(PopClip 要显示译文)走第二步:本地回环 HTTP
     单发端口 + 一次性 token,另立小期。
- 成本:中低,价值/成本比是四条里最高的。安全面:同意闸 + 声明门 +
  payload 大小限 + 速率限,红线是**永不**免确认执行副作用类 action。

## 4.5 G2:氛围层(ambient overlay)—— 场景类能力(2026-08-09 立项)

用户场景原话:圣诞节,"整个窗口下雪,雪花落到输入框之上堆积一点雪,
输入框上有雪人"。这不是静态背景(G 期,内容**之下**),是**动画氛围层**
(内容**之上**)—— 表达力上只有 webview 能承载(任意动画是 L3 专属),
而 C 期已把 sandbox iframe 的全套安全面建好,氛围层 = webview 的第三个
住址(面板 → 围栏 → **全窗覆盖**)。

1. **声明**:`contributes.ambient = { entry: 'ambient.html' }`(静态根同
   webview 家族);装前披露 `draws animated effects over the window`。
2. **宿主层**:全窗 sandbox iframe,`pointer-events: none`(纯视觉,
   永远收不到交互 —— 点击穿透到真 UI);**z 位插在内容层与浮层之间**:
   雪飘在消息/输入框上方,但在菜单/对话框/权限账页**之下** —— 覆盖层
   不得遮任何可交互浮层,这是对"画假 UI 诱导点击"的结构性封堵,
   加上披露与一键停用共同兜底。
3. **几何喂送**(雪堆在输入框上的关键):宿主向 iframe 推送**枚举地标**
   的矩形 —— v1 两个:`viewport` 与 `composerRect`(输入框外框),
   resize/布局变化时节流推送(postMessage,复用 C 期 token 信道)。
   插件据此让雪花在 composer 上沿"落地堆积"、把雪人锚在框角。
   地标是宿主枚举的(append-only 可加 sidebar 边、消息列表区),
   不暴露任意 DOM。
4. **性能与生命周期**(透明窗丢帧判例在案):动画全在 iframe 自己的 rAF;
   宿主推 `pause/resume`(窗口失焦/隐藏即停);设置页每插件开关 +
   全局"氛围效果"总闸;雪这类粒子场景指南里给预算建议(粒子数/离屏
   canvas),宿主不强制但走查看帧。
5. **样本**:`snow-scene` 插件 —— 用户描述的圣诞场景原样实现:飘雪、
   composer 上沿积雪、雪人贴框角、深浅模式配色。

与 G 期的关系:G(静态背景,内容之下)照常落地 —— 两层互补(节日场景
往往同时要"背景换色调 + 前景飘元素",一个插件可以两者都声明)。

**v2(2026-08-10 立项)**:几何喂送面从"唯一 composer 地标"升级为
**地标词表(屏幕语义地图)** —— 名字 × kind × 基数三轴、vocabulary/surfaces
协议、组件级天际线粒度(radio chip、above 块各自成落雪面)。设计与分期见
`plugin-ui/ambient-landmarks-2026-08.md`;粒度判例(包络平顶省掉的正是
真实感)记在该文档 §8。

## 5. 自留地(仍然不做,一句话理由)

- **替换 InputBox / 消息列表本体**:输入与消息流承载发送/引用/权限/回放,
  插件接管 = 宿主失去对"用户如何与 AI 对话"的控制(宪法第 1 条)。
  "换 UI"的合法出口是 H3 皮肤包。
- **通用 CSS/DOM 注入**:所有泳道的公共底线。
- **多 Workspace / 项目组织**:这是核心域模型(workspace store v2 整树
  持久化),属**宿主产品路线图**,不是插件 —— 插件可以在既有 workspace 上
  贡献面板/视图,但"什么是 workspace"必须只有一个作者。想要多 workspace,
  当核心功能提需求。

## 6. 排期建议

F(抽屉,实施中)→ G(背景层,已设计待实施)→ **H4(PopClip 深链,
价值/成本最优)** → H1(workbench.tab)→ H3(皮肤包,按真实需求挑档位)
→ H2(围栏渲染器,最重,放最后)。每期照旧:设计定稿 → Opus 5 实施 →
review → 真机走查。
