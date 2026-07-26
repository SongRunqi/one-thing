<script setup lang="ts">
/**
 * Embedded browser chrome (tab strip + nav + omnibox) over a placeholder div.
 * The real page is a main-process WebContentsView positioned to track this
 * div's rect. 画线风 per docs/design/browser-v2/mockup.html. Geometry sync is
 * marked TODO(browser-geometry): today it tracks a single-Tabs workbench; after
 * terminal P1 split-tree it must adopt the §14.2 coexistence hooks.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, Crosshair, Globe, Lock, Plus, RotateCw, Square, X } from 'lucide-vue-next'
import { platformApi } from '@/platform'
import { useBrowserStore } from '@/stores/browser'
import { useOverlayPresenceStore } from '@/stores/overlayPresence'
import type { MessageAttachment, PickedWebElement } from '@/types'

const props = withDefaults(defineProps<{ active: boolean; revealed?: boolean }>(), {
  revealed: true,
})

const store = useBrowserStore()
const overlayPresence = useOverlayPresenceStore()
const viewportRef = ref<HTMLElement | null>(null)
const omniboxValue = ref('')
const editingOmnibox = ref(false)

const activeTab = computed(() => store.activeTab)
const isHttps = computed(() => activeTab.value?.url?.startsWith('https://') ?? false)

// Keep the omnibox synced with the active tab's URL unless the user is editing.
watch(
  () => activeTab.value?.url,
  (url) => {
    if (!editingOmnibox.value) omniboxValue.value = url ?? ''
  },
)
watch(
  () => store.activeTabId,
  () => {
    editingOmnibox.value = false
    omniboxValue.value = activeTab.value?.url ?? ''
  },
)

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed
  // Bare host/path → https; anything with a space or no dot → search.
  if (/\s/.test(trimmed) || !/\./.test(trimmed)) {
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
  }
  return `https://${trimmed}`
}

function submitOmnibox(): void {
  const url = normalizeUrl(omniboxValue.value)
  if (!url) return
  editingOmnibox.value = false
  void store.navigate(url)
}

function onOmniboxFocus(event: FocusEvent): void {
  editingOmnibox.value = true
  ;(event.target as HTMLInputElement).select()
}
function onOmniboxBlur(): void {
  editingOmnibox.value = false
  omniboxValue.value = activeTab.value?.url ?? ''
}

function displayUrl(tab: { url: string; title: string }): string {
  return tab.title || tab.url || '新标签页'
}

// ── element pick → composer attachment ──
// The main process runs the overlay + screenshot; the picked element becomes a
// synthetic image MessageAttachment (screenshot + source URL + text excerpt) and
// is handed to the visible composer via a window event (BrowserPanel and the
// composer sit far apart in the tree). See docs/design/browser-v2.md §P2.
function pickedElementToAttachment(el: PickedWebElement): MessageAttachment {
  // el.image is a PNG data URL; MessageAttachment.base64Data is bare base64.
  const base64Data = el.image.includes(',') ? el.image.split(',')[1]! : ''
  // Only claim "screenshot is the visible part" when there actually is one —
  // a failed capture (base64Data === '') must not append a note about an image.
  const excerpt =
    el.clipped && el.excerpt && base64Data ? `${el.excerpt}\n[截图为可见部分]` : el.excerpt
  return {
    id: `web-element-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    fileName: 'web-element.png',
    mimeType: 'image/png',
    size: Math.floor(base64Data.length * 0.75),
    mediaType: 'image',
    base64Data,
    sourceUrl: el.sourceUrl,
    sourceTitle: el.sourceTitle,
    excerpt,
  }
}

async function togglePick(): Promise<void> {
  if (store.picking) {
    store.cancelPick()
    return
  }
  const el = await store.pickElement()
  if (!el) return
  window.dispatchEvent(
    new CustomEvent('onething:composer-attach', { detail: pickedElementToAttachment(el) }),
  )
}

// ── geometry: track the placeholder rect and push to the WebContentsView ──
// TODO(browser-geometry): rAF poll is the P0 stand-in — cheap (one rect read +
// compare) and correct through splitter translation, but should become
// event-driven once terminal P1 split-tree lands its bounds-recheck broadcast.
let rafId: number | null = null
let last = { x: -1, y: -1, width: -1, height: -1 }

function reconcileBounds(): void {
  const el = viewportRef.value
  if (el) {
    const r = el.getBoundingClientRect()
    const next = { x: r.left, y: r.top, width: r.width, height: r.height }
    if (
      next.x !== last.x || next.y !== last.y ||
      next.width !== last.width || next.height !== last.height
    ) {
      last = next
      void platformApi.setBrowserBounds?.(next)
    }
  }
  rafId = requestAnimationFrame(reconcileBounds)
}

// The native view should show only when this browser tab is the active
// workbench tab (①), the panel is expanded (② collapse), and no modal overlay
// floats over it (③ occlusion). The native layer can't be CSS-clipped, so:
//  - hide immediately on any of these going false (no jutting during collapse);
//  - delay showing by one animation (~200ms) so the panel finishes expanding
//    before the view reappears at full bounds.
const shouldShow = computed(() => props.active && props.revealed && !overlayPresence.present)
let showTimer: ReturnType<typeof setTimeout> | null = null
// True during the panel's expand transition (~160ms); showing the native view
// then would jut past the still-narrow panel (the frozen .workbench-slide rect
// is full-width). Tab-switch / overlay-close have no animation → show instantly.
let expanding = false

function applyVisibility(show: boolean): void {
  if (showTimer !== null) {
    clearTimeout(showTimer)
    showTimer = null
  }
  if (!show) {
    void platformApi.setBrowserVisible?.(false)
    return
  }
  const reveal = () => {
    last = { x: -1, y: -1, width: -1, height: -1 } // force a fresh setBounds
    void platformApi.setBrowserVisible?.(true)
  }
  if (expanding) showTimer = setTimeout(reveal, 220)
  else reveal()
}

// Declared BEFORE the shouldShow watch so, on a reveal edge, `expanding` is set
// before applyVisibility reads it (same-flush watchers run in creation order).
watch(
  () => props.revealed,
  (revealed, prev) => {
    if (revealed && !prev) {
      expanding = true
      setTimeout(() => {
        expanding = false
      }, 220)
    }
  },
)
watch(shouldShow, applyVisibility)

onMounted(async () => {
  await store.ensureLoaded()
  if (store.tabs.length === 0) await store.openTab()
  applyVisibility(shouldShow.value)
  rafId = requestAnimationFrame(reconcileBounds)
})

onBeforeUnmount(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
  if (showTimer !== null) clearTimeout(showTimer)
  void platformApi.setBrowserVisible?.(false)
})
</script>

<template>
  <section class="browser-panel">
    <!-- ① tab strip -->
    <div class="bp-tabstrip">
      <button
        v-for="tab in store.tabs"
        :key="tab.id"
        class="bp-tab"
        :class="{ active: tab.id === store.activeTabId }"
        type="button"
        @click="store.selectTab(tab.id)"
      >
        <img
          v-if="tab.favicon"
          class="bp-favicon"
          :src="tab.favicon"
          alt=""
        >
        <Globe
          v-else
          class="bp-favicon-fallback"
          :size="12"
          :stroke-width="2"
          aria-hidden="true"
        />
        <span class="bp-tab-title">{{ displayUrl(tab) }}</span>
        <span
          class="bp-tab-close"
          role="button"
          aria-label="关闭标签"
          @click.stop="store.closeTab(tab.id)"
        >
          <X :size="12" :stroke-width="2" aria-hidden="true" />
        </span>
      </button>
      <button
        class="bp-tab-add"
        type="button"
        aria-label="新建标签"
        @click="store.openTab()"
      >
        <Plus :size="15" :stroke-width="2" aria-hidden="true" />
      </button>
    </div>

    <!-- ② nav + omnibox -->
    <div class="bp-navrow">
      <button
        class="bp-iconbtn"
        type="button"
        aria-label="后退"
        :disabled="!activeTab?.canGoBack"
        @click="store.goBack()"
      >
        <ArrowLeft :size="16" :stroke-width="2" aria-hidden="true" />
      </button>
      <button
        class="bp-iconbtn"
        type="button"
        aria-label="前进"
        :disabled="!activeTab?.canGoForward"
        @click="store.goForward()"
      >
        <ArrowRight :size="16" :stroke-width="2" aria-hidden="true" />
      </button>
      <button
        class="bp-iconbtn"
        type="button"
        :aria-label="activeTab?.loading ? '停止' : '刷新'"
        @click="activeTab?.loading ? store.stop() : store.reload()"
      >
        <Square v-if="activeTab?.loading" :size="14" :stroke-width="2.2" aria-hidden="true" />
        <RotateCw v-else :size="15" :stroke-width="2" aria-hidden="true" />
      </button>

      <form class="bp-omnibox" @submit.prevent="submitOmnibox">
        <Lock
          v-if="isHttps"
          class="bp-lock"
          :size="12"
          :stroke-width="2.2"
          aria-hidden="true"
        />
        <Globe
          v-else
          class="bp-lock insecure"
          :size="12"
          :stroke-width="2.2"
          aria-hidden="true"
        />
        <input
          v-model="omniboxValue"
          class="bp-url"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="搜索或输入网址"
          @focus="onOmniboxFocus"
          @blur="onOmniboxBlur"
        >
      </form>

      <button
        class="bp-iconbtn bp-pick"
        :class="{ active: store.picking }"
        type="button"
        :aria-label="store.picking ? '取消拾取' : '拾取元素带入对话'"
        :title="store.picking ? '取消拾取（Esc）' : '拾取页面元素带入对话'"
        :disabled="!activeTab"
        @click="togglePick"
      >
        <Crosshair :size="15" :stroke-width="2" aria-hidden="true" />
      </button>
    </div>

    <!-- ③ viewport placeholder (WebContentsView overlays this rect) -->
    <div class="bp-viewport" ref="viewportRef">
      <div v-if="activeTab?.crashed" class="bp-crash">
        <div class="bp-crash-legend">页面已崩溃</div>
        <div class="bp-crash-msg">该标签的渲染进程意外退出。</div>
        <button class="bp-crash-reload" type="button" @click="store.reload()">
          重新加载
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.browser-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--ui-surface-panel-bg);
}

/* ① tab strip */
.bp-tabstrip {
  display: flex;
  align-items: stretch;
  height: 34px;
  padding-left: 6px;
  background: var(--ui-tab-bar-surface-bg);
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border) 55%, transparent);
  overflow-x: auto;
  scrollbar-width: none;
}
.bp-tabstrip::-webkit-scrollbar { display: none; }
.bp-tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 190px;
  padding: 0 10px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg);
  font-size: 12.5px;
  cursor: default;
  flex: 0 0 auto;
}
.bp-tab::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 0;
  border-bottom: 1.5px dotted transparent;
}
.bp-tab:hover { color: var(--ui-text-secondary-fg); }
.bp-tab:hover::after { border-bottom-color: color-mix(in srgb, var(--ui-text-muted-fg) 75%, transparent); }
.bp-tab.active { color: var(--ui-text-primary-fg); }
.bp-tab.active::after { border-bottom: 1.5px solid var(--ui-accent-primary-fg); }
.bp-favicon { width: 13px; height: 13px; border-radius: 3px; flex: none; }
.bp-favicon-fallback { color: var(--ui-text-faint-fg); flex: none; }
.bp-tab-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bp-tab-close {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  color: var(--ui-text-faint-fg);
  opacity: 0;
  transition: opacity 0.12s;
}
.bp-tab:hover .bp-tab-close { opacity: 1; }
.bp-tab-close:hover { color: var(--ui-accent-primary-fg); }
.bp-tab-add {
  display: grid;
  place-items: center;
  width: 30px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg);
  cursor: pointer;
  flex: none;
}
.bp-tab-add:hover { color: var(--ui-text-primary-fg); }

/* ② nav + omnibox */
.bp-navrow {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border) 55%, transparent);
}
.bp-iconbtn {
  position: relative;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted-fg);
  cursor: pointer;
  flex: none;
}
.bp-iconbtn::after {
  content: '';
  position: absolute;
  left: 5px;
  right: 5px;
  bottom: 2px;
  border-bottom: 1.5px dotted transparent;
}
.bp-iconbtn:hover:not(:disabled) { color: var(--ui-text-primary-fg); }
.bp-iconbtn:hover:not(:disabled)::after { border-bottom-color: color-mix(in srgb, var(--ui-text-muted-fg) 75%, transparent); }
.bp-iconbtn:disabled { color: var(--ui-text-faint-fg); cursor: default; }
/* Pick mode active: ink-accent, matching the omnibox focus ring language. */
.bp-iconbtn.active { color: var(--ui-accent-primary-fg); }
.bp-iconbtn.active::after { border-bottom: 1.5px solid var(--ui-accent-primary-fg); }
.bp-omnibox {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 10px;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border) 52%, transparent);
  border-radius: var(--radius-xs);
  background: transparent;
}
.bp-omnibox:focus-within {
  border-color: var(--ui-accent-primary-fg);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ui-accent-primary-fg) 28%, transparent);
}
.bp-lock { color: var(--ui-status-success-fg); flex: none; }
.bp-lock.insecure { color: var(--ui-text-muted-fg); }
.bp-url {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ui-text-primary-fg);
}
.bp-url::placeholder { color: var(--ui-text-placeholder-fg); }

/* ③ viewport */
.bp-viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  background: var(--ui-surface-app-bg);
}
.bp-crash {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 6px;
  padding: 0 24px;
  border-left: 2px solid var(--ui-status-danger-fg);
  margin: 24px;
}
.bp-crash-legend {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--ui-status-danger-fg);
}
.bp-crash-msg { font-size: 13px; color: var(--ui-text-primary-fg); }
.bp-crash-reload {
  margin-top: 8px;
  padding: 5px 12px;
  border: 1px solid color-mix(in srgb, var(--ui-accent-primary-fg) 45%, transparent);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--ui-accent-primary-fg);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}
</style>
