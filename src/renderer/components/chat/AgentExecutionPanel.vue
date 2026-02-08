<template>
  <div
    class="agent-panel"
    :class="{
      expanded: isExpanded,
      running: isRunning,
      completed: step.status === 'completed',
      failed: step.status === 'failed',
    }"
  >
    <!-- Header -->
    <div
      class="agent-header"
      @click="handleTogglePanel"
    >
      <span class="agent-icon">{{ agentIcon }}</span>
      <span class="agent-name">{{ agentName }}</span>
      <span
        class="agent-status"
        :class="step.status"
      >
        <span
          v-if="isRunning"
          class="status-spinner"
        />
        {{ statusText }}
      </span>
      <span class="progress">{{ completedCount }}/{{ totalCount }}</span>
      <span
        class="expand-icon"
        :class="{ rotated: isExpanded }"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="currentColor"
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            stroke-width="1.5"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
    </div>

    <!-- Task Description -->
    <div
      v-if="task"
      class="agent-task"
    >
      {{ task }}
    </div>

    <!-- Tool Calls List -->
    <Transition name="collapse">
      <div
        v-show="isExpanded"
        class="tool-calls-container"
      >
        <div
          v-for="toolStep in childSteps"
          :key="toolStep.id"
          class="tool-call-item"
          :class="toolStep.status"
        >
          <!-- Tool Call Row -->
          <div
            class="tool-call-row"
            @click="handleToggleToolCall(toolStep)"
          >
            <span class="status-icon">{{ getStatusIcon(toolStep) }}</span>
            <span class="tool-name">{{ getToolDisplayName(toolStep) }}</span>
            <span class="tool-preview">{{ getPreview(toolStep) }}</span>
            <span
              v-if="hasDetail(toolStep)"
              class="detail-toggle"
              :class="{ rotated: isToolExpanded(toolStep) }"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 12 12"
                fill="currentColor"
              >
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  stroke="currentColor"
                  stroke-width="1.5"
                  fill="none"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
          </div>

          <!-- Tool Detail (if expanded) -->
          <Transition name="slide">
            <div
              v-if="isToolExpanded(toolStep) && hasDetail(toolStep)"
              class="tool-detail"
            >
              <pre
                v-if="toolStep.result"
                class="result"
              >{{ formatResult(toolStep.result) }}</pre>
              <pre
                v-if="toolStep.error"
                class="error"
              >{{ toolStep.error }}</pre>
            </div>
          </Transition>

          <!-- Permission Buttons -->
          <div
            v-if="toolStep.status === 'awaiting-confirmation'"
            class="confirm-buttons"
            @click.stop
          >
            <AllowSplitButton @confirm="(response) => handleConfirm(toolStep, response)" />
            <button
              class="btn-reject"
              title="Reject (D/Esc)"
              @click.stop="handleReject(toolStep)"
            >
              Reject
            </button>
          </div>
        </div>

        <!-- Empty state -->
        <div
          v-if="childSteps.length === 0"
          class="empty-state"
        >
          <span v-if="isRunning">Waiting for tool calls...</span>
          <span v-else>No tool calls</span>
        </div>
      </div>
    </Transition>

    <!-- Agent Output Section (only when completed/failed) -->
    <div
      v-if="agentOutput"
      class="agent-output-section"
    >
      <div
        class="output-header"
        @click="toggleOutput"
      >
        <span class="output-label">📤 Output to LLM</span>
        <span
          class="expand-icon"
          :class="{ rotated: isOutputExpanded }"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="currentColor"
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              stroke-width="1.5"
              fill="none"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
      </div>
      <!-- Wrapper for animation, separate from scroll container -->
      <div
        v-show="isOutputExpanded"
        class="output-wrapper"
      >
        <div
          class="agent-output-markdown"
          v-html="renderedOutput"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import { renderMarkdown } from '@/composables/useMarkdownRenderer'
import type { Step, ToolCall } from '@/types'
import AllowSplitButton from '../common/AllowSplitButton.vue'

interface Props {
  step: Step
  childSteps: Step[]
  sessionId: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'confirm', step: Step, type: 'once' | 'session' | 'workspace' | 'always'): void
  (e: 'reject', step: Step): void
}>()

const chatStore = useChatStore()

// Computed properties

const isExpanded = computed(() => chatStore.isAgentPanelExpanded(props.step.id))

const isRunning = computed(() => props.step.status === 'running')

const agentIcon = computed(() => {
  // Use default robot emoji for agents
  return '🤖'
})

const agentName = computed(() => {
  // Extract agent name from step title (format: "Running agent-name" or "agent-name: Status")
  if (props.step.title) {
    // Match "Running agent-name"
    const runningMatch = props.step.title.match(/Running\s+(.+)/)
    if (runningMatch) return runningMatch[1]

    // Match "agent-name: Status" (result format)
    const resultMatch = props.step.title.match(/^([^:]+):/)
    if (resultMatch) return resultMatch[1]

    return props.step.title
  }

  // Fallback: try to get from toolCall arguments
  const args = props.step.toolCall?.arguments as any
  if (args?.agent) return args.agent

  return 'Custom Agent'
})

const task = computed(() => {
  // Extract task from tool call arguments
  const args = props.step.toolCall?.arguments as any
  return args?.task || ''
})

const statusText = computed(() => {
  switch (props.step.status) {
    case 'running': return 'Running'
    case 'completed': return 'Completed'
    case 'failed': return 'Failed'
    case 'awaiting-confirmation': return 'Awaiting'
    case 'cancelled': return 'Cancelled'
    default: return 'Pending'
  }
})

const completedCount = computed(() => {
  return props.childSteps.filter(s => s.status === 'completed' || s.status === 'failed').length
})

const totalCount = computed(() => props.childSteps.length)

// Agent output (what gets returned to the main LLM)
// Extract just the 'output' field from the result, not the full JSON
const agentOutput = computed(() => {
  if (props.step.status !== 'completed' && props.step.status !== 'failed') {
    return null
  }

  const result = props.step.result
  if (!result) return null

  // Try to parse as JSON and extract 'output' field
  try {
    const parsed = JSON.parse(result)
    if (parsed.output) {
      return parsed.output
    }
    // Fallback: if no output field, return the whole thing
    return result
  } catch {
    // Not JSON, return as-is
    return result
  }
})

// Rendered markdown output for better readability
const renderedOutput = computed(() => {
  if (!agentOutput.value) return ''
  return renderMarkdown(agentOutput.value, false)
})

// Output section expand state (collapsed by default)
const isOutputExpanded = computed(() =>
  chatStore.isToolCallExpanded(`${props.step.id}-output`)
)

function toggleOutput() {
  chatStore.toggleToolCall(`${props.step.id}-output`)
}

// Methods

function handleTogglePanel() {
  chatStore.toggleAgentPanel(props.step.id)
}

function handleToggleToolCall(toolStep: Step) {
  const id = toolStep.toolCallId || toolStep.id
  chatStore.toggleToolCall(id)
}

function isToolExpanded(toolStep: Step): boolean {
  const id = toolStep.toolCallId || toolStep.id
  return chatStore.isToolCallExpanded(id)
}

function getStatusIcon(toolStep: Step): string {
  switch (toolStep.status) {
    case 'pending': return '○'
    case 'running': return '●'
    case 'completed': return '✓'
    case 'failed': return '✗'
    case 'awaiting-confirmation': return '⚠'
    case 'cancelled': return '⊘'
    default: return '○'
  }
}

function getToolDisplayName(toolStep: Step): string {
  return toolStep.toolCall?.toolName || toolStep.title || 'tool'
}

function getPreview(toolStep: Step): string {
  // Generate a preview based on tool type and arguments
  const args = toolStep.toolCall?.arguments as any
  if (!args) return toolStep.title || ''

  const toolName = toolStep.toolCall?.toolName
  switch (toolName) {
    case 'glob':
      return args.pattern || ''
    case 'grep':
      return args.pattern || ''
    case 'read':
      return shortenPath(args.file_path || args.path || '')
    case 'write':
    case 'edit':
      return shortenPath(args.file_path || args.path || '')
    case 'bash':
      const cmd = String(args.command || '').substring(0, 40)
      return cmd + (cmd.length >= 40 ? '...' : '')
    default:
      return toolStep.title || ''
  }
}

function shortenPath(path: string): string {
  if (!path) return ''
  const parts = path.split('/')
  if (parts.length <= 3) return path
  return '.../' + parts.slice(-2).join('/')
}

function hasDetail(toolStep: Step): boolean {
  return !!(toolStep.result || toolStep.error)
}

function formatResult(result: string): string {
  if (!result) return ''
  // Truncate very long results
  const maxLength = 500
  if (result.length > maxLength) {
    return result.substring(0, maxLength) + '\n... (truncated)'
  }
  return result
}

function handleConfirm(toolStep: Step, type: 'once' | 'session' | 'workspace') {
  emit('confirm', toolStep, type)
}

function handleReject(toolStep: Step) {
  emit('reject', toolStep)
}

// Auto-expand panel when it starts running
watch(() => props.step.status, (newStatus, oldStatus) => {
  if (newStatus === 'running' && oldStatus !== 'running') {
    chatStore.setAgentPanelExpanded(props.step.id, true)
  }
})

// Auto-expand on mount if running
onMounted(() => {
  if (props.step.status === 'running') {
    chatStore.setAgentPanelExpanded(props.step.id, true)
  }
})
</script>

<style scoped>
.agent-panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-secondary);
  margin: 8px 0;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.agent-panel.running {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-transparent);
}

.agent-panel.completed {
  border-color: var(--success);
}

.agent-panel.failed {
  border-color: var(--error);
}

/* Header */
.agent-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
  background: var(--bg-tertiary);
  border-bottom: 1px solid transparent;
  transition: background 0.15s ease;
}

.agent-panel.expanded .agent-header {
  border-bottom-color: var(--border);
}

.agent-header:hover {
  background: var(--bg-hover);
}

.agent-icon {
  font-size: 16px;
  line-height: 1;
}

.agent-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
  flex: 1;
}

.agent-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.agent-status.running {
  background: var(--accent-transparent);
  color: var(--accent);
}

.agent-status.completed {
  background: var(--success-transparent);
  color: var(--success);
}

.agent-status.failed {
  background: var(--error-transparent);
  color: var(--error);
}

.agent-status.awaiting-confirmation {
  background: var(--warning-transparent);
  color: var(--warning);
}

.agent-status.cancelled,
.agent-status.pending {
  background: var(--text-muted-transparent);
  color: var(--text-muted);
}

.status-spinner {
  width: 10px;
  height: 10px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.progress {
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.expand-icon {
  color: var(--text-muted);
  transition: transform 0.2s ease;
  display: flex;
  align-items: center;
}

.expand-icon.rotated {
  transform: rotate(180deg);
}

/* Task */
.agent-task {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  line-height: 1.4;
}

/* Tool Calls Container */
.tool-calls-container {
  max-height: 300px;
  overflow-y: auto;
  padding: 4px 0;
}

/* Custom scrollbar */
.tool-calls-container::-webkit-scrollbar {
  width: 6px;
}

.tool-calls-container::-webkit-scrollbar-track {
  background: transparent;
}

.tool-calls-container::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.tool-calls-container::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

/* Tool Call Item */
.tool-call-item {
  padding: 0 8px;
}

.tool-call-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.tool-call-row:hover {
  background: var(--bg-hover);
}

.status-icon {
  font-size: 12px;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}

.tool-call-item.pending .status-icon { color: var(--text-muted); }
.tool-call-item.running .status-icon { color: var(--accent); animation: pulse 1s ease-in-out infinite; }
.tool-call-item.completed .status-icon { color: var(--success); }
.tool-call-item.failed .status-icon { color: var(--error); }
.tool-call-item.awaiting-confirmation .status-icon { color: var(--warning); }
.tool-call-item.cancelled .status-icon { color: var(--text-muted); }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.tool-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  flex-shrink: 0;
}

.tool-preview {
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.detail-toggle {
  color: var(--text-muted);
  transition: transform 0.2s ease;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.detail-toggle.rotated {
  transform: rotate(180deg);
}

/* Tool Detail */
.tool-detail {
  margin: 4px 8px 8px 32px;
  padding: 8px;
  background: var(--bg-primary);
  border-radius: 6px;
  border: 1px solid var(--border);
  overflow: hidden;
}

.tool-detail pre {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 150px;
  overflow-y: auto;
}

.tool-detail pre.result {
  color: var(--text-secondary);
}

.tool-detail pre.error {
  color: var(--error);
}

/* Permission Buttons */
.confirm-buttons {
  display: flex;
  gap: 6px;
  margin: 8px 8px 8px 32px;
  align-items: center;
}

.btn-reject {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--error);
  transition: all 0.15s ease;
  background: transparent;
  color: var(--error);
}

.btn-reject:hover {
  background: var(--error);
  color: white;
}

/* Empty State */
.empty-state {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}

/* Transitions */
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  max-height: 0;
  opacity: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  max-height: 300px;
  opacity: 1;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.15s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.slide-enter-to,
.slide-leave-from {
  max-height: 800px;
  opacity: 1;
}

/* Agent Output Section */
.agent-output-section {
  border-top: 1px solid var(--border);
  max-height: 550px; /* Limit output section height */
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.agent-output-section .output-header {
  flex-shrink: 0;
}

.agent-output-section .output-wrapper {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.output-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  background: var(--bg-tertiary);
  transition: background 0.15s ease;
}

.output-header:hover {
  background: var(--bg-hover);
}

.output-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.output-wrapper {
  background: var(--bg-primary);
}

/* All markdown styles moved to unscoped block below */
</style>

<!-- Unscoped global styles for v-html markdown content -->
<style>
/* Agent output markdown container */
.agent-output-markdown {
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.6;
  max-height: 200px;
  overflow-y: auto;
}

.agent-output-markdown::-webkit-scrollbar {
  width: 6px;
}

.agent-output-markdown::-webkit-scrollbar-track {
  background: transparent;
}

.agent-output-markdown::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

/* Basic markdown elements */
.agent-output-markdown p {
  margin: 8px 0;
  line-height: 1.6;
}

.agent-output-markdown > *:last-child {
  margin-bottom: 0;
}

.agent-output-markdown h2 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: var(--text-primary);
}

.agent-output-markdown h3 {
  font-size: 13px;
  font-weight: 600;
  margin: 16px 0 8px 0;
  color: var(--accent);
}

.agent-output-markdown ul,
.agent-output-markdown ol {
  margin: 8px 0;
  padding-left: 20px;
}

.agent-output-markdown li {
  margin: 4px 0;
  line-height: 1.5;
}

.agent-output-markdown table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 12px;
}

.agent-output-markdown th,
.agent-output-markdown td {
  padding: 8px 10px;
  text-align: left;
  border: 1px solid var(--border);
}

.agent-output-markdown th {
  background: var(--bg-tertiary);
  font-weight: 600;
}

.agent-output-markdown hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 16px 0;
}

.agent-output-markdown strong {
  font-weight: 600;
  color: var(--text-primary);
}

.agent-output-markdown a {
  color: var(--accent);
  text-decoration: none;
}

.agent-output-markdown a:hover {
  text-decoration: underline;
}

/* Code blocks - with height limit */
.agent-output-markdown .code-block-container {
  margin: 12px 0;
  border-radius: 8px;
  border: 1px solid var(--border-code, var(--border));
  background: var(--bg-code-block, rgba(0, 0, 0, 0.3));
  max-height: 350px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.agent-output-markdown .code-block-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: var(--bg-code-header, rgba(255, 255, 255, 0.05));
  border-bottom: 1px solid var(--border-code, var(--border));
}

.agent-output-markdown .code-block-lang {
  font-size: 11px;
  color: var(--muted);
  text-transform: lowercase;
}

.agent-output-markdown .code-block-copy {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s ease;
}

.agent-output-markdown .code-block-copy:hover {
  background: rgba(255, 255, 255, 0.15);
}

.agent-output-markdown .code-block-container pre {
  flex: 1;
  min-height: 0;
  margin: 0;
  overflow: auto;
}

.agent-output-markdown pre {
  margin: 10px 0;
  padding: 12px;
  background: var(--bg-code-block);
  border-radius: 6px;
  overflow-x: auto;
}

.agent-output-markdown code {
  font-family: var(--font-mono);
  font-size: 12px;
}

.agent-output-markdown pre code {
  display: block;
  padding: 10px 12px;
  color: var(--text-code-block, #e6e6e6);
}

.agent-output-markdown .hljs {
  background: transparent;
  color: var(--text-code-block, #e6e6e6);
}

.agent-output-markdown .inline-code {
  background: var(--bg-code-inline);
  padding: 2px 6px;
  border-radius: 4px;
}
</style>
