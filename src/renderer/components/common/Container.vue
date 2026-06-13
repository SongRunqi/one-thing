<template>
  <component
    :is="props.as"
    class="layout-container"
    :class="containerClasses"
    :style="containerStyle"
  >
    <component
      v-if="slots.header"
      :is="props.headerAs"
      class="layout-container-header"
      :class="props.headerClass"
      :style="props.headerStyle"
    >
      <slot name="header" />
    </component>

    <div
      class="layout-container-body"
      :class="props.bodyClass"
      :style="props.bodyStyle"
    >
      <component
        v-if="slots.sidebar && !isSidebarRight"
        :is="props.sidebarAs"
        class="layout-container-sidebar"
        :class="props.sidebarClass"
        :style="props.sidebarStyle"
      >
        <slot name="sidebar" />
      </component>

      <component
        :is="props.mainAs"
        class="layout-container-main"
        :class="props.mainClass"
        :style="props.mainStyle"
      >
        <slot />
      </component>

      <component
        v-if="slots.sidebar && isSidebarRight"
        :is="props.sidebarAs"
        class="layout-container-sidebar"
        :class="props.sidebarClass"
        :style="props.sidebarStyle"
      >
        <slot name="sidebar" />
      </component>
    </div>

    <component
      v-if="slots.footer"
      :is="props.footerAs"
      class="layout-container-footer"
      :class="props.footerClass"
      :style="props.footerStyle"
    >
      <slot name="footer" />
    </component>
  </component>
</template>

<script setup lang="ts">
import { computed, useSlots, type StyleValue } from 'vue'
import { createContainerStyle, type ContainerProps } from './container'

defineOptions({
  name: 'Container',
})

const props = withDefaults(defineProps<ContainerProps>(), {
  as: 'section',
  headerAs: 'header',
  sidebarAs: 'aside',
  mainAs: 'main',
  footerAs: 'footer',
  headerClass: undefined,
  headerStyle: undefined,
  bodyClass: undefined,
  bodyStyle: undefined,
  sidebarClass: undefined,
  sidebarStyle: undefined,
  mainClass: undefined,
  mainStyle: undefined,
  footerClass: undefined,
  footerStyle: undefined,
  sidebarPosition: 'left',
  width: '100%',
  height: undefined,
  minHeight: undefined,
  gap: 0,
  rowGap: undefined,
  columnGap: undefined,
  padding: 0,
  headerHeight: undefined,
  footerHeight: undefined,
  sidebarWidth: 280,
  mainPadding: 0,
  sidebarPadding: 0,
  overflow: 'visible',
  mainOverflow: 'auto',
  sidebarOverflow: 'auto',
  bodyDirection: 'row',
  bodyWrap: false,
  bodyAlign: 'stretch',
  bodyJustify: 'start',
  bodyAlignContent: 'stretch',
  mainFlex: '1 1 auto',
  sidebarFlex: undefined,
  fullHeight: false,
})

const slots = useSlots()

const isSidebarRight = computed(() => props.sidebarPosition === 'right')

const containerClasses = computed(() => ({
  'has-header': Boolean(slots.header),
  'has-sidebar': Boolean(slots.sidebar),
  'has-footer': Boolean(slots.footer),
  'is-sidebar-right': isSidebarRight.value,
  'is-full-height': props.fullHeight,
}))

const containerStyle = computed<StyleValue>(() => createContainerStyle(props))
</script>

<style scoped>
.layout-container {
  --layout-container-width-base-resolved: var(--layout-container-width, 100%);
  --layout-container-width-sm-resolved: var(--layout-container-width-sm, var(--layout-container-width-base-resolved));
  --layout-container-width-md-resolved: var(--layout-container-width-md, var(--layout-container-width-sm-resolved));
  --layout-container-width-lg-resolved: var(--layout-container-width-lg, var(--layout-container-width-md-resolved));
  --layout-container-width-xl-resolved: var(--layout-container-width-xl, var(--layout-container-width-lg-resolved));
  --layout-container-height-base-resolved: var(--layout-container-height, auto);
  --layout-container-height-sm-resolved: var(--layout-container-height-sm, var(--layout-container-height-base-resolved));
  --layout-container-height-md-resolved: var(--layout-container-height-md, var(--layout-container-height-sm-resolved));
  --layout-container-height-lg-resolved: var(--layout-container-height-lg, var(--layout-container-height-md-resolved));
  --layout-container-height-xl-resolved: var(--layout-container-height-xl, var(--layout-container-height-lg-resolved));
  --layout-container-min-height-base-resolved: var(--layout-container-min-height, auto);
  --layout-container-min-height-sm-resolved: var(--layout-container-min-height-sm, var(--layout-container-min-height-base-resolved));
  --layout-container-min-height-md-resolved: var(--layout-container-min-height-md, var(--layout-container-min-height-sm-resolved));
  --layout-container-min-height-lg-resolved: var(--layout-container-min-height-lg, var(--layout-container-min-height-md-resolved));
  --layout-container-min-height-xl-resolved: var(--layout-container-min-height-xl, var(--layout-container-min-height-lg-resolved));
  --layout-container-gap-base-resolved: var(--layout-container-gap, 0);
  --layout-container-gap-sm-resolved: var(--layout-container-gap-sm, var(--layout-container-gap-base-resolved));
  --layout-container-gap-md-resolved: var(--layout-container-gap-md, var(--layout-container-gap-sm-resolved));
  --layout-container-gap-lg-resolved: var(--layout-container-gap-lg, var(--layout-container-gap-md-resolved));
  --layout-container-gap-xl-resolved: var(--layout-container-gap-xl, var(--layout-container-gap-lg-resolved));
  --layout-container-row-gap-base-resolved: var(--layout-container-row-gap, var(--layout-container-gap-base-resolved));
  --layout-container-row-gap-sm-resolved: var(--layout-container-row-gap-sm, var(--layout-container-row-gap, var(--layout-container-gap-sm-resolved)));
  --layout-container-row-gap-md-resolved: var(--layout-container-row-gap-md, var(--layout-container-row-gap-sm, var(--layout-container-row-gap, var(--layout-container-gap-md-resolved))));
  --layout-container-row-gap-lg-resolved: var(--layout-container-row-gap-lg, var(--layout-container-row-gap-md, var(--layout-container-row-gap-sm, var(--layout-container-row-gap, var(--layout-container-gap-lg-resolved)))));
  --layout-container-row-gap-xl-resolved: var(--layout-container-row-gap-xl, var(--layout-container-row-gap-lg, var(--layout-container-row-gap-md, var(--layout-container-row-gap-sm, var(--layout-container-row-gap, var(--layout-container-gap-xl-resolved))))));
  --layout-container-column-gap-base-resolved: var(--layout-container-column-gap, var(--layout-container-gap-base-resolved));
  --layout-container-column-gap-sm-resolved: var(--layout-container-column-gap-sm, var(--layout-container-column-gap, var(--layout-container-gap-sm-resolved)));
  --layout-container-column-gap-md-resolved: var(--layout-container-column-gap-md, var(--layout-container-column-gap-sm, var(--layout-container-column-gap, var(--layout-container-gap-md-resolved))));
  --layout-container-column-gap-lg-resolved: var(--layout-container-column-gap-lg, var(--layout-container-column-gap-md, var(--layout-container-column-gap-sm, var(--layout-container-column-gap, var(--layout-container-gap-lg-resolved)))));
  --layout-container-column-gap-xl-resolved: var(--layout-container-column-gap-xl, var(--layout-container-column-gap-lg, var(--layout-container-column-gap-md, var(--layout-container-column-gap-sm, var(--layout-container-column-gap, var(--layout-container-gap-xl-resolved))))));
  --layout-container-padding-base-resolved: var(--layout-container-padding, 0);
  --layout-container-padding-sm-resolved: var(--layout-container-padding-sm, var(--layout-container-padding-base-resolved));
  --layout-container-padding-md-resolved: var(--layout-container-padding-md, var(--layout-container-padding-sm-resolved));
  --layout-container-padding-lg-resolved: var(--layout-container-padding-lg, var(--layout-container-padding-md-resolved));
  --layout-container-padding-xl-resolved: var(--layout-container-padding-xl, var(--layout-container-padding-lg-resolved));
  --layout-container-header-height-base-resolved: var(--layout-container-header-height, auto);
  --layout-container-header-height-sm-resolved: var(--layout-container-header-height-sm, var(--layout-container-header-height-base-resolved));
  --layout-container-header-height-md-resolved: var(--layout-container-header-height-md, var(--layout-container-header-height-sm-resolved));
  --layout-container-header-height-lg-resolved: var(--layout-container-header-height-lg, var(--layout-container-header-height-md-resolved));
  --layout-container-header-height-xl-resolved: var(--layout-container-header-height-xl, var(--layout-container-header-height-lg-resolved));
  --layout-container-footer-height-base-resolved: var(--layout-container-footer-height, auto);
  --layout-container-footer-height-sm-resolved: var(--layout-container-footer-height-sm, var(--layout-container-footer-height-base-resolved));
  --layout-container-footer-height-md-resolved: var(--layout-container-footer-height-md, var(--layout-container-footer-height-sm-resolved));
  --layout-container-footer-height-lg-resolved: var(--layout-container-footer-height-lg, var(--layout-container-footer-height-md-resolved));
  --layout-container-footer-height-xl-resolved: var(--layout-container-footer-height-xl, var(--layout-container-footer-height-lg-resolved));
  --layout-container-sidebar-width-base-resolved: var(--layout-container-sidebar-width, 280px);
  --layout-container-sidebar-width-sm-resolved: var(--layout-container-sidebar-width-sm, var(--layout-container-sidebar-width-base-resolved));
  --layout-container-sidebar-width-md-resolved: var(--layout-container-sidebar-width-md, var(--layout-container-sidebar-width-sm-resolved));
  --layout-container-sidebar-width-lg-resolved: var(--layout-container-sidebar-width-lg, var(--layout-container-sidebar-width-md-resolved));
  --layout-container-sidebar-width-xl-resolved: var(--layout-container-sidebar-width-xl, var(--layout-container-sidebar-width-lg-resolved));
  --layout-container-main-padding-base-resolved: var(--layout-container-main-padding, 0);
  --layout-container-main-padding-sm-resolved: var(--layout-container-main-padding-sm, var(--layout-container-main-padding-base-resolved));
  --layout-container-main-padding-md-resolved: var(--layout-container-main-padding-md, var(--layout-container-main-padding-sm-resolved));
  --layout-container-main-padding-lg-resolved: var(--layout-container-main-padding-lg, var(--layout-container-main-padding-md-resolved));
  --layout-container-main-padding-xl-resolved: var(--layout-container-main-padding-xl, var(--layout-container-main-padding-lg-resolved));
  --layout-container-sidebar-padding-base-resolved: var(--layout-container-sidebar-padding, 0);
  --layout-container-sidebar-padding-sm-resolved: var(--layout-container-sidebar-padding-sm, var(--layout-container-sidebar-padding-base-resolved));
  --layout-container-sidebar-padding-md-resolved: var(--layout-container-sidebar-padding-md, var(--layout-container-sidebar-padding-sm-resolved));
  --layout-container-sidebar-padding-lg-resolved: var(--layout-container-sidebar-padding-lg, var(--layout-container-sidebar-padding-md-resolved));
  --layout-container-sidebar-padding-xl-resolved: var(--layout-container-sidebar-padding-xl, var(--layout-container-sidebar-padding-lg-resolved));
  --layout-container-overflow-base-resolved: var(--layout-container-overflow, visible);
  --layout-container-overflow-sm-resolved: var(--layout-container-overflow-sm, var(--layout-container-overflow-base-resolved));
  --layout-container-overflow-md-resolved: var(--layout-container-overflow-md, var(--layout-container-overflow-sm-resolved));
  --layout-container-overflow-lg-resolved: var(--layout-container-overflow-lg, var(--layout-container-overflow-md-resolved));
  --layout-container-overflow-xl-resolved: var(--layout-container-overflow-xl, var(--layout-container-overflow-lg-resolved));
  --layout-container-main-overflow-base-resolved: var(--layout-container-main-overflow, auto);
  --layout-container-main-overflow-sm-resolved: var(--layout-container-main-overflow-sm, var(--layout-container-main-overflow-base-resolved));
  --layout-container-main-overflow-md-resolved: var(--layout-container-main-overflow-md, var(--layout-container-main-overflow-sm-resolved));
  --layout-container-main-overflow-lg-resolved: var(--layout-container-main-overflow-lg, var(--layout-container-main-overflow-md-resolved));
  --layout-container-main-overflow-xl-resolved: var(--layout-container-main-overflow-xl, var(--layout-container-main-overflow-lg-resolved));
  --layout-container-sidebar-overflow-base-resolved: var(--layout-container-sidebar-overflow, auto);
  --layout-container-sidebar-overflow-sm-resolved: var(--layout-container-sidebar-overflow-sm, var(--layout-container-sidebar-overflow-base-resolved));
  --layout-container-sidebar-overflow-md-resolved: var(--layout-container-sidebar-overflow-md, var(--layout-container-sidebar-overflow-sm-resolved));
  --layout-container-sidebar-overflow-lg-resolved: var(--layout-container-sidebar-overflow-lg, var(--layout-container-sidebar-overflow-md-resolved));
  --layout-container-sidebar-overflow-xl-resolved: var(--layout-container-sidebar-overflow-xl, var(--layout-container-sidebar-overflow-lg-resolved));
  --layout-container-body-direction-base-resolved: var(--layout-container-body-direction, row);
  --layout-container-body-direction-sm-resolved: var(--layout-container-body-direction-sm, var(--layout-container-body-direction-base-resolved));
  --layout-container-body-direction-md-resolved: var(--layout-container-body-direction-md, var(--layout-container-body-direction-sm-resolved));
  --layout-container-body-direction-lg-resolved: var(--layout-container-body-direction-lg, var(--layout-container-body-direction-md-resolved));
  --layout-container-body-direction-xl-resolved: var(--layout-container-body-direction-xl, var(--layout-container-body-direction-lg-resolved));
  --layout-container-body-wrap-base-resolved: var(--layout-container-body-wrap, nowrap);
  --layout-container-body-wrap-sm-resolved: var(--layout-container-body-wrap-sm, var(--layout-container-body-wrap-base-resolved));
  --layout-container-body-wrap-md-resolved: var(--layout-container-body-wrap-md, var(--layout-container-body-wrap-sm-resolved));
  --layout-container-body-wrap-lg-resolved: var(--layout-container-body-wrap-lg, var(--layout-container-body-wrap-md-resolved));
  --layout-container-body-wrap-xl-resolved: var(--layout-container-body-wrap-xl, var(--layout-container-body-wrap-lg-resolved));
  --layout-container-body-align-items-base-resolved: var(--layout-container-body-align-items, stretch);
  --layout-container-body-align-items-sm-resolved: var(--layout-container-body-align-items-sm, var(--layout-container-body-align-items-base-resolved));
  --layout-container-body-align-items-md-resolved: var(--layout-container-body-align-items-md, var(--layout-container-body-align-items-sm-resolved));
  --layout-container-body-align-items-lg-resolved: var(--layout-container-body-align-items-lg, var(--layout-container-body-align-items-md-resolved));
  --layout-container-body-align-items-xl-resolved: var(--layout-container-body-align-items-xl, var(--layout-container-body-align-items-lg-resolved));
  --layout-container-body-justify-content-base-resolved: var(--layout-container-body-justify-content, start);
  --layout-container-body-justify-content-sm-resolved: var(--layout-container-body-justify-content-sm, var(--layout-container-body-justify-content-base-resolved));
  --layout-container-body-justify-content-md-resolved: var(--layout-container-body-justify-content-md, var(--layout-container-body-justify-content-sm-resolved));
  --layout-container-body-justify-content-lg-resolved: var(--layout-container-body-justify-content-lg, var(--layout-container-body-justify-content-md-resolved));
  --layout-container-body-justify-content-xl-resolved: var(--layout-container-body-justify-content-xl, var(--layout-container-body-justify-content-lg-resolved));
  --layout-container-body-align-content-base-resolved: var(--layout-container-body-align-content, stretch);
  --layout-container-body-align-content-sm-resolved: var(--layout-container-body-align-content-sm, var(--layout-container-body-align-content-base-resolved));
  --layout-container-body-align-content-md-resolved: var(--layout-container-body-align-content-md, var(--layout-container-body-align-content-sm-resolved));
  --layout-container-body-align-content-lg-resolved: var(--layout-container-body-align-content-lg, var(--layout-container-body-align-content-md-resolved));
  --layout-container-body-align-content-xl-resolved: var(--layout-container-body-align-content-xl, var(--layout-container-body-align-content-lg-resolved));
  --layout-container-main-flex-base-resolved: var(--layout-container-main-flex, 1 1 auto);
  --layout-container-main-flex-sm-resolved: var(--layout-container-main-flex-sm, var(--layout-container-main-flex-base-resolved));
  --layout-container-main-flex-md-resolved: var(--layout-container-main-flex-md, var(--layout-container-main-flex-sm-resolved));
  --layout-container-main-flex-lg-resolved: var(--layout-container-main-flex-lg, var(--layout-container-main-flex-md-resolved));
  --layout-container-main-flex-xl-resolved: var(--layout-container-main-flex-xl, var(--layout-container-main-flex-lg-resolved));
  --layout-container-sidebar-flex-base-resolved: var(--layout-container-sidebar-flex, 0 0 var(--layout-container-sidebar-width-base-resolved));
  --layout-container-sidebar-flex-sm-resolved: var(--layout-container-sidebar-flex-sm, var(--layout-container-sidebar-flex-base-resolved));
  --layout-container-sidebar-flex-md-resolved: var(--layout-container-sidebar-flex-md, var(--layout-container-sidebar-flex-sm-resolved));
  --layout-container-sidebar-flex-lg-resolved: var(--layout-container-sidebar-flex-lg, var(--layout-container-sidebar-flex-md-resolved));
  --layout-container-sidebar-flex-xl-resolved: var(--layout-container-sidebar-flex-xl, var(--layout-container-sidebar-flex-lg-resolved));

  box-sizing: border-box;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  row-gap: var(--layout-container-row-gap-base-resolved);
  width: var(--layout-container-width-base-resolved);
  height: var(--layout-container-height-base-resolved);
  min-width: 0;
  min-height: var(--layout-container-min-height-base-resolved);
  padding: var(--layout-container-padding-base-resolved);
  overflow: var(--layout-container-overflow-base-resolved);
}

.layout-container.is-full-height {
  height: var(--layout-container-height-base-resolved, 100%);
  min-height: 0;
}

.layout-container-header,
.layout-container-footer,
.layout-container-sidebar,
.layout-container-main {
  box-sizing: border-box;
  min-width: 0;
}

.layout-container-header {
  grid-row: 1;
  block-size: var(--layout-container-header-height-base-resolved);
}

.layout-container-body {
  grid-row: 2;
  display: flex;
  flex-direction: var(--layout-container-body-direction-base-resolved);
  flex-wrap: var(--layout-container-body-wrap-base-resolved);
  align-items: var(--layout-container-body-align-items-base-resolved);
  justify-content: var(--layout-container-body-justify-content-base-resolved);
  align-content: var(--layout-container-body-align-content-base-resolved);
  gap: var(--layout-container-column-gap-base-resolved);
  min-width: 0;
  min-height: 0;
}

.layout-container-sidebar {
  flex: var(--layout-container-sidebar-flex-base-resolved);
  display: flex;
  flex-direction: column;
  inline-size: var(--layout-container-sidebar-width-base-resolved);
  min-height: 0;
  padding: var(--layout-container-sidebar-padding-base-resolved);
  overflow: var(--layout-container-sidebar-overflow-base-resolved);
}

.layout-container-main {
  flex: var(--layout-container-main-flex-base-resolved);
  min-height: 0;
  padding: var(--layout-container-main-padding-base-resolved);
  overflow: var(--layout-container-main-overflow-base-resolved);
}

.layout-container-footer {
  grid-row: 3;
  block-size: var(--layout-container-footer-height-base-resolved);
}

@media (min-width: 640px) {
  .layout-container {
    row-gap: var(--layout-container-row-gap-sm-resolved);
    width: var(--layout-container-width-sm-resolved);
    height: var(--layout-container-height-sm-resolved);
    min-height: var(--layout-container-min-height-sm-resolved);
    padding: var(--layout-container-padding-sm-resolved);
    overflow: var(--layout-container-overflow-sm-resolved);
  }

  .layout-container.is-full-height {
    height: var(--layout-container-height-sm-resolved, 100%);
    min-height: 0;
  }

  .layout-container-header {
    block-size: var(--layout-container-header-height-sm-resolved);
  }

  .layout-container-body {
    flex-direction: var(--layout-container-body-direction-sm-resolved);
    flex-wrap: var(--layout-container-body-wrap-sm-resolved);
    align-items: var(--layout-container-body-align-items-sm-resolved);
    justify-content: var(--layout-container-body-justify-content-sm-resolved);
    align-content: var(--layout-container-body-align-content-sm-resolved);
    gap: var(--layout-container-column-gap-sm-resolved);
  }

  .layout-container-sidebar {
    flex: var(--layout-container-sidebar-flex-sm-resolved);
    inline-size: var(--layout-container-sidebar-width-sm-resolved);
    padding: var(--layout-container-sidebar-padding-sm-resolved);
    overflow: var(--layout-container-sidebar-overflow-sm-resolved);
  }

  .layout-container-main {
    flex: var(--layout-container-main-flex-sm-resolved);
    padding: var(--layout-container-main-padding-sm-resolved);
    overflow: var(--layout-container-main-overflow-sm-resolved);
  }

  .layout-container-footer {
    block-size: var(--layout-container-footer-height-sm-resolved);
  }
}

@media (min-width: 768px) {
  .layout-container {
    row-gap: var(--layout-container-row-gap-md-resolved);
    width: var(--layout-container-width-md-resolved);
    height: var(--layout-container-height-md-resolved);
    min-height: var(--layout-container-min-height-md-resolved);
    padding: var(--layout-container-padding-md-resolved);
    overflow: var(--layout-container-overflow-md-resolved);
  }

  .layout-container.is-full-height {
    height: var(--layout-container-height-md-resolved, 100%);
    min-height: 0;
  }

  .layout-container-header {
    block-size: var(--layout-container-header-height-md-resolved);
  }

  .layout-container-body {
    flex-direction: var(--layout-container-body-direction-md-resolved);
    flex-wrap: var(--layout-container-body-wrap-md-resolved);
    align-items: var(--layout-container-body-align-items-md-resolved);
    justify-content: var(--layout-container-body-justify-content-md-resolved);
    align-content: var(--layout-container-body-align-content-md-resolved);
    gap: var(--layout-container-column-gap-md-resolved);
  }

  .layout-container-sidebar {
    flex: var(--layout-container-sidebar-flex-md-resolved);
    inline-size: var(--layout-container-sidebar-width-md-resolved);
    padding: var(--layout-container-sidebar-padding-md-resolved);
    overflow: var(--layout-container-sidebar-overflow-md-resolved);
  }

  .layout-container-main {
    flex: var(--layout-container-main-flex-md-resolved);
    padding: var(--layout-container-main-padding-md-resolved);
    overflow: var(--layout-container-main-overflow-md-resolved);
  }

  .layout-container-footer {
    block-size: var(--layout-container-footer-height-md-resolved);
  }
}

@media (min-width: 1024px) {
  .layout-container {
    row-gap: var(--layout-container-row-gap-lg-resolved);
    width: var(--layout-container-width-lg-resolved);
    height: var(--layout-container-height-lg-resolved);
    min-height: var(--layout-container-min-height-lg-resolved);
    padding: var(--layout-container-padding-lg-resolved);
    overflow: var(--layout-container-overflow-lg-resolved);
  }

  .layout-container.is-full-height {
    height: var(--layout-container-height-lg-resolved, 100%);
    min-height: 0;
  }

  .layout-container-header {
    block-size: var(--layout-container-header-height-lg-resolved);
  }

  .layout-container-body {
    flex-direction: var(--layout-container-body-direction-lg-resolved);
    flex-wrap: var(--layout-container-body-wrap-lg-resolved);
    align-items: var(--layout-container-body-align-items-lg-resolved);
    justify-content: var(--layout-container-body-justify-content-lg-resolved);
    align-content: var(--layout-container-body-align-content-lg-resolved);
    gap: var(--layout-container-column-gap-lg-resolved);
  }

  .layout-container-sidebar {
    flex: var(--layout-container-sidebar-flex-lg-resolved);
    inline-size: var(--layout-container-sidebar-width-lg-resolved);
    padding: var(--layout-container-sidebar-padding-lg-resolved);
    overflow: var(--layout-container-sidebar-overflow-lg-resolved);
  }

  .layout-container-main {
    flex: var(--layout-container-main-flex-lg-resolved);
    padding: var(--layout-container-main-padding-lg-resolved);
    overflow: var(--layout-container-main-overflow-lg-resolved);
  }

  .layout-container-footer {
    block-size: var(--layout-container-footer-height-lg-resolved);
  }
}

@media (min-width: 1280px) {
  .layout-container {
    row-gap: var(--layout-container-row-gap-xl-resolved);
    width: var(--layout-container-width-xl-resolved);
    height: var(--layout-container-height-xl-resolved);
    min-height: var(--layout-container-min-height-xl-resolved);
    padding: var(--layout-container-padding-xl-resolved);
    overflow: var(--layout-container-overflow-xl-resolved);
  }

  .layout-container.is-full-height {
    height: var(--layout-container-height-xl-resolved, 100%);
    min-height: 0;
  }

  .layout-container-header {
    block-size: var(--layout-container-header-height-xl-resolved);
  }

  .layout-container-body {
    flex-direction: var(--layout-container-body-direction-xl-resolved);
    flex-wrap: var(--layout-container-body-wrap-xl-resolved);
    align-items: var(--layout-container-body-align-items-xl-resolved);
    justify-content: var(--layout-container-body-justify-content-xl-resolved);
    align-content: var(--layout-container-body-align-content-xl-resolved);
    gap: var(--layout-container-column-gap-xl-resolved);
  }

  .layout-container-sidebar {
    flex: var(--layout-container-sidebar-flex-xl-resolved);
    inline-size: var(--layout-container-sidebar-width-xl-resolved);
    padding: var(--layout-container-sidebar-padding-xl-resolved);
    overflow: var(--layout-container-sidebar-overflow-xl-resolved);
  }

  .layout-container-main {
    flex: var(--layout-container-main-flex-xl-resolved);
    padding: var(--layout-container-main-padding-xl-resolved);
    overflow: var(--layout-container-main-overflow-xl-resolved);
  }

  .layout-container-footer {
    block-size: var(--layout-container-footer-height-xl-resolved);
  }
}
</style>
