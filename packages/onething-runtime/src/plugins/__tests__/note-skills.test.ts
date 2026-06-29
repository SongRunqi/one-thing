import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildNoteSkillInstructionContext,
  buildNoteSkillRootDescriptors,
  ONETHING_NOTE_SKILLS_MANIFEST,
  registerOnethingNoteSkillsPlugin,
  resolveNoteSkillRootDirs,
} from '../note-skills.js'

const tempRoots: string[] = []

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-note-skills-'))
  tempRoots.push(root)
  return root
}

function parseContext(raw: string): Record<string, unknown> {
  const match = raw.match(/^<note_skill_context>\n([\s\S]+)\n<\/note_skill_context>$/)
  if (!match) throw new Error('missing note skill context')
  return JSON.parse(match[1]) as Record<string, unknown>
}

describe('runtime note-skills helpers', () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps the builtin plugin manifest in onething runtime', () => {
    expect(ONETHING_NOTE_SKILLS_MANIFEST).toMatchObject({
      name: 'note-skills',
      version: '1.0.0',
      author: 'onething',
    })
  })

  it('resolves configured note skill roots with host expansion and directory checks', () => {
    expect(resolveNoteSkillRootDirs([
      '~/notes',
      '',
      undefined,
      '~/notes',
      '/missing',
      '/work',
    ], {
      expandPath: value => value.replace(/^~/, '/home/me'),
      isDirectory: value => value !== '/missing',
    })).toEqual([
      '/home/me/notes',
      '/work',
    ])
  })

  it('builds plugin skill root descriptors without main-process plugin wiring', () => {
    const roots = buildNoteSkillRootDescriptors({
      pluginId: 'note-skills',
      dirs: ['~/notes', '~/notes', '/missing', '/work'],
      markdownNoteAttachmentDirectory: 'assets',
      expandPath: value => value.replace(/^~/, '/home/me'),
      isDirectory: value => value !== '/missing',
    })

    expect(roots.map(root => ({
      pluginId: root.pluginId,
      path: root.path,
      source: root.source,
      recursive: root.recursive,
    }))).toEqual([
      {
        pluginId: 'note-skills',
        path: '/home/me/notes',
        source: 'plugin',
        recursive: true,
      },
      {
        pluginId: 'note-skills',
        path: '/work',
        source: 'plugin',
        recursive: true,
      },
    ])

    const context = parseContext(roots[0].instructionContext({
      skillDir: '/home/me/notes/skill',
      rootDir: '/home/me/notes',
    }))
    expect(context).toMatchObject({
      note_root: '/home/me/notes',
      skill_directory: '/home/me/notes/skill',
      attachment_directory: '/home/me/notes/assets',
      attachment_directory_configured: true,
    })
  })

  it('registers note skill roots through a headless plugin adapter', () => {
    let provider: (() => ReturnType<typeof buildNoteSkillRootDescriptors>) | undefined
    let dispose: (() => void) | undefined
    let variableHandler: (() => void) | undefined
    let invalidations = 0

    registerOnethingNoteSkillsPlugin<() => ReturnType<typeof buildNoteSkillRootDescriptors>>({
      id: 'note-skills',
      registerSkillRoot: rootProvider => {
        provider = rootProvider
      },
      onDispose: callback => {
        dispose = callback
      },
    }, {
      getDirs: () => ['~/notes', '/missing', '/work'],
      getMarkdownNoteAttachmentDirectory: () => 'assets',
      expandPath: value => value.replace(/^~/, '/home/me'),
      isDirectory: value => value !== '/missing',
      onVariableChange: handler => {
        variableHandler = handler
        return () => {
          variableHandler = undefined
        }
      },
      invalidateSkillsCache: () => {
        invalidations += 1
      },
    })

    expect(provider?.().map(root => root.path)).toEqual(['/home/me/notes', '/work'])
    variableHandler?.()
    expect(invalidations).toBe(1)
    dispose?.()
    expect(variableHandler).toBeUndefined()
  })

  it('builds configured non-Obsidian note attachment context without settings store', () => {
    const noteRoot = makeTempRoot()
    const skillDir = path.join(noteRoot, 'daily')
    fs.mkdirSync(skillDir, { recursive: true })

    const context = parseContext(buildNoteSkillInstructionContext({
      skillDir,
      rootDir: noteRoot,
      markdownNoteAttachmentDirectory: 'assets',
    }))

    expect(context).toMatchObject({
      note_root: noteRoot,
      skill_directory: skillDir,
      note_system: 'note',
      attachment_directory: path.join(noteRoot, 'assets'),
      attachment_directory_available: true,
      attachment_directory_configured: true,
      attachment_source: 'settings.general.editor.markdownNoteAttachmentDirectory',
    })
  })

  it('uses Obsidian attachmentFolderPath when inside a vault', () => {
    const vaultRoot = makeTempRoot()
    const skillDir = path.join(vaultRoot, 'skills', 'daily')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.mkdirSync(path.join(vaultRoot, '.obsidian'), { recursive: true })
    fs.writeFileSync(
      path.join(vaultRoot, '.obsidian', 'app.json'),
      JSON.stringify({ attachmentFolderPath: 'attachments' }),
      'utf-8',
    )

    const context = parseContext(buildNoteSkillInstructionContext({ skillDir, rootDir: vaultRoot }))

    expect(context).toMatchObject({
      note_root: vaultRoot,
      skill_directory: skillDir,
      note_system: 'obsidian',
      attachment_directory: path.join(vaultRoot, 'attachments'),
      attachment_directory_available: true,
      attachment_directory_configured: true,
      attachment_source: '.obsidian/app.json attachmentFolderPath',
    })
  })
})
