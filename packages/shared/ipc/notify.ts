/**
 * 系统通知与 dock 徽标(docs/design/agent-dm-user.md §4)。
 *
 * 分工:**决策在 renderer,执行在主进程**。窗口焦点、会话可见性、未读水位全在
 * renderer 的 store 里,主进程对"用户是否正看着这间房"一无所知;而 renderer 的
 * Web Notification 权限被 session 安全策略明确拒绝(嵌入的浏览器页面不该弹通知
 * ——那道门是对的,不放行)。所以判定留在 renderer,弹窗走主进程的 Notification。
 */

export interface ShowNotificationRequest {
	/** 通知标题。私聊场景 = 发言 agent 的名字。 */
	title: string;
	/** 正文摘要:已剥 mention token 与 markdown 标记、已截断。 */
	body: string;
	/** 点击后要打开的会话。主进程原样回传给 renderer,自己不解释它。 */
	sessionId: string;
}

/**
 * 徽标是「有/无」而不是数字(agent-im-dm.md D9 的定调:系统只知道有没有,
 * 编数字不可靠),所以 dock 画的是一枚墨点字符,不是 setBadgeCount。
 */
export interface SetBadgeRequest {
	hasUnread: boolean;
}

/** 主进程 → renderer:用户点了那条通知。 */
export interface NotifyActivateEvent {
	sessionId: string;
}

export interface NotifySimpleResponse {
	success: boolean;
	error?: string;
}
