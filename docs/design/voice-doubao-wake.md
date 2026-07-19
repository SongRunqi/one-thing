# 语音实时交互:中文唤醒词 + 豆包流式 ASR/TTS 接入方案

日期:2026-07-12 · 状态:**P0–P5 已全部实施**(见 §8 实施纪要),待真机联调(需火山控制台开通服务)

## 0. 背景与现状

代码库中已存在完整的语音链路(FunASR 版),本方案是**在现有插槽上替换/新增 provider**,不是新建子系统:

- **采集 + VAD**:隐藏 BrowserWindow(`#/voice-runtime`)中 `src/renderer/components/voice/VoiceRuntimeWindow.vue` 用 `getUserMedia` + `@ricky0123/vad-web`(Silero,能量 VAD 兜底)采集,PCM 直连 FunASR WebSocket(`funasr-streaming.ts`,16kHz/16bit/mono)。
- **唤醒**:已有 Porcupine 分支(`wake.provider: 'porcupine-web' | 'web-speech'`),需 Picovoice 账号 + 训练 .ppn,本方案改用 sherpa-onnx KWS(开源、免账号、中文拼音定义关键词)。
- **进引擎**:`src/main/voice/service.ts` `submitRecognizedTranscript` → emit `command:send-message`。
- **回复转语音**:同文件 `beginReplyPlayback` 订阅 stream channel,text-delta → 可朗读文本提取 → 逐句切分 → `synthesize` → `speechChain` 串行播放。
- **provider 抽象**:`src/shared/ipc/voice.ts` 的 `VoiceASRProvider`/`VoiceTTSProvider` 字符串 union,实现在 `packages/onething-runtime/src/voice/providers.ts`,与 LLM provider 体系完全独立。
- **web 版**:`src/renderer/platform/web.ts` 语音走 apps/server `/api/voice/*` + SSE,已全量实现(非 stub)。

## 1. 目标

1. **中文唤醒词**(如「你好小一」)常驻监听,命中后进入录音;
2. **豆包流式 ASR**(火山引擎 大模型流式语音识别)替代 FunASR 作为可选 provider;
3. **豆包双向流式 TTS** 作为可选 TTS provider,LLM delta 逐段喂入、流式回音频;
4. 现有 FunASR / OpenAI / Qwen 等分支保持不动,全部通过设置切换。

**明确不做**:豆包端到端 Realtime(`/api/v3/realtime/dialogue`)——不支持自有 LLM、无 function calling,与本项目 agent loop + 工具体系冲突,且输出音频 300 元/M token。

## 2. 关键架构决策

### 2.1 豆包 WebSocket 必须放主进程

火山 v3 全系鉴权只走 WS 握手自定义 header(`X-Api-Key` / `X-Api-App-Key` 等),浏览器 `WebSocket` 设不了 header → 渲染进程直连不可行(FunASR 的渲染进程直连模式不可复制)。主进程 Node `ws` 可带 header,密钥也天然不进渲染进程。

### 2.2 KWS 也放主进程(sherpa-onnx-node 原生插件)

- `sherpa-onnx-node@1.13.4`,N-API 预编译(含 `sherpa-onnx-darwin-arm64`),无需 Electron ABI rebuild,导出 `KeywordSpotter`。
- 浏览器 WASM KWS 无预编译产物(需自己 emscripten 编译),Node WASM 包 20.5MB 单文件——原生方案最干净。
- 模型:`sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01`(int8:encoder 4.6MB + decoder 177KB + joiner 64KB + tokens.txt),16kHz/80 维 fbank,流式 zipformer,单线程即可实时。

### 2.3 统一 PCM 上行通道

KWS 与豆包 ASR 都在主进程 → runtime window 只做一件事:采集 16kHz PCM 分片经 IPC 送主进程。主进程按状态路由:

```
runtime window (getUserMedia → 16kHz Float32/Int16 PCM 分片,~100-200ms/包)
   │  IPC: VOICE_AUDIO_CHUNK(base64,约 43KB/s,量级无压力)
   ▼
主进程 VoiceAudioRouter
   ├─ wake-listening 态 → KeywordSpotter.acceptWaveform → 命中 → 切 recording 态
   └─ recording 态     → DoubaoASRSession(WS 帧封包上传)
                          ├─ definite:false → 中间转写(可回显 overlay)
                          └─ definite:true + end_window_size 静音判停
                                → submitRecognizedTranscript → command:send-message
```

- 断句/端点判定交给豆包云端 VAD(`end_window_size`,默认 800ms),比本地能量 VAD 准;本地 Silero VAD 留给 FunASR 分支,不动。
- FunASR 分支保持渲染进程直连,不迁移。
- **pre-roll 环形缓冲(必须)**:用户会一口气说「你好小一,今天天气怎么样」,KWS 命中发生在句中——路由器须常备 1–2s PCM 环形缓冲,命中后先回灌缓冲再接实时流,否则豆包收到掐头音频。
- **多轮续听窗口(必须)**:TTS 播完后不立即回 wake-listening,保持 N 秒(默认 ~8s,可配)免唤醒续听;窗口内检出人声直接进录音态,静音超时才回唤醒态。与现有 `reason: 'manual' | 'wake' | 'resume'` 状态机对齐,P3 实施时梳理。
- **播放期 KWS 策略(必须)**:Chromium AEC 只对同页面 WebAudio 播放有参考信号;system speech 等路径播放时 KWS 会被自己的 TTS 误触发。播放期间暂停 KWS 或提高阈值,恢复于播放结束。
- KWS 同步 decode 常驻主进程事件循环,会与引擎抢主线程——P3 实测阻塞程度,超预算则把 KWS + 音频路由整体搬进 Electron `utilityProcess`。

### 2.4 TTS 数据流

`beginReplyPlayback` 已在主进程消费 text-delta → 豆包双向 TTS session 也在主进程,天然同侧:

```
stream channel text-delta → getOnethingSpeakableTextFromDelta
   → DoubaoTTSSession(/api/v3/tts/bidirection,一条回复一个 session)
        TaskRequest(text 逐段喂入) → 音频帧(ogg_opus)流回
   → IPC 分片(base64)→ runtime window 播放(MSE/WebAudio 解码队列)
```

第一版按现有逐句粒度喂(复用 `speechChain`,改动最小);二版升级为 delta 级直喂 + 边收边播,压首音延迟。

## 3. 豆包 API 速查

| 项 | ASR | TTS |
|---|---|---|
| 端点 | `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async`(官方推荐变体) | `wss://openspeech.bytedance.com/api/v3/tts/bidirection` |
| Resource ID | `volc.seedasr.sauc.duration`(2.0,1 元/小时) | `seed-tts-2.0`(3 元/万字符) |
| 鉴权 | 新版控制台 `X-Api-Key` + `X-Api-Resource-Id`(旧版 `X-Api-App-Key`+`X-Api-Access-Key`) | 同左 |
| 音频 | 上行 16kHz/16bit/mono PCM,100–200ms/包 | 下行 mp3(默认)/ ogg_opus / pcm,采样率可选 24000 |
| 关键参数 | `show_utterances:true`、`end_window_size`、`enable_punc`、`enable_itn`、`result_type` | `req_params.speaker`(如 `zh_female_cancan_mars_bigtts`)、`audio_params.format` |

**v3 二进制帧协议**(三服务同构):4B header(版本/消息类型/flags/序列化/压缩)+ 4B sequence + 4B payload size + payload;首包 full client request(gzip JSON 配置),后续 audio-only 包,**负 sequence 标记最后一包**;TTS 帧在 header 后多 `int32 event` + `session_id`(StartConnection(1)→StartSession(100)→TaskRequest(200)→FinishSession(102),服务端 ConnectionStarted(50)/SessionStarted(150)/音频帧/SessionFinished(152))。无官方 JS SDK,自写编解码约 200 行,三服务共用。响应 header 的 `X-Tt-Logid` 落日志,工单排查用。

**控制台准备**(需用户手动):创建应用拿 APP ID → 新版控制台建 API Key(console.volcengine.com/speech/new/setting/apikeys)→ 分别开通「大模型流式语音识别」「语音合成大模型」(各有免费试用额度)→ TTS 音色 0 元下单。

## 4. sherpa-onnx KWS 集成明细

### 4.1 关键词格式与生成

keywords 文件每行:`ppinyin token 序列 [:boostingScore] [#triggerThreshold] @原文`,如:

```
n ǐ h ǎo x iǎo y ī #0.5 @你好小一
```

- token 必须来自模型 `tokens.txt`(ppinyin:声母 + 带调韵母)。
- 官方生成器是 Python CLI(`sherpa-onnx-cli text2token --tokens-type ppinyin`),无 JS 实现 → **在 runtime 包移植一个 TS 版**:用 `pinyin-pro` 拿带调拼音 → 按 tokens.txt 切声母/韵母 → 拼 token 行。这样用户在设置里改唤醒词即时生效,无需外部工具。单测对照官方 CLI 输出。
- 误唤醒调参:`boostingScore`(默认 1.0,越大越易触发)、`triggerThreshold`(默认 0.25,越高越难触发,官方示例用 0.35–0.6)、`numTrailingBlanks`(默认 1,调大减少词中误触)。唤醒词建议 4 字以上。
- 换关键词:JS wrapper 的 `createStream()` 未透传 runtime keywords → 直接用 `keywordsBuf`(内存字符串)重建 `KeywordSpotter`(重载约秒级,改设置时可接受)。

### 4.2 API 形态(主进程)

```ts
const kws = new sherpa.KeywordSpotter({
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: { transducer: { encoder, decoder, joiner }, tokens, numThreads: 1, provider: 'cpu' },
  keywordsBuf, keywordsThreshold: 0.4,
})
const stream = kws.createStream()
// 每包:stream.acceptWaveform({ sampleRate: 16000, samples: Float32Array })
// while (kws.isReady(stream)) kws.decode(stream)
// const r = kws.getResult(stream); r.keyword !== '' → 命中,kws.reset(stream)
```

### 4.3 模型分发

int8 三件套 + tokens 约 5.5MB,**直接打进安装包**(resources 目录):体积代价可忽略,且规避 GitHub release 国内网络不可达的整条失败路径(下载器、进度 UI、镜像源全部省掉)。

### 4.4 Electron 打包三件事(生产必做,dev 不受影响)

1. `electron.vite.config.ts` 主进程 rollup `external: ['sherpa-onnx-node']`(原生插件不可被 bundle,issue #3075);
2. electron-builder `asarUnpack`:`sherpa-onnx-node` + `sherpa-onnx-darwin-arm64`(issue #2866/#3108);
3. macOS SIP 会剥掉 GUI 应用的 `DYLD_LIBRARY_PATH` → afterPack 钩子跑 `install_name_tool -change @rpath/libonnxruntime.<ver>.dylib @loader_path/...`(issue #2622)。

许可:sherpa-onnx 代码 Apache-2.0;wenetspeech KWS 模型权重公开分发但无独立 model card,商业分发前需自查(个人使用无碍)。

## 5. 类型与设置扩展

**设计原则:设置 UI 必须简洁。** 只暴露非填不可的项,其余全部代码默认值(类型上保留字段、`normalizeVoiceSettings` 兜底,高级用户可改 settings.json,UI 不出现)。

用户在设置页看到的全部内容:

```
豆包(ASR + TTS 共用一份凭证,不分两处填)
  API Key      [__________]        ← 唯一必填
  音色         [下拉:豆包音色列表]
  [测试识别] [试听]                 ← 复用现有 test-ASR/test-TTS

唤醒
  [开关] 语音唤醒
  唤醒词       [你好小一]
  灵敏度       (低 | 中 | 高)       ← 三档,映射 threshold/numTrailingBlanks 组合
```

不出现在 UI 的(全部默认值):endpoint、resourceId(`volc.seedasr.sauc.duration` / `seed-tts-2.0`)、`endWindowMs`、音频 format、boostingScore、续听窗口时长、KWS 模型路径(打包内固定)。

类型层(`src/shared/ipc/voice.ts`):

```ts
type VoiceASRProvider = ... | 'doubao'
type VoiceTTSProvider = ... | 'doubao'
interface VoiceWakeSettings { provider: ... | 'sherpa-kws';  // phrase 复用现有字段
  sensitivity?: 'low' | 'medium' | 'high' }
interface VoiceDoubaoSettings {   // 顶层共享,ASR/TTS 引用同一份
  apiKey: string
  // 以下均有默认值,UI 不暴露:
  asrResourceId?: string; ttsResourceId?: string; endpoint?: string
  endWindowMs?: number; speaker?: string; format?: 'ogg_opus' | 'mp3' | 'pcm'
}
```

配套:`DEFAULT_VOICE_SETTINGS` + `normalizeVoiceSettings` 同步;`VoiceSettingsTab.vue` 按上述最小面加块;IPC 走现有 `VOICE_*` 通道 + 新增 PCM 上行通道。speaker 的「音色列表」用内置常量表(名称+speaker id),不做在线拉取。

## 6. 实施阶段

| 阶段 | 内容 | 关键文件 | 验收 |
|---|---|---|---|
| **P0 协议层** | 火山 v3 二进制帧编解码(header/seq/gzip/event 帧,ASR+TTS 共用) | `packages/onething-runtime/src/voice/volcano/protocol.ts` + 单测 | 帧 pack/unpack 单测过,含错误帧、负序列 |
| **P1 音频上行** | runtime window PCM 采集→IPC→主进程 `VoiceAudioRouter`(wake/recording 态路由 + 1–2s pre-roll 环形缓冲) | `VoiceRuntimeWindow.vue`、新 IPC 通道、`src/main/voice/audio-router.ts` | 主进程可收到连续 PCM,丢包率 0 |
| **P2 豆包 ASR** | 先跑最小连通 demo 摸连接时长/并发限制(风险 6);`DoubaoASRSession`(ws + header 鉴权 + 帧封包,放 runtime 包),definite 句进引擎;union/settings/设置页 | `packages/onething-runtime/src/voice/`、`src/main/voice/` | 说话→转写→触发对话全链路;test-ASR 通过 |
| **P3 唤醒词** | 先验证 bun 装 sherpa-onnx-node(风险 8);KWS + TS 版 text2token(pinyin-pro),模型打包进 resources;命中→回灌 pre-roll→切录音态;多轮续听窗口状态机 | `src/main/voice/kws/`、`packages/onething-runtime/src/voice/text2token.ts` | 「你好小一」命中率手测 OK;一口气说唤醒词+问题不掉字;续听窗口内免唤醒 |
| **P4 豆包 TTS** | `streamWithDoubao` 接 `streamSynthesizeOnethingSpeech`,bidirection session,音频 IPC 回传播放 | `providers.ts`、`service.ts`、runtime window 播放队列 | 回复逐句出声;二版 delta 直喂降首音延迟 |
| **P5 收尾** | barge-in(播放中 KWS/人声检出→停 speechChain)、断线重连、logid 落日志、打包三件事、(可选)server WS relay 支持 web 版 | `service.ts`、`electron-builder` 配置、`apps/server/src/http.ts` | 打包产物真机可用;打断自然 |

P0–P2 完成即可用豆包语音对话(按钮触发);P3 完成即唤醒词闭环;P4 完成即全豆包链路。

## 7. 风险与开放问题

1. **TS 版 text2token 与官方 CLI 的一致性**——多音字、儿化音、非 tokens.txt 覆盖字符的兜底,需对照官方输出写单测;极端字符回退到「设置页提示换词」。
2. **KWS 常开的 CPU/功耗**——官方无 RTF 基准,int8 3.3M 模型在 Apple Silicon 预计 RTF≪0.1,P3 实测并在设置页提供「仅手动触发」开关;可加 energy gate,完全安静时跳过 decode。
3. **豆包 opus 下行的渲染端解码**——ogg_opus 用 WebAudio `decodeAudioData` 需整段,流式播放用 MSE 或改用 pcm 24kHz(带宽 48KB/s,IPC 可承受);P4 实测定。
4. **web 版**——apps/server 本身是 Node,`DoubaoASRSession`/KWS 逻辑均可在 server 侧复用(它就是 web 版的「主进程」),真正缺的只是浏览器→server 的 PCM 上行通道(现仅 HTTP+SSE)。因此豆包会话/KWS 逻辑必须放 `packages/onething-runtime`(Electron-free),`src/main` 只做接线;server 接入列为可选二期。
5. **barge-in 与回声**——扬声器放 TTS 时麦克风拾到自己声音造成误唤醒/误转写;`getUserMedia` 开 `echoCancellation` + 播放期 KWS 策略(见 §2.3)。

## 8. 实施纪要(2026-07-12)

全部代码已落地,typecheck/lint(零新增)/语音测试(24 个新增单测)全绿,electron 生产构建通过。真机联调前置:火山控制台建应用 + API Key + 开通两个服务。

**关键落点**:
- 协议:`packages/onething-runtime/src/voice/volcano/protocol.ts`(+ asr-session/tts-session,均可注入 WebSocket 单测)
- 主进程:`src/main/voice/audio-router.ts`(pre-roll 2s 环形缓冲 + 豆包会话托管)、`src/main/voice/kws.ts`(sherpa KeywordSpotter)、`service.ts`(唤醒词剥离、续听窗口 `maybeStartResumeWindow`、playback-idle)
- text2token:`packages/onething-runtime/src/voice/kws/text2token.ts`(pinyin-pro,输出与官方 CLI 逐字一致,含单测)
- 渲染端:`VoiceRuntimeWindow.vue` 加 doubao 录音模式(PCM→`VOICE_AUDIO_CHUNK` IPC)与 sherpa 唤醒推流;`playback-idle` 事件
- 模型:`resources/models/kws/`(wenetspeech-3.3M int8,4.7MB,打进安装包);真模型验证:4-5s 音频解码 50-62ms(RTF≈0.012)
- 设置:豆包共享凭证块(API Key + 音色)、唤醒块(开关/唤醒词/灵敏度三档)
- 打包:electron-builder `asarUnpack`(sherpa 全平台包)+ `extraResources` models;**1.13.4 的 darwin 包已内嵌 `@loader_path` rpath,install_name_tool 修复不再需要**

**实施中的方案修订**:
- 每句 TTS 走 bidirection 连接复用缓存(30s 空闲关闭),session 级串行——比"整回复一个 session 喂 delta"简单且首包差距小,delta 直喂留作 v2
- 续听窗口复用现有录音机制:playback-idle → `start({reason:'resume'})`,静默 6.5s(现有 no-speech 超时)自动回唤醒态,resume/wake 触发的静默不弹错误
- 播放期 KWS 保持活跃(允许语音打断),依赖 AEC 防自触发;真机若误触发再加播放期暂停
- 唤醒词会进 ASR 转写(pre-roll 包含唤醒词),`stripWakePhrasePrefix` 在提交前剥掉;只说唤醒词不说指令 → 静默回唤醒态

**遗留(未做,有意)**:web 版 server WS relay(`/api/voice/audio-chunk` 路由 web.ts 已留桩)、X-Tt-Logid 落日志、TTS delta 直喂 v2。
6. **豆包连接生命周期未知(P2 前置验证)**——单连接最长时长、静音超时断连、按量版默认并发上限(免费试用可能仅 1–2 路)均未在文档中查到。P2 开工前先写最小连通 demo 摸清,再定「每次唤醒新建 vs 常驻复用 + 心跳」。
7. **麦克风常开的系统层问题**——(a) macOS 菜单栏橙点常亮,设置页须有明确开关 + 状态可见;(b) 打包版确认 `NSMicrophoneUsageDescription`/entitlements(现有链路可能已配);(c) 睡眠唤醒后 `getUserMedia` 流静默死亡、插拔耳机切默认输入设备——需 `devicechange` 监听 + `powerMonitor` 恢复重启采集。现有「按下说一句」模式暴露不出这些,常驻唤醒会全部暴露。
8. **bun + `sherpa-onnx-node` optionalDependencies(P3 开头 10 分钟验证)**——平台二进制靠 optionalDependencies 分发,验证 bun install 能拉到 `sherpa-onnx-darwin-arm64` 且 Electron 主进程 require 成功;不行则 vendor 进 repo。
9. **误唤醒静默计费**——唤醒后无人说话豆包按时长计;`maxRecordingMs` 之外加「唤醒后 N 秒无 definite 结果自动退回唤醒态」短超时。
10. **唤醒命中即时反馈**——提示音或 `VoiceOverlay.vue` 状态位,否则用户不知何时开口。
