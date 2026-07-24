// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ProviderUsageCard from '../ProviderUsageCard.vue'

function createResponse(overrides = {}) {
  return {
    success: true,
    providerId: 'codex',
    capturedAt: Date.now(),
    account: { planType: 'pro' },
    usage: {
      planType: 'pro',
      credits: { hasCredits: true, unlimited: false, balance: '12.50' },
      limits: [
        {
          id: 'codex',
          primary: {
            usedPercent: 25,
            windowSeconds: 18_000,
            resetAfterSeconds: 300,
            resetAt: 1_770_000_000,
          },
          secondary: {
            usedPercent: 50,
            windowSeconds: 604_800,
            resetAfterSeconds: 86_400,
            resetAt: 1_770_600_000,
          },
        },
        {
          id: 'codex_cloud',
          name: 'Cloud tasks',
          primary: { usedPercent: 10, windowSeconds: 3600 },
        },
      ],
    },
    ...overrides,
  } as any
}

describe('ProviderUsageCard', () => {
  it('renders Codex official usage without cost fields', () => {
    const wrapper = mount(ProviderUsageCard, {
      props: {
        response: createResponse(),
        isLoading: false,
        error: '',
      },
    })

    expect(wrapper.text()).toContain('Usage')
    expect(wrapper.text()).toContain('Official')
    expect(wrapper.text()).toContain('Pro')
    expect(wrapper.text()).toContain('12.50')
    expect(wrapper.text()).toContain('Primary (5h)')
    expect(wrapper.text()).toContain('25%')
    expect(wrapper.text()).toContain('Secondary (7d)')
    expect(wrapper.text()).toContain('50%')
    expect(wrapper.text()).toContain('Additional limits (1)')
    expect(wrapper.text()).not.toMatch(/cost|price|\$/i)
  })

  it('renders loading and error states', () => {
    const loading = mount(ProviderUsageCard, {
      props: { response: null, isLoading: true, error: '' },
    })
    expect(loading.text()).toContain('Loading usage')

    const error = mount(ProviderUsageCard, {
      props: { response: null, isLoading: false, error: 'Codex usage request failed: 403' },
    })
    expect(error.text()).toContain('Codex usage request failed: 403')
  })

  it('renders unlimited credits', () => {
    const wrapper = mount(ProviderUsageCard, {
      props: {
        response: createResponse({
          usage: {
            planType: 'team',
            credits: { hasCredits: true, unlimited: true },
            limits: [{ id: 'codex' }],
          },
        }),
        isLoading: false,
        error: '',
      },
    })

    expect(wrapper.text()).toContain('Team')
    expect(wrapper.text()).toContain('Unlimited')
    expect(wrapper.text()).toContain('No rate limit windows returned')
  })
})
