#!/usr/bin/env node
/**
 * Spike: drive the user's REAL installed Google Chrome from onething.
 *
 * This is the foundation of the "log into Google inside the app" feature — done
 * the only way that actually passes Google: a genuine Google Chrome, with the
 * user typing the password by hand, and NO automation/CDP attached during login.
 *
 *   Phase 1 (login):   node scripts/spike-real-chrome.mjs
 *     Launches Chrome with an isolated profile, NO debug port → you log into
 *     Google by hand. Real Chrome + real human → Google accepts. Cookies land
 *     in the isolated profile dir.
 *
 *   Phase 2 (operate): node scripts/spike-real-chrome.mjs --cdp
 *     Relaunches the SAME (now logged-in) profile WITH --remote-debugging-port
 *     so the app/AI can attach CDP and drive the already-logged-in session.
 *     (Do NOT do the interactive Google login while this port is open.)
 *
 * Cross-platform Chrome path resolution kept minimal for the spike (macOS here).
 */
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PROFILE_DIR = join(homedir(), '.onething', 'browser-chrome')
const DEBUG_PORT = 9222
const withCdp = process.argv.includes('--cdp')

if (!existsSync(CHROME)) {
  console.error('[spike] Google Chrome not found at', CHROME)
  process.exit(1)
}

const args = [
  `--user-data-dir=${PROFILE_DIR}`, // isolated profile — never touches your daily Chrome
  '--no-first-run',
  '--no-default-browser-check',
  '--new-window',
]

if (withCdp) {
  args.push(`--remote-debugging-port=${DEBUG_PORT}`)
  args.push('about:blank')
  console.log(`[spike] PHASE 2 (operate): Chrome up with CDP on port ${DEBUG_PORT}.`)
  console.log('[spike] The app/AI can now: connectOverCDP("http://127.0.0.1:9222").')
  console.log('[spike] Do NOT run the interactive Google login while this port is open.')
} else {
  args.push('https://accounts.google.com')
  console.log('[spike] PHASE 1 (login): real Chrome, isolated profile, NO debug port.')
  console.log('[spike] → Log into your Google account by hand in the window that opened.')
  console.log('[spike] This is a genuine Google Chrome, so Google will let you in.')
  console.log(`[spike] Cookies persist in: ${PROFILE_DIR}`)
}

const child = spawn(CHROME, args, { detached: true, stdio: 'ignore' })
child.unref()
console.log('[spike] launched Chrome pid', child.pid)
