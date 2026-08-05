<template>
  <aside
    :class="['sidebar', { collapsed, floating, 'floating-closing': floatingClosing }]"
    :style="sidebarStyle"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <Space
      as="div"
      direction="vertical"
      size="none"
      align="stretch"
      class="sidebar-content"
      :class="{ 'content-hidden': contentHidden }"
      :aria-hidden="contentHidden"
    >
      <!-- Sidebar Header: traffic lights space + 操作按钮(展开态的宿主) -->
      <SidebarHeader>
        <SidebarActionGroup
          :sidebar-visible="!collapsed || floating"
          variant="sidebar"
          @toggle-sidebar="$emit('toggleCollapse')"
          @open-search="$emit('open-search')"
          @create-new-chat="$emit('create-new-chat')"
        />
      </SidebarHeader>

      <!-- 方案六 · 顶部「＋ 新会话」：固定在滚动区之外的文本入口。
           **classic 专属** —— 方案三下新会话住在 rail 底部那一栏。 -->
      <button
        v-if="!isWorkbenchShell"
        type="button"
        class="sidebar-newchat"
        @click="$emit('create-new-chat')"
      >
        ＋ 新会话
      </button>

      <!-- 方案三 · rail + 单类面板(样板 docs/design/im-redesign/sidebar-4.html
           第三格)。两层壳在 classic 下都是 `display: contents` —— 不生成盒子,
           四区仍然是 `.sidebar-content` 的直接布局子,排版逐像素不变(纪律 1);
           workbench 下 `.sidebar-split` 才成为 rail | 面板 的那一横排。

           rail 从 `SidebarHeader` **下面**开始:那一行 44px 是全宽拖拽行,左 70px
           是 macOS 交通灯保留位。rail 若从窗顶起,前两枚图标会被交通灯压住,而且
           整行 `-webkit-app-region: drag`,根本点不动。 -->
      <div class="sidebar-split">
        <div
          v-if="isWorkbenchShell"
          class="sidebar-rail"
          role="tablist"
          aria-label="左栏类别"
        >
          <button
            v-for="category in railCategories"
            :key="category.id"
            :ref="(el) => setRailTabEl(category.id, el)"
            type="button"
            class="sidebar-rail-tab"
            :class="{ 'is-on': category.id === railCategory }"
            role="tab"
            :aria-selected="category.id === railCategory"
            :aria-label="category.label"
            @click="selectRailCategory(category.id)"
          >
            <svg
              class="sidebar-rail-glyph"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <!-- 图标随「按意图分格」一起换过一轮:气泡 = 回到某段对话(消息),
                   多人 = 去找谁(通讯录),文件夹 = 按项目翻旧账(会话)。 -->
              <template v-if="category.id === 'recent'">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </template>
              <template v-else-if="category.id === 'active'">
                <path d="M4 17l6-6-6-6M12 19h8" />
              </template>
              <template v-else-if="category.id === 'contacts'">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle
                  cx="9"
                  cy="7"
                  r="4"
                />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              </template>
              <template v-else>
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </template>
            </svg>
            <!-- 样板 `.bdg`:该类有未读或在跑。一枚点不摆数字 —— 系统只知道
                 "有没有",不知道"几条"。 -->
            <span
              v-if="railBadges[category.id]"
              class="sidebar-rail-badge"
              aria-hidden="true"
            />
          </button>

          <span
            class="sidebar-rail-spacer"
            aria-hidden="true"
          />

          <!-- 「⋯」= 五个工作区面板(Memory/Media/Agents/Tasks/Music)的家。
               平铺那一排 dock 在 workbench 下撤掉了,入口一个不少。 -->
          <button
            ref="railMoreEl"
            type="button"
            class="sidebar-rail-tab"
            :class="{ 'is-on': activeWorkspacePanel !== null }"
            aria-label="工作区面板"
            :aria-expanded="workspaceMenu !== null"
            @click="openWorkspaceMenu"
          >
            <MoreVertical
              :size="16"
              :stroke-width="1.6"
            />
          </button>
          <button
            ref="railNewChatEl"
            type="button"
            class="sidebar-rail-tab"
            aria-label="新会话"
            @click="$emit('create-new-chat')"
          >
            <Plus
              :size="16"
              :stroke-width="1.6"
            />
          </button>
          <button
            ref="railSettingsEl"
            type="button"
            class="sidebar-rail-tab"
            aria-label="Settings"
            @click="$emit('open-settings')"
          >
            <Settings
              :size="15"
              :stroke-width="1.6"
            />
          </button>
        </div>

        <!-- rail 是**纯图标**:名字只能靠浮层说出口。浮层不能包在按钮外面 ——
             `role="tab"` 与 `role="tablist"` 之间夹一层 div 会切断从属关系,
             30px 方钮外面多一个盒子也会把这一竖条撑歪。`trigger-el` 让 Tooltip
             自己 `display:none`,只托管浮层,rail 的 DOM 一个节点都不动。 -->
        <template v-if="isWorkbenchShell">
          <Tooltip
            v-for="category in railCategories"
            :key="`rail-tip-${category.id}`"
            :trigger-el="railTabEls[category.id] ?? null"
            :text="category.label"
            position="right"
          />
          <Tooltip
            :trigger-el="railMoreEl"
            text="工作区面板"
            position="right"
          />
          <Tooltip
            :trigger-el="railNewChatEl"
            text="新会话"
            position="right"
          />
          <Tooltip
            :trigger-el="railSettingsEl"
            text="Settings"
            position="right"
          />
        </template>

        <div class="sidebar-pane">
          <!-- 样板 `.ph`:40px 面板头 = 类别名 + 右对齐计数。分区头即折叠钮那一套
               随分区折叠一起退役了 —— 类别切换替代了它。 -->
          <div
            v-if="isWorkbenchShell"
            class="sidebar-pane-head"
          >
            <b class="sidebar-pane-title">{{ railCategoryLabel }}</b>
            <span class="sidebar-pane-count">{{ railCategoryCount }}</span>
            <!-- 新建群聊:样板没画这枚(它只画了「进行中」那一格),但撤掉就等于
                 把建群这件事弄没,所以它跟着「通讯录」这一类走 —— 建群是**发起**
                 一段对话,和"找谁"在同一面上。 -->
            <Tooltip
              v-if="railCategory === 'contacts' && roomsEnabled"
              text="新建群聊"
            >
              <button
                type="button"
                class="sidebar-rooms-add"
                aria-label="新建群聊"
                @click="showRoomDialog = true"
              >
                ＋
              </button>
            </Tooltip>
          </div>

          <!-- 唯一的滚动体。classic 下这一层是 `display: contents`(不生成盒子,
               排版与从前逐像素一致);workbench 下它是面板的滚动区,一次只装一类。 -->
          <div class="sidebar-sections">
            <!-- 「消息」— 一条时间序的对话流(2026-08-01)。
             **只装两种**:群聊,和与某位同事的私聊。两者**混排**,谁刚说过话谁在
             上面 —— IM 的主列表不按对象类型分列,按类型分列是「通讯录」的活。
             直聊会话不进来(它是工作会话不是对话,家在「会话」那一类),
             agent ⇄ agent 的「私下」房也不进来(那是旁听面,留在通讯录里折叠)。
             合并与排序全在 `sidebar-recent.ts` 的纯函数里,这里只负责贴上名册
             (名字 / 头像)与既有的未读判定 —— 一份账都不新起。
             **workbench 专属**:classic 下四区照旧一起平铺,再插一条把同一批
             会话又画一遍的流,就等于把每一行都摆两次(纪律 1:逐像素回滚闸)。 -->
            <div
              v-if="recentVisible"
              class="sidebar-rooms sidebar-recent"
            >
              <button
                v-for="entry in recentEntries"
                :key="entry.id"
                type="button"
                class="sidebar-room-item sidebar-agent-item sidebar-recent-item"
                :class="{
                  'is-active': sessionsStore.currentSessionId === entry.id,
                  'has-unread': sessionsStore.isUnreadSession(entry.id),
                }"
                @click="openRoom(entry.id)"
                @contextmenu.prevent="openRecentContextMenu($event, entry)"
              >
                <!-- 一枚章,三种行都有 —— 列表左缘对齐是消息流可读的前提。
                 私聊/直聊是圆章头像(和联系人行同一句法),群是方章 + 群名首字。 -->
                <span
                  v-if="entry.kind === 'group'"
                  class="sidebar-agent-avatar sidebar-recent-room-mark"
                  aria-hidden="true"
                >{{ roomInitial(entry.name) }}</span>
                <AgentAvatar
                  v-else
                  class="sidebar-agent-avatar"
                  aria-hidden="true"
                  :avatar="recentFace(entry).avatar"
                  :avatar-image="recentFace(entry).avatarImage"
                  :size="18"
                />
                <span class="sidebar-room-name">{{ recentName(entry) }}</span>
                <span class="sidebar-recent-time">{{ formatRelativeTime(entry.updatedAt) }}</span>
                <span
                  v-if="sessionsStore.isUnreadSession(entry.id)"
                  class="sidebar-unread-dot"
                  aria-label="有新消息"
                />
              </button>

              <div
                v-if="!recentEntries.length"
                class="sidebar-recent-empty"
              >
                还没有对话。去「通讯录」找个人说话,或建一个群。
              </div>
            </div>

            <!-- 「进行中」— docs/design/im-workbench-layout.md §3 W1(C1)。
             左栏的第一类是**活**不是对话:状态点 + 名字 + 一句副文,按
             执行中/待你/已交付分组(样板 `.grp`)。
             取数(`useActiveWork`)提到了 script 里:rail 上这一类的徽标与计数
             在别的类别被选中时也得算,所以它不能跟着这一区的 v-if 一起挂卸。
             两道门仍在,只是搬到了 `activeWorkEnabled` 上:
              - `isWorkbenchShell` —— classic 是逐像素回滚闸,一次看板 IPC 都不发;
              - `roomsEnabled` —— 看板是房的附属,web 端没有 rooms 协调器。
             「没有在跑的活就整区不显示」在方案三下的等价物是「这一类不上 rail」
             (`resolveRailCategories`),所以这里点进来必然有行。 -->
            <ActiveWorkSection
              v-if="activeWorkEnabled && railCategory === 'active'"
              :cards="activeWorkCards"
              :is-room-busy="activeWork.isRoomBusy"
              :is-room-unread="activeWork.isRoomUnread"
              @open="openActiveWorkCard"
            />

            <!-- 联系人(通讯录)分区 — docs/design/agent-im-dm.md §4.1 D1。
             一个 agent 一行,点开就是和 TA 的托管式私聊(单成员 dm 房,惰性建房)。
             数据源是名册而不是会话列表:没聊过的同事也该在通讯录里站着,否则
             「第一次找小李」这件事就没有入口。desktop-only —— 私聊是房,rooms
             在 web 端没有协调器(§7 开放问题),所以与群聊同一道能力门。
             行样式沿用群聊/Agent 组那一族,不另起一套画线风。 -->
            <div
              v-if="roomsEnabled && contacts.length > 0 && isCategoryVisible('contacts')"
              class="sidebar-rooms sidebar-contacts"
            >
              <!-- classic 照旧一枚不可点的标签;workbench 下类别名归面板头,这一行整个
               不画(纪律 1:形态差异关在门里,classic 一个像素不变)。 -->
              <div
                v-if="!isWorkbenchShell"
                class="sidebar-rooms-header"
              >
                <span class="sidebar-rooms-label">联系人</span>
              </div>
              <!-- workbench 下「通讯录」一类里装着同事与群两段,面板头只说得出
               类别名 —— 段与段之间要有一行组头,否则两批行糊成一条。
               句法与「进行中」的组头、「私下」的折叠头同一族。 -->
              <div
                v-else
                class="sidebar-pane-group"
              >
                同事
              </div>
              <button
                v-for="contact in contacts"
                :key="contact.id"
                type="button"
                class="sidebar-room-item sidebar-agent-item sidebar-contact-item"
                :class="{ 'is-active': isContactActive(contact), 'has-unread': isContactUnread(contact) }"
                @click="openContact(contact)"
                @contextmenu.prevent="openContactMenu($event, contact)"
              >
                <AgentAvatar
                  class="sidebar-agent-avatar"
                  aria-hidden="true"
                  :avatar="contact.avatar"
                  :avatar-image="contact.avatarImage"
                  :size="18"
                />
                <span class="sidebar-room-name">{{ contact.name }}</span>
                <span
                  v-if="contact.title"
                  class="sidebar-contact-title"
                >{{ contact.title }}</span>
                <!-- 未读墨点(agent-im-dm.md P4)。一枚点,不摆数字:系统只知道"有没有
                 新话",不知道"几条" —— 编一个计数出来比不显示更糟。 -->
                <span
                  v-if="isContactUnread(contact)"
                  class="sidebar-unread-dot"
                  aria-label="有新消息"
                />
              </button>
              <!-- 失败一行墨(RoomMemberStrip 同款):建房被拒(退休/service/查无此人)
               或 web 端不支持,都必须看得见,绝不静默无反应。收起也照旧显示 ——
               一条报错藏进折叠里就等于没有报错。 -->
              <span
                v-if="contactError"
                class="sidebar-contacts-error"
              >{{ contactError }}</span>
            </div>

            <!-- 群聊(多 Agent 房间)分区 — docs/design/multi-agent-collab.md。
             吃的是 groupRoomSessions:私聊房不在这里出现,联系人行是它唯一的
             侧栏入口(agent-im-dm.md §4.1),否则一间房会在侧栏出现两次。 -->
            <div
              v-if="(roomSessions.length > 0 || roomsEnabled) && isCategoryVisible('contacts')"
              class="sidebar-rooms"
            >
              <!-- classic 照旧:标签 + 建群 ＋。workbench 下建群归面板头,组头
               只剩一行段标(与上面「同事」那一行成对)。 -->
              <div
                v-if="!isWorkbenchShell"
                class="sidebar-rooms-header"
              >
                <span class="sidebar-rooms-label">群聊</span>
                <Tooltip
                  v-if="roomsEnabled"
                  text="新建群聊"
                >
                  <button
                    type="button"
                    class="sidebar-rooms-add"
                    aria-label="新建群聊"
                    @click="showRoomDialog = true"
                  >
                    ＋
                  </button>
                </Tooltip>
              </div>
              <div
                v-else
                class="sidebar-pane-group"
              >
                群聊
              </div>
              <button
                v-for="room in roomSessions"
                :key="room.id"
                type="button"
                class="sidebar-room-item"
                :class="{
                  'is-active': sessionsStore.currentSessionId === room.id,
                  'has-unread': sessionsStore.isUnreadSession(room.id),
                  'has-faces': roomFaces(room.id).faces.length > 0,
                }"
                @click="openRoom(room.id)"
                @contextmenu.prevent="openRoomContextMenu($event, room)"
              >
                <span class="sidebar-room-name">{{ room.name }}</span>
                <!-- 成员头像堆(样板左栏 `.faces`):群聊行上"这是谁的群"一眼可见,
                 这是样板真正比现状强的地方。名册→成员的翻译复用房头成员条那
                 一处 `buildRoomMemberEntries`(退休/查无此人的墓碑口径一并
                 继承),这里只截前三枚。workbench-only —— classic 下
                 `roomFacesById` 直接返回空表,一枚都不画。 -->
                <span
                  v-if="roomFaces(room.id).faces.length > 0"
                  class="sidebar-room-faces"
                  aria-hidden="true"
                >
                  <AgentAvatar
                    v-for="face in roomFaces(room.id).faces"
                    :key="face.id"
                    class="sidebar-room-face"
                    :class="{ 'is-retired': face.isRetired }"
                    :avatar="face.avatar"
                    :avatar-image="face.avatarImage"
                    :size="16"
                  />
                  <span
                    v-if="roomFaces(room.id).overflow > 0"
                    class="sidebar-room-face-more"
                  >+{{ roomFaces(room.id).overflow }}</span>
                </span>
                <span
                  v-if="sessionsStore.isUnreadSession(room.id)"
                  class="sidebar-unread-dot"
                  aria-label="有新消息"
                />
              </button>

              <!-- 「私下」= 双成员 dm 房(agent 互聊,agent-im-dm.md §4.1/D4)。
               群聊这一类**里**的折叠子分组,不是与它并列的第五类:agent 之间的
               私聊是群聊的旁支,而透明制要求它在侧栏看得见 —— 看得见,但默认
               收起,不占视线。房名「A ⇄ B」由引擎现算,这里只显示。 -->
              <template v-if="pairDmRooms.length > 0">
                <button
                  type="button"
                  class="sidebar-subgroup"
                  :aria-expanded="pairDmOpen"
                  @click="pairDmOpen = !pairDmOpen"
                >
                  <span
                    class="sidebar-subgroup-caret"
                    :class="{ open: pairDmOpen }"
                    aria-hidden="true"
                  >
                    <svg
                      class="sidebar-section-caret-glyph"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                  <span class="sidebar-subgroup-label">私下</span>
                  <span class="sidebar-subgroup-count">{{ pairDmRooms.length }}</span>
                  <!-- 收起时组头替组内那些看不见的行说话;展开了就各说各的,组头闭嘴。 -->
                  <span
                    v-if="!pairDmOpen && pairDmUnread"
                    class="sidebar-unread-dot"
                    aria-label="有新消息"
                  />
                </button>
                <template v-if="pairDmOpen">
                  <button
                    v-for="room in pairDmRooms"
                    :key="room.id"
                    type="button"
                    class="sidebar-room-item sidebar-subgroup-item"
                    :class="{
                      'is-active': sessionsStore.currentSessionId === room.id,
                      'has-unread': sessionsStore.isUnreadSession(room.id),
                    }"
                    @click="openRoom(room.id)"
                    @contextmenu.prevent="openRoomContextMenu($event, room)"
                  >
                    <span class="sidebar-room-name">{{ room.name }}</span>
                    <span
                      v-if="sessionsStore.isUnreadSession(room.id)"
                      class="sidebar-unread-dot"
                      aria-label="有新消息"
                    />
                  </button>
                </template>
              </template>
            </div>

            <!-- 「Agent 组」已退役(agent-im-dm.md §4.1)。它唯一的能力 —— 各群执行
             会话的只读转录入口 —— 迁进了 Agents 面板的履历页「群聊」栏:基础设施
             转录放在通讯录层级是错位的,而履历页本来就是"这个人干过什么"的家。 -->

            <!-- 「会话」类:直接复用既有 SessionList(分组、折叠、改名、右键全在它
             自己身上,这里不重写一份)。workbench 下它交出内部滚动 —— 面板是
             唯一的滚动体(规则在 SessionList.vue 自己的形态门里)。 -->
            <SessionList
              v-if="isCategoryVisible('sessions')"
              :groups="groupedSessions"
              :active-index="activeSidebarIndex"
              :current-session-id="sessionsStore.currentSessionId"
              :is-session-generating="chatStore.isSessionGenerating"
              :editing-session-id="editingSessionId"
              :editing-name="editingName"
              @menu-select="handleSidebarMenuSelect"
              @context-menu="openContextMenu"
              @toggle-collapse="sessionOrganizer.toggleCollapse"
              @start-rename="startInlineRename"
              @confirm-rename="confirmInlineRename"
              @cancel-rename="cancelInlineRename"
              @overflow-change="handleOverflowChange"
            />
          </div>
        </div>
      </div>

      <!-- Bottom dock (方案二/v7 原样): 裸 16px 线性图标浮在白胶囊里，
           单色墨系（rest 灰 → hover/active 墨），设置在分隔线右侧。
           **classic 专属** —— workbench 下这排平铺图标撤掉(用户真机要求 4),
           五个工作区面板收进下面那条脚栏的「⋯」菜单,一个入口都不丢。 -->
      <div
        v-if="!isWorkbenchShell"
        class="sidebar-dock"
      >
        <div class="sidebar-dock-pill">
          <button
            v-for="action in workspaceActions"
            :key="action.id"
            type="button"
            class="sidebar-dock-icon"
            :class="{ 'is-active': activeWorkspacePanel === action.id }"
            :aria-label="action.label"
            @click="$emit('open-workspace-panel', action.id)"
          >
            <component
              :is="action.icon"
              :size="16"
              :stroke-width="1.7"
            />
          </button>
          <span
            class="sidebar-dock-divider"
            aria-hidden="true"
          />
          <button
            type="button"
            class="sidebar-dock-icon"
            aria-label="Settings"
            @click="$emit('open-settings')"
          >
            <Settings
              :size="16"
              :stroke-width="1.7"
            />
          </button>
        </div>
      </div>

      <!-- R4 那条「脚栏」(`.sidebar-foot`)在方案三里退役:它的两枚图标(⋯ / 设置)
           搬进了 rail 底部那一栏 —— 样板第三格把入口全收在 46px 那一竖条上,
           面板底下不再另起一条发丝线。 -->

      <!-- 「⋯」= 工作区面板菜单。复用既有 ContextMenu(Teleport 到 body,不会被
           左栏的 overflow 裁掉),锚点取按钮的 rect 而不是鼠标位置 —— 它是个
           下拉,不是右键菜单。 -->
      <ContextMenu
        v-if="isWorkbenchShell"
        class="sidebar-workspace-menu"
        :show="workspaceMenu !== null"
        :x="workspaceMenu?.x ?? 0"
        :y="workspaceMenu?.y ?? 0"
        :items="workspaceMenuItems"
        @select="onWorkspaceMenuSelect"
        @close="workspaceMenu = null"
      />

      <RoomCreateDialog
        :visible="showRoomDialog"
        @close="showRoomDialog = false"
      />

      <!-- 会话右键菜单。P1 合流:原 SessionContextMenu.vue(平行实现,自己 teleport、自己画遮罩、不回弹视口)整份删掉,改清单驱动。 -->
      <ContextMenu
        :show="contextMenu.show"
        :x="contextMenu.x"
        :y="contextMenu.y"
        :items="sessionMenuItems"
        :min-width="160"
        @select="onSessionMenuSelect"
        @close="closeContextMenu"
      />

      <!-- 联系人右键:「打开空间」(= 点头像同一处)与「配置 Agent」。两条都走
           `openAgentSpace`,差别只是停在哪一面。 -->
      <ContextMenu
        :show="contactMenu !== null"
        :x="contactMenu?.x ?? 0"
        :y="contactMenu?.y ?? 0"
        :items="CONTACT_MENU_ITEMS"
        @select="onContactMenuSelect"
        @close="contactMenu = null"
      />
    </Space>
  </aside>
</template>

<script setup lang="ts">
import Space from '@/components/common/Space.vue'
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import ContextMenu from '@/components/common/ContextMenu.vue'
import Tooltip from '@/components/common/Tooltip.vue'
import type { ContextMenuItem } from '@/components/common/context-menu'
import { DEFAULT_AGENT_ID, useAgentsStore } from '@/stores/agents'
import { useChatStore } from '@/stores/chat'
import { Bot, Brain, CalendarClock, Images, MoreVertical, Pencil, Pin, Plus, Radio, Settings, X } from 'lucide-vue-next'
import { buildRoomMemberEntries, type RoomMemberEntry } from '@/components/chat/room-member-strip'
import SidebarHeader from './SidebarHeader.vue'
import SidebarActionGroup from './SidebarActionGroup.vue'
import SessionList from './SessionList.vue'
import RoomCreateDialog from './RoomCreateDialog.vue'
import ActiveWorkSection from './ActiveWorkSection.vue'
import { hasActiveWorkSignal, type ActiveWorkCardModel } from './active-work'
import { useActiveWork } from './useActiveWork'
import {
  SIDEBAR_RAIL_CATEGORIES,
  SIDEBAR_RAIL_STORAGE_KEY,
  resolveRailBadges,
  resolveRailCategories,
  resolveRailCategory,
  takeRoomFaces,
  type SidebarRailCategoryId,
} from './sidebar-sections'
import {
  buildRecentEntries,
  roomInitial,
  type SidebarRecentEntry,
} from './sidebar-recent'
import { platformApi } from '@/platform'
import { useWorkspaceStore } from '@/stores/workspace'
import { useSettingsStore } from '@/stores/settings'
import { resolveShellMode } from '@/composables/useShellMode'
import {
  formatRelativeTime,
  useSessionOrganizer,
  type SessionWithBranches,
} from './useSessionOrganizer'

interface Props {
  collapsed?: boolean
  floating?: boolean
  floatingClosing?: boolean
  noTransition?: boolean
  mediaPanelOpen?: boolean
  activeWorkspacePanel?: 'memory' | 'media' | 'agents' | 'tasks' | 'music' | 'practice' | null
  width?: number
}

type WorkspacePanel = 'memory' | 'media' | 'agents' | 'tasks' | 'music' | 'practice'

const props = withDefaults(defineProps<Props>(), {
  collapsed: false,
  floating: false,
  floatingClosing: false,
  noTransition: false,
  activeWorkspacePanel: null,
  width: 300,
})

const emit = defineEmits<{
  toggleCollapse: []
  'toggle-media-panel': []
  'open-workspace-panel': [panel: WorkspacePanel]
  'select-session': [sessionId: string]
  'create-new-chat': []
  'open-search': []
  'open-settings': []
  'request-floating-keep-open': []
  'request-floating-close': []
}>()

// Stores
const sessionsStore = useSessionsStore()
const chatStore = useChatStore()
const workspaceStore = useWorkspaceStore()

// 群聊(多 Agent 房间) — desktop only in P0: the web host has no
// RoomCoordinator and its server silently ignores kind='room' creates.
const showRoomDialog = ref(false)
const roomsEnabled = computed(() => platformApi.capabilities.collabRooms)
// 群聊区 = 普通群。私聊房(单成员 dm)由 store 的 selector 摘走 —— 这里不写
// 第二份过滤,判定只有 sessions store 那一处(agent-im-dm.md §4.1)。
const roomSessions = computed(() => sessionsStore.groupRoomSessions)
// 「私下」子分组(§4.1):双成员 dm 房。同样只读 store 的 selector,不在这里
// 写第二份形态判定。默认收起 —— 它是旁支,不是主线。
const pairDmRooms = computed(() => sessionsStore.agentPairDmRoomSessions)
const pairDmOpen = ref(false)
// 收起的「私下」组头替组内的行说话。判定仍然是 store 那一个 `isUnreadSession`,
// 这里只做"有没有任意一间"的聚合(agent-im-dm.md P4)。
const pairDmUnread = computed(() =>
  pairDmRooms.value.some(room => sessionsStore.isUnreadSession(room.id)),
)

function openRoom(sessionId: string): void {
  workspaceStore.openSession(sessionId)
}

// ── 外壳形态门(C0 的 useShellMode)────────────────────────────────────────
// 「进行中」区是**结构**差异不是视觉差异(它带着一次取数),CSS 门关不掉一次
// IPC,所以这一处必须是 JS 判定。视觉上的四区重排仍然走 `data-shell-mode`。
// 没挂 pinia 的老单测取不到设置 store —— 退到 classic,也就是"什么都不变",
// 这是测试兜底,不是产品默认(产品默认见 resolveShellMode)。
let settingsStore: ReturnType<typeof useSettingsStore> | null = null
try {
  settingsStore = useSettingsStore()
} catch {
  settingsStore = null
}
const isWorkbenchShell = computed(
  () => !!settingsStore && resolveShellMode(settingsStore.settings) === 'workbench',
)

// ── 「进行中」的取数(方案三:提到了这一层)──────────────────────────────
//
// rail 上「进行中」那一类的**徽标、计数、以及这一类在不在 rail 上**,在别的类别
// 被选中时也得算 —— 所以取数不能再跟着那一区的 v-if 一起挂载/卸载。composable
// 不能条件调用,于是把两道门做成参数(`enabled`):关着的时候订阅不发、补齐不跑、
// 卡片恒空。classic「一次看板 IPC 都不发」这条有测试钉住。
const activeWorkEnabled = computed(() => isWorkbenchShell.value && roomsEnabled.value)
const activeWork = useActiveWork({ enabled: activeWorkEnabled })
const activeWorkCards = computed(() => activeWork.cards.value)

// ── rail 类别(方案三)──────────────────────────────────────────────────────
// 判定与存档格式全在 `sidebar-sections.ts`(纯函数),这里只负责读一次、写一次。
// localStorage 而不是 settings:「我停在哪一类」是本机视图偏好,不跨端同步 ——
// 与 R4 那套折叠态同一个机制,只是那一套已随分区折叠一起退役。
const storedRailCategory = ref<string | null>(readStoredRailCategory())

function readStoredRailCategory(): string | null {
  try {
    return localStorage.getItem(SIDEBAR_RAIL_STORAGE_KEY)
  } catch {
    // 隐私模式/沙箱里 localStorage 会抛 —— 读不到就退到第一个可用类别。
    return null
  }
}

/** rail 上真正画出来的类别(web 降级在这一处判)。 */
const railCategories = computed(() => {
  const ids = resolveRailCategories({ roomsEnabled: roomsEnabled.value })
  return SIDEBAR_RAIL_CATEGORIES.filter(category => ids.includes(category.id))
})

const railCategory = computed<SidebarRailCategoryId>(() => resolveRailCategory(
  storedRailCategory.value,
  railCategories.value.map(category => category.id),
))

const railCategoryLabel = computed(
  () => railCategories.value.find(category => category.id === railCategory.value)?.label ?? '',
)

/**
 * rail 每一枚图标的宿主元素。浮层用 `trigger-el` 认它们 —— 包一层 wrapper 会
 * 切断 `tablist ↔ tab` 的从属,也会把 46px 那一竖条撑歪(见模板里的注释)。
 */
const railTabEls = ref<Record<string, HTMLElement | null>>({})
const railMoreEl = ref<HTMLElement | null>(null)
const railNewChatEl = ref<HTMLElement | null>(null)
const railSettingsEl = ref<HTMLElement | null>(null)

function setRailTabEl(id: string, el: unknown): void {
  railTabEls.value[id] = (el as HTMLElement | null) ?? null
}

/** 面板头右上那个数 = 这一类此刻装着几行。 */
const railCategoryCount = computed(() => {
  switch (railCategory.value) {
    case 'recent': return recentEntries.value.length
    case 'active': return activeWorkCards.value.length
    // 通讯录一类装着同事与群两段,计数是两段之和 —— 面板头那个数说的是
    // "这一类此刻装着几行",不是"其中一段有几行"。
    case 'contacts': return contacts.value.length + roomSessions.value.length
    default: return groupedSessions.value.reduce((total, group) => total + group.sessions.length, 0)
  }
})

/**
 * 徽标:未读落在**能回话的那一类**,在跑落在「进行中」。
 *
 * 两路未读天然不重叠 —— 「消息」装房(群 + 私聊 + 折叠着的「私下」),「会话」装
 * 直聊。所以各归各的不会让同一条未读被数两遍。**通讯录不亮**:它的每一行要么
 * 已经在消息流里,要么根本没聊过,替消息流再报一次就是重复催人。
 * 判定本身仍只有 `isUnreadSession` 那一处。
 */
const unreadConversations = computed(() =>
  roomSessions.value.some(room => sessionsStore.isUnreadSession(room.id))
  || pairDmUnread.value
  || contacts.value.some(contact => isContactUnread(contact)),
)

const unreadChatSessions = computed(() =>
  filteredSessions.value.some(session => sessionsStore.isUnreadSession(session.id)),
)

const railBadges = computed(() => resolveRailBadges({
  available: railCategories.value.map(category => category.id),
  unreadConversations: unreadConversations.value,
  unreadChatSessions: unreadChatSessions.value,
  activeWork: hasActiveWorkSignal(activeWorkCards.value),
}))

function selectRailCategory(id: SidebarRailCategoryId): void {
  storedRailCategory.value = id
  try {
    localStorage.setItem(SIDEBAR_RAIL_STORAGE_KEY, id)
  } catch {
    // 存不下就只在本次会话里生效,不该因此把切类这个动作也废掉。
  }
}

/**
 * 这一区现在该不该出现。
 *
 * classic 永远当作"全都出现"—— 类别切换是 workbench 的形态,逐像素回滚闸下
 * 四区照旧一起平铺(纪律 1)。
 */
function isCategoryVisible(id: SidebarRailCategoryId): boolean {
  return !isWorkbenchShell.value || railCategory.value === id
}

// ── 「消息」类:一条时间序的对话流 ──────────────────────────────────────────
//
// **workbench 专属**,这是唯一一处不套 `isCategoryVisible` 的区:classic 下四区
// 一起平铺,再插一条把私聊/群/直聊又画一遍的流,等于每一行都摆两次。

const recentVisible = computed(
  () => isWorkbenchShell.value && railCategory.value === 'recent',
)

/**
 * 合并与排序全在 `sidebar-recent.ts`。两路来源一律读 store 的 selector,这里不写
 * 第二份形态过滤(哪些房算私聊 / 群只有 store 那一处答案)。
 *
 * **只装对话**:群聊 + 和某位同事的私聊。直聊会话(`kind='chat'`)不进来 ——
 * 那是一条工作会话,不是"和谁的一段对话",它的家在「会话」那一类;混进来这一格
 * 就退化成"全部东西的时间序",IM 的那一格也就没了意义。
 */
const recentEntries = computed(() => buildRecentEntries({
  dmRooms: sessionsStore.userDmRoomSessions,
  groupRooms: roomSessions.value,
}))

/**
 * 私聊行的名字取**名册**而不是房名:同事改了名,和 TA 的那间房不会跟着改,
 * 读房名就会在消息流里留一个旧称呼。群没有这个问题,用房名。
 */
function recentName(entry: SidebarRecentEntry): string {
  if (entry.kind === 'dm' && entry.agentId) {
    return agentsStore.displayAgent(entry.agentId).name || entry.name || '私聊'
  }
  return entry.name || '群聊'
}

/** 圆章画谁 —— 只有私聊行有人可画(`displayAgent` 查无此人给墓碑,不冒充 default)。 */
function recentFace(entry: SidebarRecentEntry): { avatar?: string; avatarImage?: string } {
  if (!entry.agentId) return {}
  const identity = agentsStore.displayAgent(entry.agentId)
  return { avatar: identity.avatar, avatarImage: identity.avatarImage }
}

/** 消息流的行全是会话 —— 右键复用同一张会话菜单(改名/置顶/删除)。 */
function openRecentContextMenu(event: MouseEvent, entry: SidebarRecentEntry): void {
  const session = sessionsStore.getSessionItem?.(entry.id)
  if (!session) return
  openContextMenu(event, session as unknown as SessionWithBranches)
}

/**
 * 折叠 = 整块淡出。两种壳同一套语义 —— App 那边折叠时根本不挂侧栏(见
 * `sidebarDockedVisible`),这条是组件自己的兜底。
 *
 * workbench 曾把折叠画成一条 46px 的 rail(方案三),2026-07-31 撤掉:交通灯
 * 比 rail 宽,左上角永远对不齐。理由写在 App.vue 那处注释里。
 */
const contentHidden = computed(
  () => props.collapsed && !props.floating,
)

/**
 * 群聊行的成员头像堆(样板左栏 `.faces`)。
 *
 * 名册 → 成员条目的翻译**只有一处**:`chat/room-member-strip.ts` 的
 * `buildRoomMemberEntries`,与房头成员条同一个 selector —— 退休/查无此人的墓碑
 * 口径、负责人标记全部继承,这里不写第二份。截断交给 `takeRoomFaces`。
 */
const roomFacesById = computed(() => {
  const byRoom: Record<string, ReturnType<typeof takeRoomFaces<RoomMemberEntry>>> = {}
  // classic 一枚头像都不画,连算都不算(逐像素回滚闸)。
  if (!isWorkbenchShell.value) return byRoom
  const agents = agentsStore.agents ?? []
  for (const room of roomSessions.value) {
    byRoom[room.id] = takeRoomFaces(buildRoomMemberEntries({
      memberAgentIds: room.room?.memberAgentIds ?? [],
      agents,
      pmAgentId: room.room?.pmAgentId,
    }))
  }
  return byRoom
})

function roomFaces(roomSessionId: string) {
  return roomFacesById.value[roomSessionId] ?? { faces: [], overflow: 0 }
}

/**
 * 点一张活卡片 = 打开这张卡所在的房(与群聊行同一条 `openSession` 链路)
 * + 右栏切到这张卡的线程(C3,§3 W1「卡片点击 = 打开该卡对应的房 + 右栏切到
 * 该卡的线程」)。
 *
 * 线程走 window 事件而不是 emit 上去:侧栏离右栏隔着 App 的整棵布局,中栏活动线
 * 的「展开 →」派的也是同一个事件同一个形状,两个入口共用一条线路才只有一份契约。
 * `workSessionId`(尾条工作台会话 = 当前那次执行)为空就只开房 —— 活刚领下来还
 * 没开过工作台,派一个空事件只会在右栏开出一个读不到东西的 tab。
 */
function openActiveWorkCard(card: ActiveWorkCardModel): void {
  if (!card.roomSessionId) return
  openRoom(card.roomSessionId)
  if (!card.workSessionId) return
  window.dispatchEvent(new CustomEvent('onething:open-thread', {
    detail: { workSessionId: card.workSessionId, title: card.title, taskId: card.taskId },
  }))
}

/** 群聊行右键 = 复用会话上下文菜单(改名/删除;删除会级联清掉工作会话)。 */
function openRoomContextMenu(event: MouseEvent, room: { id: string }): void {
  openContextMenu(event, room as unknown as SessionWithBranches)
}

const agentsStore = useAgentsStore()

// ── 联系人区(agent-im-dm.md §4.1)────────────────────────────────────────
// 通讯录取社交面名册(域模型 M2 的 `colleagues`:colleague && active),不是
// 会话列表 —— 没聊过的同事也得在这儿站着,不然"第一次找小李"没有入口。
// 名册得先加载:群聊区靠执行会话触发那条 watch,通讯录一间房都还没有的时候
// 也要有人,所以这里自己拉一次(store 自带去重,全 app 仍是一次拉取)。
watch(roomsEnabled, (enabled) => {
  if (enabled && !agentsStore.hasLoaded) void agentsStore.loadAgents().catch(() => {})
}, { immediate: true })

interface SidebarContact {
  id: string
  name: string
  title?: string
  avatar?: string
  avatarImage?: string
}

/** 主助理置顶(D1/M5:default 是第一位联系人),其余保持名册顺序。 */
const contacts = computed<SidebarContact[]>(() => {
  const roster = agentsStore.colleagues
  const head = roster.filter(agent => agent.id === DEFAULT_AGENT_ID)
  const rest = roster.filter(agent => agent.id !== DEFAULT_AGENT_ID)
  return [...head, ...rest].map(agent => ({
    id: agent.id,
    name: agent.name,
    title: agent.title,
    avatar: agent.avatar,
    avatarImage: agent.avatarImage,
  }))
})

const CONTACT_MENU_SPACE = 'agent-space'
const CONTACT_MENU_CONFIGURE = 'configure-agent'
const CONTACT_MENU_ITEMS: ContextMenuItem[] = [
  { id: CONTACT_MENU_SPACE, label: '打开空间' },
  { id: CONTACT_MENU_CONFIGURE, label: '配置 Agent' },
]
const CONTACT_ERROR_LINGER_MS = 4000

const contactMenu = ref<{ x: number; y: number; agentId: string } | null>(null)
const contactError = ref('')
const openingContactId = ref('')
let contactErrorTimer: ReturnType<typeof setTimeout> | null = null

function showContactError(message: string): void {
  contactError.value = message
  if (contactErrorTimer) clearTimeout(contactErrorTimer)
  contactErrorTimer = null
  if (!message) return
  contactErrorTimer = setTimeout(() => { contactError.value = '' }, CONTACT_ERROR_LINGER_MS)
}

/** 已经聊过就点亮 —— 房是惰性建的,没建过的联系人当然不该有高亮。 */
function isContactActive(contact: SidebarContact): boolean {
  const room = sessionsStore.findUserDmRoom(contact.id)
  return !!room && sessionsStore.currentSessionId === room.id
}

/**
 * 联系人行的未读 = TA 的私聊房未读。没建过房的联系人当然不会有未读 ——
 * 判定本身只有 store 那一处,这里只是把 agent 翻译成 房。
 */
function isContactUnread(contact: SidebarContact): boolean {
  const room = sessionsStore.findUserDmRoom(contact.id)
  return !!room && sessionsStore.isUnreadSession(room.id)
}

/**
 * 点联系人 = 打开和 TA 的私聊。建房幂等(同一个 agent 永远同一间房),所以
 * "打开"和"创建"是同一个调用;新建的房要先进列表 openSession 才认得,这跟
 * RoomCreateDialog 同一条动线。
 */
async function openContact(contact: SidebarContact): Promise<void> {
  if (openingContactId.value) return
  openingContactId.value = contact.id
  showContactError('')
  try {
    const response = await platformApi.ensureCollabDmRoom(contact.id)
    if (!response?.success || !response.roomSessionId) {
      showContactError(response?.error || '打不开私聊')
      return
    }
    // 这一处**留着**(架构收敛 C4 §3):第一次点某个联系人时私聊房是**新建**的,
    // 而 `session:collab-updated` 只改已知的行。下一行的 openSession 要求它已经
    // 在列表里 —— 与 RoomCreateDialog 同一条动线。
    await sessionsStore.loadSessions()
    workspaceStore.openSession(response.roomSessionId)
  } catch (cause) {
    showContactError(cause instanceof Error ? cause.message : String(cause))
  } finally {
    openingContactId.value = ''
  }
}

function openContactMenu(event: MouseEvent, contact: SidebarContact): void {
  showContactError('')
  contactMenu.value = { x: event.clientX, y: event.clientY, agentId: contact.id }
}

function onContactMenuSelect(id: string): void {
  const agentId = contactMenu.value?.agentId
  contactMenu.value = null
  if (!agentId) return
  if (id !== CONTACT_MENU_CONFIGURE && id !== CONTACT_MENU_SPACE) return
  /* 两条岔开(agent-space-workbench.md P1):
     「打开空间」= 右栏那一页(和点头像同一个落点);
     「配置 Agent」= Agents 管理页 —— 那是名册面的动作(新建/退休/恢复/通览)。 */
  if (id === CONTACT_MENU_SPACE) {
    agentsStore.openAgentSpace(agentId, 'sessions')
    return
  }
  agentsStore.openAgentManager(agentId, 'config')
}

onUnmounted(() => {
  if (contactErrorTimer) clearTimeout(contactErrorTimer)
})

const workspaceActions = [
  { id: 'memory' as const, label: 'Memory', icon: Brain },
  { id: 'media' as const, label: 'Media', icon: Images },
  { id: 'agents' as const, label: 'Agents', icon: Bot },
  { id: 'tasks' as const, label: 'Tasks', icon: CalendarClock },
  { id: 'music' as const, label: 'Music', icon: Radio },
]

// ── 「⋯」工作区面板菜单(R4,用户真机走查要求 4)──────────────────────────
// 平铺的一排 dock 图标在 workbench 下撤掉了,但那是这五个面板**唯一**的入口 ——
// 删掉就等于把功能弄没。清单直接吃 `workspaceActions`(不抄第二份:少一个就是
// 少一个进不去的面板),菜单项 = 面板,一一对应。
const workspaceMenu = ref<{ x: number; y: number } | null>(null)

const workspaceMenuItems = computed<ContextMenuItem[]>(() =>
  workspaceActions.map(action => ({
    id: action.id,
    label: action.label,
    icon: action.icon,
  })),
)

/** 锚点取按钮的 rect:它是个下拉,不是右键菜单,不该跟着鼠标落点跑。 */
function openWorkspaceMenu(event: MouseEvent): void {
  const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  workspaceMenu.value = rect
    ? { x: Math.round(rect.left), y: Math.round(rect.top) }
    : { x: event.clientX, y: event.clientY }
}

function onWorkspaceMenuSelect(id: string): void {
  workspaceMenu.value = null
  const action = workspaceActions.find(candidate => candidate.id === id)
  if (!action) return
  emit('open-workspace-panel', action.id)
}

// Composable
const sessionOrganizer = useSessionOrganizer()

// Make props available in template
const collapsed = computed(() => props.collapsed)
const floating = computed(() => props.floating)
const floatingClosing = computed(() => props.floatingClosing)

// Local state
const localSearchQuery = ref('')
const hasContentBelow = ref(false)

// Inline editing state
const editingSessionId = ref<string | null>(null)
const editingName = ref('')

// Context menu state
const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  session: null as SessionWithBranches | null,
})

// Computed sidebar style
const sidebarStyle = computed(() => {
  const baseStyle = {
    '--sidebar-docked-width': `${props.width}px`,
  }

  if (floating.value || floatingClosing.value) {
    return {
      ...baseStyle,
      transition: 'none'
    }
  }

  return {
    ...baseStyle,
    transition: props.noTransition ? 'none' : undefined
  }
})

// Filtered and flat sessions
const filteredSessions = computed(() => {
  const sessions = sessionsStore.sidebarSessions
  if (!localSearchQuery.value.trim()) {
    return sessions
  }
  const query = localSearchQuery.value.toLowerCase()
  return sessions.filter(s =>
    (s.name || '').toLowerCase().includes(query)
  )
})

/**
 * The radio DJ's curation sessions as a sidebar group of their own —
 * filtered out of the public list (they drive themselves and would read as
 * ghosts there), but one expand away. Clicking opens in the main chat like
 * any session. Synthesizing a SessionGroup buys SubMenu's collapse, the
 * 5-visible/show-more limit and the context menu for free.
 */
const musicGroup = computed(() => {
  const radioSessions = sessionsStore.radioSessions
  if (radioSessions.length === 0) return null
  return {
    key: 'music',
    label: 'Music · 电台',
    sessions: radioSessions.map((session): SessionWithBranches => ({
      ...session,
      branches: [],
      depth: 0,
      hasBranches: false,
      isCollapsed: false,
      isLastChild: false,
      branchCount: 0,
      isHidden: false,
      lastBranchUpdate: session.updatedAt,
      ancestorsLastChild: [],
    })),
  }
})

const groupedSessions = computed(() => {
  const groups = sessionOrganizer.getProjectGroupedSessions(filteredSessions.value)
  const music = musicGroup.value
  // Music rides on top: the station is a live thing, not an archive.
  return music ? [music, ...groups] : groups
})

const activeSidebarIndex = computed(() => {
  if (sessionsStore.currentSessionId) return sessionMenuIndex(sessionsStore.currentSessionId)
  return ''
})

function sessionMenuIndex(sessionId: string): string {
  return `session:${sessionId}`
}

function handleSidebarMenuSelect(index: string) {
  if (index.startsWith('session:')) {
    if (editingSessionId.value) return
    emit('select-session', index.slice('session:'.length))
  }
}

function handleMouseEnter() {
  if (!props.floating && !props.floatingClosing) return
  emit('request-floating-keep-open')
}

function handleMouseLeave() {
  if (!props.floating || props.floatingClosing) return
  emit('request-floating-close')
}

// Overflow change handler
function handleOverflowChange(_isOverflowing: boolean, hasBelow: boolean) {
  hasContentBelow.value = hasBelow
}

// Context menu handlers
function openContextMenu(event: MouseEvent, session: SessionWithBranches) {
  if (sessionsStore.isNewChatDraftId(session.id)) return
  contextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    session,
  }
}

function closeContextMenu() {
  contextMenu.value.show = false
}

/** 与旧 SessionContextMenu 逐项等价:重命名 / 钉住(文案随状态翻转)/ 分隔线 / 关闭。 */
const sessionMenuItems = computed<ContextMenuItem[]>(() => [
  { id: 'rename', label: 'Rename', icon: Pencil },
  { id: 'pin', label: contextMenu.value.session?.isPinned ? 'Unpin' : 'Pin', icon: Pin },
  { id: 'delete', label: 'Close', icon: X, danger: true, separatorBefore: true },
])

async function onSessionMenuSelect(id: string): Promise<void> {
  const session = contextMenu.value.session
  if (!session) return
  if (id === 'rename') {
    startInlineRename(session)
    return
  }
  if (id === 'pin') {
    await sessionsStore.updateSessionPin(session.id, !session.isPinned)
    return
  }
  if (id === 'delete') {
    await sessionsStore.deleteSession(session.id)
  }
}

// Inline rename handlers
function startInlineRename(session: SessionWithBranches) {
  if (sessionsStore.isNewChatDraftId(session.id)) return
  editingSessionId.value = session.id
  editingName.value = session.name || ''
}

function cancelInlineRename() {
  editingSessionId.value = null
  editingName.value = ''
}

async function confirmInlineRename(sessionId: string, newName: string) {
  const session = sessionsStore.filteredSessions.find(s => s.id === sessionId)
  const originalName = session?.name || ''
  const trimmedName = newName.trim()

  // Clear editing state first
  editingSessionId.value = null
  editingName.value = ''

  // Only call rename if name actually changed
  if (trimmedName && trimmedName !== originalName) {
    await sessionsStore.renameSession(sessionId, trimmedName)
  }
}

// Window resize handler
function handleWindowResize() {
  if (window.innerWidth < 768) {
    if (!props.collapsed) {
      emit('toggleCollapse')
    }
  }
}

onMounted(() => {
  window.addEventListener('resize', handleWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
})
</script>

<style scoped>
.sidebar {
  --sidebar-docked-width: 300px;
  --sidebar-floating-gutter: 6px;
  --sidebar-floating-safe-zone: 36px;
  --sidebar-bg: var(--ui-sidebar-surface-bg, var(--ui-surface-app-bg));
  /* 行层级从墨色按比例派生，保证任何主题下 分组头(全墨) > 行文(72% 墨) >
     active(14%) > hover(8%) 的对比关系都成立——直接引各主题的通用 state token 时
     对比度不可控（用户实测过分组头/行文一个色、hover 看不见）。
     P4 起这条派生链**住在主题层**（role-mapping.ts 的 REGION_OVERLAY_STEPS，
     由 css-mapper 按各主题的 sidebar 底色解析成实色），这里只留区域别名，
     整棵 sidebar（新会话/列表/SessionItem/ActiveWork）共用。 */
  --sidebar-row-ink: var(--ui-sidebar-row-ink);
  --sidebar-row-fg: var(--ui-sidebar-row-fg);
  --sidebar-row-hover-fill: var(--ui-sidebar-item-hover-bg);
  --sidebar-row-active-fill: var(--ui-sidebar-item-active-bg);
  position: relative;
  flex: 1 1 auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  transition: opacity var(--duration-normal) var(--ease-default);
  overflow: hidden;
  background: var(--sidebar-bg);
  padding: 0;
  contain: layout style;
}

/* Floating sidebar mode */
.sidebar.floating {
  position: fixed;
  left: 0;
  top: 0;
  width: calc(
    var(--sidebar-docked-width)
    + var(--sidebar-floating-gutter)
    + var(--sidebar-floating-gutter)
    + var(--sidebar-floating-safe-zone)
  ) !important;
  max-width: calc(
    var(--sidebar-docked-width)
    + var(--sidebar-floating-gutter)
    + var(--sidebar-floating-gutter)
    + var(--sidebar-floating-safe-zone)
  ) !important;
  height: 100%;
  z-index: var(--z-sidebar);
  background: transparent;
  animation: slideInLeft 0.2s cubic-bezier(0.32, 0.72, 0, 1) forwards;
  overflow: visible;
  transition: none;
  pointer-events: auto;
}

/* Floating card clears the fixed window-controls strip (traffic lights +
   sidebar actions, top 12px + 24px) instead of sliding beneath it — list
   content must never show through that transparent strip. */
.sidebar.floating .sidebar-content {
  width: var(--sidebar-docked-width);
  min-width: var(--sidebar-docked-width);
  max-width: var(--sidebar-docked-width);
  height: calc(100% - 44px - var(--sidebar-floating-gutter));
  margin: 44px var(--sidebar-floating-gutter) var(--sidebar-floating-gutter);
  padding-bottom: 0;
  background: var(--sidebar-bg);
  border: 1px solid color-mix(in srgb, var(--ui-sidebar-border-border, var(--ui-border-subtle-border)) 72%, transparent);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-floating);
  will-change: transform, opacity;
  pointer-events: auto;
}

/* The in-card traffic-lights spacer is meaningless when the card already
   starts below the window controls. */
.sidebar.floating .sidebar-content :deep(.sidebar-header) {
  display: none;
}

.sidebar.floating.floating-closing {
  animation: slideOutLeft 0.2s cubic-bezier(0.4, 0, 1, 1) forwards;
}

@keyframes slideInLeft {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOutLeft {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(-100%);
    opacity: 0;
  }
}

/* Sidebar content panel */
.sidebar-content {
  flex: 1;
  align-self: flex-start;
  width: var(--sidebar-docked-width);
  min-width: var(--sidebar-docked-width);
  max-width: var(--sidebar-docked-width);
  min-height: 0;
  margin-top: 12px;
  background: transparent;
  overflow: hidden;
  contain: layout style paint;
  transition: opacity var(--duration-normal) var(--ease-default);
}

/* Content fades out faster than width shrinks */
.sidebar-content.content-hidden {
  opacity: 0;
  pointer-events: none;
}

/* 方案六 · 顶部「＋ 新会话」：文本行不进滚动区，hover 只由灰转墨（无填充），
   ＋ 号与分组行 chevron 同起笔线（x=24 = 列表容器 12 + 抽屉头起点 12）。
   上内边距 12px 让文字躲开 SidebarHeader 底部同高的淡出渐变。 */
.sidebar-newchat {
  flex-shrink: 0;
  margin: 0;
  padding: 12px 16px 10px 24px;
  border: none;
  background: transparent;
  text-align: left;
  font-family: inherit;
  /* v7：与行文同 13px */
  font-size: 13px;
  line-height: 1.5;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg));
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: color var(--duration-normal) var(--ease-default);
}

.sidebar-newchat:hover,
.sidebar-newchat:focus-visible {
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg));
}

/* 方案三的两层壳与滚动容器。classic 下三层都是 `display: contents` —— 不生成
   盒子,四区仍然是 `.sidebar-content` 的直接布局子,排版与从前逐像素一致。
   真正成为 rail | 面板 与滚动体的规则写在文件末尾的
   `data-shell-mode='workbench'` 门里。 */
.sidebar-split,
.sidebar-pane,
.sidebar-sections {
  display: contents;
}

/* ── rail(样板 `.sb3 .rail`)────────────────────────────────────────────────
   46px 一竖条,只有 workbench 会渲染它(classic 下这个元素根本不存在)。
   墨阶(墨 / 4.5% hover / 7.5% 当前 / 2.5% 底 / 47% 次要字)由主题层派生成
   `--ui-sidebar-rail-*`,这里只引用 —— 样板的字面色是给纸色底子写死的,
   换算成同比例的墨阶之后任何主题下的层级关系都成立。 */
.sidebar-rail {
  flex: 0 0 46px;
  width: 46px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 0 8px;
  background: var(--ui-sidebar-rail-bg);
}

/* 样板 `.sb3 .rail .t`:30px 方钮、6px 圆角、hover 极淡填充、当前项填充加深
   且转墨色。没有边框也没有阴影。 */
.sidebar-rail-tab {
  position: relative;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-sidebar-rail-muted-fg);
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-default), color var(--duration-fast) var(--ease-default);
}

.sidebar-rail-tab:hover {
  background: var(--ui-sidebar-rail-hover-bg);
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg));
}

.sidebar-rail-tab.is-on {
  background: var(--ui-sidebar-rail-active-bg);
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg));
}

.sidebar-rail-tab:focus-visible {
  outline: none;
  box-shadow: var(--ui-focus-ring-soft-shadow);
}

/* 样板 `.bdg`:右上角 5px 一枚墨点 —— 该类有未读或在跑。 */
.sidebar-rail-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--sidebar-row-ink, var(--ui-text-primary-fg));
}

.sidebar-rail-spacer {
  flex: 1 1 auto;
}

/* ── 面板头(样板 `.sb3 .ph`)────────────────────────────────────────────────
   40px:类别名(13px / 550)+ 右对齐计数。分区头即折叠钮那一套已随分区折叠
   一起退役 —— 类别切换替代了它。 */
.sidebar-pane-head {
  flex: 0 0 40px;
  height: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
}

.sidebar-pane-title {
  font-size: 13px;
  font-weight: 550;
  line-height: 1.45;
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg));
  user-select: none;
}

.sidebar-pane-count {
  margin-left: auto;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--sidebar-row-ink, var(--ui-text-primary-fg)) 47%, transparent);
  user-select: none;
}

/* 联系人 / 群聊两组——同一套画线风,共用一条规则而不是各画一份,免得两组
   日后长歪成两种样子。 */
.sidebar-contacts,
.sidebar-rooms {
  flex-shrink: 0;
  padding: 2px 12px 6px 24px;
  display: flex;
  flex-direction: column;
}

.sidebar-rooms-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 4px 2px 0;
}

.sidebar-rooms-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg));
  user-select: none;
}

.sidebar-rooms-add {
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  padding: 2px 6px;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg));
  cursor: pointer;
}

.sidebar-rooms-add:hover {
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg));
}

.sidebar-room-item {
  border: none;
  background: transparent;
  text-align: left;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  padding: 4px 8px 4px 0;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg));
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-room-item:hover,
.sidebar-room-item.is-active {
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg));
}

/* 未读:一枚墨点靠右,行文顺手提到满墨(IM 的老规矩——未读那行更"实")。
   群聊/私下行原本不是 flex(省一层盒子,省略号画在按钮本体上),只有带点的那行
   才切成 flex 并把省略号交给名字 span —— 不改无点行的既有排版。 */
.sidebar-room-item.has-unread {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg));
}

.sidebar-room-item.has-unread .sidebar-room-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 成员头像堆(样板 `.faces`):向左叠压 5px,首枚不压。行本身与未读那条同理 ——
   只有带堆的行才切成 flex,不带的一个字节不动。 */
.sidebar-room-item.has-faces {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sidebar-room-item.has-faces .sidebar-room-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-room-faces {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  margin-left: auto;
}

/* 画线圆章,与联系人行那枚同一句法,尺寸再收一档(16px)。叠压处描一圈底色,
   让相邻两枚之间留出一条呼吸缝 —— 样板用的是 1.5px 的 surface 描边。 */
.sidebar-room-face {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: -5px;
  border: 1px solid color-mix(in srgb, var(--sidebar-row-ink, var(--ui-text-primary-fg)) 26%, transparent);
  border-radius: 50%;
  box-shadow: 0 0 0 1.5px var(--sidebar-bg);
  background: var(--sidebar-bg);
  font-size: 9px;
  line-height: 1;
}

.sidebar-room-face:first-child {
  margin-left: 0;
}

/* 已注销的成员照旧出现在堆里(墓碑口径与房头成员条一致),只是灰一档。 */
.sidebar-room-face.is-retired {
  opacity: 0.45;
}

.sidebar-room-face-more {
  margin-left: 3px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg));
}

/* 未读点在堆之后,靠 margin 归零(堆已经吃掉了 auto)。 */
.sidebar-room-item.has-faces .sidebar-unread-dot {
  margin-left: 0;
}

/* 5px 一点墨,不描边不发光;靠 margin-left:auto 贴住行尾,名字永远先保住。 */
.sidebar-unread-dot {
  flex: 0 0 5px;
  width: 5px;
  height: 5px;
  margin-left: auto;
  border-radius: 50%;
  background: var(--sidebar-row-ink, var(--ui-text-primary-fg));
  opacity: 0.6;
}

/* 「私下」折叠头:比群聊行更轻一档(11px、字距同分区标签),它是分区里的分区。
   一枚发丝 caret + 计数,没有填充也没有边框 —— 画线风里"可折叠"由 caret 说。 */
.sidebar-subgroup {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.5;
  letter-spacing: 0.08em;
  padding: 4px 8px 2px 0;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg));
  cursor: pointer;
}

.sidebar-subgroup:hover {
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg));
}

.sidebar-subgroup-caret {
  display: inline-block;
  font-size: 12px;
  line-height: 1;
  transition: transform var(--duration-fast) var(--ease-default);
}

.sidebar-subgroup-caret.open {
  transform: rotate(90deg);
}

.sidebar-subgroup-count {
  font-size: 10px;
  opacity: 0.7;
}

/* 子项缩进对齐折叠头的文字,而不是 caret —— 缩进是从属关系的唯一标记。 */
.sidebar-subgroup-item {
  padding-left: 17px;
}

/* 联系人行 = 群聊行 + 一枚头像章。行本身沿用 .sidebar-room-item,这里只把
   文字挪开给章让位。(类名保留 agent- 前缀:章 + 名字这套排版本来就是身份行的
   通用形,「Agent 组」退役并不改变它属于谁。) */
.sidebar-agent-item {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1 1 auto;
  min-width: 0;
}

.sidebar-agent-item .sidebar-room-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 0 1 auto;
}

/* 联系人行是竖列里的一行:`.sidebar-agent-item` 的 flex:1 是为行内布局写的,
   在这里会让行去抢竖直方向的空间。 */
.sidebar-contact-item {
  flex: 0 0 auto;
}

/* 联系人行 = Agent 行的排版(头像章 + 名字)再挂一枚职位。职位是补语不是
   标签:淡一档、可被压缩,名字永远先保住。 */
.sidebar-contact-title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg));
  opacity: 0.75;
}

/* ── 「消息」类的行 ────────────────────────────────────────────────────────
   行本体沿用 `.sidebar-room-item` + `.sidebar-agent-item`(章 + 名字那套身份行
   排版),这里只补三样:群的方章、行尾时间、以及空态/尾行两行文字。
   这一区**只在 workbench 下渲染**(`recentVisible`),所以这些规则不必再挂
   `data-shell-mode` 门 —— classic 下模板里根本没有这些类名。 */
.sidebar-recent-item {
  /* `.sidebar-agent-item` 的 flex:1 是给行内排版写的,在竖列里会让行去抢高度。 */
  flex: 0 0 auto;
}

/* 群没有头像,给一枚同尺寸的方章 + 群名首字 —— 三种行的左缘因此永远对齐,
   而"这是群不是人"一眼可辨(圆=人,方=群,画线风里形状就是分类)。 */
.sidebar-recent-room-mark {
  border-radius: 5px;
  font-size: 10px;
  font-weight: 500;
  color: color-mix(in srgb, var(--sidebar-row-ink, var(--ui-text-primary-fg)) 62%, transparent);
}

/* 时间是补语:12px 淡一档,靠在名字之后、未读点之前,永远不参与压缩
   (`flex: 0 0 auto`)—— 名字先被省略号截,时间是最后一个字都不能少的那一栏。 */
.sidebar-recent-time {
  flex: 0 0 auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--sidebar-row-ink, var(--ui-text-primary-fg)) 42%, transparent);
}

/* 未读那一行整体提墨,时间跟着走一档 —— 否则一行里一半实一半虚。 */
.sidebar-room-item.has-unread .sidebar-recent-time {
  color: color-mix(in srgb, var(--sidebar-row-ink, var(--ui-text-primary-fg)) 60%, transparent);
}

.sidebar-recent-empty {
  padding: 14px 14px 10px;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg));
}

/* 面板里的段头(「通讯录」下的同事 / 群聊)。与「进行中」的组头、「私下」的
   折叠头同一句法 —— 面板头只说得出类别名,段与段之间靠这一行分开。 */
.sidebar-pane-group {
  flex-shrink: 0;
  padding: 12px 14px 3px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--ui-sidebar-item-muted-fg, var(--ui-text-muted-fg));
  user-select: none;
}

/* 建房被拒的一行墨(RoomMemberStrip 的 .member-error 同款语气)。 */
.sidebar-contacts-error {
  padding: 2px 8px 2px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--ui-text-muted-fg);
}

/* 画线圆章:一圈发丝线,emoji 即身份 —— 与房间成员章同一句法,尺寸按侧栏
   行高收到 18px。无填充、无阴影。 */
.sidebar-agent-avatar {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--sidebar-row-ink, var(--ui-text-primary-fg)) 30%, transparent);
  border-radius: 50%;
  font-size: 10px;
  line-height: 1;
}

.sidebar.collapsed {
  padding: 0;
  overflow: hidden;
  border: none;
  box-shadow: none;
}

/* 方案二 · 底部悬浮胶囊 dock —— v7 原样：白胶囊、9/15 内边距、裸 16px
   线性图标、图标间距 15、细分隔线、无边框，阴影同设计稿。 */
.sidebar-dock {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  min-width: 0;
  padding: 10px 8px 14px;
}

/* 自然宽 = 图标 6×16 + 分隔线 1 + 内边距 30 + 间距 6×15 = 217px。
   space-between 让间距在足宽时恰为 15px（=设计稿 gap），sidebar 收窄时
   间距均匀压缩、图标不缩，200px 也不溢出。 */
.sidebar-dock-pill {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: min(217px, 100%);
  min-width: 0;
  padding: 9px 15px;
  border-radius: 999px;
  /* 主题色：用主题自己的最亮面（主界面纸色），与 sidebar 同色相、亮一档，
     浮起感靠阴影——与设计稿"纯白对米白"的微差关系一致。
     fx-base-50 是 flexoki 静态阶，色相与自定义主题会打架，不能用。 */
  background: var(--ui-surface-app-bg);
  box-shadow: var(--shadow-md, 0 3px 12px rgba(30, 26, 16, 0.13));
}

/* 暗色（html[data-theme='dark']）：flexoki 色阶翻转后 fx-base-50 变最深，
   胶囊改用主题的浮起面（比 sidebar 底亮一档，与弹层一致）

   ⚠️ 不写 `:global(...)` —— 见文件末尾那段说明:`:global(X) .y` 会被
   `@vue/compiler-sfc` 截断成 `X`,这条从前一直是把整页背景改掉,而不是改胶囊。
   祖先是 `html` 本来就不需要 `:global`:scoped 只给**最后一个**复合选择器
   补 `[data-v-xxx]`,祖先部分照原样输出。 */
html[data-theme='dark'] .sidebar-dock-pill {
  background: var(--ui-surface-floating-bg);
}

.sidebar-dock-divider {
  width: 1px;
  height: 15px;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--sidebar-row-ink, var(--ui-text-primary-fg)) 12%, transparent);
}

/* 裸图标即入口（v7）：无按钮盒、无填充。padding+负 margin 只扩点击热区，
   不改变 16px 的排版占位。 */
.sidebar-dock-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 4px;
  margin: -4px;
  border: none;
  background: transparent;
  color: color-mix(in srgb, var(--sidebar-row-ink, var(--ui-text-primary-fg)) 56%, transparent);
  cursor: pointer;
  transition: color var(--duration-normal) var(--ease-default);
}

.sidebar-dock-icon:hover,
.sidebar-dock-icon:focus-visible,
.sidebar-dock-icon.is-active {
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg));
}

.sidebar-dock-icon:focus-visible {
  outline: none;
  border-radius: 6px;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg) 36%, transparent);
}

/* ── 工作台外壳:方案三 rail + 单类面板(样板 sidebar-4.html 第三格)────────
   四区重排的那五条 `order` 已随「一次只显示一类」一起删除 —— 面板里一次只有
   一区,没有可排的坐次了。整段仍然挂在 `data-shell-mode='workbench'` 门里,
   classic 下一条都不生效(C0 纪律 3)。 */
/* ⚠️⚠️ 本仓库最容易再踩的 CSS 坑:**`:global(X) .y` 会被静默截断成 `X`。**
 *
 * `@vue/compiler-sfc`(3.5.26)的 scoped 插件遇到 `:global()` 时,会把该复合
 * 选择器**之后的所有部分丢掉**。实测:
 *
 *   `:global(html[x]) .a > .b`  →  `html[x]`              ← 后代整段消失
 *   `html[x] .a > .b`           →  `html[x] .a > .b[data-v-xxx]`   ← 正确
 *   `:global(html[x] .a > .b)`  →  `html[x] .a > .b`      ← 正确但完全不作用域
 *
 * 后果不只是"规则失效",而是**声明被扣到 `<html>` 头上**。C1 落地的那五条
 * `:global(html[data-shell-mode='workbench']) .sidebar-content > .xxx { order: N }`
 * 编译出来是 `html[data-shell-mode='workbench'] { order: N }` —— 这才是「order
 * 一直是死规则、真机上联系人仍在群聊之上」的真因(不是"父级不是 flex":
 * `.sidebar-content` 是 `Space` 的根,`.app-space` 本来就 `display:flex` +
 * `.app-space--vertical` 的 column;`Space` 也只在 `spacer`/`fill` 时才包
 * `.app-space__item`,侧栏两者都没有,四区一直是直接子)。
 *
 * 正确写法:祖先是 `html` 时**根本不需要 `:global`** —— scoped 只给最后一个
 * 复合选择器补 `[data-v-xxx]`,祖先部分照原样输出,作用域还在。 */

/* 样板 `.sb3 .split`:头行**下面**才是 rail | 面板 的那一横排。 */
html[data-shell-mode='workbench'] .sidebar-split {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

/* 样板 `.sb3 .pane`:面板吃掉 rail 之外的全部宽度。 */
html[data-shell-mode='workbench'] .sidebar-pane {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

/* 面板是**唯一**的滚动体(样板 `.sb .scroll`)。会话列表同期交出内部滚动
   (规则在 SessionList.vue 自己的形态门里),不出双滚动条。
   classic 下这一层仍是 `display: contents`(见上),四区照旧是 `.sidebar-content`
   的直接布局子 —— 那边一个像素不变。 */
html[data-shell-mode='workbench'] .sidebar-sections {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 8px;
  overscroll-behavior: contain;
}

/* ── 面板里的行(样板 `.sb .r` + `.sb3 .r`)────────────────────────────────
   群聊/联系人两区的**标记一个字节没动**(同一份模板、同一批类名),这里只在
   workbench 门里把它们换成样板的行:30px 行高、6px 圆角、左右 8px 外边距,
   hover 4.5% 填充,当前项 7.5% 且转墨色。classic 那边的画线风行照旧。
   门写成 `html[...] .xxx` 而**不是** `:global(html[...]) .xxx` —— 见上面那段。 */
html[data-shell-mode='workbench'] .sidebar-pane .sidebar-rooms {
  /* 行间 2px 呼吸缝(ui-system.md §1):这一门里的行是满宽圆角底色块,hover 与
     active 紧邻时圆角互相填平会焊成一整条通板。容器本来就是 flex column,缝用
     `gap` 画 —— 它只落在行与行之间,不在首尾各多出一份,外缘几何逐像素不变
     (行上挂 margin 反而要再补一次 padding)。classic 那边行没有填充,门外一个
     字节不动。 */
  gap: 2px;
  padding: 0 0 6px;
}

html[data-shell-mode='workbench'] .sidebar-pane .sidebar-room-item {
  /* 选中底只定义一次,下面加深的那一档贴着它写,免得两处数值各自漂移。 */
  --sidebar-pane-row-active-fill: color-mix(in srgb, var(--sidebar-row-ink, var(--ui-text-primary-fg)) 7.5%, transparent);

  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 30px;
  height: 30px;
  margin: 0 8px;
  padding: 0 8px;
  border-radius: 6px;
  color: var(--sidebar-row-fg, var(--ui-text-primary-fg));
}

html[data-shell-mode='workbench'] .sidebar-pane .sidebar-room-item:hover {
  background: color-mix(in srgb, var(--sidebar-row-ink, var(--ui-text-primary-fg)) 4.5%, transparent);
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg));
}

html[data-shell-mode='workbench'] .sidebar-pane .sidebar-room-item.is-active {
  background: var(--sidebar-pane-row-active-fill);
  color: var(--sidebar-row-ink, var(--ui-text-primary-fg));
  font-weight: 500;
}

/* 手指着一行已经选中的房/同事。两条底色规则原本都是 (0,4,1) 的平局,`.is-active`
   写在后面就赢,选中行成了死区 —— 选中不等于这一行不再响应指针(ui-system.md §1)。
   面 register 只剩"加深一档"这一条通道,掺 `--ui-text-primary-fg`(浅色主题是深的、
   深色主题是浅的)让这一档两边都成立,不写死 alpha/hex。(0,5,1) 直接压过,不留平局。 */
html[data-shell-mode='workbench'] .sidebar-pane .sidebar-room-item.is-active:hover,
html[data-shell-mode='workbench'] .sidebar-pane .sidebar-room-item.is-active:focus-visible {
  background: color-mix(in srgb, var(--sidebar-pane-row-active-fill) 92%, var(--ui-text-primary-fg));
}

/* 样板 `.r .nm`:名字吃掉所有余量,省略号永远画在名字上。 */
html[data-shell-mode='workbench'] .sidebar-pane .sidebar-room-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 职位退成样板的 `.meta`(12px 副文,靠在行尾)。 */
html[data-shell-mode='workbench'] .sidebar-pane .sidebar-contact-title {
  flex: 0 0 auto;
  font-size: 12px;
  opacity: 1;
  color: color-mix(in srgb, var(--sidebar-row-ink, var(--ui-text-primary-fg)) 47%, transparent);
}

/* 「私下」子分组头退成样板的 `.grp`(与「进行中」的组头同一句法)。 */
html[data-shell-mode='workbench'] .sidebar-pane .sidebar-subgroup {
  padding: 12px 14px 3px;
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0;
}

html[data-shell-mode='workbench'] .sidebar-pane .sidebar-subgroup-item {
  padding-left: 22px;
}

/* 会话列表交出它的内部滚动:统一容器里再来一层 `overflow: auto` 就是双滚动条。
   `.session-list-wrapper` 的 `flex: 1` 也得让位 —— 在滚动容器里它该按内容
   撑开,而不是抢走整条竖轴。规则写在 `SessionList.vue` 自己身上(scoped CSS
   够不到子组件内部,而 `.sessions-list` 的 `contain: strict` 必须同时解开)。 */

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    height: 100%;
    z-index: var(--z-sidebar);
  }
}
</style>
