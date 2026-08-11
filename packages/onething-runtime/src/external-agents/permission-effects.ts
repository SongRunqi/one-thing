/**
 * **外部工具的副作用面**(P0-4,`docs/audit/claude-code-sdk-audit-2026-08-11.md`)。
 *
 * 在此之前,SDK 会话里的每一次工具调用只合成**一个**以工具名为资源的
 * `external-agent` effect:审批卡上写「Claude Code: Bash」,grant 记的也是
 * 「Bash」。于是一次「总是允许 Bash」等于此后**任何命令**免审 —— 而同一条
 * `rm -rf ./dist` 在本地会话里是按 `rm *` 记的。粒度差一档,信任面就差一个量级。
 *
 * 这里做的事只有一件:把 SDK 的 `(toolName, input)` 翻成与**本地工具逐字同形**的
 * effect,交给同一扇策略门。命令分析不在这里重写,而是调本地 bash 工具用的那一个
 * (`../tools/permission-effects.js` 的 `analyzeBashPermission`);文件工具的越界位
 * (`external`)也用本地那套沙箱判据算出来 —— 批 1 刚修的 auto-accept 判据正是只
 * 看这一位(`core/permission/permission-policy.ts:146`),立不起来就等于外部会话的
 * 越界写在 `auto-accept-edits` 下一张卡都不弹。
 *
 * **认不出的工具名维持现状**:返回 `undefined`,调用方回落到工具名粒度的
 * `external-agent` effect。不认识不等于放行 —— 这里没有 fail-open 的分支。
 *
 * 工具名与 input 形状核自 `@anthropic-ai/claude-agent-sdk` 的 `sdk-tools.d.ts`:
 * `BashInput.command`、`FileReadInput/FileWriteInput/FileEditInput.file_path`、
 * `NotebookEditInput.notebook_path`。`MultiEdit` 在当前这版 d.ts 里已经没有独立的
 * input 类型(`Edit` 用 `replace_all` 吸收了它),这里仍留一行:老版本 CLI 还会发
 * 这个名字,而它的 `file_path` 位置是一样的。
 */

import { basenamePath, joinPaths, dirnamePath } from '@onething/core/storage'
import type { ToolEffect, ToolPreview } from '@onething/core/tools'
import {
  analyzeBashPermission,
  filePermissionPattern,
} from '../tools/permission-effects.js'
import {
  findCoreReadSandboxRootForPath,
  findCoreSandboxRootForPath,
  getCoreSandboxBoundary,
  getCoreSandboxRoots,
  resolveCoreToolPath,
} from '../tools/sandbox.js'
import { classifySensitiveFile } from '../tools/sensitive-files.js'

export interface ExternalToolPermissionInput {
  /** SDK 侧的工具名,未归一化(宿主工具不会走到这里,它们在连接器里就分家了)。 */
  toolName: string
  input: unknown
  /** 这次外部会话的工作目录;缺席时退回进程 cwd(与本地工具同一条兜底)。 */
  cwd?: string
}

export interface ExternalToolPermissionShape {
  effects: ToolEffect[]
  /**
   * 缺席是有意的:`titleForEffect` 会按 effect 种类给出与本地同款的标题
   * (`Write file: …` / `Read sensitive file: …` / `Access directory outside project: …`)。
   * 只有 bash 例外 —— 本地卡的标题是命令原文,这里照抄。
   */
  preview?: ToolPreview
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function readStringField(input: unknown, ...names: string[]): string | undefined {
  const record = asRecord(input)
  if (!record) return undefined
  for (const name of names) {
    const value = record[name]
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  return undefined
}

export function describeExternalToolPermission(
  input: ExternalToolPermissionInput,
): ExternalToolPermissionShape | undefined {
  const sandbox = { workingDirectory: input.cwd }

  switch (input.toolName) {
    case 'Bash': {
      const command = readStringField(input.input, 'command')
      if (!command) return undefined
      return analyzeBashPermission({
        command,
        workingDirectory: getCoreSandboxBoundary(sandbox),
        sandboxRoots: getCoreSandboxRoots(sandbox),
      })
    }

    case 'Read': {
      const path = readStringField(input.input, 'file_path')
      return path ? describeRead(resolveCoreToolPath(path, sandbox), sandbox) : undefined
    }

    case 'Write': {
      const path = readStringField(input.input, 'file_path')
      return path
        ? describeFileMutation('file_write', resolveCoreToolPath(path, sandbox), sandbox)
        : undefined
    }

    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit': {
      const path = readStringField(input.input, 'file_path', 'notebook_path')
      return path
        ? describeFileMutation('file_edit', resolveCoreToolPath(path, sandbox), sandbox)
        : undefined
    }

    default:
      return undefined
  }
}

/** 与 `tools/builtin/read.ts` 的 analyze 逐条对齐(越界目录 + 敏感文件两位)。 */
function describeRead(
  resolvedPath: string,
  sandbox: { workingDirectory?: string },
): ExternalToolPermissionShape {
  const boundary = getCoreSandboxBoundary(sandbox)
  const matchedRoot = findCoreReadSandboxRootForPath(resolvedPath, sandbox)
  const sensitivity = classifySensitiveFile(resolvedPath)
  const effects: ToolEffect[] = []

  if (!matchedRoot) {
    effects.push({
      kind: 'external_directory',
      resources: [joinPaths(dirnamePath(resolvedPath), '*')],
      barrier: true,
      external: true,
      metadata: {
        path: resolvedPath,
        boundary,
        operation: 'Read file',
        targetType: 'file',
      },
    })
  }

  effects.push({
    kind: sensitivity.sensitive ? 'sensitive_file_read' : 'read',
    resources: [resolvedPath],
    barrier: sensitivity.sensitive,
    sensitive: sensitivity.sensitive,
    metadata: sensitivity.sensitive
      ? { path: resolvedPath, category: sensitivity.category, reason: sensitivity.reason }
      : { path: resolvedPath },
  })

  return {
    effects,
    preview: {
      title: sensitivity.sensitive
        ? `Read sensitive file: ${basenamePath(resolvedPath)}`
        : `Read ${basenamePath(resolvedPath)}`,
      path: resolvedPath,
    },
  }
}

/**
 * 与 `tools/builtin/write.ts` / `edit.ts` 的 analyze 同形:资源粒度是**所在目录**,
 * `external` 位由沙箱根算出。
 *
 * 少的只有 diff 那一层(additions / deletions / originalContentHash):那几个字段
 * 来自本地工具**自己算出来的那份改动计划**,而这一次改动是 CLI 进程去做的,我们
 * 手里没有计划。凭一次自己的读盘去补一份可能与实际不符的 diff,是把「看得见」换成
 * 「看错了」—— 不补。
 */
function describeFileMutation(
  kind: 'file_write' | 'file_edit',
  resolvedPath: string,
  sandbox: { workingDirectory?: string },
): ExternalToolPermissionShape {
  const boundary = getCoreSandboxBoundary(sandbox)
  const matchedRoot = findCoreSandboxRootForPath(resolvedPath, sandbox)
  return {
    effects: [{
      kind,
      resources: [filePermissionPattern(resolvedPath)],
      barrier: true,
      external: !matchedRoot,
      metadata: {
        path: resolvedPath,
        isExternal: !matchedRoot,
        ...(matchedRoot ? {} : { boundary }),
      },
    }],
  }
}
