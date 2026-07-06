import { registerElectronGatewayIpcHandlers } from '@onething/electron-host/ipc/gateway'
import {
  addWechatGatewayAccount,
  getGatewayStatus,
  logoutWechatGateway,
  removeWechatGatewayAccount,
  renameWechatGatewayAccount,
  startGateway,
  stopWechatGatewayAccount,
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
      wechatAddAccount: IPC_CHANNELS.GATEWAY_WECHAT_ADD_ACCOUNT,
      wechatStopAccount: IPC_CHANNELS.GATEWAY_WECHAT_STOP_ACCOUNT,
      wechatRemoveAccount: IPC_CHANNELS.GATEWAY_WECHAT_REMOVE_ACCOUNT,
      wechatRenameAccount: IPC_CHANNELS.GATEWAY_WECHAT_RENAME_ACCOUNT,
    },
    operations: {
      getStatus: () => getGatewayStatus(),
      start: request => startGateway(request),
      stop: () => stopGateway(),
      wechatLogout: request => logoutWechatGateway(request),
      wechatAddAccount: request => addWechatGatewayAccount(request),
      wechatStopAccount: request => stopWechatGatewayAccount(request),
      wechatRemoveAccount: request => removeWechatGatewayAccount(request),
      wechatRenameAccount: request => renameWechatGatewayAccount(request),
    },
  })
}
