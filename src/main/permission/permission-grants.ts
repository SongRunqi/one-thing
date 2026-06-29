import { configureOnethingPermissionGrantStorage } from '@onething/runtime/permissions'
import { getPermissionsDir, readJsonFile, writeJsonFile } from '../stores/paths.js'

configureOnethingPermissionGrantStorage({
  getPermissionsDir,
  readJsonFile,
  writeJsonFile,
})

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
