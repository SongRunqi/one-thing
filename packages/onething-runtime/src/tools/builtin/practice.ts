import { z } from "zod";
import type { JsonObject, JsonObjectProperty } from "@onething/core";
import { Tool } from "../tool.js";
import type {
	OnethingPracticeLedgerRecord,
	OnethingPracticeRecordInput,
} from "../../practice/types.js";
import type {
	OnethingPracticeBucket,
	OnethingPracticeSummaryGranularity,
	OnethingPracticeSummaryResult,
} from "../../practice/summary.js";

/**
 * The agent's handle on the practice ledger (kegel / pomodoro / exercise).
 * Timer sessions land in the ledger on their own; this tool covers the other
 * two directions — the user telling the assistant what they did ("刚做了
 * 3 组俯卧撑"), and the assistant reading the ledger to summarize trends or
 * suggest progression. Suggestions stay in conversation; the tool never
 * changes practice parameters.
 */

export interface PracticeToolAdapters {
	log(input: Omit<OnethingPracticeRecordInput, "kind" | "source">): OnethingPracticeLedgerRecord | Promise<OnethingPracticeLedgerRecord>;
	query(request: { granularity: OnethingPracticeSummaryGranularity; count?: number }): Promise<OnethingPracticeSummaryResult>;
	recent(days?: number, limit?: number): Promise<OnethingPracticeLedgerRecord[]>;
}

interface PracticeMetadata extends JsonObject {
	action: string;
	[key: string]: JsonObjectProperty;
}

export const PracticeParameters = z.object({
	action: z
		.enum(["log", "query"])
		.describe(
			"log: append one exercise entry the user just reported. query: read aggregated history (plus recent entries) to summarize or advise.",
		),
	name: z
		.string()
		.optional()
		.describe("For log: the activity name as the user said it, e.g. 「俯卧撑」「跑步」."),
	sets: z.number().optional().describe("For log: number of sets, e.g. 3 in 3×20."),
	repsPerSet: z.number().optional().describe("For log: reps per set, e.g. 20 in 3×20."),
	durationMin: z.number().optional().describe("For log: duration in minutes, for time-based exercise like running."),
	note: z.string().optional().describe("For log: optional free-form remark from the user."),
	granularity: z
		.enum(["day", "week", "month"])
		.optional()
		.describe("For query: bucket size. Defaults to day (last 14 days)."),
	count: z.number().optional().describe("For query: how many trailing buckets."),
});

function formatBucket(bucket: OnethingPracticeBucket): string | null {
	if (bucket.records === 0) return null;
	const parts: string[] = [];
	if (bucket.kegel.sessions > 0) {
		parts.push(`凯格尔 ${bucket.kegel.sessions} 次(完成 ${bucket.kegel.completedSessions})· ${bucket.kegel.reps} rep`);
	}
	if (bucket.pomodoro.sessions > 0) {
		const cats = bucket.pomodoro.byCategory
			.map((c) => `${c.key} ${c.sessions}/${c.minutes}′`)
			.join(" ");
		parts.push(`番茄 ${bucket.pomodoro.sessions} 轮 ${bucket.pomodoro.minutes}′(${cats})`);
	}
	for (const ex of bucket.exercise.byName) {
		const volume = ex.reps > 0 ? `${ex.sets} 组 ${ex.reps} 个` : `${ex.durationMin}′`;
		parts.push(`${ex.key} ${volume}`);
	}
	return `${bucket.bucketKey} · ${parts.join(" · ")}`;
}

function formatRecent(records: OnethingPracticeLedgerRecord[]): string {
	if (records.length === 0) return "";
	const lines = records.slice(0, 10).map((record) => {
		const date = new Date(record.ts);
		const stamp = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
		if (record.kind === "kegel" && record.kegel) {
			return `${stamp} 凯格尔 ${record.kegel.repsDone} rep · 组 ${record.kegel.setsDone}/${record.kegel.setsTarget}`;
		}
		if (record.kind === "pomodoro" && record.pomodoro) {
			return `${stamp} 番茄·${record.name} ${record.pomodoro.elapsedMin}′${record.pomodoro.completed ? "" : "(中断)"}`;
		}
		const ex = record.exercise;
		const volume = ex?.sets && ex.repsPerSet ? `${ex.sets}×${ex.repsPerSet}` : ex?.durationMin ? `${ex.durationMin}′` : "";
		return `${stamp} ${record.name} ${volume}`.trimEnd();
	});
	return `\n最近条目:\n${lines.join("\n")}`;
}

export function createPracticeTool(
	adapters: PracticeToolAdapters,
): Tool.Info<typeof PracticeParameters, PracticeMetadata> {
	return Tool.define<typeof PracticeParameters, PracticeMetadata>("practice", {
		name: "Practice",
		description: `Log and review the user's practice: kegel sessions, pomodoro focus rounds, and physical exercise.

- log: when the user reports exercise done outside the app's timers ("刚做了 3 组俯卧撑,每组 20 个", "跑了半小时"), record it — name plus sets×repsPerSet or durationMin. Do not log kegel or pomodoro sessions yourself; the timer records those.
- query: when the user asks about their practice, or you want grounding for a summary or a progression suggestion, read the aggregates first and base every number on them. Suggestions (e.g. longer holds) are conversation only — never present them as applied changes.`,
		category: "builtin",
		enabled: true,
		autoExecute: true,
		permissionGuard: "safe",
		executionMode: "sequential",
		renderKind: "text",

		parameters: PracticeParameters,

		async execute(args) {
			if (args.action === "log") {
				const name = args.name?.trim();
				if (!name) {
					return {
						title: "缺少名称",
						output: "log 需要 name:用户报的项目名(如「俯卧撑」),配 sets×repsPerSet 或 durationMin。",
						metadata: { action: args.action },
					};
				}
				const record = await adapters.log({
					name,
					note: args.note,
					exercise: {
						sets: args.sets,
						repsPerSet: args.repsPerSet,
						durationMin: args.durationMin,
					},
				});
				const volume = record.exercise?.sets && record.exercise.repsPerSet
					? `${record.exercise.sets}×${record.exercise.repsPerSet}`
					: record.exercise?.durationMin
						? `${record.exercise.durationMin}′`
						: "";
				return {
					title: "已记上",
					output: `${record.name} ${volume} 已入账(${new Date(record.ts).toLocaleString()})。`.replace("  ", " "),
					metadata: { action: args.action },
				};
			}

			const granularity = args.granularity ?? "day";
			const [summary, recent] = await Promise.all([
				adapters.query({ granularity, count: args.count }),
				adapters.recent(),
			]);
			const lines = summary.buckets
				.map(formatBucket)
				.filter((line): line is string => line !== null);
			const body = lines.length > 0 ? lines.join("\n") : "所选区间内没有练习记录。";
			return {
				title: "练习账本",
				output: `${body}${formatRecent(recent)}`,
				metadata: { action: args.action },
			};
		},
	});
}
