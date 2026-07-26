<script setup lang="ts">
/**
 * Browser profiles settings — Chrome-style isolated logins for the embedded
 * browser. Source of truth is the main process (profiles.json); this panel is a
 * thin view over the browserProfiles mirror store. 画线风 per the settings
 * ledger idiom (no cards; state lives in the line). See docs/design/browser-v2.md.
 */
import { onMounted, ref } from 'vue'
import { Check } from 'lucide-vue-next'
import { useBrowserProfilesStore } from '@/stores/browserProfiles'

const store = useBrowserProfilesStore()
const newName = ref('')
const confirmingRemoveId = ref<string | null>(null)

onMounted(() => {
  void store.load()
})

async function addProfile(): Promise<void> {
  const name = newName.value.trim()
  if (!name) return
  await store.add(name)
  newName.value = ''
}

function onRemoveClick(id: string): void {
  if (confirmingRemoveId.value === id) {
    void store.remove(id)
    confirmingRemoveId.value = null
  } else {
    confirmingRemoveId.value = id
  }
}
</script>

<template>
  <div class="browser-settings">
    <header class="bs-header">
      <h2 class="bs-title">浏览器配置</h2>
      <p class="bs-sub">
        每个配置是一套独立的登录环境（cookie / 本地存储互不干扰），可分别登录不同的谷歌账号。
        切换配置会在浏览器面板重开一个干净的标签页；删除配置会清除该环境的登录数据。
      </p>
    </header>

    <div class="bs-ledger">
      <button
        v-for="p in store.profiles"
        :key="p.id"
        class="bs-row"
        :class="{ active: p.id === store.activeProfileId }"
        type="button"
        @click="store.switchTo(p.id)"
      >
        <span class="bs-dot" :class="{ on: p.id === store.activeProfileId }">
          <Check v-if="p.id === store.activeProfileId" :size="11" :stroke-width="3" aria-hidden="true" />
        </span>
        <span class="bs-name">{{ p.name }}</span>
        <span v-if="p.id === store.activeProfileId" class="bs-tag">当前</span>
        <span class="bs-spacer" />
        <span
          v-if="p.id !== 'default'"
          class="bs-remove"
          :class="{ confirming: confirmingRemoveId === p.id }"
          role="button"
          @click.stop="onRemoveClick(p.id)"
        >{{ confirmingRemoveId === p.id ? '确认删除？' : '删除' }}</span>
      </button>

      <div class="bs-add">
        <input
          v-model="newName"
          class="bs-add-input"
          type="text"
          spellcheck="false"
          placeholder="新配置名称（如：工作、个人）"
          @keydown.enter="addProfile"
        >
        <button class="bs-add-btn" type="button" :disabled="!newName.trim()" @click="addProfile">
          + 添加配置
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 画线风: no background fills, no radii on rows — state lives in the line. */
.browser-settings { display: flex; flex-direction: column; gap: 18px; }
.bs-header { display: flex; flex-direction: column; gap: 6px; }
.bs-title { margin: 0; font-size: 15px; font-weight: 600; color: var(--ui-text-primary-fg, var(--text)); }
.bs-sub {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--ui-text-muted-fg, var(--text-secondary));
  max-width: 56ch;
}

.bs-ledger { position: relative; display: flex; flex-direction: column; padding-left: 14px; }
.bs-ledger::before {
  content: '';
  position: absolute;
  left: 0; top: 4px; bottom: 4px;
  width: 1px;
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border)) 45%, transparent);
}

.bs-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 8px 9px 14px;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 45%, transparent);
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.bs-row::before {
  content: '';
  position: absolute;
  left: -14px; top: 50%;
  width: 10px; height: 1px;
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border)) 45%, transparent);
}
.bs-row:hover .bs-name { color: var(--ui-text-primary-fg, var(--text)); }

.bs-dot {
  display: grid;
  place-items: center;
  width: 16px; height: 16px;
  border-radius: 50%;
  border: 1.5px dashed color-mix(in srgb, var(--ui-text-faint-fg, var(--text-tertiary)) 70%, transparent);
  color: var(--ui-accent-primary-fg, var(--accent));
  flex: none;
}
.bs-dot.on { border: 1.5px solid var(--ui-accent-primary-fg, var(--accent)); }

.bs-name { font-size: 13.5px; color: var(--ui-text-secondary-fg, var(--text-secondary)); }
.bs-row.active .bs-name { color: var(--ui-text-primary-fg, var(--text)); font-weight: 500; }
.bs-tag {
  font-family: var(--font-mono, monospace);
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ui-accent-primary-fg, var(--accent));
}
.bs-spacer { flex: 1; }
.bs-remove {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--text-tertiary));
  opacity: 0;
  transition: opacity 0.12s, color 0.12s;
}
.bs-row:hover .bs-remove { opacity: 1; }
.bs-remove:hover,
.bs-remove.confirming { opacity: 1; color: var(--ui-status-danger-fg, #b3403a); text-decoration: underline; }

.bs-add {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 8px 4px 14px;
}
.bs-add::before {
  content: '';
  position: absolute;
  left: -14px; top: 20px;
  width: 10px; height: 1px;
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border)) 45%, transparent);
}
.bs-add-input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border)) 52%, transparent);
  border-radius: var(--radius-xs, 4px);
  background: transparent;
  font-size: 12.5px;
  color: var(--ui-text-primary-fg, var(--text));
  outline: none;
}
.bs-add-input:focus {
  border-color: var(--ui-accent-primary-fg, var(--accent));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 28%, transparent);
}
.bs-add-btn {
  font-family: var(--font-mono, monospace);
  font-size: 11.5px;
  color: var(--ui-accent-primary-fg, var(--accent));
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 2px;
  white-space: nowrap;
}
.bs-add-btn:hover:not(:disabled) { text-decoration: underline; }
.bs-add-btn:disabled { color: var(--ui-text-faint-fg, var(--text-tertiary)); cursor: default; }
</style>
