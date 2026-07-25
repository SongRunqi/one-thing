/**
 * Synchronous JSON I/O for `variables.json`.
 *
 * Mutations are infrequent (user/AI-driven, seconds apart at most),
 * so we write directly without throttling. Settings.json uses the
 * same pattern. Direct writes mean no `flush()` ceremony at shutdown
 * and no risk of losing the last edit.
 */

import { getVariablesPath, readJsonFile, writeJsonFile } from '../../stores/paths.js'
import {
  createDefaultVariablesFile,
  parseVariablesFile,
  type VariablesFile,
} from '@onething/runtime/variables/schema'

export function loadFromDisk(): VariablesFile {
  const fallback = createDefaultVariablesFile()
  const raw = readJsonFile<unknown>(getVariablesPath(), fallback)
  return parseVariablesFile(raw).data
}

export function saveToDisk(state: VariablesFile): void {
  writeJsonFile(getVariablesPath(), state)
}
