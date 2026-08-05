// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RoomCreateDialog from '../RoomCreateDialog.vue'

/**
 * P3 pilot cover for the create-room sheet: its roster went from bare native
 * checkboxes to `Checkbox.vue`, and the PM picker from a native `<select>` to
 * `Select.vue` (underline variant, `z-layer="modal"` so the panel beats the
 * sheet it lives in).
 *
 * This is a component test rather than a browser pass because the 通讯录 rail
 * category that opens this sheet is not reachable in the dev profile's sidebar,
 * and switching rail categories writes to the real settings store.
 */
const agents = [
  { id: 'pm', name: '阿明', title: '产品经理', isDefault: false },
  { id: 'fe', name: '小李', title: '前端工程师', isDefault: false },
]

vi.mock('@/stores/agents', () => ({
  useAgentsStore: () => ({
    colleagues: agents,
    loadAgents: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => ({ createCollabRoom: vi.fn() }),
}))
vi.mock('@/stores/workspace', () => ({
  useWorkspaceStore: () => ({ openSession: vi.fn() }),
}))

describe('RoomCreateDialog — P3 form controls', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('draws the roster with Checkbox and the PM picker with Select', async () => {
    const wrapper = mount(RoomCreateDialog, {
      props: { visible: true },
      attachTo: document.body,
    })
    await nextTick()

    // Teleported to body by Dialog, so query the document, not the wrapper.
    const roster = document.querySelectorAll('.app-checkbox.member-row')
    expect(roster).toHaveLength(2)
    expect(document.body.textContent).toContain('阿明')
    expect(document.body.textContent).toContain('前端工程师')

    // No native form controls survive in this sheet.
    expect(document.querySelector('select')).toBeNull()

    const pm = document.querySelector('[role="combobox"][aria-label="负责人"]')
    expect(pm).not.toBeNull()
    expect(pm?.textContent).toContain('无')

    wrapper.unmount()
  })

  it('ticking a roster Checkbox adds the agent to the PM options', async () => {
    const wrapper = mount(RoomCreateDialog, {
      props: { visible: true },
      attachTo: document.body,
    })
    await nextTick()

    const firstInput = document.querySelector<HTMLInputElement>('.app-checkbox.member-row input')!
    firstInput.checked = true
    firstInput.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()

    expect(document.querySelector('.app-checkbox.member-row')?.classList).toContain('is-checked')

    // The PM list is derived from the ticked members — open it and look.
    document.querySelector<HTMLElement>('[role="combobox"][aria-label="负责人"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    const panel = document.querySelector('.app-select-dropdown')
    expect(panel).not.toBeNull()
    expect(panel?.textContent).toContain('阿明 · 产品经理')
    expect(panel?.textContent).not.toContain('小李')

    wrapper.unmount()
  })
})
