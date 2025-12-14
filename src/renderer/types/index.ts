import type {
  ChatMessage,
  ChatSession,
  AISettings,
  AppSettings,
  AIProvider,
  SendMessageResponse,
  GetChatHistoryResponse,
  GetSessionsResponse,
  CreateSessionResponse,
  SwitchSessionResponse,
  DeleteSessionResponse,
  RenameSessionResponse,
  GetSettingsResponse,
  SaveSettingsResponse,
  GenerateTitleResponse,
  EditAndResendResponse,
  CreateBranchResponse,
} from '../../shared/ipc'

export type { ChatMessage, ChatSession, AISettings, AppSettings, AIProvider }

export interface ElectronAPI {
  sendMessage: (sessionId: string, message: string) => Promise<SendMessageResponse>
  getChatHistory: (sessionId: string) => Promise<GetChatHistoryResponse>
  generateTitle: (message: string) => Promise<GenerateTitleResponse>
  editAndResend: (sessionId: string, messageId: string, newContent: string) => Promise<EditAndResendResponse>
  getSessions: () => Promise<GetSessionsResponse>
  createSession: (name: string) => Promise<CreateSessionResponse>
  switchSession: (sessionId: string) => Promise<SwitchSessionResponse>
  deleteSession: (sessionId: string) => Promise<DeleteSessionResponse>
  renameSession: (sessionId: string, newName: string) => Promise<RenameSessionResponse>
  createBranch: (parentSessionId: string, branchFromMessageId: string) => Promise<CreateBranchResponse>
  getSettings: () => Promise<GetSettingsResponse>
  saveSettings: (settings: AppSettings) => Promise<SaveSettingsResponse>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
