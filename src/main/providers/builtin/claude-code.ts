/**
 * Claude Code Provider Definition
 *
 * Uses OAuth authentication with Claude Pro/Max subscription.
 * OAuth token is used with Authorization: Bearer header (not x-api-key).
 *
 * Based on opencode-anthropic-auth plugin implementation.
 */

import { createAnthropic } from '@ai-sdk/anthropic'
import type { ProviderDefinition } from '../types.js'

// Required beta headers for Claude Code OAuth
const OAUTH_BETA_HEADERS = [
  'oauth-2025-04-20',
  'claude-code-20250219',
  'interleaved-thinking-2025-05-14',
  'fine-grained-tool-streaming-2025-05-14',
]

/**
 * Create a custom fetch function that:
 * 1. Removes x-api-key header (SDK adds it by default)
 * 2. Adds Authorization: Bearer header
 * 3. Merges anthropic-beta headers
 * 4. Converts system array to string (Claude Code OAuth requires string format)
 */
function createOAuthFetch(accessToken: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    // Convert incoming headers to plain object (handle Headers, array, or object)
    const incomingHeaders = init?.headers || {}
    const existingHeaders: Record<string, string> = {}

    if (incomingHeaders instanceof Headers) {
      incomingHeaders.forEach((value, key) => {
        existingHeaders[key] = value
      })
    } else if (Array.isArray(incomingHeaders)) {
      for (const [key, value] of incomingHeaders) {
        existingHeaders[key] = value
      }
    } else {
      Object.assign(existingHeaders, incomingHeaders)
    }

    // Get existing anthropic-beta header and merge with OAuth betas
    const existingBeta = existingHeaders['anthropic-beta'] || ''
    const existingBetas = existingBeta
      .split(',')
      .map((b: string) => b.trim())
      .filter(Boolean)

    // Merge and deduplicate
    const mergedBetas = [...new Set([...OAUTH_BETA_HEADERS, ...existingBetas])].join(',')

    // Build new headers object (use plain object, not Headers API)
    // Use lowercase for headers (matching opencode-anthropic-auth)
    const headers: Record<string, string> = {
      ...existingHeaders,
      'authorization': `Bearer ${accessToken}`,
      'anthropic-beta': mergedBetas,
    }

    // Remove x-api-key if present (SDK adds it by default)
    // Handle all possible case variations
    delete headers['x-api-key']
    delete headers['X-Api-Key']
    delete headers['X-API-KEY']

    // Transform request body: Format system prompt for Claude Code OAuth
    // Following opencode's approach: send system as array with header as first element
    const CLAUDE_CODE_HEADER = "You are Claude Code, Anthropic's official CLI for Claude."
    let modifiedInit = init
    if (init?.body) {
      try {
        const bodyStr = typeof init.body === 'string' ? init.body : JSON.stringify(init.body)
        const bodyObj = JSON.parse(bodyStr)

        // Extract original system prompt content
        let originalSystem = ''
        if (bodyObj.system) {
          if (typeof bodyObj.system === 'string') {
            originalSystem = bodyObj.system
          } else if (Array.isArray(bodyObj.system)) {
            // SDK sends system as array of content blocks [{type: "text", text: "..."}]
            originalSystem = bodyObj.system
              .map((block: any) => (typeof block === 'string' ? block : block.text || ''))
              .filter(Boolean)
              .join('\n')
          }
        }

        // Format like opencode: array of content blocks with header first
        // This allows preserving agent prompts while satisfying Claude Code OAuth
        if (originalSystem && originalSystem !== CLAUDE_CODE_HEADER) {
          bodyObj.system = [
            { type: 'text', text: CLAUDE_CODE_HEADER },
            { type: 'text', text: originalSystem }
          ]
        } else {
          bodyObj.system = CLAUDE_CODE_HEADER
        }

        modifiedInit = {
          ...init,
          body: JSON.stringify(bodyObj),
        }
      } catch (e) {
        console.warn('[Claude Code OAuth] Request body parse error')
      }
    }

    return fetch(input, {
      ...modifiedInit,
      headers,
    })
  }
}

const claudeCodeProvider: ProviderDefinition = {
  id: 'claude-code',

  info: {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Use Claude with your Claude Pro/Max subscription via OAuth',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    icon: 'claude-code',
    supportsCustomBaseUrl: false,
    requiresApiKey: false,
    requiresOAuth: true,
    oauthFlow: 'authorization-code',
    // Models fetched dynamically from OpenRouter API (filtered for Pro/Max tier)
  },

  create: ({ baseUrl, apiKey, oauthToken }) => {
    // Get access token from either:
    // 1. oauthToken.accessToken (from registry async path)
    // 2. apiKey (from chat.ts which fetches OAuth token and passes it as apiKey)
    const accessToken = oauthToken?.accessToken || apiKey || ''

    if (!accessToken) {
      throw new Error('Not logged in to Claude Code. Please login first.')
    }

    // Create provider with custom fetch for OAuth authentication
    // OAuth requires Authorization: Bearer header instead of x-api-key
    // Use empty apiKey (matching opencode-anthropic-auth plugin)
    const provider = createAnthropic({
      apiKey: '', // Empty - our custom fetch handles real auth
      baseURL: baseUrl || 'https://api.anthropic.com/v1',
      fetch: createOAuthFetch(accessToken),
    })

    return {
      createModel: (modelId: string) => provider(modelId),
    }
  },
}

export default claudeCodeProvider
