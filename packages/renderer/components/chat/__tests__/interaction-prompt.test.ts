// @vitest-environment happy-dom
/**
 * E2 提问栏位 —— 纯逻辑 + 真挂载。
 *
 * 两条最要紧的钉在最后半截:
 *  1. **倒计时到点只改样子,不发应答**。真正把提问结成 `timeout` 的是内核自己挂的
 *     表;UI 抢着补一发,就造出一次用户没点过的应答,而且两边都自认为是结算方。
 *  2. **答完不留痕**。栏位是 composer 上方的一格,收场之后整块撤走 —— 会话里不多
 *     出任何一行(那正是它与上一版流内提问卡的分界)。
 */
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InteractionQuestion, InteractionRequest } from '@/types'

const T0 = 1_700_000_000_000

const QUESTIONS: InteractionQuestion[] = [
  {
    id: 'q1',
    header: '配色',
    question: '这一版用哪一套配色?',
    options: [
      { label: '暖', description: '偏橘,和现有插画一致' },
      { label: '冷', preview: '#0b1220\n#1f2937' },
    ],
  },
  {
    id: 'q2',
    question: '还要顺手改哪些页?',
    multiSelect: true,
    allowFreeText: true,
    options: [{ label: '首页' }, { label: '定价页' }],
  },
]

function makeRequest(overrides: Partial<InteractionRequest> = {}): InteractionRequest {
  return {
    id: 'ask-1',
    sessionId: 'work-1',
    toolCallId: 'call-1',
    origin: 'external-agent',
    questions: QUESTIONS,
    deadlineAt: T0 + 120_000,
    createdAt: T0,
    ...overrides,
  } as InteractionRequest
}

/** 账本的替身:栏位自己读它,所以这里就是这组测试的「欠账」旋钮。 */
const pending = ref<InteractionRequest[]>([])
const storeMock = {
  pendingFor: (sessionId: string | undefined | null) =>
    (sessionId === 'work-1' ? pending.value : []),
  ensureForSession: vi.fn((_sessionId?: string) => Promise.resolve()),
  respond: vi.fn((
    _sessionId: string,
    _request: InteractionRequest,
    _answers: Record<string, { selected: string[], freeText?: string }>,
  ) => Promise.resolve(true)),
  decline: vi.fn((_sessionId: string, _request: InteractionRequest) => Promise.resolve(true)),
}

vi.mock('@/stores/interactions', () => ({
  useInteractionsStore: () => storeMock,
}))

const GLOBAL = {
  global: {
    stubs: {
      Button: {
        name: 'Button',
        props: ['unstyled', 'nativeType', 'disabled'],
        template: '<button :disabled="disabled" v-bind="$attrs"><slot /></button>',
      },
    },
  },
}

const PROPS = { props: { sessionId: 'work-1' }, ...GLOBAL }

const { default: InteractionPrompt } = await import('../interaction/InteractionPrompt.vue')
const {
  buildAnswers,
  emptyDraft,
  formatCountdown,
  interactionFootHint,
  isDraftComplete,
  questionTitle,
  toggleSelection,
} = await import('../interaction/interaction-prompt')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  pending.value = [makeRequest()]
  storeMock.ensureForSession.mockClear()
  storeMock.respond.mockClear()
  storeMock.decline.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('interaction-prompt 纯逻辑', () => {
  it('小标题 header 优先,没有就用问题原文', () => {
    expect(questionTitle(QUESTIONS[0]!)).toBe('配色')
    expect(questionTitle(QUESTIONS[1]!)).toBe('还要顺手改哪些页?')
  })

  it('单选是替换、多选是 toggle —— 单选题点不掉唯一的选中', () => {
    expect(toggleSelection(['暖'], '冷', false)).toEqual(['冷'])
    expect(toggleSelection(['暖'], '暖', false)).toEqual(['暖'])
    expect(toggleSelection(['首页'], '定价页', true)).toEqual(['首页', '定价页'])
    expect(toggleSelection(['首页', '定价页'], '首页', true)).toEqual(['定价页'])
  })

  it('「其他」里写了字就算答完了(哪怕一个选项都没选)', () => {
    const draft = emptyDraft(QUESTIONS)
    draft.q1!.selected = ['暖']
    expect(isDraftComplete(QUESTIONS, draft)).toBe(false)
    draft.q2!.freeText = '  还有博客  '
    expect(isDraftComplete(QUESTIONS, draft)).toBe(true)
    expect(buildAnswers(QUESTIONS, draft).q2).toEqual({ selected: [], freeText: '还有博客' })
  })

  it('空白的 freeText 不上线(协议里它是可选的)', () => {
    const draft = emptyDraft(QUESTIONS)
    draft.q1!.selected = ['冷']
    draft.q2!.selected = ['首页']
    draft.q2!.freeText = '   '
    expect(buildAnswers(QUESTIONS, draft)).toEqual({
      q1: { selected: ['冷'] },
      q2: { selected: ['首页'] },
    })
  })

  it('倒计时到点显示「已超时」', () => {
    expect(formatCountdown(119_400)).toBe('2:00')
    expect(formatCountdown(61_000)).toBe('1:01')
    expect(formatCountdown(0)).toBe('已超时')
    expect(formatCountdown(-5)).toBe('已超时')
  })

  it('脚注把还排着的那几条说出来 —— 不说,用户会以为刚才那一下没生效', () => {
    expect(interactionFootHint({ expired: false, answered: 0, total: 1, queued: 0 }))
      .toBe('awaiting your answer')
    expect(interactionFootHint({ expired: false, answered: 0, total: 1, queued: 2 }))
      .toContain('还有 2 条提问排队')
    expect(interactionFootHint({ expired: false, answered: 1, total: 2, queued: 0 }))
      .toContain('1/2 题已选')
    expect(interactionFootHint({ expired: true, answered: 2, total: 2, queued: 3 }))
      .toBe('已超时,等待后端结算')
  })
})

describe('InteractionPrompt 挂载', () => {
  it('多问题分组渲染,每题一块', () => {
    const wrapper = mount(InteractionPrompt, PROPS)
    expect(wrapper.findAll('[data-testid^="interaction-question-"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('配色')
    expect(wrapper.text()).toContain('这一版用哪一套配色?')
    // description / preview 都要画出来,它们正是「选哪个」的依据
    expect(wrapper.text()).toContain('偏橘,和现有插画一致')
    expect(wrapper.find('.option-preview').text()).toContain('#0b1220')
  })

  it('欠账为空就整块不画 —— 输入框上方一格都不占', () => {
    pending.value = []
    const wrapper = mount(InteractionPrompt, PROPS)
    expect(wrapper.find('.session-interaction-panel').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('挂载即补水:事件不会为重载的窗口补发,反查是唯一的来源', () => {
    mount(InteractionPrompt, PROPS)
    expect(storeMock.ensureForSession).toHaveBeenCalledWith('work-1')
  })

  it('全部答完才能发送 —— 半张表交不上去', async () => {
    const wrapper = mount(InteractionPrompt, PROPS)
    const submit = wrapper.get('[data-testid="interaction-submit"]')
    expect((submit.element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.findAll('.option')[0]!.trigger('click')
    expect((submit.element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.findAll('.option')[2]!.trigger('click')
    expect((submit.element as HTMLButtonElement).disabled).toBe(false)

    await submit.trigger('click')
    expect(storeMock.respond).toHaveBeenCalledWith(
      'work-1',
      expect.objectContaining({ id: 'ask-1' }),
      { q1: { selected: ['暖'] }, q2: { selected: ['首页'] } },
    )
  })

  it('multiSelect 累加,单选替换', async () => {
    const wrapper = mount(InteractionPrompt, PROPS)
    const options = wrapper.findAll('.option')
    await options[0]!.trigger('click')
    await options[1]!.trigger('click')   // 单选:替换
    await options[2]!.trigger('click')
    await options[3]!.trigger('click')   // 多选:累加
    await wrapper.get('[data-testid="interaction-submit"]').trigger('click')

    const answers = storeMock.respond.mock.calls[0]![2]
    expect(answers.q1!.selected).toEqual(['冷'])
    expect(answers.q2!.selected).toEqual(['首页', '定价页'])
  })

  it('allowFreeText 才给「其他」输入框,写进去的字随答案一起走', async () => {
    const wrapper = mount(InteractionPrompt, PROPS)
    expect(wrapper.find('[data-testid="interaction-freetext-q1"]').exists()).toBe(false)
    const freeText = wrapper.get('[data-testid="interaction-freetext-q2"]')

    await wrapper.findAll('.option')[0]!.trigger('click')
    await freeText.setValue('还有博客')
    await wrapper.get('[data-testid="interaction-submit"]').trigger('click')

    const answers = storeMock.respond.mock.calls[0]![2]
    expect(answers.q2).toEqual({ selected: [], freeText: '还有博客' })
  })

  it('同时欠着好几条:只画最早那条,其余只报数', async () => {
    pending.value = [
      makeRequest({ id: 'ask-2', createdAt: T0 + 5_000 }),
      makeRequest({ id: 'ask-1', createdAt: T0 }),
      makeRequest({ id: 'ask-3', createdAt: T0 + 9_000 }),
    ]
    const wrapper = mount(InteractionPrompt, PROPS)

    expect(wrapper.findAll('.session-interaction-panel')).toHaveLength(1)
    expect(wrapper.get('.session-interaction-panel').attributes('data-testid'))
      .toBe('interaction-prompt-ask-1')
    expect(wrapper.get('[data-testid="interaction-queued"]').text()).toBe('+2 待答')
    expect(wrapper.text()).toContain('还有 2 条提问排队')
  })

  it('答完一条就换下一条,上一条的选择不顺延', async () => {
    pending.value = [makeRequest({ id: 'ask-1' }), makeRequest({ id: 'ask-2', createdAt: T0 + 1 })]
    const wrapper = mount(InteractionPrompt, PROPS)
    await wrapper.findAll('.option')[0]!.trigger('click')

    // 摘牌(结算事件到达之后账本会这么做)
    pending.value = pending.value.filter(item => item.id !== 'ask-1')
    await nextTick()

    expect(wrapper.get('.session-interaction-panel').attributes('data-testid'))
      .toBe('interaction-prompt-ask-2')
    expect(wrapper.find('[data-testid="interaction-queued"]').exists()).toBe(false)
    expect(wrapper.findAll('.option[aria-pressed="true"]')).toHaveLength(0)
    expect((wrapper.get('[data-testid="interaction-submit"]').element as HTMLButtonElement).disabled)
      .toBe(true)
  })

  it('结算之后栏位整块撤走 —— 会话里一行记录都不留', async () => {
    const wrapper = mount(InteractionPrompt, PROPS)
    expect(wrapper.find('.session-interaction-panel').exists()).toBe(true)

    pending.value = []
    await nextTick()

    expect(wrapper.find('.session-interaction-panel').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('到点变「已超时」态且不可点 —— 但一条 respond 都不发', async () => {
    pending.value = [makeRequest({ deadlineAt: T0 + 2_000 })]
    const wrapper = mount(InteractionPrompt, PROPS)
    await wrapper.findAll('.option')[0]!.trigger('click')
    await wrapper.findAll('.option')[2]!.trigger('click')
    expect((wrapper.get('[data-testid="interaction-submit"]').element as HTMLButtonElement).disabled).toBe(false)

    vi.setSystemTime(T0 + 3_000)
    await vi.advanceTimersByTimeAsync(1_100)
    await nextTick()

    expect(wrapper.get('.session-interaction-panel').attributes('data-state')).toBe('expired')
    expect(wrapper.text()).toContain('已超时')
    expect((wrapper.get('[data-testid="interaction-submit"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.get('[data-testid="interaction-decline"]').element as HTMLButtonElement).disabled).toBe(true)
    // 结算归内核:UI 到点不许替用户答一句
    expect(storeMock.respond).not.toHaveBeenCalled()
    expect(storeMock.decline).not.toHaveBeenCalled()
  })

  it('「跳过」发的是 decline,不是空答案', async () => {
    const wrapper = mount(InteractionPrompt, PROPS)
    await wrapper.get('[data-testid="interaction-decline"]').trigger('click')
    expect(storeMock.decline).toHaveBeenCalledWith('work-1', expect.objectContaining({ id: 'ask-1' }))
    expect(storeMock.respond).not.toHaveBeenCalled()
  })

  it('与审批栏位共用同一条量出来的阅读列(两格叠起来左右缘要对得上)', async () => {
    const source = (await import('node:fs')).readFileSync(
      (await import('node:path')).resolve(
        __dirname,
        '../interaction/InteractionPrompt.vue',
      ),
      'utf8',
    )
    expect(source).toContain('width: var(--chat-composer-width);')
    expect(source).toContain('var(--chat-content-column-left, auto)')
    // 已办态的整套配方(is-settled / answer-row / 记录形态)随流内卡片一起退场
    expect(source).not.toContain('is-settled')
  })
})
