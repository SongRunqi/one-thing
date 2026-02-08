<template>
  <Transition name="slide-down">
    <div
      v-if="showNotification"
      class="update-notification"
    >
      <div class="notification-content">
        <div class="notification-icon">
          🎉
        </div>
        <div class="notification-info">
          <h3 class="notification-title">
            发现新版本 {{ updateInfo?.version }}
          </h3>
          <p class="notification-description">
            当前版本: v{{ currentVersion }}
          </p>
        </div>
        <div class="notification-actions">
          <button
            class="btn-secondary"
            @click="handleLater"
          >
            稍后提醒
          </button>
          <button
            class="btn-secondary"
            @click="handleIgnore"
          >
            忽略此版本
          </button>
          <button
            class="btn-primary"
            @click="handleViewUpdate"
          >
            查看更新
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const showNotification = ref(false)
const currentVersion = ref('')
const updateInfo = ref<{
  version: string
  releaseUrl: string
  releaseNotes: string
  publishedAt: string
} | null>(null)

let unsubscribe: (() => void) | null = null

onMounted(async () => {
  // Get current version
  const status = await window.electronAPI.updaterGetStatus()
  currentVersion.value = status.currentVersion

  // Listen for new version events
  unsubscribe = window.electronAPI.onUpdaterNewVersion((info) => {
    updateInfo.value = info
    
    // Check if this version was ignored
    const ignoredVersion = localStorage.getItem('ignoredUpdateVersion')
    if (ignoredVersion === info.version) {
      console.log('[UpdateNotification] Version already ignored:', info.version)
      return
    }

    showNotification.value = true
  })
})

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
  }
})

function handleViewUpdate() {
  window.electronAPI.updaterOpenRelease()
  showNotification.value = false
}

function handleLater() {
  showNotification.value = false
}

function handleIgnore() {
  if (updateInfo.value) {
    localStorage.setItem('ignoredUpdateVersion', updateInfo.value.version)
  }
  showNotification.value = false
}
</script>

<style scoped>
.update-notification {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  background: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.notification-content {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.notification-icon {
  font-size: 32px;
  flex-shrink: 0;
}

.notification-info {
  flex: 1;
  min-width: 0;
}

.notification-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.notification-description {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.notification-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.btn-primary,
.btn-secondary {
  padding: 6px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}

.btn-secondary {
  background: var(--color-background);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover {
  background: var(--color-background-mute);
}

/* Slide down animation */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from {
  transform: translateY(-100%);
  opacity: 0;
}

.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
