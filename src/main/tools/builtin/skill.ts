import {
  createSkillManageTool,
  SkillViewTool,
  SkillsListTool,
  type SkillManageArgs as RuntimeSkillManageArgs,
  type SkillManageOptions as RuntimeSkillManageOptions,
  type SkillManageResult as RuntimeSkillManageResult,
  type SkillManageMetadata,
  type SkillManagePreview as RuntimeSkillManagePreview,
  type SkillMetadata,
} from '@onething/runtime/tools'
import {
  executeSkillManage,
  isSkillManageMutation,
  previewSkillManage,
  type SkillManageAction,
  type SkillManageArgs,
  type SkillManageOptions,
  type SkillManageResult,
} from '../../skills/manage.js'

export {
  SkillViewTool,
  SkillsListTool,
}
export type {
  SkillManageMetadata,
  SkillMetadata,
}

async function invalidateSkillCachesAfterMutation(mutated: boolean): Promise<void> {
  if (!mutated) return
  try {
    const { invalidateSessionSkillsCache } = await import('../../skills/session-skills.js')
    invalidateSessionSkillsCache()
  } catch (error) {
    console.warn('[SkillManage] Failed to invalidate skill cache:', error)
  }
}

export const SkillManageTool = createSkillManageTool({
  previewSkillManage: (args: RuntimeSkillManageArgs, options?: RuntimeSkillManageOptions): RuntimeSkillManagePreview =>
    previewSkillManage(args as SkillManageArgs, options as SkillManageOptions),
  executeSkillManage: (args: RuntimeSkillManageArgs, options?: RuntimeSkillManageOptions): RuntimeSkillManageResult =>
    executeSkillManage(args as SkillManageArgs, options as SkillManageOptions) as SkillManageResult,
  isSkillManageMutation: (action: string): boolean => isSkillManageMutation(action as SkillManageAction),
  invalidateSkillCachesAfterMutation,
})
