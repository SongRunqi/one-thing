<template>
  <div
    class="virtual-table"
    :class="tableClasses"
  >
    <div
      ref="scrollerRef"
      class="virtual-table-viewport"
      :style="viewportStyle"
      role="grid"
      :aria-rowcount="displayRowCount"
      :aria-colcount="normalizedColumns.length"
      :aria-busy="loading ? 'true' : 'false'"
      @scroll.passive="handleScroll"
    >
      <div
        class="virtual-table-inner"
        :style="innerStyle"
      >
        <div
          v-if="showHeader"
          class="virtual-table-header"
          :style="headerStyle"
          role="row"
        >
          <div
            v-if="leftColumnSpacer > 0"
            class="virtual-table-column-spacer"
            aria-hidden="true"
          />

          <div
            v-for="columnItem in renderedColumns"
            :key="`header-${columnItem.column.id}`"
            class="virtual-table-header-cell"
            :class="headerCellClasses(columnItem)"
            :style="headerCellStyle(columnItem)"
            role="columnheader"
            :aria-sort="ariaSort(columnItem.column)"
          >
            <div class="virtual-table-cell-content">
              <template v-if="columnItem.column.internalType === 'selection'">
                <Checkbox
                  v-if="selectionMode === 'multiple'"
                  class="virtual-table-selection-input"
                  variant="box"
                  :model-value="isAllRowsSelected"
                  :indeterminate="isSomeRowsSelected && !isAllRowsSelected"
                  aria-label="Select all rows"
                  @click.stop
                  @change="toggleAllRows"
                />
              </template>

              <slot
                v-else
                :name="headerSlotName(columnItem.column)"
                v-bind="headerContext(columnItem)"
              >
                <VirtualTableRender
                  :render="columnItem.column.raw.headerRender"
                  :context="headerContext(columnItem)"
                  :fallback="columnItem.column.title"
                />
              </slot>

              <button
                v-if="isSortable(columnItem.column)"
                class="virtual-table-sort-button"
                type="button"
                :class="{ active: sortOrderForColumn(columnItem.column) }"
                :aria-label="sortButtonLabel(columnItem.column)"
                @click.stop="toggleSort(columnItem.column)"
              >
                <component
                  :is="sortIcon(columnItem.column)"
                  :size="14"
                  :stroke-width="2.1"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          <div
            v-if="rightColumnSpacer > 0"
            class="virtual-table-column-spacer"
            aria-hidden="true"
          />
        </div>

        <div
          class="virtual-table-body"
          :style="bodyStyle"
          role="rowgroup"
        >
          <div
            v-for="rowItem in renderedRows"
            :key="rowItem.rowKey"
            :ref="element => bindRowElement(rowItem, element)"
            class="virtual-table-row"
            :class="rowClasses(rowItem)"
            :style="rowStyleValue(rowItem)"
            role="row"
            :aria-rowindex="rowItem.rowIndex + 1"
            :aria-selected="rowItem.selected ? 'true' : 'false'"
            :aria-label="rowAriaLabel(rowItem)"
            @click="handleRowClick(rowItem, $event)"
          >
            <div
              v-if="leftColumnSpacer > 0"
              class="virtual-table-column-spacer"
              aria-hidden="true"
            />

            <div
              v-for="columnItem in renderedColumns"
              :key="`${rowItem.rowKey}-${columnItem.column.id}`"
              class="virtual-table-cell"
              :class="cellClasses(rowItem, columnItem)"
              :style="cellStyle(rowItem, columnItem)"
              role="gridcell"
              :aria-colindex="columnItem.index + 1"
              @click="handleCellClick(rowItem, columnItem.column, $event)"
            >
              <div class="virtual-table-cell-content">
                <template v-if="columnItem.column.internalType === 'selection'">
                  <!-- Single-select stays a native radio: `Radio.vue` draws the
                       画线 ink ring, which is the wrong register for a
                       label-less dense row (the same finding that produced
                       `Checkbox variant="box"`). The two modes are mutually
                       exclusive, so they never appear side by side. -->
                  <input
                    v-if="selectionMode === 'single'"
                    class="virtual-table-selection-radio"
                    type="radio"
                    :name="selectionInputName"
                    :checked="rowItem.selected"
                    :disabled="!rowItem.selectable"
                    :aria-label="`Select row ${rowItem.rowIndex + 1}`"
                    @click.stop
                    @change.stop="toggleRowSelection(rowItem)"
                  >
                  <Checkbox
                    v-else
                    class="virtual-table-selection-input"
                    variant="box"
                    :model-value="rowItem.selected"
                    :disabled="!rowItem.selectable"
                    :aria-label="`Select row ${rowItem.rowIndex + 1}`"
                    @click.stop
                    @change="toggleRowSelection(rowItem)"
                  />
                </template>

                <slot
                  v-else
                  :name="cellSlotName(columnItem.column)"
                  v-bind="cellContext(rowItem, columnItem)"
                >
                  <VirtualTableRender
                    :render="cellRender(columnItem.column)"
                    :context="cellContext(rowItem, columnItem)"
                    :fallback="cellFallback(rowItem, columnItem.column)"
                  />
                </slot>
              </div>
            </div>

            <div
              v-if="rightColumnSpacer > 0"
              class="virtual-table-column-spacer"
              aria-hidden="true"
            />
          </div>

          <div
            v-if="showEmptyState"
            class="virtual-table-state virtual-table-empty"
            :style="stateStyle"
          >
            <slot name="empty">
              {{ emptyText }}
            </slot>
          </div>

          <div
            v-if="loading"
            class="virtual-table-state virtual-table-loading"
            :style="stateStyle"
          >
            <slot name="loading">
              {{ loadingText }}
            </slot>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" generic="Row extends VirtualTableRow = VirtualTableRow">
import {
  computed,
  getCurrentInstance,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComponentPublicInstance,
  type CSSProperties,
  type StyleValue,
  type VNodeChild,
} from 'vue'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-vue-next'
import Checkbox from './Checkbox.vue'
import VirtualTableRender from './virtual-table/VirtualTableRender'
import { useVirtualAxis, type VirtualAxisItem } from './virtual-table/useVirtualAxis'
import type {
  VirtualTableAlign,
  VirtualTableCellRenderContext,
  VirtualTableClassValue,
  VirtualTableColumn,
  VirtualTableHeaderRenderContext,
  VirtualTableProps,
  VirtualTableRef,
  VirtualTableRow,
  VirtualTableRowContext,
  VirtualTableRowKey,
  VirtualTableScrollAlign,
  VirtualTableScrollBehavior,
  VirtualTableScrollToOptions,
  VirtualTableSortOrder,
  VirtualTableSortState,
  VirtualTableVisibleRange,
} from './virtual-table/types'

interface NormalizedColumn {
  id: string
  raw: VirtualTableColumn<Row>
  title: string
  width: number
  align: VirtualTableAlign
  headerAlign: VirtualTableAlign
  ellipsis: boolean
  sourceIndex: number
  internalType?: 'selection'
}

interface DisplayRow {
  row: Row
  sourceIndex: number
}

interface RenderedColumn {
  item: VirtualAxisItem
  column: NormalizedColumn
  index: number
}

interface RenderedRow {
  item: VirtualAxisItem
  row: Row
  rowIndex: number
  sourceIndex: number
  rowKey: VirtualTableRowKey
  selected: boolean
  selectable: boolean
}

const DEFAULT_WIDTH = 160
const DEFAULT_MIN_WIDTH = 80
const DEFAULT_HEIGHT = 420
const DEFAULT_ROW_HEIGHT = 44
const DEFAULT_HEADER_HEIGHT = 40
const DEFAULT_OVERSCAN = 8
const DEFAULT_COLUMN_OVERSCAN = 2
const SIZE_EPSILON = 0.5

const props = withDefaults(defineProps<VirtualTableProps<Row>>(), {
  data: () => [],
  columns: () => [],
  rowKey: undefined,
  height: DEFAULT_HEIGHT,
  maxHeight: undefined,
  rowHeight: DEFAULT_ROW_HEIGHT,
  estimatedRowHeight: undefined,
  dynamicRowHeight: false,
  headerHeight: DEFAULT_HEADER_HEIGHT,
  overscan: DEFAULT_OVERSCAN,
  columnOverscan: DEFAULT_COLUMN_OVERSCAN,
  virtualizeColumns: false,
  showHeader: true,
  stripe: false,
  border: false,
  loading: false,
  loadingText: 'Loading...',
  emptyText: 'No data',
  sortState: undefined,
  defaultSortState: undefined,
  sortMode: 'local',
  selectionMode: 'none',
  selectedRowKeys: undefined,
  defaultSelectedRowKeys: () => [],
  rowSelectable: undefined,
  selectOnRowClick: true,
  selectionColumnWidth: 44,
  rowClassName: undefined,
  rowStyle: undefined,
  getRowAriaLabel: undefined,
})

const emit = defineEmits<{
  'update:sortState': [state: VirtualTableSortState]
  'sort-change': [state: VirtualTableSortState]
  'update:selectedRowKeys': [keys: VirtualTableRowKey[]]
  'selection-change': [selection: Row[], keys: VirtualTableRowKey[]]
  'select': [selection: Row[], row: Row]
  'select-all': [selection: Row[]]
  'row-click': [row: Row, event: MouseEvent]
  'cell-click': [row: Row, column: VirtualTableColumn<Row>, event: MouseEvent]
  'scroll': [state: {
    scrollTop: number
    scrollLeft: number
    scrollHeight: number
    scrollWidth: number
    clientHeight: number
    clientWidth: number
  }]
}>()

const instance = getCurrentInstance()
const selectionInputName = `virtual-table-selection-${instance?.uid ?? Math.random().toString(36).slice(2)}`

const scrollerRef = ref<HTMLElement | null>(null)
const viewportWidth = ref(800)
const viewportHeight = ref(numericLength(props.height) ?? DEFAULT_HEIGHT)
const scrollTop = ref(0)
const scrollLeft = ref(0)
const internalSortState = ref<VirtualTableSortState>(props.defaultSortState ?? { order: null })
const internalSelectedKeys = ref<Set<VirtualTableRowKey>>(new Set(props.defaultSelectedRowKeys))
const dynamicRowHeightEnabled = computed(() => props.dynamicRowHeight)

let viewportResizeObserver: ResizeObserver | null = null
let rowResizeObserver: ResizeObserver | null = null
let measurementFrame = 0
const rowElements = new Map<VirtualTableRowKey, HTMLElement>()
const rowElementMeta = new WeakMap<Element, { index: number, key: VirtualTableRowKey }>()
const pendingMeasurements = new Map<VirtualTableRowKey, { index: number, size: number }>()

const showHeader = computed(() => props.showHeader)
const headerHeight = computed(() => showHeader.value ? Math.max(0, props.headerHeight) : 0)
const bodyViewportHeight = computed(() => Math.max(0, viewportHeight.value - headerHeight.value))
const effectiveRowEstimate = computed(() => Math.max(1, props.estimatedRowHeight ?? props.rowHeight))
const rowOverscan = computed(() => Math.max(0, props.overscan))
const columnOverscan = computed(() => props.virtualizeColumns ? Math.max(0, props.columnOverscan) : normalizedColumns.value.length)
const selectionMode = computed(() => props.selectionMode)

const sourceColumns = computed<VirtualTableColumn<Row>[]>(() => {
  if (props.columns.length > 0) return props.columns

  const firstRow = props.data[0]
  if (!firstRow) return []
  const firstRowRecord = firstRow as Record<string, unknown>

  return Object.keys(firstRowRecord)
    .filter(key => !Array.isArray(firstRowRecord[key]))
    .map(key => ({
      key,
      field: key,
      title: humanizeKey(key),
      width: DEFAULT_WIDTH,
    })) as VirtualTableColumn<Row>[]
})

const normalizedDataColumns = computed<NormalizedColumn[]>(() => {
  const usedKeys = new Set<string>()

  return sourceColumns.value.map((column, index) => {
    const field = columnField(column)
    const baseId = String(column.key ?? field ?? column.title ?? `column-${index}`)
    const id = uniqueColumnId(baseId, index, usedKeys)
    const minWidth = resolveLength(column.minWidth, DEFAULT_MIN_WIDTH)
    const maxWidth = column.maxWidth === undefined ? undefined : resolveLength(column.maxWidth, Number.POSITIVE_INFINITY)
    const fallbackWidth = Math.max(DEFAULT_MIN_WIDTH, minWidth)
    const width = clamp(resolveLength(column.width, fallbackWidth), minWidth, maxWidth ?? Number.POSITIVE_INFINITY)
    const align = column.align ?? 'left'

    return {
      id,
      raw: column,
      title: column.title ?? humanizeKey(field ?? id),
      width,
      align,
      headerAlign: column.headerAlign ?? align,
      ellipsis: column.ellipsis ?? true,
      sourceIndex: index,
    }
  })
})

const normalizedColumns = computed<NormalizedColumn[]>(() => {
  if (selectionMode.value === 'none') return normalizedDataColumns.value

  return [
    {
      id: '__selection',
      raw: {
        key: '__selection',
        title: '',
        width: props.selectionColumnWidth,
        align: 'center',
        headerAlign: 'center',
        ellipsis: true,
      } satisfies VirtualTableColumn<Row>,
      title: '',
      width: Math.max(32, props.selectionColumnWidth),
      align: 'center',
      headerAlign: 'center',
      ellipsis: true,
      sourceIndex: -1,
      internalType: 'selection',
    },
    ...normalizedDataColumns.value,
  ]
})

const mergedSortState = computed<VirtualTableSortState>(() => props.sortState ?? internalSortState.value)

const sortedColumn = computed(() => {
  const state = mergedSortState.value
  if (!state.order) return undefined

  return normalizedDataColumns.value.find(column => {
    const field = columnField(column.raw)
    return column.id === state.key || (field !== undefined && field === state.field)
  })
})

const displayRows = computed<DisplayRow[]>(() => {
  const rows = props.data.map((row, sourceIndex) => ({ row, sourceIndex }))
  const state = mergedSortState.value
  const column = sortedColumn.value

  if (!state.order || !column || props.sortMode === 'remote' || column.raw.sortable === 'custom') {
    return rows
  }

  const order = state.order
  return [...rows].sort((left, right) => {
    const customResult = column.raw.sortMethod?.(left.row, right.row, order)
    if (typeof customResult === 'number' && Number.isFinite(customResult)) return customResult

    const leftValue = getCellValue(left.row, column.raw, left.sourceIndex)
    const rightValue = getCellValue(right.row, column.raw, right.sourceIndex)
    const result = compareValues(leftValue, rightValue)
    return order === 'asc' ? result : -result
  })
})

const displayRowCount = computed(() => displayRows.value.length)
const selectedKeySet = computed(() => props.selectedRowKeys ? new Set(props.selectedRowKeys) : internalSelectedKeys.value)

const rowAxis = useVirtualAxis({
  count: displayRowCount,
  viewportSize: bodyViewportHeight,
  scrollOffset: scrollTop,
  overscan: rowOverscan,
  estimateSize: () => dynamicRowHeightEnabled.value ? effectiveRowEstimate.value : props.rowHeight,
  getKey: index => rowKeyAt(index),
  dynamic: dynamicRowHeightEnabled,
})

const columnAxis = useVirtualAxis({
  count: computed(() => normalizedColumns.value.length),
  viewportSize: viewportWidth,
  scrollOffset: scrollLeft,
  overscan: columnOverscan,
  estimateSize: index => normalizedColumns.value[index]?.width ?? DEFAULT_WIDTH,
})

const renderedColumnItems = computed<VirtualAxisItem[]>(() => {
  if (props.virtualizeColumns) return columnAxis.items.value

  let offset = 0
  return normalizedColumns.value.map((column, index) => {
    const start = offset
    offset += column.width
    return {
      index,
      key: column.id,
      start,
      size: column.width,
      end: offset,
    }
  })
})

const renderedColumns = computed<RenderedColumn[]>(() => renderedColumnItems.value
  .map(item => {
    const column = normalizedColumns.value[item.index]
    return column ? { item, column, index: item.index } : undefined
  })
  .filter((item): item is RenderedColumn => Boolean(item)))

const contentWidth = computed(() => Math.max(viewportWidth.value, columnAxis.totalSize.value))
const leftColumnSpacer = computed(() => renderedColumnItems.value[0]?.start ?? 0)
const rightColumnSpacer = computed(() => {
  const lastItem = renderedColumnItems.value[renderedColumnItems.value.length - 1]
  return Math.max(0, contentWidth.value - (lastItem?.end ?? 0))
})

const gridTemplateColumns = computed(() => {
  const parts: string[] = []
  if (leftColumnSpacer.value > 0) parts.push(`${leftColumnSpacer.value}px`)
  renderedColumnItems.value.forEach(item => parts.push(`${item.size}px`))
  if (rightColumnSpacer.value > 0) parts.push(`${rightColumnSpacer.value}px`)
  return parts.length > 0 ? parts.join(' ') : `${contentWidth.value}px`
})

const renderedRows = computed<RenderedRow[]>(() => rowAxis.items.value
  .map(item => {
    const entry = displayRows.value[item.index]
    if (!entry) return undefined

    const rowKey = getRowKey(entry.row, item.index)
    return {
      item,
      row: entry.row,
      rowIndex: item.index,
      sourceIndex: entry.sourceIndex,
      rowKey,
      selected: selectedKeySet.value.has(rowKey),
      selectable: isRowSelectable(entry.row, item.index),
    }
  })
  .filter((item): item is RenderedRow => Boolean(item)))

const bodyHeight = computed(() => displayRowCount.value > 0
  ? rowAxis.totalSize.value
  : bodyViewportHeight.value)

const stateTop = computed(() => clamp(scrollTop.value, 0, Math.max(0, bodyHeight.value - bodyViewportHeight.value)))

const viewportStyle = computed<StyleValue>(() => {
  const style: CSSProperties = {
    height: normalizeLength(props.height) ?? `${DEFAULT_HEIGHT}px`,
  }
  const maxHeight = normalizeLength(props.maxHeight)
  if (maxHeight) style.maxHeight = maxHeight
  return style
})

const innerStyle = computed<StyleValue>(() => ({
  width: `${contentWidth.value}px`,
  minWidth: '100%',
  minHeight: `${headerHeight.value + bodyHeight.value}px`,
}))

const headerStyle = computed<StyleValue>(() => ({
  height: `${headerHeight.value}px`,
  gridTemplateColumns: gridTemplateColumns.value,
}))

const bodyStyle = computed<StyleValue>(() => ({
  height: `${bodyHeight.value}px`,
  width: `${contentWidth.value}px`,
}))

const stateStyle = computed<StyleValue>(() => ({
  width: `${viewportWidth.value}px`,
  height: `${bodyViewportHeight.value}px`,
  transform: `translate3d(${scrollLeft.value}px, ${stateTop.value}px, 0)`,
}))

const tableClasses = computed(() => ({
  'is-striped': props.stripe,
  'is-bordered': props.border,
  'is-loading': props.loading,
  'is-dynamic-height': props.dynamicRowHeight,
  'is-column-virtualized': props.virtualizeColumns,
  'has-selection': selectionMode.value !== 'none',
}))

const showEmptyState = computed(() => !props.loading && displayRowCount.value === 0)
const selectableRows = computed(() => displayRows.value
  .map((entry, index) => ({
    row: entry.row,
    key: getRowKey(entry.row, index),
    selectable: isRowSelectable(entry.row, index),
  }))
  .filter(entry => entry.selectable))

const isAllRowsSelected = computed(() => {
  const rows = selectableRows.value
  return rows.length > 0 && rows.every(entry => selectedKeySet.value.has(entry.key))
})

const isSomeRowsSelected = computed(() => selectableRows.value.some(entry => selectedKeySet.value.has(entry.key)))

function rowKeyAt(index: number): VirtualTableRowKey {
  const entry = displayRows.value[index]
  return entry ? getRowKey(entry.row, index) : index
}

function getRowKey(row: Row, index: number): VirtualTableRowKey {
  const rowKey = props.rowKey
  const rowRecord = row as Record<string, unknown>

  if (typeof rowKey === 'function') return rowKey(row, index)
  if (typeof rowKey === 'string' && rowRecord[rowKey] !== undefined && rowRecord[rowKey] !== null) {
    return rowRecord[rowKey] as VirtualTableRowKey
  }
  if (rowRecord.id !== undefined && rowRecord.id !== null && (typeof rowRecord.id === 'string' || typeof rowRecord.id === 'number')) {
    return rowRecord.id
  }
  return index
}

function isRowSelectable(row: Row, index: number): boolean {
  if (selectionMode.value === 'none') return false
  return props.rowSelectable?.(row, index) ?? true
}

function updateViewportSize() {
  const scroller = scrollerRef.value
  const fallbackHeight = numericLength(props.height) ?? DEFAULT_HEIGHT
  const nextWidth = scroller?.clientWidth || Math.max(0, numericLength(scroller?.style.width) ?? viewportWidth.value)
  const nextHeight = scroller?.clientHeight || fallbackHeight

  viewportWidth.value = Math.max(0, nextWidth)
  viewportHeight.value = Math.max(0, nextHeight)
}

function handleScroll(event: Event) {
  const target = event.currentTarget as HTMLElement
  scrollTop.value = target.scrollTop
  scrollLeft.value = target.scrollLeft
  emit('scroll', {
    scrollTop: target.scrollTop,
    scrollLeft: target.scrollLeft,
    scrollHeight: target.scrollHeight,
    scrollWidth: target.scrollWidth,
    clientHeight: target.clientHeight,
    clientWidth: target.clientWidth,
  })
}

function bindRowElement(rowItem: RenderedRow, value: Element | ComponentPublicInstance | null) {
  const element = unwrapElement(value)
  const existing = rowElements.get(rowItem.rowKey)

  if (existing && existing !== element) {
    rowResizeObserver?.unobserve(existing)
    rowElements.delete(rowItem.rowKey)
  }

  if (!element || !dynamicRowHeightEnabled.value) return

  rowElements.set(rowItem.rowKey, element)
  rowElementMeta.set(element, {
    index: rowItem.rowIndex,
    key: rowItem.rowKey,
  })
  if (typeof ResizeObserver !== 'undefined') {
    ensureRowResizeObserver().observe(element)
  }
  queueMeasurement(rowItem.rowIndex, rowItem.rowKey, readElementHeight(element))
}

function ensureRowResizeObserver(): ResizeObserver {
  if (rowResizeObserver) return rowResizeObserver

  rowResizeObserver = new ResizeObserver(entries => {
    entries.forEach(entry => {
      const meta = rowElementMeta.get(entry.target)
      if (!meta) return
      queueMeasurement(meta.index, meta.key, readResizeEntryHeight(entry))
    })
  })

  return rowResizeObserver
}

function queueMeasurement(index: number, key: VirtualTableRowKey, size: number) {
  if (!Number.isFinite(size) || size <= 0) return

  pendingMeasurements.set(key, { index, size })
  if (measurementFrame) return

  measurementFrame = window.requestAnimationFrame(() => {
    measurementFrame = 0
    flushMeasurements()
  })
}

function flushMeasurements() {
  pendingMeasurements.forEach(({ index, size }) => {
    const delta = rowAxis.measureItem(index, size)
    if (Math.abs(delta) <= SIZE_EPSILON) return

    const scroller = scrollerRef.value
    if (scroller && index < rowAxis.range.value.start) {
      scroller.scrollTop += delta
      scrollTop.value = scroller.scrollTop
    }
  })
  pendingMeasurements.clear()
}

function clearObservedRows() {
  rowElements.forEach(element => rowResizeObserver?.unobserve(element))
  rowElements.clear()
  pendingMeasurements.clear()
}

function resetMeasurements() {
  rowAxis.resetMeasurements()
  pendingMeasurements.clear()
  nextTick(() => {
    rowElements.forEach((element, key) => {
      const meta = rowElementMeta.get(element)
      if (meta) queueMeasurement(meta.index, key, readElementHeight(element))
    })
  })
}

function toggleSort(column: NormalizedColumn) {
  if (!isSortable(column)) return

  const currentOrder = sortOrderForColumn(column)
  const nextOrder = nextSortOrder(currentOrder)
  const state: VirtualTableSortState = {
    key: column.id,
    field: columnField(column.raw),
    order: nextOrder,
  }

  if (!props.sortState) {
    internalSortState.value = state
  }

  emit('update:sortState', state)
  emit('sort-change', state)
}

function isSortable(column: NormalizedColumn): boolean {
  return column.internalType !== 'selection' && Boolean(column.raw.sortable)
}

function sortOrderForColumn(column: NormalizedColumn): VirtualTableSortOrder {
  const state = mergedSortState.value
  if (state.key === column.id) return state.order

  const field = columnField(column.raw)
  if (field && state.field === field) return state.order

  return null
}

function nextSortOrder(order: VirtualTableSortOrder): VirtualTableSortOrder {
  if (!order) return 'asc'
  if (order === 'asc') return 'desc'
  return null
}

function sortIcon(column: NormalizedColumn) {
  const order = sortOrderForColumn(column)
  if (order === 'asc') return ArrowUp
  if (order === 'desc') return ArrowDown
  return ArrowUpDown
}

function sortButtonLabel(column: NormalizedColumn): string {
  const order = sortOrderForColumn(column)
  const label = column.title || column.id
  if (!order) return `Sort ${label} ascending`
  if (order === 'asc') return `Sort ${label} descending`
  return `Clear ${label} sort`
}

function ariaSort(column: NormalizedColumn): 'ascending' | 'descending' | 'none' | undefined {
  if (!isSortable(column)) return undefined
  const order = sortOrderForColumn(column)
  if (order === 'asc') return 'ascending'
  if (order === 'desc') return 'descending'
  return 'none'
}

function toggleRowSelection(rowItem: RenderedRow) {
  if (!rowItem.selectable) return

  const nextKeys = new Set(selectedKeySet.value)
  if (selectionMode.value === 'single') {
    if (nextKeys.has(rowItem.rowKey)) {
      nextKeys.clear()
    } else {
      nextKeys.clear()
      nextKeys.add(rowItem.rowKey)
    }
  } else {
    if (nextKeys.has(rowItem.rowKey)) nextKeys.delete(rowItem.rowKey)
    else nextKeys.add(rowItem.rowKey)
  }

  commitSelection(nextKeys, rowItem.row)
}

function toggleAllRows() {
  if (selectionMode.value !== 'multiple') return

  const nextKeys = new Set(selectedKeySet.value)
  if (isAllRowsSelected.value) {
    selectableRows.value.forEach(entry => nextKeys.delete(entry.key))
  } else {
    selectableRows.value.forEach(entry => nextKeys.add(entry.key))
  }

  const selection = commitSelection(nextKeys)
  emit('select-all', selection)
}

function clearSelection() {
  commitSelection(new Set())
}

function commitSelection(keys: Set<VirtualTableRowKey>, changedRow?: Row): Row[] {
  const keyList = Array.from(keys)
  if (!props.selectedRowKeys) {
    internalSelectedKeys.value = new Set(keys)
  }

  const selection = selectedRowsForKeys(keys)
  emit('update:selectedRowKeys', keyList)
  emit('selection-change', selection, keyList)
  if (changedRow) emit('select', selection, changedRow)
  return selection
}

function selectedRowsForKeys(keys: Set<VirtualTableRowKey>): Row[] {
  return displayRows.value
    .map((entry, index) => ({
      row: entry.row,
      key: getRowKey(entry.row, index),
    }))
    .filter(entry => keys.has(entry.key))
    .map(entry => entry.row)
}

function handleRowClick(rowItem: RenderedRow, event: MouseEvent) {
  if (props.selectOnRowClick && selectionMode.value !== 'none') {
    toggleRowSelection(rowItem)
  }
  emit('row-click', rowItem.row, event)
}

function handleCellClick(rowItem: RenderedRow, column: NormalizedColumn, event: MouseEvent) {
  if (column.internalType === 'selection') return
  emit('cell-click', rowItem.row, column.raw, event)
}

function rowClasses(rowItem: RenderedRow) {
  return [
    {
      'is-odd': rowItem.rowIndex % 2 === 1,
      'is-even': rowItem.rowIndex % 2 === 0,
      'is-selected': rowItem.selected,
      'is-disabled': selectionMode.value !== 'none' && !rowItem.selectable,
    },
    resolveClass(props.rowClassName, rowContext(rowItem)),
  ]
}

function rowStyleValue(rowItem: RenderedRow): StyleValue {
  const baseStyle: CSSProperties = {
    transform: `translate3d(0, ${rowItem.item.start}px, 0)`,
    width: `${contentWidth.value}px`,
    gridTemplateColumns: gridTemplateColumns.value,
  }

  if (!props.dynamicRowHeight) {
    baseStyle.height = `${rowItem.item.size}px`
  } else {
    baseStyle.minHeight = `${Math.max(1, props.rowHeight)}px`
  }

  const customStyle = resolveStyle(props.rowStyle, rowContext(rowItem))
  return customStyle ? [baseStyle, customStyle] : baseStyle
}

function rowContext(rowItem: RenderedRow): VirtualTableRowContext<Row> {
  return {
    row: rowItem.row,
    rowIndex: rowItem.rowIndex,
    rowKey: rowItem.rowKey,
    selected: rowItem.selected,
  }
}

function rowAriaLabel(rowItem: RenderedRow): string | undefined {
  return props.getRowAriaLabel?.(rowContext(rowItem))
}

function headerContext(columnItem: RenderedColumn): VirtualTableHeaderRenderContext<Row> {
  return {
    column: columnItem.column.raw,
    columnIndex: columnItem.column.sourceIndex,
    sortOrder: sortOrderForColumn(columnItem.column),
  }
}

function cellContext(rowItem: RenderedRow, columnItem: RenderedColumn): VirtualTableCellRenderContext<Row> {
  return {
    row: rowItem.row,
    column: columnItem.column.raw,
    value: getCellValue(rowItem.row, columnItem.column.raw, rowItem.sourceIndex),
    rowIndex: rowItem.rowIndex,
    columnIndex: columnItem.column.sourceIndex,
    rowKey: rowItem.rowKey,
    selected: rowItem.selected,
  }
}

function headerCellClasses(columnItem: RenderedColumn) {
  const context = headerContext(columnItem)
  return [
    `align-${columnItem.column.headerAlign}`,
    {
      'is-sortable': isSortable(columnItem.column),
      'is-sorted': Boolean(sortOrderForColumn(columnItem.column)),
      'is-selection': columnItem.column.internalType === 'selection',
    },
    resolveClass(columnItem.column.raw.headerClassName, context),
  ]
}

function headerCellStyle(columnItem: RenderedColumn): StyleValue {
  const context = headerContext(columnItem)
  return resolveStyle(columnItem.column.raw.headerStyle, context)
}

function cellClasses(rowItem: RenderedRow, columnItem: RenderedColumn) {
  const context = cellContext(rowItem, columnItem)
  return [
    `align-${columnItem.column.align}`,
    {
      'is-selection': columnItem.column.internalType === 'selection',
      'is-ellipsis': columnItem.column.ellipsis,
      'is-wrapping': !columnItem.column.ellipsis,
    },
    resolveClass(columnItem.column.raw.className, context),
  ]
}

function cellStyle(rowItem: RenderedRow, columnItem: RenderedColumn): StyleValue {
  const context = cellContext(rowItem, columnItem)
  return resolveStyle(columnItem.column.raw.cellStyle, context)
}

function cellRender(column: NormalizedColumn) {
  return column.raw.render ?? column.raw.formatter
}

function cellFallback(rowItem: RenderedRow, column: NormalizedColumn): VNodeChild {
  const value = getCellValue(rowItem.row, column.raw, rowItem.sourceIndex)
  if (value === undefined || value === null) return ''
  return String(value)
}

function headerSlotName(column: NormalizedColumn): string {
  return `header-${column.id}`
}

function cellSlotName(column: NormalizedColumn): string {
  return `cell-${column.id}`
}

function scrollTo(options: VirtualTableScrollToOptions) {
  scrollerRef.value?.scrollTo(options)
}

function scrollToRow(index: number, align: VirtualTableScrollAlign = 'start', behavior: VirtualTableScrollBehavior = 'auto') {
  scrollerRef.value?.scrollTo({
    top: rowAxis.getOffsetForIndex(index, align),
    behavior,
  })
}

function scrollToColumn(index: number, align: VirtualTableScrollAlign = 'start', behavior: VirtualTableScrollBehavior = 'auto') {
  scrollerRef.value?.scrollTo({
    left: columnAxis.getOffsetForIndex(index, align),
    behavior,
  })
}

function scrollToTop(behavior: VirtualTableScrollBehavior = 'auto') {
  scrollerRef.value?.scrollTo({ top: 0, left: 0, behavior })
}

function getVisibleRange(): VirtualTableVisibleRange {
  const rowRange = rowAxis.range.value
  const columnRange = props.virtualizeColumns
    ? columnAxis.range.value
    : {
      start: 0,
      end: normalizedColumns.value.length,
      overscanStart: 0,
      overscanEnd: normalizedColumns.value.length,
    }

  return {
    rows: rowRange,
    columns: columnRange,
  }
}

function columnField(column: VirtualTableColumn<Row>): string | undefined {
  const field = column.field ?? column.dataIndex
  return field === undefined ? undefined : String(field)
}

function getCellValue(row: Row, column: VirtualTableColumn<Row>, rowIndex: number): unknown {
  if (column.valueGetter) return column.valueGetter(row, rowIndex)

  const field = columnField(column)
  if (!field) return undefined
  return readPath(row, field)
}

function readPath(source: Row, path: string): unknown {
  const sourceRecord = source as Record<string, unknown>
  if (!path.includes('.')) return sourceRecord[path]

  return path.split('.').reduce<unknown>((value, segment) => {
    if (value === null || value === undefined || typeof value !== 'object') return undefined
    return (value as Record<string, unknown>)[segment]
  }, source)
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0
  if (left === undefined || left === null) return 1
  if (right === undefined || right === null) return -1
  if (typeof left === 'number' && typeof right === 'number') return left - right

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function resolveClass<Context>(
  classValue: VirtualTableClassValue | ((context: Context) => VirtualTableClassValue),
  context: Context,
): VirtualTableClassValue {
  return typeof classValue === 'function' ? classValue(context) : classValue
}

function resolveStyle<Context>(
  styleValue: CSSProperties | ((context: Context) => CSSProperties | undefined) | undefined,
  context: Context,
): CSSProperties | undefined {
  return typeof styleValue === 'function' ? styleValue(context) : styleValue
}

function uniqueColumnId(baseId: string, index: number, usedKeys: Set<string>): string {
  const normalized = baseId.trim() || `column-${index}`
  if (!usedKeys.has(normalized)) {
    usedKeys.add(normalized)
    return normalized
  }

  let suffix = 2
  let candidate = `${normalized}-${suffix}`
  while (usedKeys.has(candidate)) {
    suffix += 1
    candidate = `${normalized}-${suffix}`
  }
  usedKeys.add(candidate)
  return candidate
}

function resolveLength(value: number | string | undefined, fallback: number): number {
  const parsed = numericLength(value)
  return parsed === undefined ? fallback : parsed
}

function numericLength(value: number | string | undefined): number | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : undefined

  const trimmed = value.trim()
  if (!trimmed) return undefined
  const matched = trimmed.match(/^(\d+(?:\.\d+)?)(px)?$/i)
  if (!matched) return undefined

  const parsed = Number(matched[1])
  return Number.isFinite(parsed) ? Math.max(0, parsed) : undefined
}

function normalizeLength(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? `${Math.max(0, value)}px` : undefined

  const trimmed = value.trim()
  return trimmed || undefined
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function unwrapElement(value: Element | ComponentPublicInstance | null): HTMLElement | null {
  if (!value) return null
  if (value instanceof HTMLElement) return value

  const element = '$el' in value ? value.$el : null
  return element instanceof HTMLElement ? element : null
}

function readResizeEntryHeight(entry: ResizeObserverEntry): number {
  const borderBox = entry.borderBoxSize as ResizeObserverSize | readonly ResizeObserverSize[] | undefined
  const firstBorderBox = Array.isArray(borderBox) ? borderBox[0] : borderBox
  if (firstBorderBox) return firstBorderBox.blockSize
  return readElementHeight(entry.target)
}

function readElementHeight(element: Element): number {
  return element.getBoundingClientRect().height
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

watch(() => props.defaultSelectedRowKeys, value => {
  if (!props.selectedRowKeys) {
    internalSelectedKeys.value = new Set(value)
  }
})

watch(() => props.dynamicRowHeight, enabled => {
  if (!enabled) {
    clearObservedRows()
    rowAxis.resetMeasurements()
    return
  }

  nextTick(() => {
    renderedRows.value.forEach(row => {
      const element = rowElements.get(row.rowKey)
      if (element) queueMeasurement(row.rowIndex, row.rowKey, readElementHeight(element))
    })
  })
})

watch([() => props.height, () => props.maxHeight], () => {
  nextTick(updateViewportSize)
})

onMounted(() => {
  updateViewportSize()

  if (scrollerRef.value && typeof ResizeObserver !== 'undefined') {
    viewportResizeObserver = new ResizeObserver(updateViewportSize)
    viewportResizeObserver.observe(scrollerRef.value)
  } else {
    window.addEventListener('resize', updateViewportSize)
  }
})

onBeforeUnmount(() => {
  viewportResizeObserver?.disconnect()
  rowResizeObserver?.disconnect()
  if (measurementFrame) window.cancelAnimationFrame(measurementFrame)
  window.removeEventListener('resize', updateViewportSize)
  clearObservedRows()
})

defineExpose<VirtualTableRef>({
  scrollTo,
  scrollToRow,
  scrollToColumn,
  scrollToTop,
  getScrollElement: () => scrollerRef.value,
  getVisibleRange,
  resetMeasurements,
  clearSelection,
})
</script>

<style scoped>
.virtual-table {
  --virtual-table-bg: var(--ui-surface-panel-bg);
  --virtual-table-head-bg: var(--ui-surface-elevated-bg);
  --virtual-table-row-bg: var(--virtual-table-bg);
  --virtual-table-row-hover-bg: var(--ui-state-hover-bg);
  --virtual-table-stripe-bg: color-mix(in srgb, var(--ui-text-muted-fg) 5%, transparent);
  --virtual-table-border: var(--ui-border-default-border);
  --virtual-table-strong-border: color-mix(in srgb, var(--virtual-table-border) 72%, var(--ui-text-primary-fg) 28%);
  --virtual-table-fg: var(--ui-text-primary-fg);
  --virtual-table-muted-fg: var(--ui-text-muted-fg);
  --virtual-table-accent: var(--ui-accent-primary-fg);
  width: 100%;
  color: var(--virtual-table-fg);
  font-family: var(--font-body, system-ui, sans-serif);
  font-size: var(--type-label-size, 13px);
  line-height: var(--type-label-line-height, 1.3077);
}

.virtual-table-viewport {
  position: relative;
  width: 100%;
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--virtual-table-border);
  border-radius: var(--radius-sm, 8px);
  background: var(--virtual-table-bg);
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--virtual-table-muted-fg) 26%, transparent) transparent;
}

.virtual-table-viewport::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.virtual-table-viewport::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--virtual-table-muted-fg) 30%, transparent);
  background-clip: content-box;
}

.virtual-table-viewport::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--virtual-table-muted-fg) 44%, transparent);
  background-clip: content-box;
}

.virtual-table-viewport::-webkit-scrollbar-corner {
  background: transparent;
}

.virtual-table-inner {
  position: relative;
}

.virtual-table-header {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: grid;
  min-width: 100%;
  border-bottom: 1px solid var(--virtual-table-strong-border);
  background: var(--virtual-table-head-bg);
}

.virtual-table-body {
  position: relative;
  min-width: 100%;
  background: var(--virtual-table-bg);
}

.virtual-table-row {
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  background: var(--virtual-table-row-bg);
  contain: layout paint style;
  will-change: transform;
}

.virtual-table-header-cell,
.virtual-table-cell {
  min-width: 0;
  border-bottom: 1px solid var(--virtual-table-border);
}

.virtual-table-header-cell {
  display: flex;
  align-items: center;
  color: var(--virtual-table-muted-fg);
  font-size: var(--type-caption-size, 11px);
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0;
  text-transform: uppercase;
  background: var(--virtual-table-head-bg);
}

.virtual-table-cell {
  display: flex;
  align-items: stretch;
  color: var(--virtual-table-fg);
  background: var(--virtual-table-row-bg);
}

.virtual-table.is-bordered .virtual-table-header-cell,
.virtual-table.is-bordered .virtual-table-cell {
  border-right: 1px solid var(--virtual-table-border);
}

.virtual-table.is-striped .virtual-table-row.is-odd .virtual-table-cell {
  background: var(--virtual-table-stripe-bg);
}

.virtual-table-row:hover .virtual-table-cell {
  background: var(--virtual-table-row-hover-bg);
}

.virtual-table-row.is-selected .virtual-table-cell {
  background: color-mix(in srgb, var(--virtual-table-accent) 10%, var(--virtual-table-bg));
}

.virtual-table-row.is-disabled {
  color: var(--virtual-table-muted-fg);
}

.virtual-table-cell-content {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 0 12px;
}

.virtual-table-cell.is-ellipsis .virtual-table-cell-content {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.virtual-table-cell.is-wrapping .virtual-table-cell-content {
  align-items: flex-start;
  padding-top: 10px;
  padding-bottom: 10px;
  white-space: normal;
  overflow-wrap: anywhere;
}

.virtual-table-header-cell.align-center .virtual-table-cell-content,
.virtual-table-cell.align-center .virtual-table-cell-content {
  justify-content: center;
  text-align: center;
}

.virtual-table-header-cell.align-right .virtual-table-cell-content,
.virtual-table-cell.align-right .virtual-table-cell-content {
  justify-content: flex-end;
  text-align: right;
}

.virtual-table-sort-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  border-radius: var(--radius-xs, 4px);
  color: var(--virtual-table-muted-fg);
  background: transparent;
  cursor: pointer;
}

.virtual-table-sort-button:hover,
.virtual-table-sort-button.active {
  color: var(--virtual-table-accent);
  background: color-mix(in srgb, var(--virtual-table-accent) 10%, transparent);
}

/* `.virtual-table-selection-input` now lands on `Checkbox variant="box"`'s root
   and deliberately carries no rule: a (0,2,0) selector here would tie with the
   component's own `.app-checkbox--box` and be settled by injection order
   (ui-system.md §1). Only the single-select radio, still native, is sized here. */
.virtual-table-selection-radio {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--virtual-table-accent);
}

.virtual-table-column-spacer {
  min-width: 0;
  pointer-events: none;
}

.virtual-table-state {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--virtual-table-muted-fg);
  background: color-mix(in srgb, var(--virtual-table-bg) 86%, transparent);
  pointer-events: none;
}

.virtual-table-loading {
  background: color-mix(in srgb, var(--virtual-table-bg) 72%, transparent);
  backdrop-filter: blur(1px);
}
</style>
