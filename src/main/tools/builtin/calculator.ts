/**
 * Built-in Tool: Calculator
 *
 * Performs mathematical calculations.
 */

import type { ToolDefinition, ToolHandler } from '../types.js'

export const definition: ToolDefinition = {
  id: 'calculator',
  name: 'Calculator',
  description: 'Perform mathematical calculations. Supports basic arithmetic operations (+, -, *, /), powers (^), and common math functions (sqrt, sin, cos, tan, log, abs, round, floor, ceil).',
  parameters: [
    {
      name: 'expression',
      type: 'string',
      description: 'The mathematical expression to evaluate. Examples: "2 + 3 * 4", "sqrt(16)", "sin(3.14159/2)", "2^10"',
      required: true,
    },
  ],
  enabled: true,
  autoExecute: true,
  category: 'builtin',
  icon: 'calculator',
}

// Safe math functions available in expressions
const mathFunctions: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
}

// Constants
const mathConstants: Record<string, number> = {
  PI: Math.PI,
  E: Math.E,
  pi: Math.PI,
  e: Math.E,
}

/**
 * Safely evaluate a mathematical expression
 */
function safeEvaluate(expression: string): number {
  // Remove whitespace
  let expr = expression.replace(/\s+/g, '')

  // Replace constants
  for (const [name, value] of Object.entries(mathConstants)) {
    expr = expr.replace(new RegExp(`\\b${name}\\b`, 'g'), value.toString())
  }

  // Replace ^ with ** for power operations
  expr = expr.replace(/\^/g, '**')

  // Validate expression - only allow safe characters
  const safePattern = /^[0-9+\-*/().,%<>=!&|?:a-zA-Z_]+$/
  if (!safePattern.test(expr)) {
    throw new Error('Invalid characters in expression')
  }

  // Check for dangerous patterns
  const dangerousPatterns = [
    /\beval\b/i,
    /\bfunction\b/i,
    /\breturn\b/i,
    /\bimport\b/i,
    /\brequire\b/i,
    /\bprocess\b/i,
    /\bglobal\b/i,
    /\bwindow\b/i,
    /\bdocument\b/i,
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(expr)) {
      throw new Error('Expression contains forbidden keywords')
    }
  }

  // Replace function calls with safe implementations
  for (const [name, fn] of Object.entries(mathFunctions)) {
    const fnPattern = new RegExp(`\\b${name}\\(([^)]+)\\)`, 'g')
    expr = expr.replace(fnPattern, (_, args) => {
      const parsedArgs = args.split(',').map((arg: string) => safeEvaluate(arg))
      return fn(...parsedArgs).toString()
    })
  }

  // Final validation - should only contain numbers and operators now
  const finalPattern = /^[0-9+\-*/().e]+$/
  if (!finalPattern.test(expr)) {
    throw new Error('Expression could not be fully evaluated')
  }

  // Evaluate using Function constructor with no access to global scope
  const result = new Function(`"use strict"; return (${expr})`)()

  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error('Result is not a valid number')
  }

  return result
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

    const result = safeEvaluate(expression)

    return {
      success: true,
      data: {
        expression,
        result,
        formatted: Number.isInteger(result) ? result.toString() : result.toFixed(10).replace(/\.?0+$/, ''),
      },
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to evaluate expression',
    }
  }
}
