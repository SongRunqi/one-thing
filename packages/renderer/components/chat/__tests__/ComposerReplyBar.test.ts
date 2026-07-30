// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ComposerReplyBar from '../ComposerReplyBar.vue'

const REPLY_TO = { messageId: 'm1', authorLabel: '阿明', excerpt: '我建议先做接口再做页面' }

describe('ComposerReplyBar', () => {
  it('mirrors the snapshot that will ride out with the message', () => {
    const wrapper = mount(ComposerReplyBar, { props: { replyTo: REPLY_TO } })
    expect(wrapper.find('.reply-author').text()).toBe('阿明')
    expect(wrapper.find('.reply-excerpt').text()).toBe('我建议先做接口再做页面')
    wrapper.unmount()
  })

  it('asks to be dropped when × is pressed', () => {
    const wrapper = mount(ComposerReplyBar, { props: { replyTo: REPLY_TO } })
    wrapper.find('.reply-cancel').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
  })
})
