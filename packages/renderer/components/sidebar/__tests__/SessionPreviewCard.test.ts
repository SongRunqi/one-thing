// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SessionPreviewCard from '../SessionPreviewCard.vue'
import type { SessionSegment } from '@/types'

function segment(overrides: Partial<SessionSegment> & { id: string }): SessionSegment {
  return {
    origin: 'inferred',
    kind: 'task',
    title: 'Did a thing',
    detail: '',
    files: [],
    startedAt: 0,
    turnCount: 1,
    revision: 0,
    ...overrides,
  }
}

describe('SessionPreviewCard', () => {
  it('falls back to the first-message preview when there are no segments', () => {
    // Short and brand-new sessions are the common case; an empty card would
    // be a regression against the plain tooltip it replaces.
    const wrapper = mount(SessionPreviewCard, {
      props: { sessionName: 'Some chat', segments: [], fallbackText: 'help me with X' },
    })

    expect(wrapper.text()).toContain('help me with X')
  })

  it('says so plainly when there is nothing at all', () => {
    const wrapper = mount(SessionPreviewCard, { props: { segments: [] } })
    expect(wrapper.text()).toContain('No activity yet')
  })

  it('renders title, detail and file basenames', () => {
    const wrapper = mount(SessionPreviewCard, {
      props: {
        segments: [segment({
          id: 's1',
          title: 'Fix rename swallowing spaces',
          detail: 'MenuItem ate the key as a menu activation.',
          files: [
            { path: 'src/renderer/components/common/MenuItem.vue', added: 3, removed: 1 },
            { path: 'src/renderer/utils/editable-target.ts', added: 20, removed: 0 },
          ],
        })],
      },
    })

    const text = wrapper.text()
    expect(text).toContain('Fix rename swallowing spaces')
    expect(text).toContain('MenuItem ate the key')
    // Basenames only — full paths blow the card width and add nothing.
    expect(text).toContain('MenuItem.vue')
    expect(text).not.toContain('src/renderer/components/common')
  })

  it('marks a discussion-only stretch instead of showing an empty file line', () => {
    const wrapper = mount(SessionPreviewCard, {
      props: { segments: [segment({ id: 's1', kind: 'question', files: [] })] },
    })
    expect(wrapper.text()).toContain('discussion only')
  })

  it('shows an outcome only where one exists', () => {
    const wrapper = mount(SessionPreviewCard, {
      props: {
        segments: [
          segment({ id: 'g1', origin: 'goal', goalId: 'g1', outcome: 'blocked' }),
          segment({ id: 's2' }),
        ],
      },
    })

    expect(wrapper.text()).toContain('blocked')
    expect(wrapper.findAll('.item-outcome')).toHaveLength(1)
  })

  it('distinguishes goal-backed segments, which are fact rather than inference', () => {
    const wrapper = mount(SessionPreviewCard, {
      props: {
        segments: [
          segment({ id: 'g1', origin: 'goal', goalId: 'g1' }),
          segment({ id: 's2' }),
        ],
      },
    })

    expect(wrapper.findAll('.segment-item.is-goal')).toHaveLength(1)
  })

  it('keeps the most recent segments and counts the rest', () => {
    const segments = Array.from({ length: 9 }, (_, i) =>
      segment({ id: `s${i}`, title: `Segment ${i}` }))

    const wrapper = mount(SessionPreviewCard, { props: { segments, maxItems: 6 } })

    const text = wrapper.text()
    expect(text).toContain('Segment 8')
    expect(text).not.toContain('Segment 0')
    expect(text).toContain('+3 more')
  })

  it('truncates a long file list rather than wrapping forever', () => {
    const wrapper = mount(SessionPreviewCard, {
      props: {
        segments: [segment({
          id: 's1',
          files: Array.from({ length: 9 }, (_, i) => ({ path: `f${i}.ts`, added: 1, removed: 0 })),
        })],
      },
    })

    expect(wrapper.text()).toContain('+5')
  })
})
