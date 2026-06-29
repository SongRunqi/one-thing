import { createProjectDirsTool } from '@onething/runtime/tools'
import { getProjectsStore } from '@onething/runtime/project-dirs/store'

export const ProjectDirsTool = createProjectDirsTool({
  getStore: getProjectsStore,
})
