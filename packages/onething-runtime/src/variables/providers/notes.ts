import * as fs from 'node:fs/promises'
import type { Stats } from 'node:fs'
import {
  VariableError,
  type ContextVariable,
  type SetInput,
  type VariableContext,
  type VariableProvider,
} from '../types.js'

/**
 * `ai_note_dir` 已退役(2026-08-12):它是 soul-memory 时代的"助手草稿目录",
 * 长期记忆已由 memory-wiki 插件的 memory_write / memory_document 接管,
 * 这个变量再无读者。用户盘上的 ~/.onething/memory 目录原样保留。
 */
export type NoteVarName = 'user_note_dir' | 'work_note_dir'

export interface NotesGateway {
  read(which: NoteVarName): string
  write(which: NoteVarName, path: string): void | Promise<void>
  expandPath(input: string): string
  onChange?(callback: () => void): () => void
}

const NAMES: NoteVarName[] = ['user_note_dir', 'work_note_dir']

const DESC: Record<NoteVarName, string> = {
  user_note_dir: 'Directory where the user keeps their personal notes. The AI may read it; only modify with explicit user permission.',
  work_note_dir: 'Directory where work or project notes are kept. The AI may read it; only modify with explicit user permission.',
}

/**
 * 两个笔记目录。`state: true` —— 判据是"要不要一直在眼前",不是"变得快不快"
 * (§R.3):这两个值几个月都不动一下,但模型每次写笔记都要用它们,不在眼前
 * 就得先花一次工具调用去问自己该往哪写。
 */
export class NotesProvider implements VariableProvider {
  readonly id = 'notes'
  readonly priority = 30

  constructor(private readonly gateway: NotesGateway) {}

  list(_ctx: VariableContext): ContextVariable[] {
    return NAMES.map(name => ({
      name,
      value: this.gateway.read(name),
      scope: 'global',
      description: DESC[name],
      readonly: false,
      state: true,
    }))
  }

  claims(name: string): boolean {
    return (NAMES as readonly string[]).includes(name)
  }

  async set(_ctx: VariableContext, input: SetInput): Promise<ContextVariable> {
    const which = input.name as NoteVarName
    if (!this.claims(which)) {
      throw new VariableError('NOT_FOUND', `NotesProvider does not own "${input.name}"`)
    }

    if (input.value === '') {
      await this.gateway.write(which, '')
      return {
        name: which,
        value: '',
        scope: 'global',
        description: DESC[which],
        readonly: false,
        state: true,
      }
    }

    const resolved = this.gateway.expandPath(input.value)
    let stat: Stats
    try {
      stat = await fs.stat(resolved)
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code
      if (code === 'ENOENT') {
        throw new VariableError('WORKDIR_NOT_FOUND', `Directory does not exist: ${resolved}`)
      }
      throw new VariableError(
        'WORKDIR_NOT_FOUND',
        `Cannot access directory: ${resolved} (${(error as Error)?.message ?? 'unknown error'})`,
      )
    }
    if (!stat.isDirectory()) {
      throw new VariableError('WORKDIR_NOT_FOUND', `Not a directory: ${resolved}`)
    }

    await this.gateway.write(which, resolved)
    return {
      name: which,
      value: resolved,
      scope: 'global',
      description: DESC[which],
      readonly: false,
      state: true,
    }
  }

  onExternalChange(emit: (ctx?: VariableContext) => void): () => void {
    if (!this.gateway.onChange) return () => undefined
    return this.gateway.onChange(() => emit())
  }
}
