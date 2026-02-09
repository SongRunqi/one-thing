# REQ-003: Token 用量可视化

> 状态: ✅ 已完成 | 创建: 2026-02-08 | PM: Qiqi

## 1. 需求描述

### 背景
用户使用 AI 对话时不知道每次对话消耗了多少 token 和费用。需要提供可视化的 token 用量统计。

### 用户故事
- 作为用户，我想知道每条消息消耗了多少 token
- 作为用户，我想看到当前会话的累计用量
- 作为用户，我想了解大概的费用估算

## 2. 现有实现（调研结果）

### MessageActions Toolbar（已存在）
- AI 回复的 "..." 菜单中包含 Token usage 详情面板
- 显示：input tokens / output tokens / 生成速度 (tokens/s) / 模型名
- 数据来源：`UIMessage.metadata.usage`（由 tool-loop 在 stream 完成后写入）

### 数据链路（已完整）
1. Provider stream 结束 → yield `{ type: 'finish', usage }`
2. Tool-loop 逐 turn 累加 `accumulatedUsage`，记录 `lastTurnUsage`
3. `updateMessageUsage()` 持久化到消息，`updateSessionUsage()` 更新会话缓存
4. Finish chunk 通过 IPC 发给前端，前端 chat store 更新 `sessionUsageMap`

### 辅助模块
- `token-pricing.ts`：模型价格配置 + 费用估算 + 格式化工具

## 3. 验收标准

- [x] AI 回复可查看 token 消耗（MessageActions toolbar "..." → Token usage）
- [x] 显示 input / output tokens 明细
- [x] 显示生成速度和模型信息
- [ ] 会话级累计统计（暂不实现，toolbar 已满足基本需求）
- [ ] 费用估算展示（`token-pricing.ts` 已就绪，UI 待接入）

## 4. 备注

- 2026-02-09: 清理了重复实现（MessageBubble 底部 badge + ChatHeader session badge），保留原有 toolbar 方案
- 会话累计和费用展示可作为后续迭代

---
*PM: Qiqi | 日期: 2026-02-08 | 更新: 2026-02-09*
