import { buildBaseInfo, DEFAULT_ILINK_BASE_URL, makeHeaders, readIlinkJson, type WechatAuthState } from './auth.js'

const MAX_TEXT_LENGTH = 2000

export async function sendText(
  auth: WechatAuthState,
  toUserId: string,
  contextToken: string,
  text: string,
): Promise<void> {
  for (const segment of splitText(text, MAX_TEXT_LENGTH)) {
    const response = await fetch(`${auth.baseUrl || DEFAULT_ILINK_BASE_URL}/ilink/bot/sendmessage`, {
      method: 'POST',
      headers: makeHeaders(auth.botToken),
      body: JSON.stringify({
        msg: {
          from_user_id: '',
          to_user_id: toUserId,
          client_id: createClientId(),
          message_type: 2,
          message_state: 2,
          context_token: contextToken,
          item_list: [{ type: 1, text_item: { text: segment } }],
        },
        base_info: buildBaseInfo(),
      }),
    })
    const data = await readIlinkJson(response, 'sendmessage')
    if (isRecord(data) && typeof data.ret === 'number' && data.ret !== 0) {
      throw new Error(`sendmessage ret=${data.ret} errmsg=${typeof data.errmsg === 'string' ? data.errmsg : ''}`)
    }
  }
}

export async function sendTyping(
  auth: WechatAuthState,
  toUserId: string,
  contextToken?: string,
): Promise<void> {
  try {
    const baseUrl = auth.baseUrl || DEFAULT_ILINK_BASE_URL
    const ilinkUserId = toUserId
    const configResponse = await fetch(`${baseUrl}/ilink/bot/getconfig`, {
      method: 'POST',
      headers: makeHeaders(auth.botToken),
      body: JSON.stringify({
        ilink_user_id: ilinkUserId,
        context_token: contextToken,
        base_info: buildBaseInfo(),
      }),
    })
    const config = await readIlinkJson(configResponse, 'getconfig')

    if (!isRecord(config) || typeof config.typing_ticket !== 'string') {
      console.error('[WechatSender] Unexpected getconfig response:', config)
      return
    }

    const typingResponse = await fetch(`${baseUrl}/ilink/bot/sendtyping`, {
      method: 'POST',
      headers: makeHeaders(auth.botToken),
      body: JSON.stringify({
        ilink_user_id: ilinkUserId,
        typing_ticket: config.typing_ticket,
        status: 1,
        base_info: buildBaseInfo(),
      }),
    })
    await readIlinkJson(typingResponse, 'sendtyping')
  } catch (error) {
    console.warn('[WechatSender] Failed to send typing:', error)
  }
}

function splitText(text: string, maxLength: number): string[] {
  const segments: string[] = []
  for (let index = 0; index < text.length; index += maxLength) {
    segments.push(text.slice(index, index + maxLength))
  }
  return segments.length ? segments : ['']
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function createClientId(): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `onething-gateway-${id}`
}
