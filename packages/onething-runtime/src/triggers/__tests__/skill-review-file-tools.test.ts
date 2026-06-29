import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { AgentToolExecutionContext } from '@onething/core/agent-loop'
import { createOnethingSkillReviewFileToolAdapters } from '../skill-review.js'
import type { Tool } from '../../tools/index.js'

const parameters = z.object({
  path: z.string(),
})

function fileTool(id: string): Tool.Info<typeof parameters> {
  return {
    id,
    name: id,
    description: `${id} file`,
    category: 'builtin',
    parameters,
    async execute(args, ctx) {
      return {
        title: id,
        output: `${ctx.sessionId}:${ctx.toolCallId}:${args.path}`,
        metadata: {
          path: args.path,
          cwd: ctx.workingDirectory,
        },
      }
    },
  }
}

describe('skill review file tool adapters', () => {
  it('wraps runtime tools into skill-review agent file tool adapters', async () => {
    const adapters = createOnethingSkillReviewFileToolAdapters({
      tools: {
        read: fileTool('read'),
        write: fileTool('write'),
        edit: fileTool('edit'),
      },
      toToolContext(toolCtx: AgentToolExecutionContext) {
        return {
          sessionId: 's1',
          messageId: 'm1',
          toolCallId: toolCtx.toolCallId,
          workingDirectory: '/repo',
          metadata: () => {},
        }
      },
    })

    expect(adapters.read.parameters).toMatchObject({
      type: 'object',
      properties: {
        path: expect.any(Object),
      },
      required: ['path'],
    })
    expect(adapters.read.parse({})).toMatchObject({
      success: false,
    })
    expect(adapters.read.parse({ path: 'note.md' })).toEqual({
      success: true,
      data: { path: 'note.md' },
    })

    await expect(adapters.edit.execute(
      { path: 'SKILL.md' },
      {
        sessionId: 'agent-loop',
        messageId: 'review',
        toolCallId: 'call-1',
      },
    )).resolves.toEqual({
      output: 's1:call-1:SKILL.md',
      metadata: {
        path: 'SKILL.md',
        cwd: '/repo',
      },
    })
  })
})
