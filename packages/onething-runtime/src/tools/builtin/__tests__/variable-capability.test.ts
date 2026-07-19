import { describe, expect, it } from 'vitest'
import { createVariableTool } from '../variable.js'
import type { RuntimeVariableRegistry } from '../variable.js'

const registry = {} as RuntimeVariableRegistry
const tool = createVariableTool({ getRegistry: () => registry })

const ctx = {} as never

function analyze(args: Record<string, unknown>) {
  return tool.analyze!(args as never, ctx) as { effects: Array<{ kind: string; resources: string[]; metadata?: Record<string, unknown> }> }
}

describe('variable tool capability gating', () => {
  // The live state board must stay frictionless — that is the whole point of it.
  describe('ordinary variables raise no effect', () => {
    it.each([
      { action: 'set', name: 'deploy_target', value: 'staging' },
      { action: 'set', name: 'workdir', value: '/repo' },
      { action: 'append', name: 'notes_scratch', value: 'x' },
      { action: 'delete', name: 'deploy_target' },
      { action: 'list' },
    ])('%j', (args) => {
      expect(analyze(args).effects).toEqual([])
    })
  })

  // The hole this closes: the variable tool had no analyze at all, so the
  // assistant could repoint the recursive skill-discovery root with no prompt.
  describe('capability variables raise a permission effect', () => {
    it.each(['ai_note_dir', 'user_note_dir', 'work_note_dir'])('set %s', (name) => {
      const { effects } = analyze({ action: 'set', name, value: '/anywhere' })

      expect(effects).toHaveLength(1)
      expect(effects[0].kind).toBe('capability_change')
      expect(effects[0].resources).toEqual(['/anywhere'])
      expect(effects[0].metadata).toMatchObject({ variable: name, value: '/anywhere' })
    })

    it('gates deleting one too', () => {
      const { effects } = analyze({ action: 'delete', name: 'ai_note_dir' })

      expect(effects).toHaveLength(1)
      expect(effects[0].kind).toBe('capability_change')
    })

    it('does not gate merely listing', () => {
      expect(analyze({ action: 'list', name: 'ai_note_dir' }).effects).toEqual([])
    })

    it('is not fooled by surrounding whitespace', () => {
      expect(analyze({ action: 'set', name: '  ai_note_dir  ', value: '/x' }).effects).toHaveLength(1)
    })
  })
})
