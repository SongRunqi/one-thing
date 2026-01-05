<template>
  <Transition name="media-panel">
    <div v-if="visible" class="media-panel">
      <!-- Navigation -->
      <div class="media-nav">
        <!-- Traffic lights space -->
        <div class="traffic-lights-space"></div>
        <div class="nav-items">
          <button
            v-for="item in navItems"
            :key="item.id"
            class="nav-item"
            :class="{ active: activeNav === item.id }"
            @click="activeNav = item.id"
          >
            <component :is="item.icon" :size="20" :stroke-width="1.5" class="nav-icon" />
            <span class="nav-label">{{ item.label }}</span>
            <span v-if="item.id === 'media' && mediaStore.images.length > 0" class="nav-badge">
              {{ mediaStore.images.length }}
            </span>
          </button>
        </div>
        <div class="nav-footer">
          <button class="nav-close-btn" @click="$emit('close')" title="Close panel">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Content Area -->
      <div class="media-content">
        <!-- Memory Content -->
        <MemoryContent v-if="activeNav === 'memory'" />

        <!-- Agents Content -->
        <AgentsContent
          v-else-if="activeNav === 'agents'"
          @create-agent="$emit('create-agent')"
          @edit-agent="(agent) => $emit('edit-agent', agent)"
        />

        <!-- Media Content -->
        <template v-else-if="activeNav === 'media'">
          <div class="content-header">
            <input
              v-model="searchQuery"
              type="text"
              class="search-input"
              placeholder="Search images..."
            />
          </div>

          <div class="content-body">
            <!-- Image Grid -->
            <div v-if="filteredImages.length > 0" class="media-grid">
              <div
                v-for="image in filteredImages"
                :key="image.id"
                class="media-item"
                @click="openImage(image)"
              >
                <img :src="mediaStore.getImageUrl(image)" :alt="image.prompt" class="media-thumbnail" />
                <div class="media-overlay">
                  <p class="media-prompt">{{ image.prompt }}</p>
                  <span class="media-model">{{ image.model }}</span>
                </div>
                <!-- Delete button -->
                <button
                  class="delete-btn"
                  @click.stop="deleteImage(image.id)"
                  title="Delete image"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/>
                    <line x1="14" y1="11" x2="14" y2="17"/>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Empty State -->
            <div v-else class="empty-state">
              <div class="empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
              <p class="empty-text">No images yet</p>
              <p class="empty-hint">AI-generated images will appear here</p>
            </div>
          </div>
        </template>

        <!-- Archived Chats Content -->
        <ArchivedChatsContent v-else-if="activeNav === 'archive'" />

        <!-- Infographics Editor -->
        <InfographicEditor v-else-if="activeNav === 'infographics'" />

        <!-- Other content (Downloads, etc.) -->
        <template v-else>
          <div class="content-header">
            <input
              type="text"
              class="search-input"
              placeholder="Search..."
            />
          </div>

          <div class="content-body">
            <div class="empty-state">
              <div class="empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </div>
              <p class="empty-text">Coming soon</p>
              <p class="empty-hint">This feature is under development</p>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import MemoryContent from './MemoryContent.vue'
import AgentsContent from './AgentsContent.vue'
import ArchivedChatsContent from './ArchivedChatsContent.vue'
import InfographicEditor from './infographic/InfographicEditor.vue'
import { useMediaStore, type GeneratedMedia } from '@/stores/media'
import type { Agent } from '@/types'
import {
  Sparkles,
  Bot,
  Images,
  Download,
  PanelTop,
  LayoutGrid,
  Zap,
  Archive,
  BarChart2
} from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  initialTab?: string
}>()

defineEmits<{
  close: []
  'create-agent': []
  'edit-agent': [agent: Agent]
}>()

const mediaStore = useMediaStore()
const searchQuery = ref('')

// Default to 'memory' tab, or use initialTab if provided
const activeNav = ref(props.initialTab || 'memory')

// Filter images by search query
const filteredImages = computed(() => {
  if (!searchQuery.value) return mediaStore.images
  const query = searchQuery.value.toLowerCase()
  return mediaStore.images.filter(img =>
    img.prompt.toLowerCase().includes(query) ||
    img.model.toLowerCase().includes(query)
  )
})

// Open image in gallery preview window (now uses mediaId, gallery loads its own data)
function openImage(image: GeneratedMedia) {
  console.log('[MediaPanel] Opening gallery for mediaId:', image.id)
  window.electronAPI.openImageGallery(image.id)
}

// Delete an image
async function deleteImage(id: string) {
  if (confirm('Delete this image?')) {
    await mediaStore.removeMedia(id)
  }
}

// Listen for image generation events
let unsubscribe: (() => void) | null = null

onMounted(async () => {
  // Load saved media from disk
  await mediaStore.loadMedia()

  // Listen for new image generation events (image already saved by main process)
  unsubscribe = window.electronAPI.onImageGenerated(async (data) => {
    console.log('[MediaPanel] Image generated (already saved):', data.mediaId)
    // Just reload the media list to show the new image
    await mediaStore.loadMedia()
  })
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})

// Keep the last selected tab when panel is reopened
// (activeNav persists between visibility toggles since it's not reset)

// Navigation items with lucide-vue-next icons
const navItems = [
  { id: 'memory', label: 'Memory', icon: Sparkles },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'media', label: 'Media', icon: Images },
  { id: 'infographics', label: '图表', icon: BarChart2 },
  { id: 'downloads', label: 'Downloads', icon: Download },
  { id: 'easels', label: 'Easels', icon: PanelTop },
  { id: 'spaces', label: 'Spaces', icon: LayoutGrid },
  { id: 'boosts', label: 'Boosts', icon: Zap },
  { id: 'archive', label: 'Archived Chats', icon: Archive },
]
</script>

<style scoped>
.media-panel {
  width: 500px;
  flex-shrink: 0;
  display: flex;
  /* Match container's darker base for consistent "surface" */
  background: var(--bg-sunken, color-mix(in srgb, var(--bg) 95%, black));
  overflow: hidden;
}

/* Navigation - elevated sidebar */
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

.nav-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.nav-close-btn:hover {
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
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
  min-width: 72px;
}

.nav-item:hover {
  background: var(--hover);
  color: var(--text);
}

.nav-item.active {
  background: var(--active);
  color: var(--accent);
}

.nav-icon {
  width: 20px;
  height: 20px;
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

/* Content Container */
.media-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 12px;
  padding-top: 0;
}

.content-header {
  padding: 16px 4px;
}

.search-input {
  width: 100%;
  padding: 10px 36px 10px 14px;
  font-size: 14px;
  color: var(--text);
  background: var(--hover);
  border: 1px solid var(--border);
  border-radius: 10px;
  transition: all 0.15s ease;
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
}

.search-input::placeholder {
  color: var(--muted);
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 4px;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  color: var(--muted);
  opacity: 0.5;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 15px;
  font-weight: 500;
  color: var(--text);
  margin: 0 0 4px;
}

.empty-hint {
  font-size: 13px;
  color: var(--muted);
  margin: 0;
}

/* Media Grid */
.media-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding-bottom: 16px;
}

.media-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 12px;
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

.media-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
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
  background: rgba(0, 0, 0, 0.6);
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

.media-prompt {
  font-size: 11px;
  color: white;
  margin: 0 0 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.media-model {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
}

/* Transition - width-based for proper flexbox layout */
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
