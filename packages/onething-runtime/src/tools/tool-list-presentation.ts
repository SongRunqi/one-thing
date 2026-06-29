type MaybePromise<T> = T | Promise<T>

export interface OnethingToolListIpcLogger {
  error?: (...args: unknown[]) => void
}

export type OnethingVisibleToolSource = 'builtin' | 'plugin' | 'mcp'

export interface OnethingVisibleToolLike {
  id: string
  source?: OnethingVisibleToolSource | string
}

export interface OnethingToolSessionListItemLike {
  id: string
}

export interface OnethingToolSessionContextLike {
  workingDirectory?: string
  workingDirectoryRoots?: unknown[]
}

export interface OnethingToolInitContext {
  workingDirectory: string
  workingDirectoryRoots: unknown[]
}

export interface ListOnethingSettingsToolsOptions<
  TTool extends OnethingVisibleToolLike = OnethingVisibleToolLike,
  TSessionListItem extends OnethingToolSessionListItemLike = OnethingToolSessionListItemLike,
  TSession extends OnethingToolSessionContextLike = OnethingToolSessionContextLike,
> {
  getSessionsList(): TSessionListItem[]
  getSession(sessionId: string): TSession | null | undefined
  getAllToolsAsync(): MaybePromise<TTool[]>
  getMCPRouterToolDefinition(): TTool | null | undefined
  setInitContext(context: OnethingToolInitContext): MaybePromise<unknown>
  cwd(): string
}

export type OnethingVisibleTool<TTool extends OnethingVisibleToolLike = OnethingVisibleToolLike> =
  TTool & { source: OnethingVisibleToolSource }

export async function listOnethingSettingsTools<
  TTool extends OnethingVisibleToolLike,
  TSessionListItem extends OnethingToolSessionListItemLike,
  TSession extends OnethingToolSessionContextLike,
>(
  options: ListOnethingSettingsToolsOptions<TTool, TSessionListItem, TSession>,
): Promise<Array<OnethingVisibleTool<TTool>>> {
  const sessionsList = options.getSessionsList()
  const firstSession = sessionsList.length > 0
    ? options.getSession(sessionsList[0].id)
    : undefined
  const workingDirectory = firstSession?.workingDirectory ?? options.cwd()
  const workingDirectoryRoots = firstSession?.workingDirectoryRoots ?? []

  await options.setInitContext({
    workingDirectory,
    workingDirectoryRoots,
  })

  const allTools = await options.getAllToolsAsync()
  const visibleTools = allTools
    .filter(tool => !tool.id.startsWith('mcp:'))
    .map(tool => ({
      ...tool,
      source: tool.id.startsWith('plugin:') ? 'plugin' : 'builtin',
    }) as OnethingVisibleTool<TTool>)

  const mcpRouterTool = options.getMCPRouterToolDefinition()
  if (mcpRouterTool && !visibleTools.some(tool => tool.id === mcpRouterTool.id)) {
    visibleTools.push({
      ...mcpRouterTool,
      source: 'mcp',
    } as OnethingVisibleTool<TTool>)
  }

  return visibleTools
}

export async function listOnethingSettingsToolsForIpc<
  TTool extends OnethingVisibleToolLike,
  TSessionListItem extends OnethingToolSessionListItemLike,
  TSession extends OnethingToolSessionContextLike,
>(
  options: ListOnethingSettingsToolsOptions<TTool, TSessionListItem, TSession> & {
    logger?: OnethingToolListIpcLogger
  },
): Promise<
  | { success: true; tools: Array<OnethingVisibleTool<TTool>> }
  | { success: false; error: string }
> {
  try {
    return {
      success: true,
      tools: await listOnethingSettingsTools(options),
    }
  } catch (error) {
    options.logger?.error?.('[Tools IPC] Error getting tools:', error)
    return {
      success: false,
      error: error instanceof Error && error.message ? error.message : 'Failed to get tools',
    }
  }
}
