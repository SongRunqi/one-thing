# REQ-001 任务分解

> PM: Qiqi | 开发: Claude Code

## 任务列表

### Task 1: IPC 字段扩展 (10 min)
**文件**: `src/shared/ipc/permissions.ts`

添加 `rejectMode` 字段：
```typescript
interface PermissionResponse {
  // ... 已有字段
  rejectMode?: 'stop' | 'continue'  // 新增
}
```

**验收**: 类型定义正确，无编译错误

---

### Task 2: Permission 后端处理 (15 min)
**文件**: `src/main/permission/index.ts`

修改 `respond` 函数，将 `rejectMode` 传递给 `RejectedError`：
- RejectedError 类需要新增 `mode` 属性
- respond 函数需要接收并传递 rejectMode

**验收**: RejectedError 包含 mode 信息

---

### Task 3: UI 拒绝对话框 (30 min)
**文件**: `src/renderer/components/chat/MessageList.vue`

在拒绝对话框中添加模式选择：
1. 添加 `rejectMode` ref，默认 'stop'
2. 在对话框中添加两个 radio 按钮
3. 确认时传递 rejectMode 给 IPC

**UI 设计**:
```
○ 拒绝并停止（默认）
○ 拒绝，让 AI 换个方式
```

**验收**: 对话框显示 radio，选择后正确传递

---

### Task 4: tool-loop 逻辑 (30 min)
**文件**: `src/main/ipc/chat/tool-loop.ts`

修改 RejectedError 的处理逻辑：
1. 检查 error.mode
2. 如果 mode === 'continue'，构造特殊消息让 AI 继续
3. 如果 mode === 'stop'（默认），停止循环

**验收**: mode=continue 时 AI 继续尝试其他方式

---

## 执行顺序

1. Task 1 (IPC) → 基础
2. Task 2 (Permission) → 依赖 Task 1
3. Task 3 (UI) → 依赖 Task 1
4. Task 4 (tool-loop) → 依赖 Task 2

## 开发命令

```bash
cd ~/data/code/one-thing
# 开发模式验证
bun dev
# 类型检查
bun run typecheck
# 测试
bun test
```
