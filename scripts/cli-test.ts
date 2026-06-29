import http from 'node:http'
import { spawn } from 'node:child_process'

interface CliJsonOutput {
  schemaVersion: number
  ok: boolean
  mode: string
  provider: {
    id: string
    model?: string
  }
  events: Array<{ type: string; [key: string]: unknown }>
  finalText: string
  toolCallCount: number
  assertions: {
    toolCallReceived: boolean
    finalTextReceived: boolean
  }
}

let requestCount = 0
let firstRequestHadTool = false
let secondRequestHadToolResult = false

const server = http.createServer((request, response) => {
  let body = ''
  request.on('data', chunk => {
    body += chunk
  })
  request.on('end', () => {
    requestCount += 1
    const parsed = JSON.parse(body || '{}') as {
      tools?: Array<{ function?: { name?: string } }>
      messages?: Array<{ role?: string; content?: string }>
    }

    if (requestCount === 1) {
      firstRequestHadTool = Boolean(parsed.tools?.some(tool => tool.function?.name === 'get_current_time'))
    }
    if (requestCount === 2) {
      secondRequestHadToolResult = Boolean(
        parsed.messages?.some(message => message.role === 'tool' && message.content?.includes('T'))
      )
    }

    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })

    if (requestCount === 1) {
      sendSse(response, {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call-time-1',
              type: 'function',
              function: {
                name: 'get_current_time',
                arguments: '{}',
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      })
    } else {
      sendSse(response, {
        choices: [{
          delta: {
            content: '现在时间是工具返回的时间。',
          },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
      })
    }

    response.write('data: [DONE]\n\n')
    response.end()
  })
})

await new Promise<void>(resolve => {
  server.listen(0, '127.0.0.1', resolve)
})

try {
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to allocate mock server port')
  }

  const result = await runCliTest(address.port)
  const json = parseCliJson(result.stdout)

  assert(result.code === 0, `CLI exited with ${result.code}\n${result.stderr}`)
  assert(json.schemaVersion === 1, 'schemaVersion should be 1')
  assert(json.ok === true, 'ok should be true')
  assert(json.mode === 'once', 'mode should be once')
  assert(json.provider.id === 'deepseek', 'provider id should be deepseek')
  assert(json.provider.model === 'mock-deepseek', 'provider model should be mock-deepseek')
  assert(requestCount === 2, `expected 2 provider requests, got ${requestCount}`)
  assert(firstRequestHadTool, 'first provider request should include get_current_time tool definition')
  assert(secondRequestHadToolResult, 'second provider request should include tool result message')
  assert(json.toolCallCount >= 1, 'toolCallCount should be at least 1')
  assert(json.assertions.toolCallReceived, 'toolCallReceived assertion should be true')
  assert(json.assertions.finalTextReceived, 'finalTextReceived assertion should be true')
  assert(json.finalText.trim().length > 0, 'finalText should be present')
  assert(json.events.some(event => event.type === 'tool_call'), 'events should include tool_call')
  assert(json.events.some(event => event.type === 'tool_result'), 'events should include tool_result')
  assert(json.events.some(event => event.type === 'final_text'), 'events should include final_text')

  console.log('[cli-test] --once --json structure ok')
  console.log(`[cli-test] events=${json.events.length} toolCallCount=${json.toolCallCount}`)
  console.log(`[cli-test] final=${json.finalText}`)
} finally {
  server.close()
}

function sendSse(response: http.ServerResponse, payload: unknown): void {
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

async function runCliTest(port: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn('bun', ['run', 'scripts/smoke-test-real.ts', '--once', '--json'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DEEPSEEK_API_KEY: 'mock-key',
      DEEPSEEK_BASE_URL: `http://127.0.0.1:${port}`,
      DEEPSEEK_MODEL: 'mock-deepseek',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => {
    stdout += chunk
  })
  child.stderr.on('data', chunk => {
    stderr += chunk
  })

  const code = await new Promise<number | null>(resolve => {
    child.on('exit', resolve)
  })
  return { code, stdout, stderr }
}

function parseCliJson(stdout: string): CliJsonOutput {
  try {
    return JSON.parse(stdout) as CliJsonOutput
  } catch (error) {
    throw new Error(`CLI stdout was not valid JSON: ${error instanceof Error ? error.message : String(error)}\n${stdout}`)
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}
