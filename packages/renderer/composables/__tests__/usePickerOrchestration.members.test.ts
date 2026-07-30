/**
 * W14a §4.5 — the composer half of 身份 id 化.
 *
 * The member popover no longer types a name into the draft: it inserts a
 * `{{member:<agentId>}}` token (painted as @名字 by the editor) that
 * materializes at SEND into plain `@名字` text plus the id in mentions[].
 * These tests pin the two ends of that trip — what lands in the draft, and
 * what leaves it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { effectScope, nextTick, ref, type Ref } from 'vue'
import { usePickerOrchestration } from '../usePickerOrchestration'
import { createMemberToken } from '@shared/prompt-references'
import type { EditorCursorLineInfo, EditorHandle, EditorSelection } from '@/editor'

interface TestAgent { id: string; name: string; title?: string }

const storeMocks = vi.hoisted(() => ({
  sessions: [
    { id: 'room-1', kind: 'room', room: { memberAgentIds: ['pm', 'fe'] } },
  ] as Array<{ id: string; kind: string; room?: { memberAgentIds: string[] } }>,
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({ settings: { general: { quickCommands: [] } } }),
}))
vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => ({ sessions: storeMocks.sessions }),
}))
// The roster is a REACTIVE ref on purpose: renaming a member has to invalidate
// the composable's roster computed exactly the way the real store does.
vi.mock('@/stores/agents', async () => {
  const { ref } = await import('vue')
  const agents = ref<TestAgent[]>([])
  return {
    useAgentsStore: () => ({ agents: agents.value, loadAgents: vi.fn() }),
    __setAgents: (next: TestAgent[]) => { agents.value = next },
  }
})

const { __setAgents: setAgents } = await import('@/stores/agents') as unknown as
  { __setAgents: (next: TestAgent[]) => void }

function makeEditorHandle(value: Ref<string>, cursor: Ref<number>): EditorHandle {
  return {
    focus: vi.fn(),
    blur: vi.fn(),
    getValue: () => value.value,
    getSelectedText: () => '',
    setValue: (nextValue) => {
      value.value = nextValue
      cursor.value = nextValue.length
    },
    getSelection: (): EditorSelection => ({ from: cursor.value, to: cursor.value }),
    setSelection: (from: number) => {
      cursor.value = Math.max(0, Math.min(from, value.value.length))
    },
    replaceRange: (from, to, text) => {
      value.value = `${value.value.slice(0, from)}${text}${value.value.slice(to)}`
      cursor.value = from + text.length
    },
    scrollToTop: vi.fn(),
    getScrollTop: () => 0,
    setScrollTop: vi.fn(),
    getCursorLineInfo: (): EditorCursorLineInfo => ({
      lineNumber: 1,
      totalLines: 1,
      from: 0,
      to: value.value.length,
      text: value.value,
    }),
  }
}

function createHarness(initialValue: string) {
  const scope = effectScope()
  const input = ref(initialValue)
  const cursor = ref(initialValue.length)
  const editor = ref<EditorHandle | null>(makeEditorHandle(input, cursor))
  const api = scope.run(() => usePickerOrchestration(
    input,
    ref('/repo'),
    editor,
    vi.fn(),
    vi.fn(),
    ref('room-1'),
  ))
  if (!api) throw new Error('failed to create picker harness')
  api.refreshTriggerState(input.value, cursor.value)
  return { scope, input, api }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('window', {
    electronAPI: {
      getSkills: vi.fn().mockResolvedValue({ success: true, skills: [] }),
      getPluginCommands: vi.fn().mockResolvedValue({ success: true, commands: [] }),
      listVariables: vi.fn().mockResolvedValue({ success: true, variables: [] }),
      listPrompts: vi.fn().mockResolvedValue({ success: true, prompts: [] }),
    },
  })
  setAgents([
    { id: 'pm', name: '阿明', title: '产品经理' },
    { id: 'fe', name: '小李', title: '前端工程师' },
  ])
})

describe('member picker → identity token (W14a)', () => {
  it('offers members with their AGENT ID as the pick value', async () => {
    const harness = createHarness('@小')
    await nextTick()
    const state = harness.api.activeExtension.value
    expect(state.type).toBe('members')
    expect(state.items.map(item => item.value)).toEqual(['fe'])
  })

  it('inserts a member token (not the bare name) at the trigger', async () => {
    const harness = createHarness('@小')
    await harness.api.handleMemberPickerSelect('fe')
    expect(harness.input.value).toBe(`${createMemberToken('fe')} `)
  })

  it('materializes at send into plain @名字 plus the id', () => {
    const harness = createHarness(`${createMemberToken('fe')} 登录页什么时候能好`)
    const { text, mentions } = harness.api.materializeMemberReferences(harness.input.value)
    expect(text).toBe('@小李 登录页什么时候能好')
    expect(mentions).toEqual([{ agentId: 'fe', label: '小李' }])
  })

  it('paints the CURRENT name when the member was renamed while the draft sat open', () => {
    const harness = createHarness(`${createMemberToken('fe')} 在吗`)
    setAgents([{ id: 'fe', name: '李工' }])
    const { text, mentions } = harness.api.materializeMemberReferences(harness.input.value)
    expect(text).toBe('@李工 在吗')
    expect(mentions).toEqual([{ agentId: 'fe', label: '李工' }])
  })

  it('leaves a mention-less draft untouched and reports nothing', () => {
    const harness = createHarness('大家早')
    expect(harness.api.materializeMemberReferences(harness.input.value))
      .toEqual({ text: '大家早', mentions: [] })
  })

  it('never ships a raw token when the member is gone', () => {
    const harness = createHarness(`${createMemberToken('ghost')} 在吗`)
    const { text, mentions } = harness.api.materializeMemberReferences(harness.input.value)
    expect(text).toBe('在吗')
    expect(mentions).toEqual([])
  })
})
