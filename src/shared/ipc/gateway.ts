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

export interface GatewayStatus {
  running: boolean
  starting: boolean
  stopping: boolean
  enabled: boolean
  lastError?: string
  wechat: GatewayWechatStatus
}

export interface GatewayGetStatusResponse {
  success: boolean
  status?: GatewayStatus
  error?: string
}

export interface GatewayStartRequest {
  channel?: GatewayChannelId
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
