<template>
  <!-- Backdrop click closes; ESC handled by a window listener (a div
       keydown handler never fires without focus). -->
  <div
    class="evals-workbench-overlay"
    @click.self="store.close()"
  >
    <div class="evals-workbench">
      <!-- Header -->
      <header class="wb-header">
        <div class="wb-title">
          <span class="wb-title-icon">🔎</span>
          事故工作台
          <span class="wb-count">{{ store.incidents.length }} 个事故</span>
        </div>
        <Tooltip
          text="关闭 (Esc)"
          position="bottom"
        >
          <button
            class="wb-close"
            aria-label="关闭"
            @click.stop="store.close()"
          >
            ✕
          </button>
        </Tooltip>
      </header>

      <div class="wb-body">
        <!-- Incident list -->
        <aside class="wb-list">
          <ErrorNote
            v-if="store.error"
            class="wb-error"
            size="sm"
            :message="store.error"
          />
          <div
            v-if="store.loading"
            class="wb-hint"
          >
            加载中…
          </div>
          <div
            v-else-if="store.incidents.length === 0"
            class="wb-hint"
          >
            还没有事故记录。<br>对翻车的回复点 👎 即可创建。
          </div>
          <button
            v-for="incident in store.incidents"
            :key="incident.id"
            class="wb-list-item"
            :class="{ active: incident.id === store.selectedId }"
            @click="store.select(incident.id)"
          >
            <div class="wb-item-title">
              {{ incident.title }}
            </div>
            <div class="wb-item-meta">
              <span
                class="wb-badge"
                :class="incident.origin"
              >{{ incident.origin === 'downvote' ? '👎' : '自动' }}</span>
              <span
                class="wb-badge status"
                :class="incident.status"
              >{{ statusLabel(incident.status) }}</span>
              <span class="wb-item-date">{{ incident.createdAt.slice(5, 16).replace('T', ' ') }}</span>
            </div>
            <div class="wb-item-preview">
              {{ incident.userMessage.slice(0, 60) }}
            </div>
          </button>
        </aside>

        <!-- Detail -->
        <main
          v-if="store.detail"
          class="wb-detail"
        >
          <!-- Actions -->
          <div class="wb-actions">
            <Tooltip text="AI 生成标题/摘要/判定 rubric">
              <button
                class="wb-btn"
                :disabled="store.analyzing"
                @click="store.analyze()"
              >
                {{ store.analyzing ? '分析中…' : 'AI 分析' }}
              </button>
            </Tooltip>
            <Tooltip text="复现 + 消融矩阵 + 归因报告(快速模式)">
              <button
                class="wb-btn"
                :disabled="store.diagnoseRunning"
                @click="store.startDiagnose(true)"
              >
                {{ store.diagnoseRunning ? '诊断中…' : '快速诊断' }}
              </button>
            </Tooltip>
            <button
              class="wb-btn"
              :disabled="store.diagnoseRunning"
              @click="store.startDiagnose(false)"
            >
              完整诊断
            </button>
            <button
              class="wb-btn"
              :disabled="!!store.detail.incident.caseId"
              @click="handlePromote"
            >
              {{ store.detail.incident.caseId ? `已转用例 ${store.detail.incident.caseId}` : '转回归用例' }}
            </button>
            <ErrorNote
              v-if="store.error"
              class="wb-error-inline"
              size="sm"
              :message="store.error"
            />
          </div>

          <!-- Tabs -->
          <div class="wb-tabs">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              class="wb-tab"
              :class="{ active: activeTab === tab.id }"
              @click="activeTab = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>

          <!-- 现场 -->
          <section
            v-if="activeTab === 'scene'"
            class="wb-pane"
          >
            <div class="wb-cover">
              <StaticMarkdown :content="store.detail.markdown" />
            </div>

            <h4 class="wb-section-title">
              原始对话(工具结果为真实执行)
              <Tooltip
                v-if="contextFidelity"
                :text="contextFidelity.title"
              >
                <span
                  class="wb-badge"
                  :class="`fidelity-${store.detail.incident.contextOrigin || 'none'}`"
                >{{ contextFidelity.label }}</span>
              </Tooltip>
            </h4>
            <IncidentTranscript :items="sceneItems" />

            <h4 class="wb-section-title">
              逐轮请求(L1 追踪,发给模型的原始请求)
            </h4>
            <RoundTimeline :key="store.selectedId ?? ''" />

            <h4 class="wb-section-title">
              当时的系统提示词
              <button
                class="wb-btn small"
                @click="togglePrompt"
              >
                {{ promptSections ? '收起' : '展开' }}
              </button>
            </h4>
            <div
              v-if="promptError"
              class="wb-hint"
            >
              {{ promptError }}
            </div>
            <div
              v-else-if="promptSections"
              class="wb-prompt-sections"
            >
              <details
                v-for="section in promptSections"
                :key="section.name"
                class="wb-prompt-section"
              >
                <summary>
                  <code>{{ section.name }}</code>
                  <span class="wb-hash">{{ section.hash }}</span>
                </summary>
                <pre>{{ section.content }}</pre>
              </details>
            </div>
          </section>

          <!-- 重放 -->
          <section
            v-else-if="activeTab === 'replay'"
            class="wb-pane"
          >
            <div class="wb-replay-controls">
              <span class="wb-field">次数
                <Select
                  v-bind="PANEL_SELECT"
                  :model-value="replayRuns"
                  :options="RUN_COUNT_OPTIONS"
                  aria-label="重放次数"
                  @update:model-value="replayRuns = Number($event)"
                />
              </span>
              <Checkbox
                v-model="replayJudge"
                class="wb-check"
                size="small"
                aria-label="judge 判定"
              >
                judge 判定{{ rubricHint }}
              </Checkbox>
              <Tooltip
                :text="store.detail.incident.scene?.prompt
                  ? '用失败时刻捕获的原始提示词逐字重放;默认用当前 builder 重建(检验今天的提示词能否救回)'
                  : '该事故未捕获到提示词快照(超出捕获窗口)'"
              >
                <Checkbox
                  v-model="replayCapturedPrompt"
                  class="wb-check"
                  size="small"
                  aria-label="用当时的提示词"
                  :disabled="!store.detail.incident.scene?.prompt || !!replayAblate"
                >
                  用当时的提示词
                </Checkbox>
              </Tooltip>
              <span class="wb-field">消融
                <Select
                  v-bind="PANEL_SELECT"
                  :model-value="replayAblate"
                  :options="ablateOptions"
                  aria-label="消融禁用的提示词段"
                  @update:model-value="replayAblate = String($event ?? '')"
                />
              </span>
              <button
                class="wb-btn primary"
                :disabled="store.replayRunning"
                @click="handleReplay"
              >
                {{ store.replayRunning ? `重放中(第 ${store.replayAttempt} 次)…` : '开始重放' }}
              </button>
              <button
                v-if="store.replayRunning"
                class="wb-btn"
                @click="store.cancelReplay()"
              >
                取消
              </button>
            </div>

            <div
              v-if="store.replayVerdicts.length"
              class="wb-verdicts"
            >
              <Tooltip
                v-for="(v, i) in store.replayVerdicts"
                :key="i"
                :text="v.reason"
              >
                <span
                  class="wb-verdict"
                  :class="v.pass === true ? 'pass' : v.pass === false ? 'fail' : 'na'"
                >{{ v.pass === true ? '✓' : v.pass === false ? '✗' : '—' }}</span>
              </Tooltip>
            </div>

            <!-- Live transcript -->
            <template v-if="store.replayEvents.length">
              <h4 class="wb-section-title">
                本次重放(工具结果为 mock)
              </h4>
              <IncidentTranscript :items="liveReplayItems" />
            </template>

            <!-- Run history -->
            <h4 class="wb-section-title">
              历史运行
            </h4>
            <div
              v-if="!store.detail.runs.length"
              class="wb-hint"
            >
              还没有重放记录
            </div>
            <div
              v-for="run in store.detail.runs"
              :key="run.runId"
              class="wb-run-row"
            >
              <div
                class="wb-run-head"
                @click="toggleRun(run)"
              >
                <span class="wb-badge">{{ run.kind === 'diagnosis' ? '诊断' : '重放' }}</span>
                <code>{{ run.runId }}</code>
                <span>{{ run.passes }}/{{ run.attempts }} 通过</span>
                <span
                  v-if="run.disabledSections?.length"
                  class="wb-badge"
                >禁用 {{ run.disabledSections.join(',') }}</span>
              </div>
              <div
                v-if="expandedRun === run.runId"
                class="wb-run-attempts"
              >
                <button
                  v-for="file in run.attemptFiles"
                  :key="file"
                  class="wb-btn small"
                  :class="{ primary: viewedAttempt === `${run.runId}/${file}` }"
                  @click="viewAttempt(run.runId, file)"
                >
                  {{ file.replace('.jsonl', '') }}
                </button>
                <IncidentTranscript
                  v-if="viewedAttempt?.startsWith(run.runId) && attemptItems.length"
                  :items="attemptItems"
                />
              </div>
            </div>
          </section>

          <!-- 诊断 -->
          <section
            v-else-if="activeTab === 'diagnose'"
            class="wb-pane"
          >
            <div
              v-if="store.diagnoseSteps.length"
              class="wb-diag-steps"
            >
              <div
                v-for="(step, i) in store.diagnoseSteps"
                :key="i"
                class="wb-diag-step"
              >
                {{ step }}
              </div>
            </div>
            <div
              v-if="store.diagnoseRunning"
              class="wb-hint"
            >
              诊断运行中(mock 工具,无真实执行)…
            </div>
            <div
              v-if="diagnosisMarkdown"
              class="wb-cover"
            >
              <StaticMarkdown :content="diagnosisMarkdown" />
            </div>
            <div
              v-else-if="!store.diagnoseRunning && !store.diagnoseSteps.length"
              class="wb-hint"
            >
              点上方"快速诊断"或"完整诊断":自动复现 → 上下文检查 → 逐段消融 → 归因结论。
            </div>
          </section>
        </main>

        <main
          v-else
          class="wb-detail"
        >
          <div class="wb-hint">
            左侧选择一个事故
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useToast } from '@/composables/useToast'
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import Checkbox from '@/components/common/Checkbox.vue'
import ErrorNote from '@/components/common/ErrorNote.vue'
import Select from '@/components/common/Select.vue'
import Tooltip from '@/components/common/Tooltip.vue'
import type { SelectOptionLike } from '@/components/common/select'
import StaticMarkdown from '@/components/chat/message/StaticMarkdown.vue'
import IncidentTranscript, { type TranscriptItem } from './IncidentTranscript.vue'
import RoundTimeline from './RoundTimeline.vue'
import { useEvalsWorkbenchStore } from '@/stores/evalsWorkbench'

const store = useEvalsWorkbenchStore()
const toast = useToast()

const tabs = [
  { id: 'scene', label: '现场' },
  { id: 'replay', label: '重放' },
  { id: 'diagnose', label: '诊断' },
] as const
const activeTab = ref<'scene' | 'replay' | 'diagnose'>('scene')

const replayRuns = ref(1)
const replayJudge = ref(true)
const replayAblate = ref('')
const replayCapturedPrompt = ref(false)

/**
 * One spelling of "a dropdown inside the workbench".
 *
 * `z-layer="modal"` is load-bearing: the overlay sits at `--z-modal + 10`
 * (see `.evals-workbench-overlay` below), so a panel left on the default
 * dropdown stop (100 + 20) would open *behind* the sheet it belongs to.
 * `modal + 20` = 620 clears it. `teleported` keeps the panel out of the
 * scrolling pane.
 */
const PANEL_SELECT = {
  size: 'small',
  teleported: true,
  zLayer: 'modal',
} as const

const RUN_COUNT_OPTIONS: SelectOptionLike[] = [
  { value: 1, label: '1' },
  { value: 3, label: '3' },
  { value: 5, label: '5' },
]

// Global ESC-to-close while the overlay is mounted
function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') store.close()
}
onMounted(() => window.addEventListener('keydown', handleGlobalKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleGlobalKeydown))

const rubricHint = computed(() => {
  const rubric = store.detail?.incident.rubric || store.detail?.incident.note
  return rubric ? '' : '(缺 rubric,先跑 AI 分析)'
})

const sectionNames = computed(() =>
  Object.keys(store.detail?.incident.sectionHashes ?? {}).filter(n => n !== 'system'),
)

const ablateOptions = computed<SelectOptionLike[]>(() => [
  { value: '', label: '(不禁用)' },
  ...sectionNames.value.map(name => ({ value: name, label: `禁用 ${name}` })),
])

/** Context fidelity badge: does the replay history match the moment exactly? */
const contextFidelity = computed(() => {
  const incident = store.detail?.incident
  if (!incident?.scene?.context) {
    return { label: '无上下文', title: '该事故未能保存历史消息,重放只有系统提示词+当轮消息' }
  }
  switch (incident.contextOrigin) {
    case 'live':
      return { label: '逐字一致', title: '历史消息 = 当时实际发给模型的请求消息,字节级一致' }
    case 'rebuilt':
      return { label: '管线重建', title: '从会话持久层经生产变换管线重建的发送视图 — 会话未被编辑且 compaction 状态未变时与当时一致' }
    case 'synthesized':
      return { label: '近似合成', title: '存储视图的手工近似,与当时发送的内容可能有差异(compaction/脱水未应用)' }
    default:
      // 旧事故(字段未记录):有 live capture 的六件套齐全,按逐字一致对待
      return incident.scene?.prompt
        ? { label: '逐字一致', title: '历史消息 = 当时实际发给模型的请求消息(旧版事故,按捕获来源推断)' }
        : { label: '未知', title: '旧版事故,未记录上下文来源' }
  }
})

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    'new': '新',
    'analyzed': '已分析',
    'reproduced': '已复现',
    'not-reproducible': '不可复现',
    'diagnosed': '已诊断',
    'case-created': '已转用例',
    'fixed': '已修复',
  }
  return map[status] ?? status
}

// ── 现场:turn-trace → transcript items ────────────────
const traceItems = ref<TranscriptItem[]>([])

// ── 现场:提示词分段(声明在 immediate watch 之前,避免 TDZ) ──
const promptSections = ref<Array<{ name: string; hash: string; content: string }> | null>(null)
const promptError = ref<string | null>(null)

watch(
  () => store.selectedId,
  async () => {
    traceItems.value = []
    promptSections.value = null
    promptError.value = null
    diagReport.value = null
    const content = await store.readBundleFile('scene/turn-trace.jsonl')
    if (!content) return
    const items: TranscriptItem[] = []
    for (const line of content.split('\n').filter(Boolean).slice(1)) {
      try {
        const entry = JSON.parse(line)
        if (typeof entry.content !== 'string') continue
        items.push({
          kind: 'assistant',
          text: entry.content,
          toolCalls: (entry.toolCalls ?? []).map((tc: { name: string; args?: unknown }) => ({
            name: tc.name,
            args: shorten(JSON.stringify(tc.args ?? {}), 200),
          })),
        })
        for (const tc of entry.toolCalls ?? []) {
          if (tc.result === undefined) continue
          items.push({
            kind: 'tool-result',
            name: tc.name,
            source: 'real',
            text: shorten(typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result), 3000),
          })
        }
      } catch { /* skip */ }
    }
    traceItems.value = items
  },
  { immediate: true },
)

const sceneItems = computed<TranscriptItem[]>(() => [
  { kind: 'user', text: store.detail?.incident.userMessage },
  ...traceItems.value,
])

async function togglePrompt() {
  if (promptSections.value || promptError.value) {
    promptSections.value = null
    promptError.value = null
    return
  }
  const content = await store.readBundleFile('scene/prompt.json')
  if (!content) {
    // Most common cause: the live prompt capture was already evicted from
    // the LRU when this incident was created (👎 on an old turn / after a
    // restart) — the scene has no prompt snapshot to show.
    promptError.value = '该事故未捕获到提示词快照(👎 时已超出捕获窗口,或应用曾重启)。重放仍可用:系统提示词会由当前 builder 从现场参数重建。'
    return
  }
  try {
    promptSections.value = JSON.parse(content).sections ?? []
  } catch {
    promptError.value = 'prompt.json 解析失败'
  }
}

// ── 重放 ───────────────────────────────────────────────
function handleReplay() {
  void store.startReplay({
    runs: replayRuns.value,
    judge: replayJudge.value,
    useCapturedPrompt: replayCapturedPrompt.value || undefined,
    disabledSections: replayAblate.value ? [replayAblate.value] : undefined,
  })
}

const liveReplayItems = computed<TranscriptItem[]>(() =>
  store.replayEvents.map(eventToItem).filter((i): i is TranscriptItem => i !== null),
)

function eventToItem(event: Record<string, unknown>): TranscriptItem | null {
  const t = event.t as string
  if (t === 'round') return { kind: 'round', round: Number(event.n) }
  if (t === 'assistant') {
    return {
      kind: 'assistant',
      text: String(event.content ?? ''),
      toolCalls: ((event.toolCalls as Array<{ name: string; args?: unknown }>) ?? []).map(tc => ({
        name: tc.name,
        args: shorten(JSON.stringify(tc.args ?? {}), 200),
      })),
    }
  }
  if (t === 'tool-result') {
    return {
      kind: 'tool-result',
      name: String(event.name ?? ''),
      source: String(event.source ?? 'stub'),
      text: shorten(String(event.result ?? ''), 3000),
    }
  }
  if (t === 'judge') {
    return { kind: 'judge', pass: Boolean(event.pass), text: String(event.reason ?? '') }
  }
  if (t === 'error') return { kind: 'error', text: String(event.message ?? '') }
  return null
}

// ── 历史运行查看 ────────────────────────────────────────
const expandedRun = ref<string | null>(null)
const viewedAttempt = ref<string | null>(null)
const attemptItems = ref<TranscriptItem[]>([])

function toggleRun(run: { runId: string }) {
  expandedRun.value = expandedRun.value === run.runId ? null : run.runId
}

async function viewAttempt(runId: string, file: string) {
  viewedAttempt.value = `${runId}/${file}`
  attemptItems.value = []
  const content = await store.readBundleFile(`runs/${runId}/${file}`)
  if (!content) return
  const items: TranscriptItem[] = []
  for (const line of content.split('\n').filter(Boolean).slice(1)) {
    try {
      const item = eventToItem(JSON.parse(line))
      if (item) items.push(item)
    } catch { /* skip */ }
  }
  attemptItems.value = items
}

// ── 诊断报告 ────────────────────────────────────────────
const diagReport = ref<string | null>(null)

const diagnosisMarkdown = computed(() => store.diagnoseReport ?? diagReport.value)

watch(
  () => [store.selectedId, store.detail?.incident.diagnosis?.reportRef, activeTab.value] as const,
  async ([, reportRef, tab]) => {
    if (tab !== 'diagnose' || !reportRef || store.diagnoseReport) return
    diagReport.value = await store.readBundleFile(reportRef as string)
  },
)

// ── 转用例 ─────────────────────────────────────────────
async function handlePromote() {
  const incident = store.detail?.incident
  if (!incident) return
  const suggested = incident.category || incident.id
  const caseId = window.prompt('用例 ID:', suggested)
  if (!caseId) return
  const casePath = await store.promote(caseId, incident.title)
  if (casePath) toast.success(`已生成回归用例:${casePath}`)
}

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}
</script>

<style scoped>
/* 波 4 判定:**保留自绘,不迁 Dialog**。三条各自独立成立:
   ① 它是一张占满窗口的工作台(左右分栏 + 自己的滚动区 + 自己的焦点秩序),
      Dialog 是"任务面"—— 它的宽度档、内边距、标题栏、焦点陷阱在这里全是负担;
   ② 它必须压过**设置弹层**(`calc(var(--z-modal) + 10)`),而 Dialog 就住在
      modal 档,自己压不过自己;
   ③ 顶部 48px 的让位是为了躲开设置窗标题栏的 `-webkit-app-region: drag`
      (拖拽区会吞掉重叠 fixed 兄弟的点击),这是这一个窗口的形,不是对话框的形。
   它也不参与壁纸磨砂(wallpaper.css 块尾已列:遮罩类面板的职责就是盖住一切)。 */
.evals-workbench-overlay {
  position: fixed;
  inset: 0;
  /* 工作台是从设置弹层里打开的,必须盖住它 —— 所以是 modal 之上一档,
     不是 --z-overlay(那会掉到设置弹层底下)。裁量记在 ui-system.md 层级表备注。 */
  z-index: calc(var(--z-modal) + 10);
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: stretch;
  justify-content: center;
  /* Top padding clears the window titlebar drag strip: the settings window
     declares -webkit-app-region: drag there, and drag regions swallow
     clicks on overlapping fixed siblings (no-drag doesn't reliably win
     across DOM branches) — the ✕ button must sit below that strip. */
  padding: 48px 24px 24px;
  -webkit-app-region: no-drag;
}

.evals-workbench-overlay * {
  -webkit-app-region: no-drag;
}

.evals-workbench {
  flex: 1;
  max-width: 1280px;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  overflow: hidden;
  background: var(--ui-surface-app-bg);
  border: 1px solid var(--ui-border-default-border);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.wb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--ui-border-default-border);
}

.wb-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
}

.wb-count {
  font-size: 12px;
  font-weight: 400;
  color: var(--ui-text-secondary-fg);
}

.wb-close {
  border: none;
  background: transparent;
  color: var(--ui-text-secondary-fg);
  font-size: 15px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.wb-close:hover {
  background: var(--ui-surface-elevated-bg);
}

.wb-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.wb-list {
  width: 280px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid var(--ui-border-default-border);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wb-list-item {
  text-align: left;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  color: var(--ui-text-primary-fg);
}

.wb-list-item:hover {
  background: var(--ui-surface-elevated-bg);
}

.wb-list-item.active {
  background: var(--ui-surface-elevated-bg);
  border-color: var(--ui-border-default-border);
}

.wb-item-title {
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wb-item-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
}

.wb-item-date {
  font-size: 10.5px;
  color: var(--ui-text-muted-fg, var(--ui-text-secondary-fg));
}

.wb-item-preview {
  margin-top: 3px;
  font-size: 11px;
  color: var(--ui-text-secondary-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wb-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--ui-surface-elevated-bg);
  border: 1px solid var(--ui-border-default-border);
  color: var(--ui-text-secondary-fg);
}

.wb-badge.status.diagnosed,
.wb-badge.status.case-created,
.wb-badge.status.fixed {
  background: var(--ui-status-success-bg);
  color: var(--ui-status-success-fg);
}

.wb-badge.status.new {
  background: var(--ui-status-danger-bg);
  color: var(--ui-status-danger-fg);
}

.wb-detail {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 14px 20px 40px;
}

.wb-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.wb-btn {
  padding: 5px 12px;
  border-radius: 7px;
  border: 1px solid var(--ui-border-default-border);
  background: var(--ui-surface-elevated-bg);
  color: var(--ui-text-primary-fg);
  font-size: 12px;
  cursor: pointer;
}

.wb-btn:hover:not(:disabled) {
  background: var(--ui-surface-elevated-bg);
}

.wb-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.wb-btn.primary {
  background: var(--ui-action-primary-bg, var(--accent-light));
}

.wb-btn.small {
  padding: 2px 8px;
  font-size: 11px;
}

.wb-error {
  margin: 10px;
}

/* Sits in the action-button row — no margin, just the rule. */
.wb-error-inline {
  flex-shrink: 1;
}

.wb-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--ui-border-default-border);
  margin-bottom: 14px;
}

.wb-tab {
  padding: 7px 16px;
  border: none;
  background: transparent;
  color: var(--ui-text-secondary-fg);
  font-size: 13px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}

.wb-tab.active {
  color: var(--ui-text-primary-fg);
  border-bottom-color: var(--ui-action-primary-bg, var(--ui-accent-primary-fg));
}

.wb-pane {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wb-cover {
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--ui-surface-elevated-bg);
  border: 1px solid var(--ui-border-default-border);
}

.wb-section-title {
  margin: 14px 0 4px;
  font-size: 12.5px;
  color: var(--ui-text-secondary-fg);
  display: flex;
  align-items: center;
  gap: 10px;
}

.wb-prompt-sections {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wb-prompt-section {
  border: 1px solid var(--ui-border-default-border);
  border-radius: 8px;
  padding: 6px 10px;
  background: var(--ui-surface-elevated-bg);
}

.wb-prompt-section summary {
  cursor: pointer;
  font-size: 12px;
  display: flex;
  gap: 10px;
  align-items: baseline;
}

.wb-hash {
  font-size: 10.5px;
  color: var(--ui-text-muted-fg, var(--ui-text-secondary-fg));
  font-family: var(--font-mono, monospace);
}

.wb-prompt-section pre {
  margin: 8px 0 4px;
  font-size: 11.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow: auto;
  color: var(--ui-text-secondary-fg);
}

.wb-replay-controls {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12.5px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ui-surface-elevated-bg);
  border: 1px solid var(--ui-border-default-border);
}

/* P3: the two dropdowns are `<Select>`; these rules only seat them next to
   their caption. `.app-checkbox` qualifies the check rule so it outranks the
   component's own (0,1,0) rule instead of tying with it (ui-system.md §1). */
.wb-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* `.app-select` is `width: 100%` by default (it is built for form fields), so
   an inline control row has to pin it or it eats the whole line. */
.wb-field :deep(.app-select) {
  width: 104px;
  flex: 0 0 auto;
}

.app-checkbox.wb-check {
  align-items: center;
  gap: 5px;
}

.wb-verdicts {
  display: flex;
  gap: 6px;
}

.wb-verdict {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}

.wb-verdict.pass {
  background: var(--ui-status-success-bg);
  color: var(--ui-status-success-fg);
}

.wb-verdict.fail {
  background: var(--ui-status-danger-bg);
  color: var(--ui-status-danger-fg);
}

.wb-verdict.na {
  background: var(--ui-surface-elevated-bg);
  color: var(--ui-text-secondary-fg);
}

.wb-run-row {
  border: 1px solid var(--ui-border-default-border);
  border-radius: 8px;
  overflow: hidden;
}

.wb-run-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  background: var(--ui-surface-elevated-bg);
}

.wb-run-attempts {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wb-diag-steps {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wb-diag-step {
  font-size: 12px;
  color: var(--ui-text-secondary-fg);
  padding: 4px 10px;
  border-left: 2px solid var(--ui-border-default-border);
}

.wb-hint {
  color: var(--ui-text-muted-fg, var(--ui-text-secondary-fg));
  font-size: 12.5px;
  padding: 14px;
  text-align: center;
}
</style>
