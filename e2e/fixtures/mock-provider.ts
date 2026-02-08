import http from 'http'

export interface MockProviderOptions {
  port?: number
}

export function createMockProvider(options: MockProviderOptions = {}) {
  const port = options.port ?? 18321
  let server: http.Server

  function handleChatCompletions(req: http.IncomingMessage, res: http.ServerResponse) {
    // Check for error simulation
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)
    const simulateError = url.searchParams.get('error') ?? req.headers['x-simulate-error']

    if (simulateError) {
      const statusCode = parseInt(simulateError as string, 10) || 500
      res.writeHead(statusCode, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        error: { message: `Simulated error ${statusCode}`, type: 'api_error', code: statusCode },
      }))
      return
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    const chunks = ['Hello', ' from', ' mock', ' AI!']
    let index = 0

    const interval = setInterval(() => {
      if (index < chunks.length) {
        const chunk = {
          id: `chatcmpl-${index}`,
          object: 'chat.completion.chunk',
          choices: [{
            index: 0,
            delta: { content: chunks[index] },
            finish_reason: null,
          }],
        }
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)
        index++
      } else {
        // Send final chunk with finish_reason
        const finalChunk = {
          id: `chatcmpl-final`,
          object: 'chat.completion.chunk',
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop',
          }],
        }
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
        clearInterval(interval)
      }
    }, 30)
  }

  function createServer() {
    server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-simulate-error')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      if (req.url?.includes('/chat/completions')) {
        handleChatCompletions(req, res)
        return
      }

      // Models endpoint
      if (req.url?.includes('/models')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          data: [{ id: 'mock-model', object: 'model', owned_by: 'e2e-test' }],
        }))
        return
      }

      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
    })
  }

  return {
    port,
    start: () => {
      createServer()
      return new Promise<void>((resolve, reject) => {
        server.on('error', reject)
        server.listen(port, () => resolve())
      })
    },
    stop: () => new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve())
      } else {
        resolve()
      }
    }),
    url: `http://localhost:${port}`,
  }
}
