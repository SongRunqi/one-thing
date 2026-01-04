# 认证服务 (Auth Service)

## 概述

认证服务处理 OAuth-based AI Provider 的认证流程，主要支持：
- **Claude Code (Anthropic)**：PKCE 授权码流程
- **GitHub Copilot**：Device Flow 设备流程

使用 Electron 的 `safeStorage` API 安全存储 Token。

## 目录结构

```
src/main/services/auth/
├── index.ts           # 统一导出
└── oauth-manager.ts   # OAuth 管理器
```

## OAuth Manager

### 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                         OAuthManager                             │
├─────────────────────────────────────────────────────────────────┤
│  Provider Configs                                                │
│  ┌───────────────────┐  ┌───────────────────┐                  │
│  │   Claude Code     │  │  GitHub Copilot   │                  │
│  │   (PKCE Flow)     │  │  (Device Flow)    │                  │
│  └───────────────────┘  └───────────────────┘                  │
├─────────────────────────────────────────────────────────────────┤
│  Token Storage (safeStorage)                                    │
│  - Encrypted storage using OS keychain                          │
│  - Fallback to plain JSON if encryption unavailable             │
└─────────────────────────────────────────────────────────────────┘
```

### Provider 配置

```typescript
interface OAuthProviderConfig {
  clientId: string
  authorizationUrl: string
  tokenUrl: string
  redirectUri: string
  scopes: string[]
  deviceCodeUrl?: string  // Device Flow 专用
  refreshUrl?: string     // Token 刷新端点
}
```

**Claude Code 配置**：

```typescript
const CLAUDE_CODE_CONFIG: OAuthProviderConfig = {
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  authorizationUrl: 'https://claude.ai/oauth/authorize',
  tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
  redirectUri: 'https://console.anthropic.com/oauth/code/callback',
  scopes: ['org:create_api_key', 'user:profile', 'user:inference'],
}
```

**GitHub Copilot 配置**：

```typescript
const GITHUB_COPILOT_CONFIG: OAuthProviderConfig = {
  clientId: 'Iv1.b507a08c87ecfe98', // VSCode CLI client ID
  authorizationUrl: 'https://github.com/login/device',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  deviceCodeUrl: 'https://github.com/login/device/code',
  redirectUri: '',  // Device flow 不需要
  scopes: ['copilot'],
}
```

### OAuth Token 类型

```typescript
interface OAuthToken {
  accessToken: string
  refreshToken?: string
  expiresAt: number      // 过期时间戳
  tokenType: string      // 'Bearer'
  scope?: string
}
```

## 认证流程

### 1. PKCE Flow (Claude Code)

```
用户点击登录
      │
      ▼
┌─────────────────────────┐
│  生成 PKCE 参数          │
│  - code_verifier        │
│  - code_challenge       │
│  - state (= verifier)   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  打开浏览器授权页面      │
│  claude.ai/oauth/...    │
└───────────┬─────────────┘
            │
    用户在浏览器中授权
            │
            ▼
┌─────────────────────────┐
│  显示授权码页面          │
│  用户复制 code#state    │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  用户粘贴到应用          │
│  (输入框在设置页面)      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Token Exchange         │
│  code + verifier → token│
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  加密存储 Token          │
│  safeStorage            │
└─────────────────────────┘
```

### 2. Device Flow (GitHub Copilot)

```
用户点击登录
      │
      ▼
┌─────────────────────────┐
│  请求 Device Code        │
│  POST /login/device/code│
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  显示 User Code          │
│  + 验证 URL              │
│  (用户手动打开浏览器)    │
└───────────┬─────────────┘
            │
┌───────────┴────────────┐
│                        │
▼                        ▼
用户在浏览器            应用轮询
输入 code              Token 端点
│                        │
└───────────┬────────────┘
            │
            ▼
┌─────────────────────────┐
│  获取 Token             │
│  (轮询成功时)           │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  加密存储 Token          │
└─────────────────────────┘
```

## API 参考

### 基础方法

```typescript
class OAuthManager {
  // 获取 Provider 配置
  getConfig(providerId: string): OAuthProviderConfig | null

  // 检查登录状态
  async isLoggedIn(providerId: string): Promise<boolean>

  // 获取 Token
  async getToken(providerId: string): Promise<OAuthToken | null>

  // 删除 Token (登出)
  async deleteToken(providerId: string): Promise<void>
}
```

### PKCE Flow 方法

```typescript
class OAuthManager {
  // 生成 PKCE 参数
  generatePKCE(): { codeVerifier: string; codeChallenge: string }

  // 构建授权 URL
  buildAuthorizationUrl(providerId: string): { authUrl: string; state: string } | null

  // 交换授权码为 Token
  async exchangeCodeForToken(
    providerId: string,
    code: string,
    state: string
  ): Promise<OAuthToken>
}
```

### Device Flow 方法

```typescript
class OAuthManager {
  // 开始设备流程
  async startDeviceFlow(providerId: string): Promise<{
    userCode: string        // 显示给用户的代码
    verificationUri: string // 用户访问的 URL
    expiresIn: number       // 过期时间（秒）
    interval: number        // 轮询间隔（秒）
  }>

  // 轮询 Token
  async pollDeviceFlow(providerId: string): Promise<{
    completed: boolean
    error?: string  // 'authorization_pending' | 'slow_down' | 'expired_token' | ...
  }>
}
```

### Token 刷新

```typescript
class OAuthManager {
  // 刷新 Token
  async refreshToken(providerId: string): Promise<OAuthToken>

  // 自动刷新（如果快过期）
  async refreshTokenIfNeeded(providerId: string): Promise<OAuthToken>

  // 检查是否过期
  isTokenExpired(token: OAuthToken): boolean
}
```

## Token 存储

### 加密存储

使用 Electron 的 `safeStorage` API：

```typescript
// 加密
if (safeStorage.isEncryptionAvailable()) {
  const encrypted = safeStorage.encryptString(JSON.stringify(token))
  tokens[providerId] = encrypted.toString('base64')
} else {
  // Fallback: 明文存储（不推荐）
  tokens[providerId] = JSON.stringify(token)
}

// 解密
const decrypted = safeStorage.decryptString(
  Buffer.from(encryptedToken, 'base64')
)
const token = JSON.parse(decrypted)
```

### 存储位置

```
{userData}/oauth-tokens.json
```

内容格式：
```json
{
  "claude-code": "base64-encrypted-token...",
  "github-copilot": "base64-encrypted-token..."
}
```

## IPC 接口

### 渲染进程调用

```typescript
// 获取授权 URL (PKCE)
window.electronAPI.getOAuthAuthUrl(providerId)

// 提交授权码 (PKCE)
window.electronAPI.submitOAuthCode(providerId, code)

// 开始设备流程 (Device Flow)
window.electronAPI.startOAuthDeviceFlow(providerId)

// 轮询设备流程 (Device Flow)
window.electronAPI.pollOAuthDeviceFlow(providerId)

// 检查登录状态
window.electronAPI.isOAuthLoggedIn(providerId)

// 登出
window.electronAPI.oauthLogout(providerId)
```

## 使用示例

### Claude Code 登录

```typescript
// 1. 获取授权 URL
const { authUrl, state } = await window.electronAPI.getOAuthAuthUrl('claude-code')

// 2. 打开浏览器
window.open(authUrl)

// 3. 用户复制授权码后提交
const token = await window.electronAPI.submitOAuthCode('claude-code', userInputCode)
```

### GitHub Copilot 登录

```typescript
// 1. 开始设备流程
const { userCode, verificationUri, interval } = 
  await window.electronAPI.startOAuthDeviceFlow('github-copilot')

// 2. 显示 userCode 给用户，指引打开 verificationUri

// 3. 轮询等待授权完成
const pollTimer = setInterval(async () => {
  const result = await window.electronAPI.pollOAuthDeviceFlow('github-copilot')
  if (result.completed) {
    clearInterval(pollTimer)
    // 登录成功
  } else if (result.error && result.error !== 'authorization_pending') {
    clearInterval(pollTimer)
    // 错误处理
  }
}, interval * 1000)
```

## 安全考量

### 1. Cloudflare 绕过

使用 Electron 的 `net.fetch` 而非 Node 的 fetch，以使用 Chromium 网络栈：

```typescript
async function electronFetch(url: string, options: RequestInit): Promise<Response> {
  try {
    return await net.fetch(url, options)
  } catch (error) {
    // Fallback
    return fetch(url, options)
  }
}
```

### 2. PKCE State

按照 Claude Code OAuth 规范，state 参数使用 code_verifier 值：

```typescript
const { codeVerifier, codeChallenge } = this.generatePKCE()
const state = codeVerifier  // 重要：state = code_verifier
```

### 3. Token 自动刷新

Token 在过期前 5 分钟自动刷新：

```typescript
const fiveMinutes = 5 * 60 * 1000
if (token.expiresAt - Date.now() < fiveMinutes) {
  return this.refreshToken(providerId)
}
```

## 相关文档

- [Providers 系统](./providers.md) - AI Provider 配置
- [IPC Handlers](./ipc-handlers.md) - OAuth IPC 处理器
