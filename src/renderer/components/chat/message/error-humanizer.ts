/**
 * Maps raw provider stream errors (e.g. `zhipu agent loop API error: 429
 * {"error":{"code":"1113","message":"余额不足"}}`) to a structured, human
 * error for ErrorCard rendering. Raw text stays available for the
 * "技术详情" fold; nothing here mutates stored messages.
 */

export interface HumanizedError {
  title: string
  hint: string
  /** Prettified provider name, when detectable from the raw message */
  provider?: string
  /** HTTP status code, when detectable */
  status?: number
  /** Provider business error code (e.g. zhipu "1113"), when detectable */
  code?: string
  /** Whether retrying with the same model is likely to help */
  retryable: boolean
}

const PROVIDER_NAMES: Record<string, string> = {
  zhipu: '智谱',
  glm: '智谱',
  claude: 'Claude',
  anthropic: 'Claude',
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  gemini: 'Gemini',
  google: 'Gemini',
  kimi: 'Kimi',
  moonshot: 'Kimi',
  qwen: '通义千问',
  doubao: '豆包',
  openrouter: 'OpenRouter',
  grok: 'Grok',
  xai: 'Grok',
  mistral: 'Mistral',
  ollama: 'Ollama',
}

function detectProvider(raw: string): string | undefined {
  const head = raw.slice(0, 80).toLowerCase()
  for (const key of Object.keys(PROVIDER_NAMES)) {
    if (head.includes(key)) return PROVIDER_NAMES[key]
  }
  return undefined
}

function detectStatus(raw: string): number | undefined {
  const m = raw.match(/\b([45]\d\d)\b/)
  return m ? Number(m[1]) : undefined
}

interface EmbeddedJson {
  code?: string
  message?: string
}

/** Extract `{...}` payload commonly appended to provider errors. */
function extractJson(raw: string): EmbeddedJson {
  const start = raw.indexOf('{')
  if (start === -1) return {}
  try {
    const parsed = JSON.parse(raw.slice(start)) as Record<string, unknown>
    const err = (parsed.error ?? parsed) as Record<string, unknown>
    return {
      code: err.code !== undefined ? String(err.code) : undefined,
      message: typeof err.message === 'string' ? err.message : undefined,
    }
  } catch {
    return {}
  }
}

export function humanizeStreamError(rawContent: string): HumanizedError {
  const raw = rawContent || ''
  const lower = raw.toLowerCase()
  const provider = detectProvider(raw)
  const status = detectStatus(raw)
  const json = extractJson(raw)
  const probe = `${lower} ${(json.message ?? '').toLowerCase()}`

  const base = { provider, status, code: json.code }

  if (/(api key|unauthorized|authentication|invalid[_ ]?key|无效.{0,4}(密钥|key))/i.test(probe)
    || status === 401 || status === 403) {
    return {
      ...base,
      title: 'API Key 无效或未授权',
      hint: `检查${provider ? ` ${provider} ` : ''}服务商设置里的 API Key,更新后重试。`,
      retryable: false,
    }
  }

  if (/(余额|欠费|充值|insufficient|quota.*(exceed|exhaust)|billing|balance)/i.test(probe)
    || json.code === '1113') {
    return {
      ...base,
      title: `${provider ?? '服务商'}账户余额不足,生成已中断`,
      hint: '已完成的内容保留在上方。充值后重试,或换一个模型继续。',
      retryable: true,
    }
  }

  if (status === 429) {
    return {
      ...base,
      title: '请求过于频繁,已被限流',
      hint: '稍等几秒重试,或换一个模型继续。',
      retryable: true,
    }
  }

  if ((status !== undefined && status >= 500) || /overloaded|service unavailable|bad gateway/i.test(probe)) {
    return {
      ...base,
      title: `${provider ?? '服务商'}服务暂时不可用`,
      hint: '对方服务器故障,稍后重试,或换一个模型继续。',
      retryable: true,
    }
  }

  if (/(timeout|timed out|etimedout)/i.test(probe)) {
    return {
      ...base,
      title: '请求超时',
      hint: '网络或服务商响应过慢。重试一次,或换一个模型。',
      retryable: true,
    }
  }

  if (/(fetch failed|econnrefused|enotfound|econnreset|network|socket|dns)/i.test(probe)) {
    return {
      ...base,
      title: '网络连接失败',
      hint: '检查网络或代理设置后重试。',
      retryable: true,
    }
  }

  if (/(context|token).{0,24}(limit|length|exceed)|too (long|many tokens)|maximum context/i.test(probe)) {
    return {
      ...base,
      title: '上下文超出模型长度限制',
      hint: '压缩上下文(/compact)或开启新会话后继续。',
      retryable: false,
    }
  }

  // Fallback: keep it short and human; raw text lives in the details fold.
  const jsonMsg = json.message?.trim()
  const hint = jsonMsg && jsonMsg.length <= 120
    ? jsonMsg
    : '重试一次;若反复失败,展开技术详情查看原始报错。'
  return {
    ...base,
    title: '生成失败',
    hint,
    retryable: true,
  }
}
