// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import Scrollbar from '../Scrollbar.vue'

interface MockGeometry {
  scrollTop?: number
  scrollLeft?: number
  scrollHeight?: number
  scrollWidth?: number
  clientHeight?: number
  clientWidth?: number
}

interface ScrollbarHandle {
  setScrollTop: (scrollTop: number) => void
  setScrollLeft: (scrollLeft: number) => void
  getScrollElement: () => HTMLElement | null
  getScrollTop: () => number
  getScrollLeft: () => number
}

function mockGeometry(element: HTMLElement, geometry: MockGeometry) {
  Object.defineProperties(element, {
    scrollTop: {
      configurable: true,
      writable: true,
      value: geometry.scrollTop ?? 0,
    },
    scrollLeft: {
      configurable: true,
      writable: true,
      value: geometry.scrollLeft ?? 0,
    },
    scrollHeight: {
      configurable: true,
      value: geometry.scrollHeight ?? 0,
    },
    scrollWidth: {
      configurable: true,
      value: geometry.scrollWidth ?? 0,
    },
    clientHeight: {
      configurable: true,
      value: geometry.clientHeight ?? 0,
    },
    clientWidth: {
      configurable: true,
      value: geometry.clientWidth ?? 0,
    },
  })
}

describe('Scrollbar', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('uses explicit height, max height, and horizontal scrolling styles', () => {
    const wrapper = mount(Scrollbar, {
      props: {
        height: 180,
        maxHeight: '50vh',
        horizontal: true,
      },
      slots: {
        default: '<div class="wide-content">Content</div>',
      },
    })

    const scroller = wrapper.find('.scrollbar')
    expect(scroller.classes()).toContain('is-horizontal')
    expect(scroller.classes()).toContain('is-overlay-scrollbar')
    expect(scroller.classes()).not.toContain('is-stable-gutter')
    expect(scroller.attributes('style')).toContain('height: 180px')
    expect(scroller.attributes('style')).toContain('max-height: 50vh')
    expect(wrapper.find('.wide-content').exists()).toBe(true)
  })

  it('uses stable scrollbar gutter reservation in native mode', () => {
    const wrapper = mount(Scrollbar, {
      props: {
        native: true,
      },
    })

    expect(wrapper.classes()).toContain('is-native-scrollbar')
    expect(wrapper.classes()).toContain('is-stable-gutter')
  })

  it('can opt out of stable scrollbar gutter reservation in native mode', () => {
    const wrapper = mount(Scrollbar, {
      props: {
        native: true,
        stableGutter: false,
      },
    })

    expect(wrapper.classes()).not.toContain('is-stable-gutter')
  })

  it('fills the parent height by default and lets max height size naturally', () => {
    const parentSized = mount(Scrollbar)
    expect(parentSized.attributes('style')).toContain('height: 100%')

    const maxSized = mount(Scrollbar, {
      props: {
        maxHeight: 240,
      },
    })

    expect(maxSized.attributes('style')).toBe('max-height: 240px;')
  })

  it('exposes methods for manually controlling vertical and horizontal scroll', () => {
    const wrapper = mount(Scrollbar, {
      props: {
        horizontal: true,
      },
    })
    const scroller = wrapper.find('.scrollbar-viewport').element as HTMLElement
    const handle = wrapper.vm as unknown as ScrollbarHandle
    mockGeometry(scroller, {
      scrollHeight: 1000,
      clientHeight: 300,
      scrollWidth: 900,
      clientWidth: 320,
    })

    handle.setScrollTop(820)
    handle.setScrollLeft(720)

    expect(scroller.scrollTop).toBe(700)
    expect(scroller.scrollLeft).toBe(580)
    expect(handle.getScrollElement()).toBe(scroller)
    expect(handle.getScrollTop()).toBe(700)
    expect(handle.getScrollLeft()).toBe(580)

    handle.setScrollTop(-20)
    handle.setScrollLeft(-20)

    expect(scroller.scrollTop).toBe(0)
    expect(scroller.scrollLeft).toBe(0)
  })

  it('emits end-reached when the scrollbar reaches the bottom', () => {
    const wrapper = mount(Scrollbar)
    const scroller = wrapper.find('.scrollbar-viewport').element as HTMLElement
    const handle = wrapper.vm as unknown as ScrollbarHandle
    mockGeometry(scroller, {
      scrollHeight: 1000,
      clientHeight: 300,
      scrollWidth: 400,
      clientWidth: 400,
    })

    handle.setScrollTop(699)

    const firstEmit = wrapper.emitted('end-reached')
    expect(firstEmit).toHaveLength(1)
    expect(firstEmit?.[0]?.[0]).toMatchObject({
      scrollTop: 699,
      maxScrollTop: 700,
      distanceToBottom: 1,
    })

    handle.setScrollTop(700)
    expect(wrapper.emitted('end-reached')).toHaveLength(1)

    handle.setScrollTop(100)
    handle.setScrollTop(700)
    expect(wrapper.emitted('end-reached')).toHaveLength(2)
  })

  it('renders an overlay vertical thumb when content overflows', async () => {
    const wrapper = mount(Scrollbar)
    const scroller = wrapper.find('.scrollbar-viewport').element as HTMLElement
    const handle = wrapper.vm as unknown as ScrollbarHandle
    mockGeometry(scroller, {
      scrollHeight: 1000,
      clientHeight: 300,
      scrollWidth: 400,
      clientWidth: 400,
    })

    handle.setScrollTop(100)
    await nextTick()

    expect(wrapper.find('.scrollbar-track-vertical').exists()).toBe(true)
    expect(wrapper.find('.scrollbar-thumb-vertical').attributes('style')).toContain('height: 90px')
  })

  it('emits scroll state for native scroll events', async () => {
    const wrapper = mount(Scrollbar, {
      props: {
        endReachedThreshold: 8,
      },
    })
    const scroller = wrapper.find('.scrollbar-viewport').element as HTMLElement
    mockGeometry(scroller, {
      scrollTop: 692,
      scrollHeight: 1000,
      clientHeight: 300,
      scrollWidth: 500,
      clientWidth: 300,
    })

    await wrapper.find('.scrollbar-viewport').trigger('scroll')

    expect(wrapper.emitted('scroll')).toHaveLength(1)
    expect(wrapper.emitted('end-reached')).toHaveLength(1)
    expect(wrapper.emitted('scroll')?.[0]?.[1]).toMatchObject({
      scrollTop: 692,
      maxScrollTop: 700,
      distanceToBottom: 8,
    })
  })
})
