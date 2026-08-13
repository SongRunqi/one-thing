<template>
  <SettingsSection
    title="Connected Directories"
    description="加入的目录可被 @ 引用、搜索、直接编辑(免逐次确认)、并自动发现其中的技能(SKILL.md)。"
  >
    <SettingsGroup>
      <div class="connected-dirs">
        <div
          v-if="directories.length > 0"
          class="directory-list"
        >
          <div
            v-for="dir in directories"
            :key="dir"
            :class="['directory-item', { 'is-missing': missingDirs.has(dir) }]"
          >
            <span class="directory-path">{{ dir }}</span>
            <span
              v-if="missingDirs.has(dir)"
              class="directory-missing"
            >目录不存在</span>
            <Button
              unstyled
              class="remove-btn"
              native-type="button"
              :aria-label="`Remove ${dir}`"
              @click="removeDirectory(dir)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line
                  x1="18"
                  y1="6"
                  x2="6"
                  y2="18"
                />
                <line
                  x1="6"
                  y1="6"
                  x2="18"
                  y2="18"
                />
              </svg>
            </Button>
          </div>
        </div>
        <div
          v-else
          class="empty-hint"
        >
          还没有接入目录。加入之前,这五项能力的行为与没有这个功能时完全一致。
        </div>

        <Button
          unstyled
          class="add-btn"
          native-type="button"
          :disabled="!canChooseLocalDirectory"
          @click="addDirectory"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line
              x1="12"
              y1="5"
              x2="12"
              y2="19"
            />
            <line
              x1="5"
              y1="12"
              x2="19"
              y2="12"
            />
          </svg>
          添加目录
        </Button>
      </div>
    </SettingsGroup>
  </SettingsSection>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from '@/components/common/Button.vue'
import type { AppSettings } from '@/types'
import { platformApi } from '@/platform'
import { SettingsGroup, SettingsSection } from './settings-primitives'

const props = defineProps<{
  settings: AppSettings
}>()

const emit = defineEmits<{
  'update:settings': [settings: AppSettings]
}>()

const directories = computed(() => props.settings.tools?.connectedDirectories ?? [])

const canChooseLocalDirectory = computed(() => platformApi.capabilities.localFileSystem)

/**
 * 不存在的目录只标灰,不自动删。盘可以后挂、目录可以后建 —— 替用户删掉一条他
 * 自己写下的配置,比让他看见一行灰字要糟糕得多。
 */
const missingDirs = ref(new Set<string>())

async function refreshMissing(dirs: readonly string[]): Promise<void> {
  if (!platformApi.capabilities.localFileSystem) {
    missingDirs.value = new Set()
    return
  }
  const missing = new Set<string>()
  await Promise.all(dirs.map(async dir => {
    try {
      const result = await platformApi.statPath(dir)
      if (!result.success || result.type !== 'directory') missing.add(dir)
    } catch {
      missing.add(dir)
    }
  }))
  missingDirs.value = missing
}

watch(directories, dirs => { void refreshMissing(dirs) }, { immediate: true })

function commit(next: string[]): void {
  emit('update:settings', {
    ...props.settings,
    tools: { ...props.settings.tools, connectedDirectories: next },
  })
}

async function addDirectory(): Promise<void> {
  try {
    const result = await platformApi.showOpenDialog({
      title: '选择要接入的目录',
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return
    const picked = result.filePaths[0]
    if (directories.value.includes(picked)) return
    commit([...directories.value, picked])
  } catch {
    // 对话框打不开(如 web 宿主):保持现状,不留下半个状态。
  }
}

function removeDirectory(dir: string): void {
  commit(directories.value.filter(item => item !== dir))
}
</script>

<style scoped>
.connected-dirs {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
}

.directory-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  margin-bottom: 12px;
}

.directory-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
  background: transparent;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--settings-rule-soft, var(--ui-border-subtle-border, var(--ui-border-default-border))) 55%, transparent);
}

.directory-item.is-missing .directory-path {
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  text-decoration: line-through;
  text-decoration-color: var(--settings-rule, var(--ui-border-default-border));
}

.directory-path {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--settings-ink, var(--ui-text-primary-fg));
  font-family: var(--font-mono, monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.directory-missing {
  flex-shrink: 0;
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  color: var(--ui-status-warning-fg, var(--ui-text-muted-fg));
}

.remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 4px;
  background: transparent;
  border: none;
  border-radius: 0;
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  cursor: pointer;
  transition: color var(--duration-normal);
}

.remove-btn:hover {
  background: transparent;
  color: var(--ui-status-danger-fg);
}

.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
  background: transparent;
  border: 0;
  cursor: pointer;
  transition: color var(--duration-normal);
}

.add-btn:hover:not(:disabled) {
  background: transparent;
  color: var(--settings-ink, var(--ui-text-primary-fg));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--settings-accent, var(--ui-accent-primary-fg));
}

.add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty-hint {
  width: 100%;
  font-size: 12px;
  color: var(--settings-ink-4, var(--ui-text-faint-fg, var(--ui-text-muted-fg)));
  padding: 10px 12px;
  background: transparent;
  border: 1px dashed var(--settings-rule, var(--ui-border-default-border));
  border-radius: 0;
  margin-bottom: 12px;
}
</style>
