import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateChatResponse } from '../../../providers/index.js'
import { createDeepSeekAgentProvider, runAgentLoop } from '../../../agent-loop/index.js'
import { getUserSkillsPath } from '../../../skills/index.js'
import { invalidateSkillsCache } from '../../../ipc/skills.js'
import { createSkillReviewTrigger } from '../skill-review.js'
import { clearSkillReviewState } from '../skill-review-state.js'

vi.mock('electron', () => ({
  app: { isPackaged: false },
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn() },
}))

vi.mock('../../../providers/index.js', () => ({
  generateChatResponse: vi.fn(),
}))

vi.mock('../../../agent-loop/index.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../agent-loop/index.js')>()
  return {
    ...actual,
    createDeepSeekAgentProvider: vi.fn(() => ({ id: 'deepseek', runTurn: vi.fn() })),
    runAgentLoop: vi.fn(),
  }
})

const originalEnv = { ...process.env }
let tmpDir: string

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key]
  }
  Object.assign(process.env, originalEnv)
}

beforeEach(() => {
  restoreEnv()
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-skill-review-'))
  process.env.HOME = tmpDir
  vi.mocked(generateChatResponse).mockReset()
  vi.mocked(createDeepSeekAgentProvider).mockReset()
  vi.mocked(createDeepSeekAgentProvider).mockReturnValue({ id: 'deepseek', runTurn: vi.fn() })
  vi.mocked(runAgentLoop).mockReset()
})

afterEach(() => {
  invalidateSkillsCache()
  clearSkillReviewState()
  fs.rmSync(tmpDir, { recursive: true, force: true })
  restoreEnv()
})

function triggerContext(): Parameters<ReturnType<typeof createSkillReviewTrigger>['execute']>[0] {
  const messages = [
    { id: 'u1', role: 'user', content: 'Remember this reusable review workflow.' },
    { id: 'a1', role: 'assistant', content: 'I will apply that workflow.' },
  ]

  return {
    sessionId: 's1',
    session: {
      id: 's1',
      workingDirectory: tmpDir,
      messages,
    },
    messages,
    lastUserMessage: 'Remember this reusable review workflow.',
    lastAssistantMessage: 'I will apply that workflow.',
    providerId: 'mock-provider',
    providerConfig: { model: 'mock-model' },
    settings: {},
    toolIterations: 10,
    skillManageCalled: false,
    enabledToolNames: ['skill_manage'],
  } as any
}

describe('Hermes skill review trigger', () => {
  it('creates a complete skill package with supporting files', async () => {
    vi.mocked(generateChatResponse).mockResolvedValue(JSON.stringify({
      actions: [{
        action: 'create',
        name: 'review-workflow',
        description: 'Use when preserving a reusable review workflow.',
        instructions: 'Load the checklist before reviewing and apply the summary template.',
        files: [
          {
            file_path: 'references/checklist.md',
            content: '# Review Checklist\n\n- Confirm scope\n- Check risks',
          },
          {
            file_path: 'templates/summary.md',
            content: '## Findings\n\n## Verification',
          },
        ],
        reason: 'The user asked to preserve a reusable review workflow.',
      }],
    }))

    await createSkillReviewTrigger().execute(triggerContext())

    const skillDir = path.join(getUserSkillsPath(), 'review-workflow')
    const skillMarkdown = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8')

    expect(skillMarkdown).toContain('name: "review-workflow"')
    expect(skillMarkdown).toContain('references/checklist.md')
    expect(skillMarkdown).toContain('templates/summary.md')
    expect(fs.readFileSync(path.join(skillDir, 'references', 'checklist.md'), 'utf-8'))
      .toContain('Confirm scope')
    expect(fs.readFileSync(path.join(skillDir, 'templates', 'summary.md'), 'utf-8'))
      .toContain('## Verification')
  })

  it('adds a default reference file when a create action omits supporting files', async () => {
    vi.mocked(generateChatResponse).mockResolvedValue(JSON.stringify({
      actions: [{
        action: 'create',
        name: 'fallback-workflow',
        description: 'Use when preserving a small reusable workflow.',
        instructions: 'Follow the compact workflow every time.',
        reason: 'The workflow should be reusable.',
      }],
    }))

    await createSkillReviewTrigger().execute(triggerContext())

    const skillDir = path.join(getUserSkillsPath(), 'fallback-workflow')
    const skillMarkdown = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8')
    const procedure = fs.readFileSync(path.join(skillDir, 'references', 'procedure.md'), 'utf-8')

    expect(skillMarkdown).toContain('references/procedure.md')
    expect(procedure).toContain('Follow the compact workflow every time.')
  })

  it('uses the independent agent loop with skill_manage for DeepSeek review', async () => {
    vi.mocked(runAgentLoop).mockImplementation(async options => {
      expect(options.model).toBe('deepseek-v4-pro')
      expect(options.thinking).toBe('enabled')
      expect(options.reasoningEffort).toBe('high')
      expect(options.selectedToolNames).toEqual(['skill_manage'])
      expect(options.tools?.map(tool => tool.name)).toEqual(['skill_manage'])
      expect(options.messages[0].content).toContain('Use the skill_manage tool')
      expect(options.tools?.[0].parameters).toMatchObject({
        type: 'object',
        properties: expect.objectContaining({
          action: expect.any(Object),
          name: expect.any(Object),
          content: expect.any(Object),
        }),
      })
      const toolResult = await options.tools?.[0].execute({
        action: 'create',
        name: 'agent-workflow',
        content: [
          '---',
          'name: "agent-workflow"',
          'description: "Use when preserving agent-created review workflows."',
          '---',
          '',
          'Capture the reusable workflow from the recent conversation.',
          '',
        ].join('\n'),
      }, {
        sessionId: 's1',
        messageId: 'm1',
        toolCallId: 'call_1',
        workingDirectory: tmpDir,
      })
      expect(toolResult?.error).toBeUndefined()
      return {
        messages: options.messages,
        text: '{"changed":true}',
        reasoning: 'reviewed',
        finishReason: 'stop',
        turns: 1,
        toolResults: [{
          toolCall: { id: 'call_1', name: 'skill_manage', arguments: '{"action":"create"}' },
          result: toolResult!,
        }],
      }
    })

    const ctx = triggerContext()
    ctx.providerId = 'deepseek'
    ctx.providerConfig = {
      apiKey: 'deepseek-key',
      baseUrl: 'https://deepseek.test',
      model: 'deepseek-v4-pro',
    } as any

    await createSkillReviewTrigger().execute(ctx)

    expect(createDeepSeekAgentProvider).toHaveBeenCalledWith({
      apiKey: 'deepseek-key',
      baseUrl: 'https://deepseek.test',
    })
    expect(runAgentLoop).toHaveBeenCalledTimes(1)
    expect(generateChatResponse).not.toHaveBeenCalled()

    const skillDir = path.join(getUserSkillsPath(), 'agent-workflow')
    const skillMarkdown = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8')
    const procedure = fs.readFileSync(path.join(skillDir, 'references', 'procedure.md'), 'utf-8')

    expect(skillMarkdown).toContain('references/procedure.md')
    expect(procedure).toContain('Capture the reusable workflow')
  })
})
