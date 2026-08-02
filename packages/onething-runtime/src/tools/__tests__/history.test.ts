/**
 * `history` 的**面向模型的文案**（docs/design/collab-history-search.md §S2）。
 *
 * 这里守的不是逻辑，是措辞。两条线：
 *
 *  1. **空结果分四态**。前身把三种不同的事实共用一句「没有符合条件的历史消息」，
 *     模型据此给出带确定性的否定 —— 那是这套系统里最贵的一类错误。
 *  2. **每处截断都要说出来**。工具结果在这套系统里**永久累积**在聊天记录里，
 *     所以上限是硬的；而一个被静默截断的结果，读起来和"什么都没发生"一模一样。
 */
import { describe, expect, it } from "vitest";
import {
	HISTORY_MAX_LIMIT,
	createHistoryTool,
	type HistoryToolResult,
} from "../builtin/history.js";

function toolWith(result: HistoryToolResult) {
	const tool = createHistoryTool({ search: async () => result });
	return (args: Record<string, unknown> = {}) =>
		tool.execute(
			args as never,
			{ sessionId: "exec-1" } as unknown as Parameters<typeof tool.execute>[1],
		);
}

const LINE = { line: '<message from="Iris#eba0c4b7" room="cumo" time="07-28 14:10">hi</message>' };

describe("空结果五态", () => {
	it("一间房都进不去", async () => {
		const out = await toolWith({ ok: true, entries: [], noRooms: true })();
		expect(out.output).toContain("还没有加入任何房间");
	});

	it("房不存在 / 不是我的 —— 同一句话，并列出我能查的", async () => {
		const out = await toolWith({
			ok: true,
			entries: [],
			unknownRoom: { available: ["cumo", "Bram ⇄ Iris"] },
		})();
		expect(out.output).toContain("没有这样一间房");
		expect(out.output).toContain("cumo");
		// 「不存在」与「不是你的」必须同一句 —— 分开说等于给出一个探测面
		expect(out.output).not.toMatch(/无权|不属于你|permission/i);
	});

	it("范围里确实一条都没有", async () => {
		const out = await toolWith({ ok: true, entries: [], total: 0 })();
		expect(out.output).toContain("这个范围里没有任何消息");
	});

	it("关键词没命中 → 不返回空，退回范围并说明", async () => {
		const out = await toolWith({
			ok: true,
			entries: [LINE],
			total: 1,
			fellBackToRange: true,
		})();
		expect(out.output).toContain("没有匹配到关键词");
		expect(out.output).toContain("<message from=");
	});

	it("带游标翻到尽头 ≠ 这个范围里没有消息", async () => {
		const out = await toolWith({
			ok: true, entries: [], endOfRange: true, total: 42,
		})();
		expect(out.output).toContain("已经翻到最早的一条");
		expect(out.output).not.toContain("没有任何消息");
		// 这一趟翻页真正的答案是「一共见过多少条」
		expect(out.output).toContain("42 条");
		// 空页 ≠ 命中数为零 —— 硬编码 total:0 会把真实命中数盖掉
		expect(out.metadata.total).toBe(42);
	});

	it("五态文案两两不同 —— 合并任意两种就等于回到出事前", async () => {
		const outs = await Promise.all([
			toolWith({ ok: true, entries: [], noRooms: true })(),
			toolWith({ ok: true, entries: [], unknownRoom: { available: ["cumo"] } })(),
			toolWith({ ok: true, entries: [], total: 0 })(),
			toolWith({ ok: true, entries: [], endOfRange: true, total: 42 })(),
			toolWith({ ok: true, entries: [LINE], fellBackToRange: true })(),
		]);
		expect(new Set(outs.map(o => o.output)).size).toBe(5);
	});
});

describe("截断必须可见", () => {
	it("有房没扫到 → 说出数字，并给出下一步", async () => {
		const out = await toolWith({
			ok: true,
			entries: [LINE],
			total: 1,
			scannedRooms: 10,
			skippedRooms: 7,
		})();
		expect(out.output).toContain("7 间这次没查到");
		expect(out.output).toMatch(/缩小|where/);
		expect(out.metadata.skippedRooms).toBe(7);
		// 扫了几间必须和漏了几间在同一行:只说漏了 7 间，模型无从判断这占多大比例
		expect(out.output).toContain("查了 10 间房");
	});

	it("覆盖面必须进 output —— metadata 是给 UI 的，模型看不见", async () => {
		const out = await toolWith({ ok: true, entries: [LINE], total: 1, scannedRooms: 5 })();
		expect(out.output).toContain("查了 5 间房");
	});

	it("空结果时也要说 —— 否则「没扫到」读起来就是「没有」", async () => {
		const out = await toolWith({ ok: true, entries: [], total: 0, skippedRooms: 3 })();
		expect(out.output).toContain("3 间这次没查到");
	});

	it("cursor 提示要写明筛选条件必须一致", async () => {
		const out = await toolWith({
			ok: true,
			entries: [LINE],
			total: 50,
			nextCursor: "1785297601000:room-1:m2|abc",
		})();
		expect(out.output).toContain("更早");
		expect(out.output).toContain('cursor="1785297601000:room-1:m2|abc"');
		expect(out.output).toContain("筛选条件");
	});
});

describe("契约", () => {
	const tool = createHistoryTool({ search: async () => ({ ok: true }) });
	const shape = (tool.parameters as unknown as {
		shape: Record<string, { description?: string }>;
	}).shape;

	it("q 的描述必须劝退整句检索，并说明查不到会怎样", () => {
		expect(shape.q?.description).toMatch(/one or two keywords/i);
		expect(shape.q?.description).toMatch(/most recent messages in the same range/i);
	});

	it("cursor 的描述必须说明方向与同筛选条件", () => {
		expect(shape.cursor?.description).toMatch(/older/i);
		expect(shape.cursor?.description).toMatch(/same filters/i);
	});

	it("where 的描述必须说清「留空 = 我在场的所有房」", () => {
		expect(shape.where?.description).toMatch(/every room you are in/i);
	});

	it("工具描述里必须写明授权边界与「不会静默截断」", () => {
		expect(tool.description).toMatch(/never part of/i);
		expect(tool.description).toMatch(/never silent truncation/i);
	});

	it("limit 有硬上限", () => {
		expect(HISTORY_MAX_LIMIT).toBe(30);
	});
});
