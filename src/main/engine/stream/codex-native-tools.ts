import type { OAuthToken, ToolSettings } from '../../../shared/ipc.js'
import { toJsonObject } from '../../../shared/json.js'
import type { ProviderAuthContext } from '../../auth/types.js'
import * as modelRegistry from '../../providers/model-registry.js'

export const CODEX_NATIVE_IMAGE_GENERATION_TOOL = 'image_generation'

export type CodexNativeToolProviderConfig = {
  model?: string
  authContext?: ProviderAuthContext
  oauthToken?: OAuthToken
}

function providerConfigUsesCodexOAuth(providerConfig: CodexNativeToolProviderConfig): boolean {
  return providerConfig.authContext?.kind === 'oauth' ||
    typeof providerConfig.oauthToken?.accessToken === 'string'
}

export async function getCodexNativeToolsForConfig(options: {
  providerId: string
  providerConfig: CodexNativeToolProviderConfig
  toolSettings?: ToolSettings
  supportsTools: boolean
}): Promise<string[]> {
  if (options.providerId !== 'codex') return []
  if (!options.toolSettings?.enableToolCalls) return []
  if (!options.supportsTools) return []
  if (!providerConfigUsesCodexOAuth(options.providerConfig)) return []

  const modelInfo = await modelRegistry.getModelById(options.providerConfig.model || '', options.providerId)
  const codexMetadata = toJsonObject(toJsonObject(modelInfo?.providerMetadata).codex)
  const nativeToolsValue = codexMetadata.nativeTools
  const nativeTools = Array.isArray(nativeToolsValue)
    ? nativeToolsValue.filter((tool): tool is string => typeof tool === 'string')
    : undefined

  if (nativeTools) {
    return nativeTools.includes(CODEX_NATIVE_IMAGE_GENERATION_TOOL)
      ? [CODEX_NATIVE_IMAGE_GENERATION_TOOL]
      : []
  }

  const inputModalities = modelInfo?.architecture?.input_modalities
  return !modelInfo || inputModalities?.includes('image')
    ? [CODEX_NATIVE_IMAGE_GENERATION_TOOL]
    : []
}
