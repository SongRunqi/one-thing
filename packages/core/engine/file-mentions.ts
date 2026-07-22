import fs from "node:fs";
import { decodeTextBytes, escapeXmlAttribute } from "./message-content.js";

/**
 * Per-mention / per-message ceilings for inlined `@path` files. Like inlined
 * attachments, the rendered block is persisted onto the user message and
 * replayed on every history rebuild, so these caps bound worst-case context
 * growth for the whole life of the session — not just the first turn.
 */
export const INLINE_FILE_MENTION_MAX_CHARS = 32_000;
export const INLINE_FILE_MENTION_TOTAL_CHARS = 96_000;

/**
 * Files larger than this are never read. The model is better served by the read
 * tool (which pages with offsets) than by a truncated head, and reading a huge
 * file just to count its lines would stall the send path.
 */
export const INLINE_FILE_MENTION_MAX_READ_BYTES = 2_000_000;

/**
 * `@` followed by an absolute POSIX path. The leading boundary keeps it off
 * email addresses and `user@host` forms, which have no `/` after the `@`
 * anyway. The match is deliberately greedy — trailing punctuation is trimmed
 * afterwards by testing the candidate against the filesystem.
 */
const FILE_MENTION_PATTERN = /(^|[\s([{"'])@(\/\S+)/g;

/** Sentence punctuation that commonly abuts a path, CJK included. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}>"'。，、；：！？）】》」』]$/;

/**
 * Channels whose messages may inline local files.
 *
 * Every channel funnels through the same handleSendMessage, so this is a real
 * trust boundary rather than a formality: a remote user on a gateway channel
 * typing `@/Users/someone/.ssh/id_rsa` would otherwise have the engine read it
 * and hand it straight to the model. Local senders are the ones who already
 * have the filesystem anyway. This is an allowlist on purpose — a channel added
 * later is untrusted until someone decides otherwise.
 */
const FILE_MENTION_TRUSTED_CHANNELS = new Set([
	"ipc",
	"voice",
	"cli",
	"goal",
	"mock",
]);

export function isFileMentionTrustedChannel(channel?: string): boolean {
	return FILE_MENTION_TRUSTED_CHANNELS.has(channel || "ipc");
}

export interface ExpandFileMentionsResult {
	/** The content with resolvable mentions replaced by `<file>` blocks. */
	content: string;
	/** Absolute paths that were inlined, in first-seen order. */
	inlinedPaths: string[];
}

interface LoadedFile {
	text: string;
	totalLines: number;
}

function loadTextFile(filePath: string): LoadedFile | null {
	try {
		const stats = fs.statSync(filePath);
		if (!stats.isFile()) return null;
		if (stats.size > INLINE_FILE_MENTION_MAX_READ_BYTES) return null;

		const decoded = decodeTextBytes(fs.readFileSync(filePath));
		if (decoded == null) return null;

		const text = decoded.startsWith("﻿") ? decoded.slice(1) : decoded;
		return { text, totalLines: text.split("\n").length };
	} catch {
		// Missing, unreadable, or a path we have no business touching: leave the
		// mention as literal text so the model can still try its own tools.
		return null;
	}
}

function escapeFileBody(text: string): string {
	// Mirrors the attachment inliner: the closing tag is the only sequence that
	// can break out of the wrapper, and the replacement must be deterministic so
	// history rebuilds stay byte-identical and prompt caching holds.
	return text.replace(/<\/file/gi, "<\\/file");
}

/**
 * Cut to whole lines so the "how many lines are left" count we hand the model
 * is exact. A single line longer than the cap is the one case that has to be
 * cut mid-line; it still reports as one shown line, which is true.
 */
function truncateToLines(
	text: string,
	capChars: number,
): { body: string; shownLines: number } {
	if (text.length <= capChars) {
		return { body: text, shownLines: text.split("\n").length };
	}

	const lines = text.split("\n");
	let body = "";
	let shownLines = 0;
	for (const line of lines) {
		const next = shownLines === 0 ? line : `${body}\n${line}`;
		if (next.length > capChars) break;
		body = next;
		shownLines += 1;
	}

	if (shownLines === 0) {
		return { body: text.slice(0, capChars), shownLines: 1 };
	}
	return { body, shownLines };
}

function renderFileBlock(
	filePath: string,
	file: LoadedFile,
	remainingBudgetChars: number,
): { rendered: string; consumedChars: number } | null {
	const cap = Math.min(
		INLINE_FILE_MENTION_MAX_CHARS,
		Math.max(0, remainingBudgetChars),
	);
	if (cap === 0) return null;

	const { body, shownLines } = truncateToLines(file.text, cap);
	const truncated = body.length < file.text.length;
	const pathAttribute = escapeXmlAttribute(filePath);

	// The remaining-line count and the explicit read hint are the point of the
	// truncated form: the model should know the snapshot is partial and that
	// finishing the job is one tool call away, rather than silently reasoning
	// over a head.
	const openTag = truncated
		? `<file path="${pathAttribute}" lines="${file.totalLines}" shown="1-${shownLines}">`
		: `<file path="${pathAttribute}" lines="${file.totalLines}">`;
	const note = truncated
		? `\n[truncated: showing lines 1-${shownLines} of ${file.totalLines}. ` +
			`${file.totalLines - shownLines} lines remain — read ${filePath} if you need them.]`
		: "";

	return {
		rendered: `${openTag}\n${escapeFileBody(body)}${note}\n</file>`,
		consumedChars: body.length,
	};
}

/**
 * Replace `@/absolute/path` mentions with the file's contents inlined as a
 * `<file>` block.
 *
 * Only the model-facing copy should go through this: the display copy keeps the
 * bare `@path` so the user's own bubble stays readable and editing the message
 * gives back what they typed.
 *
 * A mention is left untouched — not flagged, not errored — whenever the path
 * does not resolve to a readable text file under the size ceiling. That covers
 * directories (the composer's `@` picker offers them), binaries, missing paths,
 * and permission failures. In every one of those cases the literal `@path` is
 * still useful to the model, which can reach for its own tools.
 */
export function expandFileMentions(content: string): ExpandFileMentionsResult {
	if (!content.includes("@/")) return { content, inlinedPaths: [] };

	const inlinedPaths: string[] = [];
	const seen = new Set<string>();
	let remainingBudget = INLINE_FILE_MENTION_TOTAL_CHARS;

	const expanded = content.replace(
		FILE_MENTION_PATTERN,
		(match, boundary: string, rawPath: string) => {
			// Trim trailing punctuation by asking the filesystem which candidate is
			// real, so `看看 @/a/b.ts。` and `(@/a/b.ts)` resolve without guessing.
			let candidate = rawPath;
			let file: LoadedFile | null = null;
			while (candidate.length > 1) {
				file = loadTextFile(candidate);
				if (file) break;
				if (!TRAILING_PUNCTUATION.test(candidate)) break;
				candidate = candidate.slice(0, -1);
			}
			if (!file) return match;

			// A path mentioned twice is already in context once; repeating the body
			// would just buy duplicate tokens.
			if (seen.has(candidate)) return match;

			const block = renderFileBlock(candidate, file, remainingBudget);
			if (!block) return match;

			seen.add(candidate);
			inlinedPaths.push(candidate);
			remainingBudget -= block.consumedChars;
			const trailing = rawPath.slice(candidate.length);
			return `${boundary}${block.rendered}${trailing}`;
		},
	);

	return { content: expanded, inlinedPaths };
}
