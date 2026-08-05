// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { confirm, confirmStack, notice } from '@/composables/useConfirm'
import { destroyUiOverlayHost } from '@/services/ui-overlay-host'

/**
 * The contract that lets `if (await confirm(…))` stand in for
 * `if (confirm(…))`: every request settles exactly once, with the right value,
 * no matter which of the four exits the user takes.
 *
 * No host is mounted here on purpose — `confirm()` self-mounts one
 * (services/ui-overlay-host), and that wiring is part of what must work for a
 * call from a plain `.ts` module to put anything on screen.
 */

function buttons() {
  return Array.from(document.querySelectorAll('.app-dialog-actions button')) as HTMLElement[]
}

function escape() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

afterEach(() => {
  confirmStack.value = []
  destroyUiOverlayHost()
  document.body.innerHTML = ''
})

describe('useConfirm', () => {
  it('resolves true when the confirm button is pressed', async () => {
    const answer = confirm({ title: 'Delete', message: 'Sure?' })
    await nextTick()

    const [cancel, ok] = buttons()
    expect(cancel.textContent?.trim()).toBe('Cancel')
    expect(ok.textContent?.trim()).toBe('Confirm')
    ok.click()

    await expect(answer).resolves.toBe(true)
    expect(confirmStack.value).toHaveLength(0)
  })

  it('resolves false on cancel and on Escape', async () => {
    const cancelled = confirm({ message: 'Sure?' })
    await nextTick()
    buttons()[0].click()
    await expect(cancelled).resolves.toBe(false)

    const escaped = confirm({ message: 'Sure again?' })
    await nextTick()
    escape()
    await expect(escaped).resolves.toBe(false)
  })

  it('honours custom labels and the danger styling', async () => {
    const answer = confirm({ message: 'Drop it', danger: true, confirmText: 'Drop', cancelText: 'Keep' })
    await nextTick()

    const [cancel, ok] = buttons()
    expect(cancel.textContent?.trim()).toBe('Keep')
    expect(ok.textContent?.trim()).toBe('Drop')
    expect(ok.classList.contains('danger')).toBe(true)
    expect(document.querySelector('.app-dialog')!.classList.contains('is-danger')).toBe(true)

    ok.click()
    await expect(answer).resolves.toBe(true)
  })

  it('a notice has one button and always resolves true', async () => {
    const answer = notice({ title: 'Saved', message: 'All good' })
    await nextTick()

    const actions = buttons()
    expect(actions).toHaveLength(1)
    expect(actions[0].textContent?.trim()).toBe('OK')
    actions[0].click()
    await expect(answer).resolves.toBe(true)
  })

  it('a notice dismissed by Escape still resolves true', async () => {
    const answer = notice({ message: 'Heads up' })
    await nextTick()
    escape()
    await expect(answer).resolves.toBe(true)
  })

  it('stacks nested asks and settles each on its own', async () => {
    const outer = confirm({ message: 'outer' })
    const inner = confirm({ message: 'inner' })
    await nextTick()

    expect(confirmStack.value).toHaveLength(2)
    const panels = document.querySelectorAll('.app-dialog')
    expect(panels).toHaveLength(2)

    // Escape belongs to the top one only.
    escape()
    await expect(inner).resolves.toBe(false)
    await nextTick()
    expect(confirmStack.value).toHaveLength(1)

    buttons()[1].click()
    await expect(outer).resolves.toBe(true)
  })

  /**
   * The P2 regression this pins: a paper confirm must NOT carry the global
   * `.btn` classes. Sharing that name puts a scoped `.btn` at the same
   * specificity as the global `.btn.primary`, and the winner then depends on
   * stylesheet injection order — which is how "Add Server" ended up as accent
   * text on an accent block.
   */
  it('uses the namespaced ledger button in the paper variant, never global .btn', async () => {
    const answer = confirm({ message: 'Drop it', danger: true, variant: 'paper' })
    await nextTick()

    const [cancel, ok] = buttons()
    for (const button of [cancel, ok]) {
      expect(button.classList.contains('app-dialog-text-btn')).toBe(true)
      expect(button.classList.contains('btn')).toBe(false)
    }
    expect(ok.classList.contains('is-danger')).toBe(true)

    ok.click()
    await expect(answer).resolves.toBe(true)
  })

  it('accepts a bare string as the message', async () => {
    const answer = confirm('just checking')
    await nextTick()
    expect(document.querySelector('.app-dialog-message')?.textContent?.trim()).toBe('just checking')
    buttons()[1].click()
    await expect(answer).resolves.toBe(true)
  })
})
