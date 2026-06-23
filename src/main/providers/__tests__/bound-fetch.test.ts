import { beforeEach, describe, expect, it } from 'vitest'
import { clearAppDispatcherCache, getAppDispatcher, shouldBypassProxy, validateProxyUrl } from '../bound-fetch.js'

function getDispatcherOptions(dispatcher: unknown): Record<string, unknown> | undefined {
  const optionsSymbol = Object.getOwnPropertySymbols(dispatcher as object)
    .find(symbol => symbol.description === 'options')
  return optionsSymbol ? (dispatcher as any)[optionsSymbol] : undefined
}

function getProxyInnerAgent(dispatcher: unknown): unknown {
  const proxyAgentSymbol = Object.getOwnPropertySymbols(dispatcher as object)
    .find(symbol => symbol.description === 'proxy agent')
  return proxyAgentSymbol ? (dispatcher as any)[proxyAgentSymbol] : dispatcher
}

beforeEach(() => {
  clearAppDispatcherCache()
})

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

  it('separates selected local addresses', () => {
    const first = getAppDispatcher(undefined, {
      enabled: true,
      address: '192.168.1.23',
    })
    const same = getAppDispatcher(undefined, {
      enabled: true,
      address: '192.168.1.23',
    })
    const differentAddress = getAppDispatcher(undefined, {
      enabled: true,
      address: '192.168.1.24',
    })

    expect(same).toBe(first)
    expect(differentAddress).not.toBe(first)
  })
})

describe('dispatcher timeouts', () => {
  it('disables body inactivity timeout for long-running direct streams', () => {
    const dispatcher = getAppDispatcher()

    expect(getDispatcherOptions(dispatcher)?.bodyTimeout).toBe(0)
  })

  it('passes selected local address to direct dispatchers', () => {
    const dispatcher = getAppDispatcher(undefined, {
      enabled: true,
      address: '192.168.1.23',
    })

    expect(getDispatcherOptions(dispatcher)?.localAddress).toBe('192.168.1.23')
  })

  it('disables body inactivity timeout for long-running proxied streams', () => {
    const dispatcher = getAppDispatcher({
      enabled: true,
      url: 'http://127.0.0.1:7890',
    })

    expect(getDispatcherOptions(getProxyInnerAgent(dispatcher))?.bodyTimeout).toBe(0)
  })

  it('passes selected local address to proxied dispatchers', () => {
    const dispatcher = getAppDispatcher({
      enabled: true,
      url: 'http://proxy.example.com:7890',
    }, {
      enabled: true,
      address: '192.168.1.23',
    })

    expect((getDispatcherOptions(getProxyInnerAgent(dispatcher))?.proxyTls as any)?.localAddress).toBe('192.168.1.23')
  })

  it('does not bind selected local address when proxy is loopback', () => {
    const dispatcher = getAppDispatcher({
      enabled: true,
      url: 'http://127.0.0.1:7890',
    }, {
      enabled: true,
      address: '192.168.1.23',
    })

    expect((getDispatcherOptions(getProxyInnerAgent(dispatcher))?.proxyTls as any)?.localAddress).toBeUndefined()
  })
})
