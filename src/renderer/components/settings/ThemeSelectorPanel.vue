<template>
  <div
    ref="rootRef"
    class="theme-selector"
    @keydown.esc="closeDropdown"
  >
    <div class="theme-select-grid">
      <div
        v-for="item in modeItems"
        :key="item.mode"
        class="theme-select-field"
      >
        <label class="theme-select-label">{{ item.label }}</label>
        <div class="theme-dropdown">
          <Button
            unstyled
            class="theme-trigger"
            native-type="button"
            :aria-expanded="openMode === item.mode"
            :aria-controls="`theme-menu-${item.mode}`"
            @click="toggleDropdown(item.mode)"
          >
            <span class="theme-palette">
              <span
                v-for="(color, index) in getThemePalette(selectedThemeForMode(item.mode))"
                :key="`${item.mode}-selected-${color}-${index}`"
                class="theme-swatch"
                :style="{ background: color }"
              />
            </span>
            <span class="theme-trigger-copy">
              <span class="theme-trigger-name">
                {{ selectedThemeForMode(item.mode)?.name || 'Select theme' }}
              </span>
              <span class="theme-trigger-meta">
                {{ selectedThemeForMode(item.mode)?.source || 'No theme selected' }}
              </span>
            </span>
            <ChevronDown
              class="theme-trigger-icon"
              :size="15"
            />
          </Button>

          <Transition name="theme-menu">
            <div
              v-if="openMode === item.mode"
              :id="`theme-menu-${item.mode}`"
              class="theme-menu"
              role="listbox"
            >
              <Button
                v-for="theme in themesForMode(item.mode)"
                :key="theme.id"
                unstyled
                class="theme-option"
                :class="{ selected: selectedThemeIdForMode(item.mode) === theme.id }"
                native-type="button"
                role="option"
                :aria-selected="selectedThemeIdForMode(item.mode) === theme.id"
                @click="selectTheme(theme.id, item.mode)"
              >
                <span class="theme-palette option-palette">
                  <span
                    v-for="(color, index) in getThemePalette(theme)"
                    :key="`${item.mode}-${theme.id}-${color}-${index}`"
                    class="theme-swatch"
                    :style="{ background: color }"
                  />
                </span>
                <span class="theme-option-copy">
                  <span class="theme-option-name">{{ theme.name }}</span>
                  <span class="theme-option-meta">
                    {{ theme.source }} - {{ theme.colorScheme }}
                  </span>
                </span>
                <Check
                  v-if="selectedThemeIdForMode(item.mode) === theme.id"
                  class="theme-option-check"
                  :size="14"
                />
              </Button>

              <div
                v-if="themesForMode(item.mode).length === 0"
                class="theme-menu-empty"
              >
                No {{ item.mode }} themes found
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <div class="theme-actions">
      <Button
        unstyled
        class="action-btn"
        native-type="button"
        title="Open themes folder"
        @click="openThemesFolder"
      >
        <FolderOpen :size="15" />
        <span>Open folder</span>
      </Button>
      <Button
        unstyled
        class="action-btn"
        native-type="button"
        :disabled="themeStore.isLoading"
        @click="refreshThemes"
      >
        <RefreshCw
          :class="{ spinning: themeStore.isLoading }"
          :size="15"
        />
        <span>{{ themeStore.isLoading ? 'Refreshing...' : 'Refresh' }}</span>
      </Button>
    </div>

    <ErrorNote
      v-if="themeStore.error"
      :message="themeStore.error"
    />
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, ChevronDown, FolderOpen, RefreshCw } from 'lucide-vue-next'
import { useThemeStore } from '@/stores/themes'
import type { ThemeMeta } from '@shared/ipc'

type ThemeMode = 'light' | 'dark'

const themeStore = useThemeStore()
const rootRef = ref<HTMLElement | null>(null)
const openMode = ref<ThemeMode | null>(null)

const emit = defineEmits<{
  (e: 'themeChange', darkThemeId: string, lightThemeId: string): void
}>()

const modeItems: Array<{ mode: ThemeMode; label: string }> = [
  { mode: 'light', label: 'Light theme' },
  { mode: 'dark', label: 'Dark theme' },
]
const FALLBACK_THEME_PALETTE = [
  'var(--ui-surface-app-bg)',
  'var(--ui-surface-sidebar-bg)',
  'var(--ui-accent-primary-fg)',
  'var(--ui-text-primary-fg)',
]

const lightThemes = computed(() =>
  themeStore.availableThemes.filter(theme => theme.colorScheme === 'light' || theme.colorScheme === 'both')
)

const darkThemes = computed(() =>
  themeStore.availableThemes.filter(theme => theme.colorScheme === 'dark' || theme.colorScheme === 'both')
)

onMounted(async () => {
  if (themeStore.availableThemes.length === 0) {
    await themeStore.initialize()
  }
  document.addEventListener('mousedown', handleOutsideClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleOutsideClick)
})

function themesForMode(mode: ThemeMode): ThemeMeta[] {
  return mode === 'dark' ? darkThemes.value : lightThemes.value
}

function selectedThemeIdForMode(mode: ThemeMode): string {
  return mode === 'dark' ? themeStore.darkThemeId : themeStore.lightThemeId
}

function selectedThemeForMode(mode: ThemeMode): ThemeMeta | undefined {
  const selectedId = selectedThemeIdForMode(mode)
  return themesForMode(mode).find(theme => theme.id === selectedId)
    ?? themeStore.availableThemes.find(theme => theme.id === selectedId)
    ?? themesForMode(mode)[0]
}

function getThemePalette(theme?: ThemeMeta): string[] {
  const colors = theme?.previewColors
  if (colors?.palette?.length) {
    return colors.palette.slice(0, 5)
  }

  const palette = [colors?.bg, colors?.sidebar, colors?.accent, colors?.text]
    .filter((color): color is string => Boolean(color))

  return palette.length > 0
    ? palette.slice(0, 5)
    : FALLBACK_THEME_PALETTE
}

function toggleDropdown(mode: ThemeMode) {
  openMode.value = openMode.value === mode ? null : mode
}

function closeDropdown() {
  openMode.value = null
}

function handleOutsideClick(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target || !rootRef.value || rootRef.value.contains(target)) return
  closeDropdown()
}

async function selectTheme(themeId: string, mode: ThemeMode) {
  await themeStore.setThemeForMode(themeId, mode)
  emit('themeChange', themeStore.darkThemeId, themeStore.lightThemeId)
  closeDropdown()
}

async function openThemesFolder() {
  await themeStore.openThemesFolder()
}

async function refreshThemes() {
  await themeStore.refreshThemes()
}
</script>

<style scoped>
.theme-selector {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.theme-select-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.theme-select-field {
  min-width: 0;
}

.theme-select-label {
  display: block;
  margin: 0 0 7px;
  color: var(--settings-ink-2, var(--ui-text-primary-fg, var(--text-primary)));
  font-size: 13px;
  font-weight: 650;
  line-height: 1.3;
}

.theme-dropdown {
  position: relative;
}

/* Square drafting box, no fill; state moves to the line. */
.theme-trigger {
  width: 100%;
  min-height: 42px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 0;
  background: transparent;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: border-color 0.12s ease;
}

.theme-trigger:hover,
.theme-trigger[aria-expanded='true'] {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.theme-trigger-copy,
.theme-option-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.theme-trigger-name,
.theme-option-name {
  overflow: hidden;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  font-size: 13px;
  font-weight: 620;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-trigger-meta,
.theme-option-meta {
  overflow: hidden;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-size: 11px;
  line-height: 1.2;
  text-overflow: ellipsis;
  text-transform: capitalize;
  white-space: nowrap;
}

.theme-trigger-icon {
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
}

/* Preview strip: swatches stay, container keeps square corners.
   Fixed 44px is intrinsic chip sizing (same exemption as toggles). */
.theme-palette {
  width: 44px;
  height: 24px;
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border)));
  border-radius: 0;
  background: transparent;
}

.option-palette {
  width: 42px;
  height: 22px;
}

.theme-swatch {
  min-width: 0;
  box-shadow: inset -1px 0 0 color-mix(in srgb, var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border))) 45%, transparent);
}

/* Dropdown sheet: paper base (covers content below) + hard-offset ink shadow. */
.theme-menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 0;
  background: var(--ui-surface-elevated-bg, var(--settings-paper, var(--bg-panel)));
  box-shadow: 4px 4px 0 color-mix(in srgb, var(--settings-rule, var(--ui-border-default-border, var(--border))) 24%, transparent);
}

.theme-option {
  width: 100%;
  min-height: 40px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 18px;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text)));
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.theme-option + .theme-option {
  border-top: 1px solid color-mix(in srgb, var(--settings-rule-soft, var(--ui-border-subtle-border, var(--border))) 45%, transparent);
}

.theme-option:hover {
  background: transparent;
}

.theme-option:hover .theme-option-meta {
  color: var(--settings-ink-2, var(--ui-text-secondary-fg, var(--text-secondary)));
}

/* Selection lives in the left ink rule, not a fill. */
.theme-option.selected {
  background: transparent;
  box-shadow: inset 2px 0 0 var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.theme-option-check {
  color: var(--settings-accent, var(--ui-accent-primary-fg, var(--accent)));
}

.theme-menu-empty {
  padding: 14px 10px;
  color: var(--settings-ink-4, var(--ui-text-muted-fg, var(--muted)));
  font-size: 12px;
  text-align: center;
}

.theme-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 2px;
}

.action-btn {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border, var(--border)));
  border-radius: 0;
  background: transparent;
  color: var(--settings-ink-2, var(--ui-text-primary-fg, var(--text-primary)));
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  transition: border-color 0.12s ease, color 0.12s ease;
}

.action-btn:hover:not(:disabled) {
  border-color: var(--settings-ink-3, var(--ui-text-muted-fg, var(--text-muted)));
  background: transparent;
  color: var(--settings-ink, var(--ui-text-primary-fg, var(--text-primary)));
}

.action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.spinning {
  animation: spin 0.9s linear infinite;
}

.theme-menu-enter-active,
.theme-menu-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.theme-menu-enter-from,
.theme-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 720px) {
  .theme-select-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
