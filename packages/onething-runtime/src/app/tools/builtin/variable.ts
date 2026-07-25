import { createVariableTool } from '@onething/runtime/tools'
import {
  getGuardedVariableRegistryForTools,
  VariableError,
} from '../../variables/index.js'

export const VariableTool = createVariableTool({
  // Guarded facade: external identity sessions (gateway IM / API) cannot
  // read or write global-effect variables through the tool.
  getRegistry: getGuardedVariableRegistryForTools,
  isVariableError: error => error instanceof VariableError,
})
