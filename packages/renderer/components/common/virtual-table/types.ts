import type { CSSProperties, VNodeChild } from 'vue'

export type VirtualTableRow = object
export type VirtualTableRowKey = string | number
export type VirtualTableAlign = 'left' | 'center' | 'right'
export type VirtualTableSortOrder = 'asc' | 'desc' | null
export type VirtualTableSortMode = 'local' | 'remote'
export type VirtualTableSelectionMode = 'none' | 'single' | 'multiple'
export type VirtualTableScrollAlign = 'start' | 'center' | 'end' | 'auto'
export type VirtualTableScrollBehavior = 'auto' | 'instant' | 'smooth'

export type VirtualTableClassValue =
  | string
  | string[]
  | Record<string, boolean>
  | undefined

export interface VirtualTableCellRenderContext<Row extends VirtualTableRow = VirtualTableRow> {
  row: Row
  column: VirtualTableColumn<Row>
  value: unknown
  rowIndex: number
  columnIndex: number
  rowKey: VirtualTableRowKey
  selected: boolean
}

export interface VirtualTableHeaderRenderContext<Row extends VirtualTableRow = VirtualTableRow> {
  column: VirtualTableColumn<Row>
  columnIndex: number
  sortOrder: VirtualTableSortOrder
}

export interface VirtualTableRowContext<Row extends VirtualTableRow = VirtualTableRow> {
  row: Row
  rowIndex: number
  rowKey: VirtualTableRowKey
  selected: boolean
}

export interface VirtualTableColumn<Row extends VirtualTableRow = VirtualTableRow> {
  /** Stable column id. Defaults to field/dataIndex/title/index. */
  key?: string
  /** Field name used to read cell values from each row. */
  field?: keyof Row | string
  /** Alias for field, useful when matching common data-table APIs. */
  dataIndex?: keyof Row | string
  /** Header title. Defaults to a humanized field/key. */
  title?: string
  /** Pixel width. Numeric strings are accepted; default: 160. */
  width?: number | string
  /** Minimum pixel width when width is missing or constrained; default: 80. */
  minWidth?: number | string
  /** Maximum pixel width clamp for the resolved width. */
  maxWidth?: number | string
  /** Cell alignment; default: left. */
  align?: VirtualTableAlign
  /** Header alignment; defaults to align. */
  headerAlign?: VirtualTableAlign
  /** Enables sorting for this column. Use "custom" with remote sorting. */
  sortable?: boolean | 'custom'
  /** Local sorter used when sortMode is local. */
  sortMethod?: (a: Row, b: Row, order: Exclude<VirtualTableSortOrder, null>) => number
  /** Optional custom value getter. */
  valueGetter?: (row: Row, rowIndex: number) => unknown
  /** Formats fallback text when render is not provided. */
  formatter?: (context: VirtualTableCellRenderContext<Row>) => VNodeChild
  /** Custom cell renderer. Prefer stable functions for best performance. */
  render?: (context: VirtualTableCellRenderContext<Row>) => VNodeChild
  /** Custom header renderer. */
  headerRender?: (context: VirtualTableHeaderRenderContext<Row>) => VNodeChild
  /** Cell CSS class or class factory. */
  className?: VirtualTableClassValue | ((context: VirtualTableCellRenderContext<Row>) => VirtualTableClassValue)
  /** Header CSS class or class factory. */
  headerClassName?: VirtualTableClassValue | ((context: VirtualTableHeaderRenderContext<Row>) => VirtualTableClassValue)
  /** Cell inline style or style factory. */
  cellStyle?: CSSProperties | ((context: VirtualTableCellRenderContext<Row>) => CSSProperties | undefined)
  /** Header inline style or style factory. */
  headerStyle?: CSSProperties | ((context: VirtualTableHeaderRenderContext<Row>) => CSSProperties | undefined)
  /** Enables single-line truncation; default: true. Set false for dynamic-height wrapping. */
  ellipsis?: boolean
  /** Optional label for assistive technology. */
  ariaLabel?: string
}

export interface VirtualTableSortState {
  key?: string
  field?: string
  order: VirtualTableSortOrder
}

export interface VirtualTableVisibleRange {
  rows: {
    start: number
    end: number
    overscanStart: number
    overscanEnd: number
  }
  columns: {
    start: number
    end: number
    overscanStart: number
    overscanEnd: number
  }
}

export interface VirtualTableScrollToOptions {
  top?: number
  left?: number
  behavior?: VirtualTableScrollBehavior
}

export interface VirtualTableRef {
  scrollTo: (options: VirtualTableScrollToOptions) => void
  scrollToRow: (index: number, align?: VirtualTableScrollAlign, behavior?: VirtualTableScrollBehavior) => void
  scrollToColumn: (index: number, align?: VirtualTableScrollAlign, behavior?: VirtualTableScrollBehavior) => void
  scrollToTop: (behavior?: VirtualTableScrollBehavior) => void
  getScrollElement: () => HTMLElement | null
  getVisibleRange: () => VirtualTableVisibleRange
  resetMeasurements: () => void
  clearSelection: () => void
}

export interface VirtualTableProps<Row extends VirtualTableRow = VirtualTableRow> {
  /** Rows to display. Default: []. */
  data?: Row[]
  /** Column definitions. If omitted, keys from the first row are inferred. Default: []. */
  columns?: VirtualTableColumn<Row>[]
  /** Stable row key. Defaults to row.id when present, otherwise row index. */
  rowKey?: keyof Row | string | ((row: Row, index: number) => VirtualTableRowKey)
  /** Viewport height. Virtualization needs a bounded viewport. Default: 420. */
  height?: number | string
  /** Optional max-height for flexible layouts. */
  maxHeight?: number | string
  /** Fixed row height in px when dynamicRowHeight is false. Default: 44. */
  rowHeight?: number
  /** Estimated row height before measurement when dynamicRowHeight is true. Default: rowHeight. */
  estimatedRowHeight?: number
  /** Enables ResizeObserver measurement and height caching. Default: false. */
  dynamicRowHeight?: boolean
  /** Sticky header height in px. Default: 40. */
  headerHeight?: number
  /** Extra rows rendered before/after viewport to avoid blanking during fast scroll. Default: 8. */
  overscan?: number
  /** Extra columns rendered before/after viewport when virtualizeColumns is true. Default: 2. */
  columnOverscan?: number
  /** Enables horizontal column virtualization for very wide tables. Default: false. */
  virtualizeColumns?: boolean
  /** Shows the sticky header. Default: true. */
  showHeader?: boolean
  /** Shows subtle row striping. Default: false. */
  stripe?: boolean
  /** Shows cell borders. Default: false. */
  border?: boolean
  /** External loading state. Default: false. */
  loading?: boolean
  /** Loading text when no loading slot is provided. Default: "Loading...". */
  loadingText?: string
  /** Empty text when no empty slot is provided. Default: "No data". */
  emptyText?: string
  /** Controlled sort state. */
  sortState?: VirtualTableSortState
  /** Initial uncontrolled sort state. */
  defaultSortState?: VirtualTableSortState
  /** Local sorts data in-memory; remote only emits sort-change. Default: local. */
  sortMode?: VirtualTableSortMode
  /** Selection mode. Non-none prepends a selection column. Default: none. */
  selectionMode?: VirtualTableSelectionMode
  /** Controlled selected row keys. */
  selectedRowKeys?: VirtualTableRowKey[]
  /** Initial uncontrolled selected row keys. Default: []. */
  defaultSelectedRowKeys?: VirtualTableRowKey[]
  /** Predicate to disable selection for a row. */
  rowSelectable?: (row: Row, index: number) => boolean
  /** Toggles selection when clicking a row. Default: true. */
  selectOnRowClick?: boolean
  /** Width of the generated selection column. Default: 44. */
  selectionColumnWidth?: number
  /** Row CSS class or class factory. */
  rowClassName?: VirtualTableClassValue | ((context: VirtualTableRowContext<Row>) => VirtualTableClassValue)
  /** Row inline style or style factory. */
  rowStyle?: CSSProperties | ((context: VirtualTableRowContext<Row>) => CSSProperties | undefined)
  /** Accessible row label factory. */
  getRowAriaLabel?: (context: VirtualTableRowContext<Row>) => string | undefined
}
