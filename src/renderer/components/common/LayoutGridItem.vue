<template>
  <component
    :is="props.as"
    class="layout-grid-item"
    :style="itemStyle"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed, type StyleValue } from 'vue'
import { createLayoutGridItemStyle, type LayoutGridItemProps } from './layout'

defineOptions({
  name: 'LayoutGridItem',
})

const props = withDefaults(defineProps<LayoutGridItemProps>(), {
  as: 'div',
  span: undefined,
  start: undefined,
  offset: undefined,
  order: undefined,
  alignSelf: undefined,
  justifySelf: undefined,
})

const itemStyle = computed<StyleValue>(() => createLayoutGridItemStyle(props))
</script>

<style scoped>
.layout-grid-item {
  --layout-grid-item-display-base-resolved: var(--layout-grid-item-display, block);
  --layout-grid-item-display-sm-resolved: var(--layout-grid-item-display-sm, var(--layout-grid-item-display-base-resolved));
  --layout-grid-item-display-md-resolved: var(--layout-grid-item-display-md, var(--layout-grid-item-display-sm-resolved));
  --layout-grid-item-display-lg-resolved: var(--layout-grid-item-display-lg, var(--layout-grid-item-display-md-resolved));
  --layout-grid-item-display-xl-resolved: var(--layout-grid-item-display-xl, var(--layout-grid-item-display-lg-resolved));
  --layout-grid-item-flex-base-resolved: var(--layout-grid-item-flex, 0 1 auto);
  --layout-grid-item-flex-sm-resolved: var(--layout-grid-item-flex-sm, var(--layout-grid-item-flex-base-resolved));
  --layout-grid-item-flex-md-resolved: var(--layout-grid-item-flex-md, var(--layout-grid-item-flex-sm-resolved));
  --layout-grid-item-flex-lg-resolved: var(--layout-grid-item-flex-lg, var(--layout-grid-item-flex-md-resolved));
  --layout-grid-item-flex-xl-resolved: var(--layout-grid-item-flex-xl, var(--layout-grid-item-flex-lg-resolved));
  --layout-grid-item-max-width-base-resolved: var(--layout-grid-item-max-width, none);
  --layout-grid-item-max-width-sm-resolved: var(--layout-grid-item-max-width-sm, var(--layout-grid-item-max-width-base-resolved));
  --layout-grid-item-max-width-md-resolved: var(--layout-grid-item-max-width-md, var(--layout-grid-item-max-width-sm-resolved));
  --layout-grid-item-max-width-lg-resolved: var(--layout-grid-item-max-width-lg, var(--layout-grid-item-max-width-md-resolved));
  --layout-grid-item-max-width-xl-resolved: var(--layout-grid-item-max-width-xl, var(--layout-grid-item-max-width-lg-resolved));
  --layout-grid-item-offset-base-resolved: var(--layout-grid-item-offset, 0);
  --layout-grid-item-offset-sm-resolved: var(--layout-grid-item-offset-sm, var(--layout-grid-item-offset-base-resolved));
  --layout-grid-item-offset-md-resolved: var(--layout-grid-item-offset-md, var(--layout-grid-item-offset-sm-resolved));
  --layout-grid-item-offset-lg-resolved: var(--layout-grid-item-offset-lg, var(--layout-grid-item-offset-md-resolved));
  --layout-grid-item-offset-xl-resolved: var(--layout-grid-item-offset-xl, var(--layout-grid-item-offset-lg-resolved));
  --layout-grid-item-column-base-resolved: var(--layout-grid-item-column, auto);
  --layout-grid-item-column-sm-resolved: var(--layout-grid-item-column-sm, var(--layout-grid-item-column-base-resolved));
  --layout-grid-item-column-md-resolved: var(--layout-grid-item-column-md, var(--layout-grid-item-column-sm-resolved));
  --layout-grid-item-column-lg-resolved: var(--layout-grid-item-column-lg, var(--layout-grid-item-column-md-resolved));
  --layout-grid-item-column-xl-resolved: var(--layout-grid-item-column-xl, var(--layout-grid-item-column-lg-resolved));
  --layout-grid-item-order-base-resolved: var(--layout-grid-item-order, initial);
  --layout-grid-item-order-sm-resolved: var(--layout-grid-item-order-sm, var(--layout-grid-item-order-base-resolved));
  --layout-grid-item-order-md-resolved: var(--layout-grid-item-order-md, var(--layout-grid-item-order-sm-resolved));
  --layout-grid-item-order-lg-resolved: var(--layout-grid-item-order-lg, var(--layout-grid-item-order-md-resolved));
  --layout-grid-item-order-xl-resolved: var(--layout-grid-item-order-xl, var(--layout-grid-item-order-lg-resolved));
  --layout-grid-item-align-self-base-resolved: var(--layout-grid-item-align-self, auto);
  --layout-grid-item-align-self-sm-resolved: var(--layout-grid-item-align-self-sm, var(--layout-grid-item-align-self-base-resolved));
  --layout-grid-item-align-self-md-resolved: var(--layout-grid-item-align-self-md, var(--layout-grid-item-align-self-sm-resolved));
  --layout-grid-item-align-self-lg-resolved: var(--layout-grid-item-align-self-lg, var(--layout-grid-item-align-self-md-resolved));
  --layout-grid-item-align-self-xl-resolved: var(--layout-grid-item-align-self-xl, var(--layout-grid-item-align-self-lg-resolved));
  --layout-grid-item-justify-self-base-resolved: var(--layout-grid-item-justify-self, auto);
  --layout-grid-item-justify-self-sm-resolved: var(--layout-grid-item-justify-self-sm, var(--layout-grid-item-justify-self-base-resolved));
  --layout-grid-item-justify-self-md-resolved: var(--layout-grid-item-justify-self-md, var(--layout-grid-item-justify-self-sm-resolved));
  --layout-grid-item-justify-self-lg-resolved: var(--layout-grid-item-justify-self-lg, var(--layout-grid-item-justify-self-md-resolved));
  --layout-grid-item-justify-self-xl-resolved: var(--layout-grid-item-justify-self-xl, var(--layout-grid-item-justify-self-lg-resolved));

  display: var(--layout-grid-item-display-base-resolved);
  min-width: 0;
  flex: var(--layout-grid-item-flex-base-resolved);
  max-width: var(--layout-grid-item-max-width-base-resolved);
  margin-left: var(--layout-grid-item-offset-base-resolved);
  grid-column: var(--layout-grid-item-column-base-resolved);
  order: var(--layout-grid-item-order-base-resolved);
  align-self: var(--layout-grid-item-align-self-base-resolved);
  justify-self: var(--layout-grid-item-justify-self-base-resolved);
}

@media (min-width: 640px) {
  .layout-grid-item {
    display: var(--layout-grid-item-display-sm-resolved);
    flex: var(--layout-grid-item-flex-sm-resolved);
    max-width: var(--layout-grid-item-max-width-sm-resolved);
    margin-left: var(--layout-grid-item-offset-sm-resolved);
    grid-column: var(--layout-grid-item-column-sm-resolved);
    order: var(--layout-grid-item-order-sm-resolved);
    align-self: var(--layout-grid-item-align-self-sm-resolved);
    justify-self: var(--layout-grid-item-justify-self-sm-resolved);
  }
}

@media (min-width: 768px) {
  .layout-grid-item {
    display: var(--layout-grid-item-display-md-resolved);
    flex: var(--layout-grid-item-flex-md-resolved);
    max-width: var(--layout-grid-item-max-width-md-resolved);
    margin-left: var(--layout-grid-item-offset-md-resolved);
    grid-column: var(--layout-grid-item-column-md-resolved);
    order: var(--layout-grid-item-order-md-resolved);
    align-self: var(--layout-grid-item-align-self-md-resolved);
    justify-self: var(--layout-grid-item-justify-self-md-resolved);
  }
}

@media (min-width: 1024px) {
  .layout-grid-item {
    display: var(--layout-grid-item-display-lg-resolved);
    flex: var(--layout-grid-item-flex-lg-resolved);
    max-width: var(--layout-grid-item-max-width-lg-resolved);
    margin-left: var(--layout-grid-item-offset-lg-resolved);
    grid-column: var(--layout-grid-item-column-lg-resolved);
    order: var(--layout-grid-item-order-lg-resolved);
    align-self: var(--layout-grid-item-align-self-lg-resolved);
    justify-self: var(--layout-grid-item-justify-self-lg-resolved);
  }
}

@media (min-width: 1280px) {
  .layout-grid-item {
    display: var(--layout-grid-item-display-xl-resolved);
    flex: var(--layout-grid-item-flex-xl-resolved);
    max-width: var(--layout-grid-item-max-width-xl-resolved);
    margin-left: var(--layout-grid-item-offset-xl-resolved);
    grid-column: var(--layout-grid-item-column-xl-resolved);
    order: var(--layout-grid-item-order-xl-resolved);
    align-self: var(--layout-grid-item-align-self-xl-resolved);
    justify-self: var(--layout-grid-item-justify-self-xl-resolved);
  }
}
</style>
