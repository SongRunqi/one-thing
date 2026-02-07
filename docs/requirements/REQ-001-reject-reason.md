# REQ-001: Tool 拒绝模式增强

> 状态: 已确认 | 创建: 2026-02-08 | PM: Qiqi

## 1. 需求描述

### 背景
在多轮 Tool 调用中，用户拒绝某个工具时，当前系统没有区分"停止"和"继续尝试"两种意图。

**已有功能**（无需开发）：
- ✅ 拒绝原因输入框（MessageList.vue 对话框）
- ✅ rejectReason 字段传递（IPC + Permission）
- ✅ 后端 RejectedError 处理

**需要新增**：
- ❌ 两种拒绝模式的 UI 选择
- ❌ tool-loop 根据模式决定是否继续

### 用户故事
- 作为用户，当我拒绝一个危险操作时，我希望 AI **完全停止**
- 作为用户，当我觉得方法不对时，我希望 AI **换个方式继续**

## 2. 功能设计

### 拒绝模式

| 模式 | 行为 | 用户意图 |
|------|------|----------|
| **拒绝并停止** | AI 停止 Tool Loop，直接回复用户 | "别做了"（默认） |
| **拒绝但继续** | AI 跳过当前工具，尝试其他方式 | "换个方法" |

### 交互设计

在现有拒绝对话框中增加模式选择：

```
┌─────────────────────────────────┐
│ 拒绝此操作                    ✕ │
├─────────────────────────────────┤
│ ○ 拒绝并停止（默认）            │
│ ○ 拒绝，让 AI 换个方式          │
│                                 │
│ [请输入拒绝原因（可选）...]     │
│                                 │
│ Ctrl+Enter 确认，Esc 取消       │
├─────────────────────────────────┤
│              [取消]  [确认拒绝] │
└─────────────────────────────────┘
```

### 快捷键
- `D` = 快速拒绝并停止（跳过对话框）
- `Shift+D` = 打开拒绝对话框（选择模式/输入原因）

## 3. 技术设计

### 影响模块（精简后）

| 模块 | 文件 | 改动 |
|------|------|------|
| UI | `MessageList.vue` | 拒绝对话框增加 radio 选项 |
| IPC | `shared/ipc/permissions.ts` | 新增 `rejectMode` 字段 |
| 后端 | `permission/index.ts` | 传递 rejectMode |
| 后端 | `tool-loop.ts` | 根据 mode 决定是否继续循环 |

### 数据结构变更

```typescript
// shared/ipc/permissions.ts
interface PermissionResponse {
  sessionId: string
  permissionId: string
  response: 'once' | 'session' | 'workspace' | 'reject' | 'always'
  rejectReason?: string
  rejectMode?: 'stop' | 'continue'  // 新增
}
```

### tool-loop 逻辑变更

```typescript
// 伪代码
if (error instanceof RejectedError) {
  if (error.mode === 'continue') {
    // 告诉 AI 用户拒绝了这个方法，请尝试其他方式
    // 继续 tool loop
  } else {
    // 停止 tool loop，直接返回
  }
}
```

## 4. 验收标准

- [ ] 拒绝对话框显示模式选择（radio）
- [ ] 默认选中"拒绝并停止"
- [ ] "拒绝但继续"时，AI 收到特殊提示并继续尝试
- [ ] 快捷键 D 和 Shift+D 行为正确
- [ ] 向后兼容：不传 rejectMode 时默认 stop

## 5. 开发估时

| 任务 | 预估 |
|------|------|
| UI 改动 | 30 分钟 |
| IPC 字段 | 10 分钟 |
| tool-loop 逻辑 | 30 分钟 |
| 测试 | 20 分钟 |
| **合计** | ~1.5 小时 |

## 6. 风险

- **低风险**：向后兼容，默认行为不变
- **依赖**：需要理解 tool-loop 的循环逻辑

---

*PM: Qiqi | 开发: songyitian | 日期: 2026-02-08*
