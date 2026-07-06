export type GatewayChannelId = 'wechat'

export type GatewayWechatLoginStatus =
  | 'idle'
  | 'waiting-for-scan'
  | 'scanned'
  | 'confirmed'
  | 'logged-in'
  | 'expired'
  | 'error'

export interface GatewayWechatStatus {
  id?: string
  label?: string
  enabled: boolean
  running: boolean
  loginStatus: GatewayWechatLoginStatus
  qrUrl?: string
  loggedIn: boolean
  accountId?: string
  botId?: string
  baseUrl?: string
  lastError?: string
  lastUpdatedAt?: number
}

export interface GatewayWechatAccountStatus extends GatewayWechatStatus {
  id: string
}

export interface GatewayStatus {
  running: boolean
  starting: boolean
  stopping: boolean
  enabled: boolean
  lastError?: string
  wechat: GatewayWechatStatus
  wechatAccounts?: GatewayWechatAccountStatus[]
}

export interface GatewayGetStatusResponse {
  success: boolean
  status?: GatewayStatus
  error?: string
}

export interface GatewayStartRequest {
  channel?: GatewayChannelId
  accountId?: string
}

export interface GatewayWechatAddAccountRequest {
  label?: string
}

export interface GatewayWechatRemoveAccountRequest {
  accountId: string
}

export interface GatewayWechatStopAccountRequest {
  accountId: string
}

export interface GatewayWechatLogoutRequest {
  accountId?: string
}

export interface GatewayWechatRenameAccountRequest {
  accountId: string
  label?: string
}

export interface GatewayStartResponse {
  success: boolean
  status?: GatewayStatus
  error?: string
}

export interface GatewayStopResponse {
  success: boolean
  status?: GatewayStatus
  error?: string
}

export interface GatewayWechatLogoutResponse {
  success: boolean
  status?: GatewayStatus
  error?: string
}

export interface GatewayWechatAddAccountResponse {
  success: boolean
  status?: GatewayStatus
  account?: GatewayWechatAccountStatus
  error?: string
}

export interface GatewayWechatRemoveAccountResponse {
  success: boolean
  status?: GatewayStatus
  error?: string
}

export interface GatewayWechatStopAccountResponse {
  success: boolean
  status?: GatewayStatus
  error?: string
}

export interface GatewayWechatRenameAccountResponse {
  success: boolean
  status?: GatewayStatus
  account?: GatewayWechatAccountStatus
  error?: string
}
