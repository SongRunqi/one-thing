export interface SystemSpeechPlaybackItem {
  requestId?: string
  text: string
  voice?: string
  language?: string
  rate?: number
  pitch?: number
}

export function playSystemSpeech(
  item: SystemSpeechPlaybackItem,
  finishPlayback: (requestId?: string, error?: string) => void,
): SpeechSynthesisUtterance | null {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    finishPlayback(item.requestId, 'System speech synthesis is not available in this runtime.')
    return null
  }

  const utterance = new SpeechSynthesisUtterance(item.text)
  utterance.lang = item.language || navigator.language || 'en-US'
  utterance.rate = item.rate || 1
  utterance.pitch = item.pitch || 1
  const voiceName = item.voice?.trim()
  if (voiceName) {
    const voice = window.speechSynthesis.getVoices().find(candidate => candidate.name === voiceName)
    if (voice) utterance.voice = voice
  }

  // Electron's speechSynthesis can go silent without firing onend/onerror,
  // which would jam the playback queue forever. Watchdog: generous estimate
  // of the utterance duration, then force completion.
  let settled = false
  const watchdogMs = 4000 + item.text.length * 220
  const watchdog = window.setTimeout(() => {
    if (settled) return
    settled = true
    window.speechSynthesis.cancel()
    finishPlayback(item.requestId, 'System speech produced no audio. Pick a cloud TTS (e.g. Doubao voices) in Voice settings.')
  }, watchdogMs)
  const settle = (error?: string) => {
    if (settled) return
    settled = true
    clearTimeout(watchdog)
    if (error) {
      finishPlayback(item.requestId, error)
    } else {
      finishPlayback(item.requestId)
    }
  }

  utterance.onend = () => settle()
  utterance.onerror = () => settle('System speech synthesis failed.')
  window.speechSynthesis.speak(utterance)
  return utterance
}
