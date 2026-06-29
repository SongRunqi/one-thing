import { z } from 'zod'
import { Tool } from '../tool.js'

const CalculatorParameters = z.object({
  expression: z.string()
    .min(1)
    .describe('Mathematical expression to evaluate. Examples: "2 + 3 * 4", "sqrt(16)", "sin(PI/2)", "2^10".'),
})

export interface CalculatorMetadata {
  expression: string
  result: number
  formatted: string
}

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

const mathConstants: Record<string, number> = {
  PI: Math.PI,
  E: Math.E,
  pi: Math.PI,
  e: Math.E,
}

function formatCalculatorResult(result: number): string {
  return Number.isInteger(result)
    ? result.toString()
    : result.toFixed(10).replace(/\.?0+$/, '')
}

export function evaluateCalculatorExpression(expression: string): number {
  let expr = expression.replace(/\s+/g, '')

  for (const [name, value] of Object.entries(mathConstants)) {
    expr = expr.replace(new RegExp(`\\b${name}\\b`, 'g'), value.toString())
  }

  expr = expr.replace(/\^/g, '**')

  const safePattern = /^[0-9+\-*/().,%<>=!&|?:a-zA-Z_]+$/
  if (!safePattern.test(expr)) {
    throw new Error('Invalid characters in expression')
  }

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

  for (const [name, fn] of Object.entries(mathFunctions)) {
    const fnPattern = new RegExp(`\\b${name}\\(([^)]+)\\)`, 'g')
    expr = expr.replace(fnPattern, (_match, args) => {
      const parsedArgs = String(args)
        .split(',')
        .map(arg => evaluateCalculatorExpression(arg))
      return fn(...parsedArgs).toString()
    })
  }

  const finalPattern = /^[0-9+\-*/().e]+$/
  if (!finalPattern.test(expr)) {
    throw new Error('Expression could not be fully evaluated')
  }

  const result = new Function(`"use strict"; return (${expr})`)()
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error('Result is not a valid number')
  }

  return result
}

export function executeCalculatorExpression(expression: string): CalculatorMetadata {
  const result = evaluateCalculatorExpression(expression)
  return {
    expression,
    result,
    formatted: formatCalculatorResult(result),
  }
}

export const CalculatorTool = Tool.define<typeof CalculatorParameters, CalculatorMetadata>('calculator', {
  name: 'Calculator',
  description: 'Perform mathematical calculations. Supports basic arithmetic operations (+, -, *, /), powers (^), and common math functions such as sqrt, sin, cos, tan, log, abs, round, floor, ceil, min, max, and pow.',
  category: 'builtin',
  enabled: true,
  autoExecute: true,
  permissionGuard: 'safe',
  executionMode: 'parallel',
  renderKind: 'text',
  parameters: CalculatorParameters,
  async execute(args, ctx) {
    ctx.updateResult?.({
      content: [{ type: 'text', text: `Calculating ${args.expression}...` }],
      details: { phase: 'running', expression: args.expression },
    })

    const metadata = executeCalculatorExpression(args.expression)
    ctx.metadata({
      title: `Calculated ${metadata.expression}`,
      metadata,
    })

    return {
      title: `Calculated ${metadata.expression}`,
      output: metadata.formatted,
      metadata,
    }
  },
})
