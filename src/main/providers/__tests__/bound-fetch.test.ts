import { describe, expect, it } from 'vitest'
import { getAppDispatcher, shouldBypassProxy, validateProxyUrl } from '../bound-fetch.js'

describe('proxy URL validation', () => {
  it('accepts supported proxy protocols', () => {
    expect(validateProxyUrl('http://127.0.0.1:7890').valid).toBe(true)
    expect(validateProxyUrl('https://proxy.example.com:8443').valid).toBe(true)
    expect(validateProxyUrl('socks5://127.0.0.1:7890').valid).toBe(true)
  })

  it('rejects empty, invalid, and unsupported proxy URLs', () => {
    expect(validateProxyUrl('').valid).toBe(false)
    expect(validateProxyUrl('not a url').valid).toBe(false)
    expect(validateProxyUrl('ftp://127.0.0.1:21').valid).toBe(false)
  })
})

describe('proxy bypass rules', () => {
  it('matches local and wildcard hosts', () => {
    const rules = 'localhost;127.0.0.1;::1;*.local'

    expect(shouldBypassProxy('http://localhost:3000', rules)).toBe(true)
    expect(shouldBypassProxy('http://127.0.0.1:3000', rules)).toBe(true)
    expect(shouldBypassProxy('http://app.local', rules)).toBe(true)
    expect(shouldBypassProxy('https://api.openai.com/v1', rules)).toBe(false)
  })
})

describe('dispatcher cache keys', () => {
  it('separates proxy URL combinations', () => {
    const proxy = { enabled: true, url: 'http://127.0.0.1:7890', bypassRules: 'localhost' }

    const first = getAppDispatcher(proxy)
    const same = getAppDispatcher(proxy)
    const differentProxy = getAppDispatcher({ ...proxy, url: 'http://127.0.0.1:7891' })

    expect(same).toBe(first)
    expect(differentProxy).not.toBe(first)
  })
})
