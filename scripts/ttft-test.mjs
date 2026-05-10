// Time-to-first-token benchmark: raw fetch (curl-equivalent) vs AI SDK path.
// Reads API key + model from the user's onething settings.json.
//
// Usage:
//   node scripts/ttft-test.mjs           # N=3, default prompt
//   N=5 node scripts/ttft-test.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { streamText } from 'ai'
import { createMoonshotAI } from '@ai-sdk/moonshotai'

const SETTINGS_PATH = path.join(
  os.homedir(),
  'Library/Application Support/onething/data/settings.json',
)

function loadKimiConfig() {
  const s = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'))
  const kimi = s.ai?.providers?.kimi
  if (!kimi?.apiKey) throw new Error('No Kimi API key in settings')
  return {
    apiKey: kimi.apiKey,
    model: kimi.model || 'moonshot-v1-8k',
    baseUrl: kimi.baseUrl || 'https://api.moonshot.cn/v1',
  }
}

const PROMPT = '请用一句话回答:你好。'
const N = Number(process.env.N || 3)
// Kimi-k2.5 only accepts temperature=1; keep both paths consistent.
const TEMPERATURE = 1

async function rawFetchTTFT(cfg) {
  const t0 = performance.now()
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: PROMPT }],
      stream: true,
      max_tokens: 512,
      temperature: TEMPERATURE,
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    // Consume complete lines; keep the trailing partial line in buf.
    let nl
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        const j = JSON.parse(data)
        const d = j.choices?.[0]?.delta
        // Count the first user-visible token — reasoning_content OR content.
        // The initial chunk carries role with empty content; skip that.
        const first = d?.reasoning_content || d?.content
        if (first) {
          const ttft = performance.now() - t0
          reader.cancel().catch(() => {})
          return ttft
        }
      } catch {}
    }
  }
  throw new Error('Stream ended without content')
}

async function aiSdkTTFT(cfg) {
  const provider = createMoonshotAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
  })
  const t0 = performance.now()
  const stream = await streamText({
    model: provider.chatModel(cfg.model),
    messages: [{ role: 'user', content: PROMPT }],
    maxOutputTokens: 512,
    temperature: TEMPERATURE,
  })
  for await (const chunk of stream.fullStream) {
    const c = chunk
    // Match the app's perception: first visible delta is reasoning OR text
    if (c.type === 'text-delta' || c.type === 'reasoning-delta') {
      const text = c.textDelta || c.delta || c.text || ''
      if (text) return performance.now() - t0
    }
  }
  throw new Error('AI SDK stream ended without delta')
}

function fmt(n) {
  return n.toFixed(0).padStart(5) + ' ms'
}

async function runSeries(label, fn, cfg) {
  const times = []
  for (let i = 0; i < N; i++) {
    try {
      const t = await fn(cfg)
      times.push(t)
      process.stdout.write(`  [${label}] iter ${i + 1}: ${fmt(t)}\n`)
    } catch (e) {
      process.stdout.write(`  [${label}] iter ${i + 1}: ERROR ${e.message}\n`)
    }
  }
  if (times.length) {
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const min = Math.min(...times)
    const max = Math.max(...times)
    console.log(`  [${label}] avg=${fmt(avg)}  min=${fmt(min)}  max=${fmt(max)}`)
  }
  return times
}

// Throughput: after first delta, how many chars/sec we can read the full response.
async function rawFetchThroughput(cfg) {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: PROMPT }],
      stream: true,
      max_tokens: 512,
      temperature: TEMPERATURE,
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let firstT = null
  let chars = 0
  let deltas = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        const j = JSON.parse(data)
        const d = j.choices?.[0]?.delta
        const piece = (d?.reasoning_content || '') + (d?.content || '')
        if (piece) {
          if (firstT === null) firstT = performance.now()
          chars += piece.length
          deltas += 1
        }
      } catch {}
    }
  }
  const endT = performance.now()
  const streamMs = firstT !== null ? endT - firstT : 0
  return { chars, deltas, streamMs }
}

async function aiSdkThroughput(cfg) {
  const provider = createMoonshotAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl })
  const stream = await streamText({
    model: provider.chatModel(cfg.model),
    messages: [{ role: 'user', content: PROMPT }],
    maxOutputTokens: 512,
    temperature: TEMPERATURE,
  })
  let firstT = null
  let chars = 0
  let deltas = 0
  for await (const chunk of stream.fullStream) {
    const c = chunk
    if (c.type === 'text-delta' || c.type === 'reasoning-delta') {
      const text = c.textDelta || c.delta || c.text || ''
      if (text) {
        if (firstT === null) firstT = performance.now()
        chars += text.length
        deltas += 1
      }
    }
  }
  const endT = performance.now()
  const streamMs = firstT !== null ? endT - firstT : 0
  return { chars, deltas, streamMs }
}

async function runThroughput(label, fn, cfg) {
  const results = []
  for (let i = 0; i < N; i++) {
    try {
      const r = await fn(cfg)
      results.push(r)
      const cps = r.streamMs > 0 ? (r.chars / (r.streamMs / 1000)).toFixed(0) : 'NaN'
      const dps = r.streamMs > 0 ? (r.deltas / (r.streamMs / 1000)).toFixed(0) : 'NaN'
      console.log(`  [${label}] iter ${i + 1}: ${r.chars} chars in ${fmt(r.streamMs)}  → ${cps} chars/s, ${dps} deltas/s  (${r.deltas} deltas)`)
    } catch (e) {
      console.log(`  [${label}] iter ${i + 1}: ERROR ${e.message}`)
    }
  }
  if (results.length) {
    const avgCps = results.reduce((a, r) => a + (r.chars / (r.streamMs / 1000)), 0) / results.length
    const avgDps = results.reduce((a, r) => a + (r.deltas / (r.streamMs / 1000)), 0) / results.length
    console.log(`  [${label}] avg ${avgCps.toFixed(0)} chars/s, ${avgDps.toFixed(0)} deltas/s`)
  }
  return results
}

async function main() {
  const cfg = loadKimiConfig()
  console.log(`Model: ${cfg.model}  base: ${cfg.baseUrl}  N=${N}`)
  console.log(`Prompt: ${PROMPT}\n`)

  // Warm-up (exclude DNS/TLS from cold measurements)
  console.log('Warming up...')
  try { await rawFetchTTFT(cfg) } catch {}
  try { await aiSdkTTFT(cfg) } catch {}

  console.log('\n--- Raw fetch (≈ curl) ---')
  const a = await runSeries('raw', rawFetchTTFT, cfg)

  console.log('\n--- AI SDK (@ai-sdk/moonshotai + streamText) ---')
  const b = await runSeries('sdk', aiSdkTTFT, cfg)

  if (a.length && b.length) {
    const avgA = a.reduce((x, y) => x + y, 0) / a.length
    const avgB = b.reduce((x, y) => x + y, 0) / b.length
    console.log(`\nΔ avg(SDK) − avg(raw) = ${(avgB - avgA).toFixed(0)} ms`)
  }

  console.log('\n=== STREAMING THROUGHPUT (after first token) ===\n')
  console.log('--- Raw fetch ---')
  await runThroughput('raw', rawFetchThroughput, cfg)
  console.log('\n--- AI SDK ---')
  await runThroughput('sdk', aiSdkThroughput, cfg)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
