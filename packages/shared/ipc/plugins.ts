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
	/**
	 * 绕过降级闸放行**一次**(R7)。
	 *
	 * 只有用户在降级态上明确点"再试一次"时才为真 —— 自动重试、轮询、刷新都不带它,
	 * 否则降级就白降了。
	 */
	bypassDegraded?: boolean;
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
	/**
	 * 被**降级短路**掉的:插件根本没有被调用(R7)。
	 *
	 * UI 据此渲染专门的降级态,而不是又一个普通错误 + Retry —— 连败达阈之后
	 * 再点一次没有意义,除非用户明确说"再试一次"(那一次带 bypassDegraded)。
	 */
	degraded?: boolean;
	/** 被降级的界面,例如 `panel:logs`。 */
	surface?: string;
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
	/**
	 * 机械同步信号(不给人看)。`config-changed` 只触发刷新,不弹 toast ——
	 * 保存是用户自己点的,再弹一条就是噪音。
	 * `panel-refresh` 同理:插件说"我的面板该重画了",带 panelId。
	 */
	kind?: "config-changed" | "panel-refresh";
	/** kind = panel-refresh 时的面板 id。 */
	panelId?: string;
}

/**
 * 插件自有配置的过线形状(R3)。
 *
 * schema 的唯一事实源是 manifest 的 contributes.settings.schema;这里过线的是
 * 宿主已经归约好的**字段表**(控件、标签、默认值),renderer 因此不必自己解
 * JSON Schema —— 两端各写一份解析器就是形状漂移的开始。
 */
export interface PluginConfigFieldDescriptor {
	key: string;
	/** 校验依据(control 只管长相)。 */
	type: "boolean" | "string" | "string-enum" | "number" | "integer" | "string-array";
	control: "switch" | "text" | "number" | "select" | "string-list";
	label: string;
	hint?: string;
	required: boolean;
	options?: string[];
	minimum?: number;
	maximum?: number;
	integer?: boolean;
	defaultValue: unknown;
}

export interface PluginConfigRequest {
	pluginId: string;
}

export interface PluginConfigResponse {
	success: boolean;
	/** schema 声明的字段表;schema 不受支持时为空数组。 */
	fields?: PluginConfigFieldDescriptor[];
	/** 已校验、已填默认值的当前值。 */
	config?: Record<string, unknown>;
	title?: string;
	/** 该插件是否声明了 settings schema。 */
	declared?: boolean;
	/** 值是"schema 默认值"而非宿主真实存量(server 只读镜像时为 true)。 */
	valuesAreDefaults?: boolean;
	/** schema 超出宿主控件集时的逐条原因(不崩,照实说)。 */
	unsupportedReasons?: string[];
	/** 本宿主是否允许编辑(方案 A 下 web 永远 false)。 */
	editable?: boolean;
	/** editable=false 时的解释。 */
	readOnlyReason?: string;
	error?: string;
}

export interface SetPluginConfigRequest {
	pluginId: string;
	config: Record<string, unknown>;
}

/**
 * 结构化错误:带 key 才能让设置页把红态挂到**出错的那个字段**上,
 * 而不是在配置区底下堆一行拼接字符串。coerce 内部本来就知道 key。
 */
export interface PluginConfigErrorDetail {
	/** 出错的字段;缺省表示整体性错误。 */
	key?: string;
	message: string;
}

export interface SetPluginConfigResponse {
	success: boolean;
	/** 落盘后的有效值(已剥未知键、已填默认)。 */
	config?: Record<string, unknown>;
	/** 校验未通过的逐条原因。 */
	errors?: PluginConfigErrorDetail[];
	error?: string;
}

/**
 * 卸载(R4)。数据被**归档**而不是删除 —— 停用保留数据、卸载归档数据,
 * 两者的差别要在对话框里说清楚。
 */
export interface UninstallPluginRequest {
	pluginId: string;
}

/**
 * 一个插件的全部落盘足迹(宪法第 6 条数据侧)。
 *
 * R4 建了 core 侧的枚举,R5 给它接上出口 —— 卸载确认框据此告诉用户
 * "将被归档的是这些东西",而不是让他凭空相信。
 */
export interface PluginDataFootprint {
	pluginId: string;
	dataDir: string;
	dataDirExists: boolean;
	entries: string[];
	legacyKvExists: boolean;
	/** plugin-settings 里为它保留的键。 */
	settingsKeys: string[];
}

export interface PluginFootprintResponse {
	success: boolean;
	footprint?: PluginDataFootprint;
	error?: string;
}

export interface UninstallPluginResponse {
	success: boolean;
	/** 数据归档到了哪儿(用于告诉用户"你的东西还在这")。 */
	archivePath?: string;
	error?: string;
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
