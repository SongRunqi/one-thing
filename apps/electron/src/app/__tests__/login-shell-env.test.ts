import { describe, expect, it } from 'vitest'
import { mergeMissingEnv, parseLoginShellEnvOutput } from '../login-shell-env.js'

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
