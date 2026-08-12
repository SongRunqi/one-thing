import crypto from "crypto";
import { parseJwtExpiration, parseJwtPayload } from "./jwt.js";
import type {
	OnethingAuthProviderDefinition,
	OnethingOAuthToken,
} from "./types.js";

const DEFAULT_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

/** Kimi Code 授权服务器。两个环境变量与官方 CLI 同名,自建/灰度环境靠它切。 */
export const ONETHING_KIMI_CODE_DEFAULT_OAUTH_HOST = "https://auth.kimi.com";

export function resolveKimiOAuthHost(
	env: Record<string, string | undefined> = process.env,
): string {
	const host =
		env.KIMI_CODE_OAUTH_HOST ||
		env.KIMI_OAUTH_HOST ||
		ONETHING_KIMI_CODE_DEFAULT_OAUTH_HOST;
	return host.replace(/\/+$/, "");
}

export function generatePKCE(): {
	codeVerifier: string;
	codeChallenge: string;
} {
	const codeVerifier = crypto.randomBytes(32).toString("base64url");
	const codeChallenge = crypto
		.createHash("sha256")
		.update(codeVerifier)
		.digest("base64url");
	return { codeVerifier, codeChallenge };
}

export function normalizeGenericOAuthToken(
	data: any,
	currentToken?: OnethingOAuthToken | null,
): OnethingOAuthToken {
	const accessToken = data.access_token || currentToken?.accessToken;
	if (!accessToken) {
		throw new Error("OAuth response did not include an access token");
	}

	return {
		accessToken,
		refreshToken: data.refresh_token || currentToken?.refreshToken,
		expiresAt:
			typeof data.expires_in === "number"
				? Date.now() + data.expires_in * 1000
				: currentToken?.expiresAt || Date.now() + DEFAULT_TOKEN_TTL_MS,
		tokenType: data.token_type || currentToken?.tokenType || "Bearer",
		scope: data.scope || currentToken?.scope,
	};
}

function normalizeCodexToken(
	data: any,
	currentToken?: OnethingOAuthToken | null,
): OnethingOAuthToken {
	const base = normalizeGenericOAuthToken(data, currentToken);
	const idToken = data.id_token || currentToken?.idToken;
	const accessToken = data.access_token || currentToken?.accessToken;
	const idClaims = parseJwtPayload(idToken);
	const accessClaims = parseJwtPayload(accessToken);
	const authClaims =
		idClaims?.["https://api.openai.com/auth"] ||
		accessClaims?.["https://api.openai.com/auth"] ||
		{};
	const expiresAt =
		parseJwtExpiration(accessToken) ||
		parseJwtExpiration(idToken) ||
		base.expiresAt;

	return {
		...base,
		idToken,
		expiresAt,
		accountId: authClaims.chatgpt_account_id || currentToken?.accountId,
		email: idClaims?.email || accessClaims?.email || currentToken?.email,
		planType: authClaims.chatgpt_plan_type || currentToken?.planType,
		isFedrampAccount:
			typeof authClaims.chatgpt_account_is_fedramp === "boolean"
				? authClaims.chatgpt_account_is_fedramp
				: currentToken?.isFedrampAccount,
		providerMetadata: {
			...(currentToken?.providerMetadata ?? {}),
			chatgptUserId: authClaims.chatgpt_user_id,
		},
	};
}

const CLAUDE_CODE_CONFIG: OnethingAuthProviderDefinition = {
	providerId: "claude-code",
	name: "Claude Code",
	flowKind: "manual-pkce",
	oauthFlow: "authorization-code",
	clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
	authorizationUrl: "https://claude.ai/oauth/authorize",
	tokenUrl: "https://console.anthropic.com/v1/oauth/token",
	redirectUri: "https://console.anthropic.com/oauth/code/callback",
	scopes: ["org:create_api_key", "user:profile", "user:inference"],
	stateStrategy: "code-verifier",
	tokenBodyFormat: "json",
	refreshBodyFormat: "json",
	tokenHeaders: {
		Accept: "application/json, text/plain, */*",
		"Accept-Language": "en-US,en;q=0.9",
		"User-Agent":
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
		Origin: "https://claude.ai",
		Referer: "https://claude.ai/",
	},
	authorizationParams: (ctx) => ({
		code: "true",
		client_id: CLAUDE_CODE_CONFIG.clientId,
		response_type: "code",
		redirect_uri: CLAUDE_CODE_CONFIG.redirectUri || "",
		code_challenge: ctx.codeChallenge || "",
		code_challenge_method: "S256",
		scope: CLAUDE_CODE_CONFIG.scopes.join(" "),
		state: ctx.state || "",
	}),
	tokenParams: (ctx) => ({
		grant_type: "authorization_code",
		client_id: CLAUDE_CODE_CONFIG.clientId,
		code: ctx.code,
		redirect_uri: CLAUDE_CODE_CONFIG.redirectUri || "",
		code_verifier: ctx.codeVerifier || "",
		state: ctx.state || "",
	}),
	codeEntryInstructions:
		"After authorizing, copy the entire code shown on the page, including any # and text after it, and paste it here.",
	normalizeToken: normalizeGenericOAuthToken,
};

const GITHUB_COPILOT_CONFIG: OnethingAuthProviderDefinition = {
	providerId: "github-copilot",
	name: "GitHub Copilot",
	flowKind: "device-code",
	oauthFlow: "device",
	clientId: "Iv1.b507a08c87ecfe98",
	authorizationUrl: "https://github.com/login/device",
	tokenUrl: "https://github.com/login/oauth/access_token",
	deviceCodeUrl: "https://github.com/login/device/code",
	scopes: ["copilot"],
	tokenBodyFormat: "form",
	normalizeToken: normalizeGenericOAuthToken,
};

const CODEX_CONFIG: OnethingAuthProviderDefinition = {
	providerId: "codex",
	name: "Codex",
	flowKind: "pkce-callback",
	oauthFlow: "authorization-code",
	clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
	authorizationUrl: "https://auth.openai.com/oauth/authorize",
	tokenUrl: "https://auth.openai.com/oauth/token",
	refreshUrl: "https://auth.openai.com/oauth/token",
	scopes: [
		"openid",
		"profile",
		"email",
		"offline_access",
		"api.connectors.read",
		"api.connectors.invoke",
	],
	callbackPath: "/auth/callback",
	callbackPorts: [1455, 1457],
	stateStrategy: "random",
	tokenBodyFormat: "form",
	refreshBodyFormat: "json",
	authorizationParams: (ctx) => ({
		response_type: "code",
		client_id: CODEX_CONFIG.clientId,
		redirect_uri: ctx.redirectUri || "",
		scope: CODEX_CONFIG.scopes.join(" "),
		code_challenge: ctx.codeChallenge || "",
		code_challenge_method: "S256",
		id_token_add_organizations: "true",
		codex_cli_simplified_flow: "true",
		state: ctx.state || "",
		originator: "codex_cli_rs",
	}),
	tokenParams: (ctx) => ({
		grant_type: "authorization_code",
		code: ctx.code,
		redirect_uri: ctx.redirectUri || "",
		client_id: CODEX_CONFIG.clientId,
		code_verifier: ctx.codeVerifier || "",
	}),
	refreshParams: (refreshToken) => ({
		client_id: CODEX_CONFIG.clientId,
		grant_type: "refresh_token",
		refresh_token: refreshToken,
	}),
	normalizeToken: normalizeCodexToken,
	statusMessage: "Connected with ChatGPT subscription",
};

const GROK_OAUTH_CONFIG: OnethingAuthProviderDefinition = {
	providerId: "grok-oauth",
	name: "Grok (SuperGrok / X Premium+)",
	flowKind: "device-code",
	oauthFlow: "device",
	clientId: "b1a00492-073a-47ea-816f-4c329264a828",
	tokenUrl: "https://auth.x.ai/oauth2/token",
	deviceCodeUrl: "https://auth.x.ai/oauth2/device/code",
	scopes: [
		"openid",
		"profile",
		"email",
		"offline_access",
		"grok-cli:access",
		"api:access",
	],
	tokenBodyFormat: "form",
	normalizeToken: normalizeGenericOAuthToken,
};

/**
 * Kimi Code(编程套餐)—— OAuth 2.0 Device Authorization Grant(RFC 8628)。
 *
 * 三件事值得写在这儿,因为它们都是**实测**来的,不是抄文档:
 *
 * 1. **这是个公开 client**(`client_id` 无 secret),端点与参数取自开源的官方 CLI
 *    (MoonshotAI/kimi-cli,`src/kimi_cli/auth/oauth.py` + `klips/klip-14`)。
 *    与 Claude Code / Codex / Copilot 那三条同一性质:用厂商自己公开的 public
 *    client 走标准流程。
 * 2. **不需要伪装身份**。官方 CLI 会带一组 `X-Msh-*`(platform=kimi_cli、设备名、
 *    设备号…)。实测 device_authorization 不带这些头一样 200,带我们自己的
 *    platform 值也一样 200 —— 所以这里一个都不发。Kimi 的条款里写明「篡改客户端
 *    标识视为违规,可能暂停会员权益」,而"发得通"从来不是"可以发"的理由。
 * 3. **不带 scope**:官方实现只发 client_id,服务端也不要 scope。
 *
 * 换来的 `access_token` 就是打到 `https://api.kimi.com/coding/v1` 的那把 Bearer
 * key —— 与手贴 API Key 走的是同一个面(klip-14:「OAuth 模型和 API 兼容性与当前
 * Bearer key 完全一致」),所以下游一个字节都不用改。
 */
const KIMI_CODE_CONFIG: OnethingAuthProviderDefinition = {
	providerId: "kimi-code",
	name: "Kimi Code",
	flowKind: "device-code",
	oauthFlow: "device",
	clientId: "17e5f671-d194-4dfb-9706-5516cb48c098",
	// host 可被官方 CLI 的两个环境变量覆盖(自建/灰度环境),这里跟随同一对名字。
	tokenUrl: `${resolveKimiOAuthHost()}/api/oauth/token`,
	deviceCodeUrl: `${resolveKimiOAuthHost()}/api/oauth/device_authorization`,
	scopes: [],
	tokenBodyFormat: "form",
	refreshBodyFormat: "form",
	refreshParams: (refreshToken) => ({
		client_id: KIMI_CODE_CONFIG.clientId,
		grant_type: "refresh_token",
		refresh_token: refreshToken,
	}),
	normalizeToken: normalizeGenericOAuthToken,
	statusMessage: "Connected with Kimi Code subscription",
};

const AUTH_PROVIDERS = new Map<string, OnethingAuthProviderDefinition>([
	[CLAUDE_CODE_CONFIG.providerId, CLAUDE_CODE_CONFIG],
	[GITHUB_COPILOT_CONFIG.providerId, GITHUB_COPILOT_CONFIG],
	[CODEX_CONFIG.providerId, CODEX_CONFIG],
	[GROK_OAUTH_CONFIG.providerId, GROK_OAUTH_CONFIG],
	[KIMI_CODE_CONFIG.providerId, KIMI_CODE_CONFIG],
]);

export function getAuthProviderDefinition(
	providerId: string,
): OnethingAuthProviderDefinition | undefined {
	return AUTH_PROVIDERS.get(providerId);
}

export function getAuthProviderDefinitions(): OnethingAuthProviderDefinition[] {
	return Array.from(AUTH_PROVIDERS.values());
}
