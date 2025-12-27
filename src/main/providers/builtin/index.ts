/**
 * Built-in Provider Definitions
 *
 * This file exports all built-in provider definitions.
 * To add a new provider:
 * 1. Create a new file in this directory (e.g., myprovider.ts)
 * 2. Export it from this file
 *
 * That's it! The provider will be automatically registered.
 */

import openai from './openai.js'
import claude from './claude.js'
import deepseek from './deepseek.js'
import kimi from './kimi.js'
import zhipu from './zhipu.js'
import openrouter from './openrouter.js'
import gemini from './gemini.js'
import claudeCode from './claude-code.js'
import githubCopilot from './github-copilot.js'

import type { ProviderDefinition } from '../types.js'

// All built-in providers
export const builtinProviders: ProviderDefinition[] = [
  openai,
  claude,
  deepseek,
  kimi,
  zhipu,
  openrouter,
  gemini,
  claudeCode,
  githubCopilot,
]

export default builtinProviders
