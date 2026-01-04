/**
 * Theme Store
 * Manages theme loading, application, and preview functionality
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ThemeMeta, Theme, GetThemesResponse, ApplyThemeResponse } from '../../shared/ipc'
import { useSettingsStore } from './settings'

export const useThemeStore = defineStore('themes', () => {
  // ============= State =============

  /** All available themes (built-in + custom) */
  const availableThemes = ref<ThemeMeta[]>([])

  /** Theme ID for dark mode */
  const darkThemeId = ref<string>('flexoki')

  /** Theme ID for light mode */
  const lightThemeId = ref<string>('flexoki')

  /** Loading state */
  const isLoading = ref(false)

  /** Error message if any */
  const error = ref<string | null>(null)

  /** Cached full theme objects */
  const themeCache = ref<Map<string, Theme>>(new Map())

  /** Preview theme ID (null when not previewing) */
  const previewThemeId = ref<string | null>(null)

  /** Original theme ID before preview (for restore) */
  const prePreviewThemeId = ref<string | null>(null)

  // ============= Computed =============

  /** Current theme ID based on effective theme mode */
  const currentThemeId = computed(() => {
    const settingsStore = useSettingsStore()
    const mode = settingsStore.effectiveTheme
    return mode === 'dark' ? darkThemeId.value : lightThemeId.value
  })

  /** Currently displayed theme (preview or actual) */
  const displayedThemeId = computed(() => previewThemeId.value || currentThemeId.value)

  /** Get current theme meta */
  const currentThemeMeta = computed(() =>
    availableThemes.value.find(t => t.id === currentThemeId.value)
  )

  /** Built-in themes */
  const builtinThemes = computed(() =>
    availableThemes.value.filter(t => t.source === 'builtin')
  )

  /** User custom themes */
  const userThemes = computed(() =>
    availableThemes.value.filter(t => t.source === 'user')
  )

  /** Project themes */
  const projectThemes = computed(() =>
    availableThemes.value.filter(t => t.source === 'project')
  )

  // ============= Actions =============

  /**
   * Load all available themes from main process
   */
  async function loadThemes(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const response: GetThemesResponse = await window.electronAPI.getThemes()

      if (response.success && response.themes) {
        availableThemes.value = response.themes
        console.log('[ThemeStore] Loaded', response.themes.length, 'themes')
      } else {
        error.value = response.error || 'Failed to load themes'
        console.error('[ThemeStore] Failed to load themes:', response.error)
      }
    } catch (err: any) {
      error.value = err.message
      console.error('[ThemeStore] Error loading themes:', err)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get full theme object (with caching)
   */
  async function getTheme(themeId: string): Promise<Theme | null> {
    // Check cache first
    const cached = themeCache.value.get(themeId)
    if (cached) return cached

    try {
      const response = await window.electronAPI.getTheme(themeId)

      if (response.success && response.theme) {
        themeCache.value.set(themeId, response.theme)
        return response.theme
      }

      console.error('[ThemeStore] Failed to get theme:', themeId, response.error)
      return null
    } catch (err: any) {
      console.error('[ThemeStore] Error getting theme:', themeId, err)
      return null
    }
  }

  /**
   * Set theme for a specific mode (dark or light)
   * IMPORTANT: Only updates the selected mode's ref, preserves the other mode's ref.
   * Refs are the source of truth, not settings.
   * @param themeId - Theme ID to set
   * @param mode - Which mode to set the theme for ('dark' | 'light')
   */
  async function setThemeForMode(themeId: string, mode: 'dark' | 'light'): Promise<boolean> {
    const settingsStore = useSettingsStore()

    // Only update the selected mode's ref, DO NOT touch the other mode's ref
    // This ensures refs remain the source of truth and prevents race conditions
    if (mode === 'dark') {
      darkThemeId.value = themeId
    } else {
      lightThemeId.value = themeId
    }

    // Build new settings using current ref values (refs are source of truth)
    // Spread the original general object to preserve all required properties
    const newSettings = {
      ...settingsStore.settings,
      general: {
        ...settingsStore.settings.general,
        darkThemeId: darkThemeId.value || settingsStore.settings.general?.darkThemeId || 'flexoki',
        lightThemeId: lightThemeId.value || settingsStore.settings.general?.lightThemeId || 'flexoki',
      },
    }
    await settingsStore.saveSettings(newSettings)

    // Only apply if current mode matches
    if (settingsStore.effectiveTheme === mode) {
      return await applyCurrentTheme()
    }

    console.log('[ThemeStore] Set theme for mode:', mode, '=', themeId)
    return true
  }

  /**
   * Apply the current effective theme
   * Used internally and when mode changes
   */
  async function applyCurrentTheme(): Promise<boolean> {
    const settingsStore = useSettingsStore()
    const mode = settingsStore.effectiveTheme
    const themeId = currentThemeId.value

    try {
      const response: ApplyThemeResponse = await window.electronAPI.applyTheme(themeId, mode)

      if (response.success && response.cssVariables) {
        applyThemeVariables(response.cssVariables)

        // Cache to localStorage for instant startup
        localStorage.setItem('cached-theme-id', themeId)
        localStorage.setItem('cached-dark-theme-id', darkThemeId.value)
        localStorage.setItem('cached-light-theme-id', lightThemeId.value)

        console.log('[ThemeStore] Applied theme:', themeId, 'mode:', mode)
        return true
      }

      console.error('[ThemeStore] Failed to apply theme:', themeId, response.error)
      error.value = response.error || 'Failed to apply theme'
      return false
    } catch (err: any) {
      console.error('[ThemeStore] Error applying theme:', themeId, err)
      error.value = err.message
      return false
    }
  }

  /**
   * Legacy: Apply a theme (for backward compatibility)
   * @deprecated Use setThemeForMode instead
   */
  async function setTheme(themeId: string, saveToSettings = true): Promise<boolean> {
    const settingsStore = useSettingsStore()
    const mode = settingsStore.effectiveTheme

    // Update the theme for current mode
    if (mode === 'dark') {
      darkThemeId.value = themeId
    } else {
      lightThemeId.value = themeId
    }

    // Save to settings if requested
    if (saveToSettings) {
      const newSettings = {
        ...settingsStore.settings,
        general: {
          ...settingsStore.settings.general,
          darkThemeId: darkThemeId.value,
          lightThemeId: lightThemeId.value,
        },
      }
      await settingsStore.saveSettings(newSettings)
    }

    return await applyCurrentTheme()
  }

  /**
   * Apply CSS variables to document
   */
  function applyThemeVariables(variables: Record<string, string>): void {
    const root = document.documentElement

    for (const [key, value] of Object.entries(variables)) {
      root.style.setProperty(key, value)
    }

    // Cache CSS variables to localStorage for instant startup
    try {
      localStorage.setItem('cached-theme-css', JSON.stringify(variables))
    } catch (e) {
      console.warn('[ThemeStore] Failed to cache CSS variables:', e)
    }

    // Debug: Check if code syntax highlighting variables are generated
    const hljsVars = Object.keys(variables).filter(k => k.startsWith('--hljs-') || k.startsWith('--bg-code') || k.startsWith('--text-code'))
    console.log('[ThemeStore] Applied', Object.keys(variables).length, 'CSS variables')
    console.log('[ThemeStore] Code highlighting vars:', hljsVars.length > 0 ? hljsVars : 'NONE - check theme definition')
  }

  /**
   * Start previewing a theme (on hover)
   */
  async function startPreview(themeId: string): Promise<void> {
    // Skip if already previewing this theme
    if (previewThemeId.value === themeId) return

    // Save original theme on first preview
    if (!prePreviewThemeId.value) {
      prePreviewThemeId.value = currentThemeId.value
    }

    const settingsStore = useSettingsStore()
    const mode = settingsStore.effectiveTheme

    try {
      const response = await window.electronAPI.applyTheme(themeId, mode)

      if (response.success && response.cssVariables) {
        applyThemeVariables(response.cssVariables)
        previewThemeId.value = themeId
        console.log('[ThemeStore] Preview started:', themeId)
      }
    } catch (err: any) {
      console.error('[ThemeStore] Error previewing theme:', themeId, err)
    }
  }

  /**
   * Cancel preview and restore original theme
   */
  async function cancelPreview(): Promise<void> {
    if (!prePreviewThemeId.value) return

    const originalId = prePreviewThemeId.value
    previewThemeId.value = null
    prePreviewThemeId.value = null

    // Restore original theme
    await setTheme(originalId)
    console.log('[ThemeStore] Preview cancelled, restored:', originalId)
  }

  /**
   * Confirm preview (apply previewed theme permanently for current mode)
   */
  async function confirmPreview(): Promise<void> {
    if (!previewThemeId.value) return

    const previewedId = previewThemeId.value
    const settingsStore = useSettingsStore()
    const mode = settingsStore.effectiveTheme

    // Update the appropriate theme ID
    if (mode === 'dark') {
      darkThemeId.value = previewedId
    } else {
      lightThemeId.value = previewedId
    }

    previewThemeId.value = null
    prePreviewThemeId.value = null

    // Cache to localStorage
    localStorage.setItem('cached-theme-id', previewedId)
    localStorage.setItem('cached-dark-theme-id', darkThemeId.value)
    localStorage.setItem('cached-light-theme-id', lightThemeId.value)

    // Save to settings for persistence and cross-window sync
    const newSettings = {
      ...settingsStore.settings,
      general: {
        ...settingsStore.settings.general,
        darkThemeId: darkThemeId.value,
        lightThemeId: lightThemeId.value,
      },
    }
    await settingsStore.saveSettings(newSettings)

    console.log('[ThemeStore] Preview confirmed and saved:', previewedId, 'for mode:', mode)
  }

  /**
   * Refresh themes from filesystem (reload custom themes)
   */
  async function refreshThemes(projectPath?: string): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const response = await window.electronAPI.refreshThemes(projectPath)

      if (response.success && response.themes) {
        availableThemes.value = response.themes
        // Clear cache to pick up any theme file changes
        themeCache.value.clear()
        console.log('[ThemeStore] Refreshed themes:', response.themes.length)
      } else {
        error.value = response.error || 'Failed to refresh themes'
      }
    } catch (err: any) {
      error.value = err.message
      console.error('[ThemeStore] Error refreshing themes:', err)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Open themes folder in file explorer
   */
  async function openThemesFolder(): Promise<void> {
    try {
      await window.electronAPI.openThemesFolder()
    } catch (err: any) {
      console.error('[ThemeStore] Error opening themes folder:', err)
    }
  }

  /**
   * Initialize theme store (called on app startup)
   */
  async function initialize(): Promise<void> {
    const settingsStore = useSettingsStore()
    const general = settingsStore.settings.general

    // Handle migration from old single themeId to dual theme IDs
    if (general?.darkThemeId || general?.lightThemeId) {
      // New format: use darkThemeId and lightThemeId
      darkThemeId.value = general.darkThemeId || 'flexoki'
      lightThemeId.value = general.lightThemeId || 'flexoki'
    } else if (general?.themeId) {
      // Old format: migrate themeId to both
      darkThemeId.value = general.themeId
      lightThemeId.value = general.themeId
    } else {
      // Check localStorage cache
      const cachedDark = localStorage.getItem('cached-dark-theme-id')
      const cachedLight = localStorage.getItem('cached-light-theme-id')
      const cachedLegacy = localStorage.getItem('cached-theme-id')

      darkThemeId.value = cachedDark || cachedLegacy || 'flexoki'
      lightThemeId.value = cachedLight || cachedLegacy || 'flexoki'
    }

    console.log('[ThemeStore] Initialized with darkThemeId:', darkThemeId.value, 'lightThemeId:', lightThemeId.value)

    // Load available themes
    await loadThemes()

    // Apply current theme based on effective mode
    await applyCurrentTheme()
  }

  /**
   * Re-apply current theme (used when mode changes light<->dark)
   * IMPORTANT: This function should NOT override refs from settings!
   * The refs (darkThemeId, lightThemeId) are the source of truth,
   * maintained by setThemeForMode. This function only applies the
   * current theme based on the existing refs.
   */
  async function reapplyTheme(): Promise<void> {
    // Only apply current theme, do NOT sync refs from settings
    // Refs are maintained by setThemeForMode and should not be overwritten here
    await applyCurrentTheme()
  }

  return {
    // State
    availableThemes,
    darkThemeId,
    lightThemeId,
    isLoading,
    error,
    previewThemeId,

    // Computed
    currentThemeId,
    displayedThemeId,
    currentThemeMeta,
    builtinThemes,
    userThemes,
    projectThemes,

    // Actions
    loadThemes,
    getTheme,
    setTheme,
    setThemeForMode,
    applyCurrentTheme,
    startPreview,
    cancelPreview,
    confirmPreview,
    refreshThemes,
    openThemesFolder,
    initialize,
    reapplyTheme,
  }
})
