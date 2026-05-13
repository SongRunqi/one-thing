import { BrowserWindow, shell } from 'electron'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import {
  IPC_CHANNELS,
  type TodoPlanChangedPayload,
  type TodoPlanContext,
  type TodoPlanDocument,
  type TodoPlanSnapshot,
} from '../../shared/ipc.js'
import { getSettings } from '../stores/settings.js'
import { getStorePath } from '../stores/paths.js'

const USER_NOTES_DIR = 'user-notes'
const WORKSPACES_DIR = 'workspaces'
const AI_TODO_FILE = 'ai-todo.md'
const AI_TODO_INITIAL_CONTENT = `# AI Todo

## Now
- [ ] Track current assistant work here

## Later
- [ ] Track follow-up work here
`

export function getTodoPlanDirectory(): string {
  const configured = getSettings().general?.todoPlan?.directory?.trim()
  if (!configured) return path.join(getStorePath(), 'todo-plan')
  return configured === '~' || configured.startsWith('~/')
    ? path.join(os.homedir(), configured.slice(2))
    : configured
}

function countTasks(content: string): number {
  return content.split('\n').filter(line => /^\s*[-*]\s+\[[ xX]]\s+/.test(line)).length
}

function safeSlug(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 44)
  return slug || 'todo'
}

function hashKey(input: string): string {
  return crypto.createHash('sha1').update(input || '__default__').digest('hex').slice(0, 12)
}

function workspaceKey(workingDirectory?: string): string {
  const display = workingDirectory ? path.basename(workingDirectory) : 'default'
  return `${safeSlug(display)}-${hashKey(workingDirectory || '__default__')}`
}

function userNotePath(id: string): string {
  return path.join(getTodoPlanDirectory(), USER_NOTES_DIR, `${id}.md`)
}

function workspaceAiTodoPath(workingDirectory?: string): string {
  return path.join(getTodoPlanDirectory(), WORKSPACES_DIR, workspaceKey(workingDirectory), AI_TODO_FILE)
}

async function readDocument(filePath: string, fallback = ''): Promise<{ content: string; updatedAt: number }> {
  try {
    const [content, stats] = await Promise.all([
      fs.readFile(filePath, 'utf-8'),
      fs.stat(filePath),
    ])
    return { content, updatedAt: stats.mtimeMs }
  } catch {
    return { content: fallback, updatedAt: 0 }
  }
}

async function writeFileEnsured(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
}

function titleFromContent(content: string, fallback: string): string {
  const heading = content.split('\n').map(line => line.trim()).find(line => line.startsWith('# '))
  return heading ? heading.replace(/^#\s+/, '').trim() || fallback : fallback
}

async function toDocument(
  input: {
    id: string
    scope: TodoPlanDocument['scope']
    role: TodoPlanDocument['role']
    title: string
    filePath: string
    fallback?: string
  },
): Promise<TodoPlanDocument> {
  const { content, updatedAt } = await readDocument(input.filePath, input.fallback || '')
  return {
    id: input.id,
    scope: input.scope,
    title: titleFromContent(content, input.title),
    role: input.role,
    filePath: input.filePath,
    content,
    updatedAt,
    totalTasks: countTasks(content),
  }
}

async function ensureDefaultUserNote(): Promise<void> {
  const directory = path.join(getTodoPlanDirectory(), USER_NOTES_DIR)
  await fs.mkdir(directory, { recursive: true })
  const entries = await fs.readdir(directory).catch(() => [])
  if (entries.some(entry => entry.toLowerCase().endsWith('.md'))) return
  await writeFileEnsured(
    path.join(directory, 'user-todo-1.md'),
    '# User Todo 1\n\n- [ ] Add the first user task\n',
  )
}

async function ensureWorkspaceAiTodo(workingDirectory?: string): Promise<string> {
  const filePath = workspaceAiTodoPath(workingDirectory)
  try {
    await fs.access(filePath)
  } catch {
    await writeFileEnsured(filePath, AI_TODO_INITIAL_CONTENT)
  }
  return filePath
}

export async function readTodoPlanSnapshot(context: TodoPlanContext = {}): Promise<TodoPlanSnapshot> {
  const directory = getTodoPlanDirectory()
  await ensureDefaultUserNote()

  const userDirectory = path.join(directory, USER_NOTES_DIR)
  const entries = await fs.readdir(userDirectory, { withFileTypes: true }).catch(() => [])
  const userNotes = await Promise.all(
    entries
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(entry => {
        const id = entry.name.replace(/\.md$/i, '')
        return toDocument({
          id,
          scope: 'user-note',
          role: 'user',
          title: id.replace(/-/g, ' '),
          filePath: path.join(userDirectory, entry.name),
        })
      }),
  )

  const aiPath = await ensureWorkspaceAiTodo(context.workingDirectory)
  const workspaceAiTodo = await toDocument({
    id: 'workspace-ai-todo',
    scope: 'workspace-ai-todo',
    role: 'assistant',
    title: 'AI Todo',
    filePath: aiPath,
  })

  return { directory, userNotes, workspaceAiTodo }
}

export async function createUserTodoNote(title: string, content?: string): Promise<TodoPlanDocument> {
  const cleanTitle = title.trim() || 'Untitled Todo'
  const base = safeSlug(cleanTitle)
  let id = base
  let index = 2
  while (true) {
    try {
      await fs.access(userNotePath(id))
      id = `${base}-${index}`
      index += 1
    } catch {
      break
    }
  }

  const filePath = userNotePath(id)
  await writeFileEnsured(filePath, content ?? `# ${cleanTitle}\n\n`)
  const document = await toDocument({ id, scope: 'user-note', role: 'user', title: cleanTitle, filePath })
  broadcastTodoPlanChanged({ scope: 'global-user', document })
  return document
}

export async function updateTodoPlanDocument(request: {
  scope: TodoPlanDocument['scope']
  id?: string
  content: string
  sessionId?: string
  workingDirectory?: string
}): Promise<TodoPlanDocument> {
  let filePath: string
  let id: string
  let role: TodoPlanDocument['role']
  let title: string

  if (request.scope === 'user-note') {
    if (!request.id) throw new Error('id is required for user-note updates')
    id = request.id
    filePath = userNotePath(id)
    role = 'user'
    title = id.replace(/-/g, ' ')
  } else if (request.scope === 'workspace-ai-todo') {
    id = 'workspace-ai-todo'
    filePath = workspaceAiTodoPath(request.workingDirectory)
    role = 'assistant'
    title = 'AI Todo'
  } else {
    throw new Error(`Unsupported todo/plan scope: ${request.scope}`)
  }

  await writeFileEnsured(filePath, request.content)
  const document = await toDocument({ id, scope: request.scope, role, title, filePath })
  broadcastTodoPlanChanged({
    scope: request.scope === 'user-note' ? 'global-user' : request.scope,
    sessionId: request.sessionId,
    workingDirectory: request.workingDirectory,
    document,
  })
  return document
}

export async function renameUserTodoNote(id: string, title: string): Promise<TodoPlanDocument> {
  const currentPath = userNotePath(id)
  const nextTitle = title.trim() || 'Untitled Todo'
  let nextId = safeSlug(nextTitle)
  let index = 2
  while (nextId !== id) {
    try {
      await fs.access(userNotePath(nextId))
      nextId = `${safeSlug(nextTitle)}-${index}`
      index += 1
    } catch {
      break
    }
  }

  const content = (await readDocument(currentPath)).content
  const withoutHeading = content.replace(/^# .*(\r?\n|$)/, '')
  const nextContent = `# ${nextTitle}\n${withoutHeading.startsWith('\n') ? withoutHeading : `\n${withoutHeading}`}`
  const nextPath = userNotePath(nextId)
  await writeFileEnsured(nextPath, nextContent)
  if (nextId !== id) await fs.unlink(currentPath).catch(() => {})

  const document = await toDocument({ id: nextId, scope: 'user-note', role: 'user', title: nextTitle, filePath: nextPath })
  broadcastTodoPlanChanged({ scope: 'global-user', document })
  return document
}

export async function deleteUserTodoNote(id: string): Promise<void> {
  await fs.unlink(userNotePath(id)).catch(() => {})
  await ensureDefaultUserNote()
  broadcastTodoPlanChanged({ scope: 'global-user' })
}

export async function revealTodoPlanDirectory(): Promise<void> {
  const directory = getTodoPlanDirectory()
  await fs.mkdir(directory, { recursive: true })
  await shell.openPath(directory)
}

export function broadcastTodoPlanChanged(payload: TodoPlanChangedPayload): void {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.TODO_PLAN_CHANGED, payload)
    }
  })
}
