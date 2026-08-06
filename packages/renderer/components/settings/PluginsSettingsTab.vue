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
                <span
                  v-if="plugin.needsInstall"
                  class="meta-tag needs-install"
                >⚠️ npm install needed</span>
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

    <!-- How to install -->
    <section class="settings-section">
      <h3 class="section-title">
        How to Install
      </h3>
      <div class="settings-card">
        <div class="card-row">
          <ol class="install-steps">
            <li>Copy the plugin folder to <code>~/.onething/plugins/</code></li>
            <li>Open this settings page and click <strong>Refresh</strong></li>
            <li>If the plugin has a <code>package.json</code>, dependencies are auto-installed on first load</li>
          </ol>
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
import { ref, onBeforeUnmount, onMounted } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { platformApi } from '@/platform'
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
  needsInstall: boolean
  healthStatus?: string
  healthFailures?: number
  healthReason?: string
  minAppVersion?: string
  requestActions?: string[]
  contributes?: {
    commands?: string[]
    panels?: Array<{ id: string; label: string }>
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
    if (dataDirExists) {
      parts.push(entries.length === 1 ? '1 file in its data folder' : `${entries.length} files in its data folder`)
    }
    if (legacyKvExists) parts.push('its key-value store')
    if (settingsKeys.length) {
      parts.push(settingsKeys.length === 1 ? '1 saved setting' : `${settingsKeys.length} saved settings`)
    }
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
    message: `Uninstall "${plugin.name}"? Its plugin folder is deleted and its data folder is moved into `
      + 'the plugin-data backup folder. Disabling instead keeps both in place.'
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
 * manifest 声明的贡献点摘要 —— 一行标签,不是 UI 工程。
 * R2 只让它可见;渲染面板、渲染设置表单分别是 R5 与 R3 的事。
 */
function contributesSummary(plugin: PluginInfo): string[] {
  const contributes = plugin.contributes
  const summary: string[] = []
  if (contributes?.panels?.length) {
    summary.push(`declares ${contributes.panels.length} panel${contributes.panels.length > 1 ? 's' : ''}`)
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
  if (!plugin.healthReason) return ''
  if (plugin.healthStatus === 'disabled') return `Auto-disabled — ${plugin.healthReason}`
  if (plugin.healthStatus === 'degraded') {
    return `${plugin.healthFailures ?? 1} consecutive failure(s) — ${plugin.healthReason}`
  }
  return plugin.healthReason
}

function statusOf(plugin: PluginInfo): { label: string; tone: string } {
  if (plugin.healthStatus === 'installing') return { label: 'Installing', tone: 'installing' }
  if (plugin.healthStatus === 'disabled' && plugin.healthReason) return { label: 'Failed', tone: 'error' }
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

// 熔断自动禁用发生在后台(没有用户操作),设置页必须被推着刷新,否则卡片
// 会一直停在 Active —— "运行期错误不可见"正是 R1 要治的病。
function handlePluginsChanged(): void {
  void loadPlugins()
}

onMounted(() => {
  loadPlugins()
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

.status-badge.warning,
.status-badge.installing {
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

.meta-tag.needs-install {
  padding: 1px 7px;
  border: 1px solid var(--ui-status-warning-border, var(--ui-status-warning-fg));
  border-radius: 999px;
  background: transparent;
  color: var(--ui-status-warning-fg);
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
