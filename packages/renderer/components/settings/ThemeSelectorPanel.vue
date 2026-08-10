<template>
  <div class="theme-selector">
    <div class="theme-select-grid">
      <div
        v-for="item in modeItems"
        :key="item.mode"
        class="theme-select-field"
      >
        <label class="theme-select-label">{{ item.label }}</label>
        <div class="theme-dropdown">
          <Button
            :ref="el => setTriggerEl(item.mode, el)"
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

          <!-- 面与坐标分家(波 4):Teleport / 翻转 / 视口钳制 / 外点 / Esc /
               滚动跟随全部由 Popover 内核给;这张**纸**仍是设置窗的画线风
               (方角、settings-rule 的发丝、纸面投影),通过实例级
               `--app-popover-*` 表达 —— 档位只是 fallback,实例赢过档位。
               设置窗不铺壁纸("窗外不适用",wallpaper.css 块尾),所以这里
               不进 E 级名单。 -->
          <Popover
            :open="openMode === item.mode"
            :anchor="triggerEls[item.mode]"
            placement="bottom-start"
            :offset="6"
            width="anchor"
            surface="elevated"
            class="theme-menu-surface"
            transition="theme-menu"
            :close-on="MENU_CLOSE_ON"
            @update:open="value => value || closeDropdown()"
          >
            <div
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
          </Popover>
        </div>
      </div>
    </div>

    <div class="theme-actions">
      <Button
        unstyled
        class="action-btn"
        native-type="button"
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
import Popover from '@/components/common/Popover.vue'
import { computed, onMounted, ref } from 'vue'
import { Check, ChevronDown, FolderOpen, RefreshCw } from 'lucide-vue-next'
import { useThemeStore } from '@/stores/themes'
import type { ThemeMeta } from '@shared/ipc'

type ThemeMode = 'light' | 'dark'

const themeStore = useThemeStore()
const openMode = ref<ThemeMode | null>(null)

/** 冻结:prop 身份每次渲染都换会让内核白跑一遍绑定。 */
const MENU_CLOSE_ON = Object.freeze({ esc: true, outside: true, scroll: false })

/** 两个触发钮各一枚锚点(内核按锚点算坐标,不再靠 `position: relative` 的祖先)。 */
const triggerEls = ref<Record<ThemeMode, HTMLElement | null>>({ light: null, dark: null })

function setTriggerEl(mode: ThemeMode, instance: unknown): void {
  const el = instance instanceof HTMLElement
    ? instance
    : ((instance as { $el?: unknown } | null)?.$el as HTMLElement | undefined) ?? null
  triggerEls.value[mode] = el
}

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
  color: var(--settings-ink-2, var(--ui-text-primary-fg));
  font-size: 13px;
  font-weight: 650;
  line-height: 1.3;
}

/* `position: relative` 随浮层一起走了 —— 内核按锚点算视口坐标,不再需要一个
   定位祖先(反过来说,定位祖先正是"菜单被 overflow 剪掉"那一类 bug 的温床)。 */
.theme-dropdown {
  min-width: 0;
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
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  border-radius: 0;
  background: transparent;
  color: var(--settings-ink, var(--ui-text-primary-fg));
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: border-color var(--duration-fast) var(--ease-default);
}

.theme-trigger:hover,
.theme-trigger[aria-expanded='true'] {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg));
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
  color: var(--settings-ink, var(--ui-text-primary-fg));
  font-size: 13px;
  font-weight: 620;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-trigger-meta,
.theme-option-meta {
  overflow: hidden;
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  font-size: 11px;
  line-height: 1.2;
  text-overflow: ellipsis;
  text-transform: capitalize;
  white-space: nowrap;
}

.theme-trigger-icon {
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
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
  border: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border, var(--ui-border-default-border)));
  border-radius: 0;
  background: transparent;
}

.option-palette {
  width: 42px;
  height: 22px;
}

.theme-swatch {
  min-width: 0;
  box-shadow: inset -1px 0 0 color-mix(in srgb, var(--settings-rule-soft, var(--ui-border-subtle-border, var(--ui-border-default-border))) 45%, transparent);
}

/* Dropdown sheet: paper base (covers content below) + hard-offset ink shadow. */
/* 坐标 / 层级 / 外点 / Esc / 翻转 / 钳制全部由 Popover 内核给(波 4);这里只剩
   列表本身的滚动上限。这张纸的画线风走全局块里的 `--app-popover-*`(Popover 根
   拿不到本组件的 scoped 作用域,ui-system.md §1)。 */
.theme-menu {
  max-height: 280px;
  overflow-y: auto;
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
  color: var(--settings-ink, var(--ui-text-primary-fg));
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.theme-option + .theme-option {
  border-top: 1px solid color-mix(in srgb, var(--settings-rule-soft, var(--ui-border-subtle-border, var(--ui-border-default-border))) 45%, transparent);
}

.theme-option:hover {
  background: transparent;
}

.theme-option:hover .theme-option-meta {
  color: var(--settings-ink-2, var(--ui-text-secondary-fg));
}

/* Selection lives in the left ink rule, not a fill. */
.theme-option.selected {
  background: transparent;
  box-shadow: inset 2px 0 0 var(--settings-accent, var(--ui-accent-primary-fg));
}

.theme-option-check {
  color: var(--settings-accent, var(--ui-accent-primary-fg));
}

.theme-menu-empty {
  padding: 14px 10px;
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
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
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  border-radius: 0;
  background: transparent;
  color: var(--settings-ink-2, var(--ui-text-primary-fg));
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  transition: border-color var(--duration-fast) var(--ease-default), color var(--duration-fast) var(--ease-default);
}

.action-btn:hover:not(:disabled) {
  border-color: var(--settings-ink-3, var(--ui-text-muted-fg));
  background: transparent;
  color: var(--settings-ink, var(--ui-text-primary-fg));
}

.action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.spinning {
  animation: spin 0.9s linear infinite;
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

<!-- Popover 的根是 Teleport,拿不到本组件的 scoped 作用域(ui-system.md §1):
     这张纸的皮肤与进场都只能落在全局块里。 -->
<style>
/* 设置窗的画线风:方角、settings-rule 的发丝、纸面投影(`--shadow-paper` 是画在
   右下的实心偏移,不是弥散投影)。这三条是**设置窗的语言**,不是"忘了归位的
   自绘面" —— 所以走实例级覆写而不是改档位:实例永远赢过档位。 */
.theme-menu-surface {
  --app-popover-padding: 0;
  --app-popover-radius: 0;
  --app-popover-border: var(--settings-rule, var(--ui-border-default-border));
  --app-popover-bg: var(--ui-surface-elevated-bg, var(--settings-paper));
  --app-popover-shadow: var(--shadow-paper);
}

.theme-menu-enter-active,
.theme-menu-leave-active {
  transition: opacity var(--duration-fast) var(--ease-default), transform var(--duration-fast) var(--ease-default);
}

.theme-menu-enter-from,
.theme-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
