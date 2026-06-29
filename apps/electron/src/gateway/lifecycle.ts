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

export async function logoutWechatGateway() {
  return getGatewayLifecycle().logoutWechat()
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
