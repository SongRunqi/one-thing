<template>
  <div class="diff-view">
    <div v-if="loading" class="diff-loading">
      <span class="loading-spinner"></span>
      Loading diff...
    </div>
    <div v-else-if="error" class="diff-error">
      {{ error }}
    </div>
    <div v-else-if="!hasContent" class="diff-empty">
      No changes
    </div>
    <!-- @pierre/diffs will create its own diffs-container element inside this wrapper -->
    <div v-show="hasContent && !loading && !error" ref="containerWrapperRef" class="diff-content"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { FileDiff, parsePatchFiles } from '@pierre/diffs'
import type { FileDiffOptions, ParsedPatch } from '@pierre/diffs'

interface Props {
  /** Raw unified diff content string */
  diff?: string
  /** Loading state */
  loading?: boolean
  /** Error message */
  error?: string
  /** Max height of the diff content area */
  maxHeight?: string
  /** Diff style: 'unified' (stacked) or 'split' (side-by-side) */
  diffStyle?: 'unified' | 'split'
}

const props = withDefaults(defineProps<Props>(), {
  diff: '',
  loading: false,
  error: '',
  maxHeight: '300px',
  diffStyle: 'split'  // 默认使用左右并排视图
})

const containerWrapperRef = ref<HTMLElement | null>(null)
let fileDiffInstance: FileDiff | null = null

/** Check if there's actual diff content to display */
const hasContent = computed(() => {
  if (!props.diff) return false
  const lines = props.diff.split('\n')
  return lines.some(line => line.startsWith('+') || line.startsWith('-'))
})

/** Detect current theme (light/dark) */
function getCurrentTheme(): 'light' | 'dark' {
  const dataTheme = document.documentElement.getAttribute('data-theme')
  if (dataTheme === 'dark') return 'dark'
  if (dataTheme === 'light') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Create FileDiff options */
function createOptions(): FileDiffOptions<undefined> {
  const isDark = getCurrentTheme() === 'dark'

  return {
    theme: {
      dark: 'github-dark',
      light: 'github-light'
    },
    themeType: isDark ? 'dark' : 'light',
    diffStyle: props.diffStyle,
    diffIndicators: 'classic',
    disableFileHeader: true,
    overflow: 'scroll',
    lineDiffType: 'word',
  }
}

/** Render the diff using @pierre/diffs */
async function renderDiff() {
  if (!containerWrapperRef.value) {
    console.debug('[DiffView] Wrapper ref not ready')
    return
  }
  if (!props.diff || !hasContent.value) {
    console.debug('[DiffView] No diff content')
    return
  }

  try {
    // Parse the unified diff string
    const patches: ParsedPatch[] = parsePatchFiles(props.diff)

    if (!patches || patches.length === 0) {
      console.debug('[DiffView] No patches parsed')
      return
    }

    const firstPatch = patches[0]
    if (!firstPatch.files || firstPatch.files.length === 0) {
      console.debug('[DiffView] No files in first patch')
      return
    }

    const fileDiff = firstPatch.files[0]
    console.debug('[DiffView] File:', fileDiff.name, 'Type:', fileDiff.type, 'Hunks:', fileDiff.hunks?.length)

    // Clean up previous instance
    if (fileDiffInstance) {
      fileDiffInstance.cleanUp()
      fileDiffInstance = null
    }

    // Clear wrapper (remove old diffs-container if any)
    containerWrapperRef.value.innerHTML = ''

    // Create new FileDiff instance
    const options = createOptions()
    fileDiffInstance = new FileDiff(options)

    // KEY FIX: Use containerWrapper instead of fileContainer
    // This lets the library create its own diffs-container custom element
    // which has the required Shadow DOM
    fileDiffInstance.render({
      fileDiff,
      containerWrapper: containerWrapperRef.value  // Let library create diffs-container
    })

    console.debug('[DiffView] Render complete')
    console.debug('[DiffView] Created element:', containerWrapperRef.value.firstElementChild?.tagName)
  } catch (err) {
    console.error('[DiffView] Failed to render diff:', err)
  }
}

/** Update theme when it changes */
function updateTheme() {
  if (fileDiffInstance) {
    const isDark = getCurrentTheme() === 'dark'
    fileDiffInstance.setThemeType(isDark ? 'dark' : 'light')
  }
}

// Watch for theme changes
let themeObserver: MutationObserver | null = null

function setupThemeObserver() {
  themeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === 'data-theme') {
        updateTheme()
      }
    }
  })

  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  })
}

// Unified watch for all relevant props
watch(
  () => ({
    diff: props.diff,
    loading: props.loading,
    diffStyle: props.diffStyle
  }),
  async (newVal) => {
    if (!newVal.loading && newVal.diff && hasContent.value && containerWrapperRef.value) {
      await nextTick()
      renderDiff()
    }
  },
  { deep: true }
)

onMounted(async () => {
  setupThemeObserver()

  // Render if we have content
  if (hasContent.value && !props.loading) {
    await nextTick()
    renderDiff()
  }
})

onUnmounted(() => {
  if (fileDiffInstance) {
    fileDiffInstance.cleanUp()
    fileDiffInstance = null
  }

  if (themeObserver) {
    themeObserver.disconnect()
    themeObserver = null
  }
})
</script>

<style scoped>
.diff-view {
  width: 100%;
  overflow: hidden;
  border-radius: 6px;
}

.diff-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  color: var(--muted);
  font-size: 12px;
}

.loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.diff-error,
.diff-empty {
  padding: 16px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}

.diff-content {
  max-height: v-bind(maxHeight);
  overflow: auto;
}

/* Style the diffs-container custom element */
.diff-content :deep(diffs-container) {
  display: block;
  width: 100%;
  --diffs-font-size: 12px;
  --diffs-line-height: 20px;
  --diffs-tab-size: 2;
}

/* Scrollbar styles */
.diff-content::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.diff-content::-webkit-scrollbar-track {
  background: transparent;
}

.diff-content::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.diff-content::-webkit-scrollbar-thumb:hover {
  background: var(--muted);
}

.diff-content::-webkit-scrollbar-corner {
  background: transparent;
}
</style>
