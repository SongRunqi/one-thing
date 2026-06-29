import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

export type TodoPlanScope = 'user-note' | 'workspace-ai-todo'

export interface TodoPlanContext {
  sessionId?: string
  workingDirectory?: string
}

export interface TodoPlanDocument {
  id: string
  scope: TodoPlanScope
  title: string
  role: 'user' | 'assistant' | 'plan'
  filePath: string
  content: string
  updatedAt: number
  totalTasks: number
}

export interface TodoPlanSnapshot {
  directory: string
  userNotes: TodoPlanDocument[]
  workspaceAiTodo?: TodoPlanDocument
}

export interface TodoPlanChangedPayload extends TodoPlanContext {
  scope: TodoPlanScope | 'global-user' | 'all'
  document?: TodoPlanDocument
}

export interface TodoPlanUpdateRequest extends TodoPlanContext {
  scope: TodoPlanScope
  id?: string
  content: string
}

export interface OnethingTodoPlanStoreOptions {
  getConfiguredDirectory?: () => string | undefined
  getDefaultStorePath: () => string
  notifyChanged?: (payload: TodoPlanChangedPayload) => void
  revealDirectory?: (directory: string) => Promise<unknown> | unknown
}

const USER_NOTES_DIR = 'user-notes'
const WORKSPACES_DIR = 'workspaces'
const AI_TODO_FILE = 'ai-todo.md'

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

function titleFromContent(content: string, fallback: string): string {
  const heading = content.split('\n').map(line => line.trim()).find(line => line.startsWith('# '))
  return heading ? heading.replace(/^#\s+/, '').trim() || fallback : fallback
}

function hasSubstantiveMarkdownContent(content: string): boolean {
  return content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !/^#{1,6}\s+/.test(line) && !/^-{3,}$/.test(line))
    .join('\n')
    .trim().length > 0
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

export class OnethingTodoPlanStore {
  constructor(private readonly options: OnethingTodoPlanStoreOptions) {}

  getDirectory(): string {
    const configured = this.options.getConfiguredDirectory?.()?.trim()
    if (!configured) return path.join(this.options.getDefaultStorePath(), 'todo-plan')
    return configured === '~' || configured.startsWith('~/')
      ? path.join(os.homedir(), configured.slice(2))
      : configured
  }

  async readSnapshot(context: TodoPlanContext = {}): Promise<TodoPlanSnapshot> {
    const directory = this.getDirectory()
    await this.ensureDefaultUserNote()

    const userDirectory = path.join(directory, USER_NOTES_DIR)
    const entries = await fs.readdir(userDirectory, { withFileTypes: true }).catch(() => [])
    const userNotes = await Promise.all(
      entries
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(entry => {
          const id = entry.name.replace(/\.md$/i, '')
          return this.toDocument({
            id,
            scope: 'user-note',
            role: 'user',
            title: id.replace(/-/g, ' '),
            filePath: path.join(userDirectory, entry.name),
          })
        }),
    )

    const workspaceAiTodo = await this.readWorkspaceAiTodo(context.workingDirectory)

    return {
      directory,
      userNotes,
      ...(workspaceAiTodo ? { workspaceAiTodo } : {}),
    }
  }

  async createUserNote(title: string, content?: string): Promise<TodoPlanDocument> {
    const cleanTitle = title.trim() || 'Untitled Todo'
    const base = safeSlug(cleanTitle)
    let id = base
    let index = 2
    while (true) {
      try {
        await fs.access(this.userNotePath(id))
        id = `${base}-${index}`
        index += 1
      } catch {
        break
      }
    }

    const filePath = this.userNotePath(id)
    await writeFileEnsured(filePath, content ?? `# ${cleanTitle}\n\n`)
    const document = await this.toDocument({ id, scope: 'user-note', role: 'user', title: cleanTitle, filePath })
    this.notifyChanged({ scope: 'global-user', document })
    return document
  }

  async updateDocument(request: TodoPlanUpdateRequest): Promise<TodoPlanDocument> {
    let filePath: string
    let id: string
    let role: TodoPlanDocument['role']
    let title: string

    if (request.scope === 'user-note') {
      if (!request.id) throw new Error('id is required for user-note updates')
      id = request.id
      filePath = this.userNotePath(id)
      role = 'user'
      title = id.replace(/-/g, ' ')
    } else if (request.scope === 'workspace-ai-todo') {
      id = 'workspace-ai-todo'
      filePath = this.workspaceAiTodoPath(request.workingDirectory)
      role = 'assistant'
      title = 'AI Todo'
      const exists = Boolean(await fs.stat(filePath).catch(() => null))
      if (!exists && !hasSubstantiveMarkdownContent(request.content)) {
        throw new Error('workspace-ai-todo content is empty; it is created only after there is real AI todo content')
      }
    } else {
      throw new Error(`Unsupported todo/plan scope: ${request.scope}`)
    }

    await writeFileEnsured(filePath, request.content)
    const document = await this.toDocument({ id, scope: request.scope, role, title, filePath })
    this.notifyChanged({
      scope: request.scope === 'user-note' ? 'global-user' : request.scope,
      sessionId: request.sessionId,
      workingDirectory: request.workingDirectory,
      document,
    })
    return document
  }

  async renameUserNote(id: string, title: string): Promise<TodoPlanDocument> {
    const currentPath = this.userNotePath(id)
    const nextTitle = title.trim() || 'Untitled Todo'
    let nextId = safeSlug(nextTitle)
    let index = 2
    while (nextId !== id) {
      try {
        await fs.access(this.userNotePath(nextId))
        nextId = `${safeSlug(nextTitle)}-${index}`
        index += 1
      } catch {
        break
      }
    }

    const content = (await readDocument(currentPath)).content
    const withoutHeading = content.replace(/^# .*(\r?\n|$)/, '')
    const nextContent = `# ${nextTitle}\n${withoutHeading.startsWith('\n') ? withoutHeading : `\n${withoutHeading}`}`
    const nextPath = this.userNotePath(nextId)
    await writeFileEnsured(nextPath, nextContent)
    if (nextId !== id) await fs.unlink(currentPath).catch(() => {})

    const document = await this.toDocument({ id: nextId, scope: 'user-note', role: 'user', title: nextTitle, filePath: nextPath })
    this.notifyChanged({ scope: 'global-user', document })
    return document
  }

  async deleteUserNote(id: string): Promise<void> {
    await fs.unlink(this.userNotePath(id)).catch(() => {})
    await this.ensureDefaultUserNote()
    this.notifyChanged({ scope: 'global-user' })
  }

  async revealDirectory(): Promise<void> {
    const directory = this.getDirectory()
    await fs.mkdir(directory, { recursive: true })
    if (!this.options.revealDirectory) {
      throw new Error('Opening the todo plan directory requires the desktop app')
    }
    await this.options.revealDirectory(directory)
  }

  notifyChanged(payload: TodoPlanChangedPayload): void {
    this.options.notifyChanged?.(payload)
  }

  private workspaceKey(workingDirectory?: string): string {
    const display = workingDirectory ? path.basename(workingDirectory) : 'default'
    return `${safeSlug(display)}-${hashKey(workingDirectory || '__default__')}`
  }

  private userNotePath(id: string): string {
    return path.join(this.getDirectory(), USER_NOTES_DIR, `${id}.md`)
  }

  private workspaceAiTodoPath(workingDirectory?: string): string {
    return path.join(this.getDirectory(), WORKSPACES_DIR, this.workspaceKey(workingDirectory), AI_TODO_FILE)
  }

  private async toDocument(input: {
    id: string
    scope: TodoPlanDocument['scope']
    role: TodoPlanDocument['role']
    title: string
    filePath: string
    fallback?: string
  }): Promise<TodoPlanDocument> {
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

  private async ensureDefaultUserNote(): Promise<void> {
    const directory = path.join(this.getDirectory(), USER_NOTES_DIR)
    await fs.mkdir(directory, { recursive: true })
    const entries = await fs.readdir(directory).catch(() => [])
    if (entries.some(entry => entry.toLowerCase().endsWith('.md'))) return
    await writeFileEnsured(
      path.join(directory, 'user-todo-1.md'),
      '# User Todo 1\n\n- [ ] Add the first user task\n',
    )
  }

  private async readWorkspaceAiTodo(workingDirectory?: string): Promise<TodoPlanDocument | undefined> {
    const filePath = this.workspaceAiTodoPath(workingDirectory)
    try {
      await fs.access(filePath)
    } catch {
      return undefined
    }
    return this.toDocument({
      id: 'workspace-ai-todo',
      scope: 'workspace-ai-todo',
      role: 'assistant',
      title: 'AI Todo',
      filePath,
    })
  }
}
