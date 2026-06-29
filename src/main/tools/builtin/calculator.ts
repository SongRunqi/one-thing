import type { ToolDefinition, ToolHandler } from '../types.js'
import {
  CalculatorTool,
  executeCalculatorExpression,
} from '@onething/runtime/tools/builtin/calculator'

export { CalculatorTool }

export const definition: ToolDefinition = {
  id: 'calculator',
  name: CalculatorTool.name,
  description: CalculatorTool.description,
  parameters: [
    {
      name: 'expression',
      type: 'string',
      description: 'The mathematical expression to evaluate. Examples: "2 + 3 * 4", "sqrt(16)", "sin(PI/2)", "2^10"',
      required: true,
    },
  ],
  enabled: CalculatorTool.enabled ?? true,
  autoExecute: CalculatorTool.autoExecute ?? true,
  permissionGuard: CalculatorTool.permissionGuard,
  category: 'builtin',
  icon: 'calculator',
}

export const handler: ToolHandler = async (args) => {
  try {
    const { expression } = args
    if (!expression || typeof expression !== 'string') {
      return {
        success: false,
        error: 'Expression is required and must be a string',
      }
    }

    return {
      success: true,
      data: executeCalculatorExpression(expression),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to evaluate expression',
    }
  }
}
