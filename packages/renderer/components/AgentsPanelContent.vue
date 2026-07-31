<template>
  <div class="agents-panel agent-ledger">
    <header class="ledger-header">
      <div class="ledger-heading">
        <h2 class="ledger-title">
          <span>Agents</span>
          <span class="ledger-count">{{ agentsStore.agents.length }}</span>
        </h2>
        <p class="ledger-sub">
          System prompts that shape each conversation.
        </p>
      </div>
      <div class="ledger-actions">
        <button
          class="text-action"
          type="button"
          @click="startCreate"
        >
          + new agent
        </button>
      </div>
    </header>

    <div
      class="agents-layout"
      :class="{ 'detail-active': agentDetailActive }"
    >
      <aside class="agents-list">
        <p
          v-if="agentsStore.isLoading"
          class="ledger-note"
        >
          loading…
        </p>
        <ErrorNote
          v-else-if="agentsStore.error"
          class="ledger-error"
          :message="agentsStore.error"
        />
        <p
          v-else-if="agentsStore.agents.length === 0"
          class="ledger-note"
        >
          No agents configured yet.
        </p>

        <!-- 在职与已退休分两栏(域模型 §3.2):退休的不消失,只是沉到下面灰着 ——
             管理页是唯一还能看见并恢复它们的地方。 -->
        <div class="ledger-body">
          <ol class="agent-rows">
            <li
              v-for="agent in agentsStore.activeAgents"
              :key="agent.id"
              class="agent-row"
              :class="{ 'is-active': !isCreating && agent.id === activeAgentId }"
            >
              <button
                class="row-line"
                type="button"
                @click="selectAgent(agent.id)"
              >
                <span
                  class="row-name"
                  :title="agent.name"
                >{{ agent.name }}</span>
                <span
                  v-if="agent.isDefault"
                  class="agent-chip"
                  title="Default agent"
                >default</span>
                <span
                  v-else
                  class="row-meta"
                >{{ formatUpdated(agent.updatedAt) }}</span>
              </button>
            </li>
          </ol>

          <template v-if="agentsStore.retiredAgents.length > 0">
            <p class="ledger-note agent-group-label">
              已退休 · {{ agentsStore.retiredAgents.length }}
            </p>
            <ol class="agent-rows">
              <li
                v-for="agent in agentsStore.retiredAgents"
                :key="agent.id"
                class="agent-row is-retired"
                :class="{ 'is-active': !isCreating && agent.id === activeAgentId }"
              >
                <button
                  class="row-line"
                  type="button"
                  @click="selectAgent(agent.id)"
                >
                  <span
                    class="row-name"
                    :title="agent.name"
                  >{{ agent.name }}</span>
                  <span
                    class="agent-chip"
                    title="已退休:不进任何社交面,记录保留"
                  >已注销</span>
                </button>
              </li>
            </ol>
          </template>
        </div>
      </aside>

      <section class="agent-editor">
        <div class="editor-header">
          <button
            class="text-action back-btn"
            type="button"
            title="Back to list"
            @click="agentDetailActive = false"
          >
            ‹ back
          </button>
          <div class="editor-title">
            <h3 :title="isCreating ? 'New Agent' : selectedAgent?.name || 'Agent'">
              {{ isCreating ? 'New Agent' : selectedAgent?.name || 'Agent' }}
            </h3>
            <span>{{ editorSubtitle }}</span>
          </div>
          <button
            v-if="canRestore"
            class="text-action"
            type="button"
            title="重新入职:回到同事名册与激活链"
            :disabled="saving"
            @click="restoreSelectedAgent"
          >
            恢复在职
          </button>
          <button
            v-if="canDelete"
            class="text-action is-danger"
            type="button"
            title="退休:退出社交面与激活链,记录保留(从未被引用过的才真删)"
            :disabled="saving"
            @click="deleteSelectedAgent"
          >
            退休
          </button>
        </div>

        <!-- 资料块(agent-im-chat-ui.md §3.2)。空间页 = "我与 TA"的那一页,
             进来第一眼得是**这个人**:大头像 + 名字 + 职位 + 说明,以及两个
             动作。小卡(AgentContactCard)因此退役 —— 它承接的就是这一块。
             草稿 agent 还不是一个人,没有资料可摆。 -->
        <div
          v-if="!isCreating && selectedAgent"
          class="agent-profile"
        >
          <AgentAvatar
            class="profile-avatar"
            aria-hidden="true"
            :avatar="selectedAgent.avatar"
            :avatar-image="selectedAgent.avatarImage"
            :size="44"
          />
          <div class="profile-heading">
            <span class="profile-name">{{ selectedAgent.name }}</span>
            <span
              v-if="selectedAgent.title"
              class="profile-title"
            >{{ selectedAgent.title }}</span>
            <!-- 墓碑(域模型 §3.2):身份还在,只是不再接活。 -->
            <span
              v-if="selectedRetired"
              class="profile-tombstone"
            >已注销 · 记录保留</span>
          </div>
          <div class="profile-actions">
            <button
              class="text-action"
              type="button"
              :title="selectedRetired ? '已退休:不再接活,也开不了新私聊' : `和${selectedAgent.name}发消息`"
              :disabled="selectedRetired || openingDm"
              @click="startDmChat"
            >
              {{ openingDm ? '打开中…' : '发消息' }}
            </button>
            <button
              class="text-action"
              type="button"
              title="TA 的心智与能力:提示词、工具、模型、边界"
              @click="detailTab = 'config'"
            >
              配置
            </button>
          </div>
        </div>
        <p
          v-if="!isCreating && selectedAgent?.description"
          class="profile-description"
        >
          {{ selectedAgent.description }}
        </p>
        <p
          v-if="!isCreating && historyError"
          class="field-hint profile-error"
        >
          {{ historyError }}
        </p>
        <!-- 退休 / 恢复 / 真删的结果:这三件事是名册面的动作,回执也归本页
             (保存那条在表单里)。 -->
        <ErrorNote
          v-if="lifecycleError"
          class="ledger-error profile-error"
          :message="lifecycleError"
        />
        <p
          v-else-if="lifecycleNote"
          class="ledger-note profile-error"
        >
          {{ lifecycleNote }}
        </p>

        <!-- 空间页四面(agent-im-chat-ui.md §3.2):配置 / 会话 / 文件 / 搜索。
             复用本页 .mode-switch 的画线开关句法,不再拉一套 Tabs 组件进来 ——
             这页整体是账页风,Tabs 的卡片皮不属于这儿。 -->
        <div
          v-if="!isCreating"
          class="mode-switch detail-tabs"
          role="tablist"
          aria-label="Agent 空间"
        >
          <template
            v-for="(tab, index) in DETAIL_TABS"
            :key="tab.key"
          >
            <span
              v-if="index > 0"
              class="mode-divider"
            />
            <button
              class="mode-option"
              :class="{ 'is-on': detailTab === tab.key }"
              type="button"
              role="tab"
              :aria-selected="detailTab === tab.key"
              @click="detailTab = tab.key"
            >
              {{ tab.label }}
            </button>
          </template>
        </div>

        <!-- 四面全部是共享件(agent-space-workbench.md P0):右栏空间页挂的是
             同一批组件,所以"在哪儿看到的账"永远是同一份。行的落点由本页决定
             —— 管理页盖在聊天区上,开完会话/文件必须把自己合上。 -->
        <AgentSessionsPane
          v-if="showSessions"
          :agent-id="historyAgentId"
          :agent-name="selectedAgent?.name"
          @open-session="openSessionAndClose"
        />

        <AgentFilesPane
          v-else-if="showFiles"
          :agent-id="historyAgentId"
          @open-file="openFileAndClose"
        />

        <AgentSearchPane
          v-else-if="showSearch"
          :agent-id="historyAgentId"
          :agent-name="selectedAgent?.name"
          @open-session="openSessionAndClose"
        />

        <AgentConfigForm
          v-show="showConfig"
          :agent="isCreating ? null : selectedAgent"
          :is-creating="isCreating"
          @saved="onAgentSaved"
          @cancel="onFormCancel"
          @open-session="openSessionAndClose"
        />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Agents 管理页 —— **名册面**:新建 / 退休 / 恢复 / 通览,外加"这个人"的四面。
 *
 * 四面(配置 / 会话 / 文件 / 搜索)本身不长在这里:它们是 `components/agents/`
 * 下的共享件,右栏空间页挂的是同一批(agent-space-workbench.md P0)。本页只负责
 * 名册那一栏、资料块、以及"行点开之后去哪"—— 这页盖在聊天区上,所以开完会话
 * 或文件必须把自己合上,而右栏那边原地不动。
 *
 * 视觉在 `styles/agent-space.css`(`.agent-ledger` 前缀):markup 搬进子组件之后
 * scoped 样式够不到内部元素,那份表就是为此抽出来的。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { DEFAULT_AGENT_ID, useAgentsStore, type AgentDetailTab } from '@/stores/agents'
import { useSessionsStore } from '@/stores/sessions'
import { useWorkspaceStore } from '@/stores/workspace'
import { isActiveAgent, type AgentDefinition } from '@shared/ipc'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import { COLLAB_TAG_OPEN_FILE_EVENT } from '@/composables/collabInlineTags'
import AgentConfigForm from '@/components/agents/AgentConfigForm.vue'
import AgentSessionsPane from '@/components/agents/AgentSessionsPane.vue'
import AgentFilesPane from '@/components/agents/AgentFilesPane.vue'
import AgentSearchPane from '@/components/agents/AgentSearchPane.vue'
import { useAgentDmOpener } from '@/components/agents/use-agent-dm'
import { formatUpdated } from '@/components/agents/use-agent-history'
import '@/styles/agent-space.css'

const agentsStore = useAgentsStore()
const sessionsStore = useSessionsStore()
const workspaceStore = useWorkspaceStore()

/* 开出去的会话在聊天区,而这个面板正盖在聊天区上 —— 不合上就等于什么都没发生。 */
const emit = defineEmits<{ close: [] }>()

const activeAgentId = ref(DEFAULT_AGENT_ID)
const isCreating = ref(false)
/** 退休 / 恢复 正在写盘(保存是表单自己的事)。 */
const saving = ref(false)
/** 这两件事的回执。名册面的动作在名册面报账,别塞进表单。 */
const lifecycleNote = ref('')
const lifecycleError = ref('')
const agentDetailActive = ref(false)

const selectedAgent = computed(() =>
  agentsStore.agents.find(agent => agent.id === activeAgentId.value) ||
  agentsStore.defaultAgent
)

/**
 * 生命周期(agent-domain-model.md §3.2)。管理页是这两个动作的**唯一**入口:
 * 「删除」按钮实际上是退休(被引用过的 agent 永不硬删),而恢复只在这儿。
 * default agent 两条都不给 —— 后端也硬拒,这里只是不让人白点。
 */
const selectedRetired = computed(() =>
  !!selectedAgent.value && !isActiveAgent(selectedAgent.value))

const canDelete = computed(() =>
  !isCreating.value &&
  !!selectedAgent.value &&
  selectedAgent.value.id !== DEFAULT_AGENT_ID &&
  !selectedRetired.value
)

const canRestore = computed(() =>
  !isCreating.value &&
  !!selectedAgent.value &&
  selectedAgent.value.id !== DEFAULT_AGENT_ID &&
  selectedRetired.value
)

const editorSubtitle = computed(() => {
  if (isCreating.value) return 'draft'
  if (selectedRetired.value) return '已注销 · 记录保留'
  return selectedAgent.value?.isDefault ? 'default agent' : 'custom agent'
})

/** 空间页四面(agent-im-chat-ui.md §3.2)。顺序即心智:先是谁,再是聊过什么。 */
const DETAIL_TABS: ReadonlyArray<{ key: AgentDetailTab; label: string }> = [
  { key: 'config', label: '配置' },
  { key: 'sessions', label: '会话' },
  { key: 'files', label: '文件' },
  { key: 'search', label: '搜索' },
]

const detailTab = ref<AgentDetailTab>('config')
/* 草稿 agent 只有配置那一面 —— 还没有 id,就还没有会话、文件与可搜的东西。 */
const showSessions = computed(() => !isCreating.value && detailTab.value === 'sessions')
const showFiles = computed(() => !isCreating.value && detailTab.value === 'files')
const showSearch = computed(() => !isCreating.value && detailTab.value === 'search')
const showConfig = computed(() => isCreating.value || detailTab.value === 'config')

/** 草稿 agent 还没有 id,自然也没有历史。 */
const historyAgentId = computed(() => (isCreating.value ? '' : selectedAgent.value?.id || ''))

/* ---- 资料块的两个动作 ---- */

const { openingDm, dmError: historyError, openDmRoom } = useAgentDmOpener()

/**
 * 「发消息」= 联系人区同一条链路(幂等建房 → 刷新列表 → 打开),不是配置面里
 * 那个「私聊」(那开的是绑 agent 的普通直聊会话)。
 */
async function startDmChat(): Promise<void> {
  const sessionId = await openDmRoom(historyAgentId.value)
  if (sessionId) openSessionAndClose(sessionId)
}

function openSessionAndClose(sessionId: string): void {
  if (!sessionId) return
  workspaceStore.openSession(sessionId)
  emit('close')
}

/** 点开走既有 openFile 链路(>1MB / 二进制的降级在那条链路上现成)。 */
function openFileAndClose(filePath: string): void {
  if (!filePath) return
  window.dispatchEvent(new CustomEvent(COLLAB_TAG_OPEN_FILE_EVENT, { detail: { filePath } }))
  emit('close')
}

/* ---- 名册 ---- */

/** 侧栏「配置 Agent」跳进来时把详情页停在那个 agent 上,并把请求吃掉 —— 否则
    下次再打开面板会莫名其妙又跳一次。 */
function consumePendingAgentDetail() {
  if (!agentsStore.pendingDetailAgentId) return
  // 先读 tab 再 consume:consume 会把 agentId 和 tab 一起清掉。
  const tab = agentsStore.pendingDetailTab
  const agentId = agentsStore.consumeAgentDetailRequest()
  if (!agentId) return
  selectAgent(agentId)
  if (tab) detailTab.value = tab
}

watch(() => agentsStore.pendingDetailAgentId, consumePendingAgentDetail)

function selectAgent(agentId: string) {
  isCreating.value = false
  activeAgentId.value = agentId
  agentDetailActive.value = true
  lifecycleNote.value = ''
  lifecycleError.value = ''
}

function startCreate() {
  isCreating.value = true
  activeAgentId.value = ''
  agentDetailActive.value = true
  detailTab.value = 'config'
}

/** 表单存完:草稿转正就把选中态挪到新人身上。 */
function onAgentSaved(agent: AgentDefinition) {
  isCreating.value = false
  activeAgentId.value = agent.id
}

function onFormCancel() {
  if (isCreating.value) {
    isCreating.value = false
    activeAgentId.value = agentsStore.defaultAgent?.id || DEFAULT_AGENT_ID
  }
  agentDetailActive.value = false
}

/**
 * 「删除」的两种结局(域模型 §3.2):被引用过 → 退休(留下墓碑,历史署名、房间
 * 成员条、履历照旧读得出);从未被引用过 → 真删掉。
 *
 * 确认文案在点之前就分岔,因为这两件事对用户是两个决定 —— 用一句「Delete?」
 * 盖住"其实只是退休"会让人以为记录被抹了,反过来也会让人以为还找得回来。
 */
async function deleteSelectedAgent() {
  const agent = selectedAgent.value
  if (!agent || agent.id === DEFAULT_AGENT_ID) return
  if (!window.confirm(
    `让 ${agent.name} 退休?\n\n`
    + 'TA 会从同事名册、群成员候选与激活链里退出,不再被指派和发言。\n'
    + '历史消息署名、群成员条与履历全部保留 —— 从未被任何会话引用过的话,才会真删除。'
  )) return

  saving.value = true
  lifecycleNote.value = ''
  lifecycleError.value = ''
  try {
    const outcome = await agentsStore.deleteAgent(agent.id)
    if (outcome === 'deleted') {
      activeAgentId.value = agentsStore.defaultAgent?.id || agentsStore.agents[0]?.id || DEFAULT_AGENT_ID
    }
    isCreating.value = false
    // 退休的 agent 还在名册里(灰显),留在选中态上,恢复入口就在原地。
    lifecycleNote.value = outcome === 'retired' ? '已退休(记录保留)' : '已删除(从未被引用)'
  } catch (err: any) {
    lifecycleError.value = err?.message || 'Failed to retire agent'
  } finally {
    saving.value = false
  }
}

/** 重新入职(§8):status 翻回 active,身份/心智/能力三面一字不动。 */
async function restoreSelectedAgent() {
  const agent = selectedAgent.value
  if (!agent || agent.id === DEFAULT_AGENT_ID) return

  saving.value = true
  lifecycleNote.value = ''
  lifecycleError.value = ''
  try {
    await agentsStore.restoreAgent(agent.id)
    lifecycleNote.value = '已恢复在职'
  } catch (err: any) {
    lifecycleError.value = err?.message || 'Failed to restore agent'
  } finally {
    saving.value = false
  }
}

/* 群聊/直聊列表只在配置面的「Conversations」里用到,那块已经进了表单;这里留
   sessionsStore 只为让四面共用的 store 在本页也已初始化。 */
void sessionsStore

onMounted(async () => {
  try {
    await agentsStore.loadAgents()
    if (!agentsStore.agents.some(agent => agent.id === activeAgentId.value)) {
      activeAgentId.value = agentsStore.defaultAgent?.id || agentsStore.agents[0]?.id || DEFAULT_AGENT_ID
    }
  } catch {
    // Store error is rendered above.
  }

  /* 懒挂载的这一刻请求可能已经躺在 store 里了(侧栏先寄存再开面板),watch 不
     会为一个挂载前就存在的值触发,所以这里主动取一次。 */
  consumePendingAgentDetail()
})
</script>

<style scoped>
/*
 * Agents ledger — 画线风.
 * No background fills, no radii: state lives in the line.
 * Agents hang as numbered rows on one vertical ink rule;
 * the editor is a plain sheet with rule-hung field labels.
 */
.agents-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--ui-text-primary-fg, var(--text-primary));
  background: transparent;
  animation: ledger-fade 0.15s ease;
  container-type: inline-size;
}

@keyframes ledger-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ---- header ---- */
.ledger-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 45%, transparent);
}

.ledger-heading {
  min-width: 0;
}

.ledger-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  font-family: var(--font-display, var(--font-serif, serif));
  font-size: 15px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.ledger-title > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-count {
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  font-weight: var(--font-weight-normal, 400);
  color: var(--ui-text-faint-fg, var(--muted));
}

.ledger-sub {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-actions {
  display: flex;
  gap: 16px;
  flex-shrink: 0;
  padding-bottom: 2px;
}

/* ---- layout ---- */
.agents-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(200px, 290px) minmax(0, 1fr);
  gap: 20px;
  padding: 12px 18px 18px;
  position: relative;
  overflow: hidden;
}

/* The vertical ink rule the rows hang on */
.ledger-body {
  position: relative;
  padding-left: 16px;
  margin-top: 6px;
}

.ledger-body::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 6px;
  bottom: 6px;
  width: 1px;
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 72%, transparent);
}

/* ---- agent rows (register numbering) ---- */
.agent-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  counter-reset: agent-row;
}

.agent-row {
  position: relative;
  counter-increment: agent-row;
  border-top: 1px solid color-mix(in srgb, var(--ui-tool-border-border, var(--border-subtle, var(--border))) 32%, transparent);
}

.agent-row:first-child {
  border-top: none;
}

/* Tick hanging each row on the rule */
.agent-row::before {
  content: '';
  position: absolute;
  left: -13px;
  top: 50%;
  width: 7px;
  height: 1px;
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
  transition: width 0.12s ease, height 0.12s ease, background-color 0.12s ease;
}

.agent-row:hover::before {
  width: 12px;
  background: var(--ui-text-muted-fg, var(--text-muted));
}

/* Active agent: heavier accent tick + accent figure number */
.agent-row.is-active::before {
  width: 14px;
  height: 2px;
  background: var(--ui-accent-primary-fg, var(--accent));
}

/* 已退休:整行压暗、徽标转中性墨色。行还在(才点得进去恢复),只是不再是在职
   的那一栏 —— 分组标题已经说了这是哪一栏,所以这里只需要一层灰。 */
.agent-row.is-retired .row-name {
  color: var(--ui-text-muted-fg, var(--text-muted));
}

.agent-row.is-retired .agent-chip {
  border-color: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 45%, transparent);
  color: var(--ui-text-muted-fg, var(--text-muted));
}

/* 分组标题:一行 10px 的墨字,不是 section 头 —— 名册只有一张,分栏是它的内部
   秩序。上面留一道呼吸,免得贴在最后一行的横线上。 */
.agent-group-label {
  margin-top: 14px;
}

.row-line {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  min-height: 30px;
  padding: 6px 0;
  appearance: none;
  background: transparent;
  border: none;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

/* Figure number, like rows on a blueprint sheet */
.row-line::before {
  content: counter(agent-row, decimal-leading-zero);
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--muted));
  flex-shrink: 0;
  min-width: 16px;
}

.agent-row.is-active .row-line::before {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.row-meta {
  flex-shrink: 0;
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--muted));
  white-space: nowrap;
}

/* ---- editor sheet ---- */
.agent-editor {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
}

.editor-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 8px 0 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent);
}

.agent-editor .back-btn {
  display: none; /* shown in stacked/side mode only */
  flex-shrink: 0;
}

.editor-title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.editor-title h3 {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-display, var(--font-serif, serif));
  font-size: 15px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.editor-title span {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--muted));
  white-space: nowrap;
}

/* ── 资料块(agent-im-chat-ui.md §3.2)──────────────────────────────────
   空间页的第一眼是"这个人":一枚圆章 + 名字 + 职位 + 两个动作。画线风照旧 ——
   一条发丝线收底,没有卡片皮,没有阴影。 */
.agent-profile {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 45%, transparent);
}

/* 画线圆章,与成员章、退役的联系人卡同一句法。 */
.profile-avatar {
  flex: 0 0 44px;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 32%, transparent);
  border-radius: 50%;
  font-size: 21px;
  line-height: 1;
}

.profile-avatar.agent-avatar-image {
  border-radius: 50%;
}

.profile-heading {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.profile-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--ui-text-primary-fg, var(--text));
}

.profile-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
}

/* 墓碑:压暗一档,身份还在。 */
.profile-tombstone {
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--ui-text-faint-fg, var(--muted));
}

.profile-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 14px;
}

.profile-description {
  flex: 0 0 auto;
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--muted)));
}

.profile-error {
  flex: 0 0 auto;
  margin-top: 6px;
}

/* ── 履历页(agent-im-dm.md §4.2)────────────────────────────────────────
   行 = 会话,列 = 名称 / 最后活跃 / 条数。整块沿用上面「TA 的群聊」那套画线
   排版(.agent-room-line 的语言),只多了副标注与两列数字,所以这里写的都是
   增量,不是第二套行样式。 */
.detail-tabs {
  flex: 0 0 auto;
  align-self: flex-start;
  padding: 10px 0 0;
}

.text-action:focus-visible,
.row-line:focus-visible {
  outline: 1px solid var(--ui-accent-primary-fg, var(--accent));
  outline-offset: 2px;
}

/* ---- stacked slide layout (workspace side panel) ---- */
.mode-side .agents-layout {
  display: block;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding: 8px 12px 12px;
}

.mode-side .agents-list {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  padding: 8px 12px 12px;
  box-sizing: border-box;
  transform: translateX(0);
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 1;
}

.mode-side .agent-editor {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  padding: 0 12px 12px;
  box-sizing: border-box;
  transform: translateX(100%);
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 2;
  background: var(--ui-surface-panel-bg, var(--bg-panel));
}

.mode-side .detail-active .agents-list {
  transform: translateX(-20%);
}

.mode-side .detail-active .agent-editor {
  transform: translateX(0);
}

.mode-side .agent-editor .back-btn {
  display: inline-block;
}

/* Narrow panel (not just narrow viewport): stack list/editor as slide-over */
@container (max-width: 640px) {
  .agents-layout {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    padding: 8px 12px 12px;
  }

  .agents-list {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    padding: 8px 12px 12px;
    box-sizing: border-box;
    transform: translateX(0);
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 1;
  }

  .agent-editor {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    padding: 0 12px 12px;
    box-sizing: border-box;
    transform: translateX(100%);
    transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 2;
    background: var(--ui-surface-panel-bg, var(--bg-panel));
  }

  .detail-active .agents-list {
    transform: translateX(-20%);
  }

  .detail-active .agent-editor {
    transform: translateX(0);
  }

  .agent-editor .back-btn {
    display: inline-block;
  }
}

@media (prefers-reduced-motion: reduce) {
  .agents-panel {
    animation: none;
  }

  .agents-list,
  .agent-editor,
  .mode-side .agents-list,
  .mode-side .agent-editor {
    transition: none;
  }
}


/* ---- list column ---- */
.agents-list {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 2px 8px 0;
  background: transparent;
}

/* 名册栏的滚动条(原本与 .editor-scroll 合写一条,后者已进 agent-space.css)。 */
.agents-list::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.agents-list::-webkit-scrollbar-track {
  background: transparent;
}

.agents-list::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 18%, transparent);
}

.agents-list::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 32%, transparent);
}
</style>
