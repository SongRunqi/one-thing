<template>
  <div
    v-show="visible"
    class="media-panel"
    :class="`mode-${mode}`"
  >
    <div
      v-if="mode !== 'main'"
      class="media-nav"
    >
      <div class="traffic-lights-space" />
      <div class="nav-items">
        <Button
          v-for="item in navItems"
          :key="item.id"
          unstyled
          class="nav-item"
          :class="{ active: activeNav === item.id }"
          :aria-pressed="activeNav === item.id"
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
            class="nav-count"
          >
            {{ mediaStore.assets.length }}
          </span>
        </Button>
      </div>
      <div class="nav-footer">
        <Button
          unstyled
          class="text-action nav-close"
          title="Close panel"
          @click="$emit('close')"
        >
          close
        </Button>
      </div>
    </div>

    <div class="media-content">
      <div
        v-if="mode === 'main'"
        class="main-panel-header"
      >
        <div
          :class="['main-panel-sidebar-actions-slot', { reserved: reserveSidebarActions }]"
          aria-hidden="true"
        />
        <div
          class="main-panel-header-spacer"
          aria-hidden="true"
        />
        <Button
          unstyled
          class="text-action main-panel-close"
          native-type="button"
          title="Close"
          @click="$emit('close')"
        >
          close
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
            <p
              v-if="mediaStore.isLoading || mediaStore.isRebuilding"
              class="ledger-note"
            >
              {{ mediaLoadingLabel }}
            </p>

            <template v-else-if="activeKind === 'image' && filteredAssets.length > 0">
              <div class="media-grid">
                <div
                  v-for="asset in filteredAssets"
                  :key="asset.id"
                  class="media-item"
                  :class="{ 'is-selected': selectedAsset?.id === asset.id }"
                  role="button"
                  tabindex="0"
                  @click="openAsset(asset)"
                  @keydown.enter.prevent="openAsset(asset)"
                  @keydown.space.prevent="openAsset(asset)"
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
                    remove
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
                  <span
                    class="row-index"
                    aria-hidden="true"
                  />
                  <span
                    class="asset-row-title"
                    :title="assetTitle(asset)"
                  >{{ assetTitle(asset) }}</span>
                  <span class="asset-row-meta">{{ assetSubtitle(asset) }}</span>
                  <span class="asset-source">{{ sourceLabel(asset.source) }}</span>
                  <span
                    class="asset-row-actions"
                    @click.stop
                  >
                    <Button
                      unstyled
                      class="text-action is-danger"
                      title="Remove from library"
                      @click="removeAsset(asset.id)"
                    >
                      remove
                    </Button>
                  </span>
                </div>
              </div>
            </template>

            <div
              v-else
              class="empty-state"
            >
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
                <span class="drawer-title">Media details</span>
                <Button
                  unstyled
                  class="text-action"
                  native-type="button"
                  title="Close details"
                  @click="selectedAsset = null"
                >
                  close
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

                <div class="drawer-ledger">
                  <div class="drawer-section">
                    <h4 class="section-heading">
                      File information
                    </h4>
                    <div class="specs-list">
                      <div class="spec-row">
                        <span class="spec-label">Name</span>
                        <span
                          class="spec-val"
                          :title="selectedAsset.fileName"
                        >{{ selectedAsset.fileName }}</span>
                      </div>
                      <div class="spec-row">
                        <span class="spec-label">Format</span>
                        <span
                          class="spec-val"
                          :title="selectedAsset.mimeType"
                        >{{ selectedAsset.mimeType }}</span>
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
                        Prompt
                      </h4>
                      <Button
                        unstyled
                        class="text-action"
                        native-type="button"
                        title="Copy prompt"
                        @click="copyPromptText(selectedAsset.metadata.prompt)"
                      >
                        {{ copiedPrompt ? 'copied' : 'copy' }}
                      </Button>
                    </div>
                    <div class="prompt-excerpt">
                      {{ selectedAsset.metadata.prompt }}
                    </div>
                  </div>

                  <div
                    v-if="selectedAsset.metadata?.revisedPrompt"
                    class="drawer-section"
                  >
                    <div class="section-title-with-action">
                      <h4 class="section-heading">
                        Revised prompt
                      </h4>
                      <Button
                        unstyled
                        class="text-action"
                        native-type="button"
                        title="Copy revised prompt"
                        @click="copyRevisedPromptText(selectedAsset.metadata.revisedPrompt)"
                      >
                        {{ copiedRevisedPrompt ? 'copied' : 'copy' }}
                      </Button>
                    </div>
                    <div class="prompt-excerpt">
                      {{ selectedAsset.metadata.revisedPrompt }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Drawer Footer Actions -->
              <div class="drawer-footer">
                <Button
                  v-if="selectedAsset.filePath"
                  unstyled
                  class="text-action"
                  native-type="button"
                  title="Open in the default application"
                  @click="openFileExternally(selectedAsset)"
                >
                  open externally
                </Button>
                <Button
                  v-if="selectedAsset.filePath"
                  unstyled
                  class="text-action"
                  native-type="button"
                  title="Copy file path"
                  @click="copyFilePath(selectedAsset.filePath)"
                >
                  {{ copiedPath ? 'copied' : 'copy path' }}
                </Button>
                <Button
                  unstyled
                  class="text-action is-danger"
                  native-type="button"
                  title="Remove from library"
                  @click="deleteAssetFromDrawer(selectedAsset)"
                >
                  delete
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
          <SchedulerPanelContent :active="activeNav === 'tasks'" />
        </section>

        <section
          v-if="hasMountedNav('music')"
          v-show="activeNav === 'music'"
          class="workspace-panel-view workspace-panel-content-view"
          data-workspace-panel-view="music"
        >
          <MusicPanelContent />
        </section>

        <section
          v-if="hasMountedNav('practice')"
          v-show="activeNav === 'practice'"
          class="workspace-panel-view workspace-panel-content-view"
          data-workspace-panel-view="practice"
        >
          <PracticePanelContent :active="activeNav === 'practice'" />
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
import MusicPanelContent from './MusicPanelContent.vue'
import ArchivedChatsContent from './ArchivedChatsContent.vue'
import FilterSearchInput from './common/FilterSearchInput.vue'
import Select from './common/Select.vue'
import MemoryPanelContent from './memory/MemoryPanelContent.vue'
import SchedulerPanelContent from './SchedulerPanelContent.vue'
import PracticePanelContent from './PracticePanelContent.vue'
import { useMediaStore } from '@/stores/media'
import type { MediaAsset, MediaKind, MediaSource } from '@/types'
import {
  Activity,
  Archive,
  Bot,
  Brain,
  CalendarClock,
  FileText,
  Images,
  Music,
  Radio,
  Video,
} from 'lucide-vue-next'
import { platformApi } from '@/platform'

type WorkspacePanelNav = 'media' | 'memory' | 'agents' | 'tasks' | 'music' | 'practice' | 'archive'

const props = withDefaults(defineProps<{
  visible: boolean
  activeTab?: WorkspacePanelNav | null
  initialTab?: WorkspacePanelNav | ''
  mode?: 'side' | 'main'
  reserveSidebarActions?: boolean
}>(), {
  activeTab: null,
  initialTab: '',
  mode: 'side',
  reserveSidebarActions: false,
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
  { id: 'music', label: 'Music', icon: Radio },
  { id: 'practice', label: 'Practice', icon: Activity },
  { id: 'archive', label: 'Archived Chats', icon: Archive },
]

function normalizeNav(tab?: string | null): WorkspacePanelNav | null {
  if (tab === 'media' || tab === 'memory' || tab === 'agents' || tab === 'tasks' || tab === 'music' || tab === 'practice' || tab === 'archive') {
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
  mediaStore.isRebuilding ? 'indexing media…' : 'loading media…'
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
  platformApi.openImageGallery(asset.id)
}

function openFileExternally(asset: MediaAsset) {
  if (asset.filePath) {
    platformApi.openPath(asset.filePath)
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

async function refreshMedia(rebuild = false, force = false) {
  await mediaStore.loadMedia({ rebuild, force })
}

let unsubscribe: (() => void) | null = null

onMounted(async () => {
  unsubscribe = platformApi.onImageGenerated(async () => {
    await refreshMedia(false, true)
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
      await refreshMedia()
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})
</script>

<style scoped>
/*
 * Workspace panel shell + media view — 画线风 (ledger / ink-line).
 * No background fills, no radii: state lives in the line.
 */
.media-panel {
  width: 560px;
  height: 100%;
  min-height: 0;
  min-width: 0;
  flex-shrink: 0;
  display: flex;
  background: var(--ui-surface-panel-bg, var(--ui-surface-app-bg, var(--bg)));
  overflow: hidden;
  animation: ledger-fade 0.15s ease;
}

@keyframes ledger-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.media-panel.mode-main {
  flex: 1 1 auto;
  width: auto;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--ui-surface-chat-bg, var(--ui-surface-app-bg, var(--bg)));
}

/* ---- nav rail ---- */
.media-nav {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 72%, transparent);
  z-index: 1;
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
  padding: 8px 0;
  gap: 2px;
  min-height: 0;
  overflow-y: auto;
}

.nav-footer {
  display: flex;
  justify-content: center;
  padding: 10px 8px 12px;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle, var(--border))) 32%, transparent);
}

.nav-close {
  padding: 4px 6px;
}

.nav-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 11px 10px;
  min-width: 68px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  transition: color 0.12s ease;
}

/* Active nav item hangs a tick on the rail — no fill. */
.nav-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 0;
  background: var(--ui-accent-primary-fg, var(--accent));
  transition: height 0.12s ease;
}

.nav-item:hover {
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.nav-item:focus-visible {
  outline: 1px solid var(--ui-accent-primary-fg, var(--accent));
  outline-offset: -1px;
}

.nav-item.active {
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.nav-item.active::before {
  height: 22px;
}

.nav-label {
  font-size: 11px;
  font-weight: var(--font-weight-medium, 500);
  max-width: 76px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-count {
  position: absolute;
  top: 5px;
  right: 8px;
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--muted));
}

/* ---- content column ---- */
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

.workspace-panel-media-view {
  position: relative;
}

.mode-main .media-content {
  padding: 0;
}

.main-panel-header {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 14px 0 0;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 45%, transparent);
  -webkit-app-region: drag;
}

.main-panel-sidebar-actions-slot {
  width: 16px;
  flex: 0 0 auto;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

.main-panel-sidebar-actions-slot.reserved {
  width: 176px;
}

.main-panel-header-spacer {
  min-width: 0;
  flex: 1 1 auto;
}

.main-panel-close {
  flex: 0 0 auto;
  padding: 6px 2px;
  -webkit-app-region: no-drag;
}

/* ---- media toolbar ---- */
.content-header {
  position: relative;
  z-index: calc(var(--z-dropdown, 1000) + 5);
  padding: 16px 4px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
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
  flex: 1 1 calc(50% - 5px);
  min-width: 0;
}

/* Ledger-ify shared toolbar controls: transparent, bottom rule only. */
.media-filter-bar :deep(.filter-search) {
  background: transparent;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 70%, transparent);
  border-radius: 0;
  box-shadow: none;
}

.media-filter-bar :deep(.filter-search:focus-within),
.media-filter-bar :deep(.filter-search:hover) {
  border-bottom-color: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: none;
}

.media-filter-bar :deep(.app-select-control) {
  background: transparent;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 70%, transparent);
  border-radius: 0;
  box-shadow: none;
}

.media-filter-bar :deep(.app-select-control:hover),
.media-filter-bar :deep(.app-select-control:focus-within) {
  border-bottom-color: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: none;
}

/* Paper dropdown: square, hard shadow. */
.media-filter-bar :deep(.app-select-dropdown) {
  background: var(--ui-surface-app-bg, var(--bg));
  border: 1px solid var(--ui-border-strong-border, var(--border-strong, var(--border)));
  border-radius: 0;
  box-shadow: 4px 4px 0 color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 24%, transparent);
}

.media-filter-bar :deep(.app-select-option) {
  border-radius: 0;
}

.media-select-label {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 7px;
}

.media-select-icon {
  flex: 0 0 auto;
  color: var(--ui-text-muted-fg, var(--text-muted));
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

/* ---- notes / empty state ---- */
.ledger-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.empty-state {
  padding: 8px 0 16px;
}

.empty-text {
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  margin: 0 0 2px;
}

.empty-hint {
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--muted));
  margin: 0;
}

/* ---- image grid ---- */
.media-grid {
  column-width: 138px;
  column-gap: 12px;
  line-height: 0;
  padding-bottom: 16px;
}

.mode-main .media-grid {
  column-width: 168px;
}

.media-item {
  position: relative;
  display: inline-block;
  width: 100%;
  margin: 0 0 12px;
  line-height: normal;
  overflow: hidden;
  cursor: pointer;
  break-inside: avoid;
  transform: translateZ(0);
  outline: 1px solid transparent;
  outline-offset: -1px;
  transition: outline-color 0.12s ease;
}

.media-item:hover {
  outline-color: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 72%, transparent);
}

.media-item:focus-visible,
.media-item.is-selected {
  outline-color: var(--ui-accent-primary-fg, var(--accent));
}

.media-thumbnail {
  width: 100%;
  height: auto;
  display: block;
  object-fit: contain;
}

/* Caption over the image itself: pictorial context, scrim stays. */
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

.media-item:hover .media-overlay,
.media-item:focus-visible .media-overlay,
.media-item.is-selected .media-overlay {
  opacity: 1;
}

.delete-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 3px 7px;
  border: none;
  background: rgba(0, 0, 0, 0.62);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: rgba(255, 255, 255, 0.88);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease, color 0.12s ease;
}

.media-item:hover .delete-btn,
.media-item:focus-visible .delete-btn,
.delete-btn:focus-visible {
  opacity: 1;
}

.delete-btn:hover {
  color: rgba(255, 255, 255, 1);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.media-title {
  font-size: 11px;
  color: white;
  margin: 0 0 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.media-meta {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.72);
}

/* ---- non-image asset list: ledger register ---- */
.asset-list {
  position: relative;
  padding-left: 16px;
  padding-bottom: 16px;
  counter-reset: asset-row;
}

.asset-list::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 6px;
  bottom: 6px;
  width: 1px;
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 72%, transparent);
}

.asset-row {
  position: relative;
  counter-increment: asset-row;
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-height: 30px;
  padding: 6px 0;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle, var(--border))) 32%, transparent);
  cursor: pointer;
}

.asset-row:first-child {
  border-top: none;
}

.asset-row::before {
  content: '';
  position: absolute;
  left: -13px;
  top: 50%;
  width: 7px;
  height: 1px;
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
  transition: width 0.12s ease, background-color 0.12s ease;
}

.asset-row:hover::before {
  width: 12px;
  background: var(--ui-text-muted-fg, var(--text-muted));
}

.asset-row:focus-visible {
  outline: none;
}

.asset-row:focus-visible::before {
  width: 14px;
  height: 2px;
  background: var(--ui-accent-primary-fg, var(--accent));
}

.row-index::before {
  content: counter(asset-row, decimal-leading-zero);
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--muted));
  flex-shrink: 0;
  min-width: 16px;
  display: inline-block;
}

.asset-row-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.asset-row-meta {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--muted));
  white-space: nowrap;
  flex-shrink: 0;
}

.asset-source {
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  white-space: nowrap;
  flex-shrink: 0;
}

.asset-row-actions {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.asset-row:hover .asset-row-actions,
.asset-row:focus-visible .asset-row-actions,
.asset-row-actions:focus-within {
  opacity: 1;
}

/* ---- inspector drawer: paper sheet ---- */
.inspector-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 330px;
  max-width: 100%;
  background: var(--ui-surface-app-bg, var(--bg));
  border-left: 1px solid var(--ui-border-strong-border, var(--border-strong, var(--border)));
  display: flex;
  flex-direction: column;
  z-index: 100;
  overflow: hidden;
}

.mode-side .inspector-drawer {
  width: 100%;
  border-left: none;
}

.drawer-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent);
  flex-shrink: 0;
}

.drawer-title {
  font-family: var(--font-display, var(--font-serif, serif));
  font-size: 15px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--ui-text-primary-fg, var(--text-primary));
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}

.drawer-preview-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  cursor: zoom-in;
}

.drawer-preview-fallback {
  color: var(--ui-text-faint-fg, var(--muted));
}

/* Detail sections hang on one rule, like the ledger body. */
.drawer-ledger {
  position: relative;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.drawer-ledger::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 6px;
  bottom: 6px;
  width: 1px;
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 72%, transparent);
}

.drawer-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.section-heading {
  position: relative;
  font-size: 11px;
  font-weight: var(--font-weight-semibold, 600);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ui-text-primary-fg, var(--text-primary));
  margin: 0;
}

.section-heading::before {
  content: '';
  position: absolute;
  left: -16px;
  top: 50%;
  width: 10px;
  height: 2px;
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
}

.section-title-with-action {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.specs-list {
  min-width: 0;
}

.spec-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  font-size: 12px;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle, var(--border))) 32%, transparent);
}

.spec-row:first-child {
  border-top: none;
}

.spec-label {
  color: var(--ui-text-muted-fg, var(--text-muted));
  flex-shrink: 0;
  white-space: nowrap;
}

.spec-val {
  color: var(--ui-text-primary-fg, var(--text-primary));
  min-width: 0;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Prompt excerpt: quoted text held by a left rule, no filled block. */
.prompt-excerpt {
  margin: 0;
  padding: 2px 0 2px 10px;
  border-left: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.6;
  color: var(--ui-text-muted-fg, var(--text-muted));
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 140px;
  overflow-y: auto;
}

.drawer-footer {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px 16px 14px;
  border-top: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent);
  flex-shrink: 0;
}

.drawer-footer .is-danger {
  margin-left: auto;
}

/* Drawer slide */
.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
}

/* ---- shared text-action ---- */
.text-action {
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  transition: color 0.12s ease;
}

.text-action:hover:not(:disabled) {
  color: var(--ui-text-primary-fg, var(--text-primary));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg, var(--accent));
}

.text-action.is-danger:hover:not(:disabled) {
  color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
  text-decoration-color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
}

.text-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .media-panel {
    animation: none;
  }

  .drawer-enter-active,
  .drawer-leave-active {
    transition: none;
  }
}
</style>
