import { describe, expect, it } from 'vitest'
import { humanizeStreamError } from '../error-humanizer'

describe('humanizeStreamError', () => {
  it('maps zhipu insufficient-balance 429 (code 1113)', () => {
    const raw = 'zhipu agent loop API error: 429 {"error":{"code":"1113","message":"余额不足或无可用资源包,请充值。"}}'
    const result = humanizeStreamError(raw)
    expect(result.title).toContain('余额不足')
    expect(result.provider).toBe('智谱')
    expect(result.status).toBe(429)
    expect(result.code).toBe('1113')
    expect(result.retryable).toBe(true)
  })

  it('maps plain 429 to rate limiting', () => {
    const result = humanizeStreamError('Claude stream error: 429 {"error":{"type":"rate_limit_error","message":"Too many requests"}}')
    expect(result.title).toContain('限流')
    expect(result.provider).toBe('Claude')
    expect(result.retryable).toBe(true)
  })

  it('maps 401 to invalid API key and marks non-retryable', () => {
    const result = humanizeStreamError('DeepSeek stream error: 401 {"error":{"message":"invalid api key"}}')
    expect(result.title).toContain('API Key')
    expect(result.retryable).toBe(false)
  })

  it('maps 5xx and overloaded to provider unavailable', () => {
    expect(humanizeStreamError('Gemini stream error: 503 Service Unavailable').title).toContain('不可用')
    expect(humanizeStreamError('Claude stream error: {"error":{"type":"overloaded_error"}}').title).toContain('不可用')
  })

  it('maps 429 overload to provider unavailable, not rate limiting', () => {
    const raw = 'kimi agent loop API error: 429 {"error":{"message":"The engine is currently overloaded, please try again later","type":"engine_overloaded_error"}}'
    const result = humanizeStreamError(raw)
    expect(result.title).toContain('不可用')
    expect(result.provider).toBe('Kimi')
    expect(result.retryable).toBe(true)
  })

  it('maps network failures', () => {
    const result = humanizeStreamError('TypeError: fetch failed')
    expect(result.title).toContain('网络')
    expect(result.retryable).toBe(true)
  })

  it('maps timeouts', () => {
    expect(humanizeStreamError('Request timed out after 60000ms').title).toContain('超时')
  })

  it('maps context length errors and marks non-retryable', () => {
    const result = humanizeStreamError('OpenAI stream error: 400 {"error":{"message":"This model\'s maximum context length is 128000 tokens"}}')
    expect(result.title).toContain('上下文')
    expect(result.retryable).toBe(false)
  })

  it('falls back to generic title with embedded json message as hint', () => {
    const result = humanizeStreamError('SomeProvider error: {"error":{"message":"unexpected sampler config"}}')
    expect(result.title).toBe('生成失败')
    expect(result.hint).toBe('unexpected sampler config')
  })

  it('survives non-JSON garbage', () => {
    const result = humanizeStreamError('total garbage {{{ not json')
    expect(result.title).toBe('生成失败')
    expect(result.retryable).toBe(true)
  })
})
