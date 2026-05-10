/**
 * Built-in Note Skills plugin.
 *
 * Exposes SKILL.md files stored under the configured note directories:
 * ai_note_dir, user_note_dir, and work_note_dir. Roots are recursive so
 * users can organize skills inside nested folders.
 */

import * as fs from 'fs'
import { getVariablesStore } from '../../variables/index.js'
import { expandPath } from '../../tools/core/sandbox.js'
import { invalidateSkillsCache } from '../../ipc/skills.js'
import type { PluginAPI } from '../types.js'

export const noteSkillsManifest = {
  name: 'note-skills',
  version: '1.0.0',
  description: 'Loads skills from configured AI, user, and work note directories',
  author: 'onething',
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
      }))
  })
}
