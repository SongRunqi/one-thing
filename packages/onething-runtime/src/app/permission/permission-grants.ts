import { configureOnethingPermissionGrantStorage } from '@onething/runtime/permissions'
import { getPermissionsDir, readJsonFile, writeJsonFile } from '../stores/paths.js'
import { registerBuiltinCapabilities } from './capabilities.js'

let permissionGrantsConfigured = false

/** Explicit assembly step: grant storage paths + builtin capability set. */
export function configureAppPermissionGrants(): void {
  if (permissionGrantsConfigured) return
  permissionGrantsConfigured = true
  configureOnethingPermissionGrantStorage({
    getPermissionsDir,
    readJsonFile,
    writeJsonFile,
  })
  registerBuiltinCapabilities()
}

export {
  addGrant,
  clearSessionGrants,
  clearWorkspaceGrants,
  configureOnethingPermissionGrantStorage,
  configurePermissionGrantFileStorage,
  configurePermissionGrantStorage,
  createPermissionGrantFileStorage,
  getPermissionWorkspaceGrantsPath,
  listSessionGrants,
  listWorkspaceGrants,
  matchGrant,
  resetPermissionGrantsForTests,
  revokeGrant,
} from '@onething/runtime/permissions'
export type {
  OnethingPermissionGrantStorageAdapters,
  PermissionGrant,
  PermissionGrantFileStorageAdapters,
  PermissionGrantInput,
  PermissionGrantMatchInput,
  PermissionGrantScope,
  PermissionGrantStorage,
  PermissionGrantWorkspaceFile,
} from '@onething/runtime/permissions'
