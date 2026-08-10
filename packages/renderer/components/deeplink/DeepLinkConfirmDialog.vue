<template>
  <Dialog
    v-if="request"
    :open="true"
    :title="dialogTitle"
    size="md"
    :close-on-overlay="false"
    @update:open="value => { if (!value) onCancel() }"
  >
    <template #header-extra>
      <!-- 来源标注。一条深链与"我刚在应用里点的"必须一眼分得开。 -->
      <Badge
        :label="sourceLabel"
        tone="warning"
        size="sm"
      />
    </template>

    <p
      v-if="card.kind === 'rejected'"
      class="deeplink-message"
    >
      {{ card.message }}
    </p>

    <template v-else>
      <p class="deeplink-target">
        {{ targetLine }}
      </p>
      <p
        v-if="card.kind === 'ask' && card.agentFallbackFrom"
        class="deeplink-note"
      >
        {{ fallbackNote }}
      </p>

      <!--
        全文。**滚动,不截断** —— 用户要为发出去的东西负责,那就得让他看得见
        全部;省略号会让一段 3000 字的正文看起来像一句话。
      -->
      <Scrollbar
        v-if="card.text"
        class="deeplink-text"
        max-height="240px"
      >
        <pre class="deeplink-text-body">{{ card.text }}</pre>
      </Scrollbar>
      <p
        v-else
        class="deeplink-note"
      >
        (no text)
      </p>

      <dl
        v-if="paramEntries.length > 0"
        class="deeplink-params"
      >
        <template
          v-for="entry in paramEntries"
          :key="entry[0]"
        >
          <dt>{{ entry[0] }}</dt>
          <dd>{{ entry[1] }}</dd>
        </template>
      </dl>
    </template>

    <template #actions>
      <button
        v-if="card.kind !== 'rejected'"
        type="button"
        class="btn secondary"
        :disabled="busy"
        @click="onCancel"
      >
        Cancel
      </button>
      <button
        type="button"
        class="btn primary"
        :disabled="busy"
        @click="onConfirm"
      >
        {{ card.kind === 'rejected' ? 'OK' : 'Confirm' }}
      </button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
/**
 * `onething://` 深链的确认卡(H4)。
 *
 * 这个组件**只显示**:该显示什么(agent 存不存在、插件叫什么、动作还在不在)
 * 全部由主进程算好过线。它在这里不查任何 store —— 查两遍就会漂,而漂的那一刻
 * 用户看到的是一句谎话。
 *
 * 两条形态,一个组件:
 *  - 正常卡:目标 + 全文 + 参数 + 确认/取消;
 *  - 拒绝卡(内容过长 / 动作不在了 / 动作灰着):一句话 + 一个"知道了",
 *    **没有确认按钮** —— 让人确认一个不会发生的动作是更坏的一种谎。
 *
 * 覆盖层点击不关(`close-on-overlay="false"`):这是一次需要明确表态的授权,
 * 误点一下就当作"取消"虽然安全,但会让用户以为自己什么也没做过。Esc 仍然生效
 * (Dialog 默认),那是一次明确的"我不要"。
 */
import { computed } from 'vue'
import Dialog from '@/components/common/Dialog.vue'
import Badge from '@/components/common/Badge.vue'
import Scrollbar from '@/components/common/Scrollbar.vue'
import type { DeepLinkConfirmRequest } from '@shared/ipc/deeplink'

const props = defineProps<{
  request: DeepLinkConfirmRequest
  busy?: boolean
  /** 主进程那边的来源口径,由调用方传进来(不在这里再写一份字面量)。 */
  sourceLabel: string
}>()

const emit = defineEmits<{
  (event: 'confirm'): void
  (event: 'cancel'): void
}>()

const card = computed(() => props.request.card)

const dialogTitle = computed(() => {
  switch (card.value.kind) {
    case 'ask':
      return 'Send this to onething?'
    case 'plugin':
      return 'Hand this to a plugin?'
    default:
      return 'Link refused'
  }
})

/**
 * 目标那一行。**不出现裸 id** —— 用户读的是名字。
 */
const targetLine = computed(() => {
  const value = card.value
  if (value.kind === 'ask') {
    return value.agentName
      ? `Starts a new chat with ${value.agentName}.`
      : 'Starts a new chat.'
  }
  if (value.kind === 'plugin') {
    return `Runs “${value.actionTitle}” from ${value.pluginName}.`
  }
  return ''
})

const fallbackNote = computed(() => {
  const value = card.value
  if (value.kind !== 'ask' || !value.agentFallbackFrom) return ''
  const target = value.defaultAgentName ? ` (${value.defaultAgentName})` : ''
  return `The link asked for an assistant that isn’t here — using your default${target} instead.`
})

const paramEntries = computed<Array<[string, string]>>(() => {
  const value = card.value
  if (value.kind !== 'plugin') return []
  return Object.entries(value.params)
})

function onConfirm(): void {
  emit('confirm')
}

function onCancel(): void {
  emit('cancel')
}
</script>

<style scoped>
.deeplink-message,
.deeplink-target {
  margin: 0 0 var(--space-2);
  font-size: var(--type-body-size);
  line-height: var(--type-body-line-height);
  color: var(--ui-text-fg);
}

.deeplink-note {
  margin: 0 0 var(--space-2);
  font-size: var(--type-caption-size);
  line-height: var(--type-caption-line-height);
  color: var(--ui-text-muted-fg);
}

.deeplink-text {
  border: var(--border-width-thin) solid var(--ui-border);
  border-radius: var(--radius-sm);
  background: var(--ui-surface-sunken-bg);
}

.deeplink-text-body {
  margin: 0;
  padding: var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--type-caption-size);
  line-height: var(--type-body-line-height);
  color: var(--ui-text-fg);
  white-space: pre-wrap;
  word-break: break-word;
}

.deeplink-params {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-1) var(--space-3);
  margin: var(--space-3) 0 0;
  font-size: var(--type-caption-size);
  color: var(--ui-text-muted-fg);
}

.deeplink-params dt {
  font-family: var(--font-mono);
}

.deeplink-params dd {
  margin: 0;
  word-break: break-word;
}
</style>
