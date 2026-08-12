import {
  checkOnethingFileAccess,
  configureOnethingToolSandboxRuntime,
  expandOnethingToolSandboxPath,
  findOnethingReadSandboxRootForPath,
  findOnethingSandboxRootForPath,
  getOnethingDefaultReadRoots,
  getOnethingDownloadsDirectory,
  getOnethingReadSandboxRoots,
  getOnethingToolSandboxBoundary,
  getOnethingToolSandboxRoots,
  isOnethingToolPathContained,
  resolveOnethingToolPath,
  type CoreFileAccessTargetType,
} from '@onething/runtime/tools/sandbox-runtime'
import { getSettings } from '../../stores/settings.js'
import { getToolOutputsDir } from '../../stores/paths.js'
import { getVariablesStore } from '../../variables/store/index.js'

interface SandboxHost {
  getPath?: (name: string) => string
}

let sandboxHost: SandboxHost = {}

let sandboxRuntimeConfigured = false

/** Explicit assembly step (no import-time side effects): wire the tool
 * sandbox runtime to app settings/paths. Called by createOnethingBackend. */
export function configureAppToolSandbox(): void {
  if (sandboxRuntimeConfigured) return
  sandboxRuntimeConfigured = true
  configureOnethingToolSandboxRuntime({
  getDefaultWorkingDirectory: () => getSettings().tools?.bash?.defaultWorkingDirectory,
  getHostPath: name => sandboxHost.getPath?.(name),
  getNoteDirectories: () => {
    const store = getVariablesStore()
    return [store.getUserNoteDir(), store.getWorkNoteDir()]
  },
  // The bash tool's overflow logs ("full output saved to …"): re-reading a
  // tool result already adjudicated by the permission system — never prompt.
  getAppArtifactDirectories: () => [getToolOutputsDir()],
  })
}

export function configureSandboxHost(host: SandboxHost): void {
  sandboxHost = host
}

export const expandPath = expandOnethingToolSandboxPath
export const resolveToolPath = resolveOnethingToolPath
export const isPathContained = isOnethingToolPathContained
export const getSandboxBoundary = getOnethingToolSandboxBoundary
export const getSandboxRoots = getOnethingToolSandboxRoots
export const getDownloadsDirectory = getOnethingDownloadsDirectory
export const getDefaultReadRoots = getOnethingDefaultReadRoots
export const getReadSandboxRoots = getOnethingReadSandboxRoots
export const findSandboxRootForPath = findOnethingSandboxRootForPath
export const findReadSandboxRootForPath = findOnethingReadSandboxRootForPath
export const checkFileAccess = checkOnethingFileAccess

export type { CoreFileAccessTargetType }
