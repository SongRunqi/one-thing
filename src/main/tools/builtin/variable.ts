import { createVariableTool } from '@onething/runtime/tools'
import {
  getVariableRegistry,
  VariableError,
} from '../../variables/index.js'

export const VariableTool = createVariableTool({
  getRegistry: getVariableRegistry,
  isVariableError: error => error instanceof VariableError,
})
