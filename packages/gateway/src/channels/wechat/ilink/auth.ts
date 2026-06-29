import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import {
  getGatewayDataPath,
  deleteGatewayFile,
  readGatewayJsonFile,
  writeGatewayJsonFile,
} from '../../../core/storage.js'

export const DEFAULT_ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com'
const ILINK_APP_ID = 'bot'
const ILINK_CHANNEL_VERSION = '2.4.6'
const ILINK_BOT_AGENT = 'onething-gateway/0.0.0'
const ILINK_APP_CLIENT_VERSION = buildClientVersion(ILINK_CHANNEL_VERSION)
const WECHAT_TOKEN_PATH = getGatewayDataPath('wechat-token.json')
const WECHAT_SYNC_PATH = getGatewayDataPath('wechat-sync.json')

interface TokenFile {
  bot_token?: string
  baseurl?: string
  ilink_user_id?: string
  ilink_bot_id?: string
}

interface SyncFile {
  get_updates_buf?: string
}

export interface WechatAuthState {
  botToken: string
  baseUrl: string
  ilinkUserId?: string
  ilinkBotId?: string
}

interface QRCodeResponse {
  qrcode: string
  qrcode_img_content: string
}

export interface QRCodeStatusResponse {
  status:
    | 'wait'
    | 'scaned'
    | 'confirmed'
    | 'expired'
    | 'scaned_but_redirect'
    | 'need_verifycode'
    | 'verify_code_blocked'
    | 'binded_redirect'
    | 'pending'
    | string
  bot_token?: string
  baseurl?: string
  ilink_user_id?: string
  ilink_bot_id?: string
  redirect_host?: string
}

export function buildBaseInfo(): Record<string, string> {
  return {
    channel_version: ILINK_CHANNEL_VERSION,
    bot_agent: ILINK_BOT_AGENT,
  }
}

export function makeHeaders(botToken?: string): Record<string, string> {
  const uin = Buffer.from(String(randomBytes(4).readUInt32BE(0))).toString('base64')
  return {
    'Content-Type': 'application/json',
    'AuthorizationType': 'ilink_bot_token',
    'X-WECHAT-UIN': uin,
    'iLink-App-Id': ILINK_APP_ID,
    'iLink-App-ClientVersion': String(ILINK_APP_CLIENT_VERSION),
    ...(botToken ? { Authorization: `Bearer ${botToken}` } : {}),
  }
}

export async function getQRCode(): Promise<QRCodeResponse> {
  const response = await fetch(`${DEFAULT_ILINK_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`, {
    headers: makeHeaders(),
  })
  const data = await readIlinkJson(response, 'get_bot_qrcode')

  if (isQRCodeResponse(data)) {
    return data
  }

  console.error('[WechatAuth] Unexpected get_bot_qrcode response:', data)
  throw new Error('Unexpected get_bot_qrcode response')
}

export async function pollQRCodeStatus(qrcode: string, baseUrl = DEFAULT_ILINK_BASE_URL): Promise<QRCodeStatusResponse> {
  const url = new URL(`${baseUrl}/ilink/bot/get_qrcode_status`)
  url.searchParams.set('qrcode', qrcode)

  const response = await fetch(url, {
    headers: makeHeaders(),
  })
  const data = await readIlinkJson(response, 'get_qrcode_status')

  if (isQRCodeStatusResponse(data)) {
    return data
  }

  console.error('[WechatAuth] Unexpected get_qrcode_status response:', data)
  throw new Error('Unexpected get_qrcode_status response')
}

export async function saveAuthState(state: WechatAuthState): Promise<void> {
  writeGatewayJsonFile<TokenFile>(WECHAT_TOKEN_PATH, {
    bot_token: state.botToken,
    baseurl: state.baseUrl,
    ilink_user_id: state.ilinkUserId,
    ilink_bot_id: state.ilinkBotId,
  })
}

export async function loadAuthState(): Promise<WechatAuthState | null> {
  const saved = readGatewayJsonFile<TokenFile | null>(WECHAT_TOKEN_PATH, null)
  if (typeof saved?.bot_token !== 'string' || !saved.bot_token) {
    return null
  }

  return {
    botToken: saved.bot_token,
    baseUrl: typeof saved.baseurl === 'string' && saved.baseurl ? saved.baseurl : DEFAULT_ILINK_BASE_URL,
    ilinkUserId: saved.ilink_user_id,
    ilinkBotId: saved.ilink_bot_id,
  }
}

export async function clearAuthState(): Promise<void> {
  deleteGatewayFile(WECHAT_TOKEN_PATH)
  deleteGatewayFile(WECHAT_SYNC_PATH)
}

export function saveGetUpdatesBuf(getUpdatesBuf: string): void {
  writeGatewayJsonFile<SyncFile>(WECHAT_SYNC_PATH, { get_updates_buf: getUpdatesBuf })
}

export function loadGetUpdatesBuf(): string {
  const saved = readGatewayJsonFile<SyncFile | null>(WECHAT_SYNC_PATH, null)
  return typeof saved?.get_updates_buf === 'string' ? saved.get_updates_buf : ''
}

export async function readIlinkJson(response: Response, label: string): Promise<unknown> {
  const text = await response.text()
  if (!response.ok) {
    console.error(`[iLink] ${label} HTTP ${response.status}:`, text)
    throw new Error(`iLink ${label} failed with HTTP ${response.status}`)
  }

  try {
    return text ? JSON.parse(text) : {}
  } catch (error) {
    console.error(`[iLink] ${label} returned non-JSON response:`, text)
    throw error
  }
}

function isQRCodeResponse(value: unknown): value is QRCodeResponse {
  return isRecord(value)
    && typeof value.qrcode === 'string'
    && typeof value.qrcode_img_content === 'string'
}

function isQRCodeStatusResponse(value: unknown): value is QRCodeStatusResponse {
  return isRecord(value) && typeof value.status === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function buildClientVersion(version: string): number {
  const [major = 0, minor = 0, patch = 0] = version
    .split('.')
    .map(part => Number.parseInt(part, 10))
    .map(part => (Number.isFinite(part) ? part : 0))

  return ((major & 0xFF) << 16) | ((minor & 0xFF) << 8) | (patch & 0xFF)
}
