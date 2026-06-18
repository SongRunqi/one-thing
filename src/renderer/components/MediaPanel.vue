<template>
  <div
    v-show="visible"
    class="media-panel"
    :class="`mode-${mode}`"
  >
    <div
      v-if="mode !== 'main'"
      class="media-nav"
      :class="{ 'media-nav-tasks': activeNav === 'tasks' }"
    >
      <div class="traffic-lights-space" />
      <div class="nav-items">
        <Button
          v-for="item in navItems"
          :key="item.id"
          unstyled
          class="nav-item"
          :class="{ active: activeNav === item.id }"
          @click="activeNav = item.id"
        >
          <component
            :is="item.icon"
            :size="20"
            :stroke-width="1.5"
            class="nav-icon"
          />
          <span class="nav-label">{{ item.label }}</span>
          <span
            v-if="item.id === 'media' && mediaStore.assets.length > 0"
            class="nav-badge"
          >
            {{ mediaStore.assets.length }}
          </span>
        </Button>
      </div>
      <div class="nav-footer">
        <Button
          unstyled
          class="nav-close-btn"
          title="Close panel"
          @click="$emit('close')"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line
              x1="19"
              y1="12"
              x2="5"
              y2="12"
            />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </Button>
      </div>
    </div>

    <div class="media-content">
      <div
        v-if="mode === 'main'"
        class="main-panel-header"
      >
        <div class="main-panel-title">
          <component
            :is="currentNavItem?.icon"
            :size="17"
            :stroke-width="1.8"
          />
          <span>{{ currentNavItem?.label }}</span>
        </div>
        <Button
          unstyled
          class="main-panel-close"
          native-type="button"
          title="Close"
          @click="$emit('close')"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </Button>
      </div>

      <div class="workspace-panel-views">
        <section
          v-if="hasMountedNav('media')"
          v-show="activeNav === 'media'"
          class="workspace-panel-view workspace-panel-media-view"
          data-workspace-panel-view="media"
        >
          <div class="content-header media-filter-bar">
            <FilterSearchInput
              v-model="searchQuery"
              class="media-search-control"
              :placeholder="searchPlaceholder"
              label="Search media"
            />
            <Select
              v-model="activeKindModel"
              class="media-kind-filter"
              :options="kindFilterOptions"
              aria-label="Filter by media type"
              fit-input-width
            >
              <template #label="{ option, label }">
                <span class="media-select-label">
                  <component
                    :is="optionIcon(option)"
                    v-if="optionIcon(option)"
                    :size="14"
                    :stroke-width="1.8"
                    class="media-select-icon"
                  />
                  <span class="media-select-text">{{ label }}</span>
                </span>
              </template>
              <template #option="{ option, label }">
                <span class="media-select-label">
                  <component
                    :is="optionIcon(option)"
                    v-if="optionIcon(option)"
                    :size="14"
                    :stroke-width="1.8"
                    class="media-select-icon"
                  />
                  <span class="media-select-text">{{ label }}</span>
                </span>
              </template>
            </Select>
            <Select
              v-model="activeSourceModel"
              class="media-source-filter"
              :options="sourceFilterOptions"
              aria-label="Filter by source"
              fit-input-width
            />
          </div>

          <div class="content-body">
            <div
              v-if="mediaStore.isLoading || mediaStore.isRebuilding"
              class="loading-state"
            >
              <LoadingSpinner :label="mediaLoadingLabel" />
            </div>

            <template v-else-if="activeKind === 'image' && filteredAssets.length > 0">
              <div class="media-grid">
                <div
                  v-for="asset in filteredAssets"
                  :key="asset.id"
                  class="media-item"
                  @click="openAsset(asset)"
                >
                  <img
                    :src="mediaStore.getImageUrl(asset)"
                    :alt="assetTitle(asset)"
                    :width="asset.width"
                    :height="asset.height"
                    class="media-thumbnail"
                    loading="lazy"
                    decoding="async"
                  >
                  <div class="media-source-badge">
                    {{ sourceLabel(asset.source) }}
                  </div>
                  <div class="media-overlay">
                    <p class="media-title">
                      {{ assetTitle(asset) }}
                    </p>
                    <span class="media-meta">{{ assetSubtitle(asset) }}</span>
                  </div>
                  <Button
                    unstyled
                    class="delete-btn"
                    title="Remove from library"
                    @click.stop="removeAsset(asset.id)"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </Button>
                </div>
              </div>
            </template>

            <template v-else-if="activeKind !== 'image' && filteredAssets.length > 0">
              <div class="asset-list">
                <div
                  v-for="asset in filteredAssets"
                  :key="asset.id"
                  class="asset-row"
                  role="button"
                  tabindex="0"
                  @click="openAsset(asset)"
                  @keydown.enter.prevent="openAsset(asset)"
                  @keydown.space.prevent="openAsset(asset)"
                >
                  <component
                    :is="kindIcon(asset.kind)"
                    :size="18"
                    :stroke-width="1.8"
                    class="asset-row-icon"
                  />
                  <span class="asset-row-main">
                    <span class="asset-row-title">{{ assetTitle(asset) }}</span>
                    <span class="asset-row-meta">{{ assetSubtitle(asset) }}</span>
                  </span>
                  <span class="asset-source">{{ sourceLabel(asset.source) }}</span>
                  <Button
                    unstyled
                    class="row-remove"
                    title="Remove from library"
                    @click.stop="removeAsset(asset.id)"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </template>

            <div
              v-else
              class="empty-state"
            >
              <div class="empty-icon">
                <component
                  :is="kindIcon(activeKind)"
                  :size="48"
                  :stroke-width="1.5"
                />
              </div>
              <p class="empty-text">
                {{ emptyTitle }}
              </p>
              <p class="empty-hint">
                {{ emptyHint }}
              </p>
            </div>
          </div>

          <!-- Inline Media Inspector Drawer -->
          <Transition name="drawer">
            <div
              v-if="selectedAsset"
              class="inspector-drawer"
            >
              <div class="drawer-header">
                <span class="drawer-title">Media Details</span>
                <Button
                  unstyled
                  class="drawer-close-btn"
                  native-type="button"
                  @click="selectedAsset = null"
                >
                  <X :size="16" />
                </Button>
              </div>

              <div class="drawer-scroll-body">
                <div class="drawer-preview-box">
                  <img
                    v-if="selectedAsset.kind === 'image'"
                    :src="mediaStore.getImageUrl(selectedAsset)"
                    :alt="selectedAsset.fileName"
                    class="drawer-preview-img"
                    title="Click to view full image"
                    @click="launchGallery(selectedAsset)"
                  >
                  <div
                    v-else
                    class="drawer-preview-fallback"
                  >
                    <component
                      :is="kindIcon(selectedAsset.kind)"
                      :size="48"
                    />
                  </div>
                </div>

                <div class="drawer-section">
                  <h4 class="section-heading">
                    File Information
                  </h4>
                  <div class="specs-list">
                    <div class="spec-row">
                      <span class="spec-label">Name</span>
                      <span
                        class="spec-val truncate"
                        :title="selectedAsset.fileName"
                      >{{ selectedAsset.fileName }}</span>
                    </div>
                    <div class="spec-row">
                      <span class="spec-label">Format</span>
                      <span class="spec-val">{{ selectedAsset.mimeType }}</span>
                    </div>
                    <div
                      v-if="selectedAsset.width && selectedAsset.height"
                      class="spec-row"
                    >
                      <span class="spec-label">Resolution</span>
                      <span class="spec-val">{{ selectedAsset.width }} × {{ selectedAsset.height }}</span>
                    </div>
                    <div class="spec-row">
                      <span class="spec-label">Size</span>
                      <span class="spec-val">{{ formatBytes(selectedAsset.size) }}</span>
                    </div>
                    <div class="spec-row">
                      <span class="spec-label">Created</span>
                      <span class="spec-val">{{ new Date(selectedAsset.createdAt).toLocaleString() }}</span>
                    </div>
                  </div>
                </div>

                <!-- Prompt Details (if AI Generated) -->
                <div
                  v-if="selectedAsset.metadata?.prompt"
                  class="drawer-section"
                >
                  <div class="section-title-with-action">
                    <h4 class="section-heading">
                      AI Generation Prompt
                    </h4>
                    <Button
                      unstyled
                      class="copy-text-btn"
                      native-type="button"
                      title="Copy prompt"
                      @click="copyPromptText(selectedAsset.metadata.prompt)"
                    >
                      <component
                        :is="copiedPrompt ? Check : Copy"
                        :size="13"
                      />
                      <span>{{ copiedPrompt ? 'Copied' : 'Copy' }}</span>
                    </Button>
                  </div>
                  <div class="prompt-text-card">
                    {{ selectedAsset.metadata.prompt }}
                  </div>
                </div>

                <div
                  v-if="selectedAsset.metadata?.revisedPrompt"
                  class="drawer-section"
                >
                  <div class="section-title-with-action">
                    <h4 class="section-heading">
                      Revised Prompt
                    </h4>
                    <Button
                      unstyled
                      class="copy-text-btn"
                      native-type="button"
                      title="Copy revised prompt"
                      @click="copyRevisedPromptText(selectedAsset.metadata.revisedPrompt)"
                    >
                      <component
                        :is="copiedRevisedPrompt ? Check : Copy"
                        :size="13"
                      />
                      <span>{{ copiedRevisedPrompt ? 'Copied' : 'Copy' }}</span>
                    </Button>
                  </div>
                  <div class="prompt-text-card">
                    {{ selectedAsset.metadata.revisedPrompt }}
                  </div>
                </div>
              </div>

              <!-- Drawer Footer Actions -->
              <div class="drawer-footer">
                <Button
                  v-if="selectedAsset.filePath"
                  unstyled
                  class="drawer-action-btn secondary"
                  native-type="button"
                  @click="openFileExternally(selectedAsset)"
                >
                  <ExternalLink :size="14" />
                  <span>Open Externally</span>
                </Button>
                <Button
                  v-if="selectedAsset.filePath"
                  unstyled
                  class="drawer-action-btn secondary"
                  native-type="button"
                  @click="copyFilePath(selectedAsset.filePath)"
                >
                  <component
                    :is="copiedPath ? Check : Copy"
                    :size="14"
                  />
                  <span>Copy Path</span>
                </Button>
                <Button
                  unstyled
                  class="drawer-action-btn danger"
                  native-type="button"
                  @click="deleteAssetFromDrawer(selectedAsset)"
                >
                  <Trash2 :size="14" />
                  <span>Delete</span>
                </Button>
              </div>
            </div>
          </Transition>
        </section>

        <section
          v-if="hasMountedNav('memory')"
          v-show="activeNav === 'memory'"
          class="workspace-panel-view workspace-panel-content-view"
          data-workspace-panel-view="memory"
        >
          <MemoryPanelContent />
        </section>

        <section
          v-if="hasMountedNav('agents')"
          v-show="activeNav === 'agents'"
          class="workspace-panel-view workspace-panel-content-view"
          data-workspace-panel-view="agents"
        >
          <AgentsPanelContent />
        </section>

        <section
          v-if="hasMountedNav('tasks')"
          v-show="activeNav === 'tasks'"
          class="workspace-panel-view workspace-panel-content-view"
          data-workspace-panel-view="tasks"
        >
          <SchedulerPanelContent />
        </section>

        <section
          v-if="hasMountedNav('archive')"
          v-show="activeNav === 'archive'"
          class="workspace-panel-view workspace-panel-content-view"
          data-workspace-panel-view="archive"
        >
          <ArchivedChatsContent />
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { ref, computed, onMounted, onUnmounted, watch, type Component } from 'vue'
import AgentsPanelContent from './AgentsPanelContent.vue'
import ArchivedChatsContent from './ArchivedChatsContent.vue'
import FilterSearchInput from './common/FilterSearchInput.vue'
import LoadingSpinner from './common/LoadingSpinner.vue'
import Select from './common/Select.vue'
import MemoryPanelContent from './memory/MemoryPanelContent.vue'
import SchedulerPanelContent from './SchedulerPanelContent.vue'
import { useMediaStore } from '@/stores/media'
import type { MediaAsset, MediaKind, MediaSource } from '@/types'
import {
  Archive,
  Bot,
  Brain,
  CalendarClock,
  FileText,
  Images,
  Music,
  Video,
  X,
  Copy,
  ExternalLink,
  Trash2,
  Check,
} from 'lucide-vue-next'

type WorkspacePanelNav = 'media' | 'memory' | 'agents' | 'tasks' | 'archive'

const props = withDefaults(defineProps<{
  visible: boolean
  activeTab?: WorkspacePanelNav | null
  initialTab?: WorkspacePanelNav | ''
  mode?: 'side' | 'main'
}>(), {
  activeTab: null,
  initialTab: '',
  mode: 'side',
})

defineEmits<{
  close: []
}>()

type SourceFilter = 'all' | 'user-upload' | 'ai-generated'
type KindFilterOption = { value: MediaKind; label: string; icon: Component }
type SourceFilterOption = { value: SourceFilter; label: string }

const mediaStore = useMediaStore()
const searchQuery = ref('')
const activeNav = ref<WorkspacePanelNav>(normalizeNav(props.activeTab ?? props.initialTab) ?? 'media')
const mountedNavs = ref<WorkspacePanelNav[]>([activeNav.value])
const activeKind = ref<MediaKind>('image')
const activeSource = ref<SourceFilter>('all')

const navItems: Array<{ id: WorkspacePanelNav; label: string; icon: Component }> = [
  { id: 'media', label: 'Media', icon: Images },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'tasks', label: 'Tasks', icon: CalendarClock },
  { id: 'archive', label: 'Archived Chats', icon: Archive },
]

const currentNavItem = computed(() => navItems.find(item => item.id === activeNav.value) || navItems[0])

function normalizeNav(tab?: string | null): WorkspacePanelNav | null {
  if (tab === 'media' || tab === 'memory' || tab === 'agents' || tab === 'tasks' || tab === 'archive') {
    return tab
  }
  return null
}

function markNavMounted(nav: WorkspacePanelNav) {
  if (!mountedNavs.value.includes(nav)) {
    mountedNavs.value = [...mountedNavs.value, nav]
  }
}

function hasMountedNav(nav: WorkspacePanelNav): boolean {
  return mountedNavs.value.includes(nav)
}

const searchPlaceholder = computed(() =>
  activeKind.value === 'image' ? 'Search images' : 'Search media'
)

const mediaLoadingLabel = computed(() =>
  mediaStore.isRebuilding ? 'Indexing media...' : 'Loading media...'
)

const activeKindModel = computed({
  get: () => activeKind.value,
  set: (value: string) => {
    activeKind.value = value as MediaKind
  },
})

const activeSourceModel = computed({
  get: () => activeSource.value,
  set: (value: string) => {
    activeSource.value = value as SourceFilter
  },
})

const kindFilterOptions = computed<KindFilterOption[]>(() => [
  { value: 'image', label: 'Images', icon: Images },
  { value: 'file', label: 'Files', icon: FileText },
  { value: 'audio', label: 'Audio', icon: Music },
  { value: 'video', label: 'Video', icon: Video },
])

const sourceFilterOptions = computed<SourceFilterOption[]>(() => [
  { value: 'all', label: 'All' },
  { value: 'user-upload', label: 'Uploaded' },
  { value: 'ai-generated', label: 'Generated' },
])

function optionIcon(option: unknown): Component | null {
  if (!option || typeof option !== 'object' || !('icon' in option)) return null
  return (option as KindFilterOption).icon
}

const filteredAssets = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return mediaStore.assets
    .filter(asset => matchesActiveKind(asset))
    .filter(asset => activeSource.value === 'all' || asset.source === activeSource.value)
    .filter(asset => {
      if (!query) return true
      return [
        asset.fileName,
        asset.mimeType,
        asset.metadata?.prompt,
        asset.metadata?.revisedPrompt,
        asset.metadata?.model,
        asset.source,
      ].some(value => value?.toLowerCase().includes(query))
    })
    .sort((a, b) => b.createdAt - a.createdAt)
})

const emptyTitle = computed(() => {
  const sourcePrefix = activeSource.value === 'all' ? '' : `${sourceLabel(activeSource.value).toLowerCase()} `
  if (activeKind.value !== 'image') return `No ${sourcePrefix}${activeKind.value} assets yet`
  if (activeSource.value === 'user-upload') return 'No uploaded images yet'
  if (activeSource.value === 'ai-generated') return 'No generated images yet'
  return 'No images yet'
})

const emptyHint = computed(() => {
  if (activeKind.value !== 'image') return 'Attached media that matches these filters will appear here'
  if (activeSource.value === 'user-upload') return 'Images you paste or attach in chat will appear here'
  if (activeSource.value === 'ai-generated') return 'AI-generated images will appear here'
  return 'Uploaded and AI-generated images will appear here'
})

function matchesActiveKind(asset: MediaAsset): boolean {
  return matchesKind(asset, activeKind.value)
}

function matchesKind(asset: MediaAsset, kind: MediaKind): boolean {
  if (kind === 'file') {
    return asset.kind === 'file' || asset.kind === 'document'
  }
  return asset.kind === kind
}

function sourceLabel(source: MediaSource | SourceFilter): string {
  if (source === 'all') return 'All'
  if (source === 'user-upload') return 'Uploaded'
  if (source === 'ai-generated') return 'Generated'
  if (source === 'tool-output') return 'Tool'
  return 'External'
}

function kindIcon(kind: MediaKind) {
  if (kind === 'image') return Images
  if (kind === 'audio') return Music
  if (kind === 'video') return Video
  return FileText
}

function assetTitle(asset: MediaAsset): string {
  return asset.metadata?.prompt || asset.fileName || 'Untitled asset'
}

function assetSubtitle(asset: MediaAsset): string {
  const label = asset.metadata?.model || sourceLabel(asset.source)
  const date = new Date(asset.createdAt).toLocaleDateString()
  return `${label} · ${date}`
}

const selectedAsset = ref<MediaAsset | null>(null)
const copiedPrompt = ref(false)
const copiedRevisedPrompt = ref(false)
const copiedPath = ref(false)

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return 'Unknown size'
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function copyPromptText(text: string) {
  navigator.clipboard.writeText(text)
  copiedPrompt.value = true
  setTimeout(() => copiedPrompt.value = false, 1500)
}

function copyRevisedPromptText(text: string) {
  navigator.clipboard.writeText(text)
  copiedRevisedPrompt.value = true
  setTimeout(() => copiedRevisedPrompt.value = false, 1500)
}

function copyFilePath(path: string) {
  navigator.clipboard.writeText(path)
  copiedPath.value = true
  setTimeout(() => copiedPath.value = false, 1500)
}

function openAsset(asset: MediaAsset) {
  selectedAsset.value = asset
}

function launchGallery(asset: MediaAsset) {
  window.electronAPI.openImageGallery(asset.id)
}

function openFileExternally(asset: MediaAsset) {
  if (asset.filePath) {
    window.electronAPI.openPath(asset.filePath)
  }
}

async function deleteAssetFromDrawer(asset: MediaAsset) {
  if (confirm('Remove this item from the library? The original chat message will stay unchanged.')) {
    selectedAsset.value = null
    await mediaStore.removeMedia(asset.id)
  }
}

async function removeAsset(id: string) {
  if (confirm('Remove this item from the library? The original chat message will stay unchanged.')) {
    await mediaStore.removeMedia(id)
  }
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    selectedAsset.value = null
  }
}

watch(selectedAsset, (newVal) => {
  if (newVal) {
    window.addEventListener('keydown', handleKeyDown)
  } else {
    window.removeEventListener('keydown', handleKeyDown)
  }
})

watch([activeNav, activeKind, activeSource], () => {
  selectedAsset.value = null
})

watch(activeNav, markNavMounted, {
  immediate: true,
  flush: 'sync',
})

async function refreshMedia(rebuild = false) {
  await mediaStore.loadMedia({ rebuild })
}

let unsubscribe: (() => void) | null = null

onMounted(async () => {
  unsubscribe = window.electronAPI.onImageGenerated(async () => {
    await refreshMedia()
  })
})

watch(
  () => props.activeTab,
  (tab) => {
    const nav = normalizeNav(tab)
    if (nav) activeNav.value = nav
  },
  { flush: 'sync' },
)

watch(
  () => props.initialTab,
  (tab) => {
    if (props.activeTab) return
    const nav = normalizeNav(tab)
    if (nav) activeNav.value = nav
  },
  { flush: 'sync' },
)

watch(
  [() => props.visible, activeNav],
  async ([visible, nav], previous) => {
    const [wasVisible, previousNav] = previous ?? []
    if (visible && nav === 'media' && (!wasVisible || previousNav !== 'media')) {
      await refreshMedia(true)
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})
</script>

<style scoped>
.media-panel {
  width: 560px;
  height: 100%;
  min-height: 0;
  min-width: 0;
  flex-shrink: 0;
  display: flex;
  background: var(--ui-surface-panel-bg, var(--ui-surface-app-bg, var(--bg)));
  overflow: hidden;
}

.media-panel.mode-main {
  flex: 1 1 auto;
  width: auto;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--ui-surface-panel-bg, var(--bg-panel, var(--bg)));
}

.media-nav {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  border-right: 1px solid var(--ui-border-default-border, var(--border));
  box-shadow:
    2px 0 8px rgba(0, 0, 0, 0.1),
    4px 0 16px rgba(0, 0, 0, 0.05);
  z-index: 1;
}

.media-nav.media-nav-tasks {
  border-right-color: transparent;
  background: var(--ui-surface-panel-bg, var(--bg-panel, var(--bg)));
  box-shadow: none;
}

html[data-theme='light'] .media-nav {
  box-shadow:
    2px 0 8px rgba(0, 0, 0, 0.04),
    4px 0 16px rgba(0, 0, 0, 0.02);
}

html[data-theme='light'] .media-nav.media-nav-tasks {
  box-shadow: none;
}

.traffic-lights-space {
  height: 52px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}

.nav-items {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 4px;
}

.nav-footer {
  padding: 8px;
}

.nav-close-btn,
.nav-item {
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  transition: all 0.15s ease;
}

.nav-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 40px;
  border-radius: 8px;
}

.nav-close-btn:hover,
.nav-item:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.nav-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  border-radius: 8px;
  min-width: 72px;
}

.nav-item.active {
  background: var(--ui-state-active-bg, var(--active));
  color: var(--ui-text-primary-fg, var(--text));
}

.nav-label {
  font-size: 11px;
  font-weight: 500;
}

.nav-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 600;
  color: white;
  background: var(--ui-accent-primary-fg, var(--accent));
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.media-content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  padding: 12px;
  padding-top: 0;
  position: relative;
}

.workspace-panel-views {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.workspace-panel-view {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.workspace-panel-media-view,
.workspace-panel-content-view {
  display: flex;
  flex-direction: column;
}

.mode-main .media-content {
  padding: 0;
}

.main-panel-header {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 0 176px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-subtle-border, var(--border-subtle, var(--border))) 62%, transparent);
  background: var(--ui-surface-panel-bg, var(--bg-panel, var(--bg)));
  -webkit-app-region: drag;
}

.main-panel-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--ui-text-primary-fg, var(--text));
  font-size: 13px;
  font-weight: 500;
}

.main-panel-title svg {
  color: var(--ui-accent-primary-fg, var(--accent-main, var(--accent)));
}

.main-panel-close {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.main-panel-close:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  color: var(--ui-text-primary-fg, var(--text));
}

.content-header {
  position: relative;
  z-index: calc(var(--z-dropdown, 1000) + 5);
  padding: 16px 4px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  overflow: visible;
}

.media-search-control {
  flex: 1 1 190px;
  width: auto;
  min-width: min(190px, 100%);
  max-width: 240px;
}

.media-kind-filter {
  flex: 0 1 142px;
  min-width: 120px;
}

.media-source-filter {
  flex: 0 1 136px;
  min-width: 120px;
}

.mode-side .media-search-control {
  flex: 1 1 100%;
  width: 100%;
  max-width: none;
}

.mode-side .media-kind-filter,
.mode-side .media-source-filter {
  flex: 1 1 calc(50% - 4px);
  min-width: 0;
}

.media-select-label {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 7px;
}

.media-select-icon {
  flex: 0 0 auto;
  color: var(--ui-accent-primary-fg, var(--accent));
}

.media-select-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content-body {
  position: relative;
  z-index: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  padding: 0 4px;
}

.loading-state,
.empty-state {
  flex: 1 1 auto;
  box-sizing: border-box;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 20px;
  text-align: center;
  color: var(--ui-text-muted-fg, var(--muted));
}

.empty-icon {
  opacity: 0.5;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--ui-text-primary-fg, var(--text));
  margin: 0 0 4px;
}

.empty-hint {
  font-size: 13px;
  color: var(--ui-text-muted-fg, var(--muted));
  margin: 0;
}

.media-grid {
  column-width: 138px;
  column-gap: 12px;
  line-height: 0;
  padding-bottom: 16px;
}

.mode-main .media-grid {
  column-width: 168px;
}

/* Inline Media Inspector Drawer Styling */
.inspector-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 330px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated));
  border-left: 1px solid var(--ui-border-default-border, var(--border));
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  z-index: 100;
  overflow: hidden;
  transition: width 0.2s ease;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--ui-border-subtle-border);
  background: var(--ui-surface-panel-bg);
}

.drawer-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-text-primary-fg);
}

.drawer-close-btn {
  background: transparent;
  border: none;
  color: var(--ui-text-muted-fg);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.drawer-close-btn:hover {
  background: var(--ui-state-hover-bg);
  color: var(--ui-text-primary-fg);
}

.drawer-scroll-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.drawer-preview-box {
  width: 100%;
  aspect-ratio: 16 / 10;
  background: var(--ui-surface-panel-bg);
  border-radius: 8px;
  border: 1px solid var(--ui-border-subtle-border);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.drawer-preview-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  cursor: zoom-in;
  transition: filter 0.2s ease;
}

.drawer-preview-img:hover {
  filter: brightness(0.95);
}

.drawer-preview-fallback {
  color: var(--ui-text-muted-fg);
}

.drawer-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-heading {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--ui-text-muted-fg);
  margin: 0;
}

.section-title-with-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.copy-text-btn {
  background: transparent;
  border: none;
  color: var(--ui-accent-primary-fg);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.copy-text-btn:hover {
  background: color-mix(in srgb, var(--ui-accent-primary-fg) 10%, transparent);
}

.specs-list {
  background: var(--ui-surface-panel-bg);
  border: 1px solid var(--ui-border-subtle-border);
  border-radius: 8px;
  padding: 4px 12px;
}

.spec-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-size: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-subtle-border) 40%, transparent);
}

.spec-row:last-child {
  border-bottom: none;
}

.spec-label {
  color: var(--ui-text-secondary-fg);
  font-weight: 500;
}

.spec-val {
  color: var(--ui-text-primary-fg);
  font-weight: 600;
  min-width: 0;
  text-align: right;
}

.spec-val.truncate {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-text-card {
  background: var(--ui-surface-panel-bg);
  border: 1px solid var(--ui-border-subtle-border);
  border-radius: 8px;
  padding: 10px 12px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.5;
  color: var(--ui-text-primary-fg);
  max-height: 120px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.drawer-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--ui-border-subtle-border);
  background: var(--ui-surface-panel-bg);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drawer-action-btn {
  height: 34px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.drawer-action-btn.secondary {
  background: var(--ui-state-hover-bg);
  color: var(--ui-text-primary-fg);
  border-color: var(--ui-border-default-border);
}

.drawer-action-btn.secondary:hover {
  background: var(--ui-state-active-bg);
}

.drawer-action-btn.danger {
  background: transparent;
  color: var(--ui-status-danger-fg, #ef4444);
  border-color: var(--ui-status-danger-border, #ef4444);
}

.drawer-action-btn.danger:hover {
  background: var(--ui-status-danger-bg, transparent);
  border-color: var(--ui-status-danger-fg, #ef4444);
}

/* Animations for Drawer */
.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
}

/* Adaptive styles for Drawer in Sidebar mode */
.mode-side .inspector-drawer {
  width: 100%;
}

.media-item {
  position: relative;
  display: inline-block;
  width: 100%;
  margin: 0 0 12px;
  line-height: normal;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  break-inside: avoid;
  transform: translateZ(0);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  background: var(--ui-state-hover-bg, var(--hover));
}

.media-item:hover {
  transform: scale(1.02);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.media-thumbnail {
  width: 100%;
  height: auto;
  display: block;
  object-fit: contain;
}

.media-source-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 3px 7px;
  font-size: 10px;
  font-weight: 600;
  border-radius: 6px;
  color: white;
  background: rgba(0, 0, 0, 0.62);
}

.media-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 9px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.82));
  opacity: 0;
  transition: opacity 0.2s ease;
}

.media-item:hover .media-overlay {
  opacity: 1;
}

.delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.62);
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s ease;
}

.media-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: rgba(220, 38, 38, 0.9);
}

.media-title {
  font-size: 11px;
  color: white;
  margin: 0 0 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.media-meta {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.72);
}

.asset-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 16px;
}

.asset-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 56px;
  padding: 10px 12px;
  text-align: left;
  color: var(--ui-text-primary-fg, var(--text));
  background: var(--ui-surface-panel-bg, var(--bg-panel));
  border: 1px solid var(--ui-border-subtle-border, var(--border-subtle));
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.asset-row:hover {
  background: var(--ui-state-hover-bg, var(--hover));
  border-color: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
}

.asset-row-icon {
  color: var(--ui-accent-primary-fg, var(--accent));
  flex-shrink: 0;
}

.asset-row-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.asset-row-title {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-row-meta,
.asset-source {
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.row-remove {
  flex-shrink: 0;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  padding: 5px 7px;
  cursor: pointer;
}

.row-remove:hover {
  color: var(--ui-status-danger-fg, var(--danger, #dc2626));
  border-color: currentColor;
}

/* Clean up duplicate headers inside embedded workspace content */
.media-panel :deep(.tasks-header) {
  min-height: auto !important;
  padding: 10px 14px 10px !important;
  border-bottom: none !important;
}
.media-panel :deep(.tasks-header .header-copy) {
  display: none !important;
}

.media-panel :deep(.agents-header) {
  min-height: auto !important;
  padding: 10px 14px 10px !important;
  border-bottom: none !important;
}
.media-panel :deep(.agents-header .agents-title) {
  display: none !important;
}

.media-panel :deep(.memory-header) {
  padding: 10px 14px 8px !important;
}
.media-panel :deep(.memory-header .memory-title) {
  display: none !important;
}

</style>
