<template>
  <div
    v-show="visible"
    class="media-panel"
  >
    <div class="media-content">
      <div class="main-panel-header">
        <!-- 侧栏收起时按钮住在这里 —— .main-panel-header 是 drag,按钮是它的
             真实子孙,自身 no-drag 才挖得动洞。整槽不再是一整块 no-drag 死带。 -->
        <div class="main-panel-sidebar-actions-slot">
          <div
            class="main-panel-traffic-lights-space"
            :class="{ reserved: reserveSidebarActions }"
            aria-hidden="true"
          />
          <SidebarActionGroup
            v-if="reserveSidebarActions"
            :sidebar-visible="false"
            variant="topbar"
            @toggle-sidebar="$emit('toggle-sidebar')"
            @open-search="$emit('open-search')"
            @create-new-chat="$emit('create-new-chat')"
          />
        </div>
        <!-- 面板内导航。**两个入口的分工**:
             · 侧栏「⋯」菜单 = 打开工作区面板并跳到某个 inSidebarMenu 的面板;
             · 这条导航 = 在**已打开**的面板之间切换,覆盖面更大 —— 它吃的是
               inPanelNav,所以 nav-only 的内置面板(archive)与全部插件面板
               都在这里,而它们按定义进不了 ⋯ 菜单。
             在这条补上之前,主窗口的 v-if="mode !== 'main'" 让导航从不渲染,
             于是 archive 与所有插件面板在主窗口**根本没有入口**。 -->
        <div
          class="workspace-tabs"
          role="tablist"
          aria-label="Workspace panels"
        >
          <Button
            v-for="item in allNavItems"
            :key="item.id"
            unstyled
            class="workspace-tab"
            :class="{ active: activeNav === item.id }"
            role="tab"
            :aria-selected="activeNav === item.id"
            native-type="button"
            @click="selectNav(item.id)"
          >
            <component
              :is="item.icon"
              :size="14"
              :stroke-width="1.5"
              class="workspace-tab-icon"
            />
            <span class="workspace-tab-label">{{ item.label }}</span>
          </Button>
        </div>
        <div
          class="main-panel-header-spacer"
          aria-hidden="true"
        />
        <Button
          unstyled
          class="text-action main-panel-close"
          native-type="button"
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
                  <!-- 原生 button,不套 Button unstyled:这个筹码不要 loading/icon/
                       group,套上去只换来一场必输的官司 —— `.app-button:hover:not(:disabled)`
                       是 (0,4,0),消费者的 `.delete-btn:hover` 只有 (0,3,0),hover 时
                       `--app-button-hover-fg`(= --ui-text-primary-fg,深灰)盖掉白字,
                       在 rgba(0,0,0,.62) 的黑筹码上等于消失(真机实测:只剩边框看得见)。 -->
                  <button
                    type="button"
                    class="delete-btn"
                    @click.stop="removeAsset(asset.id)"
                  >
                    remove
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
                  <span
                    class="row-index"
                    aria-hidden="true"
                  />
                  <span class="asset-row-title">{{ assetTitle(asset) }}</span>
                  <span class="asset-row-meta">{{ assetSubtitle(asset) }}</span>
                  <span class="asset-source">{{ sourceLabel(asset.source) }}</span>
                  <span
                    class="asset-row-actions"
                    @click.stop
                  >
                    <Button
                      unstyled
                      class="text-action is-danger"
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
                        <span class="spec-val">{{ selectedAsset.fileName }}</span>
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
                        Prompt
                      </h4>
                      <Button
                        unstyled
                        class="text-action"
                        native-type="button"
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
                  @click="openFileExternally(selectedAsset)"
                >
                  open externally
                </Button>
                <Button
                  v-if="selectedAsset.filePath"
                  unstyled
                  class="text-action"
                  native-type="button"
                  @click="copyFilePath(selectedAsset.filePath)"
                >
                  {{ copiedPath ? 'copied' : 'copy path' }}
                </Button>
                <Button
                  unstyled
                  class="text-action is-danger"
                  native-type="button"
                  @click="deleteAssetFromDrawer(selectedAsset)"
                >
                  delete
                </Button>
              </div>
            </div>
          </Transition>
        </section>

        <section
          v-if="hasMountedNav('agents')"
          v-show="activeNav === 'agents'"
          class="workspace-panel-view workspace-panel-content-view"
          data-workspace-panel-view="agents"
        >
          <!-- 「私聊」/「TA 的群聊」开出去的会话在聊天区,这块面板正盖在上面 —— 让它自己合上。 -->
          <AgentsPanelContent @close="$emit('close')" />
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

        <!-- 插件贡献的面板(R5)。入口来自 manifest,内容来自描述树 ——
             新增一个插件面板不需要改这个文件的任何一行。 -->
        <!-- v-if 在同一元素上先于 v-for 求值,所以 v-for 必须外提到 template。 -->
        <template
          v-for="panel in pluginPanels"
          :key="pluginPanelNavId(panel.pluginId, panel.panelId)"
        >
          <section
            v-if="hasMountedNav(pluginPanelNavId(panel.pluginId, panel.panelId))"
            v-show="activeNav === pluginPanelNavId(panel.pluginId, panel.panelId)"
            class="workspace-panel-view workspace-panel-content-view"
            :data-workspace-panel-view="pluginPanelNavId(panel.pluginId, panel.panelId)"
          >
            <PluginPanelHost :panel="panel" />
          </section>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import SidebarActionGroup from '@/components/sidebar/SidebarActionGroup.vue'
import { ref, computed, onMounted, onUnmounted, watch, type Component } from 'vue'
import AgentsPanelContent from './AgentsPanelContent.vue'
import MusicPanelContent from './MusicPanelContent.vue'
import ArchivedChatsContent from './ArchivedChatsContent.vue'
import FilterSearchInput from './common/FilterSearchInput.vue'
import Select from './common/Select.vue'
import SchedulerPanelContent from './SchedulerPanelContent.vue'
import PracticePanelContent from './PracticePanelContent.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useMediaStore } from '@/stores/media'
import type { MediaAsset, MediaKind, MediaSource } from '@/types'
import {
  FileText,
  Images,
  Music,
  Video,
} from 'lucide-vue-next'
import { platformApi } from '@/platform'
import {
  isWorkspacePanelId,
  parsePluginPanelNavId,
  pluginPanelNavId,
  usePluginWorkspacePanels,
  useWorkspaceNavEntries,
  type WorkspaceNavId,
} from '@/workspace/panel-registry'
import PluginPanelHost from '@/components/plugins/PluginPanelHost.vue'

const props = withDefaults(defineProps<{
  visible: boolean
  activeTab?: WorkspaceNavId | null
  initialTab?: WorkspaceNavId | ''
  reserveSidebarActions?: boolean
}>(), {
  activeTab: null,
  initialTab: '',
  reserveSidebarActions: false,
})

const emit = defineEmits<{
  close: []
  'toggle-sidebar': []
  'open-search': []
  'create-new-chat': []
  /**
   * 用户在面板内导航上切了一下。
   *
   * 必须回写给 App:⋯ 菜单与面板内导航现在覆盖同一组面板,不回写的话两个入口
   * 会各说各话 —— 从菜单打开 media、面板内切到 archive、再点菜单里的 Media,
   * `activeTab` 没变化、watch 不触发,面板就卡在 archive 上。
   */
  'switch-panel': [nav: WorkspaceNavId]
}>()

type SourceFilter = 'all' | 'user-upload' | 'ai-generated'
type KindFilterOption = { value: MediaKind; label: string; icon: Component }
type SourceFilterOption = { value: SourceFilter; label: string }

const mediaStore = useMediaStore()
const { confirm } = useConfirm()
const searchQuery = ref('')
const activeNav = ref<WorkspaceNavId>(normalizeNav(props.activeTab ?? props.initialTab) ?? 'media')
const mountedNavs = ref<WorkspaceNavId[]>([activeNav.value])
const activeKind = ref<MediaKind>('image')
const activeSource = ref<SourceFilter>('all')

// 导航条与侧栏「⋯」菜单吃**同一份**清单(注册表里的 useWorkspaceNavEntries)——
// 抄第二份就是漂移的起点(`archive` 曾经只在这里存在,别处的联合都没有它;
// 而菜单吃另一份过滤结果,恰恰是 archive/practice/插件面板进不去菜单的原因)。
const allNavItems = useWorkspaceNavEntries()

// 插件面板清单来自 manifest,所以入口在插件加载失败时也在(点开由
// PluginPanelHost 说明原因);停用的插件不在清单里。
const pluginPanels = usePluginWorkspacePanels()

/** 面板内导航被点了 —— 本地切换,同时回写给 App 保持两个入口一致。 */
function selectNav(nav: WorkspaceNavId): void {
  activeNav.value = nav
  emit('switch-panel', nav)
}

function normalizeNav(tab?: string | null): string | null {
  if (isWorkspacePanelId(tab)) return tab
  // 插件面板的 nav id 形如 `plugin:<pluginId>:<panelId>`。
  return typeof tab === 'string' && parsePluginPanelNavId(tab) ? tab : null
}

/**
 * 插件面板消失时把导航拉回来。
 *
 * 停用一个插件(或它被熔断自动禁用)之后,它的入口会从清单里消失,但 activeNav
 * 还指着那个 nav id —— 于是导航条上没有任何一项高亮,主区一片空白,而且没有一句
 * 话解释发生了什么。这里让它退回 media,并顺手把已挂载记录里的死条目清掉。
 */
watch(pluginPanels, (panels) => {
  const parsed = parsePluginPanelNavId(String(activeNav.value))
  if (parsed && !panels.some(panel => panel.pluginId === parsed.pluginId && panel.panelId === parsed.panelId)) {
    activeNav.value = 'media'
  }
  const live = new Set(panels.map(panel => pluginPanelNavId(panel.pluginId, panel.panelId)))
  mountedNavs.value = mountedNavs.value.filter(nav => !parsePluginPanelNavId(String(nav)) || live.has(String(nav)))
})

function markNavMounted(nav: WorkspaceNavId) {
  if (!mountedNavs.value.includes(nav)) {
    mountedNavs.value = [...mountedNavs.value, nav]
  }
}

function hasMountedNav(nav: WorkspaceNavId): boolean {
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

const REMOVE_MEDIA_ASK = {
  title: 'Remove from library',
  message: 'Remove this item from the library? The original chat message will stay unchanged.',
  confirmText: 'Remove',
  danger: true,
} as const

async function deleteAssetFromDrawer(asset: MediaAsset) {
  if (!await confirm({ ...REMOVE_MEDIA_ASK })) return
  selectedAsset.value = null
  await mediaStore.removeMedia(asset.id)
}

async function removeAsset(id: string) {
  if (!await confirm({ ...REMOVE_MEDIA_ASK })) return
  await mediaStore.removeMedia(id)
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
/* 只有一种形态了 —— `side` 是零使用点的死枝,已随竖直 nav 一起删除。
   这条规则是原先 `.media-panel` 与 `.media-panel.mode-main` 合并后的结果:
   几何取 main 那一份(侧栏形态的 560px 定宽随死枝一起走)。 */
.media-panel {
  flex: 1 1 auto;
  width: auto;
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  background: var(--ui-surface-chat-bg, var(--ui-surface-app-bg));
  overflow: hidden;
  animation: ledger-fade 0.15s ease;
}

@keyframes ledger-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ---- content column ---- */
.media-content {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  /* 主窗口形态下内容区不自带内边距(各视图自己排版)。
     这原本是 `.mode-main .media-content { padding: 0 }` 的覆盖,
     side 形态删掉之后只剩这一种,直接写进基础规则。 */
  padding: 0;
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

.main-panel-header {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 14px 0 0;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-strong-border) 45%, transparent);
  -webkit-app-region: drag;
}

/* 不带 app-region:让位区和按钮之间的缝隙都回退到 .main-panel-header 的 drag。 */
.main-panel-sidebar-actions-slot {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  align-self: stretch;
}

.main-panel-traffic-lights-space {
  width: 16px;
  flex: 0 0 auto;
  align-self: stretch;
}

.main-panel-traffic-lights-space.reserved {
  width: 84px;
}

/* ---- 面板内导航(主窗口唯一的面板切换入口) ----
   住在 .main-panel-header 里,不另占一条横带 —— 那条带已经有红绿灯让位、
   侧栏动作与 close。header 自身是 drag 区,所以每个 tab 必须 no-drag,
   且它们是 header 的真实子孙(app-region 只对同分支子孙生效)。 */
.workspace-tabs {
  flex: 0 1 auto;
  display: flex;
  align-items: stretch;
  gap: 2px;
  min-width: 0;
  /* 条目多起来(内置 + 任意多个插件面板)时自己横向滚,不把 header 撑破。 */
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-app-region: no-drag;
}

.workspace-tabs::-webkit-scrollbar {
  display: none;
}

.workspace-tab {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: color var(--duration-fast) var(--ease-default);
}

/* 选中态在下沿挂一道尺 —— 与竖直 rail 当年那道 tick 同一个配方,只是转了 90°。 */
.workspace-tab::after {
  content: '';
  position: absolute;
  left: 9px;
  right: 9px;
  bottom: 0;
  height: 0;
  background: var(--ui-accent-primary-fg);
  transition: height var(--duration-fast) var(--ease-default);
}

.workspace-tab:hover {
  color: var(--ui-text-primary-fg);
}

.workspace-tab:focus-visible {
  outline: 1px solid var(--ui-accent-primary-fg);
  outline-offset: -2px;
}

.workspace-tab.active {
  color: var(--ui-text-primary-fg);
}

.workspace-tab.active::after {
  height: 2px;
}

.workspace-tab-icon {
  flex: 0 0 auto;
  opacity: 0.85;
}

.workspace-tab-label {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
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
  z-index: calc(var(--z-dropdown) + 5);
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

/* Ledger-ify shared toolbar controls: transparent, bottom rule only. */
.media-filter-bar :deep(.filter-search) {
  background: transparent;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border) 70%, transparent);
  border-radius: 0;
  box-shadow: none;
}

.media-filter-bar :deep(.filter-search:focus-within),
.media-filter-bar :deep(.filter-search:hover) {
  border-bottom-color: var(--ui-accent-primary-fg);
  box-shadow: none;
}

.media-filter-bar :deep(.app-select-control) {
  background: transparent;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border) 70%, transparent);
  border-radius: 0;
  box-shadow: none;
}

.media-filter-bar :deep(.app-select-control:hover),
.media-filter-bar :deep(.app-select-control:focus-within) {
  border-bottom-color: var(--ui-accent-primary-fg);
  box-shadow: none;
}

/* Paper dropdown: square, hard shadow. */
.media-filter-bar :deep(.app-select-dropdown) {
  background: var(--ui-surface-app-bg);
  border: 1px solid var(--ui-border-strong-border);
  border-radius: 0;
  box-shadow: var(--shadow-paper);
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
  color: var(--ui-text-muted-fg);
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
  color: var(--ui-text-muted-fg);
}

.empty-state {
  padding: 8px 0 16px;
}

.empty-text {
  font-size: 12px;
  color: var(--ui-text-muted-fg);
  margin: 0 0 2px;
}

.empty-hint {
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  margin: 0;
}

/* ---- image grid ---- */
.media-grid {
  column-width: 138px;
  column-gap: 12px;
  line-height: 0;
  padding-bottom: 16px;
}

.media-grid {
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
  transition: outline-color var(--duration-fast) var(--ease-default);
}

.media-item:hover {
  outline-color: color-mix(in srgb, var(--ui-border-strong-border) 72%, transparent);
}

.media-item:focus-visible,
.media-item.is-selected {
  outline-color: var(--ui-accent-primary-fg);
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
  transition: opacity var(--duration-normal) var(--ease-default);
}

.media-item:hover .media-overlay,
.media-item:focus-visible .media-overlay,
.media-item.is-selected .media-overlay {
  opacity: 1;
}

/* Own reset: nothing paints this button but this rule (see the template note).
   The radius restores what BorderBox used to hand an `unstyled` Button before
   the paint withdrawal — the chip was never a square. */
.delete-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  appearance: none;
  margin: 0;
  padding: 3px 7px;
  border: none;
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.62);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: rgba(255, 255, 255, 0.88);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-default), color var(--duration-fast) var(--ease-default);
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
  background: color-mix(in srgb, var(--ui-border-strong-border) 72%, transparent);
}

.asset-row {
  position: relative;
  counter-increment: asset-row;
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-height: 30px;
  padding: 6px 0;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--ui-border-subtle-border)) 32%, transparent);
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
  background: var(--ui-border-strong-border);
  transition: width var(--duration-fast) var(--ease-default), background-color var(--duration-fast) var(--ease-default);
}

.asset-row:hover::before {
  width: 12px;
  background: var(--ui-text-muted-fg);
}

.asset-row:focus-visible {
  outline: none;
}

.asset-row:focus-visible::before {
  width: 14px;
  height: 2px;
  background: var(--ui-accent-primary-fg);
}

.row-index::before {
  content: counter(asset-row, decimal-leading-zero);
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
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
  color: var(--ui-text-primary-fg);
}

.asset-row-meta {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
  white-space: nowrap;
  flex-shrink: 0;
}

.asset-source {
  font-size: 11px;
  color: var(--ui-text-muted-fg);
  white-space: nowrap;
  flex-shrink: 0;
}

.asset-row-actions {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-default);
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
  background: var(--ui-surface-app-bg);
  border-left: 1px solid var(--ui-border-strong-border);
  display: flex;
  flex-direction: column;
  z-index: var(--z-dropdown);
  overflow: hidden;
}

.drawer-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-strong-border) 55%, transparent);
  flex-shrink: 0;
}

.drawer-title {
  font-family: var(--font-display, var(--font-serif, serif));
  font-size: 15px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--ui-text-primary-fg);
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
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border) 55%, transparent);
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
  color: var(--ui-text-faint-fg, var(--ui-text-muted-fg));
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
  background: color-mix(in srgb, var(--ui-border-strong-border) 72%, transparent);
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
  color: var(--ui-text-primary-fg);
  margin: 0;
}

.section-heading::before {
  content: '';
  position: absolute;
  left: -16px;
  top: 50%;
  width: 10px;
  height: 2px;
  background: var(--ui-border-strong-border);
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
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--ui-border-subtle-border)) 32%, transparent);
}

.spec-row:first-child {
  border-top: none;
}

.spec-label {
  color: var(--ui-text-muted-fg);
  flex-shrink: 0;
  white-space: nowrap;
}

.spec-val {
  color: var(--ui-text-primary-fg);
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
  border-left: 1px solid color-mix(in srgb, var(--ui-border-strong-border) 55%, transparent);
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.6;
  color: var(--ui-text-muted-fg);
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
  border-top: 1px solid color-mix(in srgb, var(--ui-border-strong-border) 55%, transparent);
  flex-shrink: 0;
}

.drawer-footer .is-danger {
  margin-left: auto;
}

/* Drawer slide */
.drawer-enter-active,
.drawer-leave-active {
  transition: transform var(--duration-slow) var(--ease-out);
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
  color: var(--ui-text-muted-fg);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-default);
}

.text-action:hover:not(:disabled) {
  color: var(--ui-text-primary-fg);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg);
}

.text-action.is-danger:hover:not(:disabled) {
  color: var(--ui-status-danger-fg);
  text-decoration-color: var(--ui-status-danger-fg);
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
