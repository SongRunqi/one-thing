#!/usr/bin/env node
/**
 * 会话存储格式双向转换(docs/design/session-storage-jsonl.md §7.2)。
 *
 *   node scripts/convert-sessions.mjs --to=jsonl [--store=~/.onething] [--dry-run] [--only=<sessionId>]
 *   node scripts/convert-sessions.mjs --to=json  [--store=~/.onething] [--dry-run] [--only=<sessionId>]
 *   node scripts/convert-sessions.mjs --verify   [--store=~/.onething]   # 只校验,不改动
 *
 * --to=jsonl:sessions/<id>.json → sessions/<id>/{meta.json,messages.jsonl},原文件移入 legacy-backup/
 * --to=json :sessions/<id>/     → sessions/<id>.json,目录移入 jsonl-backup/
 * 每个会话转换后逐条校验(条数 + 每条消息 id),校验失败即中止且不动原数据。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const JSONL_VERSION = 2

function parseArgs() {
  const args = { to: null, store: path.join(os.homedir(), '.onething'), dryRun: false, only: null, verify: false }
  for (const arg of process.argv.slice(2)) {
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--verify') args.verify = true
    else if (arg.startsWith('--to=')) args.to = arg.slice(5)
    else if (arg.startsWith('--store=')) args.store = arg.slice(8).replace(/^~(?=\/)/, os.homedir())
    else if (arg.startsWith('--only=')) args.only = arg.slice(7)
    else {
      console.error(`unknown argument: ${arg}`)
      process.exit(2)
    }
  }
  if (!args.verify && args.to !== 'jsonl' && args.to !== 'json') {
    console.error('usage: convert-sessions.mjs --to=jsonl|json [--store=DIR] [--dry-run] [--only=ID] | --verify')
    process.exit(2)
  }
  return args
}

const encodeHeader = sessionId => JSON.stringify({ t: 'h', v: JSONL_VERSION, sessionId }) + '\n'
const encodeMessage = (seq, m) => JSON.stringify({ t: 'm', seq, m }) + '\n'

function decodeLog(text) {
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  const header = JSON.parse(lines[0])
  if (header.t !== 'h') throw new Error('missing jsonl header')
  const messages = []
  lines.slice(1).forEach((line, index) => {
    const record = JSON.parse(line)
    if (record.t !== 'm' || record.seq !== index + 1) throw new Error(`bad line at seq ${index + 1}`)
    messages.push(record.m)
  })
  return { sessionId: header.sessionId, messages }
}

function sameMessages(a, b) {
  if (a.length !== b.length) return false
  return a.every((m, i) => JSON.stringify(m) === JSON.stringify(b[i]))
}

function listLegacySessions(sessionsDir) {
  return fs.readdirSync(sessionsDir)
    .filter(name => name.endsWith('.json') && name !== 'index.json')
    .map(name => name.slice(0, -5))
}

function listJsonlSessions(sessionsDir) {
  return fs.readdirSync(sessionsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !['legacy-backup', 'jsonl-backup'].includes(entry.name))
    .filter(entry => fs.existsSync(path.join(sessionsDir, entry.name, 'meta.json')))
    .map(entry => entry.name)
}

function toJsonl(sessionsDir, sessionId, dryRun) {
  const legacyPath = path.join(sessionsDir, `${sessionId}.json`)
  const dir = path.join(sessionsDir, sessionId)
  if (fs.existsSync(dir)) return 'skip (already jsonl)'

  const session = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'))
  const { messages = [], ...meta } = session
  if (dryRun) return `would convert ${messages.length} messages`

  const staging = dir + '.migrating'
  fs.rmSync(staging, { recursive: true, force: true })
  fs.mkdirSync(staging, { recursive: true })
  let text = encodeHeader(session.id ?? sessionId)
  messages.forEach((m, i) => { text += encodeMessage(i + 1, m) })
  fs.writeFileSync(path.join(staging, 'messages.jsonl'), text, 'utf-8')
  fs.writeFileSync(path.join(staging, 'meta.json'), JSON.stringify({
    ...meta,
    formatVersion: JSONL_VERSION,
    log: { messageCount: messages.length, lastSeq: messages.length },
  }, null, 2), 'utf-8')

  const decoded = decodeLog(fs.readFileSync(path.join(staging, 'messages.jsonl'), 'utf-8'))
  if (!sameMessages(decoded.messages, messages)) {
    fs.rmSync(staging, { recursive: true, force: true })
    throw new Error(`verification failed for ${sessionId}`)
  }

  fs.renameSync(staging, dir)
  const backupDir = path.join(sessionsDir, 'legacy-backup')
  fs.mkdirSync(backupDir, { recursive: true })
  fs.renameSync(legacyPath, path.join(backupDir, `${sessionId}.json`))
  return `converted ${messages.length} messages`
}

function toJson(sessionsDir, sessionId, dryRun) {
  const dir = path.join(sessionsDir, sessionId)
  const legacyPath = path.join(sessionsDir, `${sessionId}.json`)
  if (fs.existsSync(legacyPath)) return 'skip (legacy json already exists)'

  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf-8'))
  let messages = []
  try {
    messages = decodeLog(fs.readFileSync(path.join(dir, 'messages.jsonl'), 'utf-8')).messages
  } catch {
    messages = []
  }
  if (dryRun) return `would convert ${messages.length} messages`

  const { formatVersion, log, ...rest } = meta
  void formatVersion
  void log
  const session = { ...rest, messages }
  const tmp = legacyPath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(session), 'utf-8')

  const reparsed = JSON.parse(fs.readFileSync(tmp, 'utf-8'))
  if (!sameMessages(reparsed.messages ?? [], messages)) {
    fs.rmSync(tmp, { force: true })
    throw new Error(`verification failed for ${sessionId}`)
  }
  fs.renameSync(tmp, legacyPath)

  const backupDir = path.join(sessionsDir, 'jsonl-backup')
  fs.mkdirSync(backupDir, { recursive: true })
  fs.rmSync(path.join(backupDir, sessionId), { recursive: true, force: true })
  fs.renameSync(dir, path.join(backupDir, sessionId))
  return `converted ${messages.length} messages`
}

function verifyAll(sessionsDir) {
  let failures = 0
  for (const sessionId of listJsonlSessions(sessionsDir)) {
    try {
      const decoded = decodeLog(fs.readFileSync(path.join(sessionsDir, sessionId, 'messages.jsonl'), 'utf-8'))
      const meta = JSON.parse(fs.readFileSync(path.join(sessionsDir, sessionId, 'meta.json'), 'utf-8'))
      const backupPath = path.join(sessionsDir, 'legacy-backup', `${sessionId}.json`)
      let note = `${decoded.messages.length} messages`
      if (fs.existsSync(backupPath)) {
        const original = JSON.parse(fs.readFileSync(backupPath, 'utf-8'))
        if (!sameMessages(original.messages ?? [], decoded.messages)) {
          throw new Error('messages differ from legacy-backup original')
        }
        note += ', matches backup'
      }
      void meta
      console.log(`ok    ${sessionId}: ${note}`)
    } catch (error) {
      failures += 1
      console.error(`FAIL  ${sessionId}: ${error.message}`)
    }
  }
  return failures
}

const args = parseArgs()
const sessionsDir = path.join(args.store, 'sessions')
if (!fs.existsSync(sessionsDir)) {
  console.error(`sessions dir not found: ${sessionsDir}`)
  process.exit(1)
}

if (args.verify) {
  const failures = verifyAll(sessionsDir)
  console.log(failures === 0 ? 'all sessions verified' : `${failures} session(s) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

const ids = args.only
  ? [args.only]
  : args.to === 'jsonl' ? listLegacySessions(sessionsDir) : listJsonlSessions(sessionsDir)

let converted = 0
let failed = 0
for (const sessionId of ids) {
  try {
    const result = args.to === 'jsonl'
      ? toJsonl(sessionsDir, sessionId, args.dryRun)
      : toJson(sessionsDir, sessionId, args.dryRun)
    if (result.startsWith('converted') || result.startsWith('would')) converted += 1
    console.log(`${sessionId}: ${result}`)
  } catch (error) {
    failed += 1
    console.error(`${sessionId}: FAILED - ${error.message}`)
  }
}
console.log(`\n${args.dryRun ? '[dry-run] ' : ''}${converted} converted, ${failed} failed, ${ids.length} total`)
process.exit(failed === 0 ? 0 : 1)
