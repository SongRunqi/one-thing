import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { classifyBashCommand } from '../bash-classifier.js'
import {
  clearBackgroundJobsForTests,
  configureCoreBackgroundJobs,
  getBackgroundJobsLogDir,
  listBackgroundJobs,
  stopBackgroundJob,
} from '../background-jobs.js'
import { createLocalBashOperations } from '../bash-executor.js'

let outputRoot = ''
let cwd = ''

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

describe('runtime bash process operations', () => {
  beforeEach(async () => {
    outputRoot = await makeTempDir('onething-runtime-bash-outputs-')
    cwd = await makeTempDir('onething-runtime-bash-cwd-')
    configureCoreBackgroundJobs({ getLogRootDir: () => outputRoot })
    clearBackgroundJobsForTests()
  })

  afterEach(async () => {
    for (const job of listBackgroundJobs({ includeInactive: true })) {
      if (job.status === 'running') stopBackgroundJob(job.id)
    }
    clearBackgroundJobsForTests()
    configureCoreBackgroundJobs()
    await fs.rm(outputRoot, { recursive: true, force: true })
    await fs.rm(cwd, { recursive: true, force: true })
  })

  it('classifies bash commands without main adapters', () => {
    expect(classifyBashCommand('git status && grep hello package.json')).toMatchObject({ decision: 'allow' })
    expect(classifyBashCommand('rm dist/app.js')).toMatchObject({
      decision: 'ask',
      patterns: ['rm *'],
    })
    expect(classifyBashCommand('sudo ls')).toMatchObject({ decision: 'deny' })
  })

  it('executes foreground bash commands with runtime-configured log paths', async () => {
    const chunks: Buffer[] = []
    const ops = createLocalBashOperations()

    const result = await ops.exec('printf "runtime-bash\\n"', cwd, {
      onData: data => chunks.push(data),
      timeout: 5000,
    })

    expect(result.exitCode).toBe(0)
    expect(result.backgroundJobIds).toBeUndefined()
    expect(Buffer.concat(chunks).toString('utf-8')).toContain('runtime-bash')
    expect(getBackgroundJobsLogDir()).toBe(path.join(outputRoot, 'background-jobs'))
  })
})
