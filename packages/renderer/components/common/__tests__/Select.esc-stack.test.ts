// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import Dialog from '../Dialog.vue'
import Select from '../Select.vue'

/**
 * P3 regression guard. A `Select` panel opened inside a `Dialog` is a layer
 * ABOVE that dialog, so Escape must close the panel and leave the sheet up.
 *
 * The mechanism is not obvious and is easy to undo by accident: both listeners
 * live on `window` in the capture phase, where registration order decides who
 * runs first — and the dialog always registers first. `stopPropagation` from
 * the panel therefore arrives too late. `composables/floating/esc-stack` is
 * what makes the dialog stand down; delete the token push in Select and this
 * test is the only thing that notices.
 */
const Harness = defineComponent({
  setup() {
    const open = ref(true)
    const mode = ref('parallel')
    return { open, mode }
  },
  render() {
    return h(Dialog, {
      'open': this.open,
      'title': 'Room settings',
      'onUpdate:open': (value: boolean) => { this.open = value },
    }, () => [
      h(Select, {
        'modelValue': this.mode,
        'teleported': true,
        'zLayer': 'modal',
        'ariaLabel': 'response mode',
        'options': [
          { value: 'parallel', label: 'Parallel' },
          { value: 'serial', label: 'Serial' },
        ],
        'onUpdate:modelValue': (value: unknown) => { this.mode = value as string },
      }),
    ])
  },
})

/** Both layers are teleported to `body`, so the wrapper's subtree is empty. */
function openPanel() {
  const control = document.querySelector<HTMLElement>('[role="combobox"][aria-label="response mode"]')
  if (!control) throw new Error('select control not rendered')
  control.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

function pressEscape() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
}

describe('Select inside Dialog — Escape arbitration', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('closes the panel first and the dialog only on the second Escape', async () => {
    const wrapper = mount(Harness, { attachTo: document.body })
    await nextTick()

    expect(document.querySelector('.app-dialog')).not.toBeNull()

    openPanel()
    await nextTick()
    expect(document.querySelector('.app-select-dropdown')).not.toBeNull()

    pressEscape()
    await nextTick()
    expect(document.querySelector('.app-select-dropdown')).toBeNull()
    expect(document.querySelector('.app-dialog')).not.toBeNull()

    pressEscape()
    await nextTick()
    expect(wrapper.vm.open).toBe(false)

    wrapper.unmount()
  })

  it('gives Escape back to the dialog after the select unmounts while open', async () => {
    const wrapper = mount(Harness, { attachTo: document.body })
    await nextTick()

    openPanel()
    await nextTick()
    expect(document.querySelector('.app-select-dropdown')).not.toBeNull()

    // Tearing the tree down with the panel up must not wedge the token on the
    // stack — that would make Escape dead for every dialog afterwards.
    wrapper.unmount()

    const second = mount(Harness, { attachTo: document.body })
    await nextTick()
    pressEscape()
    await nextTick()
    expect(second.vm.open).toBe(false)

    second.unmount()
  })
})
