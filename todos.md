## 后端/逻辑 待办事项

> UI相关任务已移至 `ui_todos.md`

### ✅ 已完成的任务

| 任务 | 修改文件 |
|------|----------|
| 快捷键设置存储 | `settings.ts`, `ipc.ts` |
| 删除会话级联删除子会话 | `sessions.ts` |
| 子会话删除后打开父session | `sessions.ts`, `ipc/sessions.ts`, `ipc.ts` |
| Tool Selector后端支持MCP | `ipc/tools.ts`, `ipc.ts` |
| AI response原session输出修复 | `ipc/chat.ts` |
| GPT-5.2模型支持 | `providers/index.ts` |

---

### 1. 架构改进 (参考 ARCHITECTURE_IMPROVEMENTS.md)
**当前进度**: Phase 1 已完成 ✅

**Phase 2 待完成**:
| # | 任务 | 说明 | 难度 |
|---|------|------|------|
| 1.3 | 添加 composables 层 | 将复杂逻辑抽取到 `src/renderer/composables/` | 中 |
| 1.4 | IPC 类型安全强化 | 为 `window.electronAPI` 生成完整的类型声明 | 低 |

**Phase 3 待完成**:
| # | 任务 | 说明 | 难度 |
|---|------|------|------|
| 3.2 | 配置 Schema 验证 | 使用 Zod 验证 settings，防止配置损坏导致崩溃 | 中 |
| 3.4 | 统一日志系统 | 使用 electron-log，可持久化、可分级 | 中 |
| 3.5 | 添加单元测试 | 覆盖 stores、IPC handlers | 高 |
| 4.1 | 添加 CSP 头 | 防止 XSS | 低 |
| 4.2 | API Key 安全存储 | 使用系统钥匙串 (keytar) | 中 |
| 4.3 | 输入验证 | IPC handlers 验证参数 | 中 |

---

### 2. 快捷键设置存储
**难度**: 低
**涉及文件**:
- `/src/main/stores/settings.ts` - 添加快捷键配置存储
- `/src/shared/ipc.ts` - 添加快捷键设置类型

**修复计划**:
1. 在settings中添加 `sendShortcut` 配置项 ('enter' | 'ctrl+enter' | 'cmd+enter')
2. 默认值设为 'enter'

---

### 3. 删除会话时级联删除子会话
**难度**: 低
**涉及文件**: `/src/main/stores/sessions.ts`

**修复计划**:
1. 在 `deleteSession` 方法中添加递归删除逻辑
2. 查找所有 `parentSessionId` 等于当前会话ID的子会话
3. 递归调用 `deleteSession` 删除所有子会话
4. 可选：添加确认提示告知用户将删除子会话

---

### 4. AI response 继续在原 session 输出
**难度**: 中
**涉及文件**:
- `/src/main/ipc/chat.ts` - 修改消息发送逻辑
- `/src/renderer/stores/sessions.ts` - 确保会话状态正确

**修复计划**:
1. 检查 `edit-and-resend` 流程，确保使用原session而非创建新session
2. 验证 `updateMessageAndTruncate` 后AI回复是否正确追加到同一session
3. 修复可能的session切换bug

---

### 5. 子会话删除后打开父 session
**难度**: 低
**涉及文件**:
- `/src/renderer/stores/sessions.ts` - 修改删除后的导航逻辑
- `/src/main/ipc/sessions.ts` - 返回父会话信息

**修复计划**:
1. 在删除会话时，检查是否有 `parentSessionId`
2. 如果有父会话，删除后自动切换到父会话
3. 如果父会话也被删除（级联删除），则切换到会话列表的第一个会话
4. 更新前端store以响应会话切换

---

### 6. 集成 Claude Skills
**难度**: 高
**涉及文件**:
- `/src/main/providers/builtin/claude.ts` - 添加skills支持
- `/src/main/ipc/chat.ts` - 处理skills相关逻辑
- `/src/shared/ipc.ts` - 添加skills类型定义

**修复计划**:
1. 研究Claude Skills API文档
2. 在claude provider中添加skills配置选项
3. 在chat请求中传递skills参数
4. 添加UI让用户选择/配置skills (→ ui_todos.md)

---

### 7. DeepSeek Reasoner 不工作
**难度**: 中
**涉及文件**:
- `/src/main/providers/builtin/deepseek.ts` - 检查provider配置
- `/src/main/providers/index.ts` - 检查推理模型处理逻辑

**修复计划**:
1. 检查 `isReasoningModel()` 是否正确识别 'deepseek-reasoner'
2. 验证DeepSeek API的调用参数（推理模型可能需要特殊参数）
3. 检查流式响应解析是否正确处理reasoning字段
4. 添加错误日志以便调试
5. 测试并修复具体问题

---

### 8. 重构 Tool Selector 后端，支持 MCP
**难度**: 中
**涉及文件**:
- `/src/main/ipc/tools.ts` - 统一工具获取接口
- `/src/main/mcp/` - MCP工具集成

**修复计划**:
1. 统一内置工具和MCP工具的数据结构
2. 创建统一的工具获取API
3. 工具来源标识（内置/MCP服务器名称）

---

### 9. GPT-5.2 非流式模式问题
**难度**: 中
**涉及文件**:
- `/src/main/providers/builtin/openai.ts` - 检查模型配置
- `/src/main/providers/index.ts` - 检查流式响应处理

**修复计划**:
1. 检查OpenAI provider是否对特定模型禁用了streaming
2. 验证 'gpt-5.2-chat-latest' 模型ID是否被正确处理
3. 检查是否有模型白名单/黑名单影响streaming
4. 确保 `streamChatResponseWithReasoning` 对该模型正常工作
5. 测试并修复流式响应问题
