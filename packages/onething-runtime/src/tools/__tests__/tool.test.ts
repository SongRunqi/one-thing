import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { Tool, isAsyncTool, zodToJsonSchema } from '../tool.js'

describe('onething runtime tool core', () => {
  it('defines, validates, and executes static tools', async () => {
    const tool = Tool.define('echo', {
      name: 'Echo',
      description: 'Echo input',
      category: 'builtin',
      parameters: z.object({ text: z.string() }),
      async execute(args, ctx) {
        ctx.metadata({ title: args.text })
        return {
          title: 'Echoed',
          output: args.text,
          metadata: { length: args.text.length },
        }
      },
    })

    const metadata: unknown[] = []
    await expect(Tool.execute(tool, { text: 'hello' }, {
      sessionId: 's1',
      messageId: 'm1',
      metadata: input => metadata.push(input),
    })).resolves.toMatchObject({
      title: 'Echoed',
      output: 'hello',
      metadata: { length: 5 },
    })
    expect(metadata).toEqual([{ title: 'hello' }])
    expect(Tool.safeValidateArgs(tool, { text: 1 }).success).toBe(false)
  })

  it('supports async tools and zod json schema conversion', async () => {
    const tool = Tool.define('dynamic', {
      name: 'Dynamic',
      category: 'builtin',
    }, async ctx => ({
      description: `Workspace: ${ctx?.workspace?.name ?? 'none'}`,
      parameters: z.object({ count: z.number() }),
      async execute(args: { count: number }) {
        return {
          title: 'Dynamic',
          output: String(args.count),
          metadata: {},
        }
      },
    }))

    expect(isAsyncTool(tool)).toBe(true)
    const initialized = await Tool.initialize(tool, { workspace: { id: 'w1', name: 'Repo' } })
    expect(initialized.description).toBe('Workspace: Repo')
    expect(Tool.getInitialized(tool)).toBe(initialized)
    Tool.resetInit(tool)
    expect(tool._initialized).toBeUndefined()
    expect(zodToJsonSchema(z.object({ count: z.number() }))).toMatchObject({
      type: 'object',
      properties: { count: expect.objectContaining({ type: 'number' }) },
      required: ['count'],
    })
  })
})
