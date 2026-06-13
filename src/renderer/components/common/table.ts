import type { CSSProperties } from 'vue'

export type TableRow = Record<string, unknown>
export type TableRowKey = string | number
export type TableSortOrder = 'ascending' | 'descending' | null
export type TableFixedSide = 'left' | 'right'
export type TableAlign = 'left' | 'center' | 'right'
export type TableColumnType = 'default' | 'selection' | 'index' | 'expand'
export type TableRowStatus = 'success' | 'info' | 'warning' | 'danger'

export interface TableFilterOption {
  text: string
  value: unknown
}

export interface TableSortState<Row extends TableRow = TableRow> {
  column?: TableColumn<Row>
  prop?: string
  order: TableSortOrder
}

export interface TableColumn<Row extends TableRow = TableRow> {
  key?: string
  type?: TableColumnType
  prop?: string
  property?: string
  label?: string
  width?: number | string
  minWidth?: number | string
  fixed?: boolean | TableFixedSide
  align?: TableAlign
  headerAlign?: TableAlign
  sortable?: boolean | 'custom'
  sortMethod?: (a: Row, b: Row) => number
  sortBy?: string | string[] | ((row: Row, index: number) => unknown)
  filters?: TableFilterOption[]
  filterMethod?: (value: unknown, row: Row, column: TableColumn<Row>) => boolean
  filterMultiple?: boolean
  filteredValue?: unknown[]
  formatter?: (row: Row, column: TableColumn<Row>, value: unknown, index: number) => unknown
  showOverflowTooltip?: boolean
  selectable?: (row: Row, index: number) => boolean
  reserveSelection?: boolean
  index?: number | ((index: number) => number | string)
  slot?: string
  headerSlot?: string
  className?: string | ((context: TableCellContext<Row>) => string)
  headerClassName?: string | ((context: TableHeaderCellContext<Row>) => string)
  children?: TableColumn<Row>[]
}

export interface TableCellContext<Row extends TableRow = TableRow> {
  row: Row
  column: TableColumn<Row>
  rowIndex: number
  columnIndex: number
}

export interface TableHeaderCellContext<Row extends TableRow = TableRow> {
  column: TableColumn<Row>
  columnIndex: number
  level: number
}

export interface TableRowContext<Row extends TableRow = TableRow> {
  row: Row
  rowIndex: number
}

export interface TableSpanContext<Row extends TableRow = TableRow> extends TableCellContext<Row> {
  visibleRows: Row[]
}

export type TableSpanResult =
  | [number, number]
  | {
    rowspan?: number
    colspan?: number
  }
  | undefined
  | null

export type TableSummaryMethod<Row extends TableRow = TableRow> = (context: {
  columns: TableColumn<Row>[]
  data: Row[]
}) => Array<string | number>

export interface TableTreeNode<Row extends TableRow = TableRow> {
  row: Row
  key: TableRowKey
  level: number
  expanded: boolean
  loading: boolean
  hasChildren: boolean
}

export interface TableTreeProps {
  children?: string
  hasChildren?: string
}

export type TableLoadFunction<Row extends TableRow = TableRow> = (
  row: Row,
  treeNode: TableTreeNode<Row>,
  resolve: (children: Row[]) => void
) => void | Row[] | Promise<Row[] | void>

export interface TableSortChange<Row extends TableRow = TableRow> {
  column?: TableColumn<Row>
  prop?: string
  order: TableSortOrder
}

export interface TableRowStyleContext<Row extends TableRow = TableRow> extends TableRowContext<Row> {}

export type TableRowClassName<Row extends TableRow = TableRow> =
  | string
  | ((context: TableRowContext<Row>) => string)

export type TableRowStyle<Row extends TableRow = TableRow> =
  | CSSProperties
  | ((context: TableRowStyleContext<Row>) => CSSProperties | undefined)

export type TableSpanMethod<Row extends TableRow = TableRow> = (context: TableSpanContext<Row>) => TableSpanResult

