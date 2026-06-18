// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Table from '../Table.vue'
import type { TableColumn, TableRow } from '../table'

const people = [
  { id: 1, name: 'Ada', status: 'active', amount: 9, address: 'First long address' },
  { id: 2, name: 'Grace', status: 'paused', amount: 14, address: 'Second long address' },
  { id: 3, name: 'Linus', status: 'active', amount: 3, address: 'Third long address' },
]

function bodyRows(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('tbody .app-table-row')
}

function rowTexts(wrapper: ReturnType<typeof mount>) {
  return bodyRows(wrapper).map(row => row.text())
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Table', () => {
  it('renders data, formatter output, custom cell slots, and row status classes', () => {
    const wrapper = mount(Table, {
      props: {
        data: people,
        rowKey: 'id',
        stripe: true,
        border: true,
        maxHeight: 180,
        showOverflowTooltip: true,
        rowStatus: (_row: TableRow, index: number) => index === 1 ? 'warning' : undefined,
        columns: [
          { type: 'index', label: '#', index: 10 },
          { prop: 'name', label: 'Name' },
          { prop: 'amount', label: 'Amount', formatter: row => `$${row.amount}` },
          { prop: 'address', label: 'Address', showOverflowTooltip: true },
        ] satisfies TableColumn[],
      },
      slots: {
        'cell-name': ({ row }: { row: TableRow }) => h('strong', { class: 'custom-name' }, String(row.name).toUpperCase()),
      },
    })

    expect(wrapper.classes()).toContain('is-striped')
    expect(wrapper.classes()).toContain('is-bordered')
    expect(wrapper.find('.app-table-scrollbar').attributes('style')).toContain('max-height: 180px')
    expect(wrapper.findAll('thead th')).toHaveLength(4)
    expect(rowTexts(wrapper)[0]).toContain('10')
    expect(wrapper.find('.custom-name').text()).toBe('ADA')
    expect(rowTexts(wrapper)[1]).toContain('$14')
    expect(bodyRows(wrapper)[1].classes()).toContain('is-warning')
    expect(wrapper.find('.app-table-cell-text.is-overflow').exists()).toBe(true)
  })

  it('renders multi-level headers and sticky fixed column styles', () => {
    const wrapper = mount(Table, {
      props: {
        data: people,
        rowKey: 'id',
        columns: [
          {
            label: 'Profile',
            fixed: 'left',
            children: [
              { prop: 'name', label: 'Name', width: 120 },
              { prop: 'status', label: 'Status', width: 100 },
            ],
          },
          { prop: 'amount', label: 'Amount', width: 100 },
          { prop: 'address', label: 'Address', fixed: 'right', width: 180 },
        ] satisfies TableColumn[],
      },
    })

    const groupHeader = wrapper.find('thead th')
    expect(groupHeader.text()).toContain('Profile')
    expect(groupHeader.attributes('colspan')).toBe('2')
    expect(groupHeader.classes()).toContain('is-fixed-left')
    expect(wrapper.find('tbody td.is-fixed-left').attributes('style')).toContain('left: 0px')
    expect(wrapper.find('tbody td.is-fixed-right').attributes('style')).toContain('right: 0px')
  })

  it('sorts local columns and emits custom sort changes without reordering data', async () => {
    const wrapper = mount(Table, {
      props: {
        data: people,
        rowKey: 'id',
        defaultSort: { prop: 'amount', order: 'descending' },
        columns: [
          { prop: 'name', label: 'Name', sortable: true },
          { prop: 'amount', label: 'Amount', sortable: true },
        ] satisfies TableColumn[],
      },
    })

    expect(rowTexts(wrapper)[0]).toContain('Grace')

    await wrapper.findAll('.app-table-sort-button')[0].trigger('click')
    expect(rowTexts(wrapper).map(text => text.match(/Ada|Grace|Linus/)?.[0])).toEqual(['Ada', 'Grace', 'Linus'])
    expect(wrapper.emitted('sort-change')?.[0]?.[0]).toMatchObject({ prop: 'name', order: 'ascending' })

    const custom = mount(Table, {
      props: {
        data: people,
        rowKey: 'id',
        columns: [
          { prop: 'amount', label: 'Amount', sortable: 'custom' },
          { prop: 'name', label: 'Name' },
        ] satisfies TableColumn[],
      },
    })

    await custom.find('.app-table-sort-button').trigger('click')
    expect(rowTexts(custom)[0]).toContain('Ada')
    expect(custom.emitted('sort-change')?.[0]?.[0]).toMatchObject({ prop: 'amount', order: 'ascending' })
  })

  it('filters rows through column filters and emits filter-change payloads', async () => {
    const wrapper = mount(Table, {
      props: {
        data: people,
        rowKey: 'id',
        columns: [
          {
            prop: 'status',
            label: 'Status',
            filters: [
              { text: 'Active', value: 'active' },
              { text: 'Paused', value: 'paused' },
            ],
            filterMethod: (value, row) => row.status === value,
          },
          { prop: 'name', label: 'Name' },
        ] satisfies TableColumn[],
      },
    })

    await wrapper.find('.app-table-filter-button').trigger('click')
    const menu = document.body.querySelector('.app-table-filter-menu') as HTMLElement | null
    expect(menu && document.body.contains(menu)).toBe(true)
    expect(menu?.getAttribute('style')).toContain('width: 188px')

    const options = Array.from(document.body.querySelectorAll('.app-table-filter-option')) as HTMLElement[]
    options[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(rowTexts(wrapper)).toHaveLength(1)
    expect(rowTexts(wrapper)[0]).toContain('Grace')
    expect(wrapper.emitted('filter-change')?.[0]?.[0]).toMatchObject({ status: ['paused'] })

    const clearButton = document.body.querySelector('.app-table-filter-actions button') as HTMLButtonElement | null
    expect(clearButton?.disabled).toBe(false)
    clearButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(rowTexts(wrapper)).toHaveLength(3)
    expect(wrapper.emitted('filter-change')?.[1]?.[0]).toMatchObject({ status: [] })
    expect(document.body.querySelector('.app-table-filter-menu')).toBeNull()
  })

  it('closes filter menus when interacting outside the popover', async () => {
    const wrapper = mount(Table, {
      attachTo: document.body,
      props: {
        data: people,
        rowKey: 'id',
        columns: [
          {
            prop: 'status',
            label: 'Status',
            filters: [
              { text: 'Active', value: 'active' },
              { text: 'Paused', value: 'paused' },
            ],
            filterMethod: (value, row) => row.status === value,
          },
          { prop: 'name', label: 'Name' },
        ] satisfies TableColumn[],
      },
    })

    await wrapper.find('.app-table-filter-button').trigger('click')
    expect(document.body.querySelector('.app-table-filter-menu')).not.toBeNull()

    bodyRows(wrapper)[0].element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await nextTick()
    expect(document.body.querySelector('.app-table-filter-menu')).toBeNull()

    await wrapper.find('.app-table-filter-button').trigger('click')
    expect(document.body.querySelector('.app-table-filter-menu')).not.toBeNull()

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await nextTick()
    expect(document.body.querySelector('.app-table-filter-menu')).toBeNull()

    await wrapper.find('.app-table-filter-button').trigger('click')
    expect(document.body.querySelector('.app-table-filter-menu')).not.toBeNull()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(document.body.querySelector('.app-table-filter-menu')).toBeNull()
  })

  it('supports multi-select rows and highlighted current row', async () => {
    const wrapper = mount(Table, {
      props: {
        data: people,
        rowKey: 'id',
        highlightCurrentRow: true,
        columns: [
          { type: 'selection', label: '' },
          { prop: 'name', label: 'Name' },
        ] satisfies TableColumn[],
      },
    })

    await wrapper.find('thead input[type="checkbox"]').trigger('change')
    expect(wrapper.emitted('selection-change')?.[0]?.[0]).toHaveLength(3)
    expect(bodyRows(wrapper).every(row => row.classes().includes('is-selected'))).toBe(true)

    await bodyRows(wrapper)[1].trigger('click')
    expect(bodyRows(wrapper)[1].classes()).toContain('is-current')
    expect(wrapper.emitted('current-change')?.[0]?.[0]).toMatchObject({ name: 'Grace' })
  })

  it('expands tree rows, supports lazy loading, and renders expand slots', async () => {
    const load = vi.fn((_row: TableRow, _node, resolve: (children: TableRow[]) => void) => {
      resolve([{ id: 'child', name: 'Lazy child' }])
    })
    const wrapper = mount(Table, {
      props: {
        data: [{ id: 'parent', name: 'Parent', hasChildren: true }],
        rowKey: 'id',
        lazy: true,
        load,
        columns: [
          { type: 'expand', label: '' },
          { prop: 'name', label: 'Name' },
        ] satisfies TableColumn[],
      },
      slots: {
        expand: ({ row }: { row: TableRow }) => h('div', { class: 'expanded-detail' }, `Detail ${row.name}`),
      },
    })

    await wrapper.find('.app-table-expand-button').trigger('click')
    await nextTick()

    expect(load).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Lazy child')
    expect(wrapper.find('.expanded-detail').text()).toBe('Detail Parent')
    expect(wrapper.emitted('expand-change')?.[0]?.[0]).toMatchObject({ id: 'parent' })
  })

  it('renders summary rows and supports merged cells through spanMethod', () => {
    const wrapper = mount(Table, {
      props: {
        data: people,
        rowKey: 'id',
        showSummary: true,
        spanMethod: ({ rowIndex, columnIndex }: { rowIndex: number; columnIndex: number }) => {
          if (rowIndex === 0 && columnIndex === 0) return [1, 2]
          if (rowIndex === 0 && columnIndex === 1) return [0, 0]
          return undefined
        },
        columns: [
          { prop: 'name', label: 'Name' },
          { prop: 'status', label: 'Status' },
          { prop: 'amount', label: 'Amount' },
        ] satisfies TableColumn[],
      },
    })

    const firstBodyCells = bodyRows(wrapper)[0].findAll('td')
    expect(firstBodyCells[0].attributes('colspan')).toBe('2')
    expect(firstBodyCells).toHaveLength(2)
    expect(wrapper.find('.app-table-summary-row').text()).toContain('Sum')
    expect(wrapper.find('.app-table-summary-row').text()).toContain('26')
  })
})
