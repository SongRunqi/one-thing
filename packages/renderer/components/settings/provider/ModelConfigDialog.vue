<!--
  ui-gate-allow: title-attr

  The three `title=` hits below are SettingsSection's `title` prop (it declares
  `title?: string` and renders it as an <h3>; there is no title slot), not the
  HTML title attribute the rule is aimed at. Nothing here shows a native
  browser tooltip — hover copy goes through Tooltip.vue.
-->
<template>
  <Dialog
    open
    variant="paper"
    dividers
    :width="560"
    class="model-config-dialog"
    :aria-label="`配置 ${model.id}`"
    @update:open="value => { if (!value) $emit('back') }"
  >
    <!--
      Title + model id ride in `#header-leading` rather than the `title` prop:
      the prop renders a bare <h3> and there is nowhere to hang the mono
      subtitle. Slot content keeps THIS file's scope, and the <h3> still picks
      up the paper skin's serif via Dialog's `.app-dialog-header :deep(h3)`.
    -->
    <template #header-leading>
      <div class="config-title-block">
        <h3 class="config-title">
          {{ model.name || model.id }}
        </h3>
        <p class="config-subtitle">
          {{ model.id }}
        </p>
      </div>
    </template>

    <template #header-extra>
      <button
        type="button"
        class="config-close"
        aria-label="关闭"
        @click="$emit('back')"
      >
        <X :size="15" />
      </button>
    </template>

    <div class="config-head-actions">
      <Button
        unstyled
        native-type="button"
        class="config-chip"
        :class="{ on: isSelected }"
        @click="$emit('toggle')"
      >
        {{ isSelected ? '已加入选择器' : '加入选择器' }}
      </Button>
      <Button
        unstyled
        native-type="button"
        class="config-chip"
        :class="{ on: isActive }"
        :disabled="isActive"
        @click="$emit('set-active')"
      >
        {{ isActive ? '当前模型' : '设为当前' }}
      </Button>
    </div>

    <SettingsSection title="标识">
      <SettingRow
        label="模型 ID"
        description="改名会同步迁移这个模型上的所有覆盖设置。"
      >
        <div class="config-id-row">
          <Input
            class="config-id-input"
            type="text"
            size="small"
            :model-value="idDraft"
            spellcheck="false"
            autocomplete="off"
            aria-label="Model ID"
            @update:model-value="onIdInput"
            @keydown.enter.prevent="commitRename"
          />
          <Button
            unstyled
            native-type="button"
            class="config-save"
            :disabled="!idDraft || idDraft === model.id"
            @click="commitRename"
          >
            保存
          </Button>
        </div>
      </SettingRow>
      <ErrorNote
        v-if="renameError"
        :message="renameError"
      />
    </SettingsSection>

    <SettingsSection
      title="容量"
      description="留空表示跟随模型注册表。手动添加的模型没有注册表条目，不填会按 128K 估算上下文，压缩阈值也会跟着算错。"
    >
      <SettingRow label="上下文窗口">
        <div class="config-number-row">
          <InputNumber
            class="config-number"
            size="small"
            :model-value="contextDraft"
            :min="0"
            :step="1024"
            aria-label="Context window tokens"
            @update:model-value="onContextInput"
          />
          <span class="config-number-unit">tokens</span>
          <span class="config-number-note">{{ contextNote }}</span>
          <Button
            v-if="contextOverride != null"
            unstyled
            native-type="button"
            class="config-reset-inline"
            @click="$emit('update-context-length', null)"
          >
            恢复默认
          </Button>
        </div>
      </SettingRow>

      <SettingRow label="最大输出">
        <div class="config-number-row">
          <InputNumber
            class="config-number"
            size="small"
            :model-value="outputDraft"
            :min="0"
            :max="modelLimit || undefined"
            :step="outputStep"
            aria-label="Max output tokens"
            @update:model-value="onOutputInput"
          />
          <span class="config-number-unit">tokens</span>
          <span class="config-number-note">{{ outputNote }}</span>
          <Button
            v-if="maxOutputOverride != null"
            unstyled
            native-type="button"
            class="config-reset-inline"
            @click="$emit('update-max-output', null)"
          >
            恢复默认
          </Button>
        </div>
      </SettingRow>
    </SettingsSection>

    <SettingsSection
      title="能力覆盖"
      description="默认跟随模型注册表。只有当注册表判断错了才需要在这里强制。"
    >
      <template #actions>
        <Button
          v-if="hasAnyOverride"
          unstyled
          native-type="button"
          class="config-reset-all"
          @click="$emit('reset-capabilities')"
        >
          全部恢复默认
        </Button>
      </template>
      <SettingRow
        v-for="cap in capabilityKeys"
        :key="String(cap.key)"
        :label="cap.label"
      >
        <div
          class="config-tristate"
          role="radiogroup"
          :aria-label="cap.label"
        >
          <!--
            Native <button>, not `Button unstyled`: the segmented look is drawn
            entirely by the rules below, and BorderBox's own
            `.border-box.is-interactive:hover` (0,3,0) plus its unstyled
            neutraliser sat above them in the cascade — a latent tie that only
            shows up the day someone adds a hover background here.
          -->
          <button
            v-for="opt in TRISTATE_OPTIONS"
            :key="String(opt.value)"
            type="button"
            class="config-tristate-btn"
            :class="{ on: capabilityState(cap.key) === opt.value }"
            role="radio"
            :aria-checked="capabilityState(cap.key) === opt.value"
            @click="$emit('update-capability', cap.key, opt.value === undefined ? null : opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </SettingRow>
    </SettingsSection>

    <template #actions>
      <button
        type="button"
        class="app-dialog-text-btn is-primary"
        @click="$emit('back')"
      >
        完成
      </button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import Button from '@/components/common/Button.vue'
import Dialog from '@/components/common/Dialog.vue'
import Input from '@/components/common/Input.vue'
import InputNumber from '@/components/common/InputNumber.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import SettingsSection from '../SettingsSection.vue'
import SettingRow from '../SettingRow.vue'
import type { OpenRouterModel, ModelCapabilityOverride } from '@/types'

const TRISTATE_OPTIONS: Array<{ value: boolean | undefined; label: string }> = [
  { value: undefined, label: '自动' },
  { value: true, label: '开' },
  { value: false, label: '关' },
]

const props = defineProps<{
  model: OpenRouterModel
  isSelected: boolean
  isActive: boolean
  capabilityKeys: Array<{ key: keyof ModelCapabilityOverride; label: string }>
  capabilityOverride: ModelCapabilityOverride | undefined
  /** null = no override; the registry value is used. */
  contextOverride: number | null
  registryContextLength: number
  maxOutputOverride: number | null
  modelLimit: number
  defaultMaxOutput: number
  renameModel: (oldId: string, newId: string) => { ok: boolean; reason?: string }
  formatTokens: (value: number) => string
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'toggle'): void
  (e: 'set-active'): void
  (e: 'update-context-length', value: number | null): void
  (e: 'update-max-output', value: number | null): void
  (e: 'update-capability', key: keyof ModelCapabilityOverride, value: boolean | null): void
  (e: 'reset-capabilities'): void
}>()

const idDraft = ref(props.model.id)
const renameError = ref('')

// Esc, the overlay click and the focus trap are Dialog's (it arbitrates Esc
// across stacked dialogs); this file no longer keeps its own keydown listener.

watch(() => props.model.id, id => {
  idDraft.value = id
  renameError.value = ''
})

function onIdInput(value: string) {
  idDraft.value = value.trim()
  renameError.value = ''
}

function commitRename() {
  const next = idDraft.value.trim()
  if (!next || next === props.model.id) return
  const result = props.renameModel(props.model.id, next)
  if (result.ok) {
    renameError.value = ''
    return
  }
  renameError.value =
    result.reason === 'duplicate'
      ? `已存在 id 为 "${next}" 的模型。`
      : result.reason === 'empty'
        ? '模型 id 不能为空。'
        : '改名失败。'
}

const contextDraft = computed(() => props.contextOverride ?? 0)
const outputDraft = computed(() => props.maxOutputOverride ?? 0)

const contextNote = computed(() => {
  if (props.contextOverride != null) return '已覆盖'
  return props.registryContextLength > 0
    ? `跟随注册表 · ${props.formatTokens(props.registryContextLength)}`
    : '注册表无数据 · 按 128K 估算'
})

const outputNote = computed(() => {
  if (props.maxOutputOverride != null) return '已覆盖'
  if (props.defaultMaxOutput > 0) {
    return `默认 ${props.formatTokens(props.defaultMaxOutput)}（上限的一半）`
  }
  return '注册表无上限数据'
})

const outputStep = computed(() => {
  const limit = props.modelLimit
  if (limit <= 1024) return 1
  if (limit <= 8192) return 64
  if (limit <= 32_768) return 128
  if (limit <= 131_072) return 256
  return 1024
})

function onContextInput(value: number) {
  emit('update-context-length', !Number.isFinite(value) || value <= 0 ? null : Math.floor(value))
}

function onOutputInput(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    emit('update-max-output', null)
    return
  }
  const capped = props.modelLimit > 0 ? Math.min(Math.floor(value), props.modelLimit) : Math.floor(value)
  emit('update-max-output', Math.max(1, capped))
}

function capabilityState(key: keyof ModelCapabilityOverride): boolean | undefined {
  return props.capabilityOverride?.[key]
}

const hasAnyOverride = computed(() =>
  Boolean(props.capabilityOverride && Object.values(props.capabilityOverride).some(v => v !== undefined)),
)
</script>

<style scoped>
/*
 * The shell is `Dialog variant="paper"` (docs/design/ui-system.md §1): overlay,
 * `--z-modal`, the two hairlines, panel width / 85vh cap / body scroll, Esc,
 * the focus trap and the overlay's `-webkit-app-region: no-drag` all live
 * there now. What is left here is only the content inside the slots (方案 §6.1).
 *
 * Two things that used to be in this file and are deliberately gone:
 *  - `.model-config-overlay { -webkit-app-region: no-drag }`, the hand-rolled
 *    fix for clicks being eaten by SettingsPage's 112px drag band. Dialog's
 *    overlay carries the same declaration, and `-webkit-app-region` inherits.
 *  - every rule that named a skeleton class (`.dialog-overlay`, `.dialog`,
 *    `.dialog-header` …). This was the last consumer of that global block, so
 *    the block itself was deleted from `styles/components.css`.
 */

/* Header. The <h3>'s type comes from Dialog's paper skin (serif 15/600); only
   the two-line block's own layout is this file's business. `min-width: 0` is
   what lets both lines ellipsis inside the header's flex row. */
.config-title-block {
  flex: 1 1 auto;
  min-width: 0;
}
.config-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.config-subtitle {
  overflow: hidden;
  margin: 2px 0 0;
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.config-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  padding: 0;
  appearance: none;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  cursor: pointer;
  transition:
    color var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default);
}
.config-close:hover {
  border-color: var(--settings-rule, var(--ui-border-default-border));
  color: var(--settings-ink, var(--ui-text-primary-fg));
}
.config-close:focus-visible {
  outline: none;
  /* One line on purpose: `shadow-literal-floating` reads line-by-line and a
     wrapped value hides the `var(--…)` that proves this is not a literal. */
  box-shadow: 0 0 0 2px var(--ui-surface-app-bg, var(--bg-app)), 0 0 0 4px var(--ui-state-focus-ring, var(--ui-accent-primary-fg, var(--accent)));
}

.config-head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--settings-rule-soft, var(--ui-border-subtle-border));
}
.config-chip {
  padding: 2px 8px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
  font-size: 11px;
  transition:
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default);
}
.config-chip:hover:not(:disabled) {
  border-color: var(--settings-ink-3, var(--ui-text-muted-fg));
  color: var(--settings-ink, var(--ui-text-primary-fg));
}
.config-chip.on {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg));
  color: var(--settings-accent, var(--ui-accent-primary-fg));
}

.config-id-row,
.config-number-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.config-id-input {
  flex: 1 1 auto;
  min-width: 0;
}
.config-number {
  flex: 0 0 132px;
}
.config-number-unit {
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  font-size: 11px;
}
.config-number-note {
  overflow: hidden;
  flex: 1 1 auto;
  min-width: 0;
  color: var(--settings-ink-4, var(--ui-text-muted-fg));
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.config-save,
.config-reset-inline,
.config-reset-all {
  flex: 0 0 auto;
  padding: 2px 8px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
  font-size: 11px;
  transition:
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default);
}
.config-save:hover:not(:disabled),
.config-reset-inline:hover,
.config-reset-all:hover {
  border-color: var(--settings-ink-3, var(--ui-text-muted-fg));
  color: var(--settings-ink, var(--ui-text-primary-fg));
}
.config-save:disabled {
  opacity: 0.45;
}

/* Three-cell segmented control on native <button>s, so the declarations below
   are the ONLY ones painting it. The UA reset (appearance / background / font)
   is what `Button unstyled` used to contribute via BorderBox's neutraliser. */
.config-tristate {
  display: inline-flex;
}
.config-tristate-btn {
  box-sizing: border-box;
  padding: 2px 10px;
  appearance: none;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  border-radius: 0;
  margin-left: -1px;
  background: transparent;
  color: var(--settings-ink-3, var(--ui-text-muted-fg));
  /* `font: inherit` first, then the size — the shorthand resets font-size, so
     the order is load-bearing. Together they reproduce exactly what BorderBox's
     unstyled neutraliser used to hand these buttons. */
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    background var(--duration-fast) var(--ease-default);
}
.config-tristate-btn:first-child {
  margin-left: 0;
}
.config-tristate-btn:hover {
  color: var(--settings-ink, var(--ui-text-primary-fg));
}
.config-tristate-btn:focus-visible {
  outline: none;
  /* Single line — see `.config-close:focus-visible`. */
  box-shadow: 0 0 0 2px var(--ui-surface-app-bg, var(--bg-app)), 0 0 0 4px var(--ui-state-focus-ring, var(--ui-accent-primary-fg, var(--accent)));
}
.config-tristate-btn.on {
  background: var(--ui-state-selected-bg);
  border-color: var(--settings-accent, var(--ui-accent-primary-fg));
  color: var(--settings-accent, var(--ui-accent-primary-fg));
}
</style>
