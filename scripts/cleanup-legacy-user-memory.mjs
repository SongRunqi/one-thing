#!/usr/bin/env node
/**
 * Legacy multi-user memory cleanup.
 *
 * The first multi-user memory implementation (commit c4bff4a4) isolated
 * channel users with (a) full per-profile workspaces under ~/.onething/agents/
 * and (b) `scope_<sha16>__`-prefixed canonical memory keys in the main
 * soul-memory database. Both mechanisms were replaced by per-user note
 * directories at <memoryRoot>/users/<userId>/. This script removes the
 * leftovers:
 *
 *   1. canonical_memories rows whose memory_key starts with "scope_" in
 *      ~/.onething/plugin-data/soul-memory.sqlite (they would otherwise show
 *      up unfiltered in the owner's memory panel).
 *   2. ~/.onething/agents/<id>/ workspaces created for channel profiles
 *      (dir name matches a profile id from channel-identity.json, or starts
 *      with "channel-"). Real agent workspaces are untouched.
 *
 * Usage:
 *   node scripts/cleanup-legacy-user-memory.mjs           # dry run (default)
 *   node scripts/cleanup-legacy-user-memory.mjs --apply   # actually delete
 *
 * The runtime app NEVER calls this. Run it manually after upgrading, with the
 * app closed.
 */

import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const APPLY = process.argv.includes('--apply')

const STORE_ROOT = join(homedir(), '.onething')
const DB_PATH = join(STORE_ROOT, 'plugin-data', 'soul-memory.sqlite')
const AGENTS_DIR = join(STORE_ROOT, 'agents')
const CHANNEL_IDENTITY_PATH = join(STORE_ROOT, 'channel-identity.json')
const LOCAL_CLIENT_USER_ID = 'local-owner'

function log(...args) {
  console.log(...args)
}

// ── 1. scope_-prefixed canonical memories ────────────

async function cleanupScopedCanonicalMemories() {
  if (!existsSync(DB_PATH)) {
    log(`- canonical db not found (${DB_PATH}), skipping`)
    return
  }
  let Database
  try {
    ;({ default: Database } = await import('better-sqlite3'))
  } catch {
    log('- better-sqlite3 not available; run `bun install` first, skipping db cleanup')
    return
  }
  const db = new Database(DB_PATH)
  try {
    const rows = db
      .prepare("SELECT id, memory_key FROM canonical_memories WHERE memory_key LIKE 'scope\\_%' ESCAPE '\\'")
      .all()
    if (rows.length === 0) {
      log('- no scope_-prefixed canonical memories found')
      return
    }
    log(`- ${rows.length} scope_-prefixed canonical memories:`)
    for (const row of rows) log(`    ${row.memory_key}`)
    if (!APPLY) return
    db.prepare("DELETE FROM canonical_memories WHERE memory_key LIKE 'scope\\_%' ESCAPE '\\'").run()
    try {
      db.prepare("DELETE FROM canonical_memories_fts WHERE memory_key LIKE 'scope\\_%' ESCAPE '\\'").run()
    } catch {
      // FTS table may not exist on older databases.
    }
    log(`  deleted ${rows.length} rows`)
  } finally {
    db.close()
  }
}

// ── 2. per-profile agentsDir workspaces ──────────────

function channelProfileIds() {
  if (!existsSync(CHANNEL_IDENTITY_PATH)) return new Set()
  try {
    const data = JSON.parse(readFileSync(CHANNEL_IDENTITY_PATH, 'utf8'))
    const profiles = Array.isArray(data.profiles) ? data.profiles : []
    return new Set(
      profiles
        .filter(profile => profile?.id && profile.id !== LOCAL_CLIENT_USER_ID)
        .map(profile => String(profile.id)),
    )
  } catch {
    return new Set()
  }
}

function cleanupLegacyProfileWorkspaces() {
  if (!existsSync(AGENTS_DIR)) {
    log(`- agents dir not found (${AGENTS_DIR}), skipping`)
    return
  }
  const profileIds = channelProfileIds()
  const legacyDirs = readdirSync(AGENTS_DIR).filter(name => {
    const full = join(AGENTS_DIR, name)
    if (!statSync(full).isDirectory()) return false
    return name.startsWith('channel-') || profileIds.has(name)
  })
  if (legacyDirs.length === 0) {
    log('- no legacy per-profile workspaces under agents/')
    return
  }
  log(`- ${legacyDirs.length} legacy per-profile workspaces under agents/:`)
  for (const name of legacyDirs) log(`    ${join(AGENTS_DIR, name)}`)
  if (!APPLY) return
  for (const name of legacyDirs) {
    rmSync(join(AGENTS_DIR, name), { recursive: true, force: true })
  }
  log(`  removed ${legacyDirs.length} directories`)
}

log(APPLY ? 'Cleanup (apply mode):' : 'Cleanup (dry run — pass --apply to delete):')
await cleanupScopedCanonicalMemories()
cleanupLegacyProfileWorkspaces()
