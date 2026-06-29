import { describe, expect, it, vi } from 'vitest'
import {
  CalculatorTool,
  evaluateCalculatorExpression,
  executeCalculatorExpression,
} from '../calculator.js'

function createContext() {
  return {
    sessionId: 'session-1',
    messageId: 'message-1',
    metadata: vi.fn(),
    updateResult: vi.fn(),
  }
}

describe('runtime calculator tool', () => {
  it('evaluates arithmetic, powers, constants, and math functions', () => {
    expect(evaluateCalculatorExpression('2 + 3 * 4')).toBe(14)
    expect(evaluateCalculatorExpression('2^10')).toBe(1024)
    expect(evaluateCalculatorExpression('sqrt(16)')).toBe(4)
    expect(evaluateCalculatorExpression('sin(PI/2)')).toBeCloseTo(1)
    expect(executeCalculatorExpression('10 / 4')).toEqual({
      expression: '10 / 4',
      result: 2.5,
      formatted: '2.5',
    })
  })

  it('rejects unsafe or incomplete expressions', () => {
    expect(() => evaluateCalculatorExpression('process.exit()')).toThrow('Expression contains forbidden keywords')
    expect(() => evaluateCalculatorExpression('sqrt(foo)')).toThrow('Expression could not be fully evaluated')
    expect(() => evaluateCalculatorExpression('1 / 0')).toThrow('Result is not a valid number')
  })

  it('runs as a Tool.define builtin', async () => {
    const ctx = createContext()
    const result = await CalculatorTool.execute({ expression: 'max(4, 7)' }, ctx)

    expect(result).toEqual({
      title: 'Calculated max(4, 7)',
      output: '7',
      metadata: {
        expression: 'max(4, 7)',
        result: 7,
        formatted: '7',
      },
    })
    expect(ctx.updateResult).toHaveBeenCalledWith(expect.objectContaining({
      details: { phase: 'running', expression: 'max(4, 7)' },
    }))
    expect(ctx.metadata).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Calculated max(4, 7)',
    }))
  })
})
