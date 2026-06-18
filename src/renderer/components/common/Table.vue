<template>
  <div
    ref="rootRef"
    class="app-table"
    :class="tableClasses"
    :style="tableStyle"
  >
    <Scrollbar
      ref="scrollbarRef"
      class="app-table-scrollbar"
      :height="height"
      :max-height="maxHeight"
      horizontal
    >
      <table
        class="app-table-element"
        role="table"
      >
        <colgroup>
          <col
            v-for="column in leafColumns"
            :key="column.id"
            :style="colStyle(column)"
          >
        </colgroup>

        <thead
          v-if="showHeader"
          class="app-table-head"
        >
          <tr
            v-for="(headerRow, rowIndex) in headerRows"
            :key="`header-${rowIndex}`"
            class="app-table-head-row"
          >
            <th
              v-for="cell in headerRow"
              :key="cell.column.id"
              class="app-table-head-cell"
              :class="headerCellClasses(cell, rowIndex)"
              :style="headerCellStyle(cell, rowIndex)"
              :colspan="cell.colspan"
              :rowspan="cell.rowspan"
              scope="col"
            >
              <div class="app-table-head-content">
                <template v-if="cell.column.type === 'selection'">
                  <input
                    class="app-table-selection-input"
                    type="checkbox"
                    :checked="isAllVisibleSelected"
                    :aria-checked="isAllVisibleSelected ? 'true' : isSomeVisibleSelected ? 'mixed' : 'false'"
                    aria-label="Select all rows"
                    @click.stop
                    @change="toggleAllSelection"
                  >
                </template>

                <slot
                  v-else
                  :name="headerSlotName(cell.column)"
                  v-bind="headerSlotScope(cell, rowIndex)"
                >
                  <span class="app-table-head-label">{{ cell.column.label }}</span>
                </slot>

                <Button
                  v-if="isSortable(cell.column)"
                  unstyled
                  class="app-table-head-icon-button app-table-sort-button"
                  :class="{ active: sortState.columnId === cell.column.id && sortState.order }"
                  :icon="sortIcon(cell.column)"
                  :aria-label="sortButtonLabel(cell.column)"
                  @click.stop="toggleSort(cell.column)"
                />

                <div
                  v-if="cell.column.filters?.length"
                  class="app-table-filter"
                >
                  <Button
                    unstyled
                    class="app-table-head-icon-button app-table-filter-button"
                    :class="{
                      active: activeFilterValues(cell.column).length > 0,
                      open: openFilterColumnId === cell.column.id,
                    }"
                    :icon="Filter"
                    :aria-label="`Filter ${cell.column.label || cell.column.id}`"
                    aria-haspopup="menu"
                    :aria-expanded="openFilterColumnId === cell.column.id"
                    @click.stop="toggleFilterMenu(cell.column, $event)"
                  />

                  <Teleport to="body">
                    <Transition name="app-table-filter-menu">
                      <div
                        v-if="openFilterColumnId === cell.column.id"
                        class="app-table-filter-menu"
                        :style="filterMenuStyle"
                        data-app-table-filter-menu
                        role="menu"
                        @click.stop
                      >
                        <Button
                          v-for="option in cell.column.filters"
                          :key="filterOptionKey(option.value)"
                          unstyled
                          class="app-table-filter-option"
                          :class="{ selected: isFilterValueActive(cell.column, option.value) }"
                          native-type="button"
                          role="menuitemcheckbox"
                          :aria-checked="isFilterValueActive(cell.column, option.value)"
                          @click="toggleFilterValue(cell.column, option.value)"
                        >
                          <span
                            class="app-table-filter-check"
                            aria-hidden="true"
                          >
                            <Check
                              v-if="isFilterValueActive(cell.column, option.value)"
                              :size="13"
                              :stroke-width="2.2"
                            />
                          </span>
                          <span class="app-table-filter-label">{{ option.text }}</span>
                        </Button>

                        <div class="app-table-filter-actions">
                          <Button
                            text
                            size="small"
                            :disabled="activeFilterValues(cell.column).length === 0"
                            @click="clearFilter(cell.column)"
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                    </Transition>
                  </Teleport>
                </div>
              </div>
            </th>
          </tr>
        </thead>

        <tbody class="app-table-body">
          <template
            v-for="rowState in visibleRowStates"
            :key="rowState.key"
          >
            <tr
              class="app-table-row"
              :class="rowClasses(rowState)"
              :style="rowStyleValue(rowState)"
              @click="handleRowClick(rowState, $event)"
            >
              <template
                v-for="(column, columnIndex) in leafColumns"
                :key="column.id"
              >
                <td
                  v-if="isCellVisible(rowState.rowIndex, columnIndex)"
                  class="app-table-cell"
                  :class="cellClasses(rowState, column, columnIndex)"
                  :style="cellStyle(column, columnIndex)"
                  :rowspan="cellSpan(rowState.rowIndex, columnIndex).rowspan"
                  :colspan="cellSpan(rowState.rowIndex, columnIndex).colspan"
                  @click="handleCellClick(rowState, column, $event)"
                >
                  <div
                    class="app-table-cell-content"
                    :class="{ 'is-tree-cell': isTreeCell(column) }"
                    :style="treeCellStyle(rowState, column)"
                  >
                    <template v-if="column.type === 'selection'">
                      <input
                        class="app-table-selection-input"
                        type="checkbox"
                        :checked="isRowSelected(rowState)"
                        :disabled="!isRowSelectable(rowState)"
                        :aria-label="`Select row ${rowState.rowIndex + 1}`"
                        @click.stop
                        @change="toggleRowSelection(rowState)"
                      >
                    </template>

                    <template v-else-if="column.type === 'index'">
                      <span class="app-table-index">{{ rowIndexText(rowState, column) }}</span>
                    </template>

                    <template v-else-if="column.type === 'expand'">
                      <Button
                        v-if="hasExpandableContent(rowState)"
                        unstyled
                        class="app-table-expand-button"
                        :class="{ expanded: rowState.expanded }"
                        :icon="ChevronRight"
                        :aria-label="rowState.expanded ? 'Collapse row' : 'Expand row'"
                        @click.stop="toggleRowExpansion(rowState)"
                      />
                      <span
                        v-else
                        class="app-table-expand-placeholder"
                        aria-hidden="true"
                      />
                    </template>

                    <template v-else>
                      <span
                        v-if="isTreeCell(column)"
                        class="app-table-tree-control"
                        aria-hidden="true"
                      >
                        <Button
                          v-if="rowState.hasChildren"
                          unstyled
                          class="app-table-expand-button app-table-tree-button"
                          :class="{ expanded: rowState.expanded, loading: rowState.loading }"
                          :icon="rowState.loading ? Loader2 : ChevronRight"
                          :aria-label="rowState.expanded ? 'Collapse tree row' : 'Expand tree row'"
                          @click.stop="toggleRowExpansion(rowState)"
                        />
                        <span
                          v-else
                          class="app-table-expand-placeholder"
                        />
                      </span>

                      <slot
                        :name="cellSlotName(column)"
                        v-bind="cellSlotScope(rowState, column, columnIndex)"
                      >
                        <Tooltip
                          v-if="shouldShowOverflowTooltip(column)"
                          :text="cellText(rowState, column)"
                          position="top"
                        >
                          <span class="app-table-cell-text is-overflow">
                            {{ cellText(rowState, column) }}
                          </span>
                        </Tooltip>
                        <span
                          v-else
                          class="app-table-cell-text"
                        >
                          {{ cellText(rowState, column) }}
                        </span>
                      </slot>
                    </template>
                  </div>
                </td>
              </template>
            </tr>

            <tr
              v-if="rowState.expanded && hasExpandSlot"
              class="app-table-expanded-row"
            >
              <td
                class="app-table-expanded-cell"
                :colspan="leafColumns.length"
              >
                <slot
                  name="expand"
                  v-bind="expandSlotScope(rowState)"
                />
              </td>
            </tr>
          </template>

          <tr
            v-if="visibleRowStates.length === 0"
            class="app-table-empty-row"
          >
            <td
              class="app-table-empty-cell"
              :colspan="Math.max(leafColumns.length, 1)"
            >
              <slot name="empty">
                {{ emptyText }}
              </slot>
            </td>
          </tr>
        </tbody>

        <tfoot
          v-if="showSummary && visibleRowStates.length > 0"
          class="app-table-foot"
        >
          <tr class="app-table-summary-row">
            <td
              v-for="(column, columnIndex) in leafColumns"
              :key="`summary-${column.id}`"
              class="app-table-summary-cell"
              :class="summaryCellClasses(column)"
              :style="summaryCellStyle(column, columnIndex)"
            >
              <div class="app-table-cell-content">
                <span class="app-table-cell-text">{{ summaryCells[columnIndex] }}</span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </Scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useSlots, watch, type CSSProperties, type StyleValue } from 'vue'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronRight, Filter, Loader2 } from 'lucide-vue-next'
import Button from './Button.vue'
import Scrollbar from './Scrollbar.vue'
import Tooltip from './Tooltip.vue'
import type {
  TableColumn,
  TableFixedSide,
  TableLoadFunction,
  TableRow,
  TableRowClassName,
  TableRowKey,
  TableRowStatus,
  TableRowStyle,
  TableSortChange,
  TableSortOrder,
  TableSpanMethod,
  TableSummaryMethod,
  TableTreeNode,
  TableTreeProps,
} from './table'

interface NormalizedColumn extends Omit<TableColumn, 'children'> {
  raw: TableColumn
  id: string
  slotKey: string
  level: number
  leafIndex: number
  leafCount: number
  widthPx: number
  widthStyle?: string
  minWidthStyle?: string
  fixedSide?: TableFixedSide
  left?: number
  right?: number
  parent?: NormalizedColumn
  children: NormalizedColumn[]
}

interface HeaderCell {
  column: NormalizedColumn
  colspan: number
  rowspan: number
  level: number
}

interface RowNode {
  row: TableRow
  key: TableRowKey
  level: number
  children: RowNode[]
  hasChildren: boolean
}

interface VisibleRowState extends RowNode {
  rowIndex: number
  expanded: boolean
  loading: boolean
}

interface CellSpan {
  rowspan: number
  colspan: number
}

interface TableScrollToOptions {
  top?: number
  left?: number
  behavior?: 'auto' | 'instant' | 'smooth'
}

const props = withDefaults(defineProps<{
  data?: TableRow[]
  columns?: TableColumn[]
  rowKey?: string | ((row: TableRow) => TableRowKey)
  stripe?: boolean
  border?: boolean
  showHeader?: boolean
  height?: number | string
  maxHeight?: number | string
  showOverflowTooltip?: boolean
  highlightCurrentRow?: boolean
  currentRowKey?: TableRowKey
  rowClassName?: TableRowClassName
  rowStyle?: TableRowStyle
  rowStatus?: (row: TableRow, index: number) => TableRowStatus | undefined
  defaultSort?: {
    prop?: string
    order?: TableSortOrder
  }
  emptyText?: string
  showSummary?: boolean
  sumText?: string
  summaryMethod?: TableSummaryMethod
  spanMethod?: TableSpanMethod
  selectable?: (row: TableRow, index: number) => boolean
  treeProps?: TableTreeProps
  defaultExpandAll?: boolean
  defaultExpandRowKeys?: TableRowKey[]
  expandRowKeys?: TableRowKey[]
  lazy?: boolean
  load?: TableLoadFunction
}>(), {
  data: () => [],
  columns: () => [],
  rowKey: undefined,
  stripe: false,
  border: false,
  showHeader: true,
  height: undefined,
  maxHeight: undefined,
  showOverflowTooltip: false,
  highlightCurrentRow: false,
  currentRowKey: undefined,
  rowClassName: undefined,
  rowStyle: undefined,
  rowStatus: undefined,
  defaultSort: undefined,
  emptyText: 'No data',
  showSummary: false,
  sumText: 'Sum',
  summaryMethod: undefined,
  spanMethod: undefined,
  selectable: undefined,
  treeProps: () => ({ children: 'children', hasChildren: 'hasChildren' }),
  defaultExpandAll: false,
  defaultExpandRowKeys: () => [],
  expandRowKeys: undefined,
  lazy: false,
  load: undefined,
})

const emit = defineEmits<{
  'sort-change': [change: TableSortChange]
  'filter-change': [filters: Record<string, unknown[]>]
  'selection-change': [selection: TableRow[]]
  'select': [selection: TableRow[], row: TableRow]
  'select-all': [selection: TableRow[]]
  'current-change': [currentRow: TableRow | undefined, oldCurrentRow: TableRow | undefined]
  'expand-change': [row: TableRow, expandedRows: TableRow[]]
  'update:expandRowKeys': [keys: TableRowKey[]]
  'row-click': [row: TableRow, event: MouseEvent]
  'cell-click': [row: TableRow, column: TableColumn, event: MouseEvent]
}>()

const HEADER_HEIGHT = 36
const DEFAULT_COLUMN_WIDTH = 140
const DEFAULT_MIN_COLUMN_WIDTH = 120
const FILTER_MENU_WIDTH = 188
const FILTER_MENU_GUTTER = 8
const SPECIAL_COLUMN_WIDTHS: Record<string, number> = {
  selection: 46,
  index: 64,
  expand: 46,
}

const slots = useSlots()
const rootRef = ref<HTMLElement | null>(null)
const scrollbarRef = ref<InstanceType<typeof Scrollbar> | null>(null)
const openFilterColumnId = ref<string | null>(null)
const filterMenuPosition = ref<CSSProperties>({})
const activeFilters = ref<Record<string, unknown[]>>({})
const selectedKeys = ref<Set<TableRowKey>>(new Set())
const internalExpandedKeys = ref<Set<TableRowKey>>(new Set())
const loadingKeys = ref<Set<TableRowKey>>(new Set())
const lazyChildren = ref<Map<TableRowKey, TableRow[]>>(new Map())
const currentKey = ref<TableRowKey | undefined>(props.currentRowKey)
const objectRowKeys = new WeakMap<object, TableRowKey>()
let generatedRowKey = 0

const sortState = ref<{
  columnId?: string
  prop?: string
  order: TableSortOrder
}>({
  columnId: undefined,
  prop: props.defaultSort?.prop,
  order: props.defaultSort?.order ?? null,
})

const sourceColumns = computed<TableColumn[]>(() => {
  if (props.columns.length > 0) return props.columns
  const firstRow = props.data[0]
  if (!firstRow) return []

  return Object.keys(firstRow)
    .filter(key => !Array.isArray(firstRow[key]))
    .map(key => ({
      prop: key,
      label: humanizeKey(key),
      minWidth: DEFAULT_MIN_COLUMN_WIDTH,
    }))
})

const normalizedColumns = computed(() => {
  const columns = normalizeColumns(sourceColumns.value)
  applyLeafLayout(columns.leaves)
  applyGroupLayout(columns.roots)
  return columns
})

const rootColumns = computed(() => normalizedColumns.value.roots)
const leafColumns = computed(() => normalizedColumns.value.leaves)
const maxHeaderDepth = computed(() => normalizedColumns.value.maxDepth)
const totalTableWidth = computed(() => leafColumns.value.reduce((sum, column) => sum + column.widthPx, 0))

const headerRows = computed<HeaderCell[][]>(() => {
  const rows: HeaderCell[][] = Array.from({ length: Math.max(1, maxHeaderDepth.value) }, () => [])

  function visit(column: NormalizedColumn) {
    const hasChildren = column.children.length > 0
    rows[column.level - 1]?.push({
      column,
      level: column.level,
      colspan: hasChildren ? column.leafCount : 1,
      rowspan: hasChildren ? 1 : Math.max(1, maxHeaderDepth.value - column.level + 1),
    })
    column.children.forEach(visit)
  }

  rootColumns.value.forEach(visit)
  return rows.filter(row => row.length > 0)
})

const sortableColumnsByProp = computed(() => {
  const map = new Map<string, NormalizedColumn>()
  leafColumns.value.forEach(column => {
    const prop = columnProp(column)
    if (prop) map.set(prop, column)
  })
  return map
})

const sortedColumn = computed(() => {
  if (sortState.value.columnId) {
    return leafColumns.value.find(column => column.id === sortState.value.columnId)
  }

  if (sortState.value.prop) {
    return sortableColumnsByProp.value.get(sortState.value.prop)
  }

  return undefined
})

const hasActiveFilters = computed(() => Object.values(activeFilters.value).some(values => values.length > 0))
const expandedKeySet = computed(() => props.expandRowKeys ? new Set(props.expandRowKeys) : internalExpandedKeys.value)

const processedRows = computed<RowNode[]>(() => buildRowNodes(props.data, 0))

const visibleRowStates = computed<VisibleRowState[]>(() => {
  const rows: VisibleRowState[] = []

  function visit(nodes: RowNode[]) {
    nodes.forEach(node => {
      const expanded = isKeyExpanded(node.key)
      const rowState: VisibleRowState = {
        ...node,
        rowIndex: rows.length,
        expanded,
        loading: loadingKeys.value.has(node.key),
      }
      rows.push(rowState)

      if (expanded && node.children.length > 0) {
        visit(node.children)
      }
    })
  }

  visit(processedRows.value)
  return rows
})

const visibleRows = computed(() => visibleRowStates.value.map(rowState => rowState.row))

const rowStateByKey = computed(() => {
  const map = new Map<TableRowKey, VisibleRowState>()
  visibleRowStates.value.forEach(rowState => map.set(rowState.key, rowState))
  return map
})

const spanMatrix = computed(() => {
  const map = new Map<string, CellSpan>()
  if (!props.spanMethod) return map

  visibleRowStates.value.forEach(rowState => {
    leafColumns.value.forEach((column, columnIndex) => {
      const span = normalizeSpan(props.spanMethod?.({
        row: rowState.row,
        column,
        rowIndex: rowState.rowIndex,
        columnIndex,
        visibleRows: visibleRows.value,
      }))
      map.set(spanKey(rowState.rowIndex, columnIndex), span)
    })
  })

  return map
})

const summaryCells = computed(() => {
  if (props.summaryMethod) {
    return props.summaryMethod({
      columns: leafColumns.value,
      data: visibleRows.value,
    })
  }

  return leafColumns.value.map((column, columnIndex) => {
    if (columnIndex === 0) return props.sumText
    if (!columnProp(column)) return ''

    const sum = visibleRows.value.reduce((total, row) => {
      const value = Number(getCellRawValue(row, column))
      return Number.isFinite(value) ? total + value : total
    }, 0)

    return sum === 0 ? '' : sum
  })
})

const treeAnchorColumnId = computed(() => {
  return leafColumns.value.find(column => !column.type || column.type === 'default')?.id
    ?? leafColumns.value[0]?.id
})

const hasSelectionColumn = computed(() => leafColumns.value.some(column => column.type === 'selection'))
const selectableVisibleRows = computed(() => visibleRowStates.value.filter(rowState => isRowSelectable(rowState)))
const selectedVisibleRows = computed(() => selectableVisibleRows.value.filter(rowState => isRowSelected(rowState)))
const isAllVisibleSelected = computed(() => selectableVisibleRows.value.length > 0 && selectedVisibleRows.value.length === selectableVisibleRows.value.length)
const isSomeVisibleSelected = computed(() => selectedVisibleRows.value.length > 0 && !isAllVisibleSelected.value)
const hasExpandSlot = computed(() => Boolean(slots.expand))

const tableClasses = computed(() => ({
  'is-striped': props.stripe,
  'is-bordered': props.border,
  'has-fixed-header': Boolean(props.height || props.maxHeight),
  'has-fixed-columns': leafColumns.value.some(column => column.fixedSide),
  'has-selection': hasSelectionColumn.value,
}))

const tableStyle = computed<StyleValue>(() => ({
  '--app-table-min-width': `${Math.max(totalTableWidth.value, DEFAULT_COLUMN_WIDTH)}px`,
  '--app-table-header-height': `${HEADER_HEIGHT}px`,
}))

const filterMenuStyle = computed<StyleValue>(() => filterMenuPosition.value)

watch(
  () => props.currentRowKey,
  value => {
    currentKey.value = value
  },
)

watch(
  () => props.defaultSort,
  value => {
    sortState.value = {
      columnId: undefined,
      prop: value?.prop,
      order: value?.order ?? null,
    }
  },
)

watch(
  leafColumns,
  columns => {
    const nextFilters: Record<string, unknown[]> = {}
    columns.forEach(column => {
      const current = activeFilters.value[column.id]
      if (current) {
        nextFilters[column.id] = current
      } else if (column.filteredValue) {
        nextFilters[column.id] = [...column.filteredValue]
      }
    })
    activeFilters.value = nextFilters
  },
  { immediate: true },
)

watch(
  [processedRows, () => props.defaultExpandAll, () => props.defaultExpandRowKeys],
  () => {
    if (props.expandRowKeys) return
    const next = new Set<TableRowKey>(props.defaultExpandRowKeys)
    if (props.defaultExpandAll) {
      collectExpandableKeys(processedRows.value, next)
    }
    if (internalExpandedKeys.value.size === 0 || props.defaultExpandAll || props.defaultExpandRowKeys.length > 0) {
      internalExpandedKeys.value = next
    }
  },
  { immediate: true },
)

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
  window.addEventListener('resize', closeFilterMenu)
  window.addEventListener('scroll', closeFilterMenu, true)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
  window.removeEventListener('resize', closeFilterMenu)
  window.removeEventListener('scroll', closeFilterMenu, true)
})

function normalizeColumns(columns: TableColumn[]) {
  const leaves: NormalizedColumn[] = []
  let maxDepth = 1

  function visit(source: TableColumn[], level: number, parent?: NormalizedColumn, inheritedFixed?: TableFixedSide): NormalizedColumn[] {
    maxDepth = Math.max(maxDepth, level)

    return source.map((column, index) => {
      const idBase = column.key ?? column.prop ?? column.property ?? `${parent?.id ?? 'root'}-column-${index}`
      const id = parent ? `${parent.id}.${idBase}` : String(idBase)
      const fixedSide = normalizeFixedSide(column.fixed) ?? inheritedFixed
      const normalized: NormalizedColumn = {
        ...column,
        raw: column,
        id,
        slotKey: String(column.key ?? column.prop ?? column.property ?? id),
        level,
        leafIndex: -1,
        leafCount: 1,
        widthPx: columnWidthPx(column),
        widthStyle: normalizeCssLength(column.width),
        minWidthStyle: normalizeCssLength(column.minWidth),
        fixedSide,
        parent,
        children: [],
      }

      normalized.children = column.children?.length
        ? visit(column.children, level + 1, normalized, fixedSide)
        : []

      if (normalized.children.length > 0) {
        normalized.leafCount = normalized.children.reduce((sum, child) => sum + child.leafCount, 0)
        normalized.widthPx = normalized.children.reduce((sum, child) => sum + child.widthPx, 0)
        normalized.fixedSide = fixedSide ?? sharedFixedSide(normalized.children)
      } else {
        normalized.leafIndex = leaves.length
        leaves.push(normalized)
      }

      return normalized
    })
  }

  return {
    roots: visit(columns, 1),
    leaves,
    maxDepth,
  }
}

function applyLeafLayout(columns: NormalizedColumn[]) {
  let left = 0
  columns.forEach((column, index) => {
    column.leafIndex = index
    if (column.fixedSide === 'left') {
      column.left = left
      left += column.widthPx
    }
  })

  let right = 0
  for (let index = columns.length - 1; index >= 0; index -= 1) {
    const column = columns[index]
    if (column.fixedSide === 'right') {
      column.right = right
      right += column.widthPx
    }
  }
}

function applyGroupLayout(columns: NormalizedColumn[]) {
  function visit(column: NormalizedColumn) {
    column.children.forEach(visit)
    if (column.children.length === 0 || !column.fixedSide) return

    const fixedLeaves = collectLeaves(column).filter(leaf => leaf.fixedSide === column.fixedSide)
    if (fixedLeaves.length === 0) return

    if (column.fixedSide === 'left') {
      column.left = Math.min(...fixedLeaves.map(leaf => leaf.left ?? 0))
    } else {
      column.right = Math.min(...fixedLeaves.map(leaf => leaf.right ?? 0))
    }
  }

  columns.forEach(visit)
}

function collectLeaves(column: NormalizedColumn): NormalizedColumn[] {
  if (column.children.length === 0) return [column]
  return column.children.flatMap(collectLeaves)
}

function sharedFixedSide(columns: NormalizedColumn[]): TableFixedSide | undefined {
  const leaves = columns.flatMap(collectLeaves)
  const first = leaves[0]?.fixedSide
  return first && leaves.every(leaf => leaf.fixedSide === first) ? first : undefined
}

function normalizeFixedSide(fixed: boolean | TableFixedSide | undefined): TableFixedSide | undefined {
  if (fixed === true) return 'left'
  if (fixed === 'left' || fixed === 'right') return fixed
  return undefined
}

function columnWidthPx(column: TableColumn): number {
  const explicitWidth = parsePixelLength(column.width)
  if (explicitWidth) return explicitWidth

  const explicitMinWidth = parsePixelLength(column.minWidth)
  if (explicitMinWidth) return explicitMinWidth

  if (column.type && SPECIAL_COLUMN_WIDTHS[column.type]) return SPECIAL_COLUMN_WIDTHS[column.type]
  return DEFAULT_COLUMN_WIDTH
}

function normalizeCssLength(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? `${Math.max(0, value)}px` : undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function parsePixelLength(value: number | string | undefined): number | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : undefined
  const trimmed = value.trim()
  if (/^\d+(\.\d+)?px?$/.test(trimmed)) return Number.parseFloat(trimmed)
  return undefined
}

function buildRowNodes(rows: TableRow[], level: number): RowNode[] {
  const nodes = rows
    .map((row, index) => {
      const key = resolveRowKey(row)
      const children = buildRowNodes(rowChildren(row, key), level + 1)
      const hasChildren = children.length > 0 || rowHasLazyChildren(row)
      const rowPasses = rowPassesFilters(row)

      if (hasActiveFilters.value && !rowPasses && children.length === 0) {
        return null
      }

      return {
        row,
        key,
        level,
        children,
        hasChildren,
        sourceIndex: index,
      }
    })
    .filter((node): node is RowNode & { sourceIndex: number } => Boolean(node))

  return sortNodes(nodes).map(({ sourceIndex: _sourceIndex, ...node }) => node)
}

function sortNodes(nodes: Array<RowNode & { sourceIndex: number }>) {
  const column = sortedColumn.value
  if (!column || !sortState.value.order || column.sortable === 'custom') return nodes

  const multiplier = sortState.value.order === 'ascending' ? 1 : -1
  return [...nodes].sort((a, b) => {
    const result = column.sortMethod
      ? column.sortMethod(a.row, b.row)
      : compareRowsByColumn(a.row, b.row, column, a.sourceIndex, b.sourceIndex)
    return result * multiplier
  })
}

function compareRowsByColumn(a: TableRow, b: TableRow, column: NormalizedColumn, aIndex: number, bIndex: number) {
  const aValue = sortValue(a, column, aIndex)
  const bValue = sortValue(b, column, bIndex)

  if (aValue === bValue) return 0
  if (aValue === undefined || aValue === null) return -1
  if (bValue === undefined || bValue === null) return 1
  if (typeof aValue === 'number' && typeof bValue === 'number') return aValue - bValue

  const aDate = aValue instanceof Date ? aValue.getTime() : undefined
  const bDate = bValue instanceof Date ? bValue.getTime() : undefined
  if (aDate !== undefined && bDate !== undefined) return aDate - bDate

  return String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: 'base' })
}

function sortValue(row: TableRow, column: NormalizedColumn, index: number): unknown {
  if (typeof column.sortBy === 'function') return column.sortBy(row, index)
  if (Array.isArray(column.sortBy)) return column.sortBy.map(key => getByPath(row, key)).join('\u0000')
  if (typeof column.sortBy === 'string') return getByPath(row, column.sortBy)
  return getCellRawValue(row, column)
}

function rowPassesFilters(row: TableRow) {
  return leafColumns.value.every(column => {
    const values = activeFilters.value[column.id] ?? []
    if (values.length === 0) return true

    return values.some(value => {
      if (column.filterMethod) return column.filterMethod(value, row, column)
      return isSameValue(getCellRawValue(row, column), value)
    })
  })
}

function rowChildren(row: TableRow, key: TableRowKey): TableRow[] {
  if (lazyChildren.value.has(key)) return lazyChildren.value.get(key) ?? []
  const childrenProp = props.treeProps.children ?? 'children'
  const value = getByPath(row, childrenProp)
  return Array.isArray(value) ? value.filter(isTableRow) : []
}

function rowHasLazyChildren(row: TableRow) {
  if (!props.lazy) return false
  const hasChildrenProp = props.treeProps.hasChildren ?? 'hasChildren'
  return Boolean(getByPath(row, hasChildrenProp))
}

function isTableRow(value: unknown): value is TableRow {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function resolveRowKey(row: TableRow): TableRowKey {
  if (typeof props.rowKey === 'function') return props.rowKey(row)
  if (typeof props.rowKey === 'string') {
    const key = getByPath(row, props.rowKey)
    if (typeof key === 'string' || typeof key === 'number') return key
  }

  const objectRow = row as object
  const cached = objectRowKeys.get(objectRow)
  if (cached !== undefined) return cached

  generatedRowKey += 1
  const key = `row-${generatedRowKey}`
  objectRowKeys.set(objectRow, key)
  return key
}

function getByPath(row: TableRow, path: string | undefined): unknown {
  if (!path) return undefined
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[segment]
    }
    return undefined
  }, row)
}

function columnProp(column: TableColumn) {
  return column.prop ?? column.property
}

function getCellRawValue(row: TableRow, column: TableColumn): unknown {
  return getByPath(row, columnProp(column))
}

function getCellDisplayValue(rowState: VisibleRowState, column: NormalizedColumn): unknown {
  const raw = getCellRawValue(rowState.row, column)
  return column.formatter
    ? column.formatter(rowState.row, column, raw, rowState.rowIndex)
    : raw
}

function cellText(rowState: VisibleRowState, column: NormalizedColumn) {
  const value = getCellDisplayValue(rowState, column)
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function headerSlotName(column: NormalizedColumn) {
  return column.headerSlot ?? `header-${column.slotKey}`
}

function cellSlotName(column: NormalizedColumn) {
  return column.slot ?? `cell-${column.slotKey}`
}

function headerSlotScope(cell: HeaderCell, rowIndex: number) {
  return {
    column: cell.column.raw,
    columnIndex: cell.column.leafIndex,
    level: rowIndex,
    store: tableStore(),
  }
}

function cellSlotScope(rowState: VisibleRowState, column: NormalizedColumn, columnIndex: number) {
  return {
    row: rowState.row,
    column: column.raw,
    $index: rowState.rowIndex,
    rowIndex: rowState.rowIndex,
    columnIndex,
    store: tableStore(),
  }
}

function expandSlotScope(rowState: VisibleRowState) {
  return {
    row: rowState.row,
    $index: rowState.rowIndex,
    rowIndex: rowState.rowIndex,
    store: tableStore(),
  }
}

function tableStore() {
  return {
    sortState: sortState.value,
    filters: activeFilters.value,
    selection: getSelectedRows(),
    currentRowKey: currentKey.value,
    expandedRowKeys: Array.from(expandedKeySet.value),
  }
}

function isSortable(column: NormalizedColumn) {
  return Boolean(column.sortable)
}

function toggleSort(column: NormalizedColumn) {
  const nextOrder = nextSortOrder(sortState.value.columnId === column.id ? sortState.value.order : null)
  sortState.value = {
    columnId: nextOrder ? column.id : undefined,
    prop: nextOrder ? columnProp(column) : undefined,
    order: nextOrder,
  }

  emit('sort-change', sortChangePayload(column, nextOrder))
}

function sortChangePayload(column: NormalizedColumn, order: TableSortOrder): TableSortChange {
  return {
    column: column.raw,
    prop: columnProp(column),
    order,
  }
}

function nextSortOrder(order: TableSortOrder): TableSortOrder {
  if (!order) return 'ascending'
  if (order === 'ascending') return 'descending'
  return null
}

function sortIcon(column: NormalizedColumn) {
  if (sortState.value.columnId !== column.id) return ArrowUpDown
  if (sortState.value.order === 'ascending') return ArrowUp
  if (sortState.value.order === 'descending') return ArrowDown
  return ArrowUpDown
}

function sortButtonLabel(column: NormalizedColumn) {
  const label = column.label || columnProp(column) || column.id
  if (sortState.value.columnId !== column.id || !sortState.value.order) return `Sort ${label} ascending`
  if (sortState.value.order === 'ascending') return `Sort ${label} descending`
  return `Clear ${label} sort`
}

function toggleFilterMenu(column: NormalizedColumn, event: MouseEvent) {
  if (openFilterColumnId.value === column.id) {
    closeFilterMenu()
    return
  }

  updateFilterMenuPosition(event.currentTarget)
  openFilterColumnId.value = column.id
}

function closeFilterMenu() {
  openFilterColumnId.value = null
}

function updateFilterMenuPosition(anchor: EventTarget | null) {
  const button = anchor instanceof HTMLElement ? anchor : null
  if (!button) return

  const rect = button.getBoundingClientRect()
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || FILTER_MENU_WIDTH
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 240
  const left = clampNumber(
    rect.right - FILTER_MENU_WIDTH,
    FILTER_MENU_GUTTER,
    Math.max(FILTER_MENU_GUTTER, viewportWidth - FILTER_MENU_WIDTH - FILTER_MENU_GUTTER),
  )
  const top = clampNumber(
    rect.bottom + 6,
    FILTER_MENU_GUTTER,
    Math.max(FILTER_MENU_GUTTER, viewportHeight - FILTER_MENU_GUTTER - 36),
  )

  filterMenuPosition.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${FILTER_MENU_WIDTH}px`,
  }
}

function activeFilterValues(column: NormalizedColumn) {
  return activeFilters.value[column.id] ?? []
}

function isFilterValueActive(column: NormalizedColumn, value: unknown) {
  return activeFilterValues(column).some(activeValue => isSameValue(activeValue, value))
}

function toggleFilterValue(column: NormalizedColumn, value: unknown) {
  const current = activeFilterValues(column)
  const selected = current.some(activeValue => isSameValue(activeValue, value))
  const multiple = column.filterMultiple !== false
  const next = selected
    ? current.filter(activeValue => !isSameValue(activeValue, value))
    : multiple
      ? [...current, value]
      : [value]

  activeFilters.value = {
    ...activeFilters.value,
    [column.id]: next,
  }

  if (!multiple) closeFilterMenu()
  emit('filter-change', filterChangePayload())
}

function clearFilter(column?: NormalizedColumn) {
  if (column) {
    activeFilters.value = {
      ...activeFilters.value,
      [column.id]: [],
    }
  } else {
    activeFilters.value = {}
  }

  emit('filter-change', filterChangePayload())
  closeFilterMenu()
}

function filterChangePayload() {
  return leafColumns.value.reduce<Record<string, unknown[]>>((payload, column) => {
    const key = columnProp(column) ?? column.key ?? column.id
    payload[String(key)] = [...activeFilterValues(column)]
    return payload
  }, {})
}

function filterOptionKey(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function isSameValue(a: unknown, b: unknown) {
  return Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b)
}

function isKeyExpanded(key: TableRowKey) {
  return expandedKeySet.value.has(key)
}

async function toggleRowExpansion(rowState: VisibleRowState) {
  const next = new Set(expandedKeySet.value)
  const shouldExpand = !next.has(rowState.key)

  if (shouldExpand && props.lazy && rowState.hasChildren && !lazyChildren.value.has(rowState.key)) {
    await loadLazyChildren(rowState)
  }

  if (shouldExpand) {
    next.add(rowState.key)
  } else {
    next.delete(rowState.key)
  }

  setExpandedKeys(next)
  await nextTick()
  emit('expand-change', rowState.row, getExpandedRows())
}

async function loadLazyChildren(rowState: VisibleRowState) {
  if (!props.load || loadingKeys.value.has(rowState.key)) return

  const nextLoading = new Set(loadingKeys.value)
  nextLoading.add(rowState.key)
  loadingKeys.value = nextLoading

  const treeNode: TableTreeNode = {
    row: rowState.row,
    key: rowState.key,
    level: rowState.level,
    expanded: rowState.expanded,
    loading: true,
    hasChildren: rowState.hasChildren,
  }

  const resolve = (children: TableRow[]) => {
    const nextChildren = new Map(lazyChildren.value)
    nextChildren.set(rowState.key, children)
    lazyChildren.value = nextChildren
  }

  try {
    const result = await props.load(rowState.row, treeNode, resolve)
    if (Array.isArray(result)) resolve(result)
  } finally {
    const afterLoading = new Set(loadingKeys.value)
    afterLoading.delete(rowState.key)
    loadingKeys.value = afterLoading
  }
}

function setExpandedKeys(keys: Set<TableRowKey>) {
  if (props.expandRowKeys) {
    emit('update:expandRowKeys', Array.from(keys))
  } else {
    internalExpandedKeys.value = keys
  }
}

function collectExpandableKeys(nodes: RowNode[], keys: Set<TableRowKey>) {
  nodes.forEach(node => {
    if (node.hasChildren) keys.add(node.key)
    collectExpandableKeys(node.children, keys)
  })
}

function hasExpandableContent(rowState: VisibleRowState) {
  return hasExpandSlot.value || rowState.hasChildren
}

function getExpandedRows() {
  return visibleRowStates.value
    .filter(rowState => expandedKeySet.value.has(rowState.key))
    .map(rowState => rowState.row)
}

function isRowSelectable(rowState: VisibleRowState) {
  const selectionColumn = leafColumns.value.find(column => column.type === 'selection')
  const selectable = selectionColumn?.selectable ?? props.selectable
  return selectable ? selectable(rowState.row, rowState.rowIndex) : true
}

function isRowSelected(rowState: VisibleRowState) {
  return selectedKeys.value.has(rowState.key)
}

function toggleRowSelection(rowState: VisibleRowState, selected?: boolean) {
  if (!isRowSelectable(rowState)) return

  const next = new Set(selectedKeys.value)
  const shouldSelect = selected ?? !next.has(rowState.key)
  if (shouldSelect) {
    next.add(rowState.key)
  } else {
    next.delete(rowState.key)
  }

  selectedKeys.value = next
  const selection = getSelectedRows()
  emit('select', selection, rowState.row)
  emit('selection-change', selection)
}

function toggleAllSelection() {
  const next = new Set(selectedKeys.value)
  const shouldSelectAll = !isAllVisibleSelected.value

  selectableVisibleRows.value.forEach(rowState => {
    if (shouldSelectAll) {
      next.add(rowState.key)
    } else {
      next.delete(rowState.key)
    }
  })

  selectedKeys.value = next
  const selection = getSelectedRows()
  emit('select-all', selection)
  emit('selection-change', selection)
}

function clearSelection() {
  selectedKeys.value = new Set()
  emit('selection-change', [])
}

function getSelectedRows() {
  return visibleRowStates.value
    .filter(rowState => selectedKeys.value.has(rowState.key))
    .map(rowState => rowState.row)
}

function setCurrentRow(row?: TableRow) {
  const oldRow = currentKey.value === undefined ? undefined : rowStateByKey.value.get(currentKey.value)?.row
  currentKey.value = row ? resolveRowKey(row) : undefined
  emit('current-change', row, oldRow)
}

function handleRowClick(rowState: VisibleRowState, event: MouseEvent) {
  if (props.highlightCurrentRow) {
    setCurrentRow(rowState.row)
  }
  emit('row-click', rowState.row, event)
}

function handleCellClick(rowState: VisibleRowState, column: NormalizedColumn, event: MouseEvent) {
  emit('cell-click', rowState.row, column.raw, event)
}

function rowIndexText(rowState: VisibleRowState, column: NormalizedColumn) {
  if (typeof column.index === 'function') return column.index(rowState.rowIndex)
  if (typeof column.index === 'number') return column.index + rowState.rowIndex
  return rowState.rowIndex + 1
}

function shouldShowOverflowTooltip(column: NormalizedColumn) {
  return Boolean(column.showOverflowTooltip ?? props.showOverflowTooltip)
}

function isTreeCell(column: NormalizedColumn) {
  return column.id === treeAnchorColumnId.value
}

function treeCellStyle(rowState: VisibleRowState, column: NormalizedColumn): StyleValue | undefined {
  if (!isTreeCell(column)) return undefined
  return {
    '--app-table-tree-indent': `${rowState.level * 18}px`,
  }
}

function normalizeSpan(result: ReturnType<NonNullable<typeof props.spanMethod>>): CellSpan {
  if (Array.isArray(result)) {
    return {
      rowspan: result[0] ?? 1,
      colspan: result[1] ?? 1,
    }
  }

  if (result && typeof result === 'object') {
    return {
      rowspan: result.rowspan ?? 1,
      colspan: result.colspan ?? 1,
    }
  }

  return {
    rowspan: 1,
    colspan: 1,
  }
}

function spanKey(rowIndex: number, columnIndex: number) {
  return `${rowIndex}:${columnIndex}`
}

function cellSpan(rowIndex: number, columnIndex: number) {
  return spanMatrix.value.get(spanKey(rowIndex, columnIndex)) ?? { rowspan: 1, colspan: 1 }
}

function isCellVisible(rowIndex: number, columnIndex: number) {
  const span = cellSpan(rowIndex, columnIndex)
  return span.rowspan !== 0 && span.colspan !== 0
}

function rowClasses(rowState: VisibleRowState) {
  const custom = typeof props.rowClassName === 'function'
    ? props.rowClassName({ row: rowState.row, rowIndex: rowState.rowIndex })
    : props.rowClassName
  const status = props.rowStatus?.(rowState.row, rowState.rowIndex)

  return [
    custom,
    status ? `is-${status}` : undefined,
    {
      'is-current': props.highlightCurrentRow && currentKey.value === rowState.key,
      'is-selected': selectedKeys.value.has(rowState.key),
      'is-expanded': rowState.expanded,
    },
  ]
}

function rowStyleValue(rowState: VisibleRowState): StyleValue | undefined {
  if (!props.rowStyle) return undefined
  return typeof props.rowStyle === 'function'
    ? props.rowStyle({ row: rowState.row, rowIndex: rowState.rowIndex })
    : props.rowStyle
}

function colStyle(column: NormalizedColumn): StyleValue {
  return {
    width: column.widthStyle ?? `${column.widthPx}px`,
    minWidth: column.minWidthStyle ?? `${column.widthPx}px`,
  }
}

function headerCellClasses(cell: HeaderCell, rowIndex: number) {
  const column = cell.column
  const custom = typeof column.headerClassName === 'function'
    ? column.headerClassName({ column, columnIndex: column.leafIndex, level: rowIndex })
    : column.headerClassName

  return [
    custom,
    fixedClasses(column),
    `align-${column.headerAlign ?? column.align ?? 'left'}`,
    {
      'is-sortable': isSortable(column),
      'is-filtered': activeFilterValues(column).length > 0,
      'is-group': column.children.length > 0,
    },
  ]
}

function cellClasses(rowState: VisibleRowState, column: NormalizedColumn, columnIndex: number) {
  const custom = typeof column.className === 'function'
    ? column.className({ row: rowState.row, column, rowIndex: rowState.rowIndex, columnIndex })
    : column.className

  return [
    custom,
    fixedClasses(column),
    `align-${column.align ?? 'left'}`,
    {
      'is-selection': column.type === 'selection',
      'is-index': column.type === 'index',
      'is-expand': column.type === 'expand',
      'is-overflow': shouldShowOverflowTooltip(column),
    },
  ]
}

function summaryCellClasses(column: NormalizedColumn) {
  return [
    fixedClasses(column),
    `align-${column.align ?? 'left'}`,
  ]
}

function fixedClasses(column: NormalizedColumn) {
  return {
    'is-fixed-left': column.fixedSide === 'left',
    'is-fixed-right': column.fixedSide === 'right',
    'is-last-fixed-left': isLastFixedLeft(column),
    'is-first-fixed-right': isFirstFixedRight(column),
  }
}

function isLastFixedLeft(column: NormalizedColumn) {
  if (column.fixedSide !== 'left') return false
  const index = column.leafIndex + column.leafCount - 1
  return leafColumns.value[index + 1]?.fixedSide !== 'left'
}

function isFirstFixedRight(column: NormalizedColumn) {
  if (column.fixedSide !== 'right') return false
  const index = column.leafIndex
  return leafColumns.value[index - 1]?.fixedSide !== 'right'
}

function headerCellStyle(cell: HeaderCell, rowIndex: number): StyleValue {
  return {
    ...fixedStyle(cell.column, true),
    top: `${rowIndex * HEADER_HEIGHT}px`,
    width: cell.column.children.length > 0 ? `${cell.column.widthPx}px` : undefined,
  }
}

function cellStyle(column: NormalizedColumn, _columnIndex: number): StyleValue {
  return fixedStyle(column)
}

function summaryCellStyle(column: NormalizedColumn, _columnIndex: number): StyleValue {
  return fixedStyle(column, true)
}

function fixedStyle(column: NormalizedColumn, elevated = false): CSSProperties {
  const style: CSSProperties = {}
  if (column.fixedSide === 'left') {
    style.left = `${column.left ?? 0}px`
    style.zIndex = elevated ? 4 : 2
  }
  if (column.fixedSide === 'right') {
    style.right = `${column.right ?? 0}px`
    style.zIndex = elevated ? 4 : 2
  }
  return style
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('[data-app-table-filter-menu]')) return
  if (target?.closest('.app-table-filter-button')) return
  closeFilterMenu()
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeFilterMenu()
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function humanizeKey(key: string) {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, char => char.toUpperCase())
}

function clearSort() {
  sortState.value = {
    columnId: undefined,
    prop: undefined,
    order: null,
  }
  emit('sort-change', { order: null })
}

function sort(prop: string, order: TableSortOrder = 'ascending') {
  const column = sortableColumnsByProp.value.get(prop)
  sortState.value = {
    columnId: column?.id,
    prop,
    order,
  }
  emit('sort-change', {
    column: column?.raw,
    prop,
    order,
  })
}

defineExpose({
  clearFilter,
  clearSelection,
  clearSort,
  getSelectedRows,
  setCurrentRow,
  sort,
  toggleAllSelection,
  toggleRowExpansion,
  toggleRowSelection,
  scrollTo: (options: TableScrollToOptions) => scrollbarRef.value?.getScrollElement()?.scrollTo(options),
})
</script>

<style scoped>
.app-table {
  --app-table-bg: var(--ui-surface-panel-bg, var(--panel, var(--bg)));
  --app-table-head-bg: var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg)));
  --app-table-row-bg: var(--app-table-bg);
  --app-table-row-hover-bg: var(--ui-state-hover-bg, var(--hover));
  --app-table-stripe-bg: color-mix(in srgb, var(--ui-text-muted-fg, var(--muted)) 5%, transparent);
  --app-table-border: var(--ui-border-default-border, var(--border));
  --app-table-strong-border: color-mix(in srgb, var(--ui-border-default-border, var(--border)) 72%, var(--ui-text-primary-fg, var(--text)) 28%);
  --app-table-fg: var(--ui-text-primary-fg, var(--text));
  --app-table-muted-fg: var(--ui-text-muted-fg, var(--muted));
  --app-table-accent: var(--ui-accent-primary-fg, var(--accent));

  position: relative;
  width: 100%;
  min-width: 0;
  color: var(--app-table-fg);
  font-family: var(--type-body-font, var(--font-sans));
  font-size: var(--type-label-size, 13px);
  line-height: var(--type-label-line-height, 1.3);
}

.app-table-scrollbar {
  border: 1px solid var(--app-table-border);
  border-radius: 8px;
  background: var(--app-table-bg);
}

.app-table-element {
  width: 100%;
  min-width: var(--app-table-min-width);
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
}

.app-table-head {
  position: relative;
  z-index: 3;
}

.app-table-head-cell,
.app-table-cell,
.app-table-summary-cell {
  box-sizing: border-box;
  min-width: 0;
  border-bottom: 1px solid var(--app-table-border);
  background: var(--app-table-row-bg);
  vertical-align: middle;
}

.app-table-head-cell {
  position: sticky;
  height: var(--app-table-header-height);
  padding: 0;
  color: var(--app-table-muted-fg);
  background: var(--app-table-head-bg);
  font-size: var(--type-caption-size, 11px);
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
  z-index: 3;
}

.app-table-head-cell.is-group {
  color: color-mix(in srgb, var(--app-table-fg) 84%, var(--app-table-muted-fg));
}

.app-table-head-content {
  display: flex;
  align-items: center;
  min-width: 0;
  height: 100%;
  gap: 5px;
  padding: 0 10px;
}

.app-table-head-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-table-head-icon-button {
  display: inline-grid;
  place-items: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  min-width: 24px;
  padding: 0;
  border-radius: 6px;
  color: var(--app-table-muted-fg);
  background: transparent;
  line-height: 0;
  transform: none;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.app-table-head-icon-button:hover {
  color: var(--app-table-accent);
  background: color-mix(in srgb, var(--app-table-accent) 10%, transparent);
}

.app-table-head-icon-button.active,
.app-table-head-icon-button.open {
  color: var(--app-table-accent);
  background: transparent;
  box-shadow: none;
}

.app-table-head-icon-button :deep(.app-button-content),
.app-table-head-icon-button:active:not(:disabled) :deep(.app-button-content) {
  transform: none;
  transition: none;
}

.app-table-filter {
  position: relative;
  flex: 0 0 auto;
}

.app-table-filter-menu {
  position: fixed;
  z-index: calc(var(--z-dropdown, 1000) + 24);
  min-width: 164px;
  max-width: 260px;
  max-height: min(260px, calc(100vh - 16px));
  padding: 5px;
  overflow-y: auto;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg)));
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.18);
  transform-origin: top center;
  overscroll-behavior: contain;
}

.app-table-filter-option {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  gap: 7px;
  padding: 0 8px;
  height: 30px;
  border-radius: 6px;
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  background: transparent;
  text-align: left;
}

.app-table-filter-option:hover,
.app-table-filter-option.selected {
  color: var(--ui-text-primary-fg, var(--text));
  background: var(--ui-state-hover-bg, var(--hover));
}

.app-table-filter-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  color: var(--ui-accent-primary-fg, var(--accent));
}

.app-table-filter-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--type-meta-size, 12px);
  font-weight: 600;
}

.app-table-filter-actions {
  display: flex;
  justify-content: flex-end;
  padding: 5px 2px 1px;
  border-top: 1px solid var(--ui-border-default-border, var(--border));
  margin-top: 4px;
}

.app-table-filter-menu-enter-active,
.app-table-filter-menu-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.app-table-filter-menu-enter-from,
.app-table-filter-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.app-table-row {
  background: var(--app-table-row-bg);
}

.app-table-row:hover .app-table-cell {
  background: var(--app-table-row-hover-bg);
}

.app-table.is-striped .app-table-row:nth-child(odd of .app-table-row) .app-table-cell {
  background: var(--app-table-stripe-bg);
}

.app-table-row.is-current .app-table-cell {
  background: color-mix(in srgb, var(--app-table-accent) 13%, var(--app-table-bg));
}

.app-table-row.is-selected .app-table-cell {
  background: color-mix(in srgb, var(--app-table-accent) 9%, var(--app-table-bg));
}

.app-table-row.is-success .app-table-cell {
  background: var(--ui-status-success-bg, var(--app-table-bg));
}

.app-table-row.is-info .app-table-cell {
  background: var(--ui-status-info-bg, var(--app-table-bg));
}

.app-table-row.is-warning .app-table-cell {
  background: var(--ui-status-warning-bg, var(--app-table-bg));
}

.app-table-row.is-danger .app-table-cell {
  background: var(--ui-status-danger-bg, var(--app-table-bg));
}

.app-table-cell,
.app-table-summary-cell {
  height: 40px;
  padding: 0;
  color: var(--app-table-fg);
}

.app-table-cell-content {
  display: flex;
  align-items: center;
  min-width: 0;
  width: 100%;
  min-height: 39px;
  gap: 7px;
  padding: 6px 10px;
}

.app-table-cell-content.is-tree-cell {
  padding-left: calc(10px + var(--app-table-tree-indent, 0px));
}

.app-table-tree-control,
.app-table-expand-placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
}

.app-table-expand-button {
  width: 24px;
  height: 24px;
  min-width: 24px;
  padding: 0;
  border-radius: 6px;
  color: var(--app-table-muted-fg);
  background: transparent;
  transition: color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}

.app-table-expand-button:hover {
  color: var(--app-table-accent);
  background: color-mix(in srgb, var(--app-table-accent) 10%, transparent);
}

.app-table-expand-button.expanded {
  transform: rotate(90deg);
}

.app-table-expand-button.loading {
  animation: app-table-spin 0.9s linear infinite;
}

@keyframes app-table-spin {
  to {
    transform: rotate(360deg);
  }
}

.app-table-cell-text,
.app-table-index {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}

.app-table-cell-text.is-overflow {
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-table-selection-input {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: var(--app-table-accent);
}

.app-table-head-cell.align-center .app-table-head-content,
.app-table-cell.align-center .app-table-cell-content,
.app-table-summary-cell.align-center .app-table-cell-content {
  justify-content: center;
  text-align: center;
}

.app-table-head-cell.align-right .app-table-head-content,
.app-table-cell.align-right .app-table-cell-content,
.app-table-summary-cell.align-right .app-table-cell-content {
  justify-content: flex-end;
  text-align: right;
}

.app-table.is-bordered .app-table-head-cell,
.app-table.is-bordered .app-table-cell,
.app-table.is-bordered .app-table-summary-cell {
  border-right: 1px solid var(--app-table-border);
}

.app-table.is-bordered .app-table-head-cell:last-child,
.app-table.is-bordered .app-table-cell:last-child,
.app-table.is-bordered .app-table-summary-cell:last-child {
  border-right: none;
}

.app-table-head-cell.is-fixed-left,
.app-table-head-cell.is-fixed-right,
.app-table-cell.is-fixed-left,
.app-table-cell.is-fixed-right,
.app-table-summary-cell.is-fixed-left,
.app-table-summary-cell.is-fixed-right {
  position: sticky;
}

.app-table-head-cell.is-fixed-left,
.app-table-head-cell.is-fixed-right {
  z-index: 5;
}

.app-table-cell.is-fixed-left,
.app-table-cell.is-fixed-right,
.app-table-summary-cell.is-fixed-left,
.app-table-summary-cell.is-fixed-right {
  background: inherit;
}

.app-table-cell.is-last-fixed-left,
.app-table-head-cell.is-last-fixed-left,
.app-table-summary-cell.is-last-fixed-left {
  box-shadow: 8px 0 14px -14px rgba(0, 0, 0, 0.45);
}

.app-table-cell.is-first-fixed-right,
.app-table-head-cell.is-first-fixed-right,
.app-table-summary-cell.is-first-fixed-right {
  box-shadow: -8px 0 14px -14px rgba(0, 0, 0, 0.45);
}

.app-table-summary-cell {
  position: sticky;
  bottom: 0;
  z-index: 3;
  background: var(--app-table-head-bg);
  font-weight: 700;
}

.app-table-expanded-cell,
.app-table-empty-cell {
  padding: 14px 16px;
  border-bottom: 1px solid var(--app-table-border);
  color: var(--app-table-muted-fg);
  background: color-mix(in srgb, var(--app-table-muted-fg) 4%, var(--app-table-bg));
}

.app-table-empty-cell {
  height: 88px;
  text-align: center;
}

.app-table-expanded-cell {
  color: var(--app-table-fg);
}
</style>
