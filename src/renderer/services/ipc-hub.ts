/**
 * Global IPC Event Hub
 *
 * 在应用启动时注册所有 IPC 监听器，确保:
 * 1. 监听器早于任何 IPC 调用注册（无竞态条件）
 * 2. 所有事件路由到中央 store（单一状态源）
 * 3. 不需要每次发送消息都设置/清理监听器
 *
 * Phase 2 (REQ-005): Legacy STREAM_CHUNK removed.
 * Phase 3 (REQ-005): UIMessagesStore merged into ChatStore. Single store handles all stream data.
 */

import { useChatStore } from '@/stores/chat'

let initialized = false

export function initializeIPCHub() {
  if (initialized) {
    console.log('[IPC Hub] Already initialized, skipping')
    return
  }
  initialized = true

  // Unified UIMessage stream (handles text, reasoning, tool, finish, error)
  window.electronAPI.onUIMessageStream((data) => {
    const chatStore = useChatStore()

    if (data.chunk.type === 'part') {
      // Forward part chunks to ChatStore for UIMessage rendering
      chatStore.handleUIMessageChunk(data)
    } else if (data.chunk.type === 'finish') {
      // Handle stream completion (UIMessage parts finalization + usage/state cleanup)
      chatStore.handleUIMessageChunk(data)
      chatStore.handleStreamFinish(data)
    } else if (data.chunk.type === 'error') {
      // Handle stream error
      chatStore.handleStreamErrorFromUIMessage(data)
    }
  })

  // Step 事件 (still separate channels for rich step data)
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

  // Context compacting events
  window.electronAPI.onContextCompactStarted((data) => {
    useChatStore().handleContextCompactStarted(data)
  })

  window.electronAPI.onContextCompactCompleted((data) => {
    useChatStore().handleContextCompactCompleted(data)
  })

  console.log('[IPC Hub] All listeners registered')
}
