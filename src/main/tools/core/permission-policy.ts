import * as PermissionGrants from '../../permission/permission-grants.js'
import { Permission } from '../../permission/index.js'
import {
  createOnethingPermissionRuntime,
} from '@onething/runtime/permissions'
import type {
  EnforcePermissionPolicyInput,
  PermissionPolicyInput,
} from '@onething/runtime/permissions'

const permissionRuntime = createOnethingPermissionRuntime({
  grantMatcher: PermissionGrants.matchGrant,
  permissionBridge: Permission,
})

export function decidePermission(input: PermissionPolicyInput) {
  return permissionRuntime.decide(input)
}

export async function enforcePermissionPolicy(input: EnforcePermissionPolicyInput): Promise<void> {
  await permissionRuntime.enforce(input)
}

export type {
  EnforcePermissionPolicyInput,
  PermissionEffect,
  PermissionGrantMatcher,
  PermissionBridge,
  PermissionMetadata,
  PermissionPolicyDecision,
  PermissionPolicyInput,
  PermissionPolicyMode,
  PermissionPolicyResult,
  PermissionPreview,
} from '@onething/runtime/permissions'
