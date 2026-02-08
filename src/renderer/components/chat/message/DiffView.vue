<template>
  <div class="diff-view">
    <!-- Toolbar: only show when file header is disabled -->
    <div
      v-if="hasContent && !loading && !error && showToolbar && !showFileHeader"
      class="diff-toolbar"
    >
      <div class="toolbar-left">
        <button
          v-if="allowStyleToggle"
          class="toolbar-btn"
          :title="currentDiffStyle === 'split' ? 'Switch to unified view' : 'Switch to split view'"
          @click="toggleDiffStyle"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect
              v-if="currentDiffStyle === 'split'"
              x="3"
              y="3"
              width="7"
              height="18"
              rx="2"
            />
            <rect
              v-if="currentDiffStyle === 'split'"
              x="14"
              y="3"
              width="7"
              height="18"
              rx="2"
            />
            <rect
              v-if="currentDiffStyle === 'unified'"
              x="3"
              y="3"
              width="18"
              height="18"
              rx="2"
            />
          </svg>
          <span>{{ currentDiffStyle === 'split' ? 'Split' : 'Unified' }}</span>
        </button>
      </div>
      <div class="toolbar-right">
        <button
          v-if="allowCopy"
          class="toolbar-btn"
          :title="copied ? 'Copied!' : 'Copy diff'"
          @click="copyDiffContent"
        >
          <svg
            v-if="!copied"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect
              x="9"
              y="9"
              width="13"
              height="13"
              rx="2"
              ry="2"
            />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <svg
            v-else
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{{ copied ? 'Copied' : 'Copy' }}</span>
        </button>
      </div>
    </div>

    <div
      v-if="loading"
      class="diff-loading"
    >
      <span class="loading-spinner" />
      Loading diff...
    </div>
    <div
      v-else-if="error"
      class="diff-error"
    >
      {{ error }}
    </div>
    <div
      v-else-if="!hasContent"
      class="diff-empty"
    >
      No changes
    </div>
    <!-- @pierre/diffs will create its own diffs-container element inside this wrapper -->
    <div
      v-show="hasContent && !loading && !error"
      ref="containerWrapperRef"
      class="diff-content"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { FileDiff, parsePatchFiles } from '@pierre/diffs'
import type {
  FileDiffOptions,
  ParsedPatch,
  FileDiffMetadata,
  RenderHeaderMetadataProps,
  ChangeTypes,
  FileContents
} from '@pierre/diffs'

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
  /** Show expanded unchanged context */
  expandUnchanged?: boolean
  /** Number of context lines to show when expanding */
  expansionLineCount?: number
  /** Show toolbar with controls */
  showToolbar?: boolean
  /** Allow toggling between split/unified view */
  allowStyleToggle?: boolean
  /** Allow copying diff content */
  allowCopy?: boolean
  /** File name to display in header (optional, will parse from diff if not provided) */
  fileName?: string
  /** Show file header with name and statistics */
  showFileHeader?: boolean
  /** Show file name in header (when false, only shows stats and controls) */
  showFileName?: boolean
  /** Old file content (required for expand unchanged feature) */
  oldContent?: string
  /** New file content (required for expand unchanged feature) */
  newContent?: string
}

const props = withDefaults(defineProps<Props>(), {
  diff: '',
  loading: false,
  error: '',
  maxHeight: '300px',
  diffStyle: 'split',  // 默认使用左右并排视图
  expandUnchanged: true,  // 改为 true，默认启用可展开区域
  expansionLineCount: 5,
  showToolbar: true,
  allowStyleToggle: true,
  allowCopy: true,
  fileName: undefined,
  showFileHeader: true,  // 默认显示文件头部
  showFileName: true,  // 默认显示文件名
  oldContent: undefined,  // 旧文件内容（用于展开功能）
  newContent: undefined  // 新文件内容（用于展开功能）
})

const containerWrapperRef = ref<HTMLElement | null>(null)
let fileDiffInstance: FileDiff | null = null

// Internal state for toolbar
const currentDiffStyle = ref<'unified' | 'split'>(props.diffStyle)
const copied = ref(false)

/** Check if there's actual diff content to display */
const hasContent = computed(() => {
  if (!props.diff) return false
  const lines = props.diff.split('\n')
  return lines.some(line => line.startsWith('+') || line.startsWith('-'))
})

/** Parsed patch data (cached) */
const parsedPatchData = computed<ParsedPatch | null>(() => {
  if (!props.diff) return null
  try {
    const patches = parsePatchFiles(props.diff)
    return patches[0] || null
  } catch (err) {
    console.error('[DiffView] Failed to parse patch:', err)
    return null
  }
})

/** File metadata from parsed diff */
const fileDiffMetadata = computed<FileDiffMetadata | null>(() => {
  return parsedPatchData.value?.files?.[0] || null
})

/** Display file name (priority: prop > parsed > fallback) */
const displayFileName = computed<string>(() => {
  return props.fileName
    || fileDiffMetadata.value?.name
    || 'Unknown file'
})

/** Diff statistics (additions and deletions) */
const diffStats = computed<{ additions: number; deletions: number }>(() => {
  const hunks = fileDiffMetadata.value?.hunks
  if (!hunks) return { additions: 0, deletions: 0 }

  return hunks.reduce(
    (acc, hunk) => ({
      additions: acc.additions + hunk.additionCount,
      deletions: acc.deletions + hunk.deletionCount
    }),
    { additions: 0, deletions: 0 }
  )
})

/** Detect current theme (light/dark) */
function getCurrentTheme(): 'light' | 'dark' {
  const dataTheme = document.documentElement.getAttribute('data-theme')
  if (dataTheme === 'dark') return 'dark'
  if (dataTheme === 'light') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Get CSS variable value from document */
function getCSSVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Generate custom CSS to match app theme */
function generateCustomCSS(): string {
  const isDark = getCurrentTheme() === 'dark'

  return `
    /* Background colors */
    --diffs-background: ${getCSSVar('--bg-code-block')};
    --diffs-border-color: ${getCSSVar('--border-code')};

    /* Addition colors (green) */
    --diffs-addition-background: ${getCSSVar('--diff-add-bg')};
    --diffs-addition-color: ${getCSSVar('--diff-add-text')};
    --diffs-addition-indicator: ${getCSSVar('--text-success')};

    /* Deletion colors (red) */
    --diffs-deletion-background: ${getCSSVar('--diff-del-bg')};
    --diffs-deletion-color: ${getCSSVar('--diff-del-text')};
    --diffs-deletion-indicator: ${getCSSVar('--text-error')};

    /* Context/hunk colors */
    --diffs-context-background: ${getCSSVar('--bg-code-block')};
    --diffs-hunk-background: ${getCSSVar('--diff-hunk-bg')};
    --diffs-hunk-color: ${getCSSVar('--diff-hunk-text')};

    /* Line number colors */
    --diffs-line-number-color: ${getCSSVar('--text-muted')};
    --diffs-line-number-background: ${isDark ? getCSSVar('--bg-code-header') : getCSSVar('--bg-code-block')};

    /* Text colors */
    --diffs-text-color: ${getCSSVar('--text-code-block')};

    /* Hover states */
    --diffs-hover-background: ${getCSSVar('--bg-hover')};

    /* Selection */
    --diffs-selection-background: ${getCSSVar('--bg-selected')};
  `.trim()
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
    diffStyle: currentDiffStyle.value,  // Use internal state for dynamic switching
    diffIndicators: 'bars',  // Modern bar indicators
    disableFileHeader: !props.showFileHeader,  // Enable/disable based on prop
    renderHeaderMetadata: props.showFileHeader ? renderHeaderMetadata : undefined,  // Custom header renderer
    overflow: 'scroll',
    lineDiffType: 'word',  // Word-level diffs for better precision
    expandUnchanged: props.expandUnchanged,
    expansionLineCount: props.expansionLineCount,
    hunkSeparators: 'metadata',  // Show metadata in separators
    unsafeCSS: generateCustomCSS(),  // Inject custom theme CSS
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

    // Prepare file contents for expand unchanged feature
    // When oldContent and newContent are provided (non-empty), the library can expand collapsed sections
    let oldFile: FileContents | undefined
    let newFile: FileContents | undefined

    if (props.oldContent && props.newContent) {
      oldFile = {
        name: fileDiff.prevName || fileDiff.name,
        contents: props.oldContent
      }
      newFile = {
        name: fileDiff.name,
        contents: props.newContent
      }
    }

    // KEY FIX: Use containerWrapper instead of fileContainer
    // This lets the library create its own diffs-container custom element
    // which has the required Shadow DOM
    fileDiffInstance.render({
      fileDiff,
      oldFile,  // Pass old file contents for expand feature
      newFile,  // Pass new file contents for expand feature
      containerWrapper: containerWrapperRef.value  // Let library create diffs-container
    })

    console.debug('[DiffView] Render complete')
    console.debug('[DiffView] Created element:', containerWrapperRef.value.firstElementChild?.tagName)
  } catch (err) {
    console.error('[DiffView] Failed to render diff:', err)
  }
}

/** Toggle between split and unified diff styles */
function toggleDiffStyle() {
  currentDiffStyle.value = currentDiffStyle.value === 'split' ? 'unified' : 'split'
  renderDiff()
}

/** Copy diff content to clipboard */
async function copyDiffContent() {
  if (!props.diff) return

  try {
    await navigator.clipboard.writeText(props.diff)
    copied.value = true

    // If file header is enabled, re-render to update button state
    if (props.showFileHeader) {
      renderDiff()
    }

    setTimeout(() => {
      copied.value = false
      if (props.showFileHeader) {
        renderDiff()
      }
    }, 2000)
  } catch (err) {
    console.error('[DiffView] Failed to copy diff content:', err)
  }
}

/** Update theme when it changes */
function updateTheme() {
  if (fileDiffInstance) {
    const isDark = getCurrentTheme() === 'dark'
    fileDiffInstance.setThemeType(isDark ? 'dark' : 'light')

    // Re-render to apply new custom CSS variables
    renderDiff()
  }
}

/** Get lucide icon SVG string */
function getLucideIconSVG(iconName: string, size = 14): string {
  const icons: Record<string, string> = {
    'file-plus': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`,
    'file-x': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="9.5" y1="12.5" x2="14.5" y2="17.5"/><line x1="14.5" y1="12.5" x2="9.5" y2="17.5"/></svg>`,
    'file-edit': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M10.4 12.6a2 2 0 1 1 3 3L8 21l-4 1 1-4Z"/></svg>`,
    'file': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    'columns-2': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/></svg>`,
    'rows-3': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/></svg>`,
    'copy': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    'check': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
  }
  return icons[iconName] || icons['file']
}

/** Get file icon name based on change type */
function getFileIconName(type: ChangeTypes): string {
  const iconMap: Record<ChangeTypes, string> = {
    'new': 'file-plus',
    'deleted': 'file-x',
    'rename-pure': 'file-edit',
    'rename-changed': 'file-edit',
    'change': 'file'
  }
  return iconMap[type] || 'file'
}

/** Create header button element */
function createHeaderButton(
  iconName: string,
  onClick: () => void,
  title: string
): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'diff-header-btn'
  btn.innerHTML = getLucideIconSVG(iconName, 14)
  btn.title = title
  btn.type = 'button'
  btn.onclick = (e) => {
    e.preventDefault()
    onClick()
  }
  return btn
}

/** Render custom file header with metadata */
function renderHeaderMetadata(headerProps: RenderHeaderMetadataProps): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'diff-header-metadata'

  // Left: File information (conditional)
  if (props.showFileName) {
    const fileSection = document.createElement('div')
    fileSection.className = 'diff-header-file'

    const fileIcon = document.createElement('span')
    fileIcon.className = 'diff-header-icon'
    const iconName = getFileIconName(headerProps.fileDiff?.type || 'change')
    fileIcon.innerHTML = getLucideIconSVG(iconName, 14)

    const fileName = document.createElement('span')
    fileName.className = 'diff-header-name'
    fileName.textContent = displayFileName.value

    fileSection.appendChild(fileIcon)
    fileSection.appendChild(fileName)
    wrapper.appendChild(fileSection)
  }

  // Middle: Statistics
  const statsSection = document.createElement('div')
  statsSection.className = 'diff-header-stats'

  const stats = diffStats.value
  if (stats.deletions > 0) {
    const del = document.createElement('span')
    del.className = 'diff-stat-deletions'
    del.textContent = `-${stats.deletions}`
    statsSection.appendChild(del)
  }

  if (stats.additions > 0) {
    const add = document.createElement('span')
    add.className = 'diff-stat-additions'
    add.textContent = `+${stats.additions}`
    statsSection.appendChild(add)
  }

  // Right: Controls
  const controlsSection = document.createElement('div')
  controlsSection.className = 'diff-header-controls'

  if (props.allowStyleToggle) {
    const toggleBtn = createHeaderButton(
      currentDiffStyle.value === 'split' ? 'columns-2' : 'rows-3',
      () => toggleDiffStyle(),
      currentDiffStyle.value === 'split' ? 'Switch to unified view' : 'Switch to split view'
    )
    controlsSection.appendChild(toggleBtn)
  }

  if (props.allowCopy) {
    const copyBtn = createHeaderButton(
      copied.value ? 'check' : 'copy',
      () => copyDiffContent(),
      copied.value ? 'Copied!' : 'Copy diff'
    )
    if (copied.value) copyBtn.classList.add('active')
    controlsSection.appendChild(copyBtn)
  }

  wrapper.appendChild(statsSection)
  wrapper.appendChild(controlsSection)

  return wrapper
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

// Sync currentDiffStyle when prop changes
watch(() => props.diffStyle, (newStyle) => {
  currentDiffStyle.value = newStyle
})

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
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-code);
  background: var(--bg-code-block);
}

/* Toolbar */
.diff-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: var(--bg-code-header);
  border-bottom: 1px solid var(--border-code);
  gap: 8px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xs);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.toolbar-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-default);
  color: var(--text-primary);
}

.toolbar-btn:active {
  background: var(--bg-active);
  transform: scale(0.98);
}

.toolbar-btn svg {
  flex-shrink: 0;
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

  /* Font settings - @pierre/diffs adapts to these */
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;

  /* Advanced font features for code */
  font-feature-settings:
    'liga' 1,    /* ligatures */
    'calt' 1,    /* contextual alternates */
    'zero' 1,    /* slashed zero */
    'cv01' 1;    /* stylistic set (varies by font) */
  font-variant-numeric: tabular-nums; /* monospaced numbers */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  /* Library-specific CSS variables */
  --diffs-font-size: 12px;
  --diffs-line-height: 20px;
  --diffs-tab-size: 2;
}

/* Additional theme integration */
.diff-content :deep(.diffs-line) {
  border-radius: 0;
}

.diff-content :deep(.diffs-line-number) {
  user-select: none;
  font-variant-numeric: tabular-nums;
  min-width: 40px; /* Consistent width for line numbers */
}

/* Code highlighting enhancements */
.diff-content :deep(code) {
  font-family: inherit;
  font-feature-settings: inherit;
}

/* Smooth transitions on theme change */
.diff-content :deep(diffs-container *) {
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

/* ========================================
   File Header Styles
   ======================================== */

/* File header container */
.diff-content :deep(.diffs-file-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-code-header);
  border-bottom: 1px solid var(--border-code);
  font-size: 12px;
  min-height: 36px;
}

.diff-content :deep(.diff-header-metadata) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}

/* File information section */
.diff-content :deep(.diff-header-file) {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.diff-content :deep(.diff-header-icon) {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.diff-content :deep(.diff-header-icon svg) {
  width: 14px;
  height: 14px;
  color: var(--text-secondary);
}

.diff-content :deep(.diff-header-name) {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Statistics section */
.diff-content :deep(.diff-header-stats) {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.diff-content :deep(.diff-stat-deletions) {
  color: var(--diff-del-text);
  background: var(--diff-del-bg);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
}

.diff-content :deep(.diff-stat-additions) {
  color: var(--diff-add-text);
  background: var(--diff-add-bg);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
}

/* Control buttons section */
.diff-content :deep(.diff-header-controls) {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.diff-content :deep(.diff-header-btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xs);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s ease;
}

.diff-content :deep(.diff-header-btn:hover) {
  background: var(--bg-hover);
  border-color: var(--border-default);
  color: var(--text-primary);
}

.diff-content :deep(.diff-header-btn:active) {
  background: var(--bg-active);
  transform: scale(0.95);
}

.diff-content :deep(.diff-header-btn.active) {
  background: var(--bg-selected);
  border-color: var(--border-accent);
  color: var(--accent);
}

/* ========================================
   Expansion Controls Enhancement
   ======================================== */

.diff-content :deep(.diffs-expansion) {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--diff-hunk-bg);
  border: 1px solid var(--border-subtle);
  border-left: none;
  border-right: none;
  padding: 6px 12px;
  margin: 2px 0;
  font-size: 11px;
  color: var(--diff-hunk-text);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.diff-content :deep(.diffs-expansion:hover) {
  background: var(--bg-hover);
  border-color: var(--border-default);
  color: var(--text-primary);
}

.diff-content :deep(.diffs-expansion-icon) {
  margin-right: 4px;
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
