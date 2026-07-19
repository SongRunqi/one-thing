/**
 * Practice IPC handlers: rhythm session control (kegel / pomodoro), quick
 * exercise logging, and ledger queries. State pushes go the other way, via
 * IPCBridge on the PRACTICE_EVENT channel. See docs/design/practice-system.md.
 */
import { ipcMain } from "electron";
import {
	IPC_CHANNELS,
	type PracticeConfigResponse,
	type PracticeLogRequest,
	type PracticeLogResponse,
	type PracticeRecentRequest,
	type PracticeRecentResponse,
	type PracticeSetConfigRequest,
	type PracticeStartRequest,
	type PracticeStateResponse,
	type PracticeStopRequest,
	type PracticeSummaryRequest,
	type PracticeSummaryResult,
} from "../../shared/ipc.js";
import {
	getPracticeState,
	getPracticeSummary,
	getRecentPracticeRecords,
	logPractice,
	pausePractice,
	readPracticeConfig,
	resumePractice,
	startPractice,
	stopPractice,
	writePracticeConfig,
} from "../practice/index.js";

export function registerPracticeHandlers(): void {
	ipcMain.handle(
		IPC_CHANNELS.PRACTICE_START,
		async (_event, request: PracticeStartRequest): Promise<PracticeStateResponse> => {
			return { snapshot: await startPractice(request) };
		},
	);

	ipcMain.handle(IPC_CHANNELS.PRACTICE_PAUSE, async (): Promise<PracticeStateResponse> => {
		return { snapshot: pausePractice() };
	});

	ipcMain.handle(IPC_CHANNELS.PRACTICE_RESUME, async (): Promise<PracticeStateResponse> => {
		return { snapshot: resumePractice() };
	});

	ipcMain.handle(
		IPC_CHANNELS.PRACTICE_STOP,
		async (_event, request?: PracticeStopRequest): Promise<PracticeStateResponse> => {
			return { snapshot: stopPractice(request?.discard ?? false) };
		},
	);

	ipcMain.handle(IPC_CHANNELS.PRACTICE_GET_STATE, async (): Promise<PracticeStateResponse> => {
		return { snapshot: getPracticeState() };
	});

	ipcMain.handle(
		IPC_CHANNELS.PRACTICE_LOG,
		async (_event, request: PracticeLogRequest): Promise<PracticeLogResponse> => {
			return { record: logPractice(request) };
		},
	);

	ipcMain.handle(
		IPC_CHANNELS.PRACTICE_SUMMARY,
		async (_event, request: PracticeSummaryRequest): Promise<PracticeSummaryResult> => {
			return getPracticeSummary(request);
		},
	);

	ipcMain.handle(
		IPC_CHANNELS.PRACTICE_RECENT,
		async (_event, request: PracticeRecentRequest = {}): Promise<PracticeRecentResponse> => {
			return { records: await getRecentPracticeRecords(request.days, request.limit) };
		},
	);

	ipcMain.handle(IPC_CHANNELS.PRACTICE_GET_CONFIG, async (): Promise<PracticeConfigResponse> => {
		return { config: await readPracticeConfig() };
	});

	ipcMain.handle(
		IPC_CHANNELS.PRACTICE_SET_CONFIG,
		async (_event, request: PracticeSetConfigRequest): Promise<PracticeConfigResponse> => {
			return { config: await writePracticeConfig(request) };
		},
	);
}
