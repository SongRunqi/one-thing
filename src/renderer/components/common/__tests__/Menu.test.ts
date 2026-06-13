// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Menu from '../Menu.vue'
import MenuItem from '../MenuItem.vue'
import MenuItemGroup from '../MenuItemGroup.vue'
import SubMenu from '../SubMenu.vue'

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Menu', () => {
  it('renders nested groups, tracks default active item, and emits select paths', async () => {
    const onSelect = vi.fn()
    const wrapper = mount(Menu, {
      props: {
        defaultActive: 'files',
        defaultOpeneds: ['workspace'],
        onSelect,
      },
      slots: {
        default: () => [
          h(SubMenu, { index: 'workspace', title: 'Workspace' }, {
            default: () => [
              h(MenuItemGroup, { title: 'Group One' }, {
                default: () => [
                  h(MenuItem, { index: 'files', title: 'Files' }),
                  h(MenuItem, { index: 'settings', title: 'Settings', route: '/settings' }),
                ],
              }),
            ],
          }),
          h(MenuItem, { index: 'orders', title: 'Orders' }),
        ],
      },
    })

    await settle()

    expect(wrapper.classes()).toContain('app-menu--vertical')
    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
    expect(wrapper.find('.app-menu-item-group-title').text()).toBe('Group One')
    expect(wrapper.find('[data-index="files"]').attributes('data-active')).toBe('true')

    await wrapper.find('[data-index="settings"]').trigger('click')
    await settle()

    expect(onSelect).toHaveBeenCalledWith(
      'settings',
      ['workspace', 'settings'],
      { index: 'settings', indexPath: ['workspace', 'settings'], route: '/settings' },
    )
    expect(wrapper.find('[data-index="settings"]').attributes('data-active')).toBe('true')
  })

  it('supports controlled active state through v-model style updates', async () => {
    const onUpdate = vi.fn()
    const wrapper = mount(Menu, {
      props: {
        modelValue: 'first',
        'onUpdate:modelValue': onUpdate,
      },
      slots: {
        default: () => [
          h(MenuItem, { index: 'first', title: 'First' }),
          h(MenuItem, { index: 'second', title: 'Second' }),
        ],
      },
    })

    await settle()
    await wrapper.find('[data-index="second"]').trigger('click')
    await settle()

    expect(onUpdate).toHaveBeenCalledWith('second')
    expect(wrapper.find('[data-index="first"]').attributes('data-active')).toBe('true')

    await wrapper.setProps({ modelValue: 'second' })
    await settle()

    expect(wrapper.find('[data-index="second"]').attributes('data-active')).toBe('true')
  })

  it('keeps only one submenu opened when unique-opened is enabled', async () => {
    const onOpen = vi.fn()
    const onClose = vi.fn()
    const wrapper = mount(Menu, {
      props: {
        defaultOpeneds: ['one'],
        uniqueOpened: true,
        onOpen,
        onClose,
      },
      slots: {
        default: () => [
          h(SubMenu, { index: 'one', title: 'One' }, {
            default: () => h(MenuItem, { index: 'one-child', title: 'One child' }),
          }),
          h(SubMenu, { index: 'two', title: 'Two' }, {
            default: () => h(MenuItem, { index: 'two-child', title: 'Two child' }),
          }),
        ],
      },
    })

    await settle()
    expect(wrapper.find('[data-index="one-child"]').exists()).toBe(true)

    await wrapper.find('[data-index="two"]').trigger('click')
    await settle()

    expect(wrapper.find('[data-index="one-child"]').exists()).toBe(false)
    expect(wrapper.find('[data-index="two-child"]').exists()).toBe(true)
    expect(onClose).toHaveBeenCalledWith('one', ['one'])
    expect(onOpen).toHaveBeenCalledWith('two', ['two'])
  })

  it('ignores disabled menu items and disabled submenus', async () => {
    const onSelect = vi.fn()
    const wrapper = mount(Menu, {
      props: {
        defaultActive: 'enabled',
        onSelect,
      },
      slots: {
        default: () => [
          h(MenuItem, { index: 'enabled', title: 'Enabled' }),
          h(MenuItem, { index: 'disabled-item', title: 'Disabled item', disabled: true }),
          h(SubMenu, { index: 'disabled-sub', title: 'Disabled sub', disabled: true }, {
            default: () => h(MenuItem, { index: 'hidden', title: 'Hidden' }),
          }),
        ],
      },
    })

    await settle()
    await wrapper.find('[data-index="disabled-item"]').trigger('click')
    await wrapper.find('[data-index="disabled-sub"]').trigger('click')
    await settle()

    expect(onSelect).not.toHaveBeenCalled()
    expect(wrapper.find('[data-index="enabled"]').attributes('data-active')).toBe('true')
    expect(wrapper.find('[data-index="hidden"]').exists()).toBe(false)
  })

  it('renders horizontal popper submenus and closes them on outside pointerdown', async () => {
    const wrapper = mount(Menu, {
      attachTo: document.body,
      props: {
        mode: 'horizontal',
        menuTrigger: 'click',
        closeOnClickOutside: true,
        popperOffset: 12,
      },
      slots: {
        default: () => [
          h(MenuItem, { index: 'home', title: 'Home' }),
          h(SubMenu, { index: 'workspace', title: 'Workspace' }, {
            default: () => h(MenuItem, { index: 'files', title: 'Files' }),
          }),
        ],
      },
    })

    await settle()

    expect(wrapper.classes()).toContain('app-menu--horizontal')
    expect(wrapper.attributes('role')).toBe('menubar')

    await wrapper.find('[data-index="workspace"]').trigger('click')
    await settle()

    const panel = wrapper.find('.app-sub-menu-panel.is-popper')
    expect(panel.exists()).toBe(true)
    expect(panel.attributes('style')).toContain('calc(100% + 12px)')

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await settle()

    expect(wrapper.find('.app-sub-menu-panel.is-popper').exists()).toBe(false)
  })

  it('exposes open, close, and updateActiveIndex methods', async () => {
    const wrapper = mount(Menu, {
      slots: {
        default: () => [
          h(SubMenu, { index: 'tools', title: 'Tools' }, {
            default: () => h(MenuItem, { index: 'search', title: 'Search' }),
          }),
        ],
      },
    })

    await settle()

    const menuVm = wrapper.vm as unknown as {
      open: (index: string) => void
      close: (index: string) => void
      updateActiveIndex: (index: string) => void
    }

    menuVm.open('tools')
    await settle()
    expect(wrapper.find('[data-index="search"]').exists()).toBe(true)

    menuVm.close('tools')
    await settle()
    expect(wrapper.find('[data-index="search"]').exists()).toBe(false)

    menuVm.updateActiveIndex('search')
    await settle()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['search'])
  })

  it('applies collapsed vertical menu classes', async () => {
    const wrapper = mount(defineComponent({
      components: { AppMenu: Menu, MenuItem, SubMenu },
      template: `
        <AppMenu collapse>
          <MenuItem index="home" title="Home" />
          <SubMenu index="more" title="More">
            <MenuItem index="more-one" title="More one" />
          </SubMenu>
        </AppMenu>
      `,
    }))

    await settle()

    expect(wrapper.find('.app-menu').classes()).toContain('app-menu--collapse')
    expect(wrapper.find('.app-menu-item-node').classes()).toContain('is-collapsed')
    expect(wrapper.find('.app-sub-menu').classes()).toContain('is-collapsed')
  })

  it('supports raw div menu items for complex interactive content', async () => {
    const onSelect = vi.fn()
    const wrapper = mount(Menu, {
      props: {
        defaultActive: 'session:one',
        onSelect,
      },
      slots: {
        default: () => h(MenuItem, { index: 'session:one', itemAs: 'div', raw: true }, {
          default: () => h('div', { class: 'session-row' }, [
            h('span', 'Session One'),
            h('button', {
              class: 'session-more',
              type: 'button',
              onClick: (event: MouseEvent) => event.stopPropagation(),
            }, 'More'),
          ]),
        }),
      },
    })

    await settle()

    const item = wrapper.find('[data-index="session:one"]')
    expect(item.element.tagName).toBe('DIV')
    expect(item.attributes('role')).toBe('menuitem')
    expect(item.attributes('data-active')).toBe('true')
    expect(wrapper.find('.session-row').exists()).toBe(true)
    expect(wrapper.find('.app-menu-item-label').exists()).toBe(false)

    await wrapper.find('.session-more').trigger('click')
    await settle()
    expect(onSelect).not.toHaveBeenCalled()

    await item.trigger('keydown', { key: 'Enter' })
    await settle()
    expect(onSelect).toHaveBeenCalledWith(
      'session:one',
      ['session:one'],
      { index: 'session:one', indexPath: ['session:one'], route: undefined },
    )
  })
})
