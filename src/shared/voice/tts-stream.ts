export interface SpeakableTextDelta {
  text?: string
  voiceSpeakText?: string
}

export function getSpeakableTextFromDelta(chunk: SpeakableTextDelta): string {
  return chunk.text || chunk.voiceSpeakText || ''
}
