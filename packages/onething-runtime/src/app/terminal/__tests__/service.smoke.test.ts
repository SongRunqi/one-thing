/**
 * Real-machine smoke: spawns a REAL zsh through node-pty (no mocks) and
 * drives the full service pipeline — coalescing, ring, attach snapshot.
 * Exercises the native addon + spawn-helper exec bit on this machine.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { createNodePtyBackend } from '../pty-backend.js'
import { TerminalService } from '../service.js'

const service = new TerminalService(createNodePtyBackend(), () => null)

afterAll(() => {
  service.killAll()
})

async function waitFor(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout waiting for terminal output')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

function snapshotText(terminalId: string): string {
  const response = service.attach(terminalId)
  return (response.chunks ?? []).map(chunk => chunk.data).join('')
}

describe('TerminalService real-pty smoke', () => {
  it('spawns a real shell, echoes back, and survives attach replay', async () => {
    const info = service.create({ cwd: process.cwd() })
    expect(info.shell.length).toBeGreaterThan(0)

    // Wait for the prompt to be ready-ish, then run a marker command whose
    // output cannot appear from pure echo-back of the input line.
    await new Promise(resolve => setTimeout(resolve, 1200))
    service.write(info.id, 'echo smoke-$((40+2))\r')
    await waitFor(() => snapshotText(info.id).includes('smoke-42'))

    service.write(info.id, 'echo 中文往返测试\r')
    await waitFor(() => snapshotText(info.id).includes('中文往返测试'))

    const attach = service.attach(info.id)
    expect(attach.success).toBe(true)
    expect(attach.info?.cols).toBe(80)
    expect((attach.lastSeq ?? 0)).toBeGreaterThan(0)

    service.kill(info.id)
    expect(service.list()).toHaveLength(0)
  }, 20000)
})
