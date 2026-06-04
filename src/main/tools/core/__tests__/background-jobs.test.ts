import { describe, expect, it, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createLocalBashOperations } from '../bash-executor.js'
import { clearBackgroundJobsForTests, listBackgroundJobs, stopBackgroundJob } from '../background-jobs.js'

describe('background bash jobs', () => {
  afterEach(() => {
    for (const job of listBackgroundJobs()) {
      stopBackgroundJob(job.id)
    }
    clearBackgroundJobsForTests()
  })

  it.skipIf(process.platform === 'win32')('registers and stops a detached background process group', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-bg-'))
    const ops = createLocalBashOperations()

    const result = await ops.exec('sleep 30 &', dir, {
      onData: () => {},
      timeout: 5000,
    })

    expect(result.exitCode).toBe(0)
    expect(result.backgroundJobIds?.length).toBe(1)

    const [job] = listBackgroundJobs()
    expect(job).toBeDefined()
    expect(job.status).toBe('running')
    expect(job.childPids.length).toBeGreaterThan(0)
    expect(stopBackgroundJob(job.id)).toBe(true)
  })
})
