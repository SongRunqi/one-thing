import type {
  ChatMessage,
  ChatSession,
  AISettings,
  AppSettings,
  AIProvider,
  ProviderConfig,
  ModelInfo,
  SendMessageResponse,
  GetChatHistoryResponse,
  GetSessionsResponse,
  CreateSessionResponse,
  SwitchSessionResponse,
  DeleteSessionResponse,
  RenameSessionResponse,
  CreateBranchResponse,
  GetSettingsResponse,
  SaveSettingsResponse,
  GenerateTitleResponse,
  FetchModelsResponse,
  GetCachedModelsResponse,
} from '../../shared/ipc'

export type { ChatMessage, ChatSession, AISettings, AppSettings, AIProvider, ProviderConfig, ModelInfo }

export interface ElectronAPI {
  sendMessage: (sessionId: string, message: string) => Promise<SendMessageResponse>
  getChatHistory: (sessionId: string) => Promise<GetChatHistoryResponse>
  generateTitle: (message: string) => Promise<GenerateTitleResponse>
  getSessions: () => Promise<GetSessionsResponse>
  createSession: (name: string) => Promise<CreateSessionResponse>
  switchSession: (sessionId: string) => Promise<SwitchSessionResponse>
  deleteSession: (sessionId: string) => Promise<DeleteSessionResponse>
  renameSession: (sessionId: string, newName: string) => Promise<RenameSessionResponse>
  createBranch: (parentSessionId: string, branchFromMessageId: string) => Promise<CreateBranchResponse>
  getSettings: () => Promise<GetSettingsResponse>
  saveSettings: (settings: AppSettings) => Promise<SaveSettingsResponse>
  fetchModels: (
    provider: AIProvider,
    apiKey: string,
    baseUrl?: string,
    forceRefresh?: boolean
  ) => Promise<FetchModelsResponse>
  getCachedModels: (provider: AIProvider) => Promise<GetCachedModelsResponse>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
