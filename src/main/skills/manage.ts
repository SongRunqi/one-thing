import {
  configureOnethingSkillManageRuntime,
} from '@onething/runtime/skills'
import {
  getUserSkillsPath,
  loadAllSkills,
} from './loader.js'

configureOnethingSkillManageRuntime({
  getUserSkillsPath,
  loadAllSkills,
})

export {
  configureOnethingSkillManageRuntime,
  executeSkillManage,
  isSkillManageMutation,
  previewSkillManage,
} from '@onething/runtime/skills'
export type {
  OnethingSkillManageAdapters,
  SkillManageAction,
  SkillManageArgs,
  SkillManageOptions,
  SkillManagePreview,
  SkillManageResult,
} from '@onething/runtime/skills'
