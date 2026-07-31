<template>
  <section class="agent-space agent-ledger is-narrow">
    <button
      v-if="showBack"
      type="button"
      class="space-back"
      @click="emit('back')"
    >
      <ChevronLeft
        :size="13"
        :stroke-width="2"
        aria-hidden="true"
      />
      {{ backLabel }}
    </button>

    <div class="space-hero">
      <AgentAvatar
        class="space-avatar"
        :avatar="identity.avatar"
        :avatar-image="identity.avatarImage"
        :size="80"
      />
      <b class="space-name">{{ identity.name }}</b>
      <i class="space-subtitle">{{ subtitle }}</i>
      <p
        v-if="description"
        class="space-desc"
      >
        {{ description }}
      </p>
      <div class="space-actions">
        <button
          class="text-action"
          type="button"
          :title="retired ? '已退休:不再接活,也开不了新私聊' : `和${identity.name}发消息`"
          :disabled="retired || openingDm"
          @click="startDm"
        >
          {{ openingDm ? '打开中…' : '发消息' }}
        </button>
        <button
          v-if="work?.sessionId"
          class="text-action"
          type="button"
          :title="`正在干活 · ${work.title} —— 打开线程`"
          @click="emit('open-thread', work!.sessionId, work!.title)"
        >
          看线程
        </button>
      </div>
      <p
        v-if="dmError"
        class="field-hint space-error"
      >
        {{ dmError }}
      </p>
    </div>

    <!-- 四面(agent-im-chat-ui.md §3.2):配置 / 会话 / 文件 / 搜索。
         深面不再跳去 Agents 管理页 —— 就地渲染,配置就地存
         (agent-space-workbench.md P2)。 -->
    <div
      class="space-tabs"
      role="tablist"
      aria-label="Agent 空间"
    >
      <button
        v-for="face in SPACE_FACES"
        :key="face.key"
        type="button"
        class="space-tab"
        :class="{ 'is-on': face.key === activeTab }"
        role="tab"
        :aria-selected="face.key === activeTab"
        @click="activeTab = face.key"
      >
        {{ face.label }}
      </button>
    </div>

    <div class="space-face">
      <!-- 查无此人(墓碑 / 名册还没加载)就没有可编辑的东西 —— 摆一张空表单
           会让 save 变成一颗按了什么也不发生的按钮。 -->
      <p
        v-if="activeTab === 'config' && !agent"
        class="space-empty"
      >
        这个人已经不在名册里了,配置无从改起 —— 历史与署名仍然读得到。
      </p>
      <AgentConfigForm
        v-else-if="activeTab === 'config'"
        :agent="agent"
        :show-conversations="false"
        @open-session="onOpenSession"
      />
      <AgentSessionsPane
        v-else-if="activeTab === 'sessions'"
        :agent-id="agentId"
        :agent-name="identity.name"
        @open-session="onOpenSession"
      />
      <AgentFilesPane
        v-else-if="activeTab === 'files'"
        :agent-id="agentId"
        @open-file="(path: string) => emit('open-file', path)"
      />
      <AgentSearchPane
        v-else
        :agent-id="agentId"
        :agent-name="identity.name"
        @open-session="onOpenSession"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 右栏的「空间页」——**一个人**在工作台里的那一面(agent-space-workbench.md 案一)。
 *
 * 两个宿主:群聊的「成员」tab 下钻(MembersWorkbench)、以及点了非成员头像时
 * 单开的 `agent` 页签。两边挂的是同一个组件,所以"点头像看到什么"只有一个答案。
 *
 * 四面全部**就地渲染**:配置是那张唯一的表单(AgentConfigForm),会话/文件/搜索
 * 是那三个只读面。行的落点交给宿主 —— 会话去主区页签,文件去右栏文件页签,
 * 谁也不再跳去 Agents 管理页。
 */
import { computed, ref, watch } from 'vue'
import { ChevronLeft } from 'lucide-vue-next'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import { useAgentsStore, type AgentDetailTab } from '@/stores/agents'
import { isActiveAgent } from '@shared/ipc'
import type { AgentDoingTask } from '@/components/chat/agent-activity'
import { buildAgentSpaceSubtitle } from '@/components/workbench/agent-space'
import AgentConfigForm from './AgentConfigForm.vue'
import AgentSessionsPane from './AgentSessionsPane.vue'
import AgentFilesPane from './AgentFilesPane.vue'
import AgentSearchPane from './AgentSearchPane.vue'
import { useAgentDmOpener } from './use-agent-dm'
import '@/styles/agent-space.css'

const props = withDefaults(defineProps<{
  agentId: string
  /** 「返回成员」那一行;单开的 agent 页签没有可返回的列表。 */
  showBack?: boolean
  backLabel?: string
  /** 进来先停在哪一面。 */
  initialTab?: AgentDetailTab | null
  /** TA 正在干的活(宿主手上有看板时才给)—— 决定副标题的「在忙」与「看线程」。 */
  work?: AgentDoingTask | null
}>(), {
  showBack: false,
  backLabel: '返回成员',
  initialTab: null,
  work: null,
})

const emit = defineEmits<{
  back: []
  'open-session': [sessionId: string]
  'open-file': [filePath: string]
  'open-thread': [workSessionId: string, title: string]
}>()

const agentsStore = useAgentsStore()

const SPACE_FACES: ReadonlyArray<{ key: AgentDetailTab; label: string }> = [
  { key: 'config', label: '配置' },
  { key: 'sessions', label: '会话' },
  { key: 'files', label: '文件' },
  { key: 'search', label: '搜索' },
]

const activeTab = ref<AgentDetailTab>(props.initialTab || 'config')

watch(() => props.initialTab, tab => {
  if (tab) activeTab.value = tab
})

/* 换人时回到第一面:上一个人停在「文件」不代表这个人也要从文件看起。 */
watch(() => props.agentId, () => {
  activeTab.value = props.initialTab || 'config'
})

/** 严格身份:查无此人给墓碑占位,绝不冒充 default(域模型 M4)。 */
const identity = computed(() => agentsStore.displayAgent(props.agentId))

/** 配置面要的是完整定义;查不到(墓碑/未加载)就没有可编辑的东西。 */
const agent = computed(() => agentsStore.findAgent(props.agentId))

const retired = computed(() => !!agent.value && !isActiveAgent(agent.value))

const description = computed(() => (agent.value?.description || '').trim())

const subtitle = computed(() => {
  const base = buildAgentSpaceSubtitle(identity.value)
  const busy = props.work?.title
  return busy ? `${base} · 在忙 ${busy}` : base
})

const { openingDm, dmError, openDmRoom } = useAgentDmOpener()

async function startDm(): Promise<void> {
  const sessionId = await openDmRoom(props.agentId)
  if (sessionId) emit('open-session', sessionId)
}

function onOpenSession(sessionId: string): void {
  emit('open-session', sessionId)
}
</script>

<style scoped>
/* 空间页的骨架。行内的账页样式在 styles/agent-space.css(与管理页同一份)。 */
.agent-space {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
}

.space-back {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 11px 16px;
  border: 0;
  border-bottom: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
  background: transparent;
  cursor: pointer;
  font-size: 11.5px;
  color: var(--ui-text-muted-fg, var(--muted));
  text-align: left;
}

.space-back:hover {
  color: var(--ui-text-primary-fg, var(--text));
}

.space-hero {
  flex: 0 0 auto;
  padding: 22px 18px 16px;
  text-align: center;
  border-bottom: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
}

.space-avatar {
  margin: 0 auto 12px;
}

.space-name {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: var(--ui-text-primary-fg, var(--text));
}

.space-subtitle {
  display: block;
  margin-top: 3px;
  font-style: normal;
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.space-desc {
  margin: 12px 0 0;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--ui-text-secondary-fg, var(--text));
  text-align: left;
}

/* 资料块下的动作行(新):发消息 / 看线程。 */
.space-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 12px;
}

.space-error {
  margin-top: 8px;
  text-align: left;
}

.space-empty {
  margin: 0;
  padding: 18px 16px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ui-text-faint-fg, var(--muted));
}

.space-tabs {
  flex: 0 0 auto;
  display: flex;
  border-bottom: 1px solid var(--ui-border-subtle-border, var(--border-subtle, var(--border)));
}

.space-tab {
  flex: 1;
  padding: 11px 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.space-tab.is-on {
  font-weight: 600;
  color: var(--ui-text-primary-fg, var(--text));
  box-shadow: inset 0 -2px 0 var(--ui-text-primary-fg, var(--text));
}

.space-tab:hover {
  color: var(--ui-text-primary-fg, var(--text));
}

/* 四面的滚动容器(新)。滚动条只在鼠标进了这一栏时显形 —— 手法照抄
   styles/markdown.css 对代码块的处理。 */
.space-face {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.space-face:not(:hover)::-webkit-scrollbar-thumb,
.space-face:not(:hover) :deep(.editor-scroll)::-webkit-scrollbar-thumb {
  background: transparent;
}
</style>
