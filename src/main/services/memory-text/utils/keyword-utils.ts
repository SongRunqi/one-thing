/**
 * Keyword Utilities for Memory System
 *
 * Shared utilities for keyword extraction and filtering.
 * Provides consistent keyword handling across retrieval and indexing.
 */

/**
 * Common stop words to filter out during keyword extraction
 * Includes English, Chinese, and generic programming terms
 */
export const STOP_WORDS = new Set([
  // English
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between',
  'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
  'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just',
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
  'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
  'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'am', 'if', 'then', 'because', 'while', 'although', 'though',
  'once', 'unless', 'until', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'any', 'some', 'no', 'none', 'more', 'most',
  'other', 'such', 'few', 'little', 'much', 'many',

  // Chinese common words
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一',
  '个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有',
  '看', '好', '自己', '这', '那', '她', '他', '它', '们', '吗', '什么',
  '怎么', '为什么', '哪', '哪里', '谁', '几', '多少', '怎样', '如何',
  '能', '可以', '应该', '想', '让', '把', '被', '给', '跟', '对', '从',
  '但', '而', '或', '与', '及', '等', '比', '更', '最', '非常', '太',
  '还', '又', '再', '已经', '正在', '将', '曾', '刚', '才', '只', '仅',

  // Common programming terms (too generic)
  'code', 'help', 'please', 'want', 'need', 'use', 'using', 'make', 'create',
  '帮', '帮我', '请', '想', '需要', '用', '使用', '做', '创建', '写',
])

/**
 * Technical keywords that should be prioritized in extraction
 * These indicate specific technical topics worth remembering
 */
export const TECH_KEYWORDS = new Set([
  // Frontend
  'vue', 'react', 'angular', 'svelte', 'nextjs', 'nuxt', 'vite', 'webpack',
  'typescript', 'javascript', 'css', 'sass', 'scss', 'less', 'tailwind',
  'component', 'composable', 'hook', 'state', 'store', 'pinia', 'vuex', 'redux',

  // Backend
  'node', 'nodejs', 'express', 'fastify', 'koa', 'nestjs',
  'python', 'django', 'flask', 'fastapi',
  'java', 'spring', 'springboot',
  'go', 'golang', 'rust', 'c++', 'cpp',

  // Database
  'sql', 'mysql', 'postgresql', 'postgres', 'mongodb', 'redis', 'sqlite',
  'database', 'query', 'orm', 'prisma', 'typeorm',

  // DevOps
  'docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp', 'nginx', 'linux',
  'ci', 'cd', 'github', 'gitlab', 'jenkins',

  // Electron
  'electron', 'ipc', 'main', 'renderer', 'preload',

  // AI/ML
  'ai', 'ml', 'llm', 'gpt', 'claude', 'openai', 'anthropic',
  'embedding', 'vector', 'transformer', 'neural',

  // Concepts
  'api', 'rest', 'graphql', 'websocket', 'http', 'https',
  'authentication', 'authorization', 'jwt', 'oauth',
  'performance', 'optimization', 'cache', 'caching',
  'test', 'testing', 'unit', 'integration', 'e2e',
  'debug', 'debugging', 'error', 'bug', 'fix',
])

/**
 * Options for keyword extraction
 */
export interface ExtractKeywordsOptions {
  /** Maximum number of keywords to return (default: 10) */
  limit?: number
  /** Minimum word length to consider (default: 2) */
  minLength?: number
  /** Whether to prioritize tech keywords (default: true) */
  prioritizeTech?: boolean
}

/**
 * Extract meaningful keywords from a message
 *
 * @param message - Text to extract keywords from
 * @param options - Extraction options
 * @returns Array of keywords, sorted by relevance (tech keywords first)
 */
export function extractKeywords(
  message: string,
  options: ExtractKeywordsOptions = {}
): string[] {
  const {
    limit = 10,
    minLength = 2,
    prioritizeTech = true,
  } = options

  // Normalize the message
  const normalized = message.toLowerCase()

  // Extract words (supports both English and Chinese)
  const words = normalized.match(/[a-z0-9]+|[\u4e00-\u9fa5]+/g) || []

  // Filter and prioritize
  const keywords: string[] = []
  const seen = new Set<string>()

  for (const word of words) {
    // Skip stop words and short words
    if (STOP_WORDS.has(word)) continue
    if (word.length < minLength) continue
    if (seen.has(word)) continue

    seen.add(word)

    // Prioritize technical keywords
    if (prioritizeTech && TECH_KEYWORDS.has(word)) {
      keywords.unshift(word) // Add to front
    } else {
      keywords.push(word)
    }
  }

  // Limit to specified number of keywords
  return keywords.slice(0, limit)
}

/**
 * Check if a word is a stop word
 */
export function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word.toLowerCase())
}

/**
 * Check if a word is a technical keyword
 */
export function isTechKeyword(word: string): boolean {
  return TECH_KEYWORDS.has(word.toLowerCase())
}

/**
 * Normalize a keyword for consistent matching
 * - Lowercase
 * - Trim whitespace
 */
export function normalizeKeyword(keyword: string): string {
  return keyword.toLowerCase().trim()
}
