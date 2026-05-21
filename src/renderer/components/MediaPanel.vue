<template>
  <Transition name="media-panel">
    <div
      v-if="visible"
      class="media-panel"
    >
      <div class="media-nav">
        <div class="traffic-lights-space" />
        <div class="nav-items">
          <button
            v-for="item in navItems"
            :key="item.id"
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
          </button>
        </div>
        <div class="nav-footer">
          <button
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
          </button>
        </div>
      </div>

      <div class="media-content">
        <template v-if="activeNav === 'media'">
          <div class="content-header">
            <input
              v-model="searchQuery"
              type="text"
              class="search-input"
              :placeholder="searchPlaceholder"
            >

            <div class="kind-tabs">
              <button
                v-for="tab in kindTabs"
                :key="tab.id"
                class="kind-tab"
                :class="{ active: activeKind === tab.id }"
                @click="activeKind = tab.id"
              >
                <component
                  :is="tab.icon"
                  :size="15"
                  :stroke-width="1.8"
                />
                <span>{{ tab.label }}</span>
                <span class="tab-count">{{ tabCount(tab.id) }}</span>
              </button>
            </div>

            <div
              v-if="activeKind === 'image'"
              class="source-tabs"
            >
              <button
                v-for="filter in sourceFilters"
                :key="filter.id"
                class="source-tab"
                :class="{ active: activeSource === filter.id }"
                @click="activeSource = filter.id"
              >
                {{ filter.label }}
                <span>{{ sourceCount(filter.id) }}</span>
              </button>
            </div>
          </div>

          <div class="content-body">
            <div
              v-if="mediaStore.isLoading || mediaStore.isRebuilding"
              class="loading-state"
            >
              <div class="loading-spinner" />
              <span>{{ mediaStore.isRebuilding ? 'Indexing media...' : 'Loading media...' }}</span>
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
                    class="media-thumbnail"
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
                  <button
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
                  </button>
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
                  <button
                    class="row-remove"
                    title="Remove from library"
                    @click.stop="removeAsset(asset.id)"
                  >
                    Remove
                  </button>
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
        </template>

        <MemoryPanelContent v-else-if="activeNav === 'memory'" />
        <SchedulerPanelContent v-else-if="activeNav === 'tasks'" />
        <ArchivedChatsContent v-else-if="activeNav === 'archive'" />
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, type Component } from 'vue'
import ArchivedChatsContent from './ArchivedChatsContent.vue'
import MemoryPanelContent from './memory/MemoryPanelContent.vue'
import SchedulerPanelContent from './SchedulerPanelContent.vue'
import { useMediaStore } from '@/stores/media'
import type { MediaAsset, MediaKind, MediaSource } from '@/types'
import {
  Archive,
  Brain,
  CalendarClock,
  FileText,
  Images,
  Music,
  Upload,
  Video,
} from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  initialTab?: string
}>()

defineEmits<{
  close: []
}>()

type SourceFilter = 'all' | 'user-upload' | 'ai-generated'

const mediaStore = useMediaStore()
const searchQuery = ref('')
const activeNav = ref(props.initialTab || 'media')
const activeKind = ref<MediaKind>('image')
const activeSource = ref<SourceFilter>('all')

const navItems = [
  { id: 'media', label: 'Media', icon: Images },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'tasks', label: 'Tasks', icon: CalendarClock },
  { id: 'archive', label: 'Archived Chats', icon: Archive },
]

const kindTabs: Array<{ id: MediaKind; label: string; icon: Component }> = [
  { id: 'image', label: 'Images', icon: Images },
  { id: 'file', label: 'Files', icon: FileText },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'video', label: 'Video', icon: Video },
]

const sourceFilters: Array<{ id: SourceFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'user-upload', label: 'Uploaded' },
  { id: 'ai-generated', label: 'Generated' },
]

const searchPlaceholder = computed(() =>
  activeKind.value === 'image' ? 'Search images...' : 'Search media...'
)

const filteredAssets = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return mediaStore.assets
    .filter(asset => matchesActiveKind(asset))
    .filter(asset => activeKind.value !== 'image' || activeSource.value === 'all' || asset.source === activeSource.value)
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
  if (activeKind.value !== 'image') return `No ${activeKind.value} assets yet`
  if (activeSource.value === 'user-upload') return 'No uploaded images yet'
  if (activeSource.value === 'ai-generated') return 'No generated images yet'
  return 'No images yet'
})

const emptyHint = computed(() => {
  if (activeKind.value !== 'image') return 'Files attached in chat will appear here'
  if (activeSource.value === 'user-upload') return 'Images you paste or attach in chat will appear here'
  if (activeSource.value === 'ai-generated') return 'AI-generated images will appear here'
  return 'Uploaded and AI-generated images will appear here'
})

function sourceCount(source: SourceFilter): number {
  return mediaStore.images.filter(asset => source === 'all' || asset.source === source).length
}

function matchesActiveKind(asset: MediaAsset): boolean {
  if (activeKind.value === 'file') {
    return asset.kind === 'file' || asset.kind === 'document'
  }
  return asset.kind === activeKind.value
}

function tabCount(kind: MediaKind): number {
  if (kind === 'file') {
    return mediaStore.kindCounts.file + mediaStore.kindCounts.document
  }
  return mediaStore.kindCounts[kind]
}

function sourceLabel(source: MediaSource): string {
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

function openAsset(asset: MediaAsset) {
  if (asset.kind === 'image') {
    window.electronAPI.openImageGallery(asset.id)
    return
  }
  if (asset.filePath) {
    window.electronAPI.openPath(asset.filePath)
  }
}

async function removeAsset(id: string) {
  if (confirm('Remove this item from the library? The original chat message will stay unchanged.')) {
    await mediaStore.removeMedia(id)
  }
}

async function refreshMedia(rebuild = false) {
  await mediaStore.loadMedia({ rebuild })
}

let unsubscribe: (() => void) | null = null

onMounted(async () => {
  if (props.visible) {
    await refreshMedia(true)
  }

  unsubscribe = window.electronAPI.onImageGenerated(async () => {
    await refreshMedia()
  })
})

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      await refreshMedia(true)
    }
  },
)

watch(
  () => props.initialTab,
  (tab) => {
    if (tab) activeNav.value = tab
  },
)

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})
</script>

<style scoped>
.media-panel {
  width: 560px;
  flex-shrink: 0;
  display: flex;
  background: var(--bg-sunken, color-mix(in srgb, var(--bg) 95%, black));
  overflow: hidden;
}

.media-nav {
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border-right: 1px solid var(--border);
  box-shadow:
    2px 0 8px rgba(0, 0, 0, 0.1),
    4px 0 16px rgba(0, 0, 0, 0.05);
  z-index: 1;
}

html[data-theme='light'] .media-nav {
  box-shadow:
    2px 0 8px rgba(0, 0, 0, 0.04),
    4px 0 16px rgba(0, 0, 0, 0.02);
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
  color: var(--muted);
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
  background: var(--hover);
  color: var(--text);
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
  background: var(--active);
  color: var(--accent);
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
  background: var(--accent);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.media-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 12px;
  padding-top: 0;
}

.content-header {
  padding: 16px 4px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.search-input {
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  color: var(--text);
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: all 0.15s ease;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
}

.search-input::placeholder {
  color: var(--muted);
}

.kind-tabs,
.source-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
}

.kind-tab,
.source-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.kind-tab {
  padding: 0 9px;
  font-size: 12px;
}

.source-tab {
  padding: 0 10px;
  font-size: 12px;
}

.kind-tab.active,
.source-tab.active {
  color: var(--accent);
  background: var(--active);
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}

.tab-count,
.source-tab span {
  color: var(--muted);
  font-size: 11px;
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 4px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: var(--muted);
}

.loading-spinner {
  width: 26px;
  height: 26px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-icon {
  opacity: 0.5;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 4px;
}

.empty-hint {
  font-size: 13px;
  color: var(--muted);
  margin: 0;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding-bottom: 16px;
}

.media-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  background: var(--hover);
}

.media-item:hover {
  transform: scale(1.02);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.media-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  padding: 8px 10px;
  text-align: left;
  color: var(--text);
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
}

.asset-row-icon {
  color: var(--accent);
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
  color: var(--muted);
}

.row-remove {
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  padding: 5px 7px;
  cursor: pointer;
}

.row-remove:hover {
  color: var(--danger, #dc2626);
  border-color: currentColor;
}

.media-panel-enter-active,
.media-panel-leave-active {
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.media-panel-enter-from,
.media-panel-leave-to {
  width: 0;
}
</style>
