import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createSkillManageTool,
  SkillViewTool,
  type RuntimeSkillDefinition,
  type SkillManageArgs,
  type SkillManageOptions,
} from '../skill.js'

let tmpDir: string | undefined

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  tmpDir = undefined
})

function makeSkill(name: string, description: string, instructions: string): RuntimeSkillDefinition {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-runtime-skill-test-'))
  const skillDir = path.join(tmpDir, name)
  fs.mkdirSync(skillDir, { recursive: true })
  const skillPath = path.join(skillDir, 'SKILL.md')
  fs.writeFileSync(skillPath, instructions, 'utf-8')
  return {
    id: name,
    name,
    description,
    source: 'user',
    path: skillPath,
    directoryPath: skillDir,
    enabled: true,
    instructions,
    files: [],
  }
}

describe('runtime skill read tools', () => {
  it('views skill files without main-process dependencies', async () => {
    const skill = makeSkill('docs', 'Write docs', '# Docs instructions')
    skill.category = 'writing'
    skill.rootPath = tmpDir
    skill.relativePath = 'writing/docs/SKILL.md'
    skill.tags = ['docs']
    const referencesDir = path.join(skill.directoryPath, 'references')
    fs.mkdirSync(referencesDir, { recursive: true })
    const referencePath = path.join(referencesDir, 'style.md')
    fs.writeFileSync(referencePath, '# Style guide', 'utf-8')
    skill.files = [{ name: 'references/style.md', path: referencePath, type: 'markdown' }]

    const viewTool = await SkillViewTool.init({ skills: [skill] })

    const viewed = await viewTool.execute(
      { name: 'docs' },
      {
        sessionId: 's1',
        messageId: 'm1',
        metadata: vi.fn(),
        updateResult: vi.fn(),
      },
    )
    expect(JSON.parse(viewed.output)).toMatchObject({
      success: true,
      name: 'docs',
      path: 'writing/docs/SKILL.md',
      absolute_path: skill.path,
      skill_dir: skill.directoryPath,
      linked_files: { references: ['references/style.md'] },
    })

    const file = await viewTool.execute(
      { name: 'docs', file_path: 'references/style.md' },
      {
        sessionId: 's1',
        messageId: 'm1',
        metadata: vi.fn(),
        updateResult: vi.fn(),
      },
    )
    expect(JSON.parse(file.output)).toMatchObject({
      success: true,
      file: 'references/style.md',
      content: '# Style guide',
      path: referencePath,
      skill_dir: skill.directoryPath,
    })
  })
})

describe('runtime SkillManageTool', () => {
  it('delegates mutation preview and execution through adapters', async () => {
    const previewCalls: Array<{ args: SkillManageArgs; options?: SkillManageOptions }> = []
    const executeCalls: Array<{ args: SkillManageArgs; options?: SkillManageOptions }> = []
    const invalidateSkillCachesAfterMutation = vi.fn()
    const skillPath = path.join(os.tmpdir(), 'learned-workflow', 'SKILL.md')
    const tool = createSkillManageTool({
      previewSkillManage(args, options) {
        previewCalls.push({ args, options })
        return {
          title: 'Create learned-workflow',
          path: skillPath,
          diff: 'diff',
          additions: 3,
          deletions: 0,
          created: true,
          mutated: true,
        }
      },
      executeSkillManage(args, options) {
        executeCalls.push({ args, options })
        return {
          success: true,
          action: args.action,
          title: 'Created learned-workflow',
          output: 'created',
          path: skillPath,
          diff: 'diff',
          additions: 3,
          deletions: 0,
          mutated: true,
        }
      },
      isSkillManageMutation: action => action !== 'read',
      invalidateSkillCachesAfterMutation,
    })
    const beforeSideEffect = vi.fn()
    const ctx = {
      sessionId: 's1',
      messageId: 'm1',
      workingDirectory: '/repo',
      metadata: vi.fn(),
      updateResult: vi.fn(),
      beforeSideEffect,
    }

    const args = {
      action: 'create' as const,
      name: 'learned-workflow',
      content: [
        '---',
        'name: learned-workflow',
        'description: Capture a workflow',
        '---',
        '',
        'Do the durable thing.',
      ].join('\n'),
    }
    const preview = await tool.analyze!(args, ctx)
    expect(preview.effects).toEqual([
      expect.objectContaining({
        kind: 'file_write',
        resources: [skillPath],
        barrier: true,
      }),
    ])
    expect(previewCalls[0]).toMatchObject({
      args: { action: 'create', name: 'learned-workflow' },
      options: { workingDirectory: '/repo' },
    })

    const result = await tool.execute(args, ctx)
    expect(result).toMatchObject({
      title: 'Created learned-workflow',
      output: 'created',
      metadata: {
        action: 'create',
        skillName: 'learned-workflow',
        path: skillPath,
        mutated: true,
      },
    })
    expect(executeCalls[0]).toMatchObject({
      args: { action: 'create', name: 'learned-workflow' },
      options: { workingDirectory: '/repo' },
    })
    expect(beforeSideEffect).toHaveBeenCalledTimes(1)
    expect(invalidateSkillCachesAfterMutation).toHaveBeenCalledWith(true, expect.objectContaining({ path: skillPath }))
  })
})
