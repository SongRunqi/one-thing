// @vitest-environment happy-dom
/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import Splitter from '../Splitter.vue'
import SplitterPanel from '../SplitterPanel.vue'

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function mockHorizontalSize(wrapper: ReturnType<typeof mount>, width = 1000) {
  const root = wrapper.find('.splitter').element as HTMLElement
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
    width,
    height: 600,
    top: 0,
    left: 0,
    right: width,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
}

describe('Splitter', () => {
  it('assigns equal sizes when panels do not provide defaults', async () => {
    const wrapper = mount(defineComponent({
      components: { Splitter, SplitterPanel },
      setup() {
        const leftSize = ref<number>()
        const rightSize = ref<number>()
        return { leftSize, rightSize }
      },
      template: `
        <Splitter>
          <SplitterPanel v-model:size="leftSize">Left</SplitterPanel>
          <SplitterPanel v-model:size="rightSize">Right</SplitterPanel>
        </Splitter>
      `,
    }))

    await settle()

    const panels = wrapper.findAll('.splitter-panel')
    expect(panels[0].attributes('data-size')).toBe('50')
    expect(panels[1].attributes('data-size')).toBe('50')
    expect(wrapper.vm.leftSize).toBe(50)
    expect(wrapper.vm.rightSize).toBe(50)
  })

  it('supports vertical layout', async () => {
    const wrapper = mount(defineComponent({
      components: { Splitter, SplitterPanel },
      template: `
        <Splitter layout="vertical">
          <SplitterPanel>Top</SplitterPanel>
          <SplitterPanel>Bottom</SplitterPanel>
        </Splitter>
      `,
    }))

    await settle()

    expect(wrapper.find('.splitter').classes()).toContain('layout-vertical')
    expect(wrapper.find('.splitter-resizer').attributes('aria-orientation')).toBe('horizontal')
  })

  it('updates adjacent panel sizes while dragging', async () => {
    const wrapper = mount(defineComponent({
      components: { Splitter, SplitterPanel },
      setup() {
        const leftSize = ref(50)
        const rightSize = ref(50)
        return { leftSize, rightSize }
      },
      template: `
        <Splitter>
          <SplitterPanel v-model:size="leftSize">Left</SplitterPanel>
          <SplitterPanel v-model:size="rightSize">Right</SplitterPanel>
        </Splitter>
      `,
    }))
    await settle()
    mockHorizontalSize(wrapper)

    await wrapper.find('.splitter-resizer').trigger('mousedown', { clientX: 500 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 600 }))
    await settle()

    expect(wrapper.findAll('.splitter-panel')[0].attributes('data-size')).toBe('60')
    expect(wrapper.findAll('.splitter-panel')[1].attributes('data-size')).toBe('40')
    expect(wrapper.vm.leftSize).toBe(60)
    expect(wrapper.vm.rightSize).toBe(40)

    document.dispatchEvent(new MouseEvent('mouseup'))
  })

  it('supports a pixel-sized panel next to a flexible panel', async () => {
    const wrapper = mount(defineComponent({
      components: { Splitter, SplitterPanel },
      setup() {
        const sidebarSize = ref(300)
        return { sidebarSize }
      },
      template: `
        <Splitter>
          <SplitterPanel v-model:size="sidebarSize" size-unit="px" :min="200" :max="500">Sidebar</SplitterPanel>
          <SplitterPanel flex>Main</SplitterPanel>
        </Splitter>
      `,
    }))
    await settle()
    mockHorizontalSize(wrapper)

    const panels = wrapper.findAll('.splitter-panel')
    expect(panels[0].attributes('data-size')).toBe('300')
    expect(panels[0].attributes('data-size-unit')).toBe('px')
    expect(panels[0].attributes('style')).toContain('flex-basis: 300px')
    expect(panels[1].classes()).toContain('is-flex')
    expect(panels[1].attributes('style')).toContain('flex-grow: 1')

    await wrapper.find('.splitter-resizer').trigger('mousedown', { clientX: 300 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 360 }))
    await settle()

    expect(wrapper.vm.sidebarSize).toBe(360)
    expect(wrapper.findAll('.splitter-panel')[0].attributes('data-size')).toBe('360')

    document.dispatchEvent(new MouseEvent('mouseup'))
  })

  it('disables dragging when either adjacent panel is not resizable', async () => {
    const wrapper = mount(defineComponent({
      components: { Splitter, SplitterPanel },
      setup() {
        const leftSize = ref(50)
        const rightSize = ref(50)
        return { leftSize, rightSize }
      },
      template: `
        <Splitter>
          <SplitterPanel v-model:size="leftSize" :resizable="false">Left</SplitterPanel>
          <SplitterPanel v-model:size="rightSize">Right</SplitterPanel>
        </Splitter>
      `,
    }))
    await settle()
    mockHorizontalSize(wrapper)

    const resizer = wrapper.find('.splitter-resizer')
    expect(resizer.classes()).toContain('is-disabled')

    await resizer.trigger('mousedown', { clientX: 500 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 700 }))
    await settle()

    expect(wrapper.vm.leftSize).toBe(50)
    expect(wrapper.vm.rightSize).toBe(50)
  })

  it('delays size model updates until drag end when lazy is enabled', async () => {
    const wrapper = mount(defineComponent({
      components: { Splitter, SplitterPanel },
      setup() {
        const leftSize = ref(50)
        const rightSize = ref(50)
        return { leftSize, rightSize }
      },
      template: `
        <Splitter lazy>
          <SplitterPanel v-model:size="leftSize">Left</SplitterPanel>
          <SplitterPanel v-model:size="rightSize">Right</SplitterPanel>
        </Splitter>
      `,
    }))
    await settle()
    mockHorizontalSize(wrapper)

    await wrapper.find('.splitter-resizer').trigger('mousedown', { clientX: 500 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 600 }))
    await settle()

    expect(wrapper.findAll('.splitter-panel')[0].attributes('data-size')).toBe('50')
    expect(wrapper.vm.leftSize).toBe(50)

    document.dispatchEvent(new MouseEvent('mouseup'))
    await settle()

    expect(wrapper.findAll('.splitter-panel')[0].attributes('data-size')).toBe('60')
    expect(wrapper.findAll('.splitter-panel')[1].attributes('data-size')).toBe('40')
    expect(wrapper.vm.leftSize).toBe(60)
    expect(wrapper.vm.rightSize).toBe(40)
  })

  it('collapses a collapsible panel from the resizer', async () => {
    const wrapper = mount(defineComponent({
      components: { Splitter, SplitterPanel },
      setup() {
        const leftSize = ref(30)
        const rightSize = ref(70)
        const leftCollapsed = ref(false)
        return { leftSize, rightSize, leftCollapsed }
      },
      template: `
        <Splitter>
          <SplitterPanel v-model:size="leftSize" v-model:collapsed="leftCollapsed" collapsible :min="12">Left</SplitterPanel>
          <SplitterPanel v-model:size="rightSize">Right</SplitterPanel>
        </Splitter>
      `,
    }))

    await settle()
    await wrapper.find('.splitter-resizer').trigger('dblclick')
    await settle()

    expect(wrapper.vm.leftSize).toBe(0)
    expect(wrapper.vm.rightSize).toBe(100)
    expect(wrapper.vm.leftCollapsed).toBe(true)
    expect(wrapper.findAll('.splitter-panel')[0].classes()).toContain('is-collapsed')
  })
})
