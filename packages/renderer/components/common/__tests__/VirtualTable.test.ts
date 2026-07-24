// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VirtualTable from '../VirtualTable.vue'
import type { VirtualTableColumn } from '../virtual-table/types'

interface PersonRow {
  id: number
  name: string
  amount: number
  status: 'active' | 'paused'
}

const people: PersonRow[] = [
  { id: 1, name: 'Ada', amount: 9, status: 'active' },
  { id: 2, name: 'Grace', amount: 14, status: 'paused' },
  { id: 3, name: 'Linus', amount: 3, status: 'active' },
]

function rows(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.virtual-table-row')
}

function rowTexts(wrapper: ReturnType<typeof mount>) {
  return rows(wrapper).map(row => row.text())
}

function viewport(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('.virtual-table-viewport')
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('VirtualTable', () => {
  it('renders a small fixed window for 10k rows and updates range on scroll', async () => {
    const data = Array.from({ length: 10000 }, (_, index) => ({
      id: index,
      name: `Person ${index}`,
      amount: index,
      status: index % 2 ? 'paused' : 'active',
    })) satisfies PersonRow[]

    const wrapper = mount(VirtualTable, {
      props: {
        data,
        rowKey: 'id',
        height: 220,
        rowHeight: 44,
        overscan: 2,
        columns: [
          { key: 'name', field: 'name', title: 'Name', width: 180 },
          {
            key: 'amount',
            field: 'amount',
            title: 'Amount',
            width: 120,
            render: ({ value }) => h('strong', { class: 'amount-cell' }, `$${value}`),
          },
        ] satisfies VirtualTableColumn[],
      },
    })

    expect(rows(wrapper).length).toBeLessThan(14)
    expect(rowTexts(wrapper)[0]).toContain('Person 0')
    expect(wrapper.find('.amount-cell').text()).toBe('$0')

    const scroller = viewport(wrapper).element as HTMLElement
    scroller.scrollTop = 500 * 44
    await viewport(wrapper).trigger('scroll')
    await nextTick()

    expect(rowTexts(wrapper).join(' ')).toContain('Person 500')
    expect(wrapper.vm.getVisibleRange().rows.start).toBeGreaterThanOrEqual(498)
  })

  it('sorts local data and supports multiple selection', async () => {
    const wrapper = mount(VirtualTable, {
      props: {
        data: people,
        rowKey: 'id',
        height: 220,
        selectionMode: 'multiple',
        columns: [
          { key: 'name', field: 'name', title: 'Name', width: 160 },
          { key: 'amount', field: 'amount', title: 'Amount', width: 120, sortable: true },
        ] satisfies VirtualTableColumn[],
      },
    })

    await wrapper.find('.virtual-table-sort-button').trigger('click')
    expect(rowTexts(wrapper)[0]).toContain('Linus')
    expect(wrapper.emitted('sort-change')?.[0]?.[0]).toMatchObject({ key: 'amount', order: 'asc' })

    await wrapper.find('.virtual-table-header input[type="checkbox"]').trigger('change')
    expect(wrapper.emitted('selection-change')?.[0]?.[0]).toHaveLength(3)
    expect(rows(wrapper).every(row => row.classes().includes('is-selected'))).toBe(true)
  })

  it('virtualizes columns when horizontal virtualization is enabled', async () => {
    const columns = Array.from({ length: 50 }, (_, index) => ({
      key: `col-${index}`,
      field: `field${index}`,
      title: `Column ${index}`,
      width: 100,
    })) satisfies VirtualTableColumn[]

    const data = [
      Object.fromEntries(columns.map((column, index) => [column.field, `Value ${index}`])),
    ]

    const wrapper = mount(VirtualTable, {
      props: {
        data,
        columns,
        rowKey: () => 'row-1',
        height: 180,
        virtualizeColumns: true,
        columnOverscan: 1,
      },
    })

    expect(wrapper.findAll('.virtual-table-header-cell').length).toBeLessThan(14)
    expect(wrapper.text()).toContain('Column 0')
    expect(wrapper.text()).not.toContain('Column 30')

    const scroller = viewport(wrapper).element as HTMLElement
    scroller.scrollLeft = 3000
    await viewport(wrapper).trigger('scroll')
    await nextTick()

    expect(wrapper.text()).toContain('Column 30')
    expect(wrapper.vm.getVisibleRange().columns.start).toBeGreaterThanOrEqual(29)
  })

  it('measures and caches dynamic row heights', async () => {
    const frameCallbacks: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      const height = this.classList.contains('virtual-table-row') ? 72 : 0
      return {
        x: 0,
        y: 0,
        width: 0,
        height,
        top: 0,
        right: 0,
        bottom: height,
        left: 0,
        toJSON: () => ({}),
      }
    })

    const wrapper = mount(VirtualTable, {
      props: {
        data: people,
        rowKey: 'id',
        height: 220,
        rowHeight: 32,
        estimatedRowHeight: 32,
        dynamicRowHeight: true,
        columns: [
          { key: 'name', field: 'name', title: 'Name', width: 180, ellipsis: false },
        ] satisfies VirtualTableColumn[],
      },
    })

    await nextTick()
    frameCallbacks.splice(0).forEach(callback => callback(0))
    await nextTick()

    expect(wrapper.find('.virtual-table-body').attributes('style')).toContain('height: 216px')
    expect(rows(wrapper)[1].attributes('style')).toContain('translate3d(0, 72px, 0)')
  })

  it('shows loading and empty states from external props', async () => {
    const wrapper = mount(VirtualTable, {
      props: {
        data: [],
        columns: [{ key: 'name', field: 'name', title: 'Name' }],
        loading: true,
        loadingText: 'Fetching rows',
        emptyText: 'Nothing here',
      },
    })

    expect(wrapper.text()).toContain('Fetching rows')
    expect(wrapper.text()).not.toContain('Nothing here')

    await wrapper.setProps({ loading: false })

    expect(wrapper.text()).toContain('Nothing here')
  })
})
