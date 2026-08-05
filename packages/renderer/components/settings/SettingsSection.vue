<template>
  <section class="settings-section">
    <header
      v-if="title || description || $slots.actions"
      class="settings-section-header"
    >
      <div class="settings-section-copy">
        <h3
          v-if="title"
          class="settings-section-title"
        >
          {{ title }}
        </h3>
        <p
          v-if="description"
          class="settings-section-description"
        >
          {{ description }}
        </p>
      </div>
      <div
        v-if="$slots.actions"
        class="settings-section-actions"
      >
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
}>()
</script>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 24px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.settings-section-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.settings-section-copy {
  min-width: 0;
}

.settings-section-title {
  margin: 0;
  color: var(--settings-ink-2, var(--type-title-sm-color, var(--ui-text-primary-fg)));
  font-size: var(--type-title-sm-size);
  font-weight: var(--type-title-sm-weight);
  line-height: var(--type-title-sm-line-height);
  letter-spacing: 0;
}

.settings-section-description {
  max-width: 620px;
  margin: 3px 0 0;
  color: var(--settings-ink-4, var(--type-meta-color, var(--ui-text-muted-fg)));
  font-size: var(--type-meta-size);
  line-height: var(--type-meta-line-height);
}

.settings-section-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
