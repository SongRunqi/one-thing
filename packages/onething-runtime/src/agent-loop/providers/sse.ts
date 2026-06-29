export interface SseEvent {
  event?: string
  data: string
}

export interface ReadSseOptions {
  sourceName: string
  ignoreDone?: boolean
}

export interface ReadJsonSseOptions extends ReadSseOptions {
  invalidMessage?: string
}

function fieldValue(line: string, prefixLength: number): string {
  const value = line.slice(prefixLength)
  return value.startsWith(' ') ? value.slice(1) : value
}

function maybeEvent(
  event: string | undefined,
  dataLines: string[],
  ignoreDone: boolean,
): SseEvent | undefined {
  if (dataLines.length === 0) return undefined
  const data = dataLines.join('\n')
  if (ignoreDone && data === '[DONE]') return undefined
  return {
    ...(event ? { event } : {}),
    data,
  }
}

export async function* readSseEvents(
  response: Response,
  options: ReadSseOptions,
): AsyncGenerator<SseEvent, void, void> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error(`${options.sourceName}: response has no body`)

  const decoder = new TextDecoder()
  let buffer = ''
  let event: string | undefined
  let dataLines: string[] = []
  const ignoreDone = options.ignoreDone ?? true

  const handleLine = (rawLine: string): SseEvent | undefined => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line === '') {
      const nextEvent = maybeEvent(event, dataLines, ignoreDone)
      event = undefined
      dataLines = []
      return nextEvent
    }
    if (line.startsWith(':')) return undefined
    if (line.startsWith('event:')) {
      event = fieldValue(line, 'event:'.length)
      return undefined
    }
    if (line.startsWith('data:')) {
      dataLines.push(fieldValue(line, 'data:'.length))
    }
    return undefined
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const nextEvent = handleLine(line)
        if (nextEvent) yield nextEvent
      }
    }

    buffer += decoder.decode()
    if (buffer) {
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const nextEvent = handleLine(line)
        if (nextEvent) yield nextEvent
      }
      if (buffer) {
        const nextEvent = handleLine(buffer)
        if (nextEvent) yield nextEvent
      }
    }

    const nextEvent = maybeEvent(event, dataLines, ignoreDone)
    if (nextEvent) yield nextEvent
  } finally {
    reader.releaseLock()
  }
}

export async function* readSseData(
  response: Response,
  options: ReadSseOptions,
): AsyncGenerator<string, void, void> {
  for await (const event of readSseEvents(response, options)) {
    yield event.data
  }
}

export async function* readJsonSseData<T>(
  response: Response,
  options: ReadJsonSseOptions,
): AsyncGenerator<T, void, void> {
  for await (const payload of readSseData(response, options)) {
    try {
      yield JSON.parse(payload) as T
    } catch {
      throw new Error(`${options.sourceName}: ${options.invalidMessage ?? 'invalid JSON SSE payload'}: ${payload}`)
    }
  }
}
