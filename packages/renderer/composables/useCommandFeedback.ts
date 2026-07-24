import { ref } from 'vue'

export function useCommandFeedback() {
  const commandFeedback = ref<{ type: 'success' | 'error'; message: string } | null>(null)
  let feedbackTimeout: ReturnType<typeof setTimeout> | null = null

  function showCommandFeedback(type: 'success' | 'error', message: string) {
    if (feedbackTimeout) {
      clearTimeout(feedbackTimeout)
    }
    commandFeedback.value = { type, message }
    feedbackTimeout = setTimeout(() => {
      commandFeedback.value = null
    }, 3000)
  }

  return {
    commandFeedback,
    showCommandFeedback,
  }
}
