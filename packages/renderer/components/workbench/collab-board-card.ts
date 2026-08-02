/**
 * Board card interaction logic (W16) — kept out of the .vue so the menu the
 * user actually sees, and the action it turns into, are testable without a
 * DOM. The panel was read-only through P1: 用户真机实锤「看板根本移动不了」.
 *
 * Every action carries the card's CURRENT rev. That is the whole optimistic-
 * concurrency story: an agent that moved the card between the render and the
 * click loses the write, and the reducer says so in words the panel shows.
 */
import {
  isActiveAgent,
  type AgentStatus,
  type CollabBoardAction,
  type CollabTask,
  type CollabTaskEvidence,
  type CollabTaskStatus,
} from '@shared/ipc.js'
import { agentTombstoneLabel } from '@onething/runtime/agents/model'
import { AGENT_AVATAR_FALLBACK } from '@/components/common/agent-avatar'
import type { ContextMenuItem } from '@/components/common/context-menu'

export interface BoardColumn {
  status: CollabTaskStatus
  label: string
}

export const BOARD_COLUMNS: readonly BoardColumn[] = [
  { status: 'backlog', label: '待定' },
  { status: 'todo', label: '待办' },
  { status: 'doing', label: '进行中' },
  { status: 'review', label: '评审' },
  { status: 'done', label: '完成' },
  { status: 'blocked', label: '受阻' },
]

/** The subset of an agent the card menu needs (avatar is optional). */
export interface BoardMenuAgent {
  id: string
  name?: string
  avatar?: string
  /** 生命周期(agent-domain-model.md M3);缺省 active。 */
  status?: AgentStatus
}

/**
 * A menu row is plain text, so it stays on the emoji even for an agent with a
 * picture — ContextMenuItem has nowhere to put an <img>.
 */
export const BOARD_MENU_FALLBACK_AVATAR = AGENT_AVATAR_FALLBACK

/** A card completed by hand still gets an honest report line in the room. */
export const BOARD_USER_COMPLETE_SUMMARY = '用户在看板上标记完成'

/** 墓碑文案(域模型 M4):已退休与查无此人共用这一个词。属主在 model.ts(B8)。 */
const BOARD_MENU_TOMBSTONE_NAME = agentTombstoneLabel('ui')

function agentLabel(agentId: string, agents: readonly BoardMenuAgent[]): string {
  const agent = agents.find(candidate => candidate.id === agentId)
  const avatar = agent?.avatar || BOARD_MENU_FALLBACK_AVATAR
  return `${avatar} ${agent?.name || BOARD_MENU_TOMBSTONE_NAME}`
}

/** 这个成员还能接活吗(§3.2:退休的不被指派)。查无此人同样不能。 */
function isAssignable(agentId: string, agents: readonly BoardMenuAgent[]): boolean {
  const agent = agents.find(candidate => candidate.id === agentId)
  return Boolean(agent) && isActiveAgent(agent!)
}

/**
 * The card's menu. Rows are FLAT rather than nested: ContextMenu.vue has no
 * submenu, and 工单 forbids inventing menu chrome — a room roster is 2-5 names,
 * so a grouped flat list reads fine and costs no new component.
 *
 * The current column and the current assignee stay visible but disabled: a
 * greyed 「移到 进行中」 tells the user where the card already is, which a
 * missing row does not.
 */
export function buildBoardCardMenuItems(options: {
  task: CollabTask
  agents: readonly BoardMenuAgent[]
  memberAgentIds: readonly string[]
}): ContextMenuItem[] {
  const { task, agents, memberAgentIds } = options
  const items: ContextMenuItem[] = BOARD_COLUMNS.map(column => ({
    id: `move:${column.status}`,
    label: `移到 ${column.label}`,
    disabled: column.status === task.status,
  }))

  // 已退休(或查无此人)的成员照旧列出来但**点不动**(§3.2:不被指派开工)——
  // 与"当前列/当前执行人保持可见但禁用"同一条理由:一行灰字说清了"这个人在花
  // 名册上但已经注销",而少一行只会让用户以为自己看错了。
  for (const [index, agentId] of memberAgentIds.entries()) {
    const assignable = isAssignable(agentId, agents)
    items.push({
      id: `assign:${agentId}`,
      label: assignable
        ? `指派给 ${agentLabel(agentId, agents)}`
        : `指派给 ${agentLabel(agentId, agents)} · ${BOARD_MENU_TOMBSTONE_NAME}`,
      disabled: agentId === task.assigneeAgentId || !assignable,
      ...(index === 0 ? { separatorBefore: true } : {}),
    })
  }

  // complete is the reducer's own door (doing/todo → review + delivery report);
  // it is NOT the same as 移到 完成, which closes the card outright.
  if (task.status === 'doing' || task.status === 'todo') {
    items.push({ id: 'complete', label: '标记完成', separatorBefore: true })
  }

  // 停止执行(collab-team-v2 §5.1 入口②)。与「标受阻」是两个意思:受阻在说
  // 「这事儿卡住了、需要人裁决」并烧掉一次自动处置预算,停止只是把手拿开——
  // 卡回到待办、现场留着、随时可以续做。此前想暂停的人只能去点受阻,于是看板
  // 上真正需要裁决的卡被一堆"其实只是被停了"的卡淹掉。
  //
  // 显示条件用 workSessionIds 而不是"有没有活着的流":渲染进程看不见后者。
  // 点下去若那条流已经结束,主进程回 stopped:false,照实说一句就是了。
  if (task.status === 'doing' && task.workSessionIds.length > 0) {
    items.push({ id: 'stop-work', label: '停止执行', separatorBefore: true })
  }

  // 受阻卡的一键复位。move → todo on an assigned card is the requeue signal
  // (W9b.1), so this really re-spawns work rather than just recolouring a chip.
  if (task.status === 'blocked') {
    items.push({ id: 'requeue', label: '重新排队', separatorBefore: true })
  }

  return items
}

/** 不是看板动作的菜单项 —— 走各自的通道,`buildBoardCardAction` 认不得它们。 */
export const BOARD_CARD_STOP_WORK_ITEM_ID = 'stop-work'

/**
 * Menu id → wire action. Returns undefined for anything unrecognised so a
 * stale menu (card mutated under it) cannot fabricate a write.
 */
export function buildBoardCardAction(
  itemId: string,
  task: CollabTask,
): CollabBoardAction | undefined {
  if (itemId.startsWith('move:')) {
    const status = itemId.slice('move:'.length) as CollabTaskStatus
    if (!BOARD_COLUMNS.some(column => column.status === status)) return undefined
    if (status === task.status) return undefined
    return { action: 'move', taskId: task.id, status, expectedRev: task.rev }
  }
  if (itemId.startsWith('assign:')) {
    const assigneeAgentId = itemId.slice('assign:'.length)
    if (!assigneeAgentId || assigneeAgentId === task.assigneeAgentId) return undefined
    return { action: 'assign', taskId: task.id, assigneeAgentId, expectedRev: task.rev }
  }
  if (itemId === 'complete') {
    return {
      action: 'complete',
      taskId: task.id,
      summary: BOARD_USER_COMPLETE_SUMMARY,
      expectedRev: task.rev,
    }
  }
  if (itemId === 'requeue') {
    if (task.status === 'todo') return undefined
    return { action: 'move', taskId: task.id, status: 'todo', expectedRev: task.rev }
  }
  return undefined
}

/**
 * `write×1, read×2` — count desc, then name, mirroring the room's own
 * execution line (runtime formatCollabTaskEvidence). Deliberately re-stated
 * here instead of imported: pulling the collab barrel into the renderer bundle
 * for eight lines of string formatting is the wrong trade.
 */
export function formatBoardEvidence(evidence?: CollabTaskEvidence): string {
  const entries = Object.entries(evidence?.toolCounts ?? {}).filter(([, count]) => count > 0)
  if (entries.length === 0) return ''
  return entries
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([name, count]) => `${name}×${count}`)
    .join(', ')
}

/** No tool call ever ran for this card — the theatre tell (W9b.4). */
export const BOARD_NO_EVIDENCE_TEXT = '无执行记录'

/** The done card's receipt line: counted by code, unforgeable by a model. */
export function formatBoardEvidenceLabel(task: CollabTask): string {
  const trace = formatBoardEvidence(task.report?.evidence)
  return trace ? `执行记录: ${trace}` : BOARD_NO_EVIDENCE_TEXT
}

// ── 交付物(W17)──────────────────────────────────────────────────────────
// The card's deliverables are `report.evidence.files` — collected by the same
// code walk that counts the tool calls, so what the panel lists is what the
// worker's write/edit calls actually targeted.

/** Card face stays a card: the rest of a long list lives in the 交付物 view. */
export const BOARD_CARD_FILES_LIMIT = 3

export const BOARD_DELIVERABLES_EMPTY_TEXT = '还没有交付物——任务执行写过的文件会出现在这里。'

export interface BoardDeliverableGroup {
  taskId: string
  title: string
  files: string[]
}

export function taskDeliverables(task: CollabTask): string[] {
  return task.report?.evidence?.files ?? []
}

/**
 * Every task that produced files, newest-updated first — the 交付物 view's
 * whole data shape. Tasks without files are dropped rather than shown empty:
 * an empty group says nothing and costs a heading.
 */
export function collectBoardDeliverables(tasks: readonly CollabTask[]): BoardDeliverableGroup[] {
  return tasks
    .filter(task => taskDeliverables(task).length > 0)
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map(task => ({ taskId: task.id, title: task.title, files: taskDeliverables(task) }))
}

export function countBoardDeliverables(tasks: readonly CollabTask[]): number {
  const seen = new Set<string>()
  for (const task of tasks) {
    for (const file of taskDeliverables(task)) seen.add(file)
  }
  return seen.size
}

/**
 * Back to an absolute path for the shell. Stored paths are relative to the
 * room's workingDirectory (see the worker's relativiser); anything already
 * absolute — POSIX `/x`, Windows `C:\x` or a UNC `\\host\share` — is handed
 * over untouched. No workingDirectory means we cannot honestly resolve, so the
 * caller gets '' and skips the open rather than opening some other file.
 */
export function resolveDeliverablePath(file: string, workingDirectory?: string): string {
  const trimmed = file.trim()
  if (!trimmed) return ''
  if (isAbsoluteDeliverablePath(trimmed)) return trimmed
  if (!workingDirectory) return ''
  const separator = workingDirectory.includes('\\') && !workingDirectory.includes('/') ? '\\' : '/'
  return `${workingDirectory.replace(/[/\\]+$/, '')}${separator}${trimmed}`
}

function isAbsoluteDeliverablePath(file: string): boolean {
  return file.startsWith('/') || file.startsWith('\\\\') || /^[a-zA-Z]:[/\\]/.test(file)
}

/** `src/app/main.ts` → `{ name: 'main.ts', dir: 'src/app' }` — filename leads. */
export function splitDeliverablePath(file: string): { name: string; dir: string } {
  const normalized = file.replace(/[/\\]+$/, '')
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  if (index < 0) return { name: normalized, dir: '' }
  return { name: normalized.slice(index + 1), dir: normalized.slice(0, index) }
}

export const BOARD_CONFLICT_HINT = '看板已被他人更新,已刷新'

/**
 * The reducer's conflict wording (`… changed (rev N) — re-read the board …`).
 * Matched on the durable half of the sentence rather than the whole string, so
 * a reworded suffix downgrades to the raw error instead of to silence.
 */
export function isBoardRevConflict(error: string | undefined): boolean {
  return Boolean(error && /re-read the board/i.test(error))
}
