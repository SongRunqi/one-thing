/**
 * Driving a goal run. `emitGoalDrive` is the single place that builds the
 * goal-drive command — the idle kick (goal create/resume, transient-error
 * retry) and the cross-run continuation trigger both go through it, so the
 * envelope invariants live in exactly one spot:
 *
 * - source 'goal' marks the message system-internal: the stream engine
 *   routes it without channel-identity resolution (it must land back in the
 *   goal's own session), counterpart-identity scans skip its origin, and
 *   the renderer folds it into a compact continuation line.
 * - `channel` must be the session's real transport channel. Permission
 *   requests remember the channel active when they were asked and reject
 *   responses from any other channel — stamping a synthetic value here
 *   would make every permission prompt raised during the run reject the
 *   user's real approval as "wrong channel". The engine's in-memory channel
 *   entry is deleted whenever a run ends (and kicks fire exactly when no
 *   run is active), so the live lookup alone would always fall back to
 *   'ipc'; gateway sessions persist their connector on the session
 *   (lastConnector, written by the identity router), which takes over when
 *   the live value carries no information.
 *
 * Drives are not recorded as automatic continuations — they are user- or
 * system-initiated turns the continuation allowance counts from.
 */
import { renderGoalContinuationPrompt } from "@onething/runtime/goals";
import type { SessionGoal } from "@onething/runtime/goals";
import { getStreamEngineSafe } from "../engine/index.js";
import { getEventBus } from "../events/index.js";
import * as store from "../store.js";
import { getGoal, goalLimits } from "./index.js";

function goalRunChannel(sessionId: string): string | undefined {
	const live = getStreamEngineSafe()?.getChannel(sessionId);
	// 'ipc' is also getChannel's no-entry fallback, so it carries no signal;
	// prefer the session's persisted connector in that case.
	if (live && live !== "ipc") return live;
	return store.getSession(sessionId)?.lastConnector || live;
}

export async function emitGoalDrive(
	sessionId: string,
	goal: SessionGoal,
): Promise<void> {
	try {
		await getEventBus().emit(sessionId, {
			type: "command:send-message",
			channel: goalRunChannel(sessionId),
			content: renderGoalContinuationPrompt(goal, goalLimits()),
			source: "goal",
			origin: { transport: "api", source: "goal", receivedAt: Date.now() },
		});
	} catch (error) {
		console.error("[goals] Failed to start goal run:", error);
	}
}

export function kickGoalRunIfIdle(sessionId: string, goal?: SessionGoal): void {
	const target = goal ?? getGoal(sessionId);
	if (!target || target.status !== "active") return;
	if (getStreamEngineSafe()?.getController(sessionId)) return;
	void emitGoalDrive(sessionId, target);
}
