# 图片文本提取（无 vision 模型的图片降级通道）

状态：设计稿，未实施
日期：2026-07-21

## 1. 问题

不具备 vision 能力的模型收到图片附件时，当前只有两种结局：

- Renderer 层拦截（`src/renderer/composables/useAttachments.ts:122`），用户贴不进去；
- 绕过 renderer 的路径（headless server、gateway、定时任务）没有任何保护，图片会被无条件塞进请求体
  —— 四个 provider 的 image 分支（`claude.ts:218`、`openai-compatible.ts:198`、`codex.ts:283`、
  `gemini.ts:236`）都不检查 `agentSupportsInputModality`。

目标：在模型确认不支持 vision 时，把图片转成模型能读的**文本 + 版面信息**，而不是拦截或静默丢弃。

## 2. 三条硬约束

任何方案必须同时满足，否则不予采纳：

1. **`packages/core/engine/message-content.ts` 必须保持纯净且同步。**
   它被 renderer 与 web build 直接 import，不能引入 Node 依赖；
   且被 core 的历史重建循环同步调用（`packages/core/engine/history.ts:620`）。
2. **当轮与历史重建必须字节一致。**
   `history.ts:164-168` 明确要求重建结果与原始那一轮逐字节相同，否则 prompt cache 全量失效
   （claude / claude-code 已开 promptCaching）。
3. **不得静默丢弃。**
   `claude.ts:232-234`、`openai-compatible.ts:209-212` 已确立 `undeliverableAttachmentText` 占位契约，
   由 `agent-loop/__tests__/attachment-parts.test.ts:49,76-79,84` 锁定。

**推论：OCR 不能在 `buildMessageContent` 内部执行。** OCR 是异步、Node-only、且昂贵的。
它必须提前发生，结果作为数据持久化，转换函数只负责读取。

## 3. 架构

```
附件入库
   │
   ├─ [hydration 前置步骤]  异步 · Node 侧 · 仅当台账确认模型无 vision
   │      ImageTextExtractor.extract() → ExtractedLayout
   │      写回 attachment.extractedLayout，随 session 持久化
   ↓
buildMessageContent（保持同步 · 纯净）
   │      supportsVision === false && extractedLayout
   ↓
LayoutSerializer.serialize() → 文本
   │
   ↓
复用 tryInlineTextAttachment 的 <attachment> 渲染（message-content.ts:155-196）
```

四条约束同时满足：core 保持纯净同步；重建读的是持久化字段故字节稳定；每张图只 OCR 一次；
只有无 vision 的模型才付这个成本。

### 3.1 捕获层：`ImageTextExtractor`

位置：`packages/onething-runtime/src/ocr/`（Node 侧，与纯净的 core 隔离）。
形态照抄 `packages/onething-runtime/src/music/` 的 driver + reliable-runner 三段式。

```ts
export interface ImageTextExtractor {
  readonly id: string
  readonly version: string
  probe(): Promise<{ available: boolean; reason?: string }>
  extract(input: { data: Buffer; mimeType: string }): Promise<ExtractedLayout>
}
```

命名刻意用 `ImageTextExtractor` 而非 `OcrEngine`：未来的替代实现很可能**不是 OCR 库**，
而是调用一个便宜的 vision 模型做转述（对照片和复杂版面效果大概率更好）。
该实现同样能满足这个接口，不应被命名锁死。

### 3.2 数据形态：`ExtractedLayout`

```ts
interface ExtractedLayout {
  engine: string          // 'light-ocr'
  engineVersion: string   // '0.3.0'
  at: number
  source: { width: number; height: number }
  lines: Array<{
    text: string
    confidence: number
    quad: [number, number, number, number, number, number, number, number]
  }>
}
```

三个决定及理由：

- **存 quad（四点）不存 rect。**
  light-ocr 的 DB 后处理配置为 `"boxType": "quad"`，倾斜文字给出真实斜四边形。
  退化成轴对齐矩形是不可逆的有损操作；需要 rect 时在序列化期现算。
- **存原图像素，不存归一化 0-1。**
  归一化静默丢精度，且下游若要映射回真实截图（点击、框选）像素才是有意义的单位。
  记录 `source` 尺寸后可在序列化期随时归一化，反之不可能。
- **记录 `engine` + `engineVersion`。**
  换引擎时可识别旧产物并选择性重跑，而不是面对一堆来路不明的文本。这是"留后路"的核心字段。

`text + box + confidence` 是 OCR 行业通用形状，不是 light-ocr 特有的 —— 这正是它适合当契约的原因。

### 3.3 序列化层：`LayoutSerializer`

模型吃 token 不吃结构体。**渲染格式是独立于捕获的决策**，单独分层：

| 序列化器 | 产出 | 代价 |
| --- | --- | --- |
| `reading-order` | 按行/栏排序的纯文本 | 最省 token，位置全丢 |
| `spatial`（默认） | 用空白重建二维版面 | token 中等，对齐关系可见，无数字坐标 |
| `annotated` | 每行 `[x,y,w,h] text` | token 最贵（80 行截图仅坐标即上千 token），可精确指回 |

默认取 `spatial`：截图、表单、表格这类最常见输入上性价比最高。

分层收益：换 OCR 引擎改 capture，改 prompt 格式改 serialize，互不影响；
坐标精度、归一化与否、小数位数全是序列化期参数，可随时调整而无需重跑 OCR。

注意坐标**不是只能进 prompt**。因为 `extractedLayout` 持久化在 attachment 上，
renderer 可以独立读取它在图片上叠加高亮框 / 可点选区域 —— 这是与 prompt 无关的第二类消费者。

## 4. 落点清单

| # | 文件 | 改动 |
| --- | --- | --- |
| 1 | `packages/onething-runtime/src/ocr/`（新建） | 端口 + registry + `LightOcrExtractor`（约 60 行） |
| 2 | `src/shared/ipc/chat.ts:96` `MessageAttachment` | 加 `extractedLayout?: ExtractedLayout` |
| 3 | `packages/core/engine/message-content.ts:19` `CoreMessageAttachment` | 同上（镜像类型） |
| 4 | `packages/core/engine/message-content.ts:34` `BuildMessageContentOptions` | 加 `supportsVision?: boolean`（已有扩展位，签名破坏面小） |
| 5 | `packages/core/engine/message-content.ts:230-242` 图片分支 | `supportsVision === false` 时走序列化文本；无 layout 则走 `undeliverableAttachmentText` 占位 |
| 6 | `src/shared/ipc/ocr.ts`（新建）+ `settings.ts:241` | `ocr?: OcrSettings`，挂在 `music?` 旁边 |
| 7 | `electron-builder.yml:23` | 照抄 sherpa 的 `asarUnpack` 条目 |

**不要**把 OCR 配置塞进 `ProviderConfig`（`src/shared/ipc/providers.ts:102`）——
OCR 不是对话 provider，塞进去会污染 model selector 和能力台账。
参照 `MusicSettings`（`src/shared/ipc/music.ts:309`）的既有范式。

## 5. 能力判定的陷阱

用 `agentSupportsInputModality(caps, 'image')`（`packages/core/agent-loop/capabilities.ts:36`）。

⚠️ `factory.ts:266` 的 `ledgerKnows()` 语义：`source === 'default'` 表示**台账无知识**，
不等于"不支持"。**只在台账明确判定不支持时才降级**；"不知道"必须放行原图。

否则一个本来能看图的新模型会被静默降级成 OCR 文本 —— 效果变差且极难排查。

## 6. light-ocr 调研结论

`@arcships/light-ocr@0.3.0`，Apache-2.0，C++17 PP-OCRv6 Small（PaddleOCR v3.7.0 蒸馏 ONNX）+ N-API 适配器。

| 维度 | 结论 |
| --- | --- |
| 平台 | `darwin-arm64` / `darwin-x64` / `win32-x64` / `linux-x64-gnu` 四个 optionalDependencies |
| 加速 | macOS 15+ Apple Silicon 走 Core ML；Win/Linux 走 WebGPU；其余 CPU |
| API | `createEngine()` → `recognizeEncoded(buffer)` → `{ lines: [{ text, confidence, box }] }`；异步、不占 JS 主线程、可取消、`close()` 幂等 |
| 体积 | 模型 bundle 31.3MB（det 9.9MB + rec + 字典）+ 每平台原生二进制 |
| Node | 声明支持 Node 22/24，N-API v8 |

**打包路径已验证。** 项目已有 `sherpa-onnx-node`（同为 N-API addon + per-platform 包），
`electron-builder.yml:21-29` 已为其配置 `asarUnpack`。light-ocr 形态完全相同。
N-API 是 ABI 稳定的，Electron 39 加载为 Node 22 编译的 addon 无问题 —— 这正是 sherpa 能跑起来的原因。

### 6.1 实测结果（2026-07-21，M3 Pro / macOS 26.5 / Node 25.6.1）

demo 位于 scratchpad `ocr-demo/`（`demo.mjs` 单图详解、`multi.mjs` 多图对比、`threads.mjs` 线程调优）。

**体积：实际 108MB，非文档宣称的 31MB。**

| 包 | 大小 |
| --- | --- |
| `light-ocr-model-ppocrv6-small` | 70MB（含一套 macOS 用不到的 webgpu 模型） |
| `light-ocr-darwin-arm64` | 40MB unpacked（其中 `.node` 本体 5.8MB） |
| **合计** | **108MB** |

**性能：执行后端的选择比想象中重要得多。**

1280x720 应用截图，55 行中文，单位 ms：

| 后端 | 首次 | 重跑 |
| --- | --- | --- |
| Core ML / ANE（`auto` 默认） | **8,500 – 12,900** | 430 – 490 |
| CPU（默认线程） | 2,878 | 2,798 |
| **CPU + `intraOpThreads: 4`** | — | **1,117** |

Core ML 的冷启动代价**不是一次性的**。识别模型是动态输入宽度（`minimumTensorWidth: 320`
→ `maximumTensorWidth: 3200`），Core ML 按 shape bucket 逐个编译：

- 进程内换一张新宽度的图 → 再付 8.5s（实测四张图有三张各自触发，第四张命中已编译桶只花 111ms）；
- 磁盘缓存只能部分跨进程（首次 58s → 后续进程稳定在 ~12s），**每次 app 启动的第一张图仍要 12s**。

`intraOpThreads` 在 4 时最优（12 核机器），再往上反而回退：

```
1 → 2800ms    2 → 2509ms    4 → 1117ms    6 → 1580ms    8 → 1277ms
```

**结论：本场景应固定 `execution: { provider: 'cpu' }, intraOpThreads: 4`。**
用户贴图后卡 12 秒是不可接受的，而 CPU 路径 1.1s 且完全可预测。
Core ML 的 450ms 只在高频连续 OCR 时才划算，与本场景（偶发、单张）不符。

另注：M3 Pro 上 `deviceValidated: false`，即 Core ML 路径在该硬件上属**实验性兼容**，
这是又一个不选它的理由。

**质量：中文 UI 截图表现良好。**

55 行中，置信度中位数 0.993、p25 0.954。中英混排、全半角标点、路径、代码标识符均正确，例如：

```
1.00  "1. 加了"0.更新内容"总览节：列出文件范围、DB配置、音频、topic修改"
1.00  "/Users/yitiansong/Documents/data/work/lenovo/0713_TH_IVA_PRD/"
```

错误集中在**图标被当成文字**（`☑` `日` `Q0`），且这些全部落在 confidence < 0.8：

```
0.487 "Q0"   0.433 "日"   0.324 "☑"   0.742 "√今天"
```

→ **序列化时按 confidence 阈值过滤（建议 0.8）即可清掉绝大部分噪声**，这是低成本高收益的一刀。

**序列化器 token 成本**（同一张图，粗估）：

| 序列化器 | tokens | 相对 |
| --- | --- | --- |
| `reading-order` | ~350 | 1.00x |
| `spatial` | ~496 | 1.42x |
| `annotated` | ~573 | 1.64x |

`spatial` 只比纯文本贵 42% 就换来完整对齐关系，验证了选它当默认是对的。

### 6.2 风险（必须记录）

1. **仓库 2026-07-14 创建，至今一周，仅 1 个 release，contributors 页为空。**
   README 全文未出现 Electron 字样 —— 没有人验证过它在 Electron 中运行。
2. **实测 108MB**（非宣称的 31MB），若做成必装则所有用户都要付，
   包括从不使用无 vision 模型的用户。
3. **PP-OCRv6 Small 是"小"模型。** 中英文印刷体实测良好；手写、复杂版面、公式仍不可期待。
   本次只测了 UI 截图（本场景主要输入），照片类未验证。
4. **`engines: "^22.0.0 || ^24.0.0"` 是个静默陷阱。**
   Node 25 下 npm 对主包只发 EBADENGINE **警告**，但对四个平台 optionalDependency
   **直接静默跳过**（`UNMET OPTIONAL DEPENDENCY`），装完看似成功、实则没有 `.node`，
   直到运行时才炸。CI 与 Electron 的 Node 版本必须落在 22/24，或显式校验 `.node` 存在。
5. **`concurrencyMode: 'serialized_reject_when_busy'`、`maxConcurrentCalls: 1`。**
   引擎一次只处理一张，超出队列容量抛 `queue_full`。集成层**必须**自带串行队列，
   不能让多图消息或并发会话直接打进去。

结论：技术可行且打包路径清晰，但**不应把 light-ocr 焊死进系统**。
它足够新，一年内可能改 API、可能无人维护、也可能被更好的方案取代。
因此第 7 节的退路不是锦上添花，而是采纳它的**前提条件**。

## 7. 退路设计

- **默认 `engine: 'none'`**，行为零变化，不装依赖亦可运行；
- light-ocr 走 `optionalDependencies` + 运行时 `await import()`：
  **未安装 = 降级为占位文案，app 照常启动**；不是硬依赖，31MB 仅在启用时付出；
- 端口仅三个方法，替换成本极低；
- `engineVersion` 落在每条 `extractedLayout` 上，换引擎时可精确识别并重跑旧产物。

## 8. 实施顺序

1. **端口 + 数据结构**（落点 1-3）—— 不引入任何依赖，可先落地验证形状；
2. **转换点 + 序列化器**（落点 4-5）—— 用手写夹具即可测，仍无需 light-ocr；
3. **`LightOcrExtractor` + 设置 + 打包**（落点 1 的实现 + 6-7）—— 真机验证。

前两步产出的是纯逻辑，可完整单测；第三步才碰原生依赖。
若届时 light-ocr 被否，前两步的成果完全保留。
