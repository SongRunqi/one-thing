/**
 * Slice a session's messages down to what the model actually sees after
 * context compaction: everything after the summary anchor. The dedupe below
 * must compare against blocks the model can still see — a block that was
 * summarized away no longer counts as "already injected".
 */
export function visibleMessagesAfterSummary<T extends { id?: string }>(
	messages: ReadonlyArray<T>,
	summaryUpToMessageId: string | undefined,
): ReadonlyArray<T> {
	if (!summaryUpToMessageId) return messages;
	const anchor = messages.findIndex(
		(message) => message.id === summaryUpToMessageId,
	);
	return anchor === -1 ? messages : messages.slice(anchor + 1);
}

/**
 * Decide whether a turn-volatile context block should be attached to the
 * user message being created.
 *
 * Returns the trimmed turn text, or undefined when nothing should be
 * attached: empty text, or the text equals the most recently injected block
 * in this session (dedupe). History stays append-only — previously injected
 * blocks are never rewritten, so the prompt-cache prefix is preserved.
 *
 * Note on vanishing state: the turn text is the whole state board joined
 * (datetime is always present), so a variable disappearing from the board
 * changes the joined text and produces a fresh block — combined with the
 * "most recent block supersedes all earlier ones" prompt convention, removal
 * is communicated without a tombstone.
 */
export function resolveTurnContextUpdateText(
	turnText: string | undefined | null,
	messages: ReadonlyArray<{ contextUpdate?: unknown }>,
): string | undefined {
	const trimmed = turnText?.trim();
	if (!trimmed) return undefined;
	for (let i = messages.length - 1; i >= 0; i--) {
		const previous = messages[i].contextUpdate;
		if (typeof previous === "string") {
			return previous === trimmed ? undefined : trimmed;
		}
	}
	return trimmed;
}

/**
 * Render a persisted turn context block into model-facing message content.
 * Must stay byte-stable: rebuilds replay the stored field verbatim.
 */
export function renderContextUpdateBlock(content: string, contextUpdate: string): string {
	return `${content}\n\n<context-update>\n${contextUpdate}\n</context-update>`;
}
