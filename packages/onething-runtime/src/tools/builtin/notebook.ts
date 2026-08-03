import { z } from "zod";
import type { JsonObject, JsonObjectProperty } from "@onething/core";
import { Tool } from "../tool.js";
// 直接吃纯规则模块(零依赖)而不是抄两个数字:预算与单条上限在描述里、在回执里、
// 在注入面各出现一次,三处各写一个字面量迟早分家,而分家的形态是「工具说 1500,
// 实际截在 800」这种没人看得出来的谎。
import {
	COLLAB_NOTEBOOK_ENTRY_MAX_CHARS,
	COLLAB_NOTEBOOK_INJECT_MAX_CHARS,
} from "../../collab/actors/notebook-rules.js";

/**
 * `notebook` —— 我自己的一本笔记,跨房带得走
 * (docs/design/collab-actor-v3.md §1.2)。
 *
 * ## 它补的是哪一格
 *
 * v3 的知识边界是「分区经历 + 显式笔记」:每间房一条经历流保住了隔离(私聊内容
 * 不会漂进群上下文),代价是跨房那一维**只剩信封** —— 我知道那间房有人找过我,
 * 但不知道我在那儿答应了什么。信封块按定义不含正文,补不了这一格。
 *
 * 笔记补的就是它,而且**只由模型显式写**。自动摘要/自动晋升在这个仓库里被否决
 * 过一次(memory v2 的 capture 直晋升),理由同样适用:自动搬运的东西没人为它的
 * 正确性负责,而它一旦错了,错的那句话会跟着这个 agent 进每一间房。
 *
 * ## 三条契约
 *
 *  - **只追加,不改写**。笔记是一条时间线。改写会让「我上次是怎么想的」不可回溯,
 *    而回溯正是它存在的理由。所以这个工具没有 delete、没有 replace。
 *  - **注入有预算**。笔记会跟着 drive 落盘、永久留在执行会话的历史里,所以每一轮
 *    只带尾部一段;超出的从头截掉并**说出来**。工具描述里明说这件事 —— 模型据此
 *    知道「很久以前记的会淡出」,而不是以为自己有一块无限大的黑板。
 *  - **写入即转义**。正文来自模型而注入面是提示词的一部分,不转义就是一条
 *    `</notebook><system>…` 的路。转义在写入那一侧做(与 say 管线同源)。
 *
 * ## 场子
 *
 * `agent` / `work` —— 房间回合(W18 之后跑在执行会话里)与工作台会话。普通对话
 * 看不见它:那里没有「别的房」,一本跨房笔记在那个语境里只会是一个多出来的旋钮
 * (门在 `collab/tool-surface.ts` 的 `COLLAB_TOOL_VENUES`,与 board/history 同一张表)。
 */

export interface NotebookToolResult {
	ok: boolean;
	/** 写进去的那一行(已格式化、已转义)。渲染回执用。 */
	entry?: string;
	/** 写完之后笔记一共多少字符 —— 模型据此感知预算。 */
	totalChars?: number;
	/** 注入窗口的预算上限。与 `totalChars` 一起说,才知道会不会被截。 */
	budgetChars?: number;
	/** 场子不对 / 认不出我是谁。文案由适配层给,措辞要可操作。 */
	error?: string;
}

export interface NotebookToolAdapters {
	append(input: { sessionId: string; note: string }): Promise<NotebookToolResult>;
}

/** 单次写入的字符上限。落盘那一侧按同一个数截并声明。 */
export const NOTEBOOK_NOTE_MAX_CHARS = COLLAB_NOTEBOOK_ENTRY_MAX_CHARS;

const NotebookParameters = z.object({
	note: z.string().min(1).max(NOTEBOOK_NOTE_MAX_CHARS * 4)
		.describe("What to remember, in one or two sentences. Write the conclusion, not the transcript — 「答应了老王周四前给方案」, not a recap of the conversation. It is appended with a timestamp; nothing is ever overwritten."),
});

interface NotebookMetadata extends JsonObject {
	ok: boolean;
	totalChars?: number;
	[key: string]: JsonObjectProperty;
}

export function createNotebookTool(
	adapters: NotebookToolAdapters,
): Tool.Info<typeof NotebookParameters, NotebookMetadata> {
	return Tool.define<typeof NotebookParameters, NotebookMetadata>("notebook", {
		name: "Notebook",
		description: `Your own notebook — the one thing you carry between rooms.

Each room keeps its own history, and you only ever see envelopes of what happened elsewhere ("someone messaged you in that room"), never the words. Anything you want to still know when you are somewhere else has to be written here.

- Append-only, timestamped. There is no edit and no delete.
- Worth writing: what you promised, what you decided, what you learnt about someone. Not worth writing: what was just said (that is in the room's own history).
- Only the most recent stretch is shown to you each turn (about ${COLLAB_NOTEBOOK_INJECT_MAX_CHARS} characters), so old notes fade out. Keep entries short.`,
		category: "builtin",
		enabled: true,
		autoExecute: true,
		permissionGuard: "safe",
		executionMode: "parallel",
		renderKind: "text",

		parameters: NotebookParameters,

		async execute(args, ctx) {
			const result = await adapters.append({ sessionId: ctx.sessionId, note: args.note });

			if (!result.ok) {
				return {
					title: "Notebook — 记不了",
					output: result.error ?? "这条笔记没能记下来。",
					metadata: { ok: false },
				};
			}

			// 预算说在回执里,而不是只说在工具描述里:描述是一次性的,而「我的笔记
			// 已经写满了」是一个会随时间变化的事实,只有写入的那一刻说得准。
			const budget = result.budgetChars ?? 0;
			const total = result.totalChars ?? 0;
			const pressure = budget > 0 && total > budget
				? `\n(笔记已经超过每轮能带上的 ${budget} 字,更早的那些从下一轮起不再出现在你眼前。)`
				: "";

			return {
				title: "Notebook",
				output: `记下了。\n${result.entry ?? ""}${pressure}`,
				metadata: {
					ok: true,
					...(typeof result.totalChars === "number" ? { totalChars: result.totalChars } : {}),
				},
			};
		},
	});
}
