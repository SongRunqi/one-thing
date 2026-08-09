<template>
  <div class="tab-content">
    <section class="settings-section">
      <h3 class="section-title">
        Installed Plugins
      </h3>
      <p class="section-desc">
        Plugins extend onething with custom tools, commands, and event handlers.
        Plugins live in <code>~/.onething/plugins/</code>
      </p>

      <!-- Loading -->
      <div
        v-if="loading"
        class="loading-row"
      >
        <div class="spinner" />
        <span>Loading plugins...</span>
      </div>

      <!-- Error -->
      <ErrorNote
        v-else-if="error"
        variant="block"
        :message="error"
      >
        <template #actions>
          <Button
            unstyled
            class="btn-sm"
            @click="loadPlugins"
          >
            Retry
          </Button>
        </template>
      </ErrorNote>

      <!-- Empty -->
      <div
        v-else-if="plugins.length === 0"
        class="empty-state"
      >
        <p>No plugins installed.</p>
        <p class="hint">
          Create a plugin in <code>~/.onething/plugins/&lt;name&gt;/plugin-entry.js</code>
          or symlink <code>sample-plugins/</code> directories, then click <strong>Refresh</strong>.
        </p>
        <Button
          unstyled
          class="btn-sm"
          @click="refreshPlugins"
        >
          <RefreshCw :size="13" />
          <span>Refresh</span>
        </Button>
      </div>

      <!-- Plugin list -->
      <div
        v-else
        class="settings-card plugin-list"
      >
        <div class="plugin-list-header">
          <span class="plugin-count">{{ plugins.length }} plugin{{ plugins.length > 1 ? 's' : '' }}</span>
          <Button
            unstyled
            class="btn-sm refresh-btn"
            @click="refreshPlugins"
          >
            <RefreshCw :size="13" />
            <span>Refresh</span>
          </Button>
        </div>
        <div
          v-for="plugin in plugins"
          :key="plugin.id"
          class="plugin-item"
          :class="{ disabled: !plugin.enabled }"
        >
          <div class="plugin-body">
            <div class="plugin-header">
              <div class="plugin-name-row">
                <span class="plugin-name">{{ plugin.name }}</span>
                <span class="plugin-version">v{{ plugin.version }}</span>
                <span
                  class="status-badge"
                  :class="statusOf(plugin).tone"
                >
                  {{ statusOf(plugin).label }}
                </span>
              </div>
              <p
                v-if="plugin.description"
                class="plugin-desc"
              >
                {{ plugin.description }}
              </p>
              <ErrorNote
                v-if="plugin.error"
                size="sm"
                :message="plugin.error"
              />
              <!-- 运行期健康:加载成功之后才出现的失败(钩子超时、事件 handler
                   抛错、熔断自动禁用)。之前这类错只进 console,卡片永远 Active。 -->
              <ErrorNote
                v-if="runtimeFault(plugin)"
                size="sm"
                :message="runtimeFault(plugin)"
              />
              <div class="plugin-meta">
                <span
                  v-if="plugin.author"
                  class="meta-tag"
                >by {{ plugin.author }}</span>
                <span
                  v-if="plugin.source === 'builtin'"
                  class="meta-tag builtin"
                >Built-in</span>
                <!-- "有更新"徽标:checkPluginUpdates 的数据源是市场索引。 -->
                <span
                  v-if="updateOffers.has(plugin.id)"
                  class="meta-tag update-available"
                >v{{ updateOffers.get(plugin.id)!.latest }} available</span>
                <span
                  v-if="plugin.commands.length"
                  class="meta-tag"
                >
                  {{ plugin.commands.length }} command{{ plugin.commands.length > 1 ? 's' : '' }}
                  <span class="cmd-list">({{ plugin.commands.join(', ') }})</span>
                </span>
                <span class="meta-tag path">{{ plugin.id }}</span>
              </div>
              <!-- 声明先于代码:manifest 的 contributes 摘要。宿主不执行一行
                   插件代码就能说出它要贡献什么(消费者在 R3/R5)。 -->
              <div
                v-if="contributesSummary(plugin).length"
                class="plugin-meta contributes"
              >
                <span
                  v-for="item in contributesSummary(plugin)"
                  :key="item"
                  class="meta-tag declares"
                >{{ item }}</span>
              </div>
            </div>

            <!-- 配置区(R3)。schema 单源在 manifest,存储与校验在宿主 ——
               所以**未启用的插件也能配**,这一块不依赖插件代码跑起来。 -->
            <div
              v-if="hasConfigArea(plugin)"
              class="plugin-config"
            >
              <div class="plugin-config-head">
                <span class="plugin-config-title">{{ plugin.configTitle || 'Configuration' }}</span>
                <span
                  v-if="!isConfigEditable(plugin)"
                  class="meta-tag readonly"
                >{{ plugin.configValuesAreDefaults ? 'read-only on web — defaults shown' : 'read-only on web' }}</span>
              </div>
              <p
                v-if="!isConfigEditable(plugin) && plugin.configValuesAreDefaults"
                class="plugin-config-note"
              >
                These are the schema defaults, not this plugin's values on your desktop — plugins run on the
                desktop host only, so the values there may differ.
              </p>

              <ErrorNote
                v-if="plugin.configUnsupportedReasons?.length"
                size="sm"
                :message="`This plugin's settings schema is not supported: ${plugin.configUnsupportedReasons.join('; ')}`"
              />

              <SettingsGroup v-else>
                <template
                  v-for="field in plugin.configFields"
                  :key="field.key"
                >
                  <!-- boolean 走 SettingRow:标签+描述在左、开关在右,与其余 tab 对齐。 -->
                  <SettingRow
                    v-if="field.control === 'switch'"
                    :label="field.label + (field.required ? ' *' : '')"
                    :description="fieldError(plugin, field.key) || field.hint"
                  >
                    <Switch
                      variant="ledger"
                      :model-value="Boolean(draftFor(plugin)[field.key])"
                      :disabled="!isConfigEditable(plugin)"
                      :aria-label="field.label"
                      @update:model-value="setDraft(plugin, field.key, Boolean($event))"
                    />
                  </SettingRow>

                  <SettingsField
                    v-else
                    :label="field.label + (field.required ? ' *' : '')"
                    :hint="fieldError(plugin, field.key) || field.hint"
                  >
                    <InputNumber
                      v-if="field.control === 'number'"
                      :model-value="Number(draftFor(plugin)[field.key])"
                      :min="field.minimum"
                      :max="field.maximum"
                      :step="field.integer ? 1 : undefined"
                      :disabled="!isConfigEditable(plugin)"
                      :aria-label="field.label"
                      @update:model-value="setDraft(plugin, field.key, Number($event))"
                    />
                    <Select
                      v-else-if="field.control === 'select'"
                      variant="ledger"
                      size="small"
                      teleported
                      fit-input-width
                      :model-value="String(draftFor(plugin)[field.key] ?? '')"
                      :options="field.options || []"
                      :disabled="!isConfigEditable(plugin)"
                      :aria-label="field.label"
                      @update:model-value="setDraft(plugin, field.key, String($event))"
                    />
                    <!-- string-list 编辑期间只维护**原始文本**:每敲一键就
                         split+trim+filter 再 join 回去是有损往返 —— 键入逗号
                         当场被自己吃掉,根本打不出第二项。blur 时才 parse。 -->
                    <Input
                      v-else-if="field.control === 'string-list'"
                      :model-value="stringListDraft(plugin, field.key)"
                      :disabled="!isConfigEditable(plugin)"
                      :aria-label="field.label"
                      placeholder="Comma separated"
                      @update:model-value="setStringListText(plugin, field.key, String($event))"
                      @blur="commitStringList(plugin, field.key)"
                    />
                    <Input
                      v-else
                      :model-value="String(draftFor(plugin)[field.key] ?? '')"
                      :disabled="!isConfigEditable(plugin)"
                      :aria-label="field.label"
                      @update:model-value="setDraft(plugin, field.key, String($event))"
                    />
                  </SettingsField>
                </template>
              </SettingsGroup>

              <ErrorNote
                v-if="generalErrors(plugin).length"
                size="sm"
                :message="generalErrors(plugin).join('; ')"
              />

              <div
                v-if="isConfigEditable(plugin) && plugin.configFields?.length"
                class="plugin-config-actions"
              >
                <Button
                  unstyled
                  class="btn-sm"
                  :disabled="!isDirty(plugin) || savingPlugins.has(plugin.id)"
                  @click="saveConfig(plugin)"
                >
                  {{ savingPlugins.has(plugin.id) ? 'Saving…' : 'Save' }}
                </Button>
                <Button
                  v-if="isDirty(plugin)"
                  unstyled
                  class="btn-sm"
                  @click="resetDraft(plugin)"
                >
                  Reset
                </Button>
                <span
                  v-if="savedPlugins.has(plugin.id)"
                  class="plugin-config-saved"
                >Saved</span>
              </div>
            </div>
          </div>

          <!-- 启用开关是 .plugin-item 的**直接子节点**:它靠
               `.plugin-item{align-items:flex-start}` 锚在卡片右上角。挪进
               .plugin-body 里(配置区之后)会让它掉到底部左侧,那条对齐规则
               和 .plugin-toggle{flex-shrink:0} 一起变成死样式。 -->
          <div class="plugin-toggle">
            <Switch
              variant="ledger"
              :model-value="plugin.enabled"
              :disabled="uninstallingPlugins.has(plugin.id)"
              :aria-label="`Enable ${plugin.name}`"
              @update:model-value="togglePlugin(plugin)"
            />
            <!-- 有更新才出现;无 npm 时置灰(裁决 8)。 -->
            <Button
              v-if="updateOffers.has(plugin.id)"
              unstyled
              class="btn-sm update-btn"
              :disabled="npmAvailable === false || updatingPlugins.has(plugin.id)"
              :title="npmAvailable === false ? 'npm is not available on this machine' : `Update to v${updateOffers.get(plugin.id)!.latest}`"
              @click="updatePlugin(plugin)"
            >
              {{ updatingPlugins.has(plugin.id) ? 'Updating…' : 'Update' }}
            </Button>
            <!-- 仅用户插件可卸载:内置插件与 app 同一份构建,没有"源目录"可删。 -->
            <Button
              v-if="canUninstall(plugin)"
              unstyled
              class="btn-sm uninstall-btn"
              :disabled="uninstallingPlugins.has(plugin.id)"
              @click="confirmUninstall(plugin)"
            >
              {{ uninstallingPlugins.has(plugin.id) ? 'Uninstalling…' : 'Uninstall' }}
            </Button>
          </div>
        </div>
      </div>
    </section>

    <!-- Market(P3):声明先于代码在分发环节的延伸 —— 装前确认看到的就是
         manifest 的 contributes/permissions,不是营销文案。断网回上次缓存并明示过期。 -->
    <section class="settings-section">
      <h3 class="section-title">
        Plugin Market
      </h3>
      <p class="section-desc">
        The official market. What you review before installing is the plugin's manifest —
        its declared contributions and permissions.
      </p>

      <!-- 连缓存都没有才是真失败;有缓存时主进程走 success+stale,不会到这。 -->
      <ErrorNote
        v-if="marketError && marketEntries.length === 0"
        variant="block"
        size="sm"
        :message="marketError"
      >
        <template #actions>
          <Button
            unstyled
            class="btn-sm"
            @click="loadMarket(true)"
          >
            Retry
          </Button>
        </template>
      </ErrorNote>

      <template v-else-if="marketEntries.length || !marketLoading">
        <div class="market-toolbar">
          <Input
            v-model="marketQuery"
            placeholder="Search by name, description, or author"
            aria-label="Search the plugin market"
          />
          <Button
            unstyled
            class="btn-sm refresh-btn"
            :disabled="marketLoading"
            @click="loadMarket(true)"
          >
            <RefreshCw :size="13" />
            <span>{{ marketLoading ? 'Refreshing…' : 'Refresh' }}</span>
          </Button>
        </div>
        <p
          v-if="marketStale"
          class="hint market-stale"
        >
          Couldn't refresh{{ marketStaleReason ? ` (${marketStaleReason})` : '' }} —
          showing the index fetched at {{ marketFetchedAtText }} (may be outdated).
        </p>

        <div
          v-if="filteredMarket.length === 0"
          class="empty-state"
        >
          <p>No plugins match your search.</p>
        </div>

        <div
          v-else
          class="settings-card plugin-list market-list"
        >
          <div
            v-for="entry in filteredMarket"
            :key="entry.id"
            class="plugin-item"
          >
            <div class="plugin-body">
              <div class="plugin-header">
                <div class="plugin-name-row">
                  <span class="plugin-name">{{ entry.id }}</span>
                  <span class="plugin-version">v{{ entry.version }}</span>
                  <span
                    v-if="entry.installedVersion && !entry.hasUpdate"
                    class="status-badge loaded"
                  >Installed</span>
                  <span
                    v-if="entry.hasUpdate"
                    class="status-badge warning"
                  >v{{ entry.version }} available</span>
                </div>
                <p
                  v-if="entry.description"
                  class="plugin-desc"
                >
                  {{ entry.description }}
                </p>
                <div class="plugin-meta">
                  <span
                    v-if="entry.author"
                    class="meta-tag"
                  >by {{ entry.author }}</span>
                  <span class="meta-tag">{{ entry.pkg }}</span>
                </div>
                <ErrorNote
                  v-if="entry.versionBlockedReason"
                  size="sm"
                  :message="`Cannot install: ${entry.versionBlockedReason}`"
                />

                <!-- 装前确认:用户点头前看到的就是 manifest -->
                <div
                  v-if="confirmingMarket === entry.id"
                  class="market-confirm"
                >
                  <p class="market-confirm-title">
                    This plugin declares:
                  </p>
                  <ul class="market-confirm-list">
                    <li
                      v-for="item in marketDeclares(entry)"
                      :key="item"
                    >
                      {{ item }}
                    </li>
                    <li v-if="marketDeclares(entry).length === 0">
                      No contributions declared.
                    </li>
                  </ul>
                  <p
                    v-if="entry.integrity"
                    class="hint"
                  >
                    Integrity (sha512) will be verified against the market index.
                  </p>
                  <p
                    v-else
                    class="hint"
                  >
                    No integrity hash published — verification will be skipped.
                  </p>
                  <div class="market-confirm-actions">
                    <Button
                      unstyled
                      class="btn-sm install-btn"
                      :disabled="installingMarket.has(entry.id)"
                      @click="installFromMarket(entry)"
                    >
                      {{ installingMarket.has(entry.id) ? 'Installing…' : 'Confirm install' }}
                    </Button>
                    <Button
                      unstyled
                      class="btn-sm"
                      @click="confirmingMarket = null"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div class="plugin-toggle">
              <Button
                v-if="entry.installedVersion && entry.hasUpdate"
                unstyled
                class="btn-sm update-btn"
                :disabled="npmAvailable === false || updatingPlugins.has(entry.id)"
                :title="npmAvailable === false ? 'npm is not available on this machine' : `Update to v${entry.version}`"
                @click="updateMarketPlugin(entry)"
              >
                {{ updatingPlugins.has(entry.id) ? 'Updating…' : 'Update' }}
              </Button>
              <Button
                v-else-if="!entry.installedVersion"
                unstyled
                class="btn-sm install-btn"
                :disabled="npmAvailable === false || Boolean(entry.versionBlockedReason) || installingMarket.has(entry.id)"
                :title="npmAvailable === false
                  ? 'npm is not available on this machine'
                  : (entry.versionBlockedReason ?? 'Review the manifest, then install')"
                @click="confirmingMarket = confirmingMarket === entry.id ? null : entry.id"
              >
                Install
              </Button>
            </div>
          </div>
        </div>
      </template>

      <div
        v-else
        class="loading-row"
      >
        <div class="spinner" />
        <span>Loading the market…</span>
      </div>
    </section>

    <!-- Install(P1:npm 形态命令链;先吃 file: 开发通道与本地 tarball) -->
    <section class="settings-section">
      <h3 class="section-title">
        Install Plugin
      </h3>
      <div class="settings-card">
        <div class="card-row">
          <!-- 裁决 8:v1 依赖本机 npm —— 无 npm 置灰并说明,而不是点了才炸。 -->
          <ErrorNote
            v-if="npmAvailable === false"
            variant="block"
            size="sm"
            message="npm is not available on this machine. Plugin installation and updates need a local npm (v1 targets developers); install Node.js/npm and restart the app."
          />
          <div class="install-form">
            <Input
              v-model="installPkg"
              placeholder="Package name (e.g. plan-status or @org/plan-status)"
              :disabled="npmAvailable === false || installing"
              aria-label="Plugin package name"
            />
            <Input
              v-model="installPath"
              placeholder="Local path — plugin directory or .tgz (file: dev channel)"
              :disabled="npmAvailable === false || installing"
              aria-label="Local plugin path"
            />
            <Button
              unstyled
              class="btn-sm install-btn"
              :disabled="!installPkg.trim() || !installPath.trim() || npmAvailable === false || installing"
              @click="installPlugin"
            >
              {{ installing ? 'Installing…' : 'Install' }}
            </Button>
          </div>
          <p class="hint install-hint">
            Installs run through npm with lifecycle scripts disabled (<code>--ignore-scripts</code>);
            packages must ship fully bundled. Dropping a folder into <code>~/.onething/plugins/</code>
            no longer installs anything — since 2026-08-09 the npm ledger is the only way in.
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import Input from '@/components/common/Input.vue'
import InputNumber from '@/components/common/InputNumber.vue'
import Select from '@/components/common/Select.vue'
import Switch from '@/components/common/Switch.vue'
import { SettingRow, SettingsField, SettingsGroup } from './settings-primitives'
import type { PluginConfigErrorDetail, PluginConfigFieldDescriptor } from '@shared/ipc/plugins.js'
import { ref, computed, onBeforeUnmount, onMounted } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { platformApi } from '@/platform'
import { isUiSlotTruncated } from '@/workspace/ui-anchor-registry'
import { useConfirm } from '@/composables/useConfirm'
import { toast } from '@/composables/useToast'

interface PluginInfo {
  id: string
  source?: 'builtin' | 'user'
  name: string
  version: string
  description: string
  author: string
  loaded: boolean
  enabled: boolean
  commands: string[]
  error: string
  dirPath: string
  healthStatus?: string
  healthFailures?: number
  healthReason?: string
  /** 降级中的界面(R7):某个面板不可用,而插件其余能力照常。 */
  degradedSurfaces?: Array<{ surface: string; reason: string }>
  minAppVersion?: string
  requestActions?: string[]
  contributes?: {
    commands?: string[]
    panels?: Array<{ id: string; label: string }>
    /** `lifetime` 是消息态落盘的闸门声明(见 slotIsPersistent);市场那条路是 manifest 原文。 */
    uiSlots?: Array<{ anchor: string; id: string; label: string; unsupported?: boolean; lifetime?: string }>
    hasSettingsSchema?: boolean
    permissions?: string[]
    activationEvents?: string[]
  }
  configFields?: PluginConfigFieldDescriptor[]
  configTitle?: string
  configValues?: Record<string, unknown>
  configUnsupportedReasons?: string[]
  configValuesAreDefaults?: boolean
  configEditable?: boolean
}

/**
 * 配置区草稿。
 *
 * 编辑先落在本地草稿上、Save 才过 IPC ——「保存即生效」而不是「每敲一个字符就
 * 写一次盘并推一遍 onChange」。
 */
const drafts = ref<Record<string, Record<string, unknown>>>({})
const configErrors = ref<Record<string, PluginConfigErrorDetail[]>>({})
/**
 * string-list 的编辑期文本态。
 *
 * 只存原始字符串:每敲一键就 split+trim+filter 再 join 回去是有损往返,
 * 输入的逗号会被自己吃掉,第二项永远打不出来。blur 时才 parse 成数组。
 */
const stringListText = ref<Record<string, string>>({})
// per-plugin 而不是单个 id:两个插件同时保存时,单值状态会互相顶掉。
const savingPlugins = ref<Set<string>>(new Set())
const savedPlugins = ref<Set<string>>(new Set())
const savedTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * 可编辑性以**投影字段**为准,环境只作缺省。
 * 宿主自己最清楚它能不能写(方案 A 下 server 侧投影会给 false)。
 */
function isConfigEditable(plugin: PluginInfo): boolean {
  return plugin.configEditable ?? (platformApi.environment !== 'web')
}

function fieldKey(plugin: PluginInfo, key: string): string {
  return `${plugin.id}::${key}`
}

function fieldError(plugin: PluginInfo, key: string): string {
  return configErrors.value[plugin.id]?.find(item => item.key === key)?.message ?? ''
}

function generalErrors(plugin: PluginInfo): string[] {
  return (configErrors.value[plugin.id] ?? []).filter(item => !item.key).map(item => item.message)
}

function hasConfigArea(plugin: PluginInfo): boolean {
  return Boolean(plugin.configFields?.length) || Boolean(plugin.configUnsupportedReasons?.length)
}

function baselineFor(plugin: PluginInfo): Record<string, unknown> {
  return plugin.configValues ?? {}
}

function draftFor(plugin: PluginInfo): Record<string, unknown> {
  return drafts.value[plugin.id] ?? baselineFor(plugin)
}

function setDraft(plugin: PluginInfo, key: string, value: unknown): void {
  drafts.value = {
    ...drafts.value,
    [plugin.id]: { ...draftFor(plugin), [key]: value },
  }
  savedPlugins.value = withoutId(savedPlugins.value, plugin.id)
}

function resetDraft(plugin: PluginInfo): void {
  const { [plugin.id]: _dropped, ...rest } = drafts.value
  drafts.value = rest
  stringListText.value = Object.fromEntries(
    Object.entries(stringListText.value).filter(([key]) => !key.startsWith(`${plugin.id}::`)),
  )
  configErrors.value = { ...configErrors.value, [plugin.id]: [] }
}

function isDirty(plugin: PluginInfo): boolean {
  const draft = drafts.value[plugin.id]
  if (!draft) return false
  return JSON.stringify(draft) !== JSON.stringify(baselineFor(plugin))
}

function parseStringList(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

/** 编辑中显示本地文本;没在编辑就由数组现算。 */
function stringListDraft(plugin: PluginInfo, key: string): string {
  const pending = stringListText.value[fieldKey(plugin, key)]
  if (pending !== undefined) return pending
  const value = draftFor(plugin)[key]
  return Array.isArray(value) ? value.join(', ') : ''
}

function setStringListText(plugin: PluginInfo, key: string, text: string): void {
  stringListText.value = { ...stringListText.value, [fieldKey(plugin, key)]: text }
  savedPlugins.value = withoutId(savedPlugins.value, plugin.id)
}

function commitStringList(plugin: PluginInfo, key: string): void {
  const pending = stringListText.value[fieldKey(plugin, key)]
  if (pending === undefined) return
  const { [fieldKey(plugin, key)]: _dropped, ...rest } = stringListText.value
  stringListText.value = rest
  setDraft(plugin, key, parseStringList(pending))
}

function withId(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  next.add(id)
  return next
}

function withoutId(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  next.delete(id)
  return next
}

async function saveConfig(plugin: PluginInfo): Promise<void> {
  // 先把编辑中的文本态收敛成数组,否则刚敲完还没失焦的那一项会丢。
  for (const field of plugin.configFields ?? []) {
    if (field.control === 'string-list') commitStringList(plugin, field.key)
  }

  savingPlugins.value = withId(savingPlugins.value, plugin.id)
  configErrors.value = { ...configErrors.value, [plugin.id]: [] }
  // 快照本次要保存的草稿:飞行期用户可能接着改,那份新脏态不该被 reset 抹掉。
  const submitted = JSON.stringify(draftFor(plugin))
  try {
    const result = await platformApi.setPluginConfig(plugin.id, JSON.parse(submitted))
    if (result?.success) {
      plugin.configValues = result.config ?? JSON.parse(submitted)
      if (JSON.stringify(draftFor(plugin)) === submitted) resetDraft(plugin)
      markSaved(plugin.id)
      emit('plugins-changed')
    } else {
      configErrors.value = {
        ...configErrors.value,
        [plugin.id]: result?.errors?.length
          ? result.errors
          : [{ message: result?.error || 'Failed to save plugin config' }],
      }
    }
  } catch (e: any) {
    configErrors.value = {
      ...configErrors.value,
      [plugin.id]: [{ message: e?.message || 'Failed to save plugin config' }],
    }
  } finally {
    savingPlugins.value = withoutId(savingPlugins.value, plugin.id)
  }
}

const uninstallingPlugins = ref<Set<string>>(new Set())
const { confirm } = useConfirm()

/** 内置插件没有卸载;web 端(方案 A)也不提供。 */
function canUninstall(plugin: PluginInfo): boolean {
  return plugin.source === 'user' && platformApi.environment !== 'web'
}

/**
 * 卸载 —— 措辞必须把"停用 vs 卸载"的差别说清楚:
 * 停用保留数据原地,卸载归档数据并删掉插件代码。
 */
/**
 * 把足迹说成人话。
 *
 * R4 已经能枚举"这个插件在盘上占了什么",但那份清单一直没有出口 ——
 * 用户在确认框里只能读到一句"数据会被归档",却看不到归档的是**什么**。
 * 这里把它摊开:目录条目数 / 是否有历史 KV / 设置键数。
 */
async function describeFootprint(pluginId: string): Promise<string> {
  try {
    const result = await platformApi.getPluginFootprint(pluginId)
    if (!result?.success || !result.footprint) return ''
    const { dataDirExists, entries, legacyKvExists, settingsKeys } = result.footprint
    const parts: string[] = []
    if (dataDirExists && entries.length) {
      // "items" 而不是 "files":entries 是目录的**顶层条目**,插件自建的子目录
      // 也算一条。说成 "3 files" 而用户点进去看到两个文件夹,数字就变成谎话。
      parts.push(entries.length === 1 ? '1 item in its data folder' : `${entries.length} items in its data folder`)
    }
    if (legacyKvExists) parts.push('its key-value store')
    // settingsKeys 是 plugin-settings 里的三个键(enabled / config / health),
    // 但只有 config 是**用户存的设置** —— enabled 是启停位、health 是熔断台账,
    // 把它们数进 "saved settings" 会让一个从没配置过的插件显示 "2 saved settings"。
    if (settingsKeys.includes('config')) parts.push('its saved configuration')
    // 什么都没写过的插件,如实说"没有数据" —— 比含糊的"数据会被归档"更可信。
    if (!parts.length) return 'It has not stored any data.'
    return `Will be archived: ${parts.join(', ')}.`
  } catch {
    // 足迹只是知情用的补充说明,读不到不该拦住卸载本身。
    return ''
  }
}

async function confirmUninstall(plugin: PluginInfo): Promise<void> {
  const footprint = await describeFootprint(plugin.id)
  const accepted = await confirm({
    title: 'Uninstall plugin',
    // 路径不硬编码:store 根由 ONETHING_STORE_PATH 决定,写死 ~/.onething 会在
    // 自定义 store 下变成一句假话。相对表述对用户同样够用。
    message: `Uninstall "${plugin.name}"? Its package is removed and its data folder is moved into `
      + 'the plugins backup folder. Disabling instead keeps both in place.'
      // 确认框的正文是单段落(ConfirmHost 不保留换行),所以足迹接成同段的下一句,
      // 而不是塞一个会被折叠掉的空行。
      + (footprint ? ` ${footprint}` : ''),
    confirmText: 'uninstall',
    danger: true,
    variant: 'paper',
  })
  if (!accepted) return

  uninstallingPlugins.value = withId(uninstallingPlugins.value, plugin.id)
  try {
    const result = await platformApi.uninstallPlugin(plugin.id)
    if (result?.success) {
      toast.success(result.archivePath
        ? `Uninstalled ${plugin.name}. Data archived to ${result.archivePath}`
        : `Uninstalled ${plugin.name}`)
      await loadPlugins()
      emit('plugins-changed')
    } else {
      toast.error(result?.error || `Failed to uninstall ${plugin.name}`)
    }
  } catch (e: any) {
    toast.error(e?.message || `Failed to uninstall ${plugin.name}`)
  } finally {
    uninstallingPlugins.value = withoutId(uninstallingPlugins.value, plugin.id)
  }
}

/** Saved 提示是一次性的反馈,不是一种状态 —— 让它自己退场。 */
function markSaved(pluginId: string): void {
  savedPlugins.value = withId(savedPlugins.value, pluginId)
  clearTimeout(savedTimers.get(pluginId))
  const timer = setTimeout(() => {
    savedPlugins.value = withoutId(savedPlugins.value, pluginId)
    savedTimers.delete(pluginId)
  }, 2500)
  savedTimers.set(pluginId, timer)
}

/**
 * 消息态生命期披露(plugin-message-state-2026-08 §3.2)。
 *
 * 判据与宿主闸门逐字相同(`lifetime === 'persistent'`),而且**只在这里判一次** ——
 * 已装卡片走投影后的清单、市场确认页走未投影的 manifest 原文,两条路的形状不同
 * 但语义必须是同一句话:声明 persistent 的块会在用户的消息上留下持久内容。
 * 未知的未来值天然读成非持久,与宿主降级同规。
 */
function slotIsPersistent(slot: { lifetime?: string }): boolean {
  return slot.lifetime === 'persistent'
}

/** 披露文案 —— 用户看的是"会在我的消息上留下东西",不是 lifetime 这个词。 */
const PERSISTENT_SLOT_NOTE = 'leaves persistent content on your messages'

/**
 * manifest 声明的贡献点摘要 —— 一行标签,不是 UI 工程。
 * R2 只让它可见;渲染面板、渲染设置表单分别是 R5 与 R3 的事。
 */
function contributesSummary(plugin: PluginInfo): string[] {
  const contributes = plugin.contributes
  const summary: string[] = []
  if (contributes?.panels?.length) {
    summary.push(`declares ${contributes.panels.length} panel${contributes.panels.length > 1 ? 's' : ''}`)
  }
  // 锚点块(R5.x):未知锚点(unsupported)与因容量被截断的块都要说得出来 ——
  // 它们不占界面,但用户得能在某处看到"这块为什么没出现"。
  for (const slot of contributes?.uiSlots ?? []) {
    if (slot.unsupported) {
      summary.push(`ui slot "${slot.label}" on unknown anchor "${slot.anchor}" (unsupported by this app version)`)
    } else if (isUiSlotTruncated(plugin.id, slot.anchor, slot.id)) {
      summary.push(`ui slot "${slot.label}" hidden — anchor "${slot.anchor}" is full`)
    }
  }
  const visibleSlots = (contributes?.uiSlots ?? [])
    .filter(slot => !slot.unsupported && !isUiSlotTruncated(plugin.id, slot.anchor, slot.id))
  if (visibleSlots.length) {
    summary.push(`declares ${visibleSlots.length} ui slot${visibleSlots.length > 1 ? 's' : ''}`)
  }
  // 生命期披露:装完之后也看得见(装前确认页只出现一次,卡片是长期可查的那一处)。
  const persistentSlots = (contributes?.uiSlots ?? []).filter(slotIsPersistent)
  if (persistentSlots.length) {
    summary.push(PERSISTENT_SLOT_NOTE)
  }
  if (contributes?.commands?.length) {
    summary.push(`declares ${contributes.commands.length} command${contributes.commands.length > 1 ? 's' : ''}`)
  }
  if (contributes?.hasSettingsSchema) summary.push('declares settings')
  if (contributes?.permissions?.length) {
    summary.push(`permissions: ${contributes.permissions.join(', ')}`)
  }
  if (contributes?.activationEvents?.length) {
    summary.push(`activation: ${contributes.activationEvents.join(', ')}`)
  }
  if (plugin.requestActions?.length) {
    summary.push(`actions: ${plugin.requestActions.join(', ')}`)
  }
  if (plugin.minAppVersion) summary.push(`needs app >= ${plugin.minAppVersion}`)
  return summary
}

/** 运行期故障文案:熔断说明优先,其次最后一次失败。'' = 没有故障。 */
function runtimeFault(plugin: PluginInfo): string {
  // 界面降级要如实说成"某个面板不可用",不能说成插件坏了 —— 插件的工具/命令/
  // 提示词此刻完全正常。但它**不能盖掉自动禁用的原因**:那是 R1 花一整期
  // 持久化并暴露出来的字段,被一句面板文案顶掉就等于从 UI 上消失了。
  // 两者都在时并列显示,禁用原因排前面(它更严重)。
  const degraded = plugin.degradedSurfaces ?? []
  const degradedLine = degraded.length
    ? `${degraded.map(entry => entry.surface).join(', ')} switched off — ${degraded[0].reason}`
    : ''

  // 自动禁用的原因**永远优先**:那是 R1 花一整期持久化并暴露的字段,
  // 被一句面板文案顶掉就等于从 UI 上消失。
  if (plugin.healthStatus === 'disabled' && plugin.healthReason) {
    return degradedLine
      ? `Auto-disabled — ${plugin.healthReason} · ${degradedLine}`
      : `Auto-disabled — ${plugin.healthReason}`
  }

  // **纯面板降级只说一句。** healthReason 在没有 disabledReason 时会回退到
  // `lastErrorScope: lastError`,而那恰恰是同一次降级的原始错误 —— 两句都印
  // 会得到 "3 consecutive failure(s) — request:panel:render:logs: boom ·
  // panel:logs switched off — 3 consecutive failures in …",同一件事说两遍。
  if (degradedLine) return degradedLine

  if (!plugin.healthReason) return ''
  if (plugin.healthStatus === 'degraded') {
    return `${plugin.healthFailures ?? 1} consecutive failure(s) — ${plugin.healthReason}`
  }
  return plugin.healthReason
}

function statusOf(plugin: PluginInfo): { label: string; tone: string } {
  if (plugin.healthStatus === 'disabled' && plugin.healthReason) return { label: 'Failed', tone: 'error' }
  // 降级只影响一个界面 —— 卡片说 "Partly degraded",不是 Failed。
  // (排在 disabled 判断之后:插件真被禁用时那才是主要事实。)
  if (plugin.loaded && plugin.degradedSurfaces?.length) return { label: 'Partly degraded', tone: 'warning' }
  if (plugin.error) return { label: 'Error', tone: 'error' }
  if (plugin.loaded && plugin.healthStatus === 'degraded') return { label: 'Degraded', tone: 'warning' }
  if (plugin.loaded) return { label: 'Active', tone: 'loaded' }
  return { label: 'Disabled', tone: 'stopped' }
}

const plugins = ref<PluginInfo[]>([])
const loading = ref(true)
const error = ref('')

const samplePluginsPath = ref('~/data/code/start-electron')

const emit = defineEmits<{
  'plugins-changed': []
}>()

async function loadPlugins() {
  loading.value = true
  error.value = ''
  try {
    const result = await platformApi.getPlugins()
    if (result?.success) {
      plugins.value = result.plugins || []
    } else {
      error.value = result?.error || 'Failed to load plugins'
    }
  } catch (e: any) {
    error.value = e.message || 'Unknown error'
  } finally {
    loading.value = false
  }
}

async function togglePlugin(plugin: PluginInfo) {
  const wasEnabled = plugin.enabled
  try {
    if (wasEnabled) {
      const result = await platformApi.disablePlugin(plugin.id)
      if (result?.success) {
        // 手动停用的清账在后端(disableOnethingPluginForIpc 清 tracker)——
        // 在 renderer 本地抹一遍只是让这一屏好看,重开设置页红条照样复现。
        // 重新拉一次列表,拿后端的事实。
        await loadPlugins()
        emit('plugins-changed')
      } else {
        console.error('Failed to disable plugin:', result?.error)
      }
    } else {
      const result = await platformApi.enablePlugin(plugin.id)
      if (result?.success) {
        plugin.enabled = true
        // Reload list to get updated state
        await loadPlugins()
        emit('plugins-changed')
      } else {
        console.error('Failed to enable plugin:', result?.error)
      }
    }
  } catch (e: any) {
    console.error('Toggle plugin error:', e)
  }
}

async function refreshPlugins() {
  try {
    const result = await platformApi.refreshPlugins()
    if (!result?.success) {
      console.error('Failed to refresh plugins:', result?.error)
    }
  } catch (e: any) {
    console.error('Refresh plugins error:', e)
  }
  await loadPlugins()
  emit('plugins-changed')
}

// ── P1:npm 生命周期 —— 装/更/查更新 + 无 npm 置灰(裁决 8)。──

/** null = 还在探测;false = 无 npm,Install/Update 置灰并说明。 */
const npmAvailable = ref<boolean | null>(null)
const installPkg = ref('')
const installPath = ref('')
const installing = ref(false)
/** pluginId → { current, latest };"有更新"徽标与 Update 按钮的数据源。 */
const updateOffers = ref<Map<string, { current: string; latest: string }>>(new Map())
const updatingPlugins = ref<Set<string>>(new Set())

async function loadLifecycleInfo(): Promise<void> {
  try {
    const info = await platformApi.getPluginLifecycleInfo()
    npmAvailable.value = info?.success ? info.npmAvailable : false
  } catch {
    npmAvailable.value = false
  }
}

async function loadUpdateOffers(): Promise<void> {
  try {
    const result = await platformApi.checkPluginUpdates()
    if (result?.success) {
      updateOffers.value = new Map(
        (result.offers ?? []).map(offer => [offer.pluginId, { current: offer.current, latest: offer.latest }]),
      )
    }
  } catch {
    // 徽标缺席不挡页面 —— 无市场索引时更新通道本来就是关的。
  }
}

async function installPlugin(): Promise<void> {
  const pkg = installPkg.value.trim()
  const path = installPath.value.trim()
  if (!pkg || !path || installing.value || npmAvailable.value === false) return
  installing.value = true
  try {
    const result = await platformApi.installPlugin({ pkg, path })
    if (result?.success) {
      toast.success(`Installed ${result.pluginId ?? pkg}`)
      installPkg.value = ''
      installPath.value = ''
      await loadPlugins()
      emit('plugins-changed')
    } else {
      toast.error(result?.error || `Failed to install ${pkg}`)
    }
  } catch (e: any) {
    toast.error(e?.message || `Failed to install ${pkg}`)
  } finally {
    installing.value = false
  }
}

async function updatePlugin(plugin: PluginInfo): Promise<void> {
  if (updatingPlugins.value.has(plugin.id) || npmAvailable.value === false) return
  updatingPlugins.value = new Set(updatingPlugins.value).add(plugin.id)
  try {
    const result = await platformApi.updatePlugin(plugin.id)
    if (result?.success) {
      toast.success(`Updated ${plugin.name} to v${result.version}`)
    } else {
      toast.error(result?.error || `Failed to update ${plugin.name}`)
    }
    await loadPlugins()
    await loadUpdateOffers()
    emit('plugins-changed')
  } catch (e: any) {
    toast.error(e?.message || `Failed to update ${plugin.name}`)
  } finally {
    const next = new Set(updatingPlugins.value)
    next.delete(plugin.id)
    updatingPlugins.value = next
  }
}

// ── P3:市场 —— 索引视图主进程 join 好,这里只渲染与过滤。──

/** 共享契约的 renderer 本地形:contributes 收窄成结构化声明。 */
interface MarketEntry {
  id: string
  pkg: string
  version: string
  description?: string
  author?: string
  minAppVersion?: string
  contributes?: PluginInfo['contributes']
  tarballUrl: string
  integrity?: string
  repository?: string
  installedVersion: string | null
  hasUpdate: boolean
  versionBlockedReason: string | null
}

const marketEntries = ref<MarketEntry[]>([])
// 初值 true:首帧是加载中而不是闪一下"无匹配"(挂载即拉取,loading 先到)。
const marketLoading = ref(true)
const marketError = ref('')
/** 主进程把"展示的是上次缓存"算好送过来(stale),renderer 不猜。 */
const marketStale = ref(false)
/** stale 的失败原因(主进程随快照带来)。 */
const marketStaleReason = ref('')
const marketFetchedAt = ref<number | null>(null)
const marketQuery = ref('')
/** 装前确认展开中的条目 id —— 一次只确认一个,心智负担小。 */
const confirmingMarket = ref<string | null>(null)
const installingMarket = ref<Set<string>>(new Set())

const marketFetchedAtText = computed(() =>
  marketFetchedAt.value ? new Date(marketFetchedAt.value).toLocaleString() : 'unknown time')

/** 纯前端过滤(§8.2):id/description/author,索引就这么大,不值得服务端。 */
const filteredMarket = computed(() => {
  const query = marketQuery.value.trim().toLowerCase()
  if (!query) return marketEntries.value
  return marketEntries.value.filter(entry =>
    entry.id.toLowerCase().includes(query)
    || (entry.description ?? '').toLowerCase().includes(query)
    || (entry.author ?? '').toLowerCase().includes(query))
})

/** 装前确认页的声明清单 —— contributesSummary 的市场版(未装,无截断/运行期事实)。 */
function marketDeclares(entry: MarketEntry): string[] {
  const contributes = entry.contributes
  const declares: string[] = []
  if (contributes?.panels?.length) {
    declares.push(`${contributes.panels.length} panel${contributes.panels.length > 1 ? 's' : ''}`)
  }
  for (const slot of contributes?.uiSlots ?? []) {
    // 生命期跟在它所属的那一条槽后面 —— 用户要知道的是"哪一块会留下东西",
    // 不是"这插件某处会留下东西"。
    const lifetime = slotIsPersistent(slot) ? ` — ${PERSISTENT_SLOT_NOTE}` : ''
    declares.push(
      slot.unsupported
        ? `ui slot "${slot.label}" on anchor "${slot.anchor}" (unsupported by this app version)${lifetime}`
        : `ui slot "${slot.label}" on anchor "${slot.anchor}"${lifetime}`,
    )
  }
  if (contributes?.commands?.length) {
    declares.push(`${contributes.commands.length} command${contributes.commands.length > 1 ? 's' : ''}`)
  }
  if (contributes?.hasSettingsSchema) declares.push('settings schema')
  if (contributes?.permissions?.length) {
    declares.push(`permissions: ${contributes.permissions.join(', ')}`)
  }
  if (contributes?.activationEvents?.length) {
    declares.push(`activation: ${contributes.activationEvents.join(', ')}`)
  }
  if (entry.minAppVersion) declares.push(`needs app >= ${entry.minAppVersion}`)
  return declares
}

async function loadMarket(refresh = false): Promise<void> {
  marketLoading.value = true
  try {
    const result = await platformApi.getPluginMarket({ refresh })
    if (result?.success) {
      marketEntries.value = (result.entries ?? []) as MarketEntry[]
      marketStale.value = result.stale
      marketStaleReason.value = result.error ?? ''
      marketFetchedAt.value = result.fetchedAt
      marketError.value = ''
    } else {
      // 真空失败(连缓存都没有)才走这;有缓存时主进程是 success+stale。
      marketError.value = result?.error || 'Failed to load the plugin market'
      marketEntries.value = []
    }
  } catch (e: any) {
    marketError.value = e?.message || 'Failed to load the plugin market'
    marketEntries.value = []
  } finally {
    marketLoading.value = false
  }
}

async function installFromMarket(entry: MarketEntry): Promise<void> {
  if (installingMarket.value.has(entry.id) || npmAvailable.value === false) return
  installingMarket.value = withId(installingMarket.value, entry.id)
  try {
    const result = await platformApi.installPlugin({
      pkg: entry.pkg,
      tarballUrl: entry.tarballUrl,
      ...(entry.integrity ? { integrity: entry.integrity } : {}),
    })
    if (result?.success) {
      toast.success(`Installed ${result.pluginId ?? entry.id}`)
      confirmingMarket.value = null
      await loadPlugins()
      await loadMarket()
      await loadUpdateOffers()
      emit('plugins-changed')
    } else {
      toast.error(result?.error || `Failed to install ${entry.id}`)
    }
  } catch (e: any) {
    toast.error(e?.message || `Failed to install ${entry.id}`)
  } finally {
    installingMarket.value = withoutId(installingMarket.value, entry.id)
  }
}

async function updateMarketPlugin(entry: MarketEntry): Promise<void> {
  if (updatingPlugins.value.has(entry.id) || npmAvailable.value === false) return
  updatingPlugins.value = new Set(updatingPlugins.value).add(entry.id)
  try {
    const result = await platformApi.updatePlugin(entry.id)
    if (result?.success) {
      toast.success(`Updated ${entry.id} to v${result.version}`)
    } else {
      toast.error(result?.error || `Failed to update ${entry.id}`)
    }
    await loadPlugins()
    await loadMarket()
    await loadUpdateOffers()
    emit('plugins-changed')
  } catch (e: any) {
    toast.error(e?.message || `Failed to update ${entry.id}`)
  } finally {
    const next = new Set(updatingPlugins.value)
    next.delete(entry.id)
    updatingPlugins.value = next
  }
}

// 熔断自动禁用发生在后台(没有用户操作),设置页必须被推着刷新,否则卡片
// 会一直停在 Active —— "运行期错误不可见"正是 R1 要治的病。
function handlePluginsChanged(): void {
  void loadPlugins()
}

onMounted(() => {
  loadPlugins()
  loadLifecycleInfo()
  loadUpdateOffers()
  // 启动时拉一次(缓存优先,主进程有缓存则秒回;§8.2 "启动时 + 手动刷新")。
  loadMarket()
  window.addEventListener('onething:plugins-changed', handlePluginsChanged)
})

onBeforeUnmount(() => {
  window.removeEventListener('onething:plugins-changed', handlePluginsChanged)
  for (const timer of savedTimers.values()) clearTimeout(timer)
  savedTimers.clear()
})
</script>

<style scoped>
/*
 * Plugins ledger — 画线风.
 * No fills, no radii: rows hang on hairlines, badges are outlined rings.
 * Toggle visuals and .section-title/.settings-card chrome come from the
 * SettingsPage :deep() layer.
 */
.tab-content {
  max-width: 720px;
}

.settings-section {
  margin-bottom: 28px;
}

.section-desc {
  font-size: 12px;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
  margin: 0 0 14px;
  line-height: 1.5;
}

.section-desc code,
.empty-state .hint code,
.install-steps code {
  padding: 0;
  border-radius: 0;
  background: transparent;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--settings-ink-2, var(--ui-text-secondary-fg));
}

/* ── Plugin list: ledger rows, no card chrome ── */
.plugin-list {
  display: flex;
  flex-direction: column;
}

.plugin-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0 8px;
  border-bottom: 1px solid var(--settings-rule, var(--ui-border-default-border));
  background: transparent;
}

.plugin-count {
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
}

.refresh-btn {
  margin-top: 0 !important;
  padding: 2px 8px;
  font-size: 11px;
}

.plugin-item {
  display: flex;
  align-items: flex-start;
  padding: 12px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--settings-rule-soft, var(--ui-border-subtle-border, var(--ui-border-default-border))) 55%, transparent);
}

.plugin-item:last-child {
  border-bottom: none;
}

/* Disabled plugin: faint ink + strike-through, not an opacity veil. */
.plugin-item.disabled .plugin-name {
  color: var(--settings-ink-4, var(--ui-text-faint-fg, var(--ui-text-muted-fg)));
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--settings-ink-4, var(--ui-text-faint-fg, var(--ui-text-muted-fg))) 60%, transparent);
}

.plugin-item.disabled .plugin-desc {
  color: var(--settings-ink-4, var(--ui-text-faint-fg, var(--ui-text-muted-fg)));
}

.plugin-body {
  flex: 1;
  min-width: 0;
}

.plugin-toggle {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  margin-left: 14px;
  margin-top: 4px;
}

.uninstall-btn {
  margin-top: 0 !important;
  padding: 2px 8px;
  font-size: 10px;
}

.uninstall-btn:hover {
  border-color: var(--ui-status-danger-border, var(--ui-status-danger-fg));
  color: var(--ui-status-danger-fg);
}

.plugin-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.plugin-name-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.plugin-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--settings-ink, var(--ui-text-primary-fg));
}

/* Badges: outlined rings, zero fill. */
.plugin-version {
  flex-shrink: 0;
  padding: 1px 7px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  border-radius: 999px;
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
}

.status-badge {
  flex-shrink: 0;
  padding: 1px 7px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.status-badge.loaded {
  border-color: var(--ui-status-success-border, var(--ui-status-success-fg));
  color: var(--ui-status-success-fg);
}

.status-badge.error {
  border-color: var(--ui-status-danger-border, var(--ui-status-danger-fg));
  color: var(--ui-status-danger-fg);
}

.status-badge.warning {
  border-color: var(--ui-status-warning-border, var(--ui-status-warning-fg));
  color: var(--ui-status-warning-fg);
}

.status-badge.stopped {
  border-style: dashed;
  border-color: var(--settings-rule, var(--ui-border-default-border));
  color: var(--settings-ink-4, var(--ui-text-faint-fg, var(--ui-text-muted-fg)));
}

.plugin-desc {
  font-size: 12px;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
  margin: 0;
  line-height: 1.45;
}

.plugin-meta {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.meta-tag {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
}

.meta-tag.path {
  color: var(--settings-ink-4, var(--ui-text-faint-fg, var(--ui-text-muted-fg)));
}

/* 声明摘要:比运行态更轻的一行,读起来像清单而不是状态。 */
.plugin-meta.contributes {
  margin-top: 0;
}

.plugin-config {
  margin-top: 12px;
  padding: 12px 0 2px 14px;
  border-left: 1px solid color-mix(in srgb, var(--settings-rule, var(--ui-border-default-border)) 60%, transparent);
}

.plugin-config-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.plugin-config-title {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
}

.plugin-config-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.plugin-config-note {
  margin: 0 0 10px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--settings-ink-4, var(--ui-text-faint-fg, var(--ui-text-muted-fg)));
}

.plugin-config-saved {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--ui-status-success-fg);
}

.meta-tag.readonly {
  padding: 1px 7px;
  border: 1px dashed var(--settings-rule, var(--ui-border-default-border));
  border-radius: 999px;
  color: var(--settings-ink-4, var(--ui-text-faint-fg, var(--ui-text-muted-fg)));
}

.meta-tag.declares {
  padding: 1px 7px;
  border: 1px dashed var(--settings-rule, var(--ui-border-default-border));
  border-radius: 999px;
  background: transparent;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
}

.meta-tag.update-available {
  padding: 1px 7px;
  border: 1px solid color-mix(in srgb, var(--settings-accent, var(--ui-accent-primary-fg)) 70%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--settings-accent, var(--ui-accent-primary-fg));
}

.install-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 460px;
}

/* P3 市场区:与插件台账同一张画线皮,确认区只是卡内的一段发线。 */
.market-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}

.market-toolbar :first-child {
  flex: 1;
}

.market-stale {
  margin: 0 0 8px;
}

.market-confirm {
  margin-top: 8px;
  padding: 8px 0 4px;
  border-top: 1px solid var(--line, currentColor);
}

.market-confirm-title {
  margin: 0 0 4px;
  font-weight: 600;
}

.market-confirm-list {
  margin: 0 0 6px;
  padding-left: 18px;
}

.market-confirm-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.install-btn {
  align-self: flex-start;
}

.install-hint {
  margin-top: 10px;
}

.meta-tag.builtin {
  padding: 1px 7px;
  border: 1px solid color-mix(in srgb, var(--settings-accent, var(--ui-accent-primary-fg)) 55%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--settings-accent, var(--ui-accent-primary-fg));
}

.cmd-list {
  color: var(--settings-ink-4, var(--ui-text-faint-fg, var(--ui-text-muted-fg)));
}

/* ── Empty/Loading/Error ── */
.empty-state,
.loading-row {
  padding: 28px 16px;
  text-align: center;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
  font-size: 13px;
}

.empty-state {
  border: 1px dashed var(--settings-rule, var(--ui-border-default-border));
}

.empty-state p {
  margin: 0;
}

.empty-state .hint {
  font-size: 12px;
  margin-top: 8px;
  line-height: 1.6;
}

.loading-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid color-mix(in srgb, var(--settings-ink-4, var(--ui-text-faint-fg, var(--ui-text-muted-fg))) 30%, transparent);
  border-top-color: var(--settings-accent, var(--ui-accent-primary-fg));
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.btn-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 8px;
  padding: 3px 10px;
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  border-radius: 0;
  background: transparent;
  color: var(--settings-ink-2, var(--ui-text-secondary-fg, var(--ui-text-primary-fg)));
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-default), color var(--duration-fast) var(--ease-default);
}

.btn-sm:hover {
  background: transparent;
  border-color: var(--settings-ink-3, var(--ui-text-muted-fg));
  color: var(--settings-ink, var(--ui-text-primary-fg));
}

.install-steps {
  margin: 0;
  padding-left: 18px;
  line-height: 1.8;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
  font-size: 12px;
}
</style>
