<template>
  <!-- 描述树的渲染器。**UI 永不执行插件代码** —— 插件交出的是纯数据,
       这里全部用宿主自己的原语画出来(窄腰在 UI 侧的落地)。 -->
  <div
    v-if="node.type === 'stack'"
    class="panel-stack"
    :class="`gap-${node.gap || 'medium'}`"
  >
    <PluginPanelNode
      v-for="(child, index) in node.children"
      :key="index"
      :node="child"
      @action="emit('action', $event)"
    />
  </div>

  <div
    v-else-if="node.type === 'row'"
    class="panel-row"
  >
    <PluginPanelNode
      v-for="(child, index) in node.children"
      :key="index"
      :node="child"
      @action="emit('action', $event)"
    />
  </div>

  <section
    v-else-if="node.type === 'list'"
    class="panel-list"
  >
    <h4
      v-if="node.title"
      class="panel-list-title"
    >
      {{ node.title }}
    </h4>
    <p
      v-if="!node.items.length"
      class="panel-list-empty"
    >
      {{ node.emptyText || 'Nothing here yet.' }}
    </p>
    <ul
      v-else
      class="panel-list-items"
    >
      <li
        v-for="item in node.items"
        :key="item.id"
        class="panel-list-item"
        :class="{ 'is-clickable': Boolean(item.actionId) }"
      >
        <component
          :is="item.actionId ? 'button' : 'div'"
          class="panel-list-row"
          :type="item.actionId ? 'button' : undefined"
          @click="item.actionId && emit('action', { actionId: item.actionId, payload: item.payload })"
        >
          <span class="panel-list-main">
            <span class="panel-list-item-title">{{ item.title }}</span>
            <span
              v-if="item.subtitle"
              class="panel-list-item-subtitle"
            >{{ item.subtitle }}</span>
          </span>
          <span
            v-if="item.badge"
            class="panel-list-badge"
          >{{ item.badge }}</span>
        </component>
      </li>
    </ul>
  </section>

  <!-- markdown:插件给的是**文本**,不是 HTML —— 渲染由宿主做。 -->
  <div
    v-else-if="node.type === 'markdown'"
    class="panel-markdown"
  >
    <MessageMarkdown
      :content="node.text"
      :is-user="false"
      :live="false"
      :is-streaming="false"
    />
  </div>

  <Button
    v-else-if="node.type === 'button'"
    unstyled
    class="panel-button"
    :class="{ 'is-danger': node.variant === 'danger' }"
    :disabled="node.disabled"
    @click="emit('action', { actionId: node.actionId, payload: node.payload })"
  >
    {{ node.label }}
  </Button>

  <SettingsGroup
    v-else-if="node.type === 'form'"
    class="panel-form"
  >
    <SettingsField
      v-for="field in node.fields"
      :key="field.key"
      :label="field.label"
      :hint="field.hint"
    >
      <Switch
        v-if="field.control === 'switch'"
        variant="ledger"
        :model-value="Boolean(formState[field.key])"
        :aria-label="field.label"
        @update:model-value="formState[field.key] = Boolean($event)"
      />
      <InputNumber
        v-else-if="field.control === 'number'"
        :model-value="Number(formState[field.key])"
        :aria-label="field.label"
        @update:model-value="formState[field.key] = Number($event)"
      />
      <Select
        v-else-if="field.control === 'select'"
        variant="ledger"
        size="small"
        teleported
        fit-input-width
        :model-value="String(formState[field.key] ?? '')"
        :options="field.options || []"
        :aria-label="field.label"
        @update:model-value="formState[field.key] = String($event)"
      />
      <!-- string-list 编辑期间只维护**原始文本**:每敲一键就 split+trim+filter
           再 join 回去是有损往返 —— 键入的逗号当场被自己吃掉,第二项永远打不
           出来。blur 时才 parse(与 R3 设置页同一配方)。 -->
      <Input
        v-else-if="field.control === 'string-list'"
        :model-value="stringListText[field.key] ?? ''"
        :aria-label="field.label"
        placeholder="Comma separated"
        @update:model-value="stringListText[field.key] = String($event)"
        @blur="commitStringList(field.key)"
      />
      <Input
        v-else
        :model-value="String(formState[field.key] ?? '')"
        :aria-label="field.label"
        @update:model-value="formState[field.key] = String($event)"
      />
    </SettingsField>
    <div
      v-if="node.submitActionId"
      class="panel-form-actions"
    >
      <Button
        unstyled
        class="panel-button"
        @click="submitForm(node.submitActionId)"
      >
        {{ node.submitLabel || 'Save' }}
      </Button>
    </div>
  </SettingsGroup>

  <SettingsEmptyState
    v-else-if="node.type === 'empty-state'"
    :title="node.title"
    :description="node.description"
  >
    <template
      v-if="node.actionId"
      #actions
    >
      <Button
        unstyled
        class="panel-button"
        @click="emit('action', { actionId: node.actionId, payload: undefined })"
      >
        {{ node.actionLabel || 'Continue' }}
      </Button>
    </template>
  </SettingsEmptyState>

  <!-- 认不出的节点类型。通道守卫会先拒掉它,所以这里只在守卫被绕开时才可见 ——
       但"看得见的占位"和"静默空白"是两种事故:后者只会让人以为面板坏了。 -->
  <p
    v-else
    class="panel-unknown"
  >
    Unsupported panel element "{{ (node as { type?: string }).type ?? 'unknown' }}" — this plugin may need a newer app.
  </p>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import Button from '@/components/common/Button.vue'
import Input from '@/components/common/Input.vue'
import InputNumber from '@/components/common/InputNumber.vue'
import Select from '@/components/common/Select.vue'
import Switch from '@/components/common/Switch.vue'
import MessageMarkdown from '@/components/chat/message/MessageMarkdown.vue'
import { SettingsEmptyState, SettingsField, SettingsGroup } from '@/components/settings/settings-primitives'
import type { PluginPanelNodeData } from '@/workspace/plugin-panel-types'

const props = defineProps<{ node: PluginPanelNodeData }>()

const emit = defineEmits<{
  action: [payload: { actionId: string; payload?: unknown }]
}>()

/**
 * 表单的本地状态。
 *
 * 描述树给的是初值,编辑期间的值只活在这里 —— 每敲一个字符就往插件回一次
 * action 既慢又会让插件被迫处理半成品输入。提交时整份 payload 一次带过去。
 */
const formState = reactive<Record<string, unknown>>(
  props.node.type === 'form'
    ? Object.fromEntries(props.node.fields.map(field => [field.key, field.value ?? '']))
    : {},
)

/**
 * string-list 的编辑期文本态(与 formState 分开)。
 *
 * 只存原始字符串;blur 时才 parse 回数组写进 formState。提交前再 parse 一次,
 * 因为用户完全可能打完最后一项直接点保存 —— 那时 blur 还没来得及发生,
 * 少了这一步提交上去的就是上一次 blur 的旧值。
 */
const stringListText = reactive<Record<string, string>>(
  props.node.type === 'form'
    ? Object.fromEntries(
      props.node.fields
        .filter(field => field.control === 'string-list')
        .map(field => [field.key, Array.isArray(field.value) ? field.value.join(', ') : String(field.value ?? '')]),
    )
    : {},
)

function commitStringList(key: string): void {
  formState[key] = (stringListText[key] ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function submitForm(actionId: string): void {
  // 先把还没 blur 的 string-list 落定,再打包 —— 否则最后一次输入会丢。
  for (const key of Object.keys(stringListText)) commitStringList(key)
  emit('action', { actionId, payload: { ...formState } })
}
</script>

<style scoped>
.panel-stack {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.panel-stack.gap-none { gap: 0; }
.panel-stack.gap-small { gap: 8px; }
.panel-stack.gap-medium { gap: 16px; }

.panel-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.panel-list {
  min-width: 0;
}

.panel-list-title {
  margin: 0 0 8px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--ui-text-muted-fg);
}

.panel-list-empty {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-muted-fg);
}

.panel-list-items {
  margin: 0;
  padding: 0;
  list-style: none;
}

.panel-list-item {
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border) 55%, transparent);
}

.panel-list-item:last-child {
  border-bottom: none;
}

.panel-list-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  font: inherit;
}

.panel-list-item.is-clickable .panel-list-row {
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-default);
}

.panel-list-item.is-clickable .panel-list-row:hover {
  color: var(--ui-accent-primary-fg);
}

.panel-list-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}

.panel-list-item-title {
  font-size: 13px;
  color: var(--ui-text-primary-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-list-item-subtitle {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-muted-fg);
}

.panel-list-badge {
  flex-shrink: 0;
  padding: 1px 7px;
  border: 1px solid var(--ui-border-default-border);
  border-radius: 999px;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--ui-text-muted-fg);
}

.panel-markdown {
  min-width: 0;
  font-size: 13px;
}

.panel-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 3px 10px;
  border: 1px solid var(--ui-border-default-border);
  border-radius: 0;
  background: transparent;
  color: var(--ui-text-secondary-fg, var(--ui-text-primary-fg));
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-default), color var(--duration-fast) var(--ease-default);
}

.panel-button:hover:not(:disabled) {
  border-color: var(--ui-text-muted-fg);
  color: var(--ui-text-primary-fg);
}

.panel-button.is-danger:hover:not(:disabled) {
  border-color: var(--ui-status-danger-border, var(--ui-status-danger-fg));
  color: var(--ui-status-danger-fg);
}

.panel-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.panel-unknown {
  margin: 0;
  padding: 8px 10px;
  border: 1px dashed var(--ui-border-default-border);
  font-size: 12px;
  color: var(--ui-text-muted-fg);
}

.panel-form-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
</style>
