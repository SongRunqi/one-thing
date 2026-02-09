import http from 'http'

export interface MockProviderOptions {
  port?: number
  /** Delay in milliseconds between chunks (default: 30ms) */
  chunkDelay?: number
}

export interface MockToolCall {
  id: string
  name: string
  arguments: Record<string, any>
}

export function createMockProvider(options: MockProviderOptions = {}) {
  const port = options.port ?? 18321
  const chunkDelay = options.chunkDelay ?? 30
  let server: http.Server
  let errorCode: number | null = null
  let pendingToolCalls: MockToolCall[] = []
  let toolCallResponses: string[] = [] // Text chunks to return after tool confirmation

  function handleChatCompletions(req: http.IncomingMessage, res: http.ServerResponse) {
    // Check for programmatic error injection
    if (errorCode) {
      // Consume the request body before responding
      req.on('data', () => {})
      req.on('end', () => {
        res.writeHead(errorCode!, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          error: { message: `Simulated error ${errorCode}`, type: 'api_error', code: errorCode },
        }))
      })
      return
    }

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

    // Parse request body to check for tools
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      let parsed: any = {}
      try { parsed = JSON.parse(body) } catch {}

      console.log(`[MockProvider] handleChatCompletions - Request has tools:`, !!parsed.tools, parsed.tools ? `(${Object.keys(parsed.tools).length} tools)` : '')
      console.log(`[MockProvider] handleChatCompletions - pendingToolCalls:`, pendingToolCalls.length)
      console.log(`[MockProvider] handleChatCompletions - pendingToolCalls:`, JSON.stringify(pendingToolCalls))

      const stream = parsed.stream !== false
      const responseId = 'chatcmpl_mock_001'
      const model = parsed.model ?? 'mock-model'
      const createdAt = Math.floor(Date.now() / 1000)

      if (!stream) {
        // Non-streaming response
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          id: responseId,
          object: 'chat.completion',
          created: createdAt,
          model,
          choices: [{
            index: 0,
            message: { role: 'assistant', content: 'Hello from mock AI!' },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }))
        return
      }

      // SSE streaming response
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      // Handle tool calls if any
      if (pendingToolCalls.length > 0) {
        console.log('[MockProvider] Sending tool calls:', JSON.stringify(pendingToolCalls))
        
        // First, send role
        res.write(`data: ${JSON.stringify({
          id: responseId,
          object: 'chat.completion.chunk',
          created: createdAt,
          model,
          choices: [{
            index: 0,
            delta: { role: 'assistant' },
            finish_reason: null,
          }],
        })}\n\n`)
        
        for (const toolCall of pendingToolCalls) {
          // Send tool call chunk (OpenAI format)
          // First chunk: tool call ID and type
          res.write(`data: ${JSON.stringify({
            id: responseId,
            object: 'chat.completion.chunk',
            created: createdAt,
            model,
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: 0,
                  id: toolCall.id,
                  type: 'function',
                  function: { name: '', arguments: '' },
                }],
              },
              finish_reason: null,
            }],
          })}\n\n`)
          
          // Second chunk: function name
          res.write(`data: ${JSON.stringify({
            id: responseId,
            object: 'chat.completion.chunk',
            created: createdAt,
            model,
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: 0,
                  function: { name: toolCall.name, arguments: '' },
                }],
              },
              finish_reason: null,
            }],
          })}\n\n`)
          
          // Third chunk: arguments
          res.write(`data: ${JSON.stringify({
            id: responseId,
            object: 'chat.completion.chunk',
            created: createdAt,
            model,
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: 0,
                  function: { arguments: JSON.stringify(toolCall.arguments) },
                }],
              },
              finish_reason: null,
            }],
          })}\n\n`)
        }

        // Send finish chunk with tool_calls finish_reason
        res.write(`data: ${JSON.stringify({
          id: responseId,
          object: 'chat.completion.chunk',
          created: createdAt,
          model,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'tool_calls',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })}\n\n`)

        res.write('data: [DONE]\n\n')
        res.end()
        // Clear tool calls after sending
        pendingToolCalls = []
        return
      }

      // Send text deltas (if no tool calls)
      const chunks = toolCallResponses.length > 0 ? toolCallResponses : ['Hello', ' from', ' mock', ' AI!']
      let index = 0

      const interval = setInterval(() => {
        if (index < chunks.length) {
          res.write(`data: ${JSON.stringify({
            id: responseId,
            object: 'chat.completion.chunk',
            created: createdAt,
            model,
            choices: [{
              index: 0,
              delta: { content: chunks[index] },
              finish_reason: null,
            }],
          })}\n\n`)
          index++
        } else {
          clearInterval(interval)

          // Send final chunk with finish_reason
          res.write(`data: ${JSON.stringify({
            id: responseId,
            object: 'chat.completion.chunk',
            created: createdAt,
            model,
            choices: [{
              index: 0,
              delta: {},
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          })}\n\n`)

          res.write('data: [DONE]\n\n')
          res.end()
          // Clear response chunks
          toolCallResponses = []
        }
      }, chunkDelay)
    })
  }

  function handleResponses(req: http.IncomingMessage, res: http.ServerResponse) {
    // Check for programmatic error injection (persistent until clearError)
    if (errorCode) {
      // Consume the request body before responding
      req.on('data', () => {})
      req.on('end', () => {
        res.writeHead(errorCode!, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          error: { message: `Simulated error ${errorCode}`, type: 'api_error', code: errorCode },
        }))
      })
      return
    }

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

      // SSE streaming with OpenAI Chat Completions API format
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      const responseId = 'chatcmpl_mock_001'
      const model = parsed.model ?? 'mock-model'
      const createdAt = Math.floor(Date.now() / 1000)

      // Use OpenAI Chat Completions API format (compatible with AI SDK)
      // Handle tool calls if any
      if (pendingToolCalls.length > 0) {
        for (const toolCall of pendingToolCalls) {
          // Send tool call chunk (OpenAI format)
          res.write(`data: ${JSON.stringify({
            id: responseId,
            object: 'chat.completion.chunk',
            created: createdAt,
            model,
            choices: [{
              index: 0,
              delta: {
                tool_calls: [{
                  index: 0,
                  id: toolCall.id,
                  type: 'function',
                  function: {
                    name: toolCall.name,
                    arguments: JSON.stringify(toolCall.arguments),
                  },
                }],
              },
              finish_reason: null,
            }],
          })}\n\n`)
        }

        // Send finish chunk with tool_calls finish_reason
        res.write(`data: ${JSON.stringify({
          id: responseId,
          object: 'chat.completion.chunk',
          created: createdAt,
          model,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'tool_calls',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })}\n\n`)

        res.write('data: [DONE]\n\n')
        res.end()
        // Clear tool calls after sending
        pendingToolCalls = []
        return
      }

      // Send text deltas (if no tool calls)
      const chunks = toolCallResponses.length > 0 ? toolCallResponses : ['Hello', ' from', ' mock', ' AI!']
      let index = 0

      const interval = setInterval(() => {
        if (index < chunks.length) {
          res.write(`data: ${JSON.stringify({
            id: responseId,
            object: 'chat.completion.chunk',
            created: createdAt,
            model,
            choices: [{
              index: 0,
              delta: { content: chunks[index] },
              finish_reason: null,
            }],
          })}\n\n`)
          index++
        } else {
          clearInterval(interval)

          // Send final chunk with finish_reason
          res.write(`data: ${JSON.stringify({
            id: responseId,
            object: 'chat.completion.chunk',
            created: createdAt,
            model,
            choices: [{
              index: 0,
              delta: {},
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          })}\n\n`)

          res.write('data: [DONE]\n\n')
          res.end()
          // Clear response chunks
          toolCallResponses = []
        }
      }, chunkDelay)
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
    setError(code: number) { errorCode = code },
    clearError() { errorCode = null },
    // Tool call methods
    setToolCalls(toolCalls: MockToolCall[]) {
      pendingToolCalls = toolCalls
    },
    clearToolCalls() {
      pendingToolCalls = []
    },
    setToolCallResponse(chunks: string[]) {
      toolCallResponses = chunks
    },
    clearToolCallResponse() {
      toolCallResponses = []
    },
  }
}
