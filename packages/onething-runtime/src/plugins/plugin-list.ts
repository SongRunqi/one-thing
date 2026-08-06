export interface OnethingPluginListManifestLike {
  name: string
  version: string
  description?: string
  author?: string
}

export interface OnethingPluginListDefinitionLike {
  id: string
  source?: string
  manifest: OnethingPluginListManifestLike
  enabled: boolean
  dirPath: string
  needsInstall?: boolean
}

/** 运行期健康(core 的 CorePluginRuntimeHealth 的结构镜像,过线只走 JSON)。 */
export interface OnethingPluginRuntimeHealthLike {
  status: string
  consecutiveFailures: number
  lastError?: string
  lastErrorScope?: string
  lastErrorAt?: number
  disabledReason?: string
}

export interface OnethingPluginListItemLike {
  definition: OnethingPluginListDefinitionLike
  loaded: boolean
  commands: string[]
  error?: string
  health?: OnethingPluginRuntimeHealthLike
}

export interface OnethingRendererPluginInfo {
  id: string
  source: string
  name: string
  version: string
  description: string
  author: string
  loaded: boolean
  enabled: boolean
  commands: string[]
  error: string
  dirPath: string
  needsInstall: boolean
  /** 'healthy' | 'installing' | 'degraded' | 'disabled';无健康记录时为 'healthy'。 */
  healthStatus: string
  healthFailures: number
  /** 运行期失败原因(熔断说明优先,其次最后一次错误)—— 设置页据此亮红。 */
  healthReason: string
}

export interface OnethingPluginCommandLike {
  name: string
  description?: string
  usage?: string
}

export interface OnethingRendererPluginCommandInfo {
  id: string
  name: string
  description: string
  usage: string
}

export function projectOnethingPluginsForRenderer<TPlugin extends OnethingPluginListItemLike>(
  plugins: TPlugin[],
): OnethingRendererPluginInfo[] {
  return plugins.map(plugin => ({
    id: plugin.definition.id,
    source: plugin.definition.source || 'user',
    name: plugin.definition.manifest.name,
    version: plugin.definition.manifest.version,
    description: plugin.definition.manifest.description || '',
    author: plugin.definition.manifest.author || '',
    loaded: plugin.loaded,
    enabled: plugin.definition.enabled,
    commands: plugin.commands,
    error: plugin.error || '',
    dirPath: plugin.definition.dirPath,
    needsInstall: plugin.definition.needsInstall || false,
    healthStatus: plugin.health?.status || 'healthy',
    healthFailures: plugin.health?.consecutiveFailures || 0,
    healthReason: plugin.health?.disabledReason
      || (plugin.health?.lastError
        ? `${plugin.health.lastErrorScope ? `${plugin.health.lastErrorScope}: ` : ''}${plugin.health.lastError}`
        : ''),
  }))
}

export function projectOnethingPluginCommandsForRenderer<TCommand extends OnethingPluginCommandLike>(
  commands: Iterable<TCommand>,
): OnethingRendererPluginCommandInfo[] {
  return Array.from(commands).map(command => ({
    id: command.name.replace(/^\//, ''),
    name: command.name,
    description: command.description || 'Plugin command',
    usage: command.usage || command.name,
  }))
}
