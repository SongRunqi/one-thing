# Grok (xAI) Provider Design Document

## 1. Overview

This document outlines the design for integrating **xAI Grok** as a provider into the onething Electron application. The Grok API is OpenAI-compatible, which allows us to leverage existing infrastructure with minimal custom logic.

## 2. Grok API Analysis

### 2.1 API Characteristics

| Property | Value |
| ---------- | ------- |
| Base URL | `https://api.x.ai/v1` |
| Auth | API Key via `Authorization: Bearer <XAI_API_KEY>` |
| Chat Endpoint | `POST /v1/chat/completions` |
| API Compatibility | **OpenAI-compatible** |
| Streaming | Supported (SSE) via `stream: true` |
| Tool Calling | Supported (OpenAI-compatible function calling) |
| Vision | Supported (image input via `image_url` content parts) |
| Reasoning | Supported on mini models via `reasoning_effort` param |
| File Input | Supported on some models |

### 2.2 Models

| Model ID | Type | Reasoning | Vision | Tools | Notes |
| ---------- | ------ | ----------- | -------- | ------- | ------- |
| `grok-3-latest` / `grok-3-beta` | General | No | Yes | Yes | Full Grok 3 |
| `grok-3-fast-latest` / `grok-3-fast-beta` | Fast | No | Yes | Yes | Faster Grok 3 |
| `grok-3-mini-latest` / `grok-3-mini-beta` | Reasoning | Yes | Yes | Yes | Thinking model |
| `grok-3-mini-fast-latest` / `grok-3-mini-fast-beta` | Fast Reasoning | Yes | Yes | Yes | Fast thinking |
| `grok-4-latest` | Latest | No | Yes | Yes | Grok 4 |
| `grok-4-fast-latest` | Fast | No | Yes | Yes | Fast Grok 4 |

> Model list is fetched from the `/v1/models` endpoint and/or from `models.dev` (provider key: `xai`).

### 2.3 Reasoning Capability

- Only `grok-3-mini-*` models support reasoning.
- Controlled via `reasoning_effort` parameter: `low` | `high`
- Reasoning content returned in `reasoning_content` field of delta chunks (streaming) and message object (non-streaming).
- Notes: According to the xAI docs, `grok-3-beta` and `grok-3-fast-beta` do **not** support reasoning.

### 2.4 Streaming Format

The streaming format is standard OpenAI-compatible SSE with chunks like:

```json
{
  "choices": [{
    "index": 0,
    "delta": {
      "content": "...",
      "reasoning_content": "...",
      "tool_calls": [{ "index": 0, "id": "...", "function": { "name": "...", "arguments": "..." } }]
    },
    "finish_reason": "stop"
  }],
  "usage": { "prompt_tokens": 41, "completion_tokens": 104, "total_tokens": 145 }
}
```

### 2.5 Tool Calling Notes

- According to xAI docs, with streaming, the function call is returned **whole** in a single chunk (not streamed across chunks).
- This is handled correctly by the OpenAI-compatible provider's `tool-call-done` event logic.

## 3. Architecture Integration

### 3.1 How Providers Work in onething

The provider system has several layers:

```
┌─────────────────────────────────────────────────────┐
│  Renderer (Vue)                                     │
│  - ProviderIcon.vue: icon rendering                 │
│  - AIProviderTab.vue: settings UI                   │
│  - Uses ProviderInfo from builtin-providers.ts      │
├─────────────────────────────────────────────────────┤
│  Main Process                                       │
│  - providers/builtin/index.ts: exports builtin list │
│  - providers/builtin/grok.ts: Grok definition       │
├─────────────────────────────────────────────────────┤
│  Runtime Package (@onething/runtime)                 │
│  - providers/builtin-providers.ts: provider info    │
│  - providers/model-registry.ts: model fetching      │
│  - agent-loop/providers/factory.ts: runtime factory │
│  - agent-loop/providers/openai-compatible.ts: impl  │
└─────────────────────────────────────────────────────┘
```

### 3.2 Design Decisions

**Use `createOpenAICompatibleAgentProvider`**: Since Grok's API is fully OpenAI-compatible (same endpoint structure, same auth, same SSE format, same tool call format, same `reasoning_content` field), we can reuse the existing `OpenAICompatibleAgentProvider` directly.

**Why not create a custom DeepSeek-style provider?**: DeepSeek has its own provider because it uses custom `thinking` parameter types. Grok uses standard OpenAI-compatible `reasoning_effort` which is already handled by the OpenAI-compatible provider via `reasoning_content` parsing.

### 3.3 Components to Create/Modify

#### A. `packages/onething-runtime/src/providers/builtin-providers.ts`

Add `grokBuiltinProvider`:

```typescript
export const grokBuiltinProvider: OnethingBuiltinProviderDefinition = {
  id: 'grok',
  info: {
    id: 'grok',
    name: 'Grok',
    description: 'xAI Grok models with reasoning and tool support',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-3-latest',
    icon: 'grok',
    supportsCustomBaseUrl: true,
    requiresApiKey: true,
  },
}
```

Add to `onethingPortableBuiltinProviders` array.

#### B. `packages/onething-runtime/src/agent-loop/providers/factory.ts`

Register Grok runtime factory:

```typescript
registerAgentProviderRuntime('grok', (config, options) => createOpenAICompatibleAgentProvider({
  providerId: 'grok',
  apiKey: config.apiKey,
  baseUrl: config.baseUrl,
  defaultBaseUrl: 'https://api.x.ai/v1',
  fetchImpl: options.fetchImpl,
  supportsVision: true,
  supportsReasoning: true,
  includeAssistantReasoning: true,
}), { replace: true })
```

#### C. `src/main/providers/builtin/grok.ts`

Re-export the builtin provider (similar to `acp.ts`):

```typescript
import { grokBuiltinProvider } from '@onething/runtime/providers'
export default grokBuiltinProvider
```

#### D. `src/main/providers/builtin/index.ts`

Add `grok` to the exported array.

#### E. `src/renderer/components/settings/ProviderIcon.vue`

Add Grok SVG icon (xAI logo) with brand color.

## 4. Capability Matrix

| Feature | Supported | Implementation |
| --------- | ----------- | ---------------- |
| Text chat | ✅ | Standard OpenAI-compatible |
| Streaming | ✅ | SSE, via OpenAICompatibleAgentProvider |
| Tool calling | ✅ | OpenAI-compatible function format |
| Vision (image input) | ✅ | `image_url` content parts |
| Reasoning (thinking) | ✅ | `reasoning_content` + `reasoning_effort` |
| File input | ✅ | Via content parts |
| Custom base URL | ✅ | `supportsCustomBaseUrl: true` |
| API Key auth | ✅ | `requiresApiKey: true` |
| Model fetching | ✅ | From `/v1/models` + models.dev |

## 5. Reasoning Model Handling

Grok's reasoning model (`grok-3-mini-*`) has the following behavior:

1. **Parameter**: `reasoning_effort` = `low` | `high`
2. **Streaming**: `reasoning_content` in delta chunks
3. **Non-streaming**: `reasoning_content` in the message object

The `OpenAICompatibleAgentProvider` already handles `reasoning_content` in delta chunks and maps it to `reasoning-delta` events. The `includeAssistantReasoning` flag (set to `true`) enables passing `reasoning_content` back in history.

The existing system's `reasoning_effort` parameter flows through:

- User sets `thinkingEffortByModel` in settings
- `agent-loop/providers/thinking-options.ts` normalizes it
- The stream call passes `reasoningEffort` in the request

However, the standard `createOpenAICompatibleAgentProvider` does NOT currently pass `reasoning_effort` to the API body. We need to verify this and potentially add it.

**Resolution**: The `reasoning_effort` field is not part of the standard OpenAI API body, but Grok supports it. Looking at the DeepSeek agent provider, it adds `reasoning_effort` explicitly to its request body. For Grok, since we're using `createOpenAICompatibleAgentProvider`, we need to check if it passes `reasoning_effort` already, or if we need to extend the request body.

**Checking**: Looking at `openai-compatible.ts`, the request body does NOT include `reasoning_effort`. However, the `AI SDK` or provider facade may add it from the `providerOptions` map. Let me check.

Looking at the provider facade, `streamChatResponseWithTools` passes `thinkingEffort` through options. The `OpenAICompatibleAgentProvider` doesn't read thinkingEffort from the request body.

**Finding**: Since Grok uses `reasoning_effort` as a top-level parameter (not nested), and the OpenAI-compatible provider doesn't add it, we need a custom wrapper or simply accept that for the initial implementation, reasoning works without explicit effort control (Grok defaults to a reasonable value).

For the initial implementation:

- Reasoning models will work via `reasoning_content` detection
- `reasoning_effort` can be added as a follow-up enhancement by extending the request body in a custom handler or by adding `providerOptions.reasoning_effort` support

**Actually**: Let me look more closely. The `OpenAICompatibleAgentProvider` builds a request body that only includes `model`, `messages`, `stream`, `stream_options`, `tools`, `tool_choice`, `max_tokens` (or `max_completion_tokens`), and `temperature`. It does NOT include `reasoning_effort`.

But wait - in the `deepseek` agent provider, it specifically handles `reasoning_effort`. For the initial Grok implementation, this means the reasoning content will still be streamed back, but we won't control the effort level. The default behavior (`reasoning_effort` not specified) should use the model's default.

**Update on further analysis**: Looking at the `streamOnethingChatResponseWithTools` flow in `provider-routing.ts`, the `thinkingEffort` option is available but it depends on how each agent provider handles it. The `OpenAICompatibleAgentProvider` doesn't process it. For the initial version, this is acceptable - reasoning will still work with default effort. We can add `reasoning_effort` support later.

## 6. Model Registry

The existing `provider-mapping` in `model-registry.ts` already maps `xai` → `grok`:

```typescript
export const ONETHING_PROVIDER_MAPPING: Record<string, string> = {
  // ...
  xai: 'grok',
  // ...
}
```

This means when `models.dev` API returns xAI models, they'll be automatically associated with the `grok` provider. No changes needed here.

## 7. File Changes Summary

| File | Change | Type |
| ------ | -------- | ------ |
| `packages/onething-runtime/src/providers/builtin-providers.ts` | Add `grokBuiltinProvider` | Add |
| `packages/onething-runtime/src/agent-loop/providers/factory.ts` | Register `grok` runtime | Add |
| `src/main/providers/builtin/grok.ts` | Create Grok provider definition | New file |
| `src/main/providers/builtin/index.ts` | Add `grok` to exports | Edit |
| `src/renderer/components/settings/ProviderIcon.vue` | Add Grok icon SVG | Add |

## 8. Configuration & Settings

Users configure Grok via Settings → AI Providers:

1. Select "Grok" from provider list
2. Enter xAI API Key
3. Optionally customize base URL (e.g., for proxies)
4. Select default model
5. Model list auto-fetched from `/v1/models` or `models.dev`

## 9. Testing Strategy

1. **Unit**: Verify provider registration in factory
2. **Integration**: Test chat completion with live API key
3. **Streaming**: Test streaming response with SSE parsing
4. **Tool calling**: Test with a simple tool definition
5. **Reasoning**: Test with `grok-3-mini-latest` reasoning model
6. **Vision**: Test with image input
7. **Error handling**: Test with invalid API key, rate limits

## 10. Risks & Mitigations

| Risk | Mitigation |
| ------ | ------------ |
| `reasoning_effort` not passed to API | Reasoning works with defaults; can enhance later |
| Streaming tool calls returned whole | Already handled by existing tool call accumulation logic |
| Model list stale | Auto-refresh from `/v1/models` endpoint |
| API rate limits | Standard error handling in OpenAI-compatible provider |
