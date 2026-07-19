import { describe, expect, it } from 'vitest'
import {
  RADIO_DJ_FACTORY_VERSION,
  radioDjFactoryPromptVersion,
  renderRadioCurationPrompt,
  renderRadioDjAgentPrompt,
  renderRadioOpenPrompt,
} from '../radio-render.js'
import type { OnethingRadioBrief } from '../radio-store.js'

const brief = (intent: string): OnethingRadioBrief => ({
  active: true,
  intent,
  played: [],
  skipped: [],
  loved: [],
})

const options = (intent: string) => ({
  brief: brief(intent),
  inboxPath: '/tmp/inbox.json',
  localTime: '2026/7/17 12:00:00',
})

describe('radio prompt intent line', () => {
  it('quotes a real intent inside the untrusted tag, escaped', () => {
    const prompt = renderRadioOpenPrompt(options('下雨天,安静的<中文>民谣'))
    expect(prompt).toContain('<untrusted_intent>下雨天,安静的&lt;中文&gt;民谣</untrusted_intent>')
  })

  it('degrades debris intents to a self-direct instruction instead of quoting them', () => {
    // The 'x' fixture that leaked through a broken test mock (2026-07-17)
    // stalled a DJ turn: it asked the unattended session for direction.
    for (const debris of ['x', '', ' ', '?']) {
      const prompt = renderRadioOpenPrompt(options(debris))
      expect(prompt).not.toContain('<untrusted_intent>')
      expect(prompt).toContain('不要提问')
      expect(prompt).toContain('自主定调')
    }
  })

  it('the curation prompt applies the same degradation', () => {
    const prompt = renderRadioCurationPrompt({ ...options('x'), programmeRemaining: ['song A'] })
    expect(prompt).not.toContain('<untrusted_intent>')
    expect(prompt).toContain('自主定调')
    expect(prompt).toContain('- song A')
  })

  it('two characters is already a legitimate direction (随便)', () => {
    const prompt = renderRadioOpenPrompt(options('随便'))
    expect(prompt).toContain('<untrusted_intent>随便</untrusted_intent>')
  })
})

describe('life context in the opening prompt', () => {
  it('renders the listener snapshot into the open prompt only', () => {
    const lifeContext = '- notes: 下午交周报\n- goal: 修完电台'
    const open = renderRadioOpenPrompt({ ...options('雨天民谣'), lifeContext })
    expect(open).toContain('- notes: 下午交周报')
    expect(open).toContain('只作素材')

    // Transitions run on time + listening feedback; no life context there.
    const curate = renderRadioCurationPrompt({ ...options('雨天民谣'), lifeContext, programmeRemaining: [] })
    expect(curate).not.toContain('下午交周报')
  })

  it('an absent or blank snapshot degrades to (无)', () => {
    expect(renderRadioOpenPrompt(options('雨天民谣'))).toContain('(无)')
    expect(renderRadioOpenPrompt({ ...options('雨天民谣'), lifeContext: '  ' })).toContain('(无)')
  })
})

describe('radio dj factory persona', () => {
  it('carries the mandatory disciplines and the concrete inbox path', () => {
    // Mandatory rules live in the PERSONA, not the turn templates: a stale DJ
    // chatted into curating shipped six rights-restricted songs (2026-07-17)
    // because the discipline only rode the automated wake prompts.
    const prompt = renderRadioDjAgentPrompt({ inboxPath: '/tmp/inbox.json' })
    expect(prompt).toContain('playFlag: true')
    expect(prompt).toContain('/tmp/inbox.json')
    expect(prompt).toContain('programme.json')
  })

  it('is fingerprinted so installed agents can follow factory upgrades', () => {
    const prompt = renderRadioDjAgentPrompt({ inboxPath: '/tmp/inbox.json' })
    expect(radioDjFactoryPromptVersion(prompt)).toBe(RADIO_DJ_FACTORY_VERSION)
    // No fingerprint (pre-v2 install or user-authored) reads as null.
    expect(radioDjFactoryPromptVersion('你是这台个人电台的主持人。')).toBeNull()
  })

  it('turn templates no longer carry the mandatory playability rule', () => {
    expect(renderRadioOpenPrompt(options('雨天民谣'))).not.toContain('playFlag')
    expect(
      renderRadioCurationPrompt({ ...options('雨天民谣'), programmeRemaining: [] }),
    ).not.toContain('playFlag')
  })
})
