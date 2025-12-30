<template>
  <div class="sidebar-header">
    <div class="traffic-lights-row">
      <div class="traffic-lights-space"></div>
      <button
        class="sidebar-toggle-btn"
        title="Hide sidebar"
        @click="$emit('toggle-collapse')"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
        </svg>
      </button>
    </div>
    <div class="sidebar-actions">
      <div class="search-wrapper">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          :value="searchQuery"
          type="text"
          class="search-input"
          placeholder="Search..."
          @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
          @keydown.escape="$emit('update:searchQuery', '')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  searchQuery: string
}

interface Emits {
  (e: 'toggle-collapse'): void
  (e: 'update:searchQuery', value: string): void
}

defineProps<Props>()
defineEmits<Emits>()
</script>

<style scoped>
/* Sidebar Header with traffic lights space */
.sidebar-header {
  flex-shrink: 0;
  padding: 0 12px;
}

.traffic-lights-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  height: 52px;
  margin-top: -3px; /* Pull up to align with traffic lights */
  -webkit-app-region: drag;
}

.traffic-lights-space {
  width: 70px; /* Space for macOS traffic lights */
  flex-shrink: 0;
}

.sidebar-toggle-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
  -webkit-app-region: no-drag;
}

.sidebar-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

html[data-theme='light'] .sidebar-toggle-btn:hover {
  background: rgba(0, 0, 0, 0.06);
}

.sidebar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 0px;
}

.search-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  user-select: none;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  transition: all 0.2s ease;
}

html[data-theme='light'] .search-wrapper {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.08);
}

.search-wrapper:focus-within {
  border-color: var(--accent);
  background: rgba(255, 255, 255, 0.08);
}

.search-icon {
  flex-shrink: 0;
  color: var(--muted);
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--text);
  outline: none;
  min-width: 0;
}

.search-input::placeholder {
  color: var(--muted);
}
</style>
