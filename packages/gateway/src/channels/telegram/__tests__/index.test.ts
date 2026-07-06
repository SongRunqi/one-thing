import { describe, expect, it, vi } from 'vitest'
import {
  TelegramChannel,
  telegramUpdateToInboundMessage,
} from '../index.js'

function createFetchMock() {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ ok: true, result: {} }),
  })) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

describe('TelegramChannel', () => {
  it('maps Telegram text updates to gateway inbound messages', () => {
    expect(telegramUpdateToInboundMessage('telegram', {
      update_id: 1,
      message: {
        message_id: 10,
        date: 123,
        from: {
          id: 7,
          first_name: 'Alice',
          last_name: 'Chen',
          username: 'alice_c',
        },
        chat: { id: 42, type: 'private' },
        text: 'hello',
      },
    })).toEqual({
      channelId: 'telegram',
      userId: '42',
      text: 'hello',
      raw: {
        message_id: 10,
        date: 123,
        from: {
          id: 7,
          first_name: 'Alice',
          last_name: 'Chen',
          username: 'alice_c',
        },
        chat: { id: 42, type: 'private' },
        text: 'hello',
      },
      actor: {
        displayName: 'Alice Chen',
        handle: 'alice_c',
      },
    })

    expect(telegramUpdateToInboundMessage('telegram', {
      update_id: 2,
      message: {
        message_id: 11,
        date: 124,
        chat: { id: 42, type: 'private' },
      },
    })).toBeNull()
  })

  it('sends text and typing through Telegram Bot API calls', async () => {
    const fetchMock = createFetchMock()
    const channel = new TelegramChannel({
      botToken: 'telegram-token',
      apiBaseUrl: 'https://telegram.example',
      fetch: fetchMock,
      logger: {
        error: vi.fn(),
        warn: vi.fn(),
      },
    })

    await channel.send({
      userId: '42',
      text: 'hello',
      raw: {},
    })
    await channel.typing({
      userId: '42',
      raw: {},
    })
    await channel.typing({
      userId: '42',
      raw: {},
      status: 'cancel',
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('https://telegram.example/bottelegram-token/sendMessage')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      chat_id: '42',
      text: 'hello',
    })
    expect(fetchMock.mock.calls[1][0]).toBe('https://telegram.example/bottelegram-token/sendChatAction')
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
      chat_id: '42',
      action: 'typing',
    })
  })
})
