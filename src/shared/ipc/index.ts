/**
 * IPC Types Index
 * Unified export of all IPC-related type definitions
 *
 * This file aggregates and re-exports all types from the modular structure,
 * maintaining backward compatibility with existing imports from '../shared/ipc.js'
 */

// IPC Channel Constants
export { IPC_CHANNELS } from './channels.js'

// Tool types
export type {
  GetToolsResponse,
  ExecuteToolRequest,
  ExecuteToolResponse,
  ToolParameter,
  ToolDefinition,
  ToolCall,
  BashToolSettings,
  ToolAgentSettings,
  ToolSettings,
  StreamMessageChunk,
  SendMessageStreamResponse,
} from './tools.js'

// Chat types
export type {
  RetrievedMemory,
  ContentPart,
  StepType,
  Step,
  AttachmentMediaType,
  MessageAttachment,
  ChatMessage,
  ChatSession,
  SendMessageRequest,
  SendMessageResponse,
  EditAndResendRequest,
  EditAndResendResponse,
  GetChatHistoryRequest,
  GetChatHistoryResponse,
  GetSessionsResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  SwitchSessionRequest,
  SwitchSessionResponse,
  DeleteSessionRequest,
  DeleteSessionResponse,
  RenameSessionRequest,
  RenameSessionResponse,
  CreateBranchRequest,
  CreateBranchResponse,
  UpdateSessionPinRequest,
  UpdateSessionPinResponse,
  GenerateTitleRequest,
  GenerateTitleResponse,
} from './chat.js'

// Provider types
export type {
  AIProviderId,
  OAuthFlowType,
  OAuthToken,
  OpenRouterModel,
  ProviderInfo,
  ProviderConfig,
  CustomProviderConfig,
  AISettings,
  ModelType,
  ModelInfo,
  EmbeddingModelInfo,
  CachedModels,
  FetchModelsRequest,
  FetchModelsResponse,
  GetCachedModelsRequest,
  GetCachedModelsResponse,
  GetProvidersResponse,
} from './providers.js'

export { AIProvider } from './providers.js'

// MCP types
export type {
  MCPTransportType,
  MCPServerConfig,
  MCPConnectionStatus,
  MCPToolInfo,
  MCPResourceInfo,
  MCPPromptInfo,
  MCPServerState,
  MCPSettings,
  MCPGetServersResponse,
  MCPAddServerRequest,
  MCPAddServerResponse,
  MCPUpdateServerRequest,
  MCPUpdateServerResponse,
  MCPRemoveServerRequest,
  MCPRemoveServerResponse,
  MCPConnectServerRequest,
  MCPConnectServerResponse,
  MCPDisconnectServerRequest,
  MCPDisconnectServerResponse,
  MCPRefreshServerRequest,
  MCPRefreshServerResponse,
  MCPGetToolsResponse,
  MCPCallToolRequest,
  MCPCallToolResponse,
  MCPGetResourcesResponse,
  MCPReadResourceRequest,
  MCPReadResourceResponse,
  MCPGetPromptsResponse,
  MCPGetPromptRequest,
  MCPGetPromptResponse,
  MCPReadConfigFileRequest,
  MCPReadConfigFileResponse,
} from './mcp.js'

// OAuth types
export type {
  OAuthStartRequest,
  OAuthStartResponse,
  OAuthCallbackRequest,
  OAuthCallbackResponse,
  OAuthStatusRequest,
  OAuthStatusResponse,
  OAuthLogoutRequest,
  OAuthLogoutResponse,
  OAuthDevicePollRequest,
  OAuthDevicePollResponse,
} from './oauth.js'

// Skills types
export type {
  SkillSource,
  SkillDefinition,
  SkillFile,
  SkillSettings,
  GetSkillsResponse,
  RefreshSkillsResponse,
  ReadSkillFileRequest,
  ReadSkillFileResponse,
  OpenSkillDirectoryRequest,
  OpenSkillDirectoryResponse,
  CreateSkillRequest,
  CreateSkillResponse,
} from './skills.js'

// Settings types
export type {
  ColorTheme,
  MessageListDensity,
  BaseTheme,
  KeyboardShortcut,
  ShortcutSettings,
  GeneralSettings,
  ChatSettings,
  EmbeddingProviderType,
  EmbeddingProviderMeta,
  EmbeddingSettings,
  AppSettings,
  GetSettingsResponse,
  SaveSettingsRequest,
  SaveSettingsResponse,
} from './settings.js'

// Theme types
export type {
  ColorValue,
  ThemeDefs,
  ThemeBgColors,
  ThemeTextColors,
  ThemeBorderColors,
  ThemeShadows,
  ThemeEffects,
  ThemeColors,
  Theme,
  ThemeMeta,
  Base46Base30,
  Base46Base16,
  Base46Theme,
  GetThemesResponse,
  GetThemeResponse,
  ApplyThemeResponse,
  RefreshThemesResponse,
} from './themes.js'

// Workspace types
export type {
  WorkspaceAvatar,
  Workspace,
  GetWorkspacesResponse,
  CreateWorkspaceRequest,
  CreateWorkspaceResponse,
  UpdateWorkspaceRequest,
  UpdateWorkspaceResponse,
  DeleteWorkspaceRequest,
  DeleteWorkspaceResponse,
  SwitchWorkspaceRequest,
  SwitchWorkspaceResponse,
  UploadWorkspaceAvatarRequest,
  UploadWorkspaceAvatarResponse,
} from './workspaces.js'

// Shared Agent types (Avatar, Voice, Permissions, Builtin Mode)
export type {
  AgentAvatar,
  AgentVoice,
  SkillPermission,
  AgentPermissions,
  Agent, // @deprecated - use CustomAgent instead
  // Built-in Agent types (Ask/Build mode)
  BuiltinAgentMode,
  BuiltinAgentToolPermissions,
  BuiltinAgent,
  SetBuiltinModeRequest,
  SetBuiltinModeResponse,
} from './agents.js'

// Plan types (Planning workflow)
export type {
  PlanItemStatus,
  PlanItem,
  SessionPlan,
  UpdatePlanRequest,
  UpdatePlanResponse,
  GetPlanRequest,
  GetPlanResponse,
} from './plan.js'

// User Profile types
export type {
  UserFactCategory,
  UserFact,
  UserProfile,
  GetUserProfileResponse,
  AddUserFactRequest,
  AddUserFactResponse,
  UpdateUserFactRequest,
  UpdateUserFactResponse,
  DeleteUserFactRequest,
  DeleteUserFactResponse,
} from './user-profile.js'

// Agent Memory types
export type {
  AgentMemoryCategory,
  MemoryVividness,
  AgentMood,
  AgentMemory,
  AgentUserRelationship,
  GetAgentRelationshipRequest,
  GetAgentRelationshipResponse,
  AddAgentMemoryRequest,
  AddAgentMemoryResponse,
  DeleteAgentMemoryRequest,
  DeleteAgentMemoryResponse,
  RecallAgentMemoryRequest,
  RecallAgentMemoryResponse,
  GetActiveMemoriesRequest,
  GetActiveMemoriesResponse,
  UpdateAgentRelationshipRequest,
  UpdateAgentRelationshipResponse,
  RecordInteractionRequest,
  RecordInteractionResponse,
} from './agent-memory.js'

// Memory Feedback types
export type {
  RecordFeedbackRequest,
  RecordFeedbackResponse,
  GetFeedbackStatsRequest,
  GetFeedbackStatsResponse,
} from './memory-feedback.js'

// Memory Management types
export type {
  MemoryFileInfo,
  TagInfo,
  MemoryStats,
  BatchDeleteResult,
  ExportOptions,
  ImportResult,
  ListFilesResponse,
  GetFileRequest,
  GetFileResponse,
  UpdateFileRequest,
  DeleteFileRequest,
  DeleteFilesRequest,
  DeleteFilesResponse,
  ExportRequest,
  ExportResponse,
  ImportRequest,
  ImportResponse as MemoryImportResponse,
  GetTagsResponse,
  RenameTagRequest,
  RenameTagResponse,
  DeleteTagRequest,
  DeleteTagResponse,
  GetStatsResponse,
  RebuildIndexResponse,
  // Re-exported from memory-text types
  ParsedMemoryFile,
  MemoryFileMetadata,
} from './memory.js'

// Permission types
export type {
  PermissionInfo,
  PermissionResponse,
  PermissionRespondRequest,
  AgentPermissionConfig,
  BashPermissionRules,
} from './permissions.js'

// Custom Agent types
export type {
  CustomToolParameterType,
  CustomToolParameter,
  BashExecution,
  HttpExecution,
  BuiltinExecution,
  CustomToolExecution,
  CustomToolDefinition,
  CustomAgentSource,
  CustomAgent,
  CustomAgentConfig,
  CustomToolResult,
  CustomAgentStep,
  CustomAgentResult,
  GetCustomAgentsRequest,
  GetCustomAgentsResponse,
  InvokeCustomAgentRequest,
  InvokeCustomAgentResponse,
  RefreshCustomAgentsRequest,
  RefreshCustomAgentsResponse,
  CustomAgentJsonFile,
  CreateCustomAgentRequest,
  CreateCustomAgentResponse,
  UpdateCustomAgentRequest,
  UpdateCustomAgentResponse,
  DeleteCustomAgentRequest,
  DeleteCustomAgentResponse,
  // Pin/Unpin types (for sidebar display)
  PinCustomAgentRequest,
  PinCustomAgentResponse,
  UnpinCustomAgentRequest,
  UnpinCustomAgentResponse,
} from './custom-agents.js'

// UIMessage types
export type {
  ToolUIState,
  TextUIPart,
  ReasoningUIPart,
  FileUIPart,
  ToolUIPart,
  StepStartUIPart,
  StepsDataUIPart,
  ErrorDataUIPart,
  UIMessagePart,
  StepUIPart,
  ErrorUIPart,
  MessageMetadata,
  UIMessage,
  UIMessageChunk,
  UIMessagePartChunk,
  TokenUsage,
  SessionTokenUsage,
  UIMessageFinishChunk,
  UIMessageStreamData,
} from './ui-message.js'

export {
  isTextUIPart,
  isReasoningUIPart,
  isToolUIPart,
  isFileUIPart,
  isStepUIPart,
  isErrorUIPart,
  getToolName,
} from './ui-message.js'

// Plugin types
export type {
  PluginSource,
  PluginStatus,
  PluginInfo,
  GetPluginsResponse,
  GetPluginResponse,
  InstallPluginRequest,
  InstallPluginResponse,
  UninstallPluginResponse,
  TogglePluginResponse,
  ReloadPluginResponse,
  UpdatePluginConfigRequest,
  UpdatePluginConfigResponse,
  PluginDirectoriesInfo,
  PluginChannel,
} from './plugins.js'

// File Tree types (for right sidebar file browser)
export type {
  FileTreeNode,
  FileTreeListRequest,
  FileTreeListResponse,
  ExtractedDocument,
  // File Preview types
  FilePreview,
  FileReadRequest,
  FileReadResponse,
} from './file-tree.js'

export { PLUGIN_CHANNELS } from './plugins.js'

// Re-export tool state mapping utilities
export type { LegacyToolStatus } from '../tool-state-mapping.js'

export {
  LEGACY_TO_UI_STATE,
  UI_TO_LEGACY_STATE,
  legacyStatusToUIState,
  uiStateToLegacyStatus,
  isToolInProgress,
  isToolFinished,
  isToolSuccess,
  isToolError,
  isToolWaitingInput,
  isToolWaitingExecution,
} from '../tool-state-mapping.js'
