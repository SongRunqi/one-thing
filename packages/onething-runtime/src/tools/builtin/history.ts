import { z } from "zod";
import type { JsonObject, JsonObjectProperty } from "@onething/core";
import { Tool } from "../tool.js";

/**
 * `history` —— 翻我在场过的任何一间房的聊天记录
 * (docs/design/collab-history-search.md)。
 *
 * ## 它取代了什么
 *
 * 前身 `room_history` **只查当前这间房、只查折叠段**。那条限制在 2026-08-01 出过
 * 事故:一位同事在群回合里被问「收到 dm 了吗」,答「没收到」—— 而消息就躺在它
 * 自己的私聊房里,它只是读不到别的房。
 *
 * 产品决定取消默认隔离之后,边界从「当前这间房」改成「**我在场过的房**」:群聊、
 * 我和用户的私聊、我和同事的私聊,一视同仁;**别人之间的对话仍然看不到**。
 *
 * ## 三条契约,每条都是踩出来的
 *
 *  - **结果必然有上限**。工具结果落在缓存前缀之外是全价 token,而且这套系统里
 *    执行会话就是模型读的那份聊天记录 —— 工具结果**永久累积**,不是"这轮用完就
 *    丢"。所以上限是硬的,而且**每一处截断都要留下可见标记**:静默丢弃读起来
 *    和"什么都没发生"一模一样。
 *  - **空结果分四态**。前身把三种不同的事实共用一句「没有符合条件的历史消息」,
 *    模型据此给出**带确定性的否定**——那是这套系统里最贵的一类错误。
 *  - **关键词查不到不返回空**,退回"这个范围里最近 N 条"并说明。子串匹配对中文
 *    几乎必空(无分词),而模型填错的几乎总是关键词;让一个坏关键词把一个好范围
 *    清零是最贵的失败。
 */

export interface HistoryEntry {
	/** `<message>` 信封原样,与房间投影同一种形状 —— 别让模型学两套格式。 */
	line: string;
}

export interface HistoryToolResult {
	ok: boolean;
	entries?: HistoryEntry[];
	/**
	 * 命中总数(可能远大于返回条数)。
	 *
	 * `skippedRooms > 0` 时这是**已扫房间内**的命中数,不是全部 —— 所以那两个字段
	 * 必须一起渲染,单看一个会把"查了一部分"读成"就这么多"。
	 */
	total?: number;
	/** 还有更多时的下一页游标。方向恒定:**更早**。 */
	nextCursor?: string;
	/** 实际扫了几间房。有结果时必须渲染 —— 模型无从他处得知这次查了多宽。 */
	scannedRooms?: number;
	/** 因为上限(房数或字节数)没扫到的房数。>0 必须渲染出来。 */
	skippedRooms?: number;
	/** 关键词没命中、退回"这个范围里最近 N 条"。 */
	fellBackToRange?: boolean;
	/** 这位同事一间房都进不去。 */
	noRooms?: boolean;
	/** `where` 指到了一间不存在、或不属于我的房。附我能查的房名。 */
	unknownRoom?: { available: string[] };
	/**
	 * 带着游标翻到了尽头。
	 *
	 * 与"这个范围里什么都没有"是**两件事**:前者是"翻完了",后者是"从来没有过"。
	 * 共用一句话就等于让模型把一次成功的翻页读成一个否定答案。
	 */
	endOfRange?: boolean;
	error?: string;
}

export interface HistoryToolAdapters {
	search(input: {
		sessionId: string;
		q?: string;
		who?: string;
		where?: string;
		since?: string;
		until?: string;
		limit: number;
		cursor?: string;
	}): Promise<HistoryToolResult>;
}

/** 一次最多返回多少条。上限而非建议 —— 见文件头关于永久累积的那段。 */
export const HISTORY_MAX_LIMIT = 30;
const HISTORY_DEFAULT_LIMIT = 10;

const HistoryParameters = z.object({
	q: z.string().optional()
		.describe("Only messages containing this text. Plain substring, case-insensitive — no tokenising, no fuzzy match. Pass one or two keywords, never a whole sentence: a sentence almost never appears verbatim. If it matches nothing, you get the most recent messages in the same range instead, clearly marked."),
	who: z.string().optional()
		.describe("Only messages from this speaker — a name or 名字#句柄 as it appears in a roster, 「用户」 for the human, 「系统」 for room system lines. Leave out for everyone."),
	where: z.string().optional()
		.describe("Which room: a room name, or 名字#句柄 to mean your private chat with that colleague. Leave out to search every room you are in."),
	since: z.string().optional()
		.describe("Earliest day to look at, YYYY-MM-DD."),
	until: z.string().optional()
		.describe("Latest day to look at, YYYY-MM-DD."),
	limit: z.number().int().min(1).max(HISTORY_MAX_LIMIT).optional()
		.describe(`How many messages to return, newest first. Default ${HISTORY_DEFAULT_LIMIT}, max ${HISTORY_MAX_LIMIT}.`),
	cursor: z.string().optional()
		.describe("Continue from a previous call — pass the nextCursor it returned. Paging always walks towards OLDER messages, and a cursor only works with the exact same filters."),
});

interface HistoryMetadata extends JsonObject {
	ok: boolean;
	returned?: number;
	total?: number;
	scannedRooms?: number;
	skippedRooms?: number;
	[key: string]: JsonObjectProperty;
}

/**
 * 空结果的五态。判据全在 result 上,不靠调用方多传。
 *
 * 每一句都要把**下一步**说出来:一句只说"没有"的话,模型只能当终局答案 ——
 * 而这五种情况里有四种,正确的下一步都不是"放弃"。
 *
 * 顺序即优先级:先答"你这次根本没查成"(前两态),再答"查成了但翻完了"
 * (`endOfRange`),最后才是"确实一条都没有"。倒过来会让前面几种事实被最兜底
 * 的那句话吞掉。
 */
function emptyOutput(result: HistoryToolResult): string {
	if (result.noRooms) {
		return "你还没有加入任何房间,没有可查的历史。";
	}
	if (result.unknownRoom) {
		const names = result.unknownRoom.available;
		// 同一句话覆盖「不存在」与「不是你的」—— 分开说等于给出一个探测面:
		// 试一个房名,靠回话的不同就能确认那间房存不存在。
		return names.length
			? `没有这样一间房。你能查的是:${names.join("、")}。`
			: "没有这样一间房。";
	}
	if (result.endOfRange) {
		// 「翻完了」不是「没有过」。这一句下面通常还跟着一行 total,那才是这次
		// 翻页真正的答案:一共见过多少条。
		return "已经翻到最早的一条了,这个范围里没有更早的消息。";
	}
	return "这个范围里没有任何消息。换个时间段、换个人,或者去掉筛选条件再看看。";
}

/**
 * 覆盖面与每一处截断,都要出一行。
 *
 * 静默丢弃读起来和"什么都没发生"一模一样 —— 而这套系统里模型没有别的途径知道
 * 这次查了多宽:`metadata` 是给 UI 的,它看不见。
 */
function noticeLines(result: HistoryToolResult): string[] {
	const lines: string[] = [];
	if (result.fellBackToRange) {
		lines.push("(没有匹配到关键词。以下是这个范围里最近的几条。)");
	}
	if (result.skippedRooms) {
		// 扫了几间**和**漏了几间写在同一行:只说漏了几间,模型无从判断这个数字
		// 占多大比例;只说扫了几间,漏掉的那些就彻底消失了。
		const scanned = typeof result.scannedRooms === "number" ? `查了 ${result.scannedRooms} 间房,` : "";
		lines.push(`(${scanned}还有 ${result.skippedRooms} 间这次没查到。缩小 where 或时间范围可以覆盖它们。)`);
	} else if (typeof result.scannedRooms === "number" && result.scannedRooms > 0) {
		lines.push(`(查了 ${result.scannedRooms} 间房。)`);
	}
	return lines;
}

export function createHistoryTool(
	adapters: HistoryToolAdapters,
): Tool.Info<typeof HistoryParameters, HistoryMetadata> {
	return Tool.define<typeof HistoryParameters, HistoryMetadata>("history", {
		name: "History",
		description: `Search the chat history of any room you are in — group rooms and private chats alike.

- Scope is fixed by who you are: every room you are a member of, plus rooms you were removed from (up to the moment you left). Conversations you were never part of do not exist for this tool.
- Narrow it down: "where" (a room, or a colleague for your private chat with them), "who", "since"/"until" (YYYY-MM-DD), "q".
- Results are capped (max ${HISTORY_MAX_LIMIT}) and come back newest first, in the same <message> form as your room payload. If there are more, pass the returned cursor.
- Anything this tool leaves out says so in the output — a short result is never silent truncation.`,
		category: "builtin",
		enabled: true,
		autoExecute: true,
		permissionGuard: "safe",
		executionMode: "parallel",
		renderKind: "text",

		parameters: HistoryParameters,

		async execute(args, ctx) {
			const result = await adapters.search({
				sessionId: ctx.sessionId,
				...(args.q ? { q: args.q } : {}),
				...(args.who ? { who: args.who } : {}),
				...(args.where ? { where: args.where } : {}),
				...(args.since ? { since: args.since } : {}),
				...(args.until ? { until: args.until } : {}),
				limit: Math.min(args.limit ?? HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT),
				...(args.cursor ? { cursor: args.cursor } : {}),
			});

			if (!result.ok) {
				return {
					title: "History — 查不了",
					output: result.error ?? "翻不了历史。",
					metadata: { ok: false },
				};
			}

			const entries = result.entries ?? [];
			const notices = noticeLines(result);

			if (entries.length === 0) {
				// 翻到尽头时把总数说出来 —— 这一趟翻页真正的答案是「一共见过多少条」,
				// 而不是「这一页是空的」。
				const seen = result.endOfRange && result.total
					? `\n(这个范围里一共 ${result.total} 条,你已经全部翻过。)`
					: "";
				return {
					title: "History",
					output: [emptyOutput(result), ...notices].join("\n") + seen,
					metadata: {
						ok: true,
						returned: 0,
						// 空页 ≠ 命中数为零:带游标翻到尽头时 total 是这次查询的全部命中。
						total: result.total ?? 0,
						...(typeof result.scannedRooms === "number" ? { scannedRooms: result.scannedRooms } : {}),
						...(result.skippedRooms ? { skippedRooms: result.skippedRooms } : {}),
					},
				};
			}

			const more = result.nextCursor
				? `\n\n还有更早的 —— 再查一次并带上 cursor="${result.nextCursor}"(筛选条件要保持一致)。`
				: "";
			return {
				title: `History · ${entries.length} 条`,
				output: [
					...notices,
					entries.map(entry => entry.line).join("\n"),
				].filter(Boolean).join("\n") + more,
				metadata: {
					ok: true,
					returned: entries.length,
					...(typeof result.total === "number" ? { total: result.total } : {}),
					...(typeof result.scannedRooms === "number" ? { scannedRooms: result.scannedRooms } : {}),
					...(result.skippedRooms ? { skippedRooms: result.skippedRooms } : {}),
				},
			};
		},
	});
}
