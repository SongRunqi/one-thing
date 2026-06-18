// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ProviderIcon from '../ProviderIcon.vue'

describe('ProviderIcon', () => {
  it('applies provider brand color on the icon root', () => {
    const wrapper = mount(ProviderIcon, {
      props: {
        provider: 'claude',
        size: 18,
      },
    })

    expect(wrapper.attributes('style')).toContain('--provider-icon-size: 18px')
    expect(wrapper.attributes('style')).toContain('--provider-icon-color: #d97757')
  })

  it('uses the official GPT/OpenAI icon for OpenAI, GPT, and Codex providers', () => {
    const openai = mount(ProviderIcon, { props: { provider: 'openai' } })
    const gpt = mount(ProviderIcon, { props: { provider: 'gpt' } })
    const codex = mount(ProviderIcon, { props: { provider: 'codex' } })
    const openaiPath = openai.find('path').attributes('d')

    expect(openai.attributes('style')).toContain('--provider-icon-color: #0d0d0d')
    expect(gpt.find('path').attributes('d')).toBe(openaiPath)
    expect(codex.find('path').attributes('d')).toBe(openaiPath)
  })

  it('uses the official Z.ai mark for Zhipu', () => {
    const wrapper = mount(ProviderIcon, {
      props: {
        provider: 'zhipu',
      },
    })

    expect(wrapper.find('svg').attributes('viewBox')).toBe('0 0 31.5 26.53')
    expect(wrapper.findAll('path')).toHaveLength(3)
    expect(wrapper.attributes('style')).toContain('--provider-icon-color: #0d0d0d')
  })

  it('keeps custom provider icons theme-colored', () => {
    const wrapper = mount(ProviderIcon, {
      props: {
        provider: 'custom-local',
      },
    })

    expect(wrapper.attributes('style')).toContain('--provider-icon-size: 16px')
    expect(wrapper.attributes('style')).not.toContain('--provider-icon-color')
  })

  it('renders the official 2025 Gemini icon with scoped mask and filters', () => {
    const wrapper = mount(ProviderIcon, {
      props: {
        provider: 'gemini',
      },
    })

    const maskId = wrapper.find('mask').attributes('id')
    const filters = wrapper.findAll('filter')

    expect(maskId).toMatch(/^provider-icon-gemini-mask-\d+$/)
    expect(wrapper.find('g').attributes('mask')).toBe(`url(#${maskId})`)
    expect(filters).toHaveLength(11)
    expect(filters[0].attributes('id')).toMatch(/^provider-icon-gemini-filter-\d+-0$/)
  })
})
