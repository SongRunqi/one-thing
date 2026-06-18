import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from 'vue'
import type { VirtualTableRowKey, VirtualTableScrollAlign } from './types'

export interface VirtualAxisRange {
  start: number
  end: number
  overscanStart: number
  overscanEnd: number
}

export interface VirtualAxisItem {
  index: number
  key: VirtualTableRowKey
  start: number
  size: number
  end: number
}

export interface VirtualAxisOptions {
  count: Ref<number> | ComputedRef<number>
  viewportSize: Ref<number> | ComputedRef<number>
  scrollOffset: Ref<number> | ComputedRef<number>
  overscan: Ref<number> | ComputedRef<number>
  estimateSize: (index: number) => number
  getKey?: (index: number) => VirtualTableRowKey
  dynamic?: Ref<boolean> | ComputedRef<boolean>
}

export interface VirtualAxis {
  items: ComputedRef<VirtualAxisItem[]>
  range: ComputedRef<VirtualAxisRange>
  totalSize: ComputedRef<number>
  getOffsetForIndex: (index: number, align?: VirtualTableScrollAlign) => number
  measureItem: (index: number, size: number) => number
  resetMeasurements: () => void
}

const MIN_ITEM_SIZE = 1
const MEASURE_EPSILON = 0.5

export function useVirtualAxis(options: VirtualAxisOptions): VirtualAxis {
  const sizeVersion = ref(0)
  const measuredSizes = new Map<VirtualTableRowKey, number>()

  const isDynamic = computed(() => options.dynamic?.value ?? false)

  const offsets = computed(() => {
    if (isDynamic.value) {
      void sizeVersion.value
    }

    const count = sanitizeCount(options.count.value)
    const nextOffsets = new Array<number>(count + 1)
    nextOffsets[0] = 0

    for (let index = 0; index < count; index += 1) {
      nextOffsets[index + 1] = nextOffsets[index] + getItemSize(index)
    }

    return nextOffsets
  })

  const totalSize = computed(() => {
    const values = offsets.value
    return values[values.length - 1] ?? 0
  })

  const range = computed<VirtualAxisRange>(() => {
    const count = sanitizeCount(options.count.value)
    if (count === 0) {
      return {
        start: 0,
        end: 0,
        overscanStart: 0,
        overscanEnd: 0,
      }
    }

    const viewportSize = Math.max(0, options.viewportSize.value)
    const scrollOffset = clamp(options.scrollOffset.value, 0, Math.max(0, totalSize.value - viewportSize))
    const start = clamp(findIndexAtOffset(offsets.value, scrollOffset), 0, count - 1)
    const endOffset = scrollOffset + viewportSize
    const end = clamp(findIndexAtOffset(offsets.value, endOffset) + 1, start + 1, count)
    const overscan = Math.max(0, Math.floor(options.overscan.value))

    return {
      start,
      end,
      overscanStart: Math.max(0, start - overscan),
      overscanEnd: Math.min(count, end + overscan),
    }
  })

  const items = computed<VirtualAxisItem[]>(() => {
    const values = offsets.value
    const currentRange = range.value
    const nextItems: VirtualAxisItem[] = []

    for (let index = currentRange.overscanStart; index < currentRange.overscanEnd; index += 1) {
      const start = values[index] ?? 0
      const end = values[index + 1] ?? start
      nextItems.push({
        index,
        key: keyForIndex(index),
        start,
        size: Math.max(MIN_ITEM_SIZE, end - start),
        end,
      })
    }

    return nextItems
  })

  function keyForIndex(index: number): VirtualTableRowKey {
    return options.getKey?.(index) ?? index
  }

  function getItemSize(index: number): number {
    const measured = isDynamic.value ? measuredSizes.get(keyForIndex(index)) : undefined
    return normalizeSize(measured ?? options.estimateSize(index))
  }

  function measureItem(index: number, size: number): number {
    if (!isDynamic.value) return 0

    const normalizedSize = normalizeSize(size)
    const key = keyForIndex(index)
    const previousSize = measuredSizes.get(key) ?? normalizeSize(options.estimateSize(index))
    const delta = normalizedSize - previousSize

    if (Math.abs(delta) <= MEASURE_EPSILON) return 0

    measuredSizes.set(key, normalizedSize)
    sizeVersion.value += 1
    return delta
  }

  function resetMeasurements() {
    measuredSizes.clear()
    sizeVersion.value += 1
  }

  function getOffsetForIndex(index: number, align: VirtualTableScrollAlign = 'start'): number {
    const count = sanitizeCount(options.count.value)
    if (count === 0) return 0

    const safeIndex = clamp(index, 0, count - 1)
    const values = offsets.value
    const start = values[safeIndex] ?? 0
    const end = values[safeIndex + 1] ?? start
    const viewportSize = Math.max(0, options.viewportSize.value)
    const currentOffset = clamp(options.scrollOffset.value, 0, Math.max(0, totalSize.value - viewportSize))
    let nextOffset = start

    if (align === 'end') {
      nextOffset = end - viewportSize
    } else if (align === 'center') {
      nextOffset = start - (viewportSize - (end - start)) / 2
    } else if (align === 'auto') {
      if (start >= currentOffset && end <= currentOffset + viewportSize) {
        nextOffset = currentOffset
      } else if (start < currentOffset) {
        nextOffset = start
      } else {
        nextOffset = end - viewportSize
      }
    }

    return clamp(nextOffset, 0, Math.max(0, totalSize.value - viewportSize))
  }

  onBeforeUnmount(() => {
    measuredSizes.clear()
  })

  return {
    items,
    range,
    totalSize,
    getOffsetForIndex,
    measureItem,
    resetMeasurements,
  }
}

function sanitizeCount(count: number): number {
  if (!Number.isFinite(count)) return 0
  return Math.max(0, Math.floor(count))
}

function normalizeSize(size: number): number {
  if (!Number.isFinite(size)) return MIN_ITEM_SIZE
  return Math.max(MIN_ITEM_SIZE, size)
}

function findIndexAtOffset(offsets: number[], offset: number): number {
  let low = 0
  let high = Math.max(0, offsets.length - 1)

  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if ((offsets[middle] ?? 0) <= offset) {
      low = middle + 1
    } else {
      high = middle
    }
  }

  return Math.max(0, low - 1)
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}
