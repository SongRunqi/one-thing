/**
 * Direct OAuth API Test
 *
 * This tests the Claude Code OAuth token directly without the @ai-sdk/anthropic SDK
 * to verify if the token works correctly.
 *
 * Run this from main process to test.
 */

const REQUIRED_BETA_FLAGS = [
  'oauth-2025-04-20',
  'claude-code-20250219',
  'interleaved-thinking-2025-05-14',
  'fine-grained-tool-streaming-2025-05-14',
].join(',')

export async function testOAuthDirect(accessToken: string): Promise<{ success: boolean; error?: string; response?: any; tokenInfo?: any }> {
  console.log('[OAuth Direct Test] Starting...')
  console.log('[OAuth Direct Test] Token length:', accessToken.length)
  console.log('[OAuth Direct Test] Token prefix:', accessToken.substring(0, 15))
  console.log('[OAuth Direct Test] Token preview:', accessToken.substring(0, 30) + '...')

  // Check token format - Claude OAuth tokens start with sk-ant-oat01-
  const tokenInfo = {
    length: accessToken.length,
    prefix: accessToken.substring(0, 15),
    isOAuthToken: accessToken.startsWith('sk-ant-oat'),
    isApiKey: accessToken.startsWith('sk-ant-api'),
  }
  console.log('[OAuth Direct Test] Token info:', tokenInfo)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': REQUIRED_BETA_FLAGS,
        // Note: NO x-api-key header
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        stream: true,
        // Claude Code OAuth system prompt formats that work:
        // 1. String format (header only): "You are Claude Code, Anthropic's official CLI for Claude."
        // 2. Array of content blocks (with additional prompts):
        //    [
        //      { type: 'text', text: "You are Claude Code, Anthropic's official CLI for Claude." },
        //      { type: 'text', text: "Additional prompts..." }
        //    ]
        system: "You are Claude Code, Anthropic's official CLI for Claude.",
        messages: [
          { role: 'user', content: 'Say "Hello, OAuth works!" and nothing else.' }
        ],
      }),
    })

    console.log('[OAuth Direct Test] Response status:', response.status)
    console.log('[OAuth Direct Test] Response headers:', Object.fromEntries(response.headers.entries()))

    // Handle streaming response differently
    if (response.ok) {
      // For streaming, just read first chunk to confirm it works
      const reader = response.body?.getReader()
      if (reader) {
        const { value } = await reader.read()
        const text = new TextDecoder().decode(value)
        console.log('[OAuth Direct Test] First chunk:', text.substring(0, 200))
        reader.cancel()
        return {
          success: true,
          response: { firstChunk: text.substring(0, 200) },
          tokenInfo,
        }
      }
    }

    // Error response is still JSON
    const data = await response.json()
    console.log('[OAuth Direct Test] Response body:', JSON.stringify(data, null, 2))

    return {
      success: false,
      error: data.error?.message || `HTTP ${response.status}`,
      response: data,
      tokenInfo,
    }
  } catch (error) {
    console.error('[OAuth Direct Test] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      tokenInfo,
    }
  }
}
