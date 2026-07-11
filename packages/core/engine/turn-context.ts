/**
 * Decide whether a turn-volatile context block should be attached to the
 * user message being created.
 *
 * Returns the trimmed turn text, or undefined when nothing should be
 * attached: empty text, or the text equals the most recently injected block
 * in this session (dedupe). History stays append-only — previously injected
 * blocks are never rewritten, so the prompt-cache prefix is preserved.
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
