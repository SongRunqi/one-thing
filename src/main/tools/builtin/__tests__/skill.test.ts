import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkillTool } from '../skill.js'
import type { SkillDefinition } from '../../../../shared/ipc.js'

let tmpDir: string | undefined

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  tmpDir = undefined
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

describe('SkillTool', () => {
  it('keeps model-facing schema compact and lists skills through fuzzy search', async () => {
    const skill = makeSkill('code-review', 'Review code changes carefully', '# Review')
    const initialized = await SkillTool.init({ skills: [skill] })
    const partials: unknown[] = []

    expect(initialized.description).not.toContain('code-review')

    const result = await initialized.execute(
      { action: 'search', query: 'crv' },
      {
        sessionId: 's1',
        messageId: 'm1',
        metadata: vi.fn(),
        updateResult: update => partials.push(update),
      },
    )

    expect(result.output).toContain('code-review')
    expect(partials).toHaveLength(1)
  })

  it('supports find as an explicit fuzzy-search action', async () => {
    const skill = makeSkill('docs-polish', 'Improve documentation writing', '# Docs')
    const initialized = await SkillTool.init({ skills: [skill] })

    const result = await initialized.execute(
      { action: 'find', query: 'dcp' },
      {
        sessionId: 's1',
        messageId: 'm1',
        metadata: vi.fn(),
        updateResult: vi.fn(),
      },
    )

    expect(result.output).toContain('docs-polish')
  })

  it('streams loading and ready states when loading one skill', async () => {
    const skill = makeSkill('docs', 'Write docs', '# Docs instructions')
    const initialized = await SkillTool.init({ skills: [skill] })
    const partials: Array<any> = []

    const result = await initialized.execute(
      { action: 'load', name: 'docs' },
      {
        sessionId: 's1',
        messageId: 'm1',
        metadata: vi.fn(),
        updateResult: update => partials.push(update),
      },
    )

    expect(result.output).toContain('# Docs instructions')
    expect(partials.map(part => part.details?.phase)).toEqual(['loading', 'ready'])
  })
})
