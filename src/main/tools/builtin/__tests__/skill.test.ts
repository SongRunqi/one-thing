import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkillManageTool, SkillViewTool } from '../skill.js'
import type { SkillDefinition } from '../../../../shared/ipc.js'

vi.mock('electron', () => ({
  app: { isPackaged: false },
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn() },
}))

let tmpDir: string | undefined
const originalEnv = { ...process.env }

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  tmpDir = undefined
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key]
  }
  Object.assign(process.env, originalEnv)
})

function makeSkill(name: string, description: string, instructions: string): SkillDefinition {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-skill-test-'))
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

describe('Skill read tools', () => {
  it('provides a Hermes-style skill_view tool', async () => {
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
    const viewPayload = JSON.parse(viewed.output)
    expect(viewPayload).toMatchObject({
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

describe('SkillManageTool', () => {
  function skillMarkdown(name: string, description: string, body: string): string {
    return [
      '---',
      `name: ${JSON.stringify(name)}`,
      `description: ${JSON.stringify(description)}`,
      '---',
      '',
      body,
      '',
    ].join('\n')
  }

  it('manages Hermes-style skills and support files under the Onething skills root', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-skill-manage-test-'))
    process.env.HOME = tmpDir
    process.env.HERMES_HOME = path.join(tmpDir, '.hermes')
    const beforeSideEffect = vi.fn()
    const ctx = {
      sessionId: 's1',
      messageId: 'm1',
      metadata: vi.fn(),
      updateResult: vi.fn(),
      beforeSideEffect,
    }

    const preview = await SkillManageTool.analyze!(
      {
        action: 'create',
        name: 'learned-workflow',
        category: 'writing',
        content: skillMarkdown('learned-workflow', 'Capture a durable workflow', 'Do the durable thing.'),
      },
      ctx,
    )
    expect(preview.effects?.[0]?.kind).toBe('file_write')

    const created = await SkillManageTool.execute(
      {
        action: 'create',
        name: 'learned-workflow',
        category: 'writing',
        content: skillMarkdown('learned-workflow', 'Capture a durable workflow', 'Do the durable thing.'),
      },
      ctx,
    )
    const skillDir = path.join(tmpDir, '.onething', 'skills', 'writing', 'learned-workflow')
    const skillPath = path.join(skillDir, 'SKILL.md')
    expect(created.metadata.mutated).toBe(true)
    expect(fs.readFileSync(skillPath, 'utf-8')).toContain('Do the durable thing.')

    const patched = await SkillManageTool.execute(
      {
        action: 'patch',
        name: 'learned-workflow',
        old_string: 'Do the durable thing.',
        new_string: 'Do the sharper durable thing.',
      },
      ctx,
    )
    expect(patched.metadata.mutated).toBe(true)
    expect(fs.readFileSync(skillPath, 'utf-8')).toContain('Do the sharper durable thing.')

    const fuzzyPatched = await SkillManageTool.execute(
      {
        action: 'patch',
        name: 'learned-workflow',
        old_string: '  Do the sharper durable thing.',
        new_string: 'Do the Hermes durable thing.',
      },
      ctx,
    )
    expect(fuzzyPatched.metadata.mutated).toBe(true)
    expect(fs.readFileSync(skillPath, 'utf-8')).toContain('Do the Hermes durable thing.')

    const written = await SkillManageTool.execute(
      {
        action: 'write_file',
        name: 'learned-workflow',
        file_path: 'references/style.md',
        file_content: '# Style guide',
      },
      ctx,
    )
    const supportPath = path.join(skillDir, 'references', 'style.md')
    expect(written.metadata.mutated).toBe(true)
    expect(fs.readFileSync(supportPath, 'utf-8')).toBe('# Style guide')

    const removed = await SkillManageTool.execute(
      {
        action: 'remove_file',
        name: 'learned-workflow',
        file_path: 'references/style.md',
      },
      ctx,
    )
    expect(removed.metadata.mutated).toBe(true)
    expect(fs.existsSync(supportPath)).toBe(false)

    const deletedPreview = await SkillManageTool.analyze!(
      {
        action: 'delete',
        name: 'learned-workflow',
      },
      ctx,
    )
    expect(deletedPreview.effects?.[0]?.kind).toBe('file_destructive_edit')

    const deleted = await SkillManageTool.execute(
      {
        action: 'delete',
        name: 'learned-workflow',
      },
      ctx,
    )
    expect(deleted.metadata.mutated).toBe(true)
    expect(fs.existsSync(skillDir)).toBe(false)
    expect(beforeSideEffect).toHaveBeenCalledTimes(6)
  })

  it('returns a JSON error for support file paths outside allowed skill directories', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-skill-manage-test-'))
    process.env.HOME = tmpDir
    process.env.HERMES_HOME = path.join(tmpDir, '.hermes')
    const ctx = {
      sessionId: 's1',
      messageId: 'm1',
      metadata: vi.fn(),
      updateResult: vi.fn(),
      beforeSideEffect: vi.fn(),
    }

    await SkillManageTool.execute(
      {
        action: 'create',
        name: 'learned-workflow',
        content: skillMarkdown('learned-workflow', 'Capture a durable workflow', 'Do the durable thing.'),
      },
      ctx,
    )

    const rejected = await SkillManageTool.execute(
      {
        action: 'write_file',
        name: 'learned-workflow',
        file_path: '../escape.md',
        file_content: 'nope',
      },
      ctx,
    )
    expect(JSON.parse(rejected.output)).toMatchObject({
      success: false,
      action: 'write_file',
    })
    expect(JSON.parse(rejected.output).error).toContain('inside the skill directory')
  })
})
