import type { ChatMessage } from '../../../shared/ipc.js'
import type { Trigger } from './index.js'
import {
  isSkillReviewRunning,
  markSkillReviewRunning,
  recordSkillReviewCounter,
} from './skill-review-state.js'
import { generateChatResponse } from '../../providers/index.js'
import { executeSkillManage, type SkillManageArgs } from '../../skills/manage.js'
import { getSkillsForSession, invalidateSkillsCache } from '../../ipc/skills.js'

const MAX_REVIEW_MESSAGES = 16
const MAX_TRANSCRIPT_CHARS = 12000
const MAX_SKILL_ACTIONS = 2

interface ReviewAction {
  action?: string
  name?: string
  description?: string
  instructions?: string
  content?: string
  reason?: string
}

interface ReviewDecision {
  actions?: ReviewAction[]
  rationale?: string
}

function isSkillReviewDisabledByEnv(): boolean {
  return process.env.ONETHING_DISABLE_SKILL_REVIEW === '1' ||
    process.env.ONETHING_DISABLE_SKILL_REVIEW === 'true'
}

function messageText(message: ChatMessage): string {
  const content: unknown = message.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (part?.type === 'text') return part.text
        if (part?.text) return part.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return String(content ?? '')
}

function transcriptFromMessages(messages: ChatMessage[]): string {
  const recent = messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .slice(-MAX_REVIEW_MESSAGES)

  let transcript = recent
    .map(message => {
      const text = messageText(message).trim()
      return `${message.role.toUpperCase()}: ${text || '[empty]'}`
    })
    .join('\n\n')

  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    transcript = transcript.slice(transcript.length - MAX_TRANSCRIPT_CHARS)
  }
  return transcript
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim()
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fence ? fence[1].trim() : trimmed
}

function parseReviewDecision(raw: string): ReviewDecision {
  const text = stripJsonFence(raw)
  try {
    return JSON.parse(text) as ReviewDecision
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as ReviewDecision
    }
    throw new Error('Skill review did not return JSON')
  }
}

function userSkillSummary(workingDirectory?: string): string {
  const skills = getSkillsForSession(workingDirectory)
  if (skills.length === 0) return 'No installed skills are visible.'
  return skills
    .map(skill => `- ${skill.name} [${skill.source}] ${skill.description}`)
    .join('\n')
}

function buildReviewMessages(ctx: Parameters<Trigger['execute']>[0]): Array<{ role: 'system' | 'user'; content: string }> {
  const workingDirectory = ctx.session.workingDirectory
  const system = [
    'You are a background Hermes skill-review fork.',
    'The user-facing assistant response has already been delivered; do not answer the user.',
    'Decide whether the recent conversation revealed a durable, reusable procedure that should become a Hermes SKILL.md skill.',
    'Be conservative. Do not create a skill for one-off facts, transient debugging details, secrets, credentials, or project-specific trivia.',
    'Only propose user-owned skills. Return strict JSON with this shape: {"actions":[{"action":"create"|"edit","name":"lowercase-name","description":"...","instructions":"...","reason":"..."}]}.',
    'Return {"actions":[]} when no skill should be created or updated.',
  ].join('\n')

  const user = [
    `Session id: ${ctx.sessionId}`,
    workingDirectory ? `Working directory: ${workingDirectory}` : 'Working directory: [none]',
    '',
    'Visible skills:',
    userSkillSummary(workingDirectory),
    '',
    'Recent transcript:',
    transcriptFromMessages(ctx.messages),
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

function normalizeReviewAction(action: ReviewAction): SkillManageArgs | null {
  const requested = action.action === 'update' ? 'edit' : action.action === 'edit' ? 'edit' : action.action === 'create' ? 'create' : null
  const name = action.name?.trim()
  const description = action.description?.trim()
  const instructions = action.instructions?.trim() || action.content?.trim()
  if (!requested || !name || !description || !instructions) return null
  return {
    action: requested,
    name,
    description,
    instructions,
    reason: action.reason,
  }
}

async function runSkillReview(ctx: Parameters<Trigger['execute']>[0]): Promise<void> {
  const response = await generateChatResponse(
    ctx.providerId,
    {
      apiKey: ctx.providerConfig.apiKey ?? '',
      baseUrl: ctx.providerConfig.baseUrl,
      model: ctx.providerConfig.model,
      oauthToken: (ctx.providerConfig as any).oauthToken,
      authContext: (ctx.providerConfig as any).authContext,
    } as any,
    buildReviewMessages(ctx),
    {
      temperature: 0.1,
      maxTokens: 1600,
      debugPurpose: 'skill-review',
      debugSessionId: ctx.sessionId,
    },
  )

  const decision = parseReviewDecision(response)
  const actions = (decision.actions ?? [])
    .map(normalizeReviewAction)
    .filter((action): action is SkillManageArgs => Boolean(action))
    .slice(0, MAX_SKILL_ACTIONS)

  if (actions.length === 0) {
    console.log(`[SkillReview] No skill changes for session ${ctx.sessionId}`)
    return
  }

  let mutated = false
  for (const action of actions) {
    const existing = getSkillsForSession(ctx.session.workingDirectory)
      .find(skill => skill.source === 'user' && skill.name === action.name)
    const applied = executeSkillManage({
      ...action,
      action: existing ? 'edit' : 'create',
    }, { workingDirectory: ctx.session.workingDirectory })
    mutated = mutated || applied.mutated
    console.log(`[SkillReview] ${applied.title}: ${applied.path ?? ''}`)
  }

  if (mutated) {
    invalidateSkillsCache()
  }
}

export function createSkillReviewTrigger(): Trigger {
  return {
    id: 'hermes-skill-review',
    name: 'Hermes Skill Review',
    priority: 100,

    async shouldTrigger(ctx) {
      if (isSkillReviewDisabledByEnv()) return false
      if (isSkillReviewRunning(ctx.sessionId)) return false

      return recordSkillReviewCounter({
        sessionId: ctx.sessionId,
        settings: ctx.settings,
        toolIterations: ctx.toolIterations ?? 0,
        skillManageAvailable: ctx.enabledToolNames?.includes('skill_manage') ?? false,
        skillManageCalled: ctx.skillManageCalled ?? false,
      })
    },

    async execute(ctx) {
      markSkillReviewRunning(ctx.sessionId, true)
      try {
        await runSkillReview(ctx)
      } finally {
        markSkillReviewRunning(ctx.sessionId, false)
      }
    },
  }
}
