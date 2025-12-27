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

  const chatStore = useChatStore()

  // 流式响应块
  window.electronAPI.onStreamChunk((chunk) => {
    chatStore.handleStreamChunk(chunk)
  })

  // 流完成（包含 usage 数据）
  window.electronAPI.onStreamComplete((data) => {
    chatStore.handleStreamComplete(data)
  })

  // 流错误
  window.electronAPI.onStreamError((data) => {
    chatStore.handleStreamError(data)
  })

  // Step 事件
  window.electronAPI.onStepAdded((data) => {
    chatStore.handleStepAdded(data)
  })

  window.electronAPI.onStepUpdated((data) => {
    chatStore.handleStepUpdated(data)
  })

  // Skill 激活
  window.electronAPI.onSkillActivated((data) => {
    chatStore.handleSkillActivated(data)
  })

  console.log('[IPC Hub] All listeners registered')
}
