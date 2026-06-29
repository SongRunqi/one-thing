import { registerElectronGatewayIpcHandlers } from '@onething/electron-host/ipc/gateway'
import {
  getGatewayStatus,
  logoutWechatGateway,
  startGateway,
  stopGateway,
} from '@onething/electron-host/gateway/lifecycle'
import { IPC_CHANNELS } from '../../shared/ipc.js'

export function registerGatewayHandlers(): void {
  registerElectronGatewayIpcHandlers({
    channels: {
      getStatus: IPC_CHANNELS.GATEWAY_GET_STATUS,
      start: IPC_CHANNELS.GATEWAY_START,
      stop: IPC_CHANNELS.GATEWAY_STOP,
      wechatLogout: IPC_CHANNELS.GATEWAY_WECHAT_LOGOUT,
    },
    operations: {
      getStatus: () => getGatewayStatus(),
      start: request => startGateway(request),
      stop: () => stopGateway(),
      wechatLogout: () => logoutWechatGateway(),
    },
  })
}
