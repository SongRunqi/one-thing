/**
 * Token usage / billing IPC handler.
 *
 * Read-only: aggregates the append-only usage ledger (src/main/usage) into
 * day/week/month buckets for the settings usage panel. See
 * docs/design/token-billing.md.
 */
import { ipcMain } from "electron";
import { getOnethingUsageSummary } from "@onething/runtime/usage";
import {
	IPC_CHANNELS,
	type GetSessionUsageRequest,
	type GetSessionUsageResponse,
	type GetUsageSummaryRequest,
	type GetUsageSummaryResponse,
} from "@shared/ipc.js";
import { getSessionUsageTotal, getUsageLedger } from "../usage/index.js";

export function registerUsageHandlers(): void {
	ipcMain.handle(
		IPC_CHANNELS.GET_USAGE_SUMMARY,
		async (_event, request: GetUsageSummaryRequest): Promise<GetUsageSummaryResponse> => {
			return getOnethingUsageSummary(getUsageLedger(), {
				granularity: request.granularity,
				count: request.count,
			});
		},
	);

	ipcMain.handle(
		IPC_CHANNELS.GET_SESSION_USAGE,
		async (_event, request: GetSessionUsageRequest): Promise<GetSessionUsageResponse> => {
			return getSessionUsageTotal(request.sessionId);
		},
	);
}
