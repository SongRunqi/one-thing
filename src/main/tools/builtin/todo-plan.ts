import { z } from 'zod'
import { Tool } from '../core/tool.js'
import {
  createUserTodoNote,
  deleteUserTodoNote,
  readTodoPlanSnapshot,
  renameUserTodoNote,
  updateTodoPlanDocument,
} from '../../todo-plan/store.js'

const TodoPlanParameters = z.object({
  action: z.enum(['list', 'create', 'update', 'rename', 'delete'])
    .describe('List, create, update, rename, or delete todo/plan markdown documents.'),
  scope: z.enum(['user-note', 'workspace-ai-todo']).optional()
    .describe('Target scope. user-note is global user notes, workspace-ai-todo is per-work-directory AI work tracking and follow-up work.'),
  id: z.string().optional()
    .describe('User note id for update/rename/delete. Not needed for workspace-ai-todo.'),
  title: z.string().optional()
    .describe('Title for creating or renaming a user note.'),
  content: z.string().optional()
    .describe('Complete markdown content for create/update. Preserve useful existing items unless intentionally changing them.'),
})

export const TodoPlanTool = Tool.define<typeof TodoPlanParameters>('todo_plan', {
  name: 'Todo Plan',
  description: `Read or update the todo/plan panel shown in the chat UI.

Scopes:
- user-note: global user-owned markdown todo notes. Use these to help the user remember their own tasks, commitments, reminders, errands, meeting notes, and personal/project notes.
- workspace-ai-todo: one assistant-owned todo list per workspace. Use this as the only AI work-tracking surface in the same work directory.

Workspace AI Todo convention:
- "## Now" is for the current round or currently active assistant work.
- "## Later" is for follow-up items that should survive beyond the current round.
- Preserve existing useful items and update the complete markdown document when changing it.
- In active autonomy mode, use workspace-ai-todo proactively for multi-step coding, debugging, research, planning, or follow-up work: update it when you form or revise a plan, complete a meaningful step, discover a new blocker, or leave unfinished work.
- In active autonomy mode, also use user-note proactively when the user clearly asks you to remember, track, or add something to their todo/notes, or when they state a concrete future task/commitment that should be preserved.
- If the target user note is unclear, list notes first and update the most relevant note or create a concise new one. Ask before writing only when intent is ambiguous.
- Never delete or rename user-note documents unless the user explicitly asks for that destructive/organizational action.

Every todo_plan call must include action. To replace the workspace AI todo markdown, call todo_plan with action="update", scope="workspace-ai-todo", and content="...".

All documents are markdown and render live in the todo/plan card and detached window.`,
  category: 'builtin',
  enabled: true,
  autoExecute: true,
  permissionGuard: 'safe',
  executionMode: 'sequential',
  renderKind: 'text',
  parameters: TodoPlanParameters,

  async execute(args, ctx) {
    ctx.updateResult?.({
      content: [{ type: 'text', text: `Running todo_plan ${args.action}...` }],
      details: { phase: 'running', action: args.action, scope: args.scope, id: args.id },
    })

    if (args.action === 'list') {
      const snapshot = await readTodoPlanSnapshot({
        sessionId: ctx.sessionId,
        workingDirectory: ctx.workingDirectory,
      })
      const workspaceAiTodoText = snapshot.workspaceAiTodo
        ? `Tasks: ${snapshot.workspaceAiTodo.totalTasks}\n\n${snapshot.workspaceAiTodo.content}`
        : 'Not created yet. It will be created only after workspace-ai-todo is explicitly written with content.'
      const parts = [
        '# User Notes',
        ...snapshot.userNotes.map(note => `## ${note.title}\nID: ${note.id}\nTasks: ${note.totalTasks}\n\n${note.content}`),
        '# Workspace AI Todo',
        workspaceAiTodoText,
      ]
      ctx.metadata({
        title: 'Listed todo/plan',
        metadata: {
          directory: snapshot.directory,
          userNoteCount: snapshot.userNotes.length,
        },
      })
      return {
        title: 'Todo / Plan',
        output: parts.join('\n\n---\n\n'),
        metadata: {
          directory: snapshot.directory,
          userNoteCount: snapshot.userNotes.length,
        },
      }
    }

    if (args.action === 'create') {
      const scope = args.scope || 'user-note'
      if (scope === 'user-note') {
        if (!args.title) throw new Error('title is required for create')
        const document = await createUserTodoNote(args.title, args.content)
        ctx.metadata({ title: `Created ${document.title}`, metadata: { id: document.id } })
        return {
          title: `Created ${document.title}`,
          output: `${document.title} created with id ${document.id}`,
          metadata: { id: document.id, scope: document.scope },
        }
      }

      if (args.content === undefined) throw new Error('content is required when creating workspace-ai-todo')
      const document = await updateTodoPlanDocument({
        scope,
        content: args.content,
        sessionId: ctx.sessionId,
        workingDirectory: ctx.workingDirectory,
      })
      ctx.metadata({
        title: `Created ${document.title}`,
        metadata: { id: document.id, scope: document.scope },
      })
      return {
        title: `Created ${document.title}`,
        output: `${document.title} created`,
        metadata: { id: document.id, scope: document.scope },
      }
    }

    if (args.action === 'rename') {
      if (!args.id) throw new Error('id is required for rename')
      if (!args.title) throw new Error('title is required for rename')
      const document = await renameUserTodoNote(args.id, args.title)
      ctx.metadata({ title: `Renamed ${document.title}`, metadata: { id: document.id } })
      return {
        title: `Renamed ${document.title}`,
        output: `Renamed user note to ${document.title}`,
        metadata: { id: document.id, scope: document.scope },
      }
    }

    if (args.action === 'delete') {
      if (!args.id) throw new Error('id is required for delete')
      await deleteUserTodoNote(args.id)
      ctx.metadata({ title: 'Deleted user todo note', metadata: { id: args.id } })
      return {
        title: 'Deleted user todo note',
        output: `Deleted user note ${args.id}`,
        metadata: { id: args.id, scope: 'user-note' },
      }
    }

    if (!args.scope) throw new Error('scope is required for update')
    if (args.content === undefined) throw new Error('content is required for update')
    const document = await updateTodoPlanDocument({
      scope: args.scope,
      id: args.id,
      content: args.content,
      sessionId: ctx.sessionId,
      workingDirectory: ctx.workingDirectory,
    })
    ctx.metadata({
      title: `Updated ${document.title}`,
      metadata: { id: document.id, scope: document.scope },
    })
    return {
      title: `Updated ${document.title}`,
      output: `${document.title} updated`,
      metadata: { id: document.id, scope: document.scope },
    }
  },

  formatValidationError(error) {
    const issues = error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
    return `Invalid todo_plan parameters:\n${issues.join('\n')}\n\nUsage: todo_plan({ action: "list" | "create" | "update" | "rename" | "delete", scope?: "user-note" | "workspace-ai-todo", id?: string, title?: string, content?: string }). action is always required; for workspace-ai-todo content replacement use action="update".`
  },
})
