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

  function handleResponses(req: http.IncomingMessage, res: http.ServerResponse) {
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

    // Check if streaming is requested (default true for our mock)
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      let parsed: any = {}
      try { parsed = JSON.parse(body) } catch {}

      const stream = parsed.stream !== false

      if (!stream) {
        // Non-streaming response
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          id: 'resp_mock_001',
          object: 'response',
          created_at: Math.floor(Date.now() / 1000),
          model: parsed.model ?? 'mock-model',
          status: 'completed',
          output: [{
            type: 'message',
            id: 'msg_mock_001',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Hello from mock AI!' }],
          }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }))
        return
      }

      // SSE streaming with Responses API format
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      const responseId = 'resp_mock_001'
      const itemId = 'msg_mock_001'
      const model = parsed.model ?? 'mock-model'
      const createdAt = Math.floor(Date.now() / 1000)

      // 1. response.created
      res.write(`event: response.created\ndata: ${JSON.stringify({
        type: 'response.created',
        response: { id: responseId, created_at: createdAt, model, service_tier: 'default' },
      })}\n\n`)

      // 2. response.output_item.added (message)
      res.write(`event: response.output_item.added\ndata: ${JSON.stringify({
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'message', id: itemId },
      })}\n\n`)

      // 3. Text deltas
      const chunks = ['Hello', ' from', ' mock', ' AI!']
      let index = 0

      const interval = setInterval(() => {
        if (index < chunks.length) {
          res.write(`event: response.output_text.delta\ndata: ${JSON.stringify({
            type: 'response.output_text.delta',
            item_id: itemId,
            delta: chunks[index],
          })}\n\n`)
          index++
        } else {
          clearInterval(interval)

          // 4. response.output_item.done
          res.write(`event: response.output_item.done\ndata: ${JSON.stringify({
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'message',
              id: itemId,
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Hello from mock AI!' }],
            },
          })}\n\n`)

          // 5. response.completed
          res.write(`event: response.completed\ndata: ${JSON.stringify({
            type: 'response.completed',
            response: {
              usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: null, output_tokens_details: null },
            },
          })}\n\n`)

          res.end()
        }
      }, 30)
    })
  }

  function createServer() {
    server = http.createServer((req, res) => {
      console.log(`[MockProvider] ${req.method} ${req.url}`)
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

      if (req.url?.includes('/responses')) {
        handleResponses(req, res)
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
    url: `http://localhost:${port}/v1`,
  }
}
