<template>
  <!-- Special rendering for git-status message -->
  <GitStatusPanel
    v-if="gitStatusData"
    :data="gitStatusData"
    @action="handleGitAction"
    @file-action="handleGitFileAction"
    @refresh="handleGitRefresh"
  />

  <!-- Special rendering for files-changed message -->
  <FilesChangedPanel
    v-else-if="filesChangedData"
    :data="filesChangedData"
  />

  <!-- Default system message rendering -->
  <div v-else class="message system">
    <div class="system-icon">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    </div>
    <div class="system-bubble">
      <div class="system-content" v-html="renderedContent"></div>
      <div class="system-footer">
        <span class="system-time">{{ formattedTime }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/composables/useMarkdownRenderer'
import FilesChangedPanel from './FilesChangedPanel.vue'
import GitStatusPanel from './GitStatusPanel.vue'
import type { FilesChangedMessage } from '@/services/commands/files'
import type { GitStatusData } from '@/services/commands/git'
import { useChatStore } from '@/stores/chat'
import { useSessionsStore } from '@/stores/sessions'
import { executeCommand } from '@/services/commands'

interface Props {
  content: string
  timestamp: number
  sessionId?: string
}

const props = defineProps<Props>()
const chatStore = useChatStore()
const sessionsStore = useSessionsStore()

const formattedTime = computed(() => {
  const date = new Date(props.timestamp)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
})

// Try to parse content as files-changed message
const filesChangedData = computed<FilesChangedMessage | null>(() => {
  try {
    const parsed = JSON.parse(props.content)
    if (parsed && parsed.type === 'files-changed') {
      return parsed as FilesChangedMessage
    }
  } catch {
    // Not JSON, render as markdown
  }
  return null
})

// Try to parse content as git-status message
const gitStatusData = computed<GitStatusData | null>(() => {
  try {
    const parsed = JSON.parse(props.content)
    if (parsed && parsed.type === 'git-status') {
      return parsed as GitStatusData
    }
  } catch {
    // Not JSON
  }
  return null
})

const renderedContent = computed(() => {
  return renderMarkdown(props.content, false)
})

// Get current session ID
function getSessionId(): string | null {
  if (props.sessionId) return props.sessionId
  return sessionsStore.currentSession?.id || null
}

// Handle git panel actions (stage-all, commit, push, pull, etc.)
async function handleGitAction(action: string) {
  const sessionId = getSessionId()
  if (!sessionId) return

  // Map actions to chat messages that will be sent
  const actionMessages: Record<string, string> = {
    'stage-all': 'git add -A',
    'stage-all-changes': 'git add -u',
    'stage-all-untracked': 'git add .',
    'unstage-all': 'git reset HEAD',
    'commit': 'Please help me create a commit with an appropriate message based on the staged changes',
    'push': 'git push',
    'pull': 'git pull',
  }

  const message = actionMessages[action]
  if (message) {
    // Send as user message to trigger AI execution
    await chatStore.sendMessage(sessionId, message)
  }
}

// Handle git file-specific actions (stage, unstage, diff, discard)
async function handleGitFileAction(action: string, filePath: string) {
  const sessionId = getSessionId()
  if (!sessionId) return

  // Map file actions to git commands
  const actionCommands: Record<string, string> = {
    'stage': `git add "${filePath}"`,
    'unstage': `git reset HEAD "${filePath}"`,
    'diff': `git diff "${filePath}"`,
    'diff-staged': `git diff --staged "${filePath}"`,
    'discard': `git checkout -- "${filePath}"`,
  }

  const command = actionCommands[action]
  if (command) {
    await chatStore.sendMessage(sessionId, command)
  }
}

// Handle git refresh
async function handleGitRefresh() {
  const sessionId = getSessionId()
  if (!sessionId) return

  // Re-execute /git command
  await executeCommand('git', { sessionId })
}
</script>

<style scoped>
.message.system {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  width: min(860px, 100%);
  animation: fadeIn 0.18s ease-out;
}

.system-icon {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(59, 130, 246, 0.15);
  color: rgb(59, 130, 246);
  flex-shrink: 0;
}

.system-bubble {
  flex: 1;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(59, 130, 246, 0.25);
  background: rgba(59, 130, 246, 0.08);
}

.system-content {
  font-size: 14px;
  color: var(--text);
  line-height: 1.6;
}

/* Markdown styles */
.system-content :deep(p) {
  margin: 0 0 0.5em 0;
}

.system-content :deep(p:last-child) {
  margin-bottom: 0;
}

.system-content :deep(ul) {
  margin: 0.5em 0;
  padding-left: 1.2em;
}

.system-content :deep(li) {
  margin: 0.25em 0;
}

.system-content :deep(.inline-code) {
  background: rgba(59, 130, 246, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 0.9em;
}

html[data-theme='light'] .system-content :deep(.inline-code) {
  background: rgba(59, 130, 246, 0.1);
}

.system-footer {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}

.system-time {
  font-size: 11px;
  color: var(--muted);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
