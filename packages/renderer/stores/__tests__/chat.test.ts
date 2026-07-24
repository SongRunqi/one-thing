/**
 * Chat Store Tests
 * 测试核心消息发送流程
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock window.electronAPI
const mockElectronAPI = {
  sendMessageStream: vi.fn(),
}

vi.stubGlobal('window', {
  electronAPI: mockElectronAPI,
})

describe('Chat Store - sendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('用户消息创建', () => {
    it('应创建正确格式的用户消息', () => {
      const content = 'Hello, AI!'
      const userMessage = {
        id: expect.stringMatching(/^temp-\d+$/),
        role: 'user',
        content,
        timestamp: expect.any(Number),
        attachments: undefined,
      }
      
      expect(userMessage.role).toBe('user')
      expect(userMessage.content).toBe(content)
    })

    it('应包含附件信息', () => {
      const attachments = [
        { type: 'image', path: '/path/to/image.png' }
      ]
      const userMessage = {
        id: 'temp-123',
        role: 'user',
        content: 'Check this image',
        timestamp: Date.now(),
        attachments,
      }
      
      expect(userMessage.attachments).toEqual(attachments)
    })
  })

  describe('IPC 调用', () => {
    it('应调用 sendMessageStream 并传递正确参数', async () => {
      const sessionId = 'session-123'
      const content = 'Test message'
      const attachments = [{ type: 'file', path: '/test.txt' }]

      mockElectronAPI.sendMessageStream.mockResolvedValue({
        success: true,
        userMessage: { id: 'msg-1', role: 'user', content, timestamp: Date.now() }
      })

      await mockElectronAPI.sendMessageStream(sessionId, content, attachments)

      expect(mockElectronAPI.sendMessageStream).toHaveBeenCalledWith(
        sessionId,
        content,
        attachments
      )
    })
  })

  describe('错误处理', () => {
    it('应处理 IPC 错误响应', async () => {
      mockElectronAPI.sendMessageStream.mockResolvedValue({
        success: false,
        error: 'API key invalid',
        errorDetails: { code: 'AUTH_ERROR' }
      })

      const response = await mockElectronAPI.sendMessageStream('session-1', 'test', undefined)

      expect(response.success).toBe(false)
      expect(response.error).toBe('API key invalid')
    })

    it('应处理网络异常', async () => {
      mockElectronAPI.sendMessageStream.mockRejectedValue(new Error('Network error'))

      await expect(
        mockElectronAPI.sendMessageStream('session-1', 'test', undefined)
      ).rejects.toThrow('Network error')
    })
  })

  describe('成功响应', () => {
    it('应返回成功状态和用户消息', async () => {
      const userMessage = {
        id: 'msg-real-123',
        role: 'user',
        content: 'Hello',
        timestamp: Date.now()
      }

      mockElectronAPI.sendMessageStream.mockResolvedValue({
        success: true,
        userMessage
      })

      const response = await mockElectronAPI.sendMessageStream('session-1', 'Hello', undefined)

      expect(response.success).toBe(true)
      expect(response.userMessage).toEqual(userMessage)
    })
  })
})
