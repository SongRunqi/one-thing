// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import Tooltip from '../Tooltip.vue'
import { resetInteractiveTooltipRegistry } from '../interactive-tooltip-registry.js'

/**
 * The point of `interactive`: a pointer can travel from the trigger to the
 * tooltip and read it, instead of the tooltip vanishing the moment the pointer
 * leaves the trigger. Travel is protected by the safe triangle.
 */

// Trigger on the left, tooltip panel to its right.
const TRIGGER_RECT = { top: 200, bottom: 240, left: 0, right: 200, width: 200, height: 40 }
const PANEL_RECT = { top: 180, bottom: 480, left: 300, right: 620, width: 320, height: 300 }

function stubRects() {
  // happy-dom reports zeroes for layout; the geometry is the thing under test,
  // so both boxes are stubbed to a realistic sidebar arrangement.
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const rect = this.classList.contains('tooltip') ? PANEL_RECT : TRIGGER_RECT
    return { ...rect, x: rect.left, y: rect.top, toJSON: () => rect } as DOMRect
  }
}

function mountTooltip(props: Record<string, unknown> = {}) {
  return mount(Tooltip, {
    props: { position: 'right', delay: 0, interactive: true, ...props },
    slots: {
      default: () => h('span', 'trigger'),
      content: () => h('div', { class: 'rich' }, 'panel body'),
    },
    attachTo: document.body,
  })
}

function move(x: number, y: number) {
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }))
}

async function open(wrapper: ReturnType<typeof mountTooltip>) {
  await wrapper.find('.tooltip-wrapper').trigger('mouseenter')
  await vi.advanceTimersByTimeAsync(10)
  await nextTick()
}

function panelVisible(): boolean {
  return document.body.querySelector('.tooltip') !== null
}

let originalGetRect: typeof Element.prototype.getBoundingClientRect

beforeEach(() => {
  vi.useFakeTimers()
  originalGetRect = Element.prototype.getBoundingClientRect
  stubRects()
  // Module-level state shared by every instance: without this, tooltips left
  // mounted by an earlier test still count as "another trigger". The stub
  // gives them all the same rect, so any leftover would sit under the pointer.
  resetInteractiveTooltipRegistry()
})

afterEach(() => {
  Element.prototype.getBoundingClientRect = originalGetRect
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('Tooltip interactive travel', () => {
  it('stays open while the pointer heads toward the panel', async () => {
    const wrapper = mountTooltip()
    await open(wrapper)
    expect(panelVisible()).toBe(true)

    await wrapper.find('.tooltip-wrapper').trigger('mouseleave', { clientX: 190, clientY: 220 })
    // Diagonally across the gap — the exact path plain mouseleave would break.
    move(250, 300)
    await nextTick()

    expect(panelVisible()).toBe(true)
  })

  it('closes at once when the pointer goes somewhere else', async () => {
    const wrapper = mountTooltip()
    await open(wrapper)

    await wrapper.find('.tooltip-wrapper').trigger('mouseleave', { clientX: 190, clientY: 220 })
    // Straight down the sidebar: scanning other rows, not travelling.
    move(100, 700)
    await nextTick()

    expect(panelVisible()).toBe(false)
  })

  it('closes if the pointer stalls in the triangle without arriving', async () => {
    const wrapper = mountTooltip()
    await open(wrapper)

    await wrapper.find('.tooltip-wrapper').trigger('mouseleave', { clientX: 190, clientY: 220 })
    move(250, 300)
    await vi.advanceTimersByTimeAsync(1000)
    await nextTick()

    expect(panelVisible()).toBe(false)
  })

  it('keeps the panel up once the pointer is inside it', async () => {
    const wrapper = mountTooltip()
    await open(wrapper)

    await wrapper.find('.tooltip-wrapper').trigger('mouseleave', { clientX: 190, clientY: 220 })
    move(400, 300)
    await nextTick()

    // Arrived: the travel grace must no longer be able to close it.
    await vi.advanceTimersByTimeAsync(5000)
    await nextTick()
    expect(panelVisible()).toBe(true)
  })

  it('stays open for as long as the journey takes, not a fixed deadline', async () => {
    // The travel grace measures stalling, not elapsed time. A pointer that keeps
    // closing on the panel must survive well past a single grace period —
    // otherwise the safe triangle only helps users who move fast.
    const wrapper = mountTooltip()
    await open(wrapper)

    await wrapper.find('.tooltip-wrapper').trigger('mouseleave', { clientX: 190, clientY: 220 })
    for (const [x, y] of [[220, 240], [250, 260], [280, 280]]) {
      move(x, y)
      await vi.advanceTimersByTimeAsync(300)
      await nextTick()
    }

    // ~900ms of unhurried travel, every step inside the wedge.
    expect(panelVisible()).toBe(true)
  })

  it('closes when the pointer leaves the panel and keeps going', async () => {
    const wrapper = mountTooltip()
    await open(wrapper)
    await wrapper.find('.tooltip-wrapper').trigger('mouseleave', { clientX: 190, clientY: 220 })
    move(400, 300)
    await nextTick()

    const panel = document.body.querySelector('.tooltip')!
    panel.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))
    move(900, 300)
    await nextTick()

    expect(panelVisible()).toBe(false)
  })

  it('closes after leaving the panel even with no further mousemove', async () => {
    const wrapper = mountTooltip()
    await open(wrapper)
    await wrapper.find('.tooltip-wrapper').trigger('mouseleave', { clientX: 190, clientY: 220 })
    move(400, 300)
    await nextTick()

    document.body.querySelector('.tooltip')!
      .dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))
    await vi.advanceTimersByTimeAsync(500)
    await nextTick()

    expect(panelVisible()).toBe(false)
  })

  it('survives a pointer that merely clips the panel edge', async () => {
    // Sub-pixel layout puts the cursor "outside" while it visually sits on the
    // border; closing there reads as the panel flinching away from the pointer.
    const wrapper = mountTooltip()
    await open(wrapper)
    await wrapper.find('.tooltip-wrapper').trigger('mouseleave', { clientX: 190, clientY: 220 })
    move(400, 300)
    await nextTick()

    document.body.querySelector('.tooltip')!
      .dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }))
    // A few pixels past the right edge (620), still within the halo.
    move(625, 300)
    await vi.advanceTimersByTimeAsync(2000)
    await nextTick()

    expect(panelVisible()).toBe(true)
  })

  it('is hit-testable only when interactive', async () => {
    const plain = mountTooltip({ interactive: false })
    await open(plain)
    expect(document.body.querySelector('.tooltip')?.classList.contains('tooltip-interactive'))
      .toBe(false)
    plain.unmount()
    document.body.innerHTML = ''

    const rich = mountTooltip()
    await open(rich)
    expect(document.body.querySelector('.tooltip')?.classList.contains('tooltip-interactive'))
      .toBe(true)
  })

  it('closes immediately on leave when not interactive', async () => {
    const wrapper = mountTooltip({ interactive: false })
    await open(wrapper)

    await wrapper.find('.tooltip-wrapper').trigger('mouseleave', { clientX: 190, clientY: 220 })
    await nextTick()

    expect(panelVisible()).toBe(false)
  })
})

describe('Tooltip external trigger', () => {
  it('opens from the trigger element, not from the wrapped content', async () => {
    const trigger = document.createElement('div')
    document.body.appendChild(trigger)

    const wrapper = mount(Tooltip, {
      props: { position: 'right', delay: 0, interactive: true, triggerEl: trigger },
      slots: { content: () => h('div', { class: 'rich' }, 'panel body') },
      attachTo: document.body,
    })
    await nextTick()

    trigger.dispatchEvent(new MouseEvent('mouseenter'))
    await vi.advanceTimersByTimeAsync(10)
    await nextTick()

    expect(panelVisible()).toBe(true)
    wrapper.unmount()
  })

  it('renders no box of its own, so it cannot take a slot in the parent row', async () => {
    // An empty inline-flex wrapper would still occupy a flex item and pick up
    // the row's gap, shifting everything beside it.
    const trigger = document.createElement('div')
    document.body.appendChild(trigger)

    const wrapper = mount(Tooltip, {
      props: { delay: 0, triggerEl: trigger },
      slots: { content: () => h('div', 'body') },
    })
    await nextTick()

    expect(wrapper.find('.tooltip-wrapper').classes()).toContain('tooltip-wrapper-detached')
    wrapper.unmount()
  })

  it('stops listening once unmounted', async () => {
    const trigger = document.createElement('div')
    document.body.appendChild(trigger)

    const wrapper = mount(Tooltip, {
      props: { delay: 0, triggerEl: trigger },
      slots: { content: () => h('div', 'body') },
      attachTo: document.body,
    })
    await nextTick()
    wrapper.unmount()
    document.body.innerHTML = ''

    trigger.dispatchEvent(new MouseEvent('mouseenter'))
    await vi.advanceTimersByTimeAsync(50)

    expect(panelVisible()).toBe(false)
  })

  it('does not open while disabled, so renaming is not covered by the panel', async () => {
    const trigger = document.createElement('div')
    document.body.appendChild(trigger)

    const wrapper = mount(Tooltip, {
      props: { delay: 0, triggerEl: trigger, disabled: true },
      slots: { content: () => h('div', 'body') },
      attachTo: document.body,
    })
    await nextTick()

    trigger.dispatchEvent(new MouseEvent('mouseenter'))
    await vi.advanceTimersByTimeAsync(50)
    await nextTick()

    expect(panelVisible()).toBe(false)
    wrapper.unmount()
  })
})

describe('Tooltip mutual exclusion between sibling rows', () => {
  // Two sidebar rows stacked vertically, panel opens to the right. The lower
  // row sits inside the wedge drawn from the upper one — the exact arrangement
  // that put two panels on screen at once.
  const ROW_A = { top: 200, bottom: 240, left: 0, right: 200 }
  // Deliberately placed INSIDE the wedge drawn from row A toward the panel.
  // Putting it where a real sidebar row sits (x≈0–200) would let the geometry
  // check alone close panel A, and the test would pass with or without the
  // mutual-exclusion rule — proving nothing about it.
  const ROW_B = { top: 280, bottom: 320, left: 220, right: 290 }
  const PANEL = { top: 180, bottom: 480, left: 300, right: 620 }

  function rectFor(el: Element): DOMRect {
    const box = el.classList.contains('tooltip')
      ? PANEL
      : el.getAttribute('data-row') === 'b'
        ? ROW_B
        : ROW_A
    return {
      ...box,
      width: box.right - box.left,
      height: box.bottom - box.top,
      x: box.left,
      y: box.top,
      toJSON: () => box,
    } as DOMRect
  }

  function mountRow(row: 'a' | 'b') {
    const trigger = document.createElement('div')
    trigger.setAttribute('data-row', row)
    document.body.appendChild(trigger)

    const wrapper = mount(Tooltip, {
      props: { position: 'right', delay: 0, interactive: true, triggerEl: trigger },
      slots: { content: () => h('div', { class: `panel-${row}` }, `panel ${row}`) },
      attachTo: document.body,
    })
    return { trigger, wrapper }
  }

  beforeEach(() => {
    resetInteractiveTooltipRegistry()
    Element.prototype.getBoundingClientRect = function (this: Element) {
      return rectFor(this)
    }
  })

  it('drops the first panel as soon as the pointer reaches the next row', async () => {
    const a = mountRow('a')
    const b = mountRow('b')
    await nextTick()

    a.trigger.dispatchEvent(new MouseEvent('mouseenter'))
    await vi.advanceTimersByTimeAsync(10)
    await nextTick()
    expect(document.body.querySelector('.panel-a')).not.toBeNull()

    // Leave row A heading right-ish, then land on row B — which is inside the
    // wedge, so the wedge alone would keep panel A alive.
    a.trigger.dispatchEvent(new MouseEvent('mouseleave', { clientX: 190, clientY: 235 }))
    // (250, 300) is inside the wedge — travel logic alone would keep panel A
    // open — but it is also on row B's trigger, which must win.
    move(250, 300)
    await nextTick()

    expect(document.body.querySelector('.panel-a')).toBeNull()

    a.wrapper.unmount()
    b.wrapper.unmount()
  })

  it('never shows two panels at once', async () => {
    const a = mountRow('a')
    const b = mountRow('b')
    await nextTick()

    a.trigger.dispatchEvent(new MouseEvent('mouseenter'))
    await vi.advanceTimersByTimeAsync(10)
    await nextTick()

    b.trigger.dispatchEvent(new MouseEvent('mouseenter'))
    await vi.advanceTimersByTimeAsync(10)
    await nextTick()

    expect(document.body.querySelectorAll('.tooltip')).toHaveLength(1)
    expect(document.body.querySelector('.panel-b')).not.toBeNull()

    a.wrapper.unmount()
    b.wrapper.unmount()
  })

  it('still protects travel toward the panel itself', async () => {
    // The mutual-exclusion rule must not undo the original fix.
    const a = mountRow('a')
    await nextTick()

    a.trigger.dispatchEvent(new MouseEvent('mouseenter'))
    await vi.advanceTimersByTimeAsync(10)
    await nextTick()

    a.trigger.dispatchEvent(new MouseEvent('mouseleave', { clientX: 190, clientY: 220 }))
    move(260, 300)
    await nextTick()

    expect(document.body.querySelector('.panel-a')).not.toBeNull()
    a.wrapper.unmount()
  })
})

describe('Tooltip leaving via an external trigger (the sidebar path)', () => {
  // The sidebar drives Tooltip through `triggerEl`, not the wrapper slot.
  // Every travel test above used the wrapper, so this path was untested.
  const ROW = { top: 200, bottom: 240, left: 0, right: 200 }
  const PANEL = { top: 180, bottom: 480, left: 300, right: 620 }

  function mountRow() {
    const trigger = document.createElement('div')
    trigger.setAttribute('data-role', 'row')
    document.body.appendChild(trigger)

    Element.prototype.getBoundingClientRect = function (this: Element) {
      const box = this.classList.contains('tooltip') ? PANEL : ROW
      return {
        ...box,
        width: box.right - box.left,
        height: box.bottom - box.top,
        x: box.left,
        y: box.top,
        toJSON: () => box,
      } as DOMRect
    }

    const wrapper = mount(Tooltip, {
      props: { position: 'right', delay: 0, interactive: true, triggerEl: trigger },
      slots: { content: () => h('div', { class: 'panel' }, 'body') },
      attachTo: document.body,
    })
    return { trigger, wrapper }
  }

  beforeEach(() => {
    resetInteractiveTooltipRegistry()
  })

  it('closes when the pointer slides down and away into empty space', async () => {
    const { trigger, wrapper } = mountRow()
    await nextTick()

    trigger.dispatchEvent(new MouseEvent('mouseenter'))
    await vi.advanceTimersByTimeAsync(10)
    await nextTick()
    expect(panelVisible()).toBe(true)

    // Leave downward out of the row, then keep going into blank area below the
    // list — nowhere near the panel, not on any other trigger.
    trigger.dispatchEvent(new MouseEvent('mouseleave', { clientX: 100, clientY: 241 }))
    move(100, 400)
    await nextTick()
    move(100, 700)
    await nextTick()

    expect(panelVisible()).toBe(false)
    wrapper.unmount()
  })

  it('closes when the pointer leaves without any further mousemove', async () => {
    const { trigger, wrapper } = mountRow()
    await nextTick()

    trigger.dispatchEvent(new MouseEvent('mouseenter'))
    await vi.advanceTimersByTimeAsync(10)
    await nextTick()

    // A flick out with no follow-up move: only the grace timer can save it.
    trigger.dispatchEvent(new MouseEvent('mouseleave', { clientX: 100, clientY: 241 }))
    await vi.advanceTimersByTimeAsync(1000)
    await nextTick()

    expect(panelVisible()).toBe(false)
    wrapper.unmount()
  })
})
