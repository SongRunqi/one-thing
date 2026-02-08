import * as os from 'os'

/**
 * Expand ~ to home directory.
 * Pure utility function - no store dependencies.
 */
export function expandPath(dir: string): string {
  if (dir.startsWith('~')) {
    return dir.replace('~', os.homedir())
  }
  return dir
}
