/**
 * Global IPC Event Hub
 *
 * 在应用启动时注册所有 IPC 监听器，确保:
 * 1. 监听器早于任何 IPC 调用注册（无竞态条件）
 * 2. 所有事件路由到中央 store（单一状态源）
 * 3. 不需要每次发送消息都设置/清理监听器
 */

import { useChatStore } from '@/stores/chat'

let initialized = false

export function initializeIPCHub() {
  if (initialized) {
    console.log('[IPC Hub] Already initialized, skipping')
    return
  }
  initialized = true

  // 流式响应块
  // Note: We get the store dynamically inside the callback to ensure we always
  // use the current store instance, avoiding potential stale reference issues
  window.electronAPI.onStreamChunk((chunk) => {
    // Debug: log tool_input chunks
    if (chunk.type === 'tool_input_start' || chunk.type === 'tool_input_delta') {
      console.log('[IPC Hub] Received streaming tool input:', chunk.type, chunk.toolCallId, chunk.toolName || chunk.argsTextDelta?.substring(0, 30))
    }
    // Get fresh store reference for each chunk to avoid stale reference issues
    useChatStore().handleStreamChunk(chunk)
  })

  // 流完成（包含 usage 数据）
  window.electronAPI.onStreamComplete((data) => {
    useChatStore().handleStreamComplete(data)
  })

  // 流错误
  window.electronAPI.onStreamError((data) => {
    useChatStore().handleStreamError(data)
  })

  // Step 事件
  window.electronAPI.onStepAdded((data) => {
    useChatStore().handleStepAdded(data)
  })

  window.electronAPI.onStepUpdated((data) => {
    useChatStore().handleStepUpdated(data)
  })

  // Skill 激活
  window.electronAPI.onSkillActivated((data) => {
    useChatStore().handleSkillActivated(data)
  })

  // Context size 实时更新
  window.electronAPI.onContextSizeUpdated((data) => {
    useChatStore().handleContextSizeUpdated(data)
  })

  console.log('[IPC Hub] All listeners registered')
}
