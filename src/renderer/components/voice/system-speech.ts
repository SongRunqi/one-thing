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
  utterance.onend = () => finishPlayback(item.requestId)
  utterance.onerror = () => finishPlayback(item.requestId, 'System speech synthesis failed.')
  window.speechSynthesis.speak(utterance)
  return utterance
}
