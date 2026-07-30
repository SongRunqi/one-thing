<template>
  <div class="agents-panel">
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

        <!-- 「会话」面(原履历页,§4.2)。四栏全部 renderer 端现算(D8),归类
             口径在 sessions store 的 agentPresence / agentDirectChatSessions,
             这里只画。退休的 agent 照常可读 —— 历史正是保留身份面的全部意义。 -->
        <div
          v-if="showSessions"
          class="editor-scroll"
        >
          <div class="editor-body agent-history">
            <section
              v-for="column in historyColumns"
              :key="column.key"
              class="agent-field history-column"
            >
              <div class="prompt-header">
                <span class="field-label">{{ column.label }}</span>
                <span
                  v-if="column.rows.length > 0"
                  class="prompt-counter"
                >{{ column.rows.length }}</span>
              </div>

              <template v-if="column.rows.length === 0">
                <p class="field-hint">
                  {{ column.empty }}
                </p>
                <button
                  v-if="column.key === 'conversations'"
                  class="text-action"
                  type="button"
                  :disabled="openingDm"
                  @click="startDmChat"
                >
                  {{ openingDm ? '打开中…' : '发起对话' }}
                </button>
              </template>

              <ol
                v-else
                class="history-rows"
              >
                <li
                  v-for="row in column.rows"
                  :key="row.sessionId"
                >
                  <button
                    class="history-line"
                    type="button"
                    :title="historyRowTitle(row)"
                    @click="openHistoryRow(row)"
                  >
                    <span class="history-name">{{ row.label }}</span>
                    <span
                      v-if="row.note"
                      class="history-note"
                    >{{ row.note }}</span>
                    <span
                      v-if="row.updatedAt > 0"
                      class="history-meta"
                    >{{ formatUpdated(row.updatedAt) }}</span>
                    <span
                      v-if="row.messageCount > 0"
                      class="history-meta history-count"
                    >{{ row.messageCount }} 条</span>
                  </button>
                </li>
              </ol>
            </section>

            <!-- 干过的活:按卡分组。卡状态不入这份快照(Q4 纪律,状态一律现查),
                 标题查不到就退到短号 —— 宁可少说,不能说错。 -->
            <section class="agent-field history-column">
              <div class="prompt-header">
                <span class="field-label">干过的活</span>
                <span
                  v-if="agentHistory.work.length > 0"
                  class="prompt-counter"
                >{{ agentHistory.work.length }}</span>
              </div>
              <p
                v-if="agentHistory.work.length === 0"
                class="field-hint"
              >
                还没有开过工作台。
              </p>
              <template v-else>
                <div
                  v-for="group in agentHistory.work"
                  :key="group.taskId || group.rows[0]?.sessionId"
                  class="history-group"
                >
                  <span class="history-group-title">{{ group.title }}</span>
                  <ol class="history-rows">
                    <li
                      v-for="row in group.rows"
                      :key="row.sessionId"
                    >
                      <button
                        class="history-line"
                        type="button"
                        :title="historyRowTitle(row)"
                        @click="openHistoryRow(row)"
                      >
                        <span class="history-name">{{ row.label }}</span>
                        <span
                          v-if="row.updatedAt > 0"
                          class="history-meta"
                        >{{ formatUpdated(row.updatedAt) }}</span>
                        <span
                          v-if="row.messageCount > 0"
                          class="history-meta history-count"
                        >{{ row.messageCount }} 条</span>
                      </button>
                    </li>
                  </ol>
                </div>
              </template>
            </section>
          </div>
        </div>

        <!-- 「文件」面(agent-im-chat-ui.md §3.2)。两组:私聊房 folder 里的东西
             (主进程列目录,folder 的位置只有它算得出),以及卡上按代码统计出来
             的交付物(看板既有数据,不新增账)。列表不是文件管理器:只读、点开
             走既有 openFile 链路(>1MB/二进制的降级在那条链路上现成)。 -->
        <div
          v-if="showFiles"
          class="editor-scroll"
        >
          <div class="editor-body agent-files">
            <section class="agent-field files-column">
              <div class="prompt-header">
                <span class="field-label">私聊文件</span>
                <span
                  v-if="roomFiles.length > 0"
                  class="prompt-counter"
                >{{ roomFiles.length }}</span>
              </div>

              <p
                v-if="filesLoading"
                class="field-hint"
              >
                读取中…
              </p>
              <p
                v-else-if="filesError"
                class="field-hint"
              >
                {{ filesError }}
              </p>
              <p
                v-else-if="roomFiles.length === 0"
                class="field-hint"
              >
                {{ roomFilesEmptyHint }}
              </p>
              <ol
                v-else
                class="history-rows"
              >
                <li
                  v-for="file in roomFiles"
                  :key="file.path"
                >
                  <button
                    class="history-line"
                    type="button"
                    :title="file.path"
                    @click="openFilePath(file.path)"
                  >
                    <span class="history-name">{{ file.relativePath }}</span>
                    <span
                      v-if="file.mtimeMs > 0"
                      class="history-meta"
                    >{{ formatUpdated(file.mtimeMs) }}</span>
                    <span class="history-meta history-count">{{ formatFileSize(file.size) }}</span>
                  </button>
                </li>
              </ol>
              <p
                v-if="filesTruncated"
                class="field-hint"
              >
                文件太多,只列了最近改动的 {{ roomFiles.length }} 个。
              </p>
            </section>

            <!-- 交付物按卡分组。路径是卡记下来的(相对该群 folder),群没有工作
                 目录时还原不出绝对路径 —— 那一行就不给点,而不是点了打不开。 -->
            <section class="agent-field files-column">
              <div class="prompt-header">
                <span class="field-label">交付物</span>
                <span
                  v-if="evidenceGroups.length > 0"
                  class="prompt-counter"
                >{{ evidenceGroups.length }}</span>
              </div>

              <p
                v-if="evidenceGroups.length === 0"
                class="field-hint"
              >
                卡上还没有记下交付物。
              </p>
              <div
                v-for="group in evidenceGroups"
                :key="group.taskId"
                class="history-group"
              >
                <span class="history-group-title">{{ group.title }}</span>
                <ol class="history-rows">
                  <li
                    v-for="file in group.files"
                    :key="file.label"
                  >
                    <button
                      v-if="file.path"
                      class="history-line"
                      type="button"
                      :title="file.path"
                      @click="openFilePath(file.path)"
                    >
                      <span class="history-name">{{ file.label }}</span>
                    </button>
                    <span
                      v-else
                      class="history-line is-inert"
                      title="这张卡所在的群还没有工作目录,还原不出绝对路径"
                    >
                      <span class="history-name">{{ file.label }}</span>
                    </span>
                  </li>
                </ol>
              </div>
            </section>
          </div>
        </div>

        <!-- 「搜索」面(agent-im-chat-ui.md §3.2)。P2 只做**本地过滤**:范围与
             「会话」面同一口径(presence ∪ 直聊),匹配会话名/群名/卡标题 ——
             会话元数据本来就在手里,不加载一条消息正文。消息全文检索是 P3
             (接 Search Everywhere 加 scope),所以这里明说,不做假全文。 -->
        <div
          v-if="showSearch"
          class="editor-scroll"
        >
          <div class="editor-body agent-search">
            <div class="agent-field">
              <input
                v-model="searchQuery"
                class="ledger-input"
                type="search"
                autocomplete="off"
                spellcheck="false"
                :placeholder="`在与${selectedAgent?.name || 'TA'}的会话里找…`"
              >
              <p class="field-hint">
                只匹配会话名、群名与卡标题。消息全文搜索是后续能力。
              </p>
            </div>

            <section class="agent-field">
              <div class="prompt-header">
                <span class="field-label">结果</span>
                <span
                  v-if="searchResults.length > 0"
                  class="prompt-counter"
                >{{ searchResults.length }}</span>
              </div>

              <p
                v-if="!searchQuery.trim()"
                class="field-hint"
              >
                输入关键词开始查找。
              </p>
              <p
                v-else-if="searchResults.length === 0"
                class="field-hint"
              >
                没有匹配的会话。
              </p>
              <ol
                v-else
                class="history-rows"
              >
                <li
                  v-for="row in searchResults"
                  :key="row.sessionId"
                >
                  <button
                    class="history-line"
                    type="button"
                    :title="historyRowTitle(row)"
                    @click="openHistoryRow(row)"
                  >
                    <span class="history-name">{{ row.label }}</span>
                    <span
                      v-if="row.note"
                      class="history-note"
                    >{{ row.note }}</span>
                    <span
                      v-if="row.updatedAt > 0"
                      class="history-meta"
                    >{{ formatUpdated(row.updatedAt) }}</span>
                  </button>
                </li>
              </ol>
            </section>
          </div>
        </div>

        <div
          v-show="showConfig"
          class="editor-scroll"
        >
          <div class="editor-body">
            <label class="agent-field">
              <span class="field-label">Name</span>
              <input
                v-model="formName"
                class="ledger-input"
                type="text"
                autocomplete="off"
                spellcheck="false"
              >
            </label>

            <!-- 身份:群聊花名册、消息署名、看板都读这两个字段。留空即不署身份。 -->
            <div class="agent-identity-row">
              <!-- maxlength 数的是 UTF-16 码元:👨‍💻 这类 ZWJ 组合要 5 个以上,卡太紧会打不出来。 -->
              <label class="agent-field agent-field-avatar">
                <span class="field-label">Avatar</span>
                <input
                  v-model="formAvatar"
                  class="ledger-input avatar-input"
                  type="text"
                  maxlength="16"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="🤖"
                >
              </label>

              <!-- 图片头像。emoji 永远留着当回退(图片没了、别的纯文本行要用),
                   所以这是"另加一层",不是"换掉那个输入框"。 -->
              <div class="agent-field agent-field-avatar-image">
                <span class="field-label">Picture</span>
                <div class="avatar-image-row">
                  <AgentAvatar
                    class="avatar-image-preview"
                    :avatar="formAvatar"
                    :avatar-image="formAvatarImage"
                    :size="28"
                  />
                  <button
                    class="text-action"
                    type="button"
                    :disabled="avatarImageBusy"
                    @click="pickAvatarImage"
                  >
                    {{ avatarImageBusy ? '…' : (formAvatarImage ? 'replace' : 'choose') }}
                  </button>
                  <button
                    v-if="formAvatarImage"
                    class="text-action"
                    type="button"
                    :disabled="avatarImageBusy"
                    @click="clearAvatarImage"
                  >
                    clear
                  </button>
                </div>
                <input
                  ref="avatarFileInputRef"
                  class="avatar-file-input"
                  type="file"
                  accept="image/*"
                  @change="onAvatarFileChosen"
                >
              </div>

              <label class="agent-field agent-field-title">
                <span class="field-label">Role</span>
                <input
                  v-model="formTitle"
                  class="ledger-input"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="e.g. 产品经理"
                >
              </label>
            </div>

            <!-- 找 TA 说话的两个出口。执行会话不在这里:那是禁输入的基础设施
                 视图(侧栏「执行现场」),从这儿点出去的一律是能说话的会话。
                 草稿 agent 还没有 id,自然也还没有会话可开。 -->
            <div
              v-if="!isCreating && selectedAgent"
              class="agent-field agent-conversations"
            >
              <div class="prompt-header">
                <span class="field-label">Conversations</span>
                <button
                  class="text-action"
                  type="button"
                  title="开一条只有你和 TA 的普通会话(可输入)"
                  :disabled="openingChat"
                  @click="openPrivateChat"
                >
                  {{ openingChat ? '打开中…' : '私聊' }}
                </button>
              </div>

              <p
                v-if="conversationError"
                class="field-hint"
              >
                {{ conversationError }}
              </p>

              <div class="agent-rooms">
                <span class="rooms-label">TA 的群聊</span>
                <p
                  v-if="agentRooms.length === 0"
                  class="field-hint"
                >
                  还没有加入任何群聊。
                </p>
                <ol
                  v-else
                  class="agent-room-rows"
                >
                  <li
                    v-for="room in agentRooms"
                    :key="room.id"
                  >
                    <button
                      class="agent-room-line"
                      type="button"
                      :title="`打开群聊「${room.name}」`"
                      @click="openRoom(room.id)"
                    >
                      <span class="agent-room-name">群「{{ room.name }}」</span>
                      <span
                        v-if="room.isPm"
                        class="agent-chip"
                        title="本群负责人"
                      >PM</span>
                    </button>
                  </li>
                </ol>
              </div>
            </div>

            <div class="agent-field">
              <div class="prompt-header">
                <span class="field-label">System Prompt</span>
                <span class="prompt-counters">
                  <span class="prompt-counter">{{ formPrompt.length }} chars</span>
                  <span class="prompt-counter">{{ wordCount(formPrompt) }} words</span>
                </span>
              </div>

              <div class="prompt-templates">
                <span class="templates-label">templates</span>
                <button
                  v-for="tpl in promptTemplates"
                  :key="tpl.name"
                  class="text-action template-action"
                  type="button"
                  :title="`Use the ${tpl.name} template`"
                  @click="applyTemplate(tpl.prompt)"
                >
                  {{ tpl.name }}
                </button>
              </div>

              <textarea
                v-model="formPrompt"
                class="ledger-textarea"
                rows="14"
                spellcheck="true"
                placeholder="Instruct the AI on how it should behave..."
              />
            </div>

            <div class="agent-field">
              <div class="prompt-header">
                <span class="field-label">Tools</span>
                <span class="prompt-counters">
                  <span class="prompt-counter">{{ toolSummary }}</span>
                </span>
              </div>

              <div
                class="mode-switch"
                role="radiogroup"
                aria-label="Tool access"
              >
                <button
                  class="mode-option"
                  :class="{ 'is-on': followsGlobalTools }"
                  type="button"
                  role="radio"
                  :aria-checked="followsGlobalTools"
                  @click="setToolMode('global')"
                >
                  follow global
                </button>
                <span class="mode-divider" />
                <button
                  class="mode-option"
                  :class="{ 'is-on': !followsGlobalTools }"
                  type="button"
                  role="radio"
                  :aria-checked="!followsGlobalTools"
                  @click="setToolMode('allowlist')"
                >
                  allowlist
                </button>
              </div>

              <p class="field-hint">
                Work sessions always add the board tool — the collaboration protocol depends on it.
              </p>

              <template v-if="!followsGlobalTools">
                <p
                  v-if="toolsLoading"
                  class="field-hint"
                >
                  loading tools…
                </p>
                <p
                  v-else-if="toolChoices.length === 0"
                  class="field-hint"
                >
                  No tools available.
                </p>
                <div
                  v-else
                  class="tool-grid"
                >
                  <button
                    v-for="tool in toolChoices"
                    :key="tool.id"
                    class="tool-line"
                    :class="{ 'is-on': isToolOn(tool.id) }"
                    type="button"
                    role="checkbox"
                    :aria-checked="isToolOn(tool.id)"
                    :title="tool.description || tool.id"
                    @click="onToggleTool(tool.id)"
                  >
                    <span class="tool-name">{{ tool.name }}</span>
                    <span
                      v-if="tool.note"
                      class="tool-note"
                    >{{ tool.note }}</span>
                  </button>
                </div>
              </template>
            </div>

            <div class="agent-field">
              <span class="field-label">Model</span>

              <div class="model-row">
                <span class="model-row-label">provider</span>
                <select
                  v-model="formModelProvider"
                  class="ledger-select"
                  @change="onModelProviderChange"
                >
                  <option value="">
                    follow session default
                  </option>
                  <option
                    v-for="provider in providerChoices"
                    :key="provider.id"
                    :value="provider.id"
                  >
                    {{ provider.name }}
                  </option>
                </select>
                <button
                  v-if="formModelProvider"
                  class="text-action"
                  type="button"
                  title="Follow the session default again"
                  @click="clearModelBinding"
                >
                  clear
                </button>
              </div>

              <div class="model-row">
                <span class="model-row-label">model</span>
                <select
                  v-model="formModelId"
                  class="ledger-select"
                  :disabled="!formModelProvider"
                >
                  <option value="">
                    provider default
                  </option>
                  <option
                    v-for="model in modelChoices"
                    :key="model.id"
                    :value="model.id"
                  >
                    {{ model.name }}
                  </option>
                </select>
              </div>

              <p
                v-if="modelWarning"
                class="field-hint"
              >
                {{ modelWarning }}
              </p>
            </div>

            <div class="agent-field">
              <span class="field-label">Boundaries</span>

              <div class="model-row">
                <span class="model-row-label">approvals</span>
                <select
                  v-model="formPermissionMode"
                  class="ledger-select"
                >
                  <option
                    v-for="choice in permissionModeChoices"
                    :key="choice.value"
                    :value="choice.value"
                  >
                    {{ choice.label }}
                  </option>
                </select>
              </div>
              <p class="field-hint">
                {{ permissionModeHint }}
              </p>

              <div class="model-row">
                <span class="model-row-label">turns</span>
                <select
                  v-model="formTurnBudget"
                  class="ledger-select"
                >
                  <option
                    v-for="choice in turnBudgetOptions"
                    :key="choice.value"
                    :value="choice.value"
                  >
                    {{ choice.label }}
                  </option>
                </select>
              </div>
              <p class="field-hint">
                Model round-trips this agent may spend on one run.
              </p>
            </div>

            <ErrorNote
              v-if="formError"
              class="ledger-error form-note"
              :message="formError"
            />
            <p
              v-else-if="formFeedback"
              class="ledger-note form-note"
            >
              {{ formFeedback }}
            </p>
          </div>
        </div>

        <!-- 会话/文件/搜索都是只读的面:cancel/save 属于配置那一面,跟着走会
             读成"能保存历史"。 -->
        <div
          v-show="showConfig"
          class="editor-footer"
        >
          <button
            class="text-action"
            type="button"
            :disabled="saving"
            @click="resetForm"
          >
            cancel
          </button>
          <button
            class="text-action is-primary"
            type="button"
            :disabled="saving"
            @click="saveAgent"
          >
            {{ saving ? 'saving…' : 'save' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { DEFAULT_AGENT_ID, useAgentsStore, type AgentDetailTab } from '@/stores/agents'
import { useCollabBoardStore } from '@/stores/collabBoard'
import { useSessionsStore } from '@/stores/sessions'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSettingsStore } from '@/stores/settings'
import { useMediaStore } from '@/stores/media'
import { isProviderConfigEnabled } from '@/stores/helpers/provider-model'
import { platformApi } from '@/platform'
import { providerFamilyDisplayName } from '@shared/provider-families'
import { isActiveAgent, type CollabRoomFolderEntry, type PermissionMode } from '@shared/ipc'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import { buildAgentHistory, type AgentHistoryRow } from '@/utils/agent-sessions'
import { COLLAB_TAG_OPEN_FILE_EVENT } from '@/composables/collabInlineTags'
import { resolveDeliverablePath } from '@/components/workbench/collab-board-card'
import {
  AGENT_PERMISSION_MODE_CHOICES,
  enterAllowlistMode,
  isFollowGlobal,
  isToolSelected,
  leaveAllowlistMode,
  modelBindingPayload,
  permissionModePayload,
  readToolAllowlist,
  readTurnBudget,
  toggleTool,
  toolAllowlistPayload,
  turnBudgetChoices,
  turnBudgetPayload,
  validateToolAllowlist,
  type ToolAllowlistState,
} from '@/components/agents/agent-config-form'

const agentsStore = useAgentsStore()
const settingsStore = useSettingsStore()
const sessionsStore = useSessionsStore()
const workspaceStore = useWorkspaceStore()

/* 开出去的会话在聊天区,而这个面板正盖在聊天区上 —— 不合上就等于什么都没发生。 */
const emit = defineEmits<{ close: [] }>()

const activeAgentId = ref(DEFAULT_AGENT_ID)
const isCreating = ref(false)
const saving = ref(false)
const formName = ref('')
const formTitle = ref('')
const formAvatar = ref('')
/** Media library file name (see AgentDefinition.avatarImage), '' = emoji only. */
const formAvatarImage = ref('')
const formPrompt = ref('')
const formError = ref('')
const formFeedback = ref('')
const formTools = ref<ToolAllowlistState>(null)
const formModelProvider = ref('')
const formModelId = ref('')
const formModelThinking = ref('')
const formPermissionMode = ref('')
const formTurnBudget = ref('inherit')

/* Only the picker-facing fields: ToolDefinition carries a recursive JSON-schema
   type that makes Ref unwrapping explode (TS2589). */
interface ToolChoice {
  id: string
  name: string
  description: string
  /** Secondary mono label: the raw id, or why the id no longer resolves. */
  note: string
}

const availableTools = ref<ToolChoice[]>([])
const toolsLoading = ref(false)

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

function syncFormFromSelected() {
  if (isCreating.value) return
  const agent = selectedAgent.value
  formName.value = agent?.name || ''
  formTitle.value = agent?.title || ''
  formAvatar.value = agent?.avatar || ''
  formAvatarImage.value = agent?.avatarImage || ''
  formPrompt.value = agent?.systemPrompt || ''
  formTools.value = readToolAllowlist(agent?.tools)
  formModelProvider.value = agent?.model?.providerId || ''
  formModelId.value = agent?.model?.modelId || ''
  formModelThinking.value = agent?.model?.thinking || ''
  formPermissionMode.value = agent?.permissionMode || ''
  formTurnBudget.value = readTurnBudget(agent?.maxTurns)
}

/* ---- picture avatar (todo2-fix-plan P2) ----
 *
 * The bytes go to the media library and the FIELD stores only the file name
 * (see AgentDefinition.avatarImage) — a dataURL in agents.json would bloat a
 * file that every roster lookup reads.
 *
 * Downscaled to 128px before it is stored, not after: a 4000px photo picked as
 * a 28px chip would otherwise cost megabytes on disk and a full-size decode on
 * every message group. PNG (not webp) because the save channel stamps
 * `image/png` on the asset — writing webp bytes under a png mime would be a lie
 * the media panel later trips over.
 */
const AVATAR_IMAGE_MAX_PX = 128

const avatarFileInputRef = ref<HTMLInputElement | null>(null)
const avatarImageBusy = ref(false)

function pickAvatarImage(): void {
  formError.value = ''
  avatarFileInputRef.value?.click()
}

function clearAvatarImage(): void {
  formAvatarImage.value = ''
  formFeedback.value = ''
}

async function onAvatarFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Reset the input either way: picking the SAME file twice must fire again.
  input.value = ''
  if (!file) return

  avatarImageBusy.value = true
  formError.value = ''
  formFeedback.value = ''
  try {
    const base64 = await downscaleImageToPngDataUrl(file, AVATAR_IMAGE_MAX_PX)
    /* 懒取 store:媒体库只在用户真去挑图那一刻才需要,提前取会让不挂 pinia
       的面板单测在 setup 阶段就炸(与 TabBar 的 isRoomSession 同一理由)。 */
    const fileName = await useMediaStore().savePersonaAvatar({
      base64,
      label: formName.value.trim() || undefined,
    })
    if (!fileName) {
      formError.value = 'Failed to store the picture'
      return
    }
    formAvatarImage.value = fileName
    /* 只改了草稿:落库还是那颗 save 按钮,与其它字段同一条路。 */
    formFeedback.value = 'Picture ready — save to apply'
  } catch (err: any) {
    formError.value = err?.message || 'Failed to read the picture'
  } finally {
    avatarImageBusy.value = false
  }
}

/** Longest edge to `maxPx`, aspect kept, re-encoded as a PNG dataURL. */
function downscaleImageToPngDataUrl(file: File, maxPx: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const longest = Math.max(image.width, image.height)
      if (!longest) {
        reject(new Error('Not an image'))
        return
      }
      const scale = Math.min(1, maxPx / longest)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Canvas unavailable'))
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Not an image'))
    }
    image.src = objectUrl
  })
}

/* ---- boundaries ---- */

const permissionModeChoices = AGENT_PERMISSION_MODE_CHOICES

const permissionModeHint = computed(() =>
  permissionModeChoices.find(choice => choice.value === formPermissionMode.value)?.hint ?? ''
)

/* The selected agent's own value stays selectable even when it matches no
   tier — see turnBudgetChoices. */
const turnBudgetOptions = computed(() => turnBudgetChoices(selectedAgent.value?.maxTurns))

/* ---- tool allowlist ---- */

const followsGlobalTools = computed(() => isFollowGlobal(formTools.value))

/**
 * The picker lists globally enabled tools, plus any id the agent already has
 * that no longer resolves — dropping those silently would edit the allowlist
 * behind the user's back the first time they hit save.
 */
const toolChoices = computed<ToolChoice[]>(() => {
  const choices = [...availableTools.value]
  const known = new Set(choices.map(choice => choice.id))
  for (const id of formTools.value ?? []) {
    if (known.has(id)) continue
    choices.push({ id, name: id, description: '', note: 'unavailable' })
  }
  return choices
})

const toolSummary = computed(() => {
  if (followsGlobalTools.value) return 'all tools'
  const count = formTools.value?.length ?? 0
  return count === 1 ? '1 tool' : `${count} tools`
})

function setToolMode(mode: 'global' | 'allowlist') {
  formTools.value = mode === 'global'
    ? leaveAllowlistMode()
    : enterAllowlistMode(formTools.value)
  formError.value = ''
}

function isToolOn(toolId: string): boolean {
  return isToolSelected(formTools.value, toolId)
}

function onToggleTool(toolId: string) {
  formTools.value = toggleTool(formTools.value, toolId)
  formError.value = ''
}

async function loadTools() {
  if (typeof platformApi.getTools !== 'function') return
  toolsLoading.value = true
  try {
    const response = await platformApi.getTools()
    if (response?.success && response.tools) {
      availableTools.value = response.tools
        .filter(tool => tool.enabled !== false)
        .map(tool => ({
          id: tool.id,
          name: tool.name || tool.id,
          description: tool.description || '',
          note: tool.name && tool.name !== tool.id ? tool.id : '',
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }
  } catch {
    // The picker renders its empty note; the rest of the form still works.
  } finally {
    toolsLoading.value = false
  }
}

/* ---- model binding ---- */

/* Every provider is offered, not just the configured ones: binding an agent to
   a provider you are about to set up is legitimate, so an unusable pick earns a
   warning line rather than a missing option. */
const providerChoices = computed(() =>
  (settingsStore.availableProviders || []).map(provider => ({
    id: provider.id,
    name: providerFamilyDisplayName(provider.id, provider.name),
  }))
)

const modelChoices = computed(() => {
  const providerId = formModelProvider.value
  if (!providerId) return []
  const config = settingsStore.settings?.ai?.providers?.[providerId]
  const ids = [...(config?.selectedModels || [])]
  if (config?.model && !ids.includes(config.model)) ids.unshift(config.model)
  if (formModelId.value && !ids.includes(formModelId.value)) ids.unshift(formModelId.value)
  return ids.map(id => ({ id, name: settingsStore.getModelDisplayName(id) || id }))
})

const modelWarning = computed(() => {
  const providerId = formModelProvider.value
  if (!providerId) return ''
  const config = settingsStore.settings?.ai?.providers?.[providerId]
  if (!config) {
    return 'This provider is not configured yet — drives fall back to the session default.'
  }
  if (!isProviderConfigEnabled(config)) {
    return 'This provider is disabled in Settings — drives fall back to the session default.'
  }
  const provider = (settingsStore.availableProviders || []).find(item => item.id === providerId)
  if (provider?.requiresApiKey && !provider.requiresOAuth && !config.apiKey) {
    return 'This provider has no API key yet — drives fall back to the session default.'
  }
  return ''
})

function onModelProviderChange() {
  /* A provider switch invalidates the old model id — clear it first, or the
     stale value survives via modelChoices' "keep the bound model visible" arm
     and the pair silently crosses providers. */
  formModelId.value = ''
  if (!formModelProvider.value) {
    formModelThinking.value = ''
    return
  }
  formModelId.value = modelChoices.value[0]?.id || ''
}

function clearModelBinding() {
  formModelProvider.value = ''
  formModelId.value = ''
  formModelThinking.value = ''
}

const agentDetailActive = ref(false)

/* ---- conversations: 私聊 + TA 的群聊 (todo2-fix-plan P1-3) ----
   侧栏那条 Agent 行只通向「执行现场」——一个禁输入的基础设施视图。要跟 agent
   说话得有别的出口,而这里已经是它的详情页,出口就落在这儿。 */

const openingChat = ref(false)
const conversationError = ref('')

/** TA 在哪些群里。成员表就是房间会话上的 room.memberAgentIds(负责人另标)。
    「群」不含私聊房(agent-im-dm.md §4.1):和 TA 的一对一是另一种关系,P2 的
    履历页把它放进「与你的对话」那一栏,列进群聊里会读成"和自己开了个群"。 */
const agentRooms = computed(() => {
  const agentId = selectedAgent.value?.id
  if (!agentId || isCreating.value) return []
  return sessionsStore.groupRoomSessions
    .filter(room => room.room?.memberAgentIds?.includes(agentId) || room.room?.pmAgentId === agentId)
    .map(room => ({
      id: room.id,
      name: (room.name || '').trim() || '未命名群聊',
      isPm: room.room?.pmAgentId === agentId,
      updatedAt: room.updatedAt || 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
})

function openRoom(sessionId: string) {
  workspaceStore.openSession(sessionId)
  emit('close')
}

/**
 * 私聊 = 一条绑到该 agent 的**普通**会话,不是它的执行会话。
 *
 * 复用优先:同一个 agent 反复点「私聊」不该攒出一串空会话,所以先找最近一条
 * 活着的普通会话;没有才新建,并且新建后立刻绑定 agent —— 绑定要在打开之前,
 * 否则第一条消息可能落在默认 agent 身上。
 */
async function openPrivateChat() {
  const agent = selectedAgent.value
  if (!agent || isCreating.value || openingChat.value) return

  openingChat.value = true
  conversationError.value = ''
  try {
    const existing = sessionsStore.sessions
      .filter(session =>
        session.agentId === agent.id &&
        (!session.kind || session.kind === 'chat') &&
        !session.isArchived)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]

    if (existing) {
      workspaceStore.openSession(existing.id)
      emit('close')
      return
    }

    const created = await sessionsStore.createSessionWithoutSwitch(agent.name || 'Agent')
    if (!created) {
      conversationError.value = '新建会话失败,请重试。'
      return
    }
    const bound = await sessionsStore.updateSessionAgent(created.id, agent.id)
    if (!bound.success) {
      // 会话建出来了但没绑上 —— 说清楚,别让用户以为自己在跟这个 agent 说话。
      conversationError.value = bound.error || '会话已创建,但绑定 agent 失败。'
    }
    workspaceStore.openSession(created.id)
    emit('close')
  } finally {
    openingChat.value = false
  }
}

/* ---- 履历页(agent-im-dm.md §4.2 / D8)----------------------------------
 *
 * 四栏**全部** renderer 端现算,不新增聚合 IPC。归类口径不在这儿:在场三路由
 * 产品层纯函数 `computeAgentPresence` 回答、直聊那一路由 store selector 补,
 * 两者都只有一处(见 `stores/sessions.ts`);本组件只负责把结果摆成行,绝不
 * 自己再写一份 `kind==='agent' && agentId===…`。
 */

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

/**
 * 卡标题现查(Q4 纪律:状态/标题一律现查,不入任何快照)。
 *
 * 懒取 store,与 useMediaStore 同一理由:不挂 pinia 的面板单测会在 setup 阶段
 * 就炸。查不到就返回空串,`buildAgentHistory` 会退到短号 —— 宁可少说不说错。
 */
function lookupTaskTitle(taskId: string): string {
  if (!taskId) return ''
  try {
    return useCollabBoardStore().findTask(taskId)?.task.title || ''
  } catch {
    return ''
  }
}

const agentHistory = computed(() => buildAgentHistory({
  presence: sessionsStore.agentPresence(historyAgentId.value),
  directChats: sessionsStore.agentDirectChatSessions(historyAgentId.value),
  sessions: sessionsStore.sessions,
  taskTitle: lookupTaskTitle,
}))

const historyColumns = computed(() => [
  {
    key: 'conversations',
    label: '与你的对话',
    rows: agentHistory.value.conversations,
    empty: `还没和${selectedAgent.value?.name || 'TA'}聊过`,
  },
  {
    key: 'rooms',
    label: '群聊',
    rows: agentHistory.value.rooms,
    empty: '还没有在任何群里跑过回合。',
  },
  {
    key: 'pairDms',
    label: '私下',
    rows: agentHistory.value.pairDms,
    empty: '还没有和别的同事私下聊过。',
  },
])

function historyRowTitle(row: AgentHistoryRow): string {
  return row.readOnly ? `${row.label} · 只读转录` : row.label
}

function openHistoryRow(row: AgentHistoryRow) {
  workspaceStore.openSession(row.sessionId)
  emit('close')
}

/**
 * 看板只在打开过看板面板的房间里是热的,所以卡标题现查在冷启动时会全线落空。
 * 进任何一个读看板的面(会话/文件/搜索)时按这个 agent 待过的房间补拉一次;
 * 拉不到就是短号,不影响四栏成立。
 */
const needsBoardData = computed(() =>
  showSessions.value || showFiles.value || showSearch.value)

watch([needsBoardData, historyAgentId], ([visible, agentId]) => {
  if (!visible || !agentId) return
  const presence = sessionsStore.agentPresence(agentId)
  const roomIds = new Set<string>(presence.roomSessionIds)
  if (presence.dmRoomId) roomIds.add(presence.dmRoomId)
  // 工作台会话可能挂在这个 agent 已经不在的房间上 —— 卡还在那儿,标题得查得到。
  for (const sessionId of presence.workSessionIds) {
    const roomSessionId = sessionsStore.sessions.find(s => s.id === sessionId)?.collab?.roomSessionId
    if (roomSessionId) roomIds.add(roomSessionId)
  }
  try {
    const boardStore = useCollabBoardStore()
    for (const roomId of roomIds) void boardStore.load(roomId)
  } catch {
    // 没挂 pinia(面板单测):标题退到短号,四栏照常。
  }
}, { immediate: true })

const openingDm = ref(false)
/** 建房被拒(退休 / service / web 端没有 rooms)必须看得见,绝不静默无反应。 */
const historyError = ref('')

/**
 * 空态的「发起对话」= 联系人区同一条链路(幂等建房 → 刷新列表 → 打开),
 * 不是这一页原有的「私聊」(那开的是绑 agent 的普通直聊会话)。
 */
async function startDmChat(): Promise<void> {
  const agentId = historyAgentId.value
  if (!agentId || openingDm.value) return
  openingDm.value = true
  historyError.value = ''
  try {
    const response = await platformApi.ensureCollabDmRoom(agentId)
    if (!response?.success || !response.roomSessionId) {
      historyError.value = response?.error || '打不开私聊'
      return
    }
    await sessionsStore.loadSessions()
    workspaceStore.openSession(response.roomSessionId)
    emit('close')
  } catch (cause) {
    historyError.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    openingDm.value = false
  }
}

/* ---- 「文件」面(agent-im-chat-ui.md §3.2)------------------------------- */

/**
 * 私聊房 folder 的列目录。
 *
 * folder 的位置是主进程的推导(workingDirectory ?? `<store>/rooms/<id>`),渲染
 * 进程只看得到房间会话上那个**可能还没写下来**的 workingDirectory,所以这里问的
 * 是一个按房间 id 的只读通道,而不是拿 file:list-directory 去猜路径。
 */
const roomFiles = ref<CollabRoomFolderEntry[]>([])
const filesLoading = ref(false)
const filesError = ref('')
const filesTruncated = ref(false)
/** 目录还没建过(这个人还没往私聊房里放过东西)—— 不是错误,是另一句空态。 */
const filesMissing = ref(false)

/**
 * 私聊房 id 来自 presence(唯一归类口径),不在这儿反解 id。
 *
 * 这条被文件面的 watch 立刻求值(watch 建立时要记初值),而配置面的单测喂的是
 * 一份没有 presence 的假 store —— 查不到就是没有私聊房,不该把整页拖垮。
 */
const dmRoomSessionId = computed(() => {
  if (!historyAgentId.value) return ''
  try {
    return sessionsStore.agentPresence(historyAgentId.value).dmRoomId || ''
  } catch {
    return ''
  }
})

const roomFilesEmptyHint = computed(() => {
  if (!dmRoomSessionId.value) return '还没有和 TA 的私聊房 —— 先发条消息。'
  return filesMissing.value ? '私聊房里还没有放过东西。' : '私聊房 folder 是空的。'
})

async function loadRoomFiles(): Promise<void> {
  const roomSessionId = dmRoomSessionId.value
  roomFiles.value = []
  filesTruncated.value = false
  filesMissing.value = false
  filesError.value = ''
  if (!roomSessionId) return
  if (typeof platformApi.listCollabRoomFolder !== 'function') {
    filesError.value = '这个平台读不到群 folder。'
    return
  }

  filesLoading.value = true
  try {
    const response = await platformApi.listCollabRoomFolder(roomSessionId)
    if (!response?.success) {
      filesError.value = response?.error || '读不到私聊房的文件'
      return
    }
    roomFiles.value = response.entries ?? []
    filesTruncated.value = !!response.truncated
    filesMissing.value = !!response.missing
  } catch (cause) {
    filesError.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    filesLoading.value = false
  }
}

/* 只在文件面真被打开时拉一次(换人也重拉)—— 列目录是 IO,不该跟着面板挂载走。 */
watch([showFiles, dmRoomSessionId], ([visible]) => {
  if (!visible) return
  void loadRoomFiles()
}, { immediate: true })

/**
 * 卡上的交付物(W17)。路径是**相对该群 folder** 记下来的,所以还原绝对路径要
 * 那个群的工作目录;群没有工作目录(从没跑过活)就还原不出来 —— 那一行不给点,
 * 而不是给一个点了打不开的按钮。
 */
interface AgentEvidenceGroup {
  taskId: string
  title: string
  files: Array<{ label: string; path: string }>
}

const evidenceGroups = computed<AgentEvidenceGroup[]>(() => {
  const groups: AgentEvidenceGroup[] = []
  for (const group of agentHistory.value.work) {
    if (!group.taskId) continue
    let found: { roomSessionId: string; task: { report?: { evidence?: { files?: string[] } } } } | undefined
    try {
      found = useCollabBoardStore().findTask(group.taskId)
    } catch {
      // 没挂 pinia(面板单测):这一组就没有交付物,其余照常。
      found = undefined
    }
    const files = found?.task?.report?.evidence?.files ?? []
    if (files.length === 0) continue
    const roomFolder = sessionsStore.sessions
      .find(session => session.id === found?.roomSessionId)?.workingDirectory || ''
    groups.push({
      taskId: group.taskId,
      title: group.title,
      files: files.map(file => ({
        label: file,
        // 还原用看板卡那一份(单点):相对路径的基准是同一个 roomFolder,
        // 在这儿再写一遍 join 就是第二本账。
        path: resolveDeliverablePath(file, roomFolder),
      })),
    })
  }
  return groups
})

/** 点开走既有 openFile 链路(>1MB / 二进制的降级在那条链路上现成)。 */
function openFilePath(filePath: string): void {
  if (!filePath) return
  window.dispatchEvent(new CustomEvent(COLLAB_TAG_OPEN_FILE_EVENT, { detail: { filePath } }))
  emit('close')
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/* ---- 「搜索」面(agent-im-chat-ui.md §3.2;P2 = 本地过滤)---------------- */

const searchQuery = ref('')

/**
 * 可搜的范围与「会话」面**同一口径**(presence ∪ 直聊)——空间页里两面看到的
 * 是同一批会话,搜不出来的东西在会话面也不该在。匹配只吃已经在手里的元数据:
 * 会话名 / 群名 / 卡标题。消息正文一个字都不加载(那是 P3 的全文检索)。
 */
const searchableRows = computed(() => {
  const history = agentHistory.value
  const rows = [
    ...history.conversations.map(row => ({ row, extra: '' })),
    ...history.rooms.map(row => ({ row, extra: '' })),
    ...history.pairDms.map(row => ({ row, extra: '' })),
    ...history.work.flatMap(group => group.rows.map(row => ({ row, extra: group.title }))),
  ]
  const seen = new Set<string>()
  return rows
    .filter(({ row }) => {
      if (seen.has(row.sessionId)) return false
      seen.add(row.sessionId)
      return true
    })
    .map(({ row, extra }) => ({
      ...row,
      note: extra || row.note,
      haystack: `${row.label} ${row.note} ${extra}`.toLowerCase(),
    }))
})

const searchResults = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return []
  return searchableRows.value
    .filter(row => row.haystack.includes(query))
    .sort((a, b) => b.updatedAt - a.updatedAt)
})

/* 换人就清掉上一次的搜索词 —— 结果集换了,词留着会读成"这个人也搜过这个"。 */
watch(historyAgentId, () => { searchQuery.value = '' })

/** 侧栏「详情」跳进来时把详情页停在那个 agent 上,并把请求吃掉 —— 否则下次
    再打开面板会莫名其妙又跳一次。右键「打开空间」还会带上要停的那一面。 */
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

const promptTemplates = [
  {
    name: 'Developer',
    prompt: 'You are an expert software developer. Provide clean, well-documented, and performant code in TypeScript/JavaScript following industry best practices. Explain design decisions briefly and clearly.'
  },
  {
    name: 'Writer',
    prompt: 'You are a creative writer and copy editor. Focus on engaging, vivid prose with excellent structure and tone. Adapt your style based on the user\'s requests, maintaining high readability and style.'
  },
  {
    name: 'Analyst',
    prompt: 'You are a detail-oriented data analyst. Provide structured insights, markdown tables, and clear explanations. Focus on extracting quantitative patterns and validating claims with rigorous logic.'
  },
  {
    name: 'Concise AI',
    prompt: 'You are a helpful assistant. Keep all responses brief, direct, and focused. Avoid introductory and concluding conversational filler. Answer in bullet points whenever possible.'
  }
]

function applyTemplate(templatePrompt: string) {
  if (!formPrompt.value.trim() || confirm('Overwrite current system prompt with this template?')) {
    formPrompt.value = templatePrompt
  }
}

function wordCount(str: string): number {
  if (!str) return 0
  return str.trim().split(/\s+/).filter(Boolean).length
}

function selectAgent(agentId: string) {
  isCreating.value = false
  activeAgentId.value = agentId
  syncFormFromSelected()
  formError.value = ''
  formFeedback.value = ''
  agentDetailActive.value = true
}

function startCreate() {
  isCreating.value = true
  activeAgentId.value = ''
  formName.value = 'New Agent'
  formTitle.value = ''
  formAvatar.value = ''
  formAvatarImage.value = ''
  formPrompt.value = ''
  formTools.value = null
  formModelProvider.value = ''
  formModelId.value = ''
  formModelThinking.value = ''
  formPermissionMode.value = ''
  formTurnBudget.value = 'inherit'
  formError.value = ''
  formFeedback.value = ''
  agentDetailActive.value = true
}

function resetForm() {
  if (isCreating.value) {
    isCreating.value = false
    activeAgentId.value = agentsStore.defaultAgent?.id || DEFAULT_AGENT_ID
  }
  syncFormFromSelected()
  formError.value = ''
  formFeedback.value = ''
  agentDetailActive.value = false
}

async function saveAgent() {
  const name = formName.value.trim()
  if (!name) {
    formError.value = 'Name is required'
    return
  }

  const allowlistError = validateToolAllowlist(formTools.value)
  if (allowlistError) {
    formError.value = allowlistError
    return
  }

  saving.value = true
  formError.value = ''
  formFeedback.value = ''

  const configUpdates = {
    /* 空串必须落成 null:后端的 patchOptional 把 undefined 当"不改",
       只有显式 null 才清得掉已有的身份。 */
    title: formTitle.value.trim() || null,
    avatar: formAvatar.value.trim() || null,
    avatarImage: formAvatarImage.value.trim() || null,
    tools: toolAllowlistPayload(formTools.value),
    model: modelBindingPayload({
      providerId: formModelProvider.value,
      modelId: formModelId.value,
      thinking: formModelThinking.value,
    }),
    permissionMode: permissionModePayload(formPermissionMode.value) as PermissionMode | null,
    maxTurns: turnBudgetPayload(formTurnBudget.value, selectedAgent.value?.maxTurns),
  }

  try {
    if (isCreating.value) {
      /* createAgent only carries name + prompt; the tool/model fields ride the
         update channel right after so both stay on one save button. */
      const created = await agentsStore.createAgent(name, formPrompt.value)
      const agent = await agentsStore.updateAgent(created.id, configUpdates)
      isCreating.value = false
      activeAgentId.value = agent.id
      formFeedback.value = 'Agent created'
    } else if (selectedAgent.value) {
      const agent = await agentsStore.updateAgent(selectedAgent.value.id, {
        name,
        systemPrompt: formPrompt.value,
        ...configUpdates,
      })
      activeAgentId.value = agent.id
      formFeedback.value = 'Agent saved'
    }
    syncFormFromSelected()
  } catch (err: any) {
    formError.value = err?.message || 'Failed to save agent'
  } finally {
    saving.value = false
  }
}

/**
 * 「删除」的两种结局(域模型 §3.2):被引用过 → 退休(留下墓碑,历史署名、房间
 * 成员条、履历照旧读得出);从未被引用过 → 真删掉。
 *
 * 确认文案在点之前就分岔,因为这两件事对用户是两个决定 —— 用一句「Delete?」
 * 盖住"其实只是退休"会让人以为记录被抹了,反过来也会让人以为还找得回来。
 * 引用检查是后端的活(它才看得见全部会话),所以这里只按会不会被引用**措辞**
 * 保守:凡是可能留墓碑的,都说成退休。
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
  formError.value = ''
  formFeedback.value = ''

  try {
    const outcome = await agentsStore.deleteAgent(agent.id)
    if (outcome === 'deleted') {
      activeAgentId.value = agentsStore.defaultAgent?.id || agentsStore.agents[0]?.id || DEFAULT_AGENT_ID
    }
    isCreating.value = false
    syncFormFromSelected()
    // 退休的 agent 还在名册里(灰显),留在选中态上,恢复入口就在原地。
    formFeedback.value = outcome === 'retired' ? '已退休(记录保留)' : '已删除(从未被引用)'
  } catch (err: any) {
    formError.value = err?.message || 'Failed to retire agent'
  } finally {
    saving.value = false
  }
}

/** 重新入职(§8):status 翻回 active,身份/心智/能力三面一字不动。 */
async function restoreSelectedAgent() {
  const agent = selectedAgent.value
  if (!agent || agent.id === DEFAULT_AGENT_ID) return

  saving.value = true
  formError.value = ''
  formFeedback.value = ''

  try {
    await agentsStore.restoreAgent(agent.id)
    syncFormFromSelected()
    formFeedback.value = '已恢复在职'
  } catch (err: any) {
    formError.value = err?.message || 'Failed to restore agent'
  } finally {
    saving.value = false
  }
}

function formatUpdated(timestamp: number): string {
  if (!timestamp) return 'Custom'
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

watch(selectedAgent, syncFormFromSelected, { immediate: true })

onMounted(async () => {
  void loadTools()
  if (!(settingsStore.availableProviders || []).length) {
    void settingsStore.loadProviders().catch(() => {
      // The provider list stays empty; the model row simply offers no options.
    })
  }

  try {
    await agentsStore.loadAgents()
    if (!agentsStore.agents.some(agent => agent.id === activeAgentId.value)) {
      activeAgentId.value = agentsStore.defaultAgent?.id || agentsStore.agents[0]?.id || DEFAULT_AGENT_ID
    }
    syncFormFromSelected()
  } catch {
    // Store error is rendered above.
  }

  /* 懒挂载的这一刻请求可能已经躺在 store 里了(侧栏先寄存再开面板),watch 不
     会为一个挂载前就存在的值触发,所以这里主动取一次。放在名册加载之后:
     selectAgent 之后的表单同步要读得到这个 agent。 */
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

/* ---- notes & errors ---- */
.ledger-note {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  word-break: break-word;
}

/* positioning only — visuals come from ErrorNote */
.ledger-error {
  margin: 10px 0 0;
}

.form-note {
  margin: 0;
  min-height: 17px;
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

/* Custom scrollbars (kept from before — no nested scroll areas added) */
.agents-list::-webkit-scrollbar,
.editor-scroll::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.agents-list::-webkit-scrollbar-track,
.editor-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.agents-list::-webkit-scrollbar-thumb,
.editor-scroll::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 18%, transparent);
}

.agents-list::-webkit-scrollbar-thumb:hover,
.editor-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--ui-text-muted-fg, var(--text-muted)) 32%, transparent);
}

/* ---- list column ---- */
.agents-list {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 2px 8px 0;
  background: transparent;
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

/* Default agent: outlined ring, zero fill — accent marks the binding */
.agent-chip {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 2px 7px 3px;
  border: 1px solid color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 65%, transparent);
  border-radius: 9px;
  color: var(--ui-accent-primary-fg, var(--accent));
  background: transparent;
  white-space: nowrap;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
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

.editor-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 2px 14px 0;
}

/* Editor fields hang on their own rule */
.editor-body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-left: 16px;
}

.editor-body::before {
  content: '';
  position: absolute;
  left: 3px;
  top: 6px;
  bottom: 6px;
  width: 1px;
  background: color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 72%, transparent);
}

.agent-identity-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.agent-field-avatar {
  flex: 0 0 72px;
}

.agent-field-title {
  flex: 1 1 auto;
  min-width: 0;
}

.avatar-input {
  text-align: center;
}

/* 图片头像:一枚章 + 两个文字动作,画线风 —— 没有卡片、没有按钮填充。 */
.agent-field-avatar-image {
  flex: 0 0 auto;
}

.avatar-image-row {
  display: flex;
  align-items: center;
  gap: 8px;
  /* 与相邻 .ledger-input 的行高对齐,免得 identity 行下沿参差。 */
  min-height: 30px;
}

.avatar-image-preview {
  font-size: 17px;
  border: 1px solid color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 30%, transparent);
  border-radius: 50%;
  width: 28px;
  height: 28px;
}

/* 真正的文件选择器藏起来:露出来的是那两个文字动作。 */
.avatar-file-input {
  display: none;
}

.agent-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Conversations: 两个出口(私聊 / TA 的群聊)。画线风 —— 没有卡片、没有填充,
   群名就是一行可点的字,与 .model-row 同一套排版语言。 */
.agent-rooms {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rooms-label {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--ui-text-faint-fg, var(--muted));
}

.agent-room-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.agent-room-line {
  appearance: none;
  background: transparent;
  border: none;
  width: 100%;
  padding: 3px 0;
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  cursor: pointer;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 40%, transparent);
}

.agent-room-rows li:last-child .agent-room-line {
  border-bottom: none;
}

.agent-room-line:hover,
.agent-room-line:focus-visible {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.agent-room-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
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

.agent-history,
.agent-files,
.agent-search {
  gap: 20px;
}

.history-column,
.files-column {
  gap: 6px;
}

/* 还原不出绝对路径的交付物:留着这一行(卡确实交了这个文件),但不是按钮 ——
   一个点了打不开的按钮比一行灰字更伤。 */
.history-line.is-inert {
  cursor: default;
  color: var(--ui-text-faint-fg, var(--muted));
}

.history-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.history-line {
  appearance: none;
  background: transparent;
  border: none;
  width: 100%;
  padding: 4px 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  text-align: left;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  cursor: pointer;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 40%, transparent);
}

.history-rows li:last-child .history-line {
  border-bottom: none;
}

.history-line:hover,
.history-line:focus-visible {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.history-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 副标注是补语不是标签:淡一档,名字永远先保住。 */
.history-note {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--ui-text-faint-fg, var(--muted));
}

.history-meta {
  flex: 0 0 auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-faint-fg, var(--muted));
}

.history-count {
  min-width: 44px;
  text-align: right;
}

/* 一张卡一组:标题是组头(等宽小字,与 .rooms-label 同一语气),行折在下面。 */
.history-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-group + .history-group {
  margin-top: 10px;
}

.history-group-title {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--ui-text-faint-fg, var(--muted));
}

/* Field label: section-header tick language */
.field-label {
  position: relative;
  font-size: 11px;
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.editor-body .field-label::before {
  content: '';
  position: absolute;
  left: -16px;
  top: 50%;
  width: 10px;
  height: 2px;
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
}

/* Inputs: state lives in the bottom line */
.ledger-input {
  width: 100%;
  box-sizing: border-box;
  appearance: none;
  background: transparent;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 70%, transparent);
  border-radius: 0;
  padding: 2px 2px 6px;
  font: inherit;
  font-size: 13px;
  color: var(--ui-text-primary-fg, var(--text-primary));
  outline: none;
  transition: border-color 0.12s ease;
}

.ledger-input:hover:not(:disabled),
.ledger-input:focus {
  border-bottom-color: var(--ui-accent-primary-fg, var(--accent));
}

/* Prompt: an editable excerpt held by a left rule, no filled block */
.ledger-textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 220px;
  resize: vertical;
  appearance: none;
  background: transparent;
  border: none;
  border-left: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 70%, transparent);
  border-radius: 0;
  padding: 4px 2px 8px 10px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  line-height: 1.6;
  color: var(--ui-text-primary-fg, var(--text-primary));
  outline: none;
  transition: border-color 0.12s ease;
}

.ledger-textarea::placeholder {
  color: var(--ui-text-faint-fg, var(--muted));
}

.ledger-textarea:hover:not(:disabled),
.ledger-textarea:focus {
  border-left-color: var(--ui-accent-primary-fg, var(--accent));
  border-bottom-color: var(--ui-accent-primary-fg, var(--accent));
}

/* Prompt header: label + mono counters */
.prompt-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.prompt-counters {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.prompt-counter {
  font-family: var(--font-mono, monospace);
  font-variant-numeric: tabular-nums;
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--muted));
  white-space: nowrap;
}

/* Ink-grey note under a field — one line, never a paragraph */
.field-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--ui-text-faint-fg, var(--muted));
}

/* Mode switch: two text actions on one rule, the live one carries the accent
   underline. No pill, no fill — the line states which mode is on. */
.mode-switch {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.mode-option {
  appearance: none;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 0 0 2px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  transition: color 0.12s ease, border-color 0.12s ease;
}

.mode-option:hover {
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.mode-option.is-on {
  color: var(--ui-accent-primary-fg, var(--accent));
  border-bottom-color: var(--ui-accent-primary-fg, var(--accent));
}

.mode-option:focus-visible {
  outline: 1px solid var(--ui-accent-primary-fg, var(--accent));
  outline-offset: 2px;
}

.mode-divider {
  width: 1px;
  align-self: stretch;
  background: color-mix(in srgb, var(--ui-border-default-border, var(--border)) 60%, transparent);
}

/* Tool rows: a register of ticks, same hanging-tick language as the agent list */
.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 2px 14px;
}

.tool-line {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  padding: 3px 0 3px 14px;
  appearance: none;
  background: transparent;
  border: none;
  text-align: left;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  transition: color 0.12s ease;
}

/* Unselected: a short faint tick. Selected: a heavier accent tick. */
.tool-line::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 7px;
  height: 1px;
  background: var(--ui-border-strong-border, var(--border-strong, var(--border)));
  transition: width 0.12s ease, height 0.12s ease, background-color 0.12s ease;
}

.tool-line:hover {
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.tool-line:hover::before {
  background: var(--ui-text-muted-fg, var(--text-muted));
}

.tool-line.is-on {
  color: var(--ui-text-primary-fg, var(--text-primary));
}

.tool-line.is-on::before {
  width: 10px;
  height: 2px;
  background: var(--ui-accent-primary-fg, var(--accent));
}

.tool-line:focus-visible {
  outline: 1px solid var(--ui-accent-primary-fg, var(--accent));
  outline-offset: 1px;
}

.tool-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-note {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--ui-text-faint-fg, var(--muted));
  white-space: nowrap;
}

/* Model binding: two labelled rows, each a bottom-ruled control */
.model-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.model-row-label {
  flex-shrink: 0;
  min-width: 54px;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--ui-text-faint-fg, var(--muted));
}

.ledger-select {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  appearance: none;
  background: transparent;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border-default-border, var(--border)) 70%, transparent);
  border-radius: 0;
  padding: 2px 2px 5px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--ui-text-primary-fg, var(--text-primary));
  outline: none;
  cursor: pointer;
  transition: border-color 0.12s ease;
}

.ledger-select:hover:not(:disabled),
.ledger-select:focus {
  border-bottom-color: var(--ui-accent-primary-fg, var(--accent));
}

.ledger-select:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ledger-select option {
  background: var(--ui-surface-panel-bg, var(--bg-panel));
  color: var(--ui-text-primary-fg, var(--text-primary));
}

/* Templates: a line of text actions, wraps when narrow */
.prompt-templates {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.templates-label {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--ui-text-faint-fg, var(--muted));
  white-space: nowrap;
}

.template-action {
  text-transform: lowercase;
  white-space: nowrap;
}

/* ---- footer actions ---- */
.editor-footer {
  display: flex;
  justify-content: flex-end;
  gap: 18px;
  padding: 12px 2px 0 0;
  border-top: 1px solid color-mix(in srgb, var(--ui-border-strong-border, var(--border-strong, var(--border))) 55%, transparent);
}

/* ---- shared text actions ---- */
.text-action {
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--text-muted));
  cursor: pointer;
  transition: color 0.12s ease;
}

.text-action:hover:not(:disabled) {
  color: var(--ui-text-primary-fg, var(--text-primary));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--ui-accent-primary-fg, var(--accent));
}

.text-action.is-danger:hover:not(:disabled) {
  color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
  text-decoration-color: var(--ui-status-danger-fg, var(--text-error, #b3403a));
}

.text-action.is-primary {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.text-action.is-primary:hover:not(:disabled) {
  color: var(--ui-accent-primary-fg, var(--accent));
}

.text-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.text-action:focus-visible,
.row-line:focus-visible {
  outline: 1px solid var(--ui-accent-primary-fg, var(--accent));
  outline-offset: 2px;
}

.ledger-input:focus-visible,
.ledger-textarea:focus-visible {
  outline: none;
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
</style>
