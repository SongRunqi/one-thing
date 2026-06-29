import type {
  OnethingProviderDefinition,
  OnethingProviderInfo,
  OnethingProviderOAuthFlowType,
} from './provider-definition.js'
import {
  ONETHING_CODEX_BASE_URL,
  ONETHING_CODEX_DEFAULT_MODEL,
  ONETHING_CODEX_PROVIDER_ID,
} from './codex.js'

export type OnethingBuiltinOAuthFlowType = OnethingProviderOAuthFlowType
export type OnethingBuiltinProviderInfo = OnethingProviderInfo
export type OnethingBuiltinProviderDefinition =
  OnethingProviderDefinition<OnethingBuiltinProviderInfo>

export const openaiBuiltinProvider: OnethingBuiltinProviderDefinition = {
  id: 'openai',
  info: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4, GPT-3.5 and other OpenAI models',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    icon: 'openai',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },
}

export const claudeBuiltinProvider: OnethingBuiltinProviderDefinition = {
  id: 'claude',
  info: {
    id: 'claude',
    name: 'Claude',
    description: 'Claude 3.5, Claude 3 and other Anthropic models',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    icon: 'claude',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },
}

export const deepseekBuiltinProvider: OnethingBuiltinProviderDefinition = {
  id: 'deepseek',
  info: {
    id: 'deepseek',
    name: 'DeepSeek',
    description: 'DeepSeek-V3, DeepSeek-R1, DeepSeek-V4 and other DeepSeek models',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    icon: 'deepseek',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },
}

export const kimiBuiltinProvider: OnethingBuiltinProviderDefinition = {
  id: 'kimi',
  info: {
    id: 'kimi',
    name: 'Kimi',
    description: 'Moonshot AI Kimi models with long context support',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-128k',
    icon: 'kimi',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },
}

export const zhipuBuiltinProvider: OnethingBuiltinProviderDefinition = {
  id: 'zhipu',
  info: {
    id: 'zhipu',
    name: '智谱 GLM',
    description: 'GLM-5.2 and other Zhipu AI models',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5.2',
    icon: 'zhipu',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },
}

export const openrouterBuiltinProvider: OnethingBuiltinProviderDefinition = {
  id: 'openrouter',
  info: {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access multiple AI models through OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o',
    icon: 'openrouter',
    supportsCustomBaseUrl: false,
    requiresApiKey: true,
  },
}

export const geminiBuiltinProvider: OnethingBuiltinProviderDefinition = {
  id: 'gemini',
  info: {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Gemini 2.0, Gemini 1.5 Pro/Flash and other Google AI models',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash-exp',
    icon: 'gemini',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },
}

export const claudeCodeBuiltinProvider: OnethingBuiltinProviderDefinition = {
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
  },
}

export const githubCopilotBuiltinProvider: OnethingBuiltinProviderDefinition = {
  id: 'github-copilot',
  info: {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    description: 'Use GitHub Copilot with your subscription via OAuth Device Flow',
    defaultBaseUrl: 'https://api.individual.githubcopilot.com',
    defaultModel: 'gpt-4o',
    icon: 'github',
    supportsCustomBaseUrl: false,
    requiresApiKey: false,
    requiresOAuth: true,
    oauthFlow: 'device',
  },
}

export const codexBuiltinProvider: OnethingBuiltinProviderDefinition = {
  id: ONETHING_CODEX_PROVIDER_ID,
  info: {
    id: ONETHING_CODEX_PROVIDER_ID,
    name: 'Codex',
    description: 'Use Codex with your ChatGPT subscription via OAuth',
    defaultBaseUrl: ONETHING_CODEX_BASE_URL,
    defaultModel: ONETHING_CODEX_DEFAULT_MODEL,
    icon: 'codex',
    supportsCustomBaseUrl: false,
    requiresApiKey: false,
    requiresOAuth: true,
    oauthFlow: 'authorization-code',
  },
}

export const ONETHING_ACP_PROVIDER_ID = 'acp'

export const acpBuiltinProvider: OnethingBuiltinProviderDefinition = {
  id: ONETHING_ACP_PROVIDER_ID,
  info: {
    id: ONETHING_ACP_PROVIDER_ID,
    name: 'ACP Agents',
    description: 'Connect to local Agent Client Protocol agents such as Claude Code, Codex CLI, and Pi.',
    defaultBaseUrl: '',
    defaultModel: 'claude-code',
    icon: 'acp',
    supportsCustomBaseUrl: false,
    requiresApiKey: false,
  },
}

export const onethingPortableBuiltinProviders: OnethingBuiltinProviderDefinition[] = [
  openaiBuiltinProvider,
  claudeBuiltinProvider,
  deepseekBuiltinProvider,
  kimiBuiltinProvider,
  zhipuBuiltinProvider,
  openrouterBuiltinProvider,
  geminiBuiltinProvider,
  claudeCodeBuiltinProvider,
  githubCopilotBuiltinProvider,
  codexBuiltinProvider,
]

export const onethingBaseBuiltinProviders: OnethingBuiltinProviderDefinition[] = [
  ...onethingPortableBuiltinProviders,
  acpBuiltinProvider,
]
