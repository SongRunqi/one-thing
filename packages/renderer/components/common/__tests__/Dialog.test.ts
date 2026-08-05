// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import Dialog from '../Dialog.vue'

/**
 * Dialog owns four behaviours the sixteen hand-rolled dialogs each got slightly
 * differently: the Esc key, the overlay click, keeping Tab inside, and giving
 * focus back. Those are what this file pins.
 */

function pressEscape() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

function overlay() {
  return document.querySelector('.app-dialog-overlay') as HTMLElement | null
}

function mountDialog(props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
  return mount(Dialog, {
    props: { open: true, title: 'Ask', ...props },
    slots: { default: () => h('button', { class: 'inner' }, 'inner'), ...slots },
    attachTo: document.body,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Dialog', () => {
  it('renders into body with the modal stop and an accessible role', () => {
    const wrapper = mountDialog()
    const panel = document.querySelector('.app-dialog') as HTMLElement
    expect(panel).toBeTruthy()
    expect(panel.getAttribute('role')).toBe('dialog')
    expect(panel.getAttribute('aria-modal')).toBe('true')
    expect(overlay()!.style.zIndex).toBe('var(--z-modal)')
    wrapper.unmount()
  })

  it('closes on Escape and reports the reason', async () => {
    const wrapper = mountDialog()
    pressEscape()
    await nextTick()
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
    expect(wrapper.emitted('close')?.at(-1)).toEqual(['esc'])
    wrapper.unmount()
  })

  it('leaves Escape alone when closeOnEsc is off', async () => {
    const wrapper = mountDialog({ closeOnEsc: false })
    pressEscape()
    await nextTick()
    expect(wrapper.emitted('update:open')).toBeUndefined()
    wrapper.unmount()
  })

  it('only the topmost dialog answers Escape', async () => {
    const outer = mountDialog({ title: 'outer' })
    const inner = mountDialog({ title: 'inner' })
    pressEscape()
    await nextTick()
    expect(inner.emitted('close')?.at(-1)).toEqual(['esc'])
    expect(outer.emitted('close')).toBeUndefined()

    // With the top one gone, the next Escape belongs to the one underneath.
    inner.unmount()
    pressEscape()
    await nextTick()
    expect(outer.emitted('close')?.at(-1)).toEqual(['esc'])
    outer.unmount()
  })

  it('closes on an overlay click but not on a click inside the panel', async () => {
    const wrapper = mountDialog()
    ;(document.querySelector('.inner') as HTMLElement).click()
    await nextTick()
    expect(wrapper.emitted('update:open')).toBeUndefined()

    overlay()!.click()
    await nextTick()
    expect(wrapper.emitted('close')?.at(-1)).toEqual(['overlay'])
    wrapper.unmount()
  })

  it('ignores the overlay click when closeOnOverlay is off', async () => {
    const wrapper = mountDialog({ closeOnOverlay: false })
    overlay()!.click()
    await nextTick()
    expect(wrapper.emitted('update:open')).toBeUndefined()
    wrapper.unmount()
  })

  it('moves focus inside on open and hands it back on close', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    expect(document.activeElement).toBe(opener)

    const wrapper = mountDialog({ open: false })
    await wrapper.setProps({ open: true })
    await nextTick()
    await Promise.resolve()
    expect(document.activeElement).toBe(document.querySelector('.inner'))

    await wrapper.setProps({ open: false })
    await nextTick()
    expect(document.activeElement).toBe(opener)
    wrapper.unmount()
  })

  it('hands focus back when it disappears by unmounting rather than closing', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()

    const wrapper = mountDialog({ open: false })
    await wrapper.setProps({ open: true })
    await nextTick()
    await Promise.resolve()
    expect(document.activeElement).not.toBe(opener)

    wrapper.unmount()
    expect(document.activeElement).toBe(opener)
  })

  it('wraps Tab around the panel', async () => {
    const wrapper = mountDialog({}, {
      default: () => [
        h('button', { class: 'first' }, 'first'),
        h('button', { class: 'last' }, 'last'),
      ],
    })
    await nextTick()
    const first = document.querySelector('.first') as HTMLElement
    const last = document.querySelector('.last') as HTMLElement

    last.focus()
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    window.dispatchEvent(forward)
    expect(document.activeElement).toBe(first)

    const backward = new KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
    })
    window.dispatchEvent(backward)
    expect(document.activeElement).toBe(last)
    wrapper.unmount()
  })

  it('puts the caller style on the overlay so scrim variables actually land', () => {
    const wrapper = mountDialog({}, {})
    wrapper.unmount()

    const styled = mount(Dialog, {
      props: { open: true, title: 'Ask' },
      attrs: { style: { '--app-dialog-overlay-bg': 'rgb(1 2 3)' }, class: 'my-dialog' },
      attachTo: document.body,
    })
    // Custom property on the overlay (it inherits down); class on the panel.
    expect(overlay()!.style.getPropertyValue('--app-dialog-overlay-bg')).toBe('rgb(1 2 3)')
    expect(document.querySelector('.app-dialog')!.classList.contains('my-dialog')).toBe(true)
    styled.unmount()
  })

  it('renders no header bar when there is nothing to put in it', () => {
    const wrapper = mountDialog({ title: undefined })
    expect(document.querySelector('.app-dialog-header')).toBeNull()
    wrapper.unmount()
  })
})
