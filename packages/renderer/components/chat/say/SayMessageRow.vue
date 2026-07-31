<template>
  <div
    class="say-row"
    :class="{
      'is-head': head,
      'is-tail': tail,
      'is-self': isUser,
      'is-addressed': addressed,
      'is-highlighted': highlighted,
    }"
    :data-index="index"
    :data-message-id="message.id"
  >
    <!-- 头像列:一段发言只在头一条上有人,后续条留白,正文吊在同一条轴上。 -->
    <div class="say-gutter">
      <button
        v-if="head && canOpenAgentSpace"
        type="button"
        class="say-avatar-btn"
        :aria-label="`${senderName} 的空间`"
        :title="`${senderName} · 打开空间`"
        @click="openAgentSpace"
      >
        <AgentAvatar
          class="say-avatar"
          :avatar="sender?.avatar"
          :avatar-image="sender?.avatarImage"
          :size="AVATAR_SIZE"
        />
      </button>
      <AgentAvatar
        v-else-if="head && sender"
        class="say-avatar"
        :avatar="sender.avatar"
        :avatar-image="sender.avatarImage"
        :size="AVATAR_SIZE"
      />
      <span
        v-else-if="head && isUser"
        class="say-avatar say-avatar--self"
        aria-hidden="true"
      >我</span>
    </div>

    <div class="say-body">
      <!-- 署名行在**正文之上**(方案 A):名字带身份色 + 角色徽标 + 时间。
           不带气泡、不左右横跳 —— 我方与他人同一排版,区别只在署名与底色。 -->
      <div
        v-if="head"
        class="say-sig"
      >
        <button
          v-if="canOpenAgentSpace"
          type="button"
          class="say-sig-name is-contact"
          :style="senderColorStyle"
          :title="`${senderName} · 打开空间`"
          @click="openAgentSpace"
        >
          {{ senderName }}
        </button>
        <span
          v-else
          class="say-sig-name"
          :style="senderColorStyle"
        >{{ senderName }}</span>
        <span
          v-if="sender?.title"
          class="say-sig-role"
        >{{ sender.title }}</span>
        <!-- 墓碑徽标(域模型 M4):这个人退休了,这句话还在。 -->
        <span
          v-if="sender?.isRetired"
          class="say-sig-retired"
        >已注销</span>
        <time
          v-if="clock"
          class="say-sig-time"
        >{{ clock }}</time>
      </div>

      <!-- 引用(§3.5 A):它答的是哪一句。点击走回原文;原文没了就不动
           (快照本身已经带着那句话)。 -->
      <button
        v-if="replyQuote"
        type="button"
        class="say-quote"
        :title="`${replyQuote.authorLabel}: ${replyQuote.excerpt}`"
        @click.stop="emit('jumpToMessage', replyQuote.messageId)"
      >
        <span class="say-quote-author">{{ replyQuote.authorLabel }}</span>
        <span class="say-quote-excerpt">{{ replyQuote.excerpt }}</span>
      </button>

      <!-- 旁观插话(agent-im-dm.md §4.3):双成员 dm 房里用户说的话。 -->
      <span
        v-if="showBystanderTag"
        class="say-bystander"
      >旁观插话</span>

      <!-- 正文:走既有 markdown 渲染链(MessageMarkdown → Streaming/StaticMarkdown
           + markdownRenderCache + deferredMarkdownHydration)。say 里的表格 /
           代码 / 列表因此与别处**逐像素同源**,本组件一个 markdown 规则都不写。 -->
      <div
        v-if="displayContent"
        class="say-text md-code-block-scope md-inline-code-scope"
      >
        <MessageMarkdown
          :content="displayContent"
          :is-user="isUser"
          :live="false"
          :is-streaming="false"
        />
      </div>

      <!-- 附件:图片走既有缩略图组件,其余走既有文件 chip。 -->
      <div
        v-if="message.attachments?.length"
        class="say-attachments"
      >
        <div
          v-if="imageAttachments.length > 0"
          class="say-attachment-images"
          :class="{ grid: imageAttachments.length > 1 }"
        >
          <figure
            v-for="attachment in imageAttachments"
            :key="attachment.id"
            class="say-figure"
          >
            <AttachmentThumb
              size="md"
              clickable
              :src="attachmentImageSrc(attachment)"
              :alt="attachment.fileName"
              @open="openAttachmentImage(attachment)"
            />
            <figcaption class="say-figure-caption">
              {{ attachment.fileName }} · {{ formatFileSize(attachment.size) }}
            </figcaption>
          </figure>
        </div>
        <div
          v-if="fileAttachments.length > 0"
          class="say-attachment-files"
        >
          <FileChip
            v-for="attachment in fileAttachments"
            :key="attachment.id"
            :file-name="attachment.fileName"
            :size-bytes="attachment.size"
            :tooltip-text="attachment.sourceUrl || undefined"
            :badge="attachment.sourceUrl ? 'WEB' : undefined"
          />
        </div>
      </div>

      <!-- 「展开执行 →」:中栏**唯一**的执行入口(W3)。执行细节全在右栏线程,
           这里只派事件。拿不到 workSessionId 的时候这个按钮根本不渲染
           (见 SayChatFlow 的 threadEntry 解析),不派空事件。 -->
      <button
        v-if="threadEntry"
        type="button"
        class="say-thread-entry"
        :title="`${threadEntry.title} · 在右栏线程里看这次执行`"
        @click.stop="openThread"
      >
        <span class="say-thread-entry-label">展开执行</span>
        <span
          class="say-thread-entry-arrow"
          aria-hidden="true"
        >→</span>
      </button>

      <!-- 表情(§3.5 B):房间既有的那份投影(reactions.ts),不另起一套。 -->
      <div
        v-if="reactionChips.length > 0"
        class="say-reactions"
      >
        <button
          v-for="chip in reactionChips"
          :key="chip.emoji"
          type="button"
          class="say-reaction-chip"
          :class="{ mine: chip.mine }"
          :title="chip.reactors.map(reactor => reactor.label).join('、')"
          @click.stop="emit('react', message.id, chip.emoji)"
        >
          <span class="say-reaction-emoji">{{ chip.emoji }}</span>
          <span class="say-reaction-count">{{ chip.count }}</span>
        </button>
      </div>

      <!-- hover 才出现的动作行:聊天面只需要「引用」。 -->
      <div
        v-if="canReply"
        class="say-actions"
      >
        <button
          type="button"
          class="say-action"
          title="引用这条"
          @click.stop="handleReply"
        >
          引用
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 聊天面的一条消息(docs/design/im-workbench-layout.md §3 W2 / §5 C2′)。
 *
 * 形态走方案 A 频道台(`docs/design/im-redesign/a-channels.html`):
 * 30px 头像在左、署名行在上、正文在下、不带气泡也不左右横跳。
 *
 * **这个组件只渲染 say**:工具卡、StepsPanel、diff、思考过程一律不进来 ——
 * 那些是"某个 agent 在后台干活",归右栏线程(W4)。中栏最多留一个
 * 「展开执行 →」入口。
 *
 * 复用清单(本组件**没有**自写实现的东西):
 *  - markdown:`MessageMarkdown`(→ Static/StreamingMarkdown + markdownRenderCache
 *    + deferredMarkdownHydration)
 *  - 附件:`AttachmentThumb` / `FileChip` / `formatFileSize`
 *  - 引用快照:`message.replyTo` + `reply-quote.ts` 的 `buildReplyToSnapshot`
 *  - 表情投影:`message/reactions.ts` 的 `buildReactionChips`
 *  - 署名身份:`agentsStore.displayAgent`(域模型 M4:retired 返回墓碑,永不炸)
 *  - @提及渲染:`renderCollabMentionText`
 */
import { computed } from 'vue'
import type { ChatMessage, MessageAttachment } from '@/types'
import AgentAvatar from '@/components/common/AgentAvatar.vue'
import AttachmentThumb from '@/components/common/AttachmentThumb.vue'
import FileChip from '@/components/common/FileChip.vue'
import MessageMarkdown from '../message/MessageMarkdown.vue'
import { buildReactionChips } from '../message/reactions'
import { REPLY_USER_LABEL, buildReplyToSnapshot } from '../message/reply-quote'
import { SAY_METRICS } from './say-typography'
import { formatFileSize } from '@/utils/format'
import { isActiveAgent } from '@shared/ipc'
import { renderCollabMentionText } from '@onething/runtime/collab'
import { platformApi } from '@/platform'
import { useAgentsStore } from '@/stores/agents'
import { OPEN_MEMBERS_EVENT, type OpenMembersDetail } from '@/components/workbench/room-members'
import type { ChatMessageReplyTo } from '@/types'

const AVATAR_SIZE = SAY_METRICS.avatarSizePx

const props = defineProps<{
  message: ChatMessage
  index: number
  head: boolean
  tail: boolean
  addressed: boolean
  highlighted?: boolean
  /** 单成员 dm 房:一对一无需署名头衔那一套,用户插话也不是"旁观"。 */
  dmMode?: boolean
  /** agent ↔ agent 私聊房:用户在这里是旁观者。 */
  pairDmMode?: boolean
  /** 「展开执行 →」的落点;null 就不画(拿不到 workSessionId 不派空事件)。 */
  threadEntry?: { workSessionId: string; title: string; taskId?: string } | null
  /** 这条消息所在的房 —— 署名头像下钻右栏空间页时的靶子(R2)。 */
  roomSessionId?: string
}>()

const emit = defineEmits<{
  reply: [replyTo: ChatMessageReplyTo]
  react: [messageId: string, emoji: string]
  jumpToMessage: [messageId: string]
}>()

const agentsStore = useAgentsStore()

const isUser = computed(() => props.message.role === 'user')

/**
 * 署名走 `displayAgent`(域模型 M4):在职 → 正常;已退休 → 名字照旧 +
 * 「已注销」徽标;查无此人 → 墓碑。历史署名永远读得出来,渲染永不炸。
 */
const sender = computed(() => {
  if (props.message.role !== 'assistant' || !props.message.agentId) return null
  const identity = agentsStore.displayAgent(props.message.agentId)
  return {
    name: identity.name,
    title: identity.title,
    avatar: identity.avatar,
    avatarImage: identity.avatarImage,
    color: identity.color,
    isRetired: !isActiveAgent(identity),
  }
})

const senderName = computed(() => (isUser.value ? '我' : sender.value?.name || '成员'))

/** 身份色只染名字,正文不带任何底色(方案 A 的注 3)。 */
const senderColorStyle = computed(() =>
  sender.value?.color ? { color: sender.value.color } : undefined)

/**
 * 点头像/名字 = 进 TA 的空间(agent-im-chat-ui.md C3)。
 * 私聊房里不给:一对一房里再放一个「去认识 TA」的入口是原地打转。
 */
const canOpenAgentSpace = computed(() =>
  Boolean(sender.value) && !props.dmMode && Boolean(props.message.agentId))

/**
 * R2:署名头像/名字 → **右栏空间页**(样板「中栏署名头像点击也到这里」)。
 * 下钻不新开 tab —— 事件带 agentId 就是直接落在成员 tab 的下钻层。
 *
 * 拿不到房 id 时退回既有的全屏空间页:宁可换个地方打开,也不吞掉这次点击。
 */
function openAgentSpace(): void {
  if (!canOpenAgentSpace.value) return
  const agentId = props.message.agentId || ''
  if (props.roomSessionId) {
    window.dispatchEvent(new CustomEvent<OpenMembersDetail>(OPEN_MEMBERS_EVENT, {
      detail: { sessionId: props.roomSessionId, agentId },
    }))
    return
  }
  agentsStore.openAgentSpace(agentId)
}

const clock = computed(() => {
  const timestamp = props.message.timestamp
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
})

const displayContent = computed(() =>
  renderCollabMentionText(props.message.content, props.message.mentions, agentsStore.agents))

const replyQuote = computed(() => {
  const replyTo = props.message.replyTo
  if (!replyTo?.excerpt) return null
  return replyTo
})

/** 旁观插话:只有 agent↔agent 房里用户说的话才是"旁观"。 */
const showBystanderTag = computed(() => Boolean(props.pairDmMode) && isUser.value)

const reactionChips = computed(() =>
  buildReactionChips(props.message.reactions, { agents: agentsStore.agents }))

const canReply = computed(() =>
  props.message.role === 'user' || props.message.role === 'assistant')

function handleReply(): void {
  const snapshot = buildReplyToSnapshot({
    messageId: props.message.id,
    authorLabel: isUser.value ? REPLY_USER_LABEL : senderName.value,
    content: props.message.content,
  })
  if (!snapshot) return
  emit('reply', snapshot)
}

/**
 * 已定契约(W4 / C3-B 已在 App.vue 监听):
 * `onething:open-thread`,detail = { workSessionId, title?, taskId? }。
 * `threadEntry` 为 null 时按钮不渲染,所以这里不可能派出空 workSessionId。
 */
function openThread(): void {
  const entry = props.threadEntry
  if (!entry?.workSessionId) return
  window.dispatchEvent(new CustomEvent('onething:open-thread', {
    detail: { workSessionId: entry.workSessionId, title: entry.title, taskId: entry.taskId },
  }))
}

const imageAttachments = computed(() =>
  (props.message.attachments ?? []).filter(
    attachment => attachment.mediaType === 'image' && attachmentImageSrc(attachment),
  ),
)

const fileAttachments = computed(() =>
  (props.message.attachments ?? []).filter(
    attachment => !(attachment.mediaType === 'image' && attachmentImageSrc(attachment)),
  ),
)

function attachmentImageSrc(attachment: MessageAttachment): string {
  if (attachment.base64Data) {
    return `data:${attachment.mimeType};base64,${attachment.base64Data}`
  }
  return attachment.url || ''
}

function openAttachmentImage(attachment: MessageAttachment): void {
  const src = attachmentImageSrc(attachment)
  if (!src) return
  platformApi?.openImagePreview(src, attachment.fileName)
}
</script>

<style scoped>
/* ── 方案 A 频道台的一行(docs/design/im-redesign/a-channels.html)──────────
   数值真源在 say-typography.ts 的 SAY_METRICS,这里只消费它写出来的变量
   (`__tests__/say-typography.test.ts` 用源文本比对钉住两边不漂移)。

   这棵树只在 workbench + 房/私聊下挂载,classic 与直聊根本不渲染它 ——
   所以本文件不需要任何 `:root[data-shell-mode]` 门。 */
.say-row {
  display: flex;
  gap: var(--say-gutter-gap, 11px);
  padding: var(--say-row-padding-block, 5px) var(--say-row-padding-inline, 20px);
  position: relative;
  overflow-anchor: none;
}

/* 提及/回我的那条 = 一条左墨条,不是整行黄底。 */
.say-row.is-addressed {
  box-shadow: inset 2px 0 0 var(--ui-accent-default-bg, var(--accent-main, currentColor));
}

.say-row.is-self {
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 2.5%, transparent);
}

.say-row.is-highlighted {
  background: color-mix(in srgb, var(--ui-accent-default-bg, var(--accent-main)) 12%, transparent);
}

.say-gutter {
  flex-shrink: 0;
  width: var(--say-avatar-size, 30px);
}

.say-avatar-btn {
  position: relative;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  display: block;
}

/* 「可点」提示(agent-space-workbench.md P3):静止态与今天完全一致,hover 才
   长出一圈 3px 外扩细环。三处头像(私聊房头 / 消息署名 / 群头成员堆)同一句法。 */
.say-avatar-btn::after {
  content: '';
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 1px solid transparent;
  transition: border-color 0.12s ease;
}

.say-avatar-btn:hover::after,
.say-avatar-btn:focus-visible::after {
  border-color: var(--ui-accent-primary-fg, var(--accent));
}

.say-avatar--self {
  display: grid;
  place-items: center;
  width: var(--say-avatar-size, 30px);
  height: var(--say-avatar-size, 30px);
  border-radius: 50%;
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
  background: color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 8%, transparent);
  user-select: none;
}

.say-body {
  flex: 1;
  min-width: 0;
}

.say-sig {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 2px;
}

.say-sig-name {
  font-size: var(--say-signature-size, 12.5px);
  font-weight: 600;
  color: var(--ui-text-primary-fg, var(--text));
  padding: 0;
  border: none;
  background: none;
}

.say-sig-name.is-contact {
  cursor: pointer;
}

.say-sig-name.is-contact:hover {
  text-decoration: underline;
}

.say-sig-role,
.say-sig-retired {
  font-size: 10px;
  color: var(--ui-text-muted-fg, var(--muted));
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 3px;
  padding: 0 4px;
}

.say-sig-time {
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  color: var(--ui-text-muted-fg, var(--muted));
}

.say-quote {
  display: flex;
  gap: 6px;
  align-items: baseline;
  max-width: 100%;
  margin: 0 0 3px;
  padding: 0 0 0 8px;
  border: none;
  border-inline-start: 2px solid var(--ui-border-default-border, var(--border));
  background: none;
  cursor: pointer;
  text-align: start;
  font-size: 11px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.say-quote-author {
  flex-shrink: 0;
  font-weight: 600;
}

.say-quote-excerpt {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.say-bystander {
  display: inline-block;
  margin-bottom: 2px;
  font-size: 10px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.say-text {
  min-width: 0;
}

.say-attachments {
  margin-top: 7px;
}

.say-attachment-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.say-figure {
  margin: 0;
}

.say-figure-caption {
  margin-top: 2px;
  font-size: 10px;
  color: var(--ui-text-muted-fg, var(--muted));
}

.say-attachment-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

/* 执行入口:虚线 pill,一行,默认收起 —— 方案 A 的「活动线」形态。 */
.say-thread-entry {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 6px;
  padding: 3px 9px;
  border: 1px dashed var(--ui-border-default-border, var(--border));
  border-radius: 20px;
  background: none;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11.5px;
  cursor: pointer;
}

.say-thread-entry:hover {
  color: var(--ui-text-primary-fg, var(--text));
  border-color: var(--ui-text-muted-fg, var(--muted));
}

.say-reactions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}

.say-reaction-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 10px;
  background: none;
  font-size: 11px;
  line-height: 1.6;
  cursor: pointer;
  color: var(--ui-text-muted-fg, var(--muted));
}

.say-reaction-chip.mine {
  color: var(--ui-text-primary-fg, var(--text));
  border-color: var(--ui-text-muted-fg, var(--muted));
}

/* 动作行只在 hover 时出现,并且画在行自己的留白里 —— 不撑高任何一行。 */
.say-actions {
  position: absolute;
  inset-block-start: 2px;
  inset-inline-end: var(--say-row-padding-inline, 20px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.say-row:hover .say-actions,
.say-row:focus-within .say-actions {
  opacity: 1;
  pointer-events: auto;
}

.say-action {
  padding: 0 6px;
  border: none;
  background: none;
  font-size: 10.5px;
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
}

.say-action:hover {
  color: var(--ui-text-primary-fg, var(--text));
}
</style>
