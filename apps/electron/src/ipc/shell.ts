import { getStorePath } from '@main/stores/paths.js'
import { registerElectronShellIpcHandlers } from './shell-controller.js'

export { registerElectronShellIpcHandlers } from './shell-controller.js'
export type {
  ElectronIpcMainLike,
  ElectronShellIpcChannels,
  ElectronShellIpcEvent,
  ElectronShellIpcOperations,
  RegisterElectronShellIpcHandlersOptions,
} from './shell-controller.js'

export function registerShellHandlers(): void {
  registerElectronShellIpcHandlers({
    getDataPath: () => getStorePath(),
  })
}
