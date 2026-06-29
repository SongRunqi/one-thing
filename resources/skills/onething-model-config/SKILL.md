---
name: onething-model-config
description: Use when explaining how to switch chat models, set default models, configure providers, API keys, Base URLs, custom providers, model capabilities, tool-call models, or related network settings in onething.
metadata:
  hermes:
    tags: [onething, settings, models, providers]
---

# Onething Model And Provider Configuration

Use this skill when the user asks how to change models, configure API providers, add custom endpoints, change model parameters, or troubleshoot model/provider settings in onething.

Answer in the user's language. Prefer the shortest path that matches the user's intent:

- To switch only the current chat: use the model selector in the composer toolbar. Choosing a provider/model there updates the current session's `lastProvider` and `lastModel`, so that chat keeps using the selected model.
- To change the app-wide default: open Settings -> Providers -> Default Model, then choose Provider and Model. The default applies when a session has no per-chat model override.
- To make a provider selectable: open Settings -> Providers, expand the provider with Configure, turn the provider on, configure authentication, then select at least one model in Models. Providers with no selected models usually do not appear in the chat model selector.
- For API-key providers: fill API Key and optional Base URL under API Configuration. Leaving Base URL empty uses the provider default. If the API Key field is empty, onething can detect common environment variables such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `CLAUDE_API_KEY`, `DEEPSEEK_API_KEY`, `MOONSHOT_API_KEY`, `KIMI_API_KEY`, `ZAI_API_KEY`, `ZHIPU_API_KEY`, `ZHIPUAI_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, and `GOOGLE_API_KEY`.
- For OAuth providers such as Codex, Claude Code, or GitHub Copilot: use the Login card in the provider's API Configuration instead of pasting an API key.
- For Zhipu: use API mode to choose Standard or Coding Plan. This also selects the matching Zhipu Base URL unless the user has entered a custom one.
- For local or third-party compatible APIs: click Add provider, choose OpenAI Compatible or Anthropic Compatible, enter the Base URL without the final `/chat/completions` path, optionally enter an API Key, and set a default model ID.
- To add a model that is not returned by refresh: use Add model ID in the provider's Models section, for example `gpt-4o` or a local model ID. The model is added to the provider's selected models and becomes active.
- In the Models section, the checkbox controls whether a model is selected for quick switching; clicking a model row makes it the provider's active model. Refresh/Fetch Models updates metadata such as context length and capabilities.
- Per-model controls live under the expanded provider: Temperature affects the active model when supported; Max Output sets a per-model output-token override; the slider reset buttons clear overrides. The small sliders/capability editor in the model row can override Tools, Image input, Reasoning, Image output, and Audio capability detection for hand-added models.
- To set the model for lightweight utility calls and automatic chat naming: open Settings -> Tools -> Tool Call Model. Only providers with selected models appear there. The thinking toggle and effort apply to that utility model.
- If requests or model refresh fail because of connectivity, use Settings -> Network -> Network Proxy to enable a shared proxy, set the proxy URL, optional bypass rules, and Test Proxy.
- Advanced users can open Settings -> Edit in settings.json. Relevant fields include `ai.provider`, `ai.providers[providerId].enabled`, `apiKey`, `baseUrl`, `model`, `selectedModels`, `temperatureByModel`, `maxOutputByModel`, `modelCapabilitiesByModel`, `ai.customProviders`, and `tools.toolCallModel`. Prefer UI instructions unless the user explicitly asks for JSON-level configuration.

When troubleshooting, check in this order:

1. The target provider is enabled.
2. The provider has valid auth: API key, detected env var, OAuth login, or ACP connection.
3. The provider has at least one selected model.
4. The intended model is the provider's active model or the current chat's selected model.
5. Base URL and API compatibility match the provider endpoint.
6. Network proxy settings are correct if the service is unreachable.
