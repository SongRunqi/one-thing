// @vitest-environment happy-dom
/**
 * AgentAvatar — the one component nine surfaces render an agent's mark through
 * (docs/design/todo2-fix-plan.md P2).
 *
 * Three branches are worth pinning, because each one is a promise made to a
 * different failure:
 *  - a picture renders as a picture (the whole point of `avatarImage`);
 *  - no picture renders the emoji, and no emoji renders 🤖 (a nameless hole
 *    where a face belongs is the bug this replaced);
 *  - a picture that FAILS to load falls back to the emoji rather than leaving a
 *    broken-image glyph — a media file can go missing while agents.json still
 *    names it.
 *
 * Plus the reference form itself: `avatarImage` stores a bare media file name,
 * and turning it into a URL is host-specific.
 */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AgentAvatar from '../AgentAvatar.vue'
import { AGENT_AVATAR_FALLBACK, resolveAgentAvatarSrc } from '../agent-avatar'

const mocks = vi.hoisted(() => ({ environment: 'electron' as 'electron' | 'web' }))

vi.mock('@/platform', () => ({
  platformApi: {
    get environment() {
      return mocks.environment
    },
  },
}))

beforeEach(() => {
  mocks.environment = 'electron'
})

describe('AgentAvatar', () => {
  it('renders the emoji when the agent has no picture', () => {
    const wrapper = mount(AgentAvatar, { props: { avatar: '🔧' } })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toBe('🔧')
  })

  it('falls back to 🤖 when the agent carries no mark at all', () => {
    expect(mount(AgentAvatar).text()).toBe(AGENT_AVATAR_FALLBACK)
    // A whitespace-only avatar is no avatar — it would render as a blank stamp.
    expect(mount(AgentAvatar, { props: { avatar: '  ' } }).text())
      .toBe(AGENT_AVATAR_FALLBACK)
  })

  it('renders the picture, sized, when the agent has one', () => {
    const wrapper = mount(AgentAvatar, {
      props: { avatar: '🔧', avatarImage: 'a1b2c3.png', size: 28 },
    })

    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('media://a1b2c3.png')
    expect(img.attributes('style')).toContain('width: 28px')
    expect(img.attributes('style')).toContain('height: 28px')
    // Decorative: the name next to it already says who this is.
    expect(img.attributes('alt')).toBe('')
    expect(wrapper.text()).toBe('')
  })

  it('falls back to the emoji when the picture fails to load', async () => {
    const wrapper = mount(AgentAvatar, {
      props: { avatar: '🔧', avatarImage: 'gone.png', size: 28 },
    })

    await wrapper.find('img').trigger('error')

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toBe('🔧')
  })

  it('retries a NEW picture after an earlier one failed', async () => {
    const wrapper = mount(AgentAvatar, {
      props: { avatar: '🔧', avatarImage: 'gone.png' },
    })
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)

    // The latch is per reference: picking a different picture must get a chance.
    await wrapper.setProps({ avatarImage: 'fresh.png' })
    expect(wrapper.find('img').attributes('src')).toBe('media://fresh.png')
  })

  it('hands the call site its own class and attrs through to the mark', () => {
    const emoji = mount(AgentAvatar, {
      props: { avatar: '🔧' },
      attrs: { class: 'room-avatar', 'aria-hidden': 'true' },
    })
    expect(emoji.classes()).toContain('room-avatar')
    expect(emoji.attributes('aria-hidden')).toBe('true')

    const picture = mount(AgentAvatar, {
      props: { avatar: '🔧', avatarImage: 'a1b2c3.png' },
      attrs: { class: 'room-avatar' },
    })
    expect(picture.find('img').classes()).toContain('room-avatar')
  })

  it('resolves the picture through the web route when there is no Electron host', () => {
    mocks.environment = 'web'
    const wrapper = mount(AgentAvatar, { props: { avatarImage: 'a1 b2.png' } })
    expect(wrapper.find('img').attributes('src')).toBe('/api/media/file/a1%20b2.png')
  })
})

describe('resolveAgentAvatarSrc', () => {
  it('maps a bare media file name onto the host that serves it', () => {
    expect(resolveAgentAvatarSrc('a1b2c3.png', 'electron')).toBe('media://a1b2c3.png')
    expect(resolveAgentAvatarSrc('a1b2c3.png', 'web')).toBe('/api/media/file/a1b2c3.png')
  })

  it('reports no reference for an absent or blank value', () => {
    expect(resolveAgentAvatarSrc(undefined, 'electron')).toBe('')
    expect(resolveAgentAvatarSrc(null, 'electron')).toBe('')
    expect(resolveAgentAvatarSrc('   ', 'electron')).toBe('')
  })

  it('passes an already-usable reference through untouched', () => {
    // Mangling these into `media://https://…` would break a value that works.
    for (const reference of [
      'https://example.test/face.png',
      'data:image/png;base64,AAAA',
      'media://a1b2c3.png',
      '//cdn.example.test/face.png',
      '/api/media/file/a1b2c3.png',
    ]) {
      expect(resolveAgentAvatarSrc(reference, 'electron')).toBe(reference)
      expect(resolveAgentAvatarSrc(reference, 'web')).toBe(reference)
    }
  })
})
