<template>
  <div
    ref="chatPanelRef"
    class="chat-panel"
  >
    <MessageList
      ref="messageListRef"
      :messages="panelMessages"
      :is-loading="isLoading"
      :session-id="effectiveSessionId"
      :layout-transitioning="props.layoutTransitioning"
      @set-quoted-text="handleSetQuotedText"
      @set-input-text="handleSetInputText"
      @regenerate="handleRegenerate"
      @edit-and-resend="handleEditAndResend"
      @split-with-branch="(sessionId) => emit('splitWithBranch', sessionId)"
      @open-file="(filePath) => emit('openFile', filePath)"
    />

    <TodoPlanPanel
      v-if="settingsStore.settings.general?.todoPlan?.enabled !== false"
      :session-id="effectiveSessionId"
      :working-directory="currentSession?.workingDirectory || ''"
    />

    <Teleport
      :to="props.footerTarget ?? 'body'"
      :disabled="!props.footerTarget"
    >
      <div
        v-show="props.active"
        ref="composerContainerRef"
        v-memo="[props.active, isGenerating, effectiveSessionId, currentPendingPermission?.toolCall.id, queuedBehindPermission.length, showRejectInstruction]"
        class="composer-container"
      >
        <BackgroundJobsStatusBar />

        <div
          v-if="currentPendingPermission"
          class="session-permission-panel"
        >
          <div class="permission-main">
            <div class="permission-label">
              Permission required
            </div>
            <div class="permission-title">
              {{ permissionTitle(currentPendingPermission.toolCall) }}
            </div>
            <div
              v-if="permissionPreview(currentPendingPermission.toolCall)"
              class="permission-preview"
            >
              {{ permissionPreview(currentPendingPermission.toolCall) }}
            </div>
            <div
              v-if="queuedBehindPermission.length > 0"
              class="permission-queue"
            >
              {{ queuedBehindPermission.length }} queued behind this permission
            </div>
          </div>
          <div class="permission-actions">
            <div class="permission-allow-group">
              <Button
                unstyled
                class="permission-btn allow"
                native-type="button"
                title="Allow once"
                @click="approveCurrentPermission('once')"
              >
                Allow
              </Button>
              <Button
                unstyled
                class="permission-btn allow-scope"
                native-type="button"
                title="Allow for this session"
                @click="approveCurrentPermission('session')"
              >
                Session
              </Button>
              <Button
                v-if="canAllowWorkspace(currentPendingPermission.toolCall)"
                unstyled
                class="permission-btn allow-scope"
                native-type="button"
                title="Allow in this workspace"
                @click="approveCurrentPermission('workdir')"
              >
                Workspace
              </Button>
            </div>
            <Button
              unstyled
              class="permission-btn reject"
              native-type="button"
              @click="rejectCurrentPermission"
            >
              Reject
            </Button>
            <Button
              unstyled
              class="permission-btn instruct"
              native-type="button"
              @click="showRejectInstruction = !showRejectInstruction"
            >
              Reject with instruction
            </Button>
          </div>
          <div
            v-if="showRejectInstruction"
            class="permission-instruction"
          >
            <textarea
              v-model="rejectInstruction"
              class="permission-instruction-input"
              placeholder="Tell the assistant what to do instead..."
              rows="2"
              @keydown.stop
            />
            <Button
              unstyled
              class="permission-btn reject"
              native-type="button"
              @click="rejectCurrentPermissionWithInstruction"
            >
              Send rejection
            </Button>
          </div>
        </div>

        <InputBox
          ref="inputBoxRef"
          :is-loading="isGenerating"
          :session-id="effectiveSessionId"
          @send-message="handleSendMessage"
          @stop-generation="handleStopGeneration"
        />
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import { useChatSession } from '@/composables/useChatSession'
import MessageList from './MessageList.vue'
import InputBox from './InputBox.vue'
import TodoPlanPanel from './TodoPlanPanel.vue'
import BackgroundJobsStatusBar from './BackgroundJobsStatusBar.vue'
import type { MessageAttachment, ToolCall } from '@/types'
import { buildToolPermissionTitle } from '@/stores/helpers/tool-display'

const props = withDefaults(defineProps<{
  sessionId?: string
  active?: boolean
  footerTarget?: HTMLElement | null
  layoutTransitioning?: boolean
}>(), {
  active: true,
  footerTarget: null,
  layoutTransitioning: false,
})

const emit = defineEmits<{
  splitWithBranch: [sessionId: string]
  openFile: [filePath: string]
}>()

const sessionsStore = useSessionsStore()
const chatStore = useChatStore()
const settingsStore = useSettingsStore()

const effectiveSessionId = computed(() => props.sessionId || sessionsStore.currentSessionId)

const {
  messages,
  isLoading,
  isGenerating,
  sendMessage: chatSendMessage,
  steerMessage: chatSteerMessage,
  queueFollowUpMessage: chatQueueFollowUpMessage,
  regenerate: chatRegenerate,
  editAndResend: chatEditAndResend,
  stopGeneration: chatStopGeneration,
} = useChatSession(effectiveSessionId)

const currentSession = computed(() => {
  const sid = effectiveSessionId.value
  if (!sid) return null
  return sessionsStore.getSessionItem(sid) || null
})

const panelMessages = computed(() => messages.value)

const currentPendingPermission = computed<{ toolCall: ToolCall } | null>(() => {
  for (const message of panelMessages.value) {
    const toolCall = message.toolCalls?.find(tc => tc.requiresConfirmation)
    if (toolCall) return { toolCall }
  }
  return null
})

const queuedBehindPermission = computed(() => {
  const pending = currentPendingPermission.value?.toolCall
  if (!pending) return []
  const queued: ToolCall[] = []
  let seenPending = false
  for (const message of panelMessages.value) {
    for (const toolCall of message.toolCalls || []) {
      if (toolCall.id === pending.id) {
        seenPending = true
        continue
      }
      if (seenPending && toolCall.status === 'queued') {
        queued.push(toolCall)
      }
    }
  }
  return queued
})

const showRejectInstruction = ref(false)
const rejectInstruction = ref('')

watch(currentPendingPermission, () => {
  showRejectInstruction.value = false
  rejectInstruction.value = ''
})

const inputBoxRef = ref<InstanceType<typeof InputBox> | null>(null)
const messageListRef = ref<InstanceType<typeof MessageList> | null>(null)
const chatPanelRef = ref<HTMLElement | null>(null)
const composerContainerRef = ref<HTMLElement | null>(null)
const TAIL_SNAPSHOT_DISTANCE_PX = 4
const RESTORE_WAIT_FRAME_LIMIT = 120
let composerResizeObserver: ResizeObserver | null = null
let composerMeasureFrame: number | null = null
let lastMeasuredComposerHeight = -1
let contentColumnResizeObserver: ResizeObserver | null = null
let contentColumnMeasureFrame: number | null = null
let deferredComposerMeasure = false
let deferredContentColumnMeasure = false
let deferredLayoutMeasureTimer: ReturnType<typeof setTimeout> | null = null
let pendingComposerResizeHeight: number | null = null

const CONTENT_COLUMN_VAR_NAMES = [
  '--chat-composer-width',
  '--chat-content-column-left',
  '--chat-content-column-right',
  '--chat-content-column-center',
] as const

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

function getContentColumnElement(): HTMLElement | null {
  return chatPanelRef.value?.querySelector<HTMLElement>('.message-list-content') ?? null
}

function getLayoutVariableTargets(): HTMLElement[] {
  return [composerContainerRef.value].filter((element): element is HTMLElement => Boolean(element))
}

function clearContentColumnVariables() {
  for (const target of getLayoutVariableTargets()) {
    for (const name of CONTENT_COLUMN_VAR_NAMES) {
      target.style.removeProperty(name)
    }
  }
}

function cssPx(value: number): string {
  return `${Math.max(0, value).toFixed(2)}px`
}

function getResizeEntryBlockSize(entry: ResizeObserverEntry): number {
  const borderBox = entry.borderBoxSize
  const firstBorderBox = Array.isArray(borderBox) ? borderBox[0] : borderBox
  return firstBorderBox?.blockSize ?? entry.contentRect.height
}

function deferChatPanelMeasurementDuringTransition(kind: 'composer' | 'content-column'): boolean {
  if (!props.layoutTransitioning) return false
  if (kind === 'composer') {
    deferredComposerMeasure = true
  } else {
    deferredContentColumnMeasure = true
  }
  return true
}

function measureContentColumn() {
  contentColumnMeasureFrame = null
  if (deferChatPanelMeasurementDuringTransition('content-column')) return

  const panel = chatPanelRef.value
  const column = getContentColumnElement()
  if (!panel || !column) {
    clearContentColumnVariables()
    return
  }

  const panelRect = panel.getBoundingClientRect()
  const columnRect = column.getBoundingClientRect()
  const left = columnRect.left - panelRect.left
  const right = panelRect.right - columnRect.right
  const width = columnRect.width
  const center = left + width / 2

  const values = {
    '--chat-composer-width': cssPx(width),
    '--chat-content-column-left': cssPx(left),
    '--chat-content-column-right': cssPx(right),
    '--chat-content-column-center': cssPx(center),
  }

  for (const target of getLayoutVariableTargets()) {
    for (const [name, value] of Object.entries(values)) {
      target.style.setProperty(name, value)
    }
  }
}

function scheduleContentColumnMeasure() {
  if (deferChatPanelMeasurementDuringTransition('content-column')) return
  if (contentColumnMeasureFrame !== null) return
  contentColumnMeasureFrame = requestAnimationFrame(measureContentColumn)
}

function observeContentColumn() {
  contentColumnResizeObserver?.disconnect()
  contentColumnResizeObserver = null
  scheduleContentColumnMeasure()

  const panel = chatPanelRef.value
  if (!panel || typeof ResizeObserver === 'undefined') return

  contentColumnResizeObserver = new ResizeObserver(scheduleContentColumnMeasure)
  contentColumnResizeObserver.observe(panel)

  const column = getContentColumnElement()
  if (column) {
    contentColumnResizeObserver.observe(column)
  }
}

function setComposerHeightVariable(height: number) {
  const measuredHeight = Math.max(0, Math.ceil(height))
  if (measuredHeight === lastMeasuredComposerHeight) return
  lastMeasuredComposerHeight = measuredHeight
  for (const target of getLayoutVariableTargets()) {
    target.style.setProperty('--chat-composer-height', `${measuredHeight}px`)
  }
  messageListRef.value?.notifyLayoutChange?.()
}

function applyPendingComposerResizeHeight(): boolean {
  if (pendingComposerResizeHeight === null) return false
  const height = pendingComposerResizeHeight
  pendingComposerResizeHeight = null
  setComposerHeightVariable(height)
  return true
}

function measureComposerHeight() {
  composerMeasureFrame = null
  if (deferChatPanelMeasurementDuringTransition('composer')) return
  if (applyPendingComposerResizeHeight()) return
  const composer = composerContainerRef.value
  setComposerHeightVariable(composer?.getBoundingClientRect().height ?? 0)
}

function scheduleComposerMeasure() {
  if (deferChatPanelMeasurementDuringTransition('composer')) return
  if (composerMeasureFrame !== null) return
  composerMeasureFrame = requestAnimationFrame(measureComposerHeight)
}

function observeComposerHeight() {
  composerResizeObserver?.disconnect()
  composerResizeObserver = null
  scheduleComposerMeasure()

  const composer = composerContainerRef.value
  if (!composer || typeof ResizeObserver === 'undefined') return

  composerResizeObserver = new ResizeObserver((entries) => {
    const entry = entries.find(item => item.target === composerContainerRef.value) ?? entries[0]
    if (!entry) return
    pendingComposerResizeHeight = getResizeEntryBlockSize(entry)
    if (props.layoutTransitioning) {
      deferredComposerMeasure = true
      return
    }
    applyPendingComposerResizeHeight()
  })
  composerResizeObserver.observe(composer, { box: 'border-box' })
}

function permissionTitle(toolCall: ToolCall): string {
  return buildToolPermissionTitle(toolCall)
}

function permissionPreview(toolCall: ToolCall): string {
  if (toolCall.changes) return `+${toolCall.changes.additions || 0} -${toolCall.changes.deletions || 0}`
  if (toolCall.arguments?.command) return String(toolCall.arguments.command)
  return ''
}

type PermissionResponse = 'once' | 'session' | 'workdir'

function canAllowWorkspace(toolCall: ToolCall): boolean {
  const permissionType = String((toolCall as any).permissionType || toolCall.arguments?.permissionType || '')
  const name = (toolCall.toolName || toolCall.toolId || '').toLowerCase()
  // Sensitive file reads should not be granted workspace-wide in the first scope UX.
  if (permissionType === 'sensitive_file_read') return false
  if (name === 'read' && /\.env|\.pem$|\.key$|\.p12$|\.pfx$/i.test(permissionTitle(toolCall))) return false
  return true
}

function approveCurrentPermission(response: PermissionResponse = 'once') {
  const toolCall = currentPendingPermission.value?.toolCall
  if (!toolCall) return
  messageListRef.value?.confirmTool(toolCall, response)
}

function rejectCurrentPermission() {
  const toolCall = currentPendingPermission.value?.toolCall
  if (!toolCall) return
  messageListRef.value?.rejectTool(toolCall)
}

function rejectCurrentPermissionWithInstruction() {
  const toolCall = currentPendingPermission.value?.toolCall
  if (!toolCall) return
  messageListRef.value?.rejectTool(toolCall, rejectInstruction.value.trim() || undefined)
}

async function waitForRestorePage(sessionId: string, anchorMessageId?: string) {
  for (let frame = 0; frame < RESTORE_WAIT_FRAME_LIMIT; frame += 1) {
    if (effectiveSessionId.value !== sessionId) return false
    const messages = chatStore.sessionMessages.get(sessionId) ?? []
    const hasRestoreMessages = messages.length > 0
    const hasAnchor = !anchorMessageId || messages.some(message => message.id === anchorMessageId)
    if (!isLoading.value && hasRestoreMessages && hasAnchor) {
      await nextTick()
      return true
    }
    await nextFrame()
  }
  return effectiveSessionId.value === sessionId
}

function saveCurrentSnapshot(sessionId: string, prepareForSwitch = false) {
  const distanceToBottom = messageListRef.value?.getDistanceToBottom() ?? 0
  const isAtTail = distanceToBottom <= TAIL_SNAPSHOT_DISTANCE_PX
  const anchorMessageId = messageListRef.value?.getAnchorMessageId() ?? undefined
  const anchorOffset = messageListRef.value?.getAnchorOffset() ?? 0
  const navMessageId = messageListRef.value?.getNavMessageId() ?? undefined
  const hasNavigated = messageListRef.value?.getHasNavigated() ?? false
  const messageInput = inputBoxRef.value?.getMessageInput() ?? ''
  const quotedText = inputBoxRef.value?.getQuotedText() ?? ''
  const attachments = inputBoxRef.value?.getAttachments() ?? []

  if (prepareForSwitch) {
    messageListRef.value?.prepareForSwitch()
  }

  chatStore.saveSnapshot(sessionId, {
    mode: isAtTail || !anchorMessageId ? 'tail' : 'anchor',
    anchorMessageId: isAtTail ? undefined : anchorMessageId,
    offsetWithinMessage: isAtTail ? undefined : anchorOffset,
    navMessageId: isAtTail ? undefined : navMessageId,
    hasNavigated,
    messageInput,
    quotedText,
    attachments,
  })
}

async function restoreCurrentSnapshot(sessionId: string) {
  const snapshot = chatStore.getSnapshot(sessionId)
  if (!snapshot) return false

  if (snapshot.mode === 'anchor') {
    await waitForRestorePage(sessionId, snapshot.anchorMessageId)
  }
  if (effectiveSessionId.value !== sessionId) return false

  if (snapshot.mode === 'anchor') {
    messageListRef.value?.restoreAnchor(snapshot)
  } else {
    messageListRef.value?.restoreTail()
  }

  if (effectiveSessionId.value !== sessionId) return false
  inputBoxRef.value?.restoreSnapshot(snapshot)
  return true
}

onMounted(() => {
  observeComposerHeight()
  observeContentColumn()
  const sessionId = effectiveSessionId.value
  if (sessionId) {
    restoreCurrentSnapshot(sessionId)
  }
})

onBeforeUnmount(() => {
  composerResizeObserver?.disconnect()
  composerResizeObserver = null
  if (composerMeasureFrame !== null) {
    cancelAnimationFrame(composerMeasureFrame)
    composerMeasureFrame = null
  }
  contentColumnResizeObserver?.disconnect()
  contentColumnResizeObserver = null
  if (contentColumnMeasureFrame !== null) {
    cancelAnimationFrame(contentColumnMeasureFrame)
    contentColumnMeasureFrame = null
  }
  if (deferredLayoutMeasureTimer) {
    clearTimeout(deferredLayoutMeasureTimer)
    deferredLayoutMeasureTimer = null
  }

  const sessionId = effectiveSessionId.value
  if (sessionId) {
    saveCurrentSnapshot(sessionId)
  }
})

watch(
  () => [props.footerTarget, props.active] as const,
  () => {
    nextTick(() => {
      observeComposerHeight()
      scheduleContentColumnMeasure()
      messageListRef.value?.notifyLayoutChange?.()
    })
  },
  { flush: 'post' },
)

watch(
  () => props.layoutTransitioning,
  (isTransitioning, wasTransitioning) => {
    if (isTransitioning) {
      if (composerMeasureFrame !== null) {
        cancelAnimationFrame(composerMeasureFrame)
        composerMeasureFrame = null
        deferredComposerMeasure = true
      }
      if (contentColumnMeasureFrame !== null) {
        cancelAnimationFrame(contentColumnMeasureFrame)
        contentColumnMeasureFrame = null
        deferredContentColumnMeasure = true
      }
      if (deferredLayoutMeasureTimer) {
        clearTimeout(deferredLayoutMeasureTimer)
        deferredLayoutMeasureTimer = null
      }
      return
    }

    const shouldMeasureComposer = deferredComposerMeasure
    const shouldMeasureContentColumn = deferredContentColumnMeasure
    if (!wasTransitioning || (!shouldMeasureComposer && !shouldMeasureContentColumn)) return

    deferredComposerMeasure = false
    deferredContentColumnMeasure = false
    if (deferredLayoutMeasureTimer) {
      clearTimeout(deferredLayoutMeasureTimer)
    }
    deferredLayoutMeasureTimer = setTimeout(() => {
      deferredLayoutMeasureTimer = null
      if (shouldMeasureContentColumn) scheduleContentColumnMeasure()
      if (shouldMeasureComposer) applyPendingComposerResizeHeight()
    }, 480)
  },
)

// Session switch: save/restore scroll position and input state
watch(effectiveSessionId, async (newId, oldId) => {
  const start = performance.now()
  const oldMessageCount = oldId ? (chatStore.sessionMessages.get(oldId)?.length ?? 0) : 0
  const newMessageCount = newId ? (chatStore.sessionMessages.get(newId)?.length ?? 0) : 0
  if (oldId && oldId !== newId) {
    saveCurrentSnapshot(oldId, true)
  }

  const beforeTick = performance.now()
  await nextTick()
  const afterTick = performance.now()

  if (newId) {
    const hadSnapshot = !!chatStore.getSnapshot(newId)
    await restoreCurrentSnapshot(newId)
    if (effectiveSessionId.value !== newId) return
    if (!hadSnapshot) {
      inputBoxRef.value?.clearInput()
    }
  }

  requestAnimationFrame(() => {
    console.info('[Perf][SessionRender][ChatPanel]', {
      sessionId: newId,
      oldSessionId: oldId,
      totalToFirstFrameMs: Math.round(performance.now() - start),
      nextTickMs: Math.round(afterTick - beforeTick),
      oldMessageCount,
      newMessageCount,
      restoredSnapshot: !!(newId && chatStore.getSnapshot(newId)),
    })
  })
})

watch(() => panelMessages.value.length, () => {
  nextTick(observeContentColumn)
}, { flush: 'post' })

async function handleSendMessage(
  message: string,
  mode: 'send' | 'steer' | 'followup' = 'send',
  attachments?: MessageAttachment[],
) {
  const session = currentSession.value
  if (!session) return
  // Note: do not scroll here. This runs before the message is in state, so it
  // would smooth-scroll against stale content and then fight MessageList's
  // new-user-message watcher (force-follow + instant setTail), producing a
  // visible "smooth then snap" double scroll. The watcher owns follow-on-send.
  if (mode === 'steer') {
    await chatSteerMessage(message)
  } else if (mode === 'followup') {
    await chatQueueFollowUpMessage(message)
  } else {
    if (sessionsStore.isNewChatDraftId(session.id)) {
      const materialized = await sessionsStore.materializeNewChatDraft(session.id, session.name || 'New Chat')
      if (!materialized) return
      await chatStore.sendMessage(materialized.id, message, attachments)
      return
    }
    await chatSendMessage(message, attachments)
  }
}

async function handleStopGeneration() {
  await chatStopGeneration()
}

function handleSetQuotedText(text: string) {
  inputBoxRef.value?.setQuotedText(text)
}

async function handleRegenerate(messageId: string) {
  if (!currentSession.value) return
  await chatRegenerate(messageId)
}

async function handleEditAndResend(messageId: string, newContent: string) {
  if (!currentSession.value) return
  await chatEditAndResend(messageId, newContent)
}

function handleSetInputText(text: string) {
  inputBoxRef.value?.setMessageInput(text)
}

function focusInput() {
  inputBoxRef.value?.focus()
}

function insertPromptReference(promptId: string) {
  inputBoxRef.value?.insertPromptReference(promptId)
}

function saveSnapshotForCurrentSession() {
  const sessionId = effectiveSessionId.value
  if (!sessionId) return false
  saveCurrentSnapshot(sessionId, false)
  return true
}

async function restoreSnapshotForCurrentSession() {
  const sessionId = effectiveSessionId.value
  if (!sessionId) return false
  return restoreCurrentSnapshot(sessionId)
}

async function scrollToMessage(messageId: string) {
  await nextTick()
  return messageListRef.value?.scrollToMessage?.(messageId) ?? false
}

defineExpose({
  focusInput,
  insertPromptReference,
  saveSnapshotForCurrentSession,
  restoreSnapshotForCurrentSession,
  scrollToMessage,
})
</script>

<style scoped>
.chat-panel {
  --chat-content-width: min(740px, max(58%, calc(100% - 144px)));
  --chat-composer-width: var(--chat-content-width);
  --chat-composer-height: 0px;

  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.composer-container {
  flex-shrink: 0;
  padding: 0 0 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: transparent;
  position: relative;
  z-index: 3;
}

.session-permission-panel {
  --permission-panel-fg: var(--ui-status-warning-fg, var(--text-warning));
  --permission-panel-border: color-mix(in srgb, var(--ui-status-warning-border, var(--border-warning)) 36%, var(--ui-border-default-border, var(--border)));
  --permission-panel-bg: color-mix(in srgb, var(--ui-status-warning-fg, var(--color-warning)) 9%, var(--ui-surface-app-bg, var(--bg)));
  --permission-panel-shadow: var(--shadow-md, 0 8px 24px color-mix(in srgb, var(--ui-text-primary-fg, var(--text)) 10%, transparent));
  --permission-allow-fg: var(--ui-status-success-fg, var(--text-success));
  --permission-allow-border: color-mix(in srgb, var(--ui-status-success-border, var(--border-success)) 36%, var(--ui-border-default-border, var(--border)));
  --permission-allow-bg: color-mix(in srgb, var(--ui-status-success-fg, var(--color-success)) 9%, transparent);
  --permission-reject-fg: var(--ui-status-warning-fg, var(--text-warning));
  --permission-reject-border: color-mix(in srgb, var(--ui-status-warning-border, var(--border-warning)) 42%, var(--ui-border-default-border, var(--border)));
  --permission-reject-bg: color-mix(in srgb, var(--ui-status-warning-fg, var(--color-warning)) 8%, transparent);

  width: var(--chat-composer-width);
  margin: 0 var(--chat-content-column-right, auto) 8px var(--chat-content-column-left, auto);
  padding: 10px 12px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px 12px;
  border: 1px solid var(--permission-panel-border);
  border-radius: 12px;
  background: var(--permission-panel-bg);
  box-shadow: var(--permission-panel-shadow);
}

.permission-main {
  min-width: 0;
  flex: 1;
}

.permission-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--permission-panel-fg);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.permission-title {
  margin-top: 2px;
  font-size: 13px;
  font-weight: 650;
  color: var(--ui-text-primary-fg, var(--text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.permission-preview,
.permission-queue {
  margin-top: 3px;
  font-size: 12px;
  color: var(--ui-text-muted-fg, var(--muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.permission-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.permission-allow-group {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.permission-btn {
  height: 28px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  border: 1px solid var(--ui-border-default-border, var(--border));
  background: var(--ui-surface-panel-bg, var(--panel));
  color: var(--ui-text-primary-fg, var(--text));
}

.permission-btn.allow,
.permission-btn.allow-scope {
  color: var(--permission-allow-fg);
  border-color: var(--permission-allow-border);
  background: var(--permission-allow-bg);
}

.permission-btn.allow-scope {
  font-size: 11px;
  opacity: 0.86;
}

.permission-btn.reject,
.permission-btn.instruct {
  color: var(--permission-reject-fg);
  border-color: var(--permission-reject-border);
  background: var(--permission-reject-bg);
}

.permission-instruction {
  grid-column: 1 / -1;
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.permission-instruction-input {
  flex: 1;
  min-height: 48px;
  resize: vertical;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-panel-bg, var(--panel));
  color: var(--ui-text-primary-fg, var(--text));
  padding: 8px 10px;
  font: inherit;
  font-size: 12px;
}

@media (max-width: 768px) {
  .chat-panel {
    --chat-content-width: calc(100% - 48px);
  }
}

@media (max-width: 480px) {
  .chat-panel {
    --chat-content-width: calc(100% - 24px);
  }
}
</style>
