import type { SkillSource } from '../../shared/ipc.js'

export interface PluginSkillInstructionContextInput {
  skillDir: string
  skillPath: string
  rootDir: string
}

export type PluginSkillInstructionContextProvider = (
  input: PluginSkillInstructionContextInput,
) => string | undefined

export interface PluginSkillRoot {
  pluginId: string
  path: string
  source?: SkillSource
  recursive?: boolean
  instructionContext?: PluginSkillInstructionContextProvider
}

export type PluginSkillRootProvider = () => PluginSkillRoot[] | Promise<PluginSkillRoot[]>

const providers = new Map<string, PluginSkillRootProvider>()

export function registerPluginSkillRootProvider(
  pluginId: string,
  provider: PluginSkillRootProvider,
): () => void {
  providers.set(pluginId, provider)
  return () => {
    if (providers.get(pluginId) === provider) {
      providers.delete(pluginId)
    }
  }
}

export function listPluginSkillRoots(): PluginSkillRoot[] {
  const roots: PluginSkillRoot[] = []
  for (const [pluginId, provider] of providers) {
    try {
      const result = provider()
      if (result instanceof Promise) {
        console.warn(`[Skills] Plugin skill root provider "${pluginId}" returned a Promise; async roots are ignored`)
        continue
      }
      for (const root of result) {
        roots.push({
          ...root,
          pluginId: root.pluginId || pluginId,
          source: root.source ?? 'plugin',
        })
      }
    } catch (err) {
      console.error(`[Skills] Plugin skill root provider "${pluginId}" failed:`, err)
    }
  }
  return roots
}
