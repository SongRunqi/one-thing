type MaybePromise<T> = T | Promise<T>

export interface UpdateOnethingSessionWorkingDirectoryOptions {
  sessionId: string
  workingDirectory: string | null
  isDirectory(path: string): MaybePromise<boolean>
  writeWorkingDirectory(sessionId: string, workingDirectory: string): MaybePromise<unknown>
}

export interface UpdateOnethingSessionWorkingDirectoryResult {
  success: boolean
  error?: string
}

export async function updateOnethingSessionWorkingDirectory(
  options: UpdateOnethingSessionWorkingDirectoryOptions,
): Promise<UpdateOnethingSessionWorkingDirectoryResult> {
  const workingDirectory = options.workingDirectory

  if (workingDirectory === null || workingDirectory === '') {
    await options.writeWorkingDirectory(options.sessionId, workingDirectory ?? '')
    return { success: true }
  }

  let existsAndIsDirectory = false
  try {
    existsAndIsDirectory = await options.isDirectory(workingDirectory)
  } catch {
    return { success: false, error: `Directory does not exist: ${workingDirectory}` }
  }

  if (!existsAndIsDirectory) {
    return { success: false, error: `Not a directory: ${workingDirectory}` }
  }

  await options.writeWorkingDirectory(options.sessionId, workingDirectory)
  return { success: true }
}
