// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UsageSettingsPanel from '../UsageSettingsPanel.vue'

const getUsageSummary = vi.fn()

vi.mock('@/platform', () => ({
  platformApi: {
    getUsageSummary: (...args: unknown[]) => getUsageSummary(...args),
  },
}))

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const todayKey = localDayKey(new Date())

function bucketFixture(overrides: Record<string, unknown> = {}) {
  return {
    bucketKey: todayKey,
    startTs: 0,
    endTs: 1,
    usage: { input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 1500 },
    apiCostUSD: 0.012,
    subscriptionCostUSD: 0.003,
    records: 2,
    byProvider: [{ key: 'anthropic', usage: {} as never, apiCostUSD: 0.012, subscriptionCostUSD: 0, records: 1 }],
    byModel: [{ key: 'claude-fable-5', usage: {} as never, apiCostUSD: 0.012, subscriptionCostUSD: 0, records: 1 }],
    byPlatform: [{ key: 'electron', usage: {} as never, apiCostUSD: 0.012, subscriptionCostUSD: 0.003, records: 2 }],
    bySource: [{ key: 'chat', usage: {} as never, apiCostUSD: 0.012, subscriptionCostUSD: 0.003, records: 2 }],
    ...overrides,
  }
}

function summaryFixture(overrides: Record<string, unknown> = {}) {
  return {
    granularity: 'day',
    buckets: [bucketFixture()],
    totalApiCostUSD: 0.012,
    totalSubscriptionCostUSD: 0.003,
    ...overrides,
  }
}

describe('UsageSettingsPanel', () => {
  beforeEach(() => {
    getUsageSummary.mockReset()
  })

  it('fetches day buckets covering the current month on mount and renders totals', async () => {
    getUsageSummary.mockResolvedValue(summaryFixture())
    const wrapper = mount(UsageSettingsPanel)
    await flushPromises()

    expect(getUsageSummary).toHaveBeenCalledWith({
      granularity: 'day',
      count: new Date().getDate(),
    })
    expect(wrapper.text()).toContain('API spend')
    expect(wrapper.text()).toContain('$0.0120')
    expect(wrapper.text()).toContain('Subscription')
    expect(wrapper.text()).toContain('$0.0030')
  })

  it('auto-selects the latest day with usage and shows its detail', async () => {
    getUsageSummary.mockResolvedValue(summaryFixture())
    const wrapper = mount(UsageSettingsPanel)
    await flushPromises()

    expect(wrapper.find('.day-cell.selected').exists()).toBe(true)
    expect(wrapper.find('.detail-date').text()).toContain(todayKey)
    expect(wrapper.text()).toContain('claude-fable-5')
  })

  it('refetches with a larger trailing count when navigating to the previous month', async () => {
    getUsageSummary.mockResolvedValue(summaryFixture())
    const wrapper = mount(UsageSettingsPanel)
    await flushPromises()

    const initialCount = getUsageSummary.mock.calls[0][0].count
    await wrapper.find('.nav-btn').trigger('click')
    await flushPromises()

    const lastCall = getUsageSummary.mock.calls.at(-1)![0]
    expect(lastCall.granularity).toBe('day')
    expect(lastCall.count).toBeGreaterThan(initialCount)
  })

  it('disables forward navigation on the current month', async () => {
    getUsageSummary.mockResolvedValue(summaryFixture())
    const wrapper = mount(UsageSettingsPanel)
    await flushPromises()

    const nextBtn = wrapper.findAll('.nav-btn')[1]
    expect(nextBtn.attributes('disabled')).toBeDefined()
  })

  it('shows an empty state when no usage has been recorded', async () => {
    getUsageSummary.mockResolvedValue(summaryFixture({
      buckets: [bucketFixture({
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0 },
        apiCostUSD: 0,
        subscriptionCostUSD: 0,
        records: 0,
        byProvider: [],
        byModel: [],
        byPlatform: [],
      })],
      totalApiCostUSD: 0,
      totalSubscriptionCostUSD: 0,
    }))
    const wrapper = mount(UsageSettingsPanel)
    await flushPromises()

    expect(wrapper.text()).toContain('No usage recorded yet')
  })

  it('surfaces a fetch error instead of throwing', async () => {
    getUsageSummary.mockRejectedValue(new Error('network down'))
    const wrapper = mount(UsageSettingsPanel)
    await flushPromises()

    expect(wrapper.text()).toContain('network down')
  })
  it('breaks the day down by activity so background calls are visible', async () => {
    getUsageSummary.mockResolvedValue(summaryFixture({
      buckets: [bucketFixture({
        bySource: [
          { key: 'chat', usage: {} as never, apiCostUSD: 0.012, subscriptionCostUSD: 0, records: 2 },
          { key: 'memory', usage: {} as never, apiCostUSD: 0.004, subscriptionCostUSD: 0, records: 3 },
          { key: 'title', usage: {} as never, apiCostUSD: 0.001, subscriptionCostUSD: 0, records: 1 },
        ],
      })],
    }))

    const wrapper = mount(UsageSettingsPanel)
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('By activity')
    // Raw ledger keys are internal; the panel shows what the user recognises.
    expect(text).toContain('Memory')
    expect(text).toContain('Chat naming')
  })

  it('hides the activity breakdown when everything came from one source', async () => {
    getUsageSummary.mockResolvedValue(summaryFixture())

    const wrapper = mount(UsageSettingsPanel)
    await flushPromises()

    expect(wrapper.text()).not.toContain('By activity')
  })
})
