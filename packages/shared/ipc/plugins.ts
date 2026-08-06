/**
 * 统一插件请求通道的过线形状(R2)。
 *
 * 这一段是 CLAUDE.md「加 IPC 通道五步」的第 2 步:类型定义在这里,
 * electron 的 portable host、preload、renderer 类型、web platform 四处
 * **一律 import 复用**。四份手写副本没有任何编译期防护 —— 谁多加一个字段,
 * 另外三处会静默漂移到下一个真机 bug 才被发现。
 *
 * 全段必须 JSON-可序列化(宪法第 2 条):它过 IPC,也过 HTTP。
 */
export interface PluginRequestPayload {
	pluginId: string;
	action: string;
	payload?: unknown;
	/**
	 * 省略即由 core 生成(带单调序列号)。调用方不要自己拿时间戳拼 ——
	 * 同毫秒并发会撞号。真正生效的 id 随结果回传。
	 */
	requestId?: string;
}

export interface PluginRequestResult {
	success: boolean;
	/** 本次调用的地址;abort 用它。 */
	requestId: string;
	result?: unknown;
	error?: string;
	/** 被撤销(调用方 abort、插件被禁用、宿主拆除)。 */
	aborted?: boolean;
	/** 超出请求预算。 */
	timedOut?: boolean;
}

export interface PluginRequestProgressPayload {
	requestId: string;
	pluginId: string;
	action: string;
	payload: unknown;
}

export interface AbortPluginRequestResult {
	success: boolean;
	/** 是否真的撤销了一个在飞请求(false = 那个 id 已经不在飞)。 */
	aborted: boolean;
	error?: string;
}

export interface PluginNotificationPayload {
	pluginId: string;
	message: string;
	level: "info" | "warn" | "error";
}

export interface PluginCommandInfo {
  id: string
  name: string
  description: string
  usage: string
}

export interface GetPluginCommandsResponse {
  success: boolean
  commands?: PluginCommandInfo[]
  error?: string
}

export interface ExecutePluginCommandRequest {
  commandName: string
  args?: string
  sessionId: string
}

export interface ExecutePluginCommandResponse {
  success: boolean
  message?: string
  error?: string
}
