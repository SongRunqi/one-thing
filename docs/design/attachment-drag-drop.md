# 输入框拖拽上传 / 附件投递降级

状态：已实施（2026-07-21），未提交。

## 背景

附件链路的后端早已完整：`packages/core/engine/message-content.ts` 会把文本类附件内联成
`<attachment filename=… path=…>` 块，`packages/core/agent-loop/messages.ts` 有能力感知降级和
`undeliverableAttachmentText()` 兜底。`resolveFilePath()` / `platformApi.getPathForFile()`
从一开始就是为拖拽写的。

缺的只有 renderer 的最后一公里：**唯一的附件入口是粘贴**。而粘贴恰恰是唯一拿不到磁盘路径的
来源，加上 `toMessageAttachments()` 当时并不透传 `filePath`，导致 `filePath` 字段与依赖它的
provider 兜底提示在生产中**从未生效过**。

## 设计原则

1. **不新增第二条附件链路。** 拖拽只是"又一个来源"，与粘贴、文件选择器汇聚到同一个
   `processFiles()`。
2. **能力不匹配不等于拒绝。** 前端此前在 UI 层硬拒绝，等于把后端三层降级机制关在门外。
   改为由前端判定投递路线，放行，让后端接手。
3. **拖拽这件事本身与附件解耦。** `useFileDrop` 不知道"附件"是什么，只回答"有没有文件拖到
   我的区域"并交出 `File[]`。

## 分层

```
useFileDrop.ts            拖拽状态机：enter/leave 计数、仅对含 Files 的
（不认识附件）             dataTransfer 激活、dragover preventDefault
      ↓ File[]
useAttachments.ts         唯一入口 processFiles()：体积闸 → 投递路线判定
（不认识 DOM 事件）         → base64 → attachedFiles
      ↓
AttachmentRow / FileChip  降级角标（TXT / PATH）+ 悬停解释
DropOverlay.vue           落区视觉
```

## 投递路线（AttachmentDelivery）

`resolveDelivery(mime, mediaType, filePath)` 决定附件如何抵达模型：

| 路线 | 条件 | 后端承接处 |
| --- | --- | --- |
| `native` | 模型原生支持该模态 | `buildMessageContent()` 出 image/file part |
| `inline-text` | 不支持，但 `shouldAttemptTextDecode(mime)` 为真 | `tryInlineTextAttachment()` 内联文本 |
| `path-reference` | 不支持、非文本，但有磁盘路径 | `undeliverableAttachmentText()` 让模型用文件工具读 |
| （拒绝） | 不支持、非文本、无路径 —— 即粘贴的二进制 | 无路可走，唯一的硬拒绝 |

判定所用的 `shouldAttemptTextDecode` 从 `message-content.ts` 抽到新的浏览器安全叶子模块
`packages/core/engine/attachment-mime.ts`，两端共用一份实现——否则 composer 可能承诺一种
引擎并不会执行的投递方式。

> 新增子路径 `@onething/core/engine/attachment-mime` 需在五处登记：`electron.vite.config.ts`、
> `vitest.config.ts`、`apps/web/vite.config.ts`、`apps/server/vite.config.ts`、
> `packages/core/package.json`。别名顺序须排在 engine barrel **之前**（沿用
> `engine/streaming-args` 的先例注释），否则 renderer 会把整个 engine 拖进浏览器包。

## 顺带修掉的问题

- **误拖文件会被系统应用打开**：`ChatWindow.vue` 的 drop 在非分屏 MIME 时直接 return 且不
  `preventDefault`，冒泡到 window 默认行为 → `will-navigate` 到 `file:///…` →
  `external-links.ts` 判为外部 URL → `shell.openExternal()`。现已在两处堵住：ChatWindow 自身
  兜底，以及 `installGlobalFileDropGuard()`（`main.ts` 挂载前安装）。
- **`filePath` 不透传**：`toMessageAttachments()` 现在带上 `filePath`。
- **草稿无总量上限**：新增 `MAX_DRAFT_ATTACHMENT_SIZE = 32MB`。附件字节以 base64 随
  send-message 命令走 IPC，此前十个 9MB 文件可以逐个通过 10MB 单文件闸。
- **死代码**：`useAttachments` 里从未被调用的 `handleAttach` / `handleFileSelect` /
  `fileInputRef` 已删，纸夹按钮改由 InputBox 持有并共用 `handleIncomingFiles`。

## 已知取舍

- **落区是 composer，不是整个聊天区。** 分屏下有多个 InputBox，窗口级落区无法无歧义地
  归属。若后续要扩大落区，需先决定多面板的归属规则。
- **`currentModelSupportsFiles` 仍是推断**（支持 image 即认为支持 file）。误判会让附件走
  `native` 而非降级路线，但 provider 层的 `undeliverableAttachmentText` 能兜住，不会硬报错。
- **降级路线在草稿恢复时重算**而非存储：用户可能在存草稿后换了模型，重算才是诚实答案。

## 待真机验证

- 拖入图片 / .ts / PDF 三类，确认角标与实际投递一致。
- 拖到聊天区非 composer 位置，确认不再触发系统应用打开。
- 拖拽中途按 Esc 或拖出窗口，确认高亮不残留。
