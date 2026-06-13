// @vitest-environment happy-dom
/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import TabPane from '../TabPane.vue'
import Tabs from '../Tabs.vue'

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('Tabs', () => {
  it('selects the first enabled tab by default and switches panes', async () => {
    const wrapper = mount(defineComponent({
      components: { Tabs, TabPane },
      template: `
        <Tabs>
          <TabPane label="User" name="user">User content</TabPane>
          <TabPane label="Config" name="config">Config content</TabPane>
        </Tabs>
      `,
    }))

    await settle()

    expect(wrapper.find('.app-tabs').classes()).toContain('app-tabs--line')
    expect(wrapper.findAll('[role="tab"]')[0].attributes('aria-selected')).toBe('true')
    expect(wrapper.find('.app-tab-pane.is-active').text()).toBe('User content')

    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    await settle()

    expect(wrapper.findAll('[role="tab"]')[1].attributes('aria-selected')).toBe('true')
    expect(wrapper.find('.app-tab-pane.is-active').text()).toBe('Config content')
  })

  it('supports v-model updates and emits tab-click and tab-change events', async () => {
    const onUpdate = vi.fn()
    const onTabClick = vi.fn()
    const onTabChange = vi.fn()
    const wrapper = mount(Tabs, {
      props: {
        modelValue: 'first',
        'onUpdate:modelValue': onUpdate,
        onTabClick,
        onTabChange,
      },
      slots: {
        default: [
          h(TabPane, { label: 'First', name: 'first' }, () => 'First'),
          h(TabPane, { label: 'Second', name: 'second' }, () => 'Second'),
        ],
      },
    })

    await settle()
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    await settle()

    expect(onTabClick).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith('second')
    expect(onTabChange).toHaveBeenCalledWith('second')
    expect(wrapper.findAll('[role="tab"]')[0].attributes('aria-selected')).toBe('true')

    await wrapper.setProps({ modelValue: 'second' })
    await settle()

    expect(wrapper.findAll('[role="tab"]')[1].attributes('aria-selected')).toBe('true')
  })

  it('honors default-value without requiring a controlled model', async () => {
    const wrapper = mount(Tabs, {
      props: {
        defaultValue: 'third',
      },
      slots: {
        default: [
          h(TabPane, { label: 'User', name: 'first' }, () => 'User'),
          h(TabPane, { label: 'Role', name: 'third' }, () => 'Role'),
        ],
      },
    })

    await settle()

    expect(wrapper.findAll('[role="tab"]')[1].attributes('aria-selected')).toBe('true')
    expect(wrapper.find('.app-tab-pane.is-active').text()).toBe('Role')
  })

  it('skips disabled tabs and prevents before-leave failures', async () => {
    const beforeLeave = vi.fn(() => false)
    const wrapper = mount(Tabs, {
      props: {
        beforeLeave,
      },
      slots: {
        default: [
          h(TabPane, { label: 'First', name: 'first' }, () => 'First'),
          h(TabPane, { label: 'Disabled', name: 'disabled', disabled: true }, () => 'Disabled'),
          h(TabPane, { label: 'Second', name: 'second' }, () => 'Second'),
        ],
      },
    })

    await settle()
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    await settle()

    expect(beforeLeave).not.toHaveBeenCalled()
    expect(wrapper.find('.app-tab-pane.is-active').text()).toBe('First')

    await wrapper.findAll('[role="tab"]')[2].trigger('click')
    await settle()

    expect(beforeLeave).toHaveBeenCalledWith('second', 'first')
    expect(wrapper.find('.app-tab-pane.is-active').text()).toBe('First')
  })

  it('renders card positions, stretch state, and custom label slots', async () => {
    const wrapper = mount(defineComponent({
      components: { Tabs, TabPane },
      template: `
        <Tabs type="border-card" tab-position="left" stretch>
          <TabPane label="Route" name="route">
            <template #label="{ active }">
              <span class="custom-label">{{ active ? 'Active route' : 'Route' }}</span>
            </template>
            Route content
          </TabPane>
          <TabPane label="Task" name="task">Task content</TabPane>
        </Tabs>
      `,
    }))

    await settle()

    const root = wrapper.find('.app-tabs')
    expect(root.classes()).toContain('app-tabs--border-card')
    expect(root.classes()).toContain('app-tabs--left')
    expect(root.classes()).toContain('is-stretch')
    expect(wrapper.find('[role="tablist"]').attributes('aria-orientation')).toBe('vertical')
    expect(wrapper.find('.custom-label').text()).toBe('Active route')
  })

  it('emits add, remove, and edit events for editable tabs', async () => {
    const wrapper = mount(Tabs, {
      props: {
        type: 'card',
        editable: true,
      },
      slots: {
        default: [
          h(TabPane, { label: 'Tab 1', name: '1' }, () => 'Tab 1'),
          h(TabPane, { label: 'Tab 2', name: '2' }, () => 'Tab 2'),
        ],
        'add-icon': () => h('span', { class: 'custom-add-icon' }, '+'),
      },
    })

    await settle()

    expect(wrapper.find('.custom-add-icon').exists()).toBe(true)
    await wrapper.find('.app-tabs-add').trigger('click')
    await wrapper.find('.app-tabs-close').trigger('click')

    expect(wrapper.emitted('tab-add')).toHaveLength(1)
    expect(wrapper.emitted('tab-remove')?.[0]).toEqual(['1'])
    expect(wrapper.emitted('edit')?.[0]).toEqual([undefined, 'add'])
    expect(wrapper.emitted('edit')?.[1]).toEqual(['1', 'remove'])
  })

  it('lazy renders pane content after first activation', async () => {
    const wrapper = mount(Tabs, {
      slots: {
        default: [
          h(TabPane, { label: 'First', name: 'first' }, () => h('div', { class: 'first-pane' }, 'First')),
          h(TabPane, { label: 'Lazy', name: 'lazy', lazy: true }, () => h('div', { class: 'lazy-pane' }, 'Lazy')),
        ],
      },
    })

    await settle()

    expect(wrapper.find('.lazy-pane').exists()).toBe(false)

    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    await settle()

    expect(wrapper.find('.lazy-pane').exists()).toBe(true)
    expect(wrapper.find('.lazy-pane').isVisible()).toBe(true)

    await wrapper.findAll('[role="tab"]')[0].trigger('click')
    await settle()

    expect(wrapper.find('.lazy-pane').exists()).toBe(true)
    expect(wrapper.findAll('.app-tab-pane')[1].attributes('style')).toContain('display: none')
  })

  it('supports keyboard navigation and delete close shortcut', async () => {
    const wrapper = mount(Tabs, {
      props: {
        closable: true,
      },
      slots: {
        default: [
          h(TabPane, { label: 'First', name: 'first' }, () => 'First'),
          h(TabPane, { label: 'Disabled', name: 'disabled', disabled: true }, () => 'Disabled'),
          h(TabPane, { label: 'Second', name: 'second' }, () => 'Second'),
        ],
      },
    })

    await settle()
    await wrapper.findAll('[role="tab"]')[0].trigger('keydown', { key: 'ArrowRight' })
    await settle()

    expect(wrapper.findAll('[role="tab"]')[2].attributes('aria-selected')).toBe('true')

    await wrapper.findAll('[role="tab"]')[2].trigger('keydown', { key: 'Delete' })
    expect(wrapper.emitted('tab-remove')?.[0]).toEqual(['second'])
  })

  it('falls back to the neighboring tab when the active pane is removed', async () => {
    const wrapper = mount(defineComponent({
      components: { Tabs, TabPane },
      setup() {
        const items = ref([
          { label: 'One', name: 'one' },
          { label: 'Two', name: 'two' },
        ])
        return { items }
      },
      template: `
        <Tabs default-value="two">
          <TabPane
            v-for="item in items"
            :key="item.name"
            :label="item.label"
            :name="item.name"
          >
            {{ item.label }} content
          </TabPane>
        </Tabs>
      `,
    }))

    await settle()
    expect(wrapper.find('.app-tab-pane.is-active').text()).toBe('Two content')

    wrapper.vm.items.pop()
    await settle()

    expect(wrapper.find('.app-tab-pane.is-active').text()).toBe('One content')
  })
})
