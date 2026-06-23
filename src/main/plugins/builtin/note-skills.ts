/**
 * Built-in Note Skills plugin.
 *
 * Exposes SKILL.md files stored under the configured note directories:
 * ai_note_dir, user_note_dir, and work_note_dir. Roots are recursive so
 * users can organize skills inside nested folders.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { getVariablesStore } from '../../variables/index.js'
import { expandPath } from '../../tools/core/sandbox.js'
import { invalidateSkillsCache } from '../../ipc/skills.js'
import { getSettings } from '../../stores/settings.js'
import type { PluginAPI } from '../types.js'

export const noteSkillsManifest = {
  name: 'note-skills',
  version: '1.0.0',
  description: 'Loads skills from configured AI, user, and work note directories',
  author: 'onething',
}

interface ObsidianAppConfig {
  attachmentFolderPath?: string
}

function expandHome(input: string): string {
  if (input === '~') return os.homedir()
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2))
  if (input.startsWith('$HOME/')) return path.join(os.homedir(), input.slice(6))
  return input
}

function normalizeDir(input: string): string {
  return path.resolve(expandHome(input))
}

function findObsidianVaultRoot(startDir: string): string | null {
  let current = normalizeDir(startDir)
  while (true) {
    if (fs.existsSync(path.join(current, '.obsidian'))) return current
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function readObsidianAppConfig(vaultRoot: string): ObsidianAppConfig {
  try {
    const raw = fs.readFileSync(path.join(vaultRoot, '.obsidian', 'app.json'), 'utf-8')
    const parsed = JSON.parse(raw) as ObsidianAppConfig
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function resolveConfiguredAttachmentDirectory(rootDir: string, configured: string): string {
  const expanded = expandHome(configured)
  return path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(rootDir, expanded)
}

export function buildNoteSkillInstructionContext(input: { skillDir: string; rootDir: string }): string {
  const noteRoot = normalizeDir(input.rootDir)
  const skillDirectory = normalizeDir(input.skillDir)
  const vaultRoot = findObsidianVaultRoot(skillDirectory)
  let noteSystem: 'obsidian' | 'note' = 'note'
  let attachmentDirectory: string | null = null
  let attachmentSource: string | null = null
  let attachmentDirectoryConfigured = false

  if (vaultRoot) {
    noteSystem = 'obsidian'
    const config = readObsidianAppConfig(vaultRoot)
    const folder = config.attachmentFolderPath?.trim()
    if (folder) {
      attachmentDirectory = resolveConfiguredAttachmentDirectory(vaultRoot, folder)
      attachmentSource = '.obsidian/app.json attachmentFolderPath'
      attachmentDirectoryConfigured = true
    } else {
      attachmentDirectory = skillDirectory
      attachmentSource = 'Obsidian default document directory'
    }
  } else {
    const configured = getSettings().general.editor?.markdownNoteAttachmentDirectory?.trim()
    if (configured) {
      attachmentDirectory = resolveConfiguredAttachmentDirectory(noteRoot, configured)
      attachmentSource = 'settings.general.editor.markdownNoteAttachmentDirectory'
      attachmentDirectoryConfigured = true
    }
  }

  return `<note_skill_context>
${JSON.stringify({
  note_root: noteRoot,
  skill_directory: skillDirectory,
  note_system: noteSystem,
  attachment_directory: attachmentDirectory,
  attachment_directory_available: Boolean(attachmentDirectory),
  attachment_directory_configured: attachmentDirectoryConfigured,
  attachment_source: attachmentSource,
}, null, 2)}
</note_skill_context>`
}

export default function noteSkillsPlugin(api: PluginAPI): void {
  const unsubscribe = getVariablesStore().subscribe(() => {
    invalidateSkillsCache()
  })
  api.onDispose(unsubscribe)

  api.registerSkillRoot(() => {
    const store = getVariablesStore()
    const dirs = [
      store.getAiNoteDir(),
      store.getUserNoteDir(),
      store.getWorkNoteDir(),
    ]

    return dirs
      .map(dir => dir ? expandPath(dir) : '')
      .filter((dir, index, all) => dir && all.indexOf(dir) === index)
      .filter(dir => {
        try {
          return fs.existsSync(dir) && fs.statSync(dir).isDirectory()
        } catch {
          return false
        }
      })
      .map(dir => ({
        pluginId: api.id,
        path: dir,
        source: 'plugin' as const,
        recursive: true,
        instructionContext: ({ skillDir, rootDir }) => buildNoteSkillInstructionContext({ skillDir, rootDir }),
      }))
  })
}
