import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  computeShellConfigFingerprint,
  hydrateProcessEnvFromLoginShell,
  mergeMissingEnv,
  parseLoginShellEnvOutput,
} from '../login-shell-env.js'

describe('login shell environment helpers', () => {
  it('parses env output after the marker and ignores shell startup noise', () => {
    const output = [
      'startup banner that should be ignored\n',
      '\0__ONETHING_LOGIN_SHELL_ENV_START__\0',
      'OPENAI_API_KEY=from-shell\0',
      'VALUE_WITH_EQUALS=a=b=c\0',
      'not an env var\0',
      '1INVALID=ignored\0',
    ].join('')

    expect(parseLoginShellEnvOutput(output)).toEqual({
      OPENAI_API_KEY: 'from-shell',
      VALUE_WITH_EQUALS: 'a=b=c',
    })
  })

  it('merges only missing env vars into the current process env', () => {
    const target: NodeJS.ProcessEnv = {
      OPENAI_API_KEY: 'from-parent',
      EMPTY_ENV: '',
    }

    const merged = mergeMissingEnv(target, {
      OPENAI_API_KEY: 'from-shell',
      ANTHROPIC_API_KEY: 'anthropic-shell',
      EMPTY_ENV: 'filled-shell',
      BLANK_IGNORED: '',
    })

    expect(merged).toEqual(['ANTHROPIC_API_KEY', 'EMPTY_ENV'])
    expect(target).toMatchObject({
      OPENAI_API_KEY: 'from-parent',
      ANTHROPIC_API_KEY: 'anthropic-shell',
      EMPTY_ENV: 'filled-shell',
    })
    expect(target.BLANK_IGNORED).toBeUndefined()
  })
})

describe('login shell environment cache', () => {
  const tempDirs: string[] = []

  function createTempCachePath(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-login-env-'))
    tempDirs.push(dir)
    return path.join(dir, 'login-shell-env.json')
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('hydrates synchronously from a fingerprint-matched cache without spawning a shell', async () => {
    const cachePath = createTempCachePath()
    // shell 指向不存在的路径:若走了慢路径(spawn),结果必为空;
    // 只有缓存命中才能注入 FROM_CACHE。
    const shell = '/nonexistent/fake-zsh'
    fs.writeFileSync(cachePath, JSON.stringify({
      fingerprint: computeShellConfigFingerprint(shell),
      env: { FROM_CACHE: 'cached-value' },
    }))

    const targetEnv: NodeJS.ProcessEnv = { SHELL: shell }
    const merged = await hydrateProcessEnvFromLoginShell({
      env: targetEnv,
      shell,
      platform: 'darwin',
      cacheFilePath: cachePath,
      disableBackgroundRefresh: true,
    })

    expect(merged).toEqual(['FROM_CACHE'])
    expect(targetEnv.FROM_CACHE).toBe('cached-value')
  })

  it('ignores a cache whose shell config fingerprint no longer matches', async () => {
    const cachePath = createTempCachePath()
    const shell = '/nonexistent/fake-zsh'
    const staleFingerprint = computeShellConfigFingerprint(shell)
    staleFingerprint.configMtimes['/etc/zshrc'] = 12345
    fs.writeFileSync(cachePath, JSON.stringify({
      fingerprint: staleFingerprint,
      env: { FROM_CACHE: 'stale' },
    }))

    const targetEnv: NodeJS.ProcessEnv = {}
    const merged = await hydrateProcessEnvFromLoginShell({
      env: targetEnv,
      shell,
      platform: 'darwin',
      cacheFilePath: cachePath,
      disableBackgroundRefresh: true,
    })

    // 指纹不符 → 慢路径;shell 不存在 → 失败返回空,且不注入过期缓存。
    expect(merged).toEqual([])
    expect(targetEnv.FROM_CACHE).toBeUndefined()
  })

  it('writes the cache after a slow-path read and hits it on the next run', async () => {
    const cachePath = createTempCachePath()
    const targetEnv: NodeJS.ProcessEnv = { PATH: process.env.PATH }
    const merged = await hydrateProcessEnvFromLoginShell({
      env: targetEnv,
      shell: '/bin/sh',
      platform: 'darwin',
      cacheFilePath: cachePath,
      disableBackgroundRefresh: true,
    })
    expect(Array.isArray(merged)).toBe(true)
    expect(fs.existsSync(cachePath)).toBe(true)
    expect(fs.statSync(cachePath).mode & 0o777).toBe(0o600)

    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
    expect(cached.fingerprint.shell).toBe('/bin/sh')
    expect(typeof cached.env).toBe('object')

    // 第二次:破坏 shell 路径也能命中缓存(证明没有再 spawn)。
    const secondEnv: NodeJS.ProcessEnv = {}
    fs.writeFileSync(cachePath, JSON.stringify({
      fingerprint: computeShellConfigFingerprint('/bin/sh'),
      env: { SECOND_RUN: 'hit' },
    }))
    const secondMerged = await hydrateProcessEnvFromLoginShell({
      env: secondEnv,
      shell: '/bin/sh',
      platform: 'darwin',
      cacheFilePath: cachePath,
      disableBackgroundRefresh: true,
    })
    expect(secondMerged).toEqual(['SECOND_RUN'])
  })
})
