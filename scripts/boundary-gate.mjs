#!/usr/bin/env node
// Boundary ratchet gate: fail only on NEW failures vs the recorded baseline.
// The baseline carries known legacy reds (stale checks pending rewrite); the
// gate keeps them from silently growing. Shrinkage is reported so the
// baseline can be re-tightened.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baselinePath = path.join(root, 'docs/audit/boundary-baseline-2026-07-25.txt')

function failuresOf(text) {
  return new Set(
    text.split('\n').filter(line => line.startsWith('[boundary] failed:')),
  )
}

let output = ''
try {
  output = execFileSync('bun', [path.join(root, 'scripts/headless-boundary-check.ts')], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (error) {
  output = `${error.stdout ?? ''}${error.stderr ?? ''}`
}

const baseline = failuresOf(readFileSync(baselinePath, 'utf8'))
const current = failuresOf(output)

const fresh = [...current].filter(line => !baseline.has(line))
const healed = [...baseline].filter(line => !current.has(line))

if (healed.length > 0) {
  console.log(`[boundary-gate] ${healed.length} baseline failure(s) healed — consider re-recording the baseline:`)
  for (const line of healed) console.log('  -', line)
}

if (fresh.length > 0) {
  console.error(`[boundary-gate] ${fresh.length} NEW boundary failure(s):`)
  for (const line of fresh) console.error('  +', line)
  process.exit(1)
}

console.log(`[boundary-gate] ok — ${current.size} known failure(s), none new`)
