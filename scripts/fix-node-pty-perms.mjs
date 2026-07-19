/**
 * Restores the executable bit on node-pty's `spawn-helper` prebuilds.
 *
 * Package managers do not always preserve the mode of files inside prebuilds,
 * and bun in particular has landed it here as 0644. node-pty then fails at
 * spawn time with `posix_spawnp failed` — an error that says nothing about
 * permissions, on a code path (the music player keepalive) far from install.
 * Cheap to re-apply, so just do it on every install.
 */

import { chmodSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const prebuilds = join(process.cwd(), 'node_modules', 'node-pty', 'prebuilds')

if (existsSync(prebuilds)) {
  for (const dir of readdirSync(prebuilds)) {
    const helper = join(prebuilds, dir, 'spawn-helper')
    if (!existsSync(helper)) continue
    const mode = statSync(helper).mode & 0o777
    if (mode === 0o755) continue
    chmodSync(helper, 0o755)
    console.log(`[node-pty] restored +x on prebuilds/${dir}/spawn-helper`)
  }
}
