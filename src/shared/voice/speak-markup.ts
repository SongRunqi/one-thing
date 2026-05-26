export interface SpeakMarkupChunk {
  displayText: string
  speakText: string
  sawControlTag: boolean
}

export interface SpeakMarkupFilter {
  push(input: string): SpeakMarkupChunk
  flush(): SpeakMarkupChunk
}

type SpeakMode = 'normal' | 'speak'

function applyTag(rawTag: string, mode: SpeakMode): SpeakMode | null {
  const tag = rawTag.trim().toLowerCase()
  if (tag === '<speak>') return 'speak'
  if (tag === '</speak>') return 'normal'
  if (tag === '<silent>' || tag === '</silent>') return mode
  return null
}

export function createSpeakMarkupFilter(): SpeakMarkupFilter {
  let mode: SpeakMode = 'normal'
  let pendingTag = ''
  let sawControlTag = false

  function push(input: string): SpeakMarkupChunk {
    let displayText = ''
    let speakText = ''

    for (const char of input) {
      if (pendingTag) {
        pendingTag += char
        if (char === '>') {
          const nextMode = applyTag(pendingTag, mode)
          if (nextMode) {
            mode = nextMode
            sawControlTag = true
          } else {
            displayText += pendingTag
            if (mode === 'speak') speakText += pendingTag
          }
          pendingTag = ''
        } else if (pendingTag.length > 24) {
          displayText += pendingTag
          if (mode === 'speak') speakText += pendingTag
          pendingTag = ''
        }
        continue
      }

      if (char === '<') {
        pendingTag = '<'
        continue
      }

      displayText += char
      if (mode === 'speak') speakText += char
    }

    return { displayText, speakText, sawControlTag }
  }

  function flush(): SpeakMarkupChunk {
    const displayText = pendingTag
    const speakText = mode === 'speak' ? pendingTag : ''
    pendingTag = ''
    return { displayText, speakText, sawControlTag }
  }

  return { push, flush }
}

export function getProtocolSpeakText(chunk: SpeakMarkupChunk): string | undefined {
  return chunk.sawControlTag ? chunk.speakText : undefined
}
