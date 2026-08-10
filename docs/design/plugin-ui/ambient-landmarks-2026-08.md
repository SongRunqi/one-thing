# 氛围层地标系统(ambient landmarks)——屏幕语义地图 v2

2026-08-10 立项。驱动场景:snow-scene 真机走查后的用户反馈——
**"雪要落在真实可见的 UI 组件上(radio、用户自加的 above 块),组件之间的空隙
继续往下落,直到落上窗底。"**

上位文档:氛围层本体(G2)见 `docs/design/plugin-expansion-roadmap-2026-08.md` §4.5;
锚点五轴治理观见 `plugin-ui-anchors-2026-08.md` §9。本文档是 G2 几何喂送面的
v2 设计,同时是"屏幕语义地图"这一基建的立项记录。

## 1. 现状与病根

v1 链路(已落地,PluginAmbientLayer.vue):**标注 → 测量 → 喂送 → 物理**。
组件挂 `data-ambient-anchor="<name>"` 惰性标记;宿主氛围层在布局变化时
(resize / ResizeObserver / 会话切换)rAF 合并地 querySelector + 量矩形,
postMessage 单向推进沙箱 iframe(`{viewport, composerRect, anchors}`);
null = 离场。插件对矩形做物理,永远看不见 DOM。

三个病根,全部是 v1 "唯一地标"这个省略造成的:

1. **词表只有一个名字**。`AMBIENT_ANCHORS = ['composer']`——雪的世界里只有
   输入框和天空。
2. **粒度错位**(本次反馈的直接病根)。`composer` 挂在 `.composer-container`
   上,而 S 状态带(含 radio chip)、权限栏、composer.above 块、输入框
   **全在这个包络内部**。雪顶是一条横贯全宽的平线——radio chip 出没只会让
   平线整体升降,永远不会出现"雪堆在 chip 顶上、chip 旁边的雪继续往下落"
   的天际线起伏。真实感恰恰藏在缝隙里。
3. **基数装不下**。状态带的 chips、composer.above 的块都是**多实例**,
   `Record<name, rect>` 的 map 形状放不进"同名 N 个矩形"。

## 2. 设计原则(继承锚点治理观,一条不破)

- **词表宿主命名、append-only**。插件不能发明地标;组件挂枚举外的名字等于
  没挂(没人来量)。加一个地标 = 词表一行 + 组件一个 attribute。
- **插件只拿矩形 + 种类,永远拿不到 DOM / 内容 / 像素**。单向推,无反查。
- **kind 由宿主表决定**,与 ui-anchor 的 kind 同哲学:插件对着 kind 写通用
  物理,不对名字硬编码——换一个氛围插件(雨/萤火虫)读同一张表。
- **z 约束**:只有基础 chrome(视觉层级低于 `--z-ambient: 50`)可挂标。
  浮层(菜单/对话框/popover)挂标必得"雪被对话框盖住"的穿帮,禁挂。
- **声明惰性**:attribute 是死标记;没有氛围插件在跑时,一次测量都不发生。

## 3. 概念模型:名字 × 种类 × 基数

| 轴 | 取值 | 说明 |
| --- | --- | --- |
| name | 词表内语义名 | 宿主命名,append-only |
| kind | `surface`(v2 唯一)\| `region`(预留) | surface = 可落面(雪可堆积);region 预留给"氛围区"(如"避开正文区"),**v2 不建**,kind 表 append-only 保证将来加不破老插件 |
| cardinality | `singleton` \| `per-item` | singleton 用 querySelector;per-item 用 querySelectorAll,同名多矩形 |

## 4. 协议(v1 兼容,零破坏)

1. **握手后一次 `vocabulary` 消息**(新增):`{ anchors: { [name]: { kind,
   cardinality } } }`。静态表只发一次——热路径消息不背语义字段。
2. **`geometry` 消息新增 `surfaces` 字段**:
   `Array<{ name, index, rect }>`(按测量顺序,index 区分同名多实例)。
   **在场即在列表里,离场即缺席**——数组语义天然表达进出场,不再需要 null。
3. **v1 字段全保留**:`composerRect` 顶层别名与 `anchors` map 照发,
   snow 1.0 等旧插件一行不改照跑。map 只承载 singleton 地标(v1 语义不变)。
4. **更新侦测泛化**:
   - ResizeObserver 观察集合从"一个 composer 元素"泛化为"所有在场地标元素",
     每次测量后 diff 重对准(v1 的 syncAnchorObservation 泛化版);
   - 进出场侦测:chips / 块的 v-if 出没不会触发对旧元素的 ResizeObserver——
     在**地标宿主容器**(composer-container 一个就够,首批词表全在其内)上加
     MutationObserver(childList, subtree)触发 scheduleMeasure;
   - 全部汇入现有 rAF 合并节流,抽屉 240px↔32px 过渡期间逐帧测量——
     积雪"骑"在移动的抽屉顶边上,这是特性不是开销(元素数 ≤ 十几,
     每帧 N 次 getBoundingClientRect 可忽略)。

## 5. 首批词表(落雪面表)

| name | kind | cardinality | 挂点 | 说明 |
| --- | --- | --- | --- | --- |
| `composer` | surface | singleton | ChatPanel `.composer-container`(现状) | **保留**:v1 兼容 + 物理兜底包络 |
| `composer.input` | surface | singleton | InputBox 输入框本体根元素 | 真正的"输入框顶边" |
| `status.chip` | surface | per-item | 状态带各 chip 根:BackgroundJobsStatusBar / GoalStatusBar / MusicStatusBar / UiSlotHost chip 壳 | **radio 即 MusicStatusBar chip,在此免费获得**;插件 chip 也免费 |
| `composer.block` | surface | per-item | composer.above 各块壳 + 抽屉壳(UiSlotHost/UiSlotBlock 宿主侧) | **用户自加的任何 above 块免费获得**;抽屉三态跟随 |

挂标全部在**宿主壳**上,插件内容永不自挂(治理与 uiSlot 一致)。

**明确不做**(记入否决,防止将来无意识越线):

- 消息气泡:滚动一格全错位、矩形量大、视觉噪——气泡区在氛围语义里是"天空"。
- 任何浮层:§2 z 约束。
- 侧栏 / 多窗口(设置窗、搜索窗):氛围层 v1 只住主窗,v3 之前不议。

## 6. 插件侧建议物理(写进作者指南,非规范)

- **天际线算法**:画布按列切;每列取"罩住该列的全部 surface 矩形"中最高的
  顶边,无矩形处 = viewport 底。雪粒落到天际线即转入堆积粒子。
- **离场解冻**:某 surface 从 surfaces 列表消失 → 其上堆积粒子解除冻结,
  重新落向新天际线(视觉上最讲理的语义;插件可自选淡出,宿主不管)。
- **预算**:堆积粒子转静态位图、每 surface 堆积高度设上限(如 12px),
  防"雪灾"遮 UI。

## 7. 分期总览

| 期 | 仓 | 内容 | 量 |
| --- | --- | --- | --- |
| **L0 地标泛化** | 主仓 | 词表 4 名 + kind/cardinality 表;vocabulary 消息;surfaces 字段;querySelectorAll 测量;ResizeObserver 集合泛化 + MutationObserver 进出场;挂标 6 处(InputBox、三个 StatusBar、UiSlotHost chip 壳与块壳);PluginAmbientLayer 测试扩展 | 中 |
| **L1 雪 2.0** | 插件仓 | snow-scene 天际线物理:多面堆积、缝隙落穿、离场解冻、抽屉逐帧跟随;版本 2.0.0 | 中(最大块) |
| **L2 空格(缓建)** | — | `region` kind(第一个真需要"避开区"的插件出现才建);第二消费者(新手引导圈注/截图标注共用注册表——第二个真实消费者出现才抽);per-message 地标(随消息级氛围需求) | 明确不建 |

真机走查(追加到托管清单):radio chip 顶上积雪、chip 旁缝隙落穿到输入框顶、
above 块顶积雪、抽屉 240↔32 切换积雪跟随、radio 关闭该列积雪解冻重落、
全员离场雪落窗底、菜单/对话框仍压雪之上。

## 8. 决策与否决记录

- **否决:自动扫 DOM 判"可见 UI"**。可见 ≠ 可落;什么算屋顶是语义判断,
  机器不可判定(透明容器、滚动区、气泡全"可见")。标注制是唯一诚实做法。
- **否决:插件反向查询几何**。保持单向推——查询口会演化成布局探针。
- **粒度判例**(本次反馈的教训):地标的价值在**天际线的起伏与缝隙**,
  包络平顶只是"会升降的地平线"。v1 把 composer 挂在整摞容器上省了三个名字,
  省掉的正是真实感。
- **雪 1.0 的兼容责任在宿主**:v1 字段照发,老插件不知道 v2 发生过。

### 8.1 "插件能否控制 X"三层口诀(2026-08-10 与用户对齐)

| 控制层次 | 给不给 |
| --- | --- |
| 结果与时机(做什么、何时做、下一步去哪) | 给,声明 + 动词 |
| 风格(怎么呈现) | 给**档位**,宿主枚举、宿主执行 |
| 像素与 DOM(亲手画、亲手动元素) | 只在插件自己的领地给(webview 三住址);宿主家具上,**永不** |

三条落到具体问题:

- **家具消失动画**:宿主家具的卸载过渡插件不可控(多插件对同一 chip 无仲裁
  语义,控制口不能开);插件**自己贡献的**家具可将来加 `transition` 档位
  (枚举、宿主画,一行合宪);而"消失那一刻的观感"今天就全权在插件——氛围层
  画在基础 chrome 之上,对着最后矩形放溶解/扬尘是它的自由。协议不加
  "即将消失"预告(那要求宿主为插件延迟卸载,尾巴摇狗);插件 diff 快照流
  自察进出场,写作者指南。
- **引导过渡**:插件持**编剧权**(步骤/指向/文案/推进时机),宿主持
  **摄影权**(聚光怎么画、A→B 怎么飞,摄影档位可枚举开放)。与 panels
  描述树同形。
- **气泡样式**(同轮第三问):非几何,不归地标——全局档位归 H3 皮肤包;
  按条件单条染色是内容毗邻注入,不开,诚实工具是 message.footer 徽标。
