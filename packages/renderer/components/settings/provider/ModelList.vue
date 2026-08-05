<template>
  <div
    ref="viewportRef"
    class="model-list"
    :style="{ height: `${height}px` }"
    @scroll="onScroll"
  >
    <div
      class="model-list-canvas"
      :style="{ height: `${axis.totalSize.value}px` }"
    >
      <div
        v-for="item in axis.items.value"
        :key="item.key"
        class="model-list-slot"
        :style="{ transform: `translateY(${item.start}px)`, height: `${item.size}px` }"
      >
        <ModelRow
          v-if="entries[item.index]"
          :model="entries[item.index].model"
          :selected="entries[item.index].selected"
          :is-active="entries[item.index].isActive"
          :is-custom="entries[item.index].isCustom"
          :highlighted="entries[item.index].model.id === highlightId"
          :capabilities="entries[item.index].capabilities"
          :context-length="entries[item.index].contextLength"
          :context-overridden="entries[item.index].contextOverridden"
          :max-output="entries[item.index].maxOutput"
          :output-overridden="entries[item.index].outputOverridden"
          :format-tokens="formatTokens"
          @toggle="$emit('toggle', entries[item.index].model.id)"
          @open-config="$emit('open-config', entries[item.index].model.id)"
          @set-active="$emit('set-active', entries[item.index].model.id)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Vertical windowing only.
 *
 * The list this replaces was a VirtualTable, which windows rows AND columns and
 * therefore needs fixed pixel column widths — 738px of them inside a ~610px
 * settings pane, which is why the old UI scrolled sideways and pushed the model
 * name (the one thing you need to keep your place) out of view. OpenRouter
 * ships 337 models, so the row windowing is genuinely needed; the column half
 * never was. `useVirtualAxis` is the same primitive VirtualTable uses — this
 * just uses one axis of it.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useVirtualAxis } from '@/components/common/virtual-table/useVirtualAxis'
import ModelRow from './ModelRow.vue'
import type { ModelListEntry } from './model-list-entry'

const props = withDefaults(defineProps<{
  entries: ModelListEntry[]
  height: number
  rowHeight?: number
  overscan?: number
  highlightId?: string | null
  formatTokens: (value: number) => string
}>(), {
  rowHeight: 52,
  overscan: 6,
  highlightId: null,
})

defineEmits<{
  (e: 'toggle', modelId: string): void
  (e: 'open-config', modelId: string): void
  (e: 'set-active', modelId: string): void
}>()

const viewportRef = ref<HTMLElement | null>(null)
const scrollOffset = ref(0)
const viewportSize = ref(0)

const axis = useVirtualAxis({
  count: computed(() => props.entries.length),
  viewportSize,
  scrollOffset,
  overscan: computed(() => props.overscan),
  estimateSize: () => props.rowHeight,
  getKey: index => props.entries[index]?.model.id ?? index,
})

function onScroll(event: Event) {
  scrollOffset.value = (event.target as HTMLElement).scrollTop
}

function measure() {
  viewportSize.value = viewportRef.value?.clientHeight ?? 0
}

let observer: ResizeObserver | null = null

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && viewportRef.value) {
    observer = new ResizeObserver(measure)
    observer.observe(viewportRef.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

function scrollToTop() {
  viewportRef.value?.scrollTo({ top: 0 })
  scrollOffset.value = 0
}

/** Used after adding a model so it never hides at the bottom of 337 rows. */
function scrollToModel(modelId: string) {
  const index = props.entries.findIndex(entry => entry.model.id === modelId)
  if (index < 0) return
  const top = axis.getOffsetForIndex(index, 'center')
  viewportRef.value?.scrollTo({ top })
  scrollOffset.value = top
}

defineExpose({ scrollToTop, scrollToModel })
</script>

<style scoped>
.model-list {
  position: relative;
  overflow-y: auto;
  /* No horizontal axis at all — rows are flex and shrink to the pane. */
  overflow-x: hidden;
  border-top: 1px solid var(--settings-rule, var(--ui-border-default-border));
  scrollbar-width: thin;
}
.model-list-canvas {
  position: relative;
  width: 100%;
}
.model-list-slot {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}
</style>
