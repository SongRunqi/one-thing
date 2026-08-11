// @vitest-environment happy-dom
/**
 * E2 提问卡片 —— 纯逻辑 + 真挂载。
 *
 * 最要紧的一条钉在最后:**倒计时到点只改样子,不发应答**。真正把提问结成
 * `timeout` 的是内核自己挂的表;UI 抢着补一发,就造出一次用户没点过的应答,
 * 而且两边都自认为是结算方。
 */
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InteractionCard from '../interaction/InteractionCard.vue'
import {
  buildAnswers,
  emptyDraft,
  formatCountdown,
  interactionOutcomeLabel,
  isDraftComplete,
  questionTitle,
  summarizeAnswer,
  toggleSelection,
} from '../interaction/interaction-card'
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

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('interaction-card 纯逻辑', () => {
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

  it('倒计时到点显示「已超时」,四种收场各有中文', () => {
    expect(formatCountdown(119_400)).toBe('2:00')
    expect(formatCountdown(61_000)).toBe('1:01')
    expect(formatCountdown(0)).toBe('已超时')
    expect(formatCountdown(-5)).toBe('已超时')
    expect(interactionOutcomeLabel('answered')).toBe('已回答')
    expect(interactionOutcomeLabel('timeout')).toBe('已超时')
  })

  it('历史态那一行把选项与自由输入连起来读', () => {
    expect(summarizeAnswer({ selected: ['首页', '定价页'], freeText: '还有博客' }))
      .toBe('首页、定价页、还有博客')
    expect(summarizeAnswer(undefined)).toBe('')
  })
})

describe('InteractionCard 挂载', () => {
  it('多问题分组渲染,每题一块', () => {
    const wrapper = mount(InteractionCard, { props: { request: makeRequest() }, ...GLOBAL })
    expect(wrapper.findAll('[data-testid^="interaction-question-"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('配色')
    expect(wrapper.text()).toContain('这一版用哪一套配色?')
    // description / preview 都要画出来,它们正是「选哪个」的依据
    expect(wrapper.text()).toContain('偏橘,和现有插画一致')
    expect(wrapper.find('.option-preview').text()).toContain('#0b1220')
  })

  it('全部答完才能发送 —— 半张表交不上去', async () => {
    const wrapper = mount(InteractionCard, { props: { request: makeRequest() }, ...GLOBAL })
    const submit = wrapper.get('[data-testid="interaction-submit"]')
    expect((submit.element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.findAll('.option')[0]!.trigger('click')
    expect((submit.element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.findAll('.option')[2]!.trigger('click')
    expect((submit.element as HTMLButtonElement).disabled).toBe(false)

    await submit.trigger('click')
    const [request, answers] = wrapper.emitted('submit')![0] as [InteractionRequest, unknown]
    expect(request.id).toBe('ask-1')
    expect(answers).toEqual({ q1: { selected: ['暖'] }, q2: { selected: ['首页'] } })
  })

  it('multiSelect 累加,单选替换', async () => {
    const wrapper = mount(InteractionCard, { props: { request: makeRequest() }, ...GLOBAL })
    const options = wrapper.findAll('.option')
    await options[0]!.trigger('click')
    await options[1]!.trigger('click')   // 单选:替换
    await options[2]!.trigger('click')
    await options[3]!.trigger('click')   // 多选:累加
    await wrapper.get('[data-testid="interaction-submit"]').trigger('click')

    const [, answers] = wrapper.emitted('submit')![0] as [InteractionRequest, Record<string, { selected: string[] }>]
    expect(answers.q1!.selected).toEqual(['冷'])
    expect(answers.q2!.selected).toEqual(['首页', '定价页'])
  })

  it('allowFreeText 才给「其他」输入框,写进去的字随答案一起走', async () => {
    const wrapper = mount(InteractionCard, { props: { request: makeRequest() }, ...GLOBAL })
    expect(wrapper.find('[data-testid="interaction-freetext-q1"]').exists()).toBe(false)
    const freeText = wrapper.get('[data-testid="interaction-freetext-q2"]')

    await wrapper.findAll('.option')[0]!.trigger('click')
    await freeText.setValue('还有博客')
    await wrapper.get('[data-testid="interaction-submit"]').trigger('click')

    const [, answers] = wrapper.emitted('submit')![0] as [InteractionRequest, Record<string, unknown>]
    expect(answers.q2).toEqual({ selected: [], freeText: '还有博客' })
  })

  it('到点变「已超时」态且不可点 —— 但一条 respond 都不发', async () => {
    const wrapper = mount(InteractionCard, {
      props: { request: makeRequest({ deadlineAt: T0 + 2_000 }) },
      ...GLOBAL,
    })
    await wrapper.findAll('.option')[0]!.trigger('click')
    await wrapper.findAll('.option')[2]!.trigger('click')
    expect((wrapper.get('[data-testid="interaction-submit"]').element as HTMLButtonElement).disabled).toBe(false)

    vi.setSystemTime(T0 + 3_000)
    await vi.advanceTimersByTimeAsync(1_100)
    await nextTick()

    expect(wrapper.get('.interaction-card').attributes('data-state')).toBe('expired')
    expect(wrapper.text()).toContain('已超时')
    expect((wrapper.get('[data-testid="interaction-submit"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.get('[data-testid="interaction-decline"]').element as HTMLButtonElement).disabled).toBe(true)
    // 结算归内核:UI 到点不许替用户答一句
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.emitted('decline')).toBeUndefined()
  })

  it('「跳过」发的是 decline,不是空答案', async () => {
    const wrapper = mount(InteractionCard, { props: { request: makeRequest() }, ...GLOBAL })
    await wrapper.get('[data-testid="interaction-decline"]').trigger('click')
    expect(wrapper.emitted('decline')).toHaveLength(1)
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('结算之后进历史态:显示答了什么,按钮收起,卡片不消失', () => {
    const wrapper = mount(InteractionCard, {
      props: {
        request: makeRequest(),
        answer: {
          id: 'ask-1',
          outcome: 'answered',
          answers: { q1: { selected: ['暖'] }, q2: { selected: ['首页'], freeText: '还有博客' } },
        },
      },
      ...GLOBAL,
    })
    expect(wrapper.get('.interaction-card').attributes('data-state')).toBe('answered')
    expect(wrapper.get('[data-testid="interaction-answer-q1"]').text()).toBe('暖')
    expect(wrapper.get('[data-testid="interaction-answer-q2"]').text()).toBe('首页、还有博客')
    expect(wrapper.find('[data-testid="interaction-submit"]').exists()).toBe(false)
    expect(wrapper.find('.option').exists()).toBe(false)
    expect(wrapper.text()).toContain('已回答')
  })

  /**
   * 用户原话:「它像是一个 message,不是一个弹窗」—— 待答的卡与一段普通消息之间
   * 只差一条细边,没有任何一处在说「这里等着你」。信号必须画在卡上(它在流里是
   * 对的,不搬出去做浮层),而且收场之后要一起撤走。
   */
  it('待答时带「需要你操作」的记号,收场之后记号撤走', () => {
    const open = mount(InteractionCard, { props: { request: makeRequest() }, ...GLOBAL })
    expect(open.get('[data-testid="interaction-todo-badge"]').text()).toBe('待你回答')
    expect(open.get('.interaction-card').attributes('data-state')).toBe('open')

    const settled = mount(InteractionCard, {
      props: {
        request: makeRequest(),
        answer: { id: 'ask-1', outcome: 'answered', answers: { q1: { selected: ['暖'] } } },
      },
      ...GLOBAL,
    })
    expect(settled.find('[data-testid="interaction-todo-badge"]').exists()).toBe(false)
  })

  it('到点未结算时记号改口说「已超时」,而不是继续喊你回答', () => {
    const wrapper = mount(InteractionCard, {
      props: { request: makeRequest({ deadlineAt: T0 - 1 }) },
      ...GLOBAL,
    })
    expect(wrapper.get('[data-testid="interaction-todo-badge"]').text()).toBe('已超时')
  })

  /**
   * 用户原话第二句:「你同意了之后,这个弹框还在那里放着」。答完之后这张卡要收成
   * 一条紧凑的已办记录:操作带整条撤掉、题干原文收起、备选只报个数、状态与时刻留下。
   */
  it('答完收成已办记录:操作带没了,题干收起,备选只报数,时刻留下', () => {
    const wrapper = mount(InteractionCard, {
      props: {
        request: makeRequest(),
        settledAt: T0 + 42_000,
        answer: {
          id: 'ask-1',
          outcome: 'answered',
          answers: { q1: { selected: ['暖'] }, q2: { selected: ['首页'] } },
        },
      },
      ...GLOBAL,
    })

    // 交互控件一个不剩(整条脚也撤了,不留一条写着「已收场」的空带)。
    expect(wrapper.find('[data-testid="interaction-submit"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="interaction-decline"]').exists()).toBe(false)
    expect(wrapper.find('.interaction-foot').exists()).toBe(false)
    expect(wrapper.find('.option').exists()).toBe(false)
    expect(wrapper.find('.freetext-input').exists()).toBe(false)
    // 题干原文收起,只留标题那一行。
    expect(wrapper.find('.question-body').exists()).toBe(false)
    expect(wrapper.text()).toContain('配色')
    // 所选项醒目(带记号),未选的整组收起、只报个数。
    expect(wrapper.get('[data-testid="interaction-answer-q1"]').text()).toBe('暖')
    expect(wrapper.find('.answer-mark').exists()).toBe(true)
    expect(wrapper.text()).toContain('未选 1 项')
    // 「已回答」+ 时刻。
    expect(wrapper.text()).toContain('已回答')
    expect(wrapper.get('[data-testid="interaction-settled-at"]').text()).toMatch(/^\d{2}:\d{2}$/)
  })

  it('重新挂载(等同重开会话)仍然是已办态 —— 已办不靠组件里那点内存', () => {
    const props = {
      request: makeRequest(),
      settledAt: T0 + 42_000,
      answer: { id: 'ask-1', outcome: 'answered' as const, answers: { q1: { selected: ['暖'] } } },
    }
    const first = mount(InteractionCard, { props, ...GLOBAL })
    first.unmount()
    const again = mount(InteractionCard, { props, ...GLOBAL })

    expect(again.get('.interaction-card').attributes('data-state')).toBe('answered')
    expect(again.find('[data-testid="interaction-submit"]').exists()).toBe(false)
    expect(again.get('[data-testid="interaction-answer-q1"]').text()).toBe('暖')
  })

  it('超时收场的历史态把内核给模型的那句理由摆出来', () => {
    const wrapper = mount(InteractionCard, {
      props: {
        request: makeRequest(),
        answer: { id: 'ask-1', outcome: 'timeout', answers: {}, reason: '无人应答,提问已超时结算。' },
      },
      ...GLOBAL,
    })
    expect(wrapper.get('.interaction-card').attributes('data-state')).toBe('timeout')
    expect(wrapper.text()).toContain('无人应答,提问已超时结算。')
    expect(wrapper.get('[data-testid="interaction-answer-q1"]').text()).toBe('—')
  })
})
