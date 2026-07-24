// @vitest-environment happy-dom
/* eslint-disable vue/one-component-per-file */
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
import CollapseGroup from '../CollapseGroup.vue'
import CollapsePanel from '../CollapsePanel.vue'
import NestedCollapseGroup from '../NestedCollapseGroup.vue'

afterEach(() => {
  vi.useRealTimers()
})

describe('CollapsePanel', () => {
  it('starts collapsed when requested and toggles from the header', async () => {
    const wrapper = mount(CollapsePanel, {
      props: {
        title: 'Tool details',
        defaultCollapsed: true,
      },
      slots: {
        default: '<div class="panel-body">Details</div>',
      },
    })

    expect(wrapper.find('.panel-body').exists()).toBe(false)
    expect(wrapper.find('.collapse-panel').classes()).toContain('border-box')
    expect(wrapper.find('.collapse-panel-header').classes()).toContain('layout-grid')
    expect(wrapper.find('.collapse-panel-title').classes()).toContain('app-space')
    expect(wrapper.find('.collapse-panel-header').attributes('aria-expanded')).toBe('false')

    await wrapper.find('.collapse-panel-header').trigger('click')

    expect(wrapper.find('.panel-body').exists()).toBe(true)
    expect(wrapper.find('.collapse-panel-header').attributes('aria-expanded')).toBe('true')
  })

  it('supports controlled expanded state with v-model style updates', async () => {
    const wrapper = mount(CollapsePanel, {
      props: {
        title: 'Controlled',
        modelValue: false,
      },
      slots: {
        default: '<div class="panel-body">Controlled body</div>',
      },
    })

    await wrapper.find('.collapse-panel-header').trigger('click')

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    expect(wrapper.find('.panel-body').exists()).toBe(false)

    await wrapper.setProps({ modelValue: true })

    expect(wrapper.find('.panel-body').exists()).toBe(true)
  })

  it('follows auto expanded state until the user toggles the panel', async () => {
    const wrapper = mount(CollapsePanel, {
      props: {
        title: 'Auto',
        defaultCollapsed: true,
        autoExpanded: false,
      },
      slots: {
        default: '<div class="panel-body">Auto body</div>',
      },
    })

    expect(wrapper.find('.panel-body').exists()).toBe(false)

    await wrapper.setProps({ autoExpanded: true })
    expect(wrapper.find('.panel-body').exists()).toBe(true)

    await wrapper.find('.collapse-panel-header').trigger('click')
    expect(wrapper.find('.panel-body').exists()).toBe(false)

    await wrapper.setProps({ autoExpanded: false })
    await wrapper.setProps({ autoExpanded: true })
    expect(wrapper.find('.panel-body').exists()).toBe(false)
  })

  it('renders custom title UI and custom icon at the requested position', () => {
    const wrapper = mount(CollapsePanel, {
      props: {
        title: 'Read file',
        expandIconPosition: 'start',
      },
      slots: {
        icon: ({ expanded }: { expanded: boolean }) => h('span', { class: 'custom-icon' }, expanded ? '-' : '+'),
        title: ({ title }: { title: string }) => h('span', { class: 'custom-title' }, `${title}: src/main.ts`),
        default: '<div />',
      },
    })

    expect(wrapper.find('.collapse-panel').classes()).toContain('icon-start')
    expect(wrapper.find('.collapse-panel').classes()).toContain('variant-outlined')
    expect(wrapper.find('.collapse-panel-header').element.firstElementChild?.classList.contains('collapse-panel-icon')).toBe(true)
    expect(wrapper.find('.custom-icon').text()).toBe('-')
    expect(wrapper.find('.custom-title').text()).toBe('Read file: src/main.ts')
  })

  it('can place the expand icon immediately after the title content', () => {
    const wrapper = mount(CollapsePanel, {
      props: {
        title: 'Thought',
        expandIconPosition: 'inline-end',
      },
      slots: {
        title: () => h('span', { class: 'thought-title' }, 'Thought for 10.9s'),
        default: '<div />',
      },
    })

    const panel = wrapper.find('.collapse-panel')
    expect(panel.classes()).toContain('icon-inline-end')
    expect(wrapper.find('.collapse-panel-title .collapse-panel-icon').exists()).toBe(true)
    expect(wrapper.find('.collapse-panel-header > .collapse-panel-icon').exists()).toBe(false)
    expect(wrapper.find('.thought-title').text()).toBe('Thought for 10.9s')
  })

  it('supports plain and outlined panel variants', async () => {
    const wrapper = mount(CollapsePanel, {
      props: {
        title: 'Variant',
      },
      slots: {
        default: '<div />',
      },
    })

    expect(wrapper.find('.collapse-panel').classes()).toContain('variant-outlined')
    expect(wrapper.find('.collapse-panel').classes()).not.toContain('variant-plain')

    await wrapper.setProps({ variant: 'plain' })

    expect(wrapper.find('.collapse-panel').classes()).toContain('variant-plain')
    expect(wrapper.find('.collapse-panel').classes()).not.toContain('variant-outlined')
  })

  it('can use the collapse content node as a caller-owned content panel', () => {
    const wrapper = mount(CollapsePanel, {
      props: {
        title: 'Content panel',
        variant: 'plain',
        contentVariant: 'panel',
        contentClass: 'custom-content-panel',
        contentAttrs: { 'data-details-id': 'tool-a' },
      },
      slots: {
        default: '<div class="content-body">Details</div>',
      },
    })

    const panel = wrapper.find('.collapse-panel')
    const content = wrapper.find('.collapse-panel-content')
    expect(panel.classes()).toContain('variant-plain')
    expect(panel.classes()).toContain('content-panel')
    expect(content.classes()).toContain('custom-content-panel')
    expect(content.attributes('data-details-id')).toBe('tool-a')
    expect(wrapper.find('.content-body').exists()).toBe(true)
  })

  it('defaults plain panels to plain content unless overridden', () => {
    const wrapper = mount(CollapsePanel, {
      props: {
        title: 'Plain',
        variant: 'plain',
      },
      slots: {
        default: '<div />',
      },
    })

    expect(wrapper.find('.collapse-panel').classes()).toContain('content-plain')
    expect(wrapper.find('.collapse-panel').classes()).not.toContain('content-panel')
  })

  it('renders a title icon slot next to the default title copy', async () => {
    const wrapper = mount(CollapsePanel, {
      props: {
        title: 'Read file',
      },
      slots: {
        'title-icon': ({ hovered }: { hovered: boolean }) => h('span', { class: 'title-file-icon' }, hovered ? 'open' : 'file'),
        default: '<div />',
      },
    })

    expect(wrapper.find('.collapse-panel-title-icon').exists()).toBe(true)
    expect(wrapper.find('.title-file-icon').text()).toBe('file')
    expect(wrapper.find('.collapse-panel-title-text').text()).toBe('Read file')

    await wrapper.find('.collapse-panel-title').trigger('mouseenter')

    expect(wrapper.find('.collapse-panel').classes()).toContain('is-title-hovered')
    expect(wrapper.find('.title-file-icon').text()).toBe('open')
  })

  it('allows interactive title content without toggling the panel', async () => {
    const openFile = vi.fn()
    const wrapper = mount(CollapsePanel, {
      props: {
        title: 'Tool call',
        defaultCollapsed: true,
      },
      slots: {
        title: () => h('button', { class: 'file-link', type: 'button', onClick: openFile }, 'src/tool.ts'),
        default: '<div class="panel-body">Tool output</div>',
      },
    })

    await wrapper.find('.file-link').trigger('click')

    expect(openFile).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.panel-body').exists()).toBe(false)

    await wrapper.find('.collapse-panel-header').trigger('click')

    expect(wrapper.find('.panel-body').exists()).toBe(true)
  })

  it('can reveal the expand icon on hover and exposes fine-grained hover state', async () => {
    const wrapper = mount(CollapsePanel, {
      props: {
        title: 'Hover details',
        defaultCollapsed: true,
        expandIconDisplay: 'hover',
      },
      slots: {
        icon: ({ hovered, headerHovered }: { hovered: boolean; headerHovered: boolean }) => h('span', { class: 'hover-icon' }, hovered ? 'icon' : headerHovered ? 'header' : 'idle'),
        actions: ({ hovered }: { hovered: boolean }) => h('button', { class: 'title-action', type: 'button' }, hovered ? 'hovered' : 'idle'),
        default: '<div />',
      },
    })

    expect(wrapper.find('.collapse-panel').classes()).toContain('icon-display-hover')
    expect(wrapper.find('.collapse-panel').classes()).not.toContain('is-header-hovered')
    expect(wrapper.find('.hover-icon').text()).toBe('idle')

    await wrapper.find('.collapse-panel-header').trigger('mouseenter')

    expect(wrapper.find('.collapse-panel').classes()).toContain('is-header-hovered')
    expect(wrapper.find('.hover-icon').text()).toBe('header')

    await wrapper.find('.collapse-panel-icon').trigger('mouseenter')

    expect(wrapper.find('.collapse-panel').classes()).toContain('is-icon-hovered')
    expect(wrapper.find('.hover-icon').text()).toBe('icon')

    await wrapper.find('.collapse-panel-actions').trigger('mouseenter')

    expect(wrapper.find('.collapse-panel').classes()).toContain('is-actions-hovered')
    expect(wrapper.find('.title-action').text()).toBe('hovered')
  })

  it('marks executing panels as running and shows an updating duration', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)

    const wrapper = mount(CollapsePanel, {
      props: {
        title: 'Running tool',
        status: 'executing',
        startedAt: 8_500,
        showDuration: true,
      },
      slots: {
        default: '<div />',
      },
    })

    expect(wrapper.find('.collapse-panel').classes()).toContain('status-executing')
    expect(wrapper.find('.collapse-panel').classes()).toContain('is-executing')
    expect(wrapper.find('.collapse-panel').classes()).toContain('is-running')
    expect(wrapper.find('.collapse-panel-duration').text()).toBe('1.5s')

    await vi.advanceTimersByTimeAsync(2000)
    await nextTick()

    expect(wrapper.find('.collapse-panel-duration').text()).toBe('3.5s')
  })

  it('keeps streaming content mounted while collapsed and updates slot content', async () => {
    const StreamingHost = defineComponent({
      components: { CollapsePanel },
      setup() {
        const content = ref('chunk 1')
        return { content }
      },
      template: `
        <CollapsePanel title="Streaming" status="streaming" streaming default-collapsed>
          <template #default="{ streaming }">
            <pre class="stream-content">{{ streaming ? content : 'idle' }}</pre>
          </template>
        </CollapsePanel>
      `,
    })

    const wrapper = mount(StreamingHost)

    expect(wrapper.find('.collapse-panel').classes()).toContain('is-streaming')
    expect(wrapper.find('.collapse-panel-content').attributes('aria-live')).toBe('polite')
    expect(wrapper.find('.collapse-panel-content').attributes('aria-busy')).toBe('true')
    expect(wrapper.find('.stream-content').exists()).toBe(true)
    expect(wrapper.find('.stream-content').text()).toBe('chunk 1')

    wrapper.vm.content = 'chunk 1\nchunk 2'
    await nextTick()

    expect(wrapper.find('.stream-content').text()).toBe('chunk 1\nchunk 2')
  })

  it('updates the title prop and custom title slot as state changes', async () => {
    const wrapper = mount(CollapsePanel, {
      props: {
        title: 'Queued',
        status: 'pending',
      },
      slots: {
        title: ({ title, status }: { title: string; status?: string }) => h('span', { class: 'dynamic-title' }, `${title} · ${status}`),
        default: '<div />',
      },
    })

    expect(wrapper.find('.dynamic-title').text()).toBe('Queued · pending')

    await wrapper.setProps({
      title: 'Executing command',
      status: 'executing',
    })

    expect(wrapper.find('.dynamic-title').text()).toBe('Executing command · executing')
    expect(wrapper.find('.collapse-panel').classes()).toContain('is-running')
  })

  it('renders built-in code content with language and file metadata', () => {
    const wrapper = mount(CollapsePanel, {
      props: {
        title: 'Write file',
        contentKind: 'code',
        content: 'const value = 1\nexport default value',
        language: 'ts',
        filePath: '/repo/src/value.ts',
      },
    })

    expect(wrapper.find('[data-collapse-panel-code]').exists()).toBe(true)
    expect(wrapper.find('.collapse-panel-content-meta').text()).toBe('/repo/src/value.ts · ts')
    expect(wrapper.find('[data-collapse-panel-code] code').attributes('data-language')).toBe('ts')
    expect(wrapper.find('[data-collapse-panel-code]').text()).toContain('const value = 1')
    expect(wrapper.find('[data-collapse-panel-code]').text()).toContain('export default value')
  })


  it('keeps built-in streaming code content mounted while collapsed and updates it', async () => {
    const StreamingCodeHost = defineComponent({
      components: { CollapsePanel },
      setup() {
        const content = ref('line 1')
        return { content }
      },
      template: `
        <CollapsePanel
          title="Streaming write"
          status="streaming"
          streaming
          default-collapsed
          content-kind="code"
          language="txt"
          :content="content"
        />
      `,
    })

    const wrapper = mount(StreamingCodeHost)

    expect(wrapper.find('.collapse-panel-header').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-collapse-panel-code]').exists()).toBe(true)
    expect(wrapper.find('[data-collapse-panel-code]').text()).toContain('line 1')

    wrapper.vm.content = 'line 1\nline 2'
    await nextTick()

    expect(wrapper.find('[data-collapse-panel-code]').text()).toContain('line 2')
  })
})

describe('CollapseGroup', () => {
  it('renders a group title with icon and hover-aware custom title UI', async () => {
    const wrapper = mount(CollapseGroup, {
      props: {
        title: 'Tool calls',
      },
      slots: {
        'title-icon': ({ hovered }: { hovered: boolean }) => h('span', { class: 'group-title-icon' }, hovered ? 'active' : 'idle'),
        title: ({ title, hovered }: { title: string; hovered: boolean }) => h('span', { class: 'group-title-copy' }, `${title}${hovered ? ' hovered' : ''}`),
        default: '<div class="group-body" />',
      },
    })

    expect(wrapper.find('.collapse-group').classes()).toContain('app-space')
    expect(wrapper.find('.collapse-group-header').exists()).toBe(true)
    expect(wrapper.find('.collapse-group-header').classes()).toContain('layout-grid')
    expect(wrapper.find('.collapse-group-title').classes()).toContain('app-space')
    expect(wrapper.find('.collapse-group-title-icon').exists()).toBe(true)
    expect(wrapper.find('.group-title-icon').text()).toBe('idle')
    expect(wrapper.find('.group-title-copy').text()).toBe('Tool calls')

    await wrapper.find('.collapse-group-title').trigger('mouseenter')

    expect(wrapper.find('.collapse-group').classes()).toContain('is-title-hovered')
    expect(wrapper.find('.group-title-icon').text()).toBe('active')
    expect(wrapper.find('.group-title-copy').text()).toBe('Tool calls hovered')
  })

  it('lets multiple panels expand independently by default', async () => {
    const wrapper = mount({
      components: { CollapseGroup, CollapsePanel },
      template: `
        <CollapseGroup default-collapsed>
          <CollapsePanel name="read" title="Read"><div class="read-body">Read body</div></CollapsePanel>
          <CollapsePanel name="write" title="Write"><div class="write-body">Write body</div></CollapsePanel>
        </CollapseGroup>
      `,
    })

    const headers = wrapper.findAll('.collapse-panel-header')
    await headers[0].trigger('click')
    await headers[1].trigger('click')

    expect(wrapper.find('.read-body').exists()).toBe(true)
    expect(wrapper.find('.write-body').exists()).toBe(true)
  })

  it('keeps only one panel open in accordion mode', async () => {
    const wrapper = mount({
      components: { CollapseGroup, CollapsePanel },
      template: `
        <CollapseGroup accordion default-collapsed>
          <CollapsePanel name="read" title="Read"><div class="read-body">Read body</div></CollapsePanel>
          <CollapsePanel name="write" title="Write"><div class="write-body">Write body</div></CollapsePanel>
        </CollapseGroup>
      `,
    })

    const headers = wrapper.findAll('.collapse-panel-header')
    await headers[0].trigger('click')
    expect(wrapper.find('.read-body').exists()).toBe(true)

    await headers[1].trigger('click')
    await nextTick()

    expect(wrapper.find('.read-body').exists()).toBe(false)
    expect(wrapper.find('.write-body').exists()).toBe(true)
  })

  it('accepts default expanded keys for grouped panels', () => {
    const wrapper = mount({
      components: { CollapseGroup, CollapsePanel },
      template: `
        <CollapseGroup :default-expanded-keys="['write']">
          <CollapsePanel name="read" title="Read"><div class="read-body">Read body</div></CollapsePanel>
          <CollapsePanel name="write" title="Write"><div class="write-body">Write body</div></CollapsePanel>
        </CollapseGroup>
      `,
    })

    expect(wrapper.find('.read-body').exists()).toBe(false)
    expect(wrapper.find('.write-body').exists()).toBe(true)
  })

  it('preserves keyed panel expansion when a panel temporarily unmounts', async () => {
    const Host = defineComponent({
      components: { CollapseGroup, CollapsePanel },
      setup() {
        const show = ref(true)
        return { show }
      },
      template: `
        <CollapseGroup default-collapsed>
          <CollapsePanel v-if="show" name="read" title="Read">
            <div class="read-body">Read body</div>
          </CollapsePanel>
        </CollapseGroup>
      `,
    })

    const wrapper = mount(Host)

    await wrapper.find('.collapse-panel-header').trigger('click')
    expect(wrapper.find('.read-body').exists()).toBe(true)

    wrapper.vm.show = false
    await nextTick()
    expect(wrapper.find('.read-body').exists()).toBe(false)

    wrapper.vm.show = true
    await nextTick()
    expect(wrapper.find('.read-body').exists()).toBe(true)
  })

  it('can default expand a new panel from related expanded keys', async () => {
    const Host = defineComponent({
      components: { CollapseGroup, CollapsePanel },
      setup() {
        const grouped = ref(false)
        return { grouped }
      },
      template: `
        <CollapseGroup>
          <CollapsePanel v-if="!grouped" name="activity-a" title="Activity" default-collapsed>
            <div class="activity-body">Activity body</div>
          </CollapsePanel>
          <CollapsePanel
            v-else
            name="group-a"
            title="Group"
            default-collapsed
            :default-expanded-when-keys="['activity-a']"
          >
            <div class="group-body">Group body</div>
          </CollapsePanel>
        </CollapseGroup>
      `,
    })

    const wrapper = mount(Host)

    await wrapper.find('.collapse-panel-header').trigger('click')
    expect(wrapper.find('.activity-body').exists()).toBe(true)

    wrapper.vm.grouped = true
    await nextTick()

    expect(wrapper.find('.group-body').exists()).toBe(true)
  })

  it('keeps nested panel icon toggles scoped to the nested panel', async () => {
    const wrapper = mount({
      components: { CollapseGroup, CollapsePanel },
      template: `
        <CollapseGroup>
          <CollapsePanel name="outer" title="Outer">
            <div class="outer-body">
              <CollapsePanel name="inner" title="Inner" default-collapsed>
                <div class="inner-body">Inner body</div>
              </CollapsePanel>
            </div>
          </CollapsePanel>
        </CollapseGroup>
      `,
    })

    const panels = wrapper.findAll('.collapse-panel')
    const icons = wrapper.findAll('.collapse-panel-icon')

    expect(panels[0].classes()).toContain('is-expanded')
    expect(panels[1].classes()).not.toContain('is-expanded')
    expect(icons[0].classes()).toContain('is-expanded')
    expect(icons[1].classes()).not.toContain('is-expanded')
    expect(wrapper.find('.outer-body').exists()).toBe(true)
    expect(wrapper.find('.inner-body').exists()).toBe(false)

    await icons[1].trigger('click')

    expect(panels[0].classes()).toContain('is-expanded')
    expect(panels[1].classes()).toContain('is-expanded')
    expect(icons[0].classes()).toContain('is-expanded')
    expect(icons[1].classes()).toContain('is-expanded')
    expect(wrapper.find('.outer-body').exists()).toBe(true)
    expect(wrapper.find('.inner-body').exists()).toBe(true)

    await icons[1].trigger('click')

    expect(panels[0].classes()).toContain('is-expanded')
    expect(panels[1].classes()).not.toContain('is-expanded')
    expect(icons[0].classes()).toContain('is-expanded')
    expect(icons[1].classes()).not.toContain('is-expanded')
    expect(wrapper.find('.outer-body').exists()).toBe(true)
    expect(wrapper.find('.inner-body').exists()).toBe(false)
  })

  it('passes shared visual preferences to child panels', () => {
    const wrapper = mount({
      components: { CollapseGroup, CollapsePanel },
      template: `
        <CollapseGroup variant="plain" expand-icon-position="start" expand-icon-display="hover">
          <CollapsePanel name="read" title="Read"><div /></CollapsePanel>
        </CollapseGroup>
      `,
    })

    expect(wrapper.find('.collapse-panel').classes()).toContain('icon-start')
    expect(wrapper.find('.collapse-panel').classes()).toContain('icon-display-hover')
    expect(wrapper.find('.collapse-panel').classes()).toContain('variant-plain')
  })

  it('lets child panels override the group variant', () => {
    const wrapper = mount({
      components: { CollapseGroup, CollapsePanel },
      template: `
        <CollapseGroup variant="plain">
          <CollapsePanel name="read" title="Read" variant="outlined"><div /></CollapsePanel>
        </CollapseGroup>
      `,
    })

    expect(wrapper.find('.collapse-panel').classes()).toContain('variant-outlined')
    expect(wrapper.find('.collapse-panel').classes()).not.toContain('variant-plain')
  })
})

describe('NestedCollapseGroup', () => {
  it('renders a nested item tree through shared collapse panels and scoped slots', async () => {
    const wrapper = mount(NestedCollapseGroup, {
      props: {
        variant: 'plain',
        items: [
          {
            key: 'parent',
            title: 'Parent',
            childrenClass: 'child-list',
            children: [
              {
                key: 'child',
                title: 'Child',
                defaultCollapsed: true,
                content: 'Child body',
              },
            ],
          },
        ],
      },
      slots: {
        title: ({ item, depth }: { item: { title: string }; depth: number }) => h('span', { class: 'custom-nested-title' }, `${depth}:${item.title}`),
      },
    })

    expect(wrapper.find('.nested-collapse-group').classes()).toContain('collapse-group')
    expect(wrapper.find('.collapse-panel').classes()).toContain('variant-plain')
    expect(wrapper.find('.child-list').exists()).toBe(true)
    expect(wrapper.findAll('.custom-nested-title').map(title => title.text())).toEqual(['0:Parent', '1:Child'])
    expect(wrapper.text()).not.toContain('Child body')

    await wrapper.findAll('.collapse-panel-header')[1].trigger('click')

    expect(wrapper.text()).toContain('Child body')
  })

  it('passes item content class and attrs to the underlying content panel', async () => {
    const wrapper = mount(NestedCollapseGroup, {
      props: {
        items: [
          {
            key: 'tool',
            title: 'Tool',
            defaultCollapsed: true,
            contentVariant: 'panel',
            contentClass: 'tool-content-panel',
            contentAttrs: { 'data-tool-content': 'tool' },
          },
        ],
      },
    })

    await wrapper.find('.collapse-panel-header').trigger('click')

    const content = wrapper.find('.collapse-panel-content')
    expect(wrapper.find('.collapse-panel').classes()).toContain('content-panel')
    expect(content.classes()).toContain('tool-content-panel')
    expect(content.attributes('data-tool-content')).toBe('tool')
  })

  it('opens a parent by default when a descendant key was already expanded', async () => {
    const Host = defineComponent({
      components: { NestedCollapseGroup },
      setup() {
        const grouped = ref(false)
        const items = computed(() => grouped.value
          ? [
            {
              key: 'parent',
              title: 'Parent',
              defaultCollapsed: true,
              children: [
                {
                  key: 'child',
                  title: 'Child',
                  defaultCollapsed: true,
                  content: 'Child body',
                },
              ],
            },
          ]
          : [
            {
              key: 'child',
              title: 'Child',
              defaultCollapsed: true,
              content: 'Child body',
            },
          ])
        return { grouped, items }
      },
      template: '<NestedCollapseGroup :items="items" />',
    })

    const wrapper = mount(Host)

    await wrapper.find('.collapse-panel-header').trigger('click')
    expect(wrapper.text()).toContain('Child body')

    wrapper.vm.grouped = true
    await nextTick()

    expect(wrapper.findAll('.collapse-panel')[0].classes()).toContain('is-expanded')
    expect(wrapper.text()).toContain('Child body')
  })
})
