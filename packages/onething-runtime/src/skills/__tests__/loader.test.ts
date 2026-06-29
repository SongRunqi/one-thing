import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  configureOnethingSkillsLoaderRuntime,
  findProjectSkillPaths,
  getUserSkillsPath,
  loadAllSkills,
} from '../loader.js'
import type { PluginSkillRoot } from '../types.js'

let root = ''
let storePath = ''
let projectDir = ''
let pluginRoot = ''

function writeSkill(skillsRoot: string, dirname: string, name = dirname): void {
  const dir = path.join(skillsRoot, dirname)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), [
    '---',
    `name: ${JSON.stringify(name)}`,
    `description: ${JSON.stringify(`${name} description`)}`,
    '---',
    '',
    `${name} instructions`,
    '',
  ].join('\n'), 'utf-8')
}

describe('onething skills loader runtime', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-runtime-loader-'))
    storePath = path.join(root, 'store')
    projectDir = path.join(root, 'workspace', 'app')
    pluginRoot = path.join(root, 'plugin-skills')

    const builtinRoot = path.join(root, 'resources', 'skills')
    const userRoot = path.join(storePath, 'skills')
    const projectRoot = path.join(projectDir, '.onething', 'skills')

    writeSkill(builtinRoot, 'shared')
    writeSkill(builtinRoot, 'builtin-only')
    writeSkill(pluginRoot, 'shared')
    writeSkill(pluginRoot, 'plugin-only')
    writeSkill(userRoot, 'shared')
    writeSkill(userRoot, 'user-only')
    writeSkill(projectRoot, 'shared')
    writeSkill(projectRoot, 'project-only')

    configureOnethingSkillsLoaderRuntime({
      getStorePath: () => storePath,
      getCwd: () => root,
      isPackaged: () => false,
      listPluginSkillRoots: (): PluginSkillRoot[] => [{
        pluginId: 'plugin-a',
        path: pluginRoot,
      }],
    })
  })

  afterEach(() => {
    configureOnethingSkillsLoaderRuntime(undefined)
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('loads app, project, plugin, and builtin skills through host adapters', () => {
    expect(getUserSkillsPath()).toBe(path.join(storePath, 'skills'))
    expect(findProjectSkillPaths(projectDir)).toEqual([
      path.join(projectDir, '.onething', 'skills'),
    ])

    const skills = loadAllSkills(projectDir)
    const byName = new Map(skills.map(skill => [skill.name, skill]))

    expect(byName.get('shared')?.source).toBe('project')
    expect(byName.get('project-only')?.source).toBe('project')
    expect(byName.get('user-only')?.source).toBe('user')
    expect(byName.get('plugin-only')?.source).toBe('plugin')
    expect(byName.get('builtin-only')?.source).toBe('builtin')
  })
})
