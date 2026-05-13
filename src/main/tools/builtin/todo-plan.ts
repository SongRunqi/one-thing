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
    .describe('Target scope. user-note is global user notes, workspace-ai-todo is per working directory AI work tracking and follow-up work.'),
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
- user-note: global user-owned markdown todo notes. Create or edit these only when the user asks to track their own tasks.
- workspace-ai-todo: one assistant-owned todo list per workspace. Use this as the only AI work-tracking surface in the same working directory.

Workspace AI Todo convention:
- "## Now" is for the current round or currently active assistant work.
- "## Later" is for follow-up items that should survive beyond the current round.
- Preserve existing useful items and update the complete markdown document when changing it.

All documents are markdown and render live in the todo/plan card and detached window.`,
  category: 'builtin',
  enabled: true,
  autoExecute: true,
  permissionGuard: 'safe',
  parameters: TodoPlanParameters,

  async execute(args, ctx) {
    if (args.action === 'list') {
      const snapshot = await readTodoPlanSnapshot({
        sessionId: ctx.sessionId,
        workingDirectory: ctx.workingDirectory,
      })
      const parts = [
        '# User Notes',
        ...snapshot.userNotes.map(note => `## ${note.title}\nID: ${note.id}\nTasks: ${note.totalTasks}\n\n${note.content}`),
        '# Workspace AI Todo',
        `Tasks: ${snapshot.workspaceAiTodo.totalTasks}\n\n${snapshot.workspaceAiTodo.content}`,
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
})
