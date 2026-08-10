/**
 * 深链确认门的 IPC 面(H4)。
 *
 * 两条 invoke,方向都是渲染层 → 主进程:
 *  - `deeplink:ready` —— "我能画卡了"。冷启动队列的放行信号**由渲染层给**,
 *    不是主进程猜的"窗口大概建好了";猜的那一版会在慢机器上偶发丢链。
 *  - `deeplink:respond` —— 用户按了钮。它是派发的唯一入口。
 *
 * 推卡的方向(主进程 → 渲染层)不在这里:它在 service 里直接 send,因为投递
 * 时机由 URL 到达驱动,不由某次 invoke 驱动。
 */
import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc.js";
import type {
	DeepLinkRespondRequest,
	DeepLinkRespondResponse,
} from "@shared/ipc/deeplink.js";
import { markElectronDeepLinkReady } from "@onething/electron-host/deeplink/protocol";
import { respondToDeepLink } from "@onething/electron-host/deeplink/service";

export function registerDeepLinkHandlers(): void {
	ipcMain.handle(IPC_CHANNELS.DEEPLINK_READY, async (): Promise<{ success: true }> => {
		markElectronDeepLinkReady();
		return { success: true };
	});

	ipcMain.handle(
		IPC_CHANNELS.DEEPLINK_RESPOND,
		async (_event, request: DeepLinkRespondRequest): Promise<DeepLinkRespondResponse> => {
			try {
				return await respondToDeepLink(request);
			} catch (error) {
				// 派发口本身从不抛(它回结构化结果),这里兜的是"意料之外"——
				// 兜住是为了让确认卡拿到一句能显示的话,而不是一个 pending 的 promise。
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);
}
