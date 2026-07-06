import {
  createElectronGatewayLifecycle,
  type ElectronGatewayLifecycle,
  type ElectronGatewayLifecycleOptions,
} from './lifecycle-controller.js'

export { createElectronGatewayLifecycle } from './lifecycle-controller.js'
export type {
  ElectronGatewayLifecycle,
  ElectronGatewayLifecycleOptions,
} from './lifecycle-controller.js'

let gatewayLifecycle: ElectronGatewayLifecycle | null = null

export function configureGatewayLifecycle(
  options: ElectronGatewayLifecycleOptions,
): ElectronGatewayLifecycle {
  gatewayLifecycle = createElectronGatewayLifecycle(options)
  return gatewayLifecycle
}

export function isGatewayEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return getGatewayLifecycle().isGatewayEnabled(env)
}

export function getGatewayStatus() {
  return getGatewayLifecycle().getStatus()
}

export async function initializeGateway(): Promise<void> {
  await getGatewayLifecycle().initializeGateway()
}

export async function applyGatewaySettings(settings: Parameters<ElectronGatewayLifecycle['applySettings']>[0]) {
  return getGatewayLifecycle().applySettings(settings)
}

export async function startGateway(request?: Parameters<ElectronGatewayLifecycle['startGateway']>[0]) {
  return getGatewayLifecycle().startGateway(request)
}

export async function stopGateway() {
  return getGatewayLifecycle().stopGateway()
}

export async function logoutWechatGateway(request?: Parameters<ElectronGatewayLifecycle['logoutWechat']>[0]) {
  return getGatewayLifecycle().logoutWechat(request)
}

export async function addWechatGatewayAccount(request?: Parameters<ElectronGatewayLifecycle['addWechatAccount']>[0]) {
  return getGatewayLifecycle().addWechatAccount(request)
}

export async function stopWechatGatewayAccount(request: Parameters<ElectronGatewayLifecycle['stopWechatAccount']>[0]) {
  return getGatewayLifecycle().stopWechatAccount(request)
}

export async function removeWechatGatewayAccount(request: Parameters<ElectronGatewayLifecycle['removeWechatAccount']>[0]) {
  return getGatewayLifecycle().removeWechatAccount(request)
}

export async function renameWechatGatewayAccount(request: Parameters<ElectronGatewayLifecycle['renameWechatAccount']>[0]) {
  return getGatewayLifecycle().renameWechatAccount(request)
}

export async function shutdownGateway(): Promise<void> {
  await gatewayLifecycle?.shutdownGateway()
}

function getGatewayLifecycle(): ElectronGatewayLifecycle {
  if (!gatewayLifecycle) {
    throw new Error('[Gateway] Electron lifecycle not configured. Call configureGatewayLifecycle() first.')
  }
  return gatewayLifecycle
}
