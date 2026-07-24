// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'
import Timeline from '../Timeline.vue'
import TimelineItem from '../TimelineItem.vue'
import {
  normalizeTimelineItemSize,
  normalizeTimelineMode,
  normalizeTimelinePlacement,
} from '../timeline'

const TestIcon = defineComponent({
  name: 'TestIcon',
  setup() {
    return () => h('svg', { class: 'test-icon', viewBox: '0 0 16 16' })
  },
})

describe('Timeline', () => {
  it('renders timeline items in reverse order and provides mode to items', () => {
    const wrapper = mount(Timeline, {
      props: {
        mode: 'alternate',
        reverse: true,
      },
      slots: {
        default: () => [
          h(TimelineItem, { timestamp: '2018-04-15' }, { default: () => 'Event start' }),
          h(TimelineItem, { timestamp: '2018-04-13' }, { default: () => 'Approved' }),
          h(TimelineItem, { timestamp: '2018-04-11' }, { default: () => 'Success' }),
        ],
      },
    })

    expect(wrapper.classes()).toContain('app-timeline')
    expect(wrapper.classes()).toContain('app-timeline--mode-alternate')
    expect(wrapper.classes()).toContain('is-reverse')

    const items = wrapper.findAll('.app-timeline-item')
    expect(items).toHaveLength(3)
    expect(items.map(item => item.find('.app-timeline-item__body').text())).toEqual([
      'Success',
      'Approved',
      'Event start',
    ])
    expect(items.every(item => item.classes().includes('app-timeline-item--mode-alternate'))).toBe(true)
  })

  it('renders custom node styling, icon nodes, hollow state, and top timestamps', () => {
    const wrapper = mount(TimelineItem, {
      props: {
        timestamp: '2018/4/12',
        placement: 'top',
        type: 'primary',
        color: '#0bbd87',
        size: 'large',
        icon: TestIcon,
        hollow: true,
        center: true,
      },
      slots: {
        default: 'Update Github template',
      },
    })

    expect(wrapper.classes()).toContain('app-timeline-item--mode-start')
    expect(wrapper.classes()).toContain('app-timeline-item--placement-top')
    expect(wrapper.classes()).toContain('app-timeline-item--size-large')
    expect(wrapper.classes()).toContain('app-timeline-item--primary')
    expect(wrapper.classes()).toContain('is-hollow')
    expect(wrapper.classes()).toContain('is-center')
    expect(wrapper.classes()).toContain('has-icon')
    expect(wrapper.attributes('style')).toContain('--app-timeline-node-size: 16px')
    expect(wrapper.attributes('style')).toContain('--app-timeline-node-color: #0bbd87')
    expect(wrapper.find('.test-icon').exists()).toBe(true)

    const contentChildren = Array.from(wrapper.find('.app-timeline-item__content').element.children)
    expect(contentChildren[0]).toBe(wrapper.find('.app-timeline-item__timestamp--top').element)
    expect(wrapper.find('.app-timeline-item__timestamp--top').text()).toBe('2018/4/12')
    expect(wrapper.find('.app-timeline-item__body').text()).toBe('Update Github template')
  })

  it('supports hidden timestamps and fully custom dot slots', () => {
    const wrapper = mount(Timeline, {
      props: {
        mode: 'end',
      },
      slots: {
        default: () => [
          h(TimelineItem, { timestamp: '2018-04-03', hideTimestamp: true }, {
            default: () => 'Custom node',
            dot: () => h('span', { class: 'custom-dot' }, '!'),
          }),
        ],
      },
    })

    const item = wrapper.find('.app-timeline-item')
    expect(item.classes()).toContain('app-timeline-item--mode-end')
    expect(item.classes()).toContain('has-dot-slot')
    expect(wrapper.find('.custom-dot').text()).toBe('!')
    expect(wrapper.find('.app-timeline-item__timestamp').exists()).toBe(false)
  })

  it('normalizes timeline prop values for defensive rendering', () => {
    expect(normalizeTimelineMode('start')).toBe('start')
    expect(normalizeTimelineMode('alternate-reverse')).toBe('alternate-reverse')
    expect(normalizeTimelineMode('invalid')).toBe('start')
    expect(normalizeTimelinePlacement('top')).toBe('top')
    expect(normalizeTimelinePlacement('left')).toBe('bottom')
    expect(normalizeTimelineItemSize('normal')).toBe('12px')
    expect(normalizeTimelineItemSize('large')).toBe('16px')
    expect(normalizeTimelineItemSize(18)).toBe('18px')
    expect(normalizeTimelineItemSize('20')).toBe('20px')
    expect(normalizeTimelineItemSize('2rem')).toBe('2rem')
  })
})
