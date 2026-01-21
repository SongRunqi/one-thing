<template>
  <Transition name="slide-up">
    <div v-if="updatesStore.shouldShowNotification" class="update-notification">
      <!-- Update Available -->
      <div v-if="!updatesStore.downloading && !updatesStore.downloaded" class="notification-content">
        <div class="notification-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <div class="notification-text">
          <div class="notification-title">Update Available</div>
          <div class="notification-version">Version {{ updatesStore.updateInfo?.version }}</div>
        </div>
        <div class="notification-actions">
          <button class="btn-dismiss" @click="updatesStore.dismiss">Later</button>
          <button class="btn-primary" @click="updatesStore.downloadUpdate">Download</button>
        </div>
      </div>

      <!-- Downloading -->
      <div v-else-if="updatesStore.downloading" class="notification-content downloading">
        <div class="notification-icon spinning">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
        <div class="notification-text">
          <div class="notification-title">Downloading Update...</div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${updatesStore.downloadPercent}%` }"></div>
          </div>
          <div class="notification-version">{{ Math.round(updatesStore.downloadPercent) }}%</div>
        </div>
      </div>

      <!-- Downloaded -->
      <div v-else-if="updatesStore.downloaded" class="notification-content">
        <div class="notification-icon success">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <div class="notification-text">
          <div class="notification-title">Update Ready</div>
          <div class="notification-version">Restart to install v{{ updatesStore.updateInfo?.version }}</div>
        </div>
        <div class="notification-actions">
          <button class="btn-dismiss" @click="updatesStore.dismiss">Later</button>
          <button class="btn-primary" @click="updatesStore.installUpdate">Restart Now</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useUpdatesStore } from '@/stores/updates'

const updatesStore = useUpdatesStore()

onMounted(() => {
  updatesStore.setupListeners()
  updatesStore.fetchStatus()
})

onUnmounted(() => {
  updatesStore.cleanupListeners()
})
</script>

<style scoped>
.update-notification {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  min-width: 300px;
  max-width: 400px;
}

.notification-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
}

.notification-content.downloading {
  flex-direction: column;
  align-items: stretch;
}

.notification-content.downloading .notification-icon {
  align-self: flex-start;
}

.notification-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.notification-icon.success {
  background: #22c55e;
}

.notification-icon.spinning svg {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.notification-text {
  flex: 1;
  min-width: 0;
}

.notification-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 2px;
}

.notification-version {
  font-size: 12px;
  color: var(--muted);
}

.progress-bar {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
  margin: 8px 0 4px;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.notification-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.btn-dismiss {
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-dismiss:hover {
  background: var(--hover);
  color: var(--text);
}

.btn-primary {
  padding: 6px 14px;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover {
  filter: brightness(1.1);
}

/* Transition */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>
