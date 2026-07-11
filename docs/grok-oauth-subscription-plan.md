# xAI Grok OAuth 订阅支持实施方案

## 1. 背景调研

### 1.1 xAI OAuth 认证方式

xAI 提供标准的 OAuth 2.0 设备授权码流程（RFC 8628 Device Authorization Grant），允许用户通过 **SuperGrok 订阅** 或 **X Premium+ 订阅** 直接使用 API，无需单独申请 API Key。

参考实现：

- [Hermes Agent xAI Grok OAuth](https://hermes-agent.nousresearch.com/docs/guides/xai-grok-oauth)
- [serac/opencode xAI Plugin](https://github.com/serac-labs/serac/blob/main/packages/opencode/src/plugin/xai.ts)

### 1.2 关键参数

| 参数 | 值 |
| ------ | ----- |
| Client ID | `b1a00492-073a-47ea-816f-4c329264a828` |
| 设备授权端点 | `https://auth.x.ai/oauth2/device/code` |
| Token 端点 | `https://auth.x.ai/oauth2/token` |
| Scope | `openid profile email offline_access grok-cli:access api:access` |
| Grant Type | `urn:ietf:params:oauth:grant-type:device_code` |
| 刷新方式 | `grant_type=refresh_token` |
| API 端点 | `https://api.x.ai/v1`（与 API Key 方式共用） |

### 1.3 工作原理

```
┌──────────┐                ┌──────────────┐
│  onething │                │   auth.x.ai   │
│  (Electron)                │  (OAuth Server) │
└────┬─────┘                └──────┬───────┘
     │                              │
     │  POST /oauth2/device/code    │
     │  client_id, scope            │
     │─────────────────────────────>│
     │                              │
     │  { device_code, user_code,   │
     │    verification_uri,         │
     │    interval, expires_in }    │
     │<─────────────────────────────│
     │                              │
     │  显示 URL + user_code 给用户  │
     │                              │
     │                              │  用户在浏览器打开 URL
     │                              │  输入 user_code，授权
     │  ┌──── 轮询 ────┐            │
     │  │  POST /token │            │
     │  │  grant_type  │            │
     │  │  device_code │            │
     │──│─────────────>│            │
     │  │             │            │
     │  │  { access_token,         │
     │  │    refresh_token,        │
     │  │    expires_in }          │
     │  │<─────────────│            │
     │  └──────────────┘            │
     │                              │
     │  保存 token，开始使用 API      │
     │                              │
```

### 1.4 现有系统兼容性分析

onething 的 OAuth 系统已完整支持 RFC 8628 设备授权码流程（`flowKind: 'device-code'`）：

- `auth/auth-service.ts` 中的 `startDeviceFlow()` 和 `pollDeviceFlow()` 方法
- `auth/registry.ts` 中的 `GITHUB_COPILOT_CONFIG` 即为设备授权码流程的参考实现
- 前端 `AuthCard.vue` 和 `useProviderAuth.ts` 已有设备码流程 UI

**关键发现**：xAI 的设备授权码流程与 GitHub Copilot 完全一致（均使用 `urn:ietf:params:oauth:grant-type:device_code`），无需修改核心认证逻辑，只需添加配置。

## 2. 设计决策

### 2.1 单 Provider 双认证模式 vs 双 Provider

**方案 A**: 单一 `grok` provider，支持 API Key + OAuth 双模式

- 优点：用户配置简单，一个 provider 两种登录方式
- 缺点：需要改造 provider 的 `requiresApiKey` 逻辑

**方案 B (推荐)**: 保持 `grok`（API Key），新增 `grok-oauth`（OAuth 订阅）

- 优点：与现有 `claude` / `claude-code` 模式一致，最小化改动
- 缺点：用户需要区分两个 provider

**选择方案 B**，理由：

1. 与现有模式一致（`claude` API Key + `claude-code` OAuth）
2. 认证流程、token 管理完全不同，分开更清晰
3. OAuth 用户可以享受 SuperGrok 订阅的用量额度，与 API Key 按量付费不同
4. 最小化对现有 `grok` API Key provider 的影响

### 2.2 设备码流程 vs PKCE 回调流程

**选择设备码流程** (`device-code`)，理由：

1. GitHub Copilot 已使用相同的设备码流程，代码路径成熟
2. 不需要本地 HTTP 回调服务器，更简单可靠
3. 支持 headless/远程环境（SSH、Docker、CI）
4. xAI 官方 Grok-CLI 也使用设备码流程

## 3. 实施清单

### 3.1 Runtime 层：添加 Auth Provider 定义

**文件**: `packages/onething-runtime/src/auth/registry.ts`

在 `CODEX_CONFIG` 之后添加：

```typescript
const GROK_CONFIG: OnethingAuthProviderDefinition = {
  providerId: 'grok-oauth',
  name: 'Grok (SuperGrok / X Premium+)',
  flowKind: 'device-code',
  oauthFlow: 'device',
  clientId: 'b1a00492-073a-47ea-816f-4c329264a828',
  tokenUrl: 'https://auth.x.ai/oauth2/token',
  deviceCodeUrl: 'https://auth.x.ai/oauth2/device/code',
  scopes: ['openid', 'profile', 'email', 'offline_access', 'grok-cli:access', 'api:access'],
  tokenBodyFormat: 'form',
  normalizeToken: normalizeGenericOAuthToken,
}
```

注册到 `AUTH_PROVIDERS` Map。

### 3.2 Runtime 层：添加 Builtin Provider 定义

**文件**: `packages/onething-runtime/src/providers/builtin-providers.ts`

在 `grokBuiltinProvider` 之后添加：

```typescript
export const grokOAuthBuiltinProvider: OnethingBuiltinProviderDefinition = {
  id: 'grok-oauth',
  info: {
    id: 'grok-oauth',
    name: 'Grok (Subscription)',
    description: 'Use Grok with your SuperGrok or X Premium+ subscription via OAuth',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-3-latest',
    icon: 'grok',
    supportsCustomBaseUrl: false,
    requiresApiKey: false,
    requiresOAuth: true,
    oauthFlow: 'device',
  },
}
```

添加到 `onethingPortableBuiltinProviders` 数组。

### 3.3 Runtime 层：注册 Agent Runtime

**文件**: `packages/onething-runtime/src/agent-loop/providers/factory.ts`

在 `grok` 注册之后添加：

```typescript
registerAgentProviderRuntime('grok-oauth', (config, options) => {
  const accessToken = accessTokenFromRuntimeConfig(config)
  if (!accessToken) {
    throw new Error('Not logged in to Grok. Please login first.')
  }
  return createOpenAICompatibleAgentProvider({
    providerId: 'grok-oauth',
    baseUrl: config.baseUrl,
    defaultBaseUrl: 'https://api.x.ai/v1',
    fetchImpl: options.fetchImpl,
    supportsVision: true,
    supportsReasoning: true,
    includeAssistantReasoning: true,
    resolveAuth: async () => ({ apiKey: accessToken }),
  })
}, { replace: true })
```

> **说明**：OAuth 的 `accessToken` 从 `config` 中获取（由 `resolveOnethingProviderAuth` 流程注入），作为 API Key 传递给 `createOpenAICompatibleAgentProvider`。这与 `github-copilot` 的 OAuth 模式完全一致。

> **Token 刷新**：onething 的 auth 系统已内置自动刷新机制，在 401 响应时触发，无需在 provider runtime 中额外处理。

### 3.4 Main Process 层：添加 Provider 导出

**文件**: `src/main/providers/builtin/grok-oauth.ts` (新建)

```typescript
export { grokOAuthBuiltinProvider as default } from '@onething/runtime/providers'
```

### 3.5 Frontend 层：无需额外改动

因为 `grok-oauth` 使用设备码流程（`flowKind: 'device-code'`），前端已有的 GitHub Copilot 流程图 UI 组件可复用：

- `AuthCard.vue` 已支持设备码流程（显示 verification URL + user code）
- `useProviderAuth.ts` 已支持 `startDeviceFlow` 和 `pollDeviceFlow`
- `ProviderIcon.vue` 已添加 Grok 图标（`grok` 键值，`grok-oauth` 可通过 icon 字段复用）

**可选增强**：为 `grok-oauth` 的 icon 字段使用 `grok` 或新建 `grok-oauth` 键值。

### 3.6 测试更新

**文件**: `packages/onething-runtime/src/providers/__tests__/builtin-providers.test.ts`

在 provider IDs 数组中添加 `'grok-oauth'`。

**文件**: `src/main/agent-loop/__tests__/provider-factory.test.ts`

添加 `grok-oauth` 的支持检查。

**文件**: `packages/onething-runtime/src/auth/__tests__/auth-service.test.ts`

添加 Grok OAuth 配置的测试用例。

## 4. 文件变更清单

| 文件 | 变更类型 | 行数估算 |
| ------ | --------- | --------- |
| `packages/onething-runtime/src/auth/registry.ts` | 添加 GROK_CONFIG + 注册 | +15 |
| `packages/onething-runtime/src/providers/builtin-providers.ts` | 添加 grokOAuthBuiltinProvider + 数组 | +17 |
| `packages/onething-runtime/src/agent-loop/providers/factory.ts` | 添加 grok-oauth runtime | +14 |
| `src/main/providers/builtin/grok-oauth.ts` | 新建文件 | +1 |
| `packages/onething-runtime/src/providers/__tests__/builtin-providers.test.ts` | 更新测试 | +1 |
| `src/main/agent-loop/__tests__/provider-factory.test.ts` | 更新测试 | +2 |

**总计**: ~50 行新增代码，无修改现有逻辑。

## 5. 用户使用流程

1. 用户打开 Settings → AI Providers
2. 选择 "Grok (Subscription)" provider
3. 点击 "Login" 按钮
4. 系统弹出设备授权码界面，显示：
   - URL: `https://auth.x.ai/activate`
   - User Code: `XXXX-XXXX`
5. 用户在浏览器打开 URL，输入 Code，登录 xAI 账号
6. xAI 验证 SuperGrok / X Premium+ 订阅状态
7. 授权成功后，onething 自动获取 access_token + refresh_token
8. Token 持久化存储，自动刷新
9. 用户开始使用 Grok 模型

## 6. 错误处理

| 场景 | 现有处理 |
| ------ | --------- |
| Token 过期 | `auth-service.ts` 自动刷新 refresh_token |
| Refresh 失败 (401/4xx) | 标记 token 失效，提示重新登录 |
| 设备码过期 (expired_token) | 返回错误，提示重新发起登录 |
| 用户拒绝授权 (access_denied) | 返回错误，清除当前 flow |
| 速率限制 (slow_down) | 自动增加轮询间隔 |

## 7. 风险与注意事项

| 风险 | 缓解措施 |
| ------ | --------- |
| xAI 可能限制非官方客户端的 OAuth 访问（HTTP 403） | Hermes Agent issue #26847 已报告此问题；提供 API Key 作为备选方案 |
| Client ID 被 xAI 撤销或更新 | 使用 xAI Grok-CLI 的公开 client_id，版本更新时需同步 |
| SuperGrok 订阅到期 | API 调用返回 4xx，用户需续费或切换到 API Key 模式 |

## 8. 与现有 Grok (API Key) Provider 的关系

```
┌────────────────────────────────────────┐
│          onething Grok 生态             │
│                                        │
│  ┌──────────────┐  ┌────────────────┐  │
│  │  grok        │  │  grok-oauth    │  │
│  │  (API Key)   │  │  (Subscription)│  │
│  │              │  │                │  │
│  │  xAI API Key │  │  SuperGrok     │  │
│  │  按量付费     │  │  / X Premium+  │  │
│  │  自定义BaseURL│  │  订阅额度       │  │
│  └──────┬───────┘  └───────┬────────┘  │
│         │                  │           │
│         └──────┬───────────┘           │
│                ▼                       │
│     https://api.x.ai/v1               │
│     /v1/chat/completions              │
│     (OpenAI-compatible)               │
└────────────────────────────────────────┘
```
