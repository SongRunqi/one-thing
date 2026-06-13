<template>
  <component
    :is="props.as"
    class="layout-grid"
    :class="[`type-${props.type}`, { 'is-inline': props.inline }]"
    :style="layoutStyle"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed, type StyleValue } from 'vue'
import { createLayoutGridStyle, type LayoutGridProps } from './layout'

defineOptions({
  name: 'LayoutGrid',
})

const props = withDefaults(defineProps<LayoutGridProps>(), {
  as: 'div',
  type: 'flex',
  columns: 24,
  gap: 0,
  columnGap: undefined,
  rowGap: undefined,
  direction: 'row',
  wrap: true,
  alignItems: 'stretch',
  justifyItems: 'stretch',
  alignContent: 'stretch',
  justifyContent: 'start',
  autoFlow: 'row',
  autoRows: 'auto',
  inline: false,
})

const layoutStyle = computed<StyleValue>(() => createLayoutGridStyle(props))
</script>

<style scoped>
.layout-grid {
  --layout-grid-columns-base-resolved: var(--layout-grid-columns, repeat(24, minmax(0, 1fr)));
  --layout-grid-columns-sm-resolved: var(--layout-grid-columns-sm, var(--layout-grid-columns-base-resolved));
  --layout-grid-columns-md-resolved: var(--layout-grid-columns-md, var(--layout-grid-columns-sm-resolved));
  --layout-grid-columns-lg-resolved: var(--layout-grid-columns-lg, var(--layout-grid-columns-md-resolved));
  --layout-grid-columns-xl-resolved: var(--layout-grid-columns-xl, var(--layout-grid-columns-lg-resolved));
  --layout-grid-gap-base-resolved: var(--layout-grid-gap, 0);
  --layout-grid-gap-sm-resolved: var(--layout-grid-gap-sm, var(--layout-grid-gap-base-resolved));
  --layout-grid-gap-md-resolved: var(--layout-grid-gap-md, var(--layout-grid-gap-sm-resolved));
  --layout-grid-gap-lg-resolved: var(--layout-grid-gap-lg, var(--layout-grid-gap-md-resolved));
  --layout-grid-gap-xl-resolved: var(--layout-grid-gap-xl, var(--layout-grid-gap-lg-resolved));
  --layout-grid-row-gap-base-resolved: var(--layout-grid-row-gap, var(--layout-grid-gap-base-resolved));
  --layout-grid-row-gap-sm-resolved: var(--layout-grid-row-gap-sm, var(--layout-grid-row-gap, var(--layout-grid-gap-sm-resolved)));
  --layout-grid-row-gap-md-resolved: var(--layout-grid-row-gap-md, var(--layout-grid-row-gap-sm, var(--layout-grid-row-gap, var(--layout-grid-gap-md-resolved))));
  --layout-grid-row-gap-lg-resolved: var(--layout-grid-row-gap-lg, var(--layout-grid-row-gap-md, var(--layout-grid-row-gap-sm, var(--layout-grid-row-gap, var(--layout-grid-gap-lg-resolved)))));
  --layout-grid-row-gap-xl-resolved: var(--layout-grid-row-gap-xl, var(--layout-grid-row-gap-lg, var(--layout-grid-row-gap-md, var(--layout-grid-row-gap-sm, var(--layout-grid-row-gap, var(--layout-grid-gap-xl-resolved))))));
  --layout-grid-column-gap-base-resolved: var(--layout-grid-column-gap, var(--layout-grid-gap-base-resolved));
  --layout-grid-column-gap-sm-resolved: var(--layout-grid-column-gap-sm, var(--layout-grid-column-gap, var(--layout-grid-gap-sm-resolved)));
  --layout-grid-column-gap-md-resolved: var(--layout-grid-column-gap-md, var(--layout-grid-column-gap-sm, var(--layout-grid-column-gap, var(--layout-grid-gap-md-resolved))));
  --layout-grid-column-gap-lg-resolved: var(--layout-grid-column-gap-lg, var(--layout-grid-column-gap-md, var(--layout-grid-column-gap-sm, var(--layout-grid-column-gap, var(--layout-grid-gap-lg-resolved)))));
  --layout-grid-column-gap-xl-resolved: var(--layout-grid-column-gap-xl, var(--layout-grid-column-gap-lg, var(--layout-grid-column-gap-md, var(--layout-grid-column-gap-sm, var(--layout-grid-column-gap, var(--layout-grid-gap-xl-resolved))))));
  --layout-grid-direction-base-resolved: var(--layout-grid-direction, row);
  --layout-grid-direction-sm-resolved: var(--layout-grid-direction-sm, var(--layout-grid-direction-base-resolved));
  --layout-grid-direction-md-resolved: var(--layout-grid-direction-md, var(--layout-grid-direction-sm-resolved));
  --layout-grid-direction-lg-resolved: var(--layout-grid-direction-lg, var(--layout-grid-direction-md-resolved));
  --layout-grid-direction-xl-resolved: var(--layout-grid-direction-xl, var(--layout-grid-direction-lg-resolved));
  --layout-grid-wrap-base-resolved: var(--layout-grid-wrap, wrap);
  --layout-grid-wrap-sm-resolved: var(--layout-grid-wrap-sm, var(--layout-grid-wrap-base-resolved));
  --layout-grid-wrap-md-resolved: var(--layout-grid-wrap-md, var(--layout-grid-wrap-sm-resolved));
  --layout-grid-wrap-lg-resolved: var(--layout-grid-wrap-lg, var(--layout-grid-wrap-md-resolved));
  --layout-grid-wrap-xl-resolved: var(--layout-grid-wrap-xl, var(--layout-grid-wrap-lg-resolved));
  --layout-grid-align-items-base-resolved: var(--layout-grid-align-items, stretch);
  --layout-grid-align-items-sm-resolved: var(--layout-grid-align-items-sm, var(--layout-grid-align-items-base-resolved));
  --layout-grid-align-items-md-resolved: var(--layout-grid-align-items-md, var(--layout-grid-align-items-sm-resolved));
  --layout-grid-align-items-lg-resolved: var(--layout-grid-align-items-lg, var(--layout-grid-align-items-md-resolved));
  --layout-grid-align-items-xl-resolved: var(--layout-grid-align-items-xl, var(--layout-grid-align-items-lg-resolved));
  --layout-grid-justify-items-base-resolved: var(--layout-grid-justify-items, stretch);
  --layout-grid-justify-items-sm-resolved: var(--layout-grid-justify-items-sm, var(--layout-grid-justify-items-base-resolved));
  --layout-grid-justify-items-md-resolved: var(--layout-grid-justify-items-md, var(--layout-grid-justify-items-sm-resolved));
  --layout-grid-justify-items-lg-resolved: var(--layout-grid-justify-items-lg, var(--layout-grid-justify-items-md-resolved));
  --layout-grid-justify-items-xl-resolved: var(--layout-grid-justify-items-xl, var(--layout-grid-justify-items-lg-resolved));
  --layout-grid-align-content-base-resolved: var(--layout-grid-align-content, stretch);
  --layout-grid-align-content-sm-resolved: var(--layout-grid-align-content-sm, var(--layout-grid-align-content-base-resolved));
  --layout-grid-align-content-md-resolved: var(--layout-grid-align-content-md, var(--layout-grid-align-content-sm-resolved));
  --layout-grid-align-content-lg-resolved: var(--layout-grid-align-content-lg, var(--layout-grid-align-content-md-resolved));
  --layout-grid-align-content-xl-resolved: var(--layout-grid-align-content-xl, var(--layout-grid-align-content-lg-resolved));
  --layout-grid-justify-content-base-resolved: var(--layout-grid-justify-content, start);
  --layout-grid-justify-content-sm-resolved: var(--layout-grid-justify-content-sm, var(--layout-grid-justify-content-base-resolved));
  --layout-grid-justify-content-md-resolved: var(--layout-grid-justify-content-md, var(--layout-grid-justify-content-sm-resolved));
  --layout-grid-justify-content-lg-resolved: var(--layout-grid-justify-content-lg, var(--layout-grid-justify-content-md-resolved));
  --layout-grid-justify-content-xl-resolved: var(--layout-grid-justify-content-xl, var(--layout-grid-justify-content-lg-resolved));
  --layout-grid-auto-flow-base-resolved: var(--layout-grid-auto-flow, row);
  --layout-grid-auto-flow-sm-resolved: var(--layout-grid-auto-flow-sm, var(--layout-grid-auto-flow-base-resolved));
  --layout-grid-auto-flow-md-resolved: var(--layout-grid-auto-flow-md, var(--layout-grid-auto-flow-sm-resolved));
  --layout-grid-auto-flow-lg-resolved: var(--layout-grid-auto-flow-lg, var(--layout-grid-auto-flow-md-resolved));
  --layout-grid-auto-flow-xl-resolved: var(--layout-grid-auto-flow-xl, var(--layout-grid-auto-flow-lg-resolved));
  --layout-grid-auto-rows-base-resolved: var(--layout-grid-auto-rows, auto);
  --layout-grid-auto-rows-sm-resolved: var(--layout-grid-auto-rows-sm, var(--layout-grid-auto-rows-base-resolved));
  --layout-grid-auto-rows-md-resolved: var(--layout-grid-auto-rows-md, var(--layout-grid-auto-rows-sm-resolved));
  --layout-grid-auto-rows-lg-resolved: var(--layout-grid-auto-rows-lg, var(--layout-grid-auto-rows-md-resolved));
  --layout-grid-auto-rows-xl-resolved: var(--layout-grid-auto-rows-xl, var(--layout-grid-auto-rows-lg-resolved));

  display: flex;
  min-width: 0;
  flex-direction: var(--layout-grid-direction-base-resolved);
  flex-wrap: var(--layout-grid-wrap-base-resolved);
  gap:
    var(--layout-grid-row-gap-base-resolved)
    var(--layout-grid-column-gap-base-resolved);
  align-items: var(--layout-grid-align-items-base-resolved);
  align-content: var(--layout-grid-align-content-base-resolved);
  justify-content: var(--layout-grid-justify-content-base-resolved);
}

.layout-grid.is-inline {
  display: inline-flex;
}

.layout-grid.type-grid {
  display: grid;
  grid-template-columns: var(--layout-grid-columns-base-resolved);
  grid-auto-flow: var(--layout-grid-auto-flow-base-resolved);
  grid-auto-rows: var(--layout-grid-auto-rows-base-resolved);
  justify-items: var(--layout-grid-justify-items-base-resolved);
}

.layout-grid.type-grid.is-inline {
  display: inline-grid;
}

@media (min-width: 640px) {
  .layout-grid {
    flex-direction: var(--layout-grid-direction-sm-resolved);
    flex-wrap: var(--layout-grid-wrap-sm-resolved);
    gap:
      var(--layout-grid-row-gap-sm-resolved)
      var(--layout-grid-column-gap-sm-resolved);
    align-items: var(--layout-grid-align-items-sm-resolved);
    align-content: var(--layout-grid-align-content-sm-resolved);
    justify-content: var(--layout-grid-justify-content-sm-resolved);
  }

  .layout-grid.type-grid {
    grid-template-columns: var(--layout-grid-columns-sm-resolved);
    grid-auto-flow: var(--layout-grid-auto-flow-sm-resolved);
    grid-auto-rows: var(--layout-grid-auto-rows-sm-resolved);
    justify-items: var(--layout-grid-justify-items-sm-resolved);
  }
}

@media (min-width: 768px) {
  .layout-grid {
    flex-direction: var(--layout-grid-direction-md-resolved);
    flex-wrap: var(--layout-grid-wrap-md-resolved);
    gap:
      var(--layout-grid-row-gap-md-resolved)
      var(--layout-grid-column-gap-md-resolved);
    align-items: var(--layout-grid-align-items-md-resolved);
    align-content: var(--layout-grid-align-content-md-resolved);
    justify-content: var(--layout-grid-justify-content-md-resolved);
  }

  .layout-grid.type-grid {
    grid-template-columns: var(--layout-grid-columns-md-resolved);
    grid-auto-flow: var(--layout-grid-auto-flow-md-resolved);
    grid-auto-rows: var(--layout-grid-auto-rows-md-resolved);
    justify-items: var(--layout-grid-justify-items-md-resolved);
  }
}

@media (min-width: 1024px) {
  .layout-grid {
    flex-direction: var(--layout-grid-direction-lg-resolved);
    flex-wrap: var(--layout-grid-wrap-lg-resolved);
    gap:
      var(--layout-grid-row-gap-lg-resolved)
      var(--layout-grid-column-gap-lg-resolved);
    align-items: var(--layout-grid-align-items-lg-resolved);
    align-content: var(--layout-grid-align-content-lg-resolved);
    justify-content: var(--layout-grid-justify-content-lg-resolved);
  }

  .layout-grid.type-grid {
    grid-template-columns: var(--layout-grid-columns-lg-resolved);
    grid-auto-flow: var(--layout-grid-auto-flow-lg-resolved);
    grid-auto-rows: var(--layout-grid-auto-rows-lg-resolved);
    justify-items: var(--layout-grid-justify-items-lg-resolved);
  }
}

@media (min-width: 1280px) {
  .layout-grid {
    flex-direction: var(--layout-grid-direction-xl-resolved);
    flex-wrap: var(--layout-grid-wrap-xl-resolved);
    gap:
      var(--layout-grid-row-gap-xl-resolved)
      var(--layout-grid-column-gap-xl-resolved);
    align-items: var(--layout-grid-align-items-xl-resolved);
    align-content: var(--layout-grid-align-content-xl-resolved);
    justify-content: var(--layout-grid-justify-content-xl-resolved);
  }

  .layout-grid.type-grid {
    grid-template-columns: var(--layout-grid-columns-xl-resolved);
    grid-auto-flow: var(--layout-grid-auto-flow-xl-resolved);
    grid-auto-rows: var(--layout-grid-auto-rows-xl-resolved);
    justify-items: var(--layout-grid-justify-items-xl-resolved);
  }
}
</style>
