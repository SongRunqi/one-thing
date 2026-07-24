<template>
  <div class="settings-group">
    <slot />
  </div>
</template>

<style scoped>
/* Ledger: groups are chunks of rows on the page, not filled cards. */
.settings-group {
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
}
</style>
