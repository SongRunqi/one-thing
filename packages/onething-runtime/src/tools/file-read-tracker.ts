/**
 * FileReadTracker
 *
 * Per-session tracker that records which files have been explicitly read
 * via the `read` tool. Used by `edit`/`write` tools to enforce a
 * read-before-mutation guard.
 *
 * Lifecycle:
 * - `record()`  — called by `read` tool after a successful text file read
 * - `check()`   — called by `edit`/`write` tools before mutation
 * - `invalidate()` — called by `edit`/`write` tools after a successful mutation
 * - `cleanup()` — lazy TTL-based eviction of stale sessions (30 min inactivity)
 */

export type ReadCheckResult = { read: true } | { read: false; reason: string };

interface ReadRecord {
	/** Content hash at the time of read (sha256 from hashTextFileSnapshot). */
	hash: string;
	/** Last activity timestamp for TTL eviction. */
	timestamp: number;
}

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class FileReadTracker {
	private reads = new Map<string, Map<string, ReadRecord>>();
	private lastCleanup = Date.now();

	/**
	 * Record that a file was successfully read in the given session.
	 */
	record(sessionId: string, filePath: string, contentHash: string): void {
		this.lazyCleanup();

		let sessionReads = this.reads.get(sessionId);
		if (!sessionReads) {
			sessionReads = new Map();
			this.reads.set(sessionId, sessionReads);
		}

		sessionReads.set(filePath, {
			hash: contentHash,
			timestamp: Date.now(),
		});
	}

	/**
	 * Check whether the file has been read in the current session.
	 */
	check(sessionId: string, filePath: string): ReadCheckResult {
		this.lazyCleanup();

		const sessionReads = this.reads.get(sessionId);
		if (!sessionReads?.has(filePath)) {
			return {
				read: false,
				reason: `File not read yet. Use read("${filePath}") to get current content, then retry.`,
			};
		}

		return { read: true };
	}

	/**
	 * Clear the read record for a file after a successful mutation.
	 */
	invalidate(sessionId: string, filePath: string): void {
		const sessionReads = this.reads.get(sessionId);
		if (sessionReads) {
			sessionReads.delete(filePath);
		}
	}

	/**
	 * Reset per-turn file reads for a session (called at the start of each
	 * new user message). Keeps the session entry alive so reads from the same
	 * turn still validate, but prevents stale reads from leaking across turns.
	 */
	resetTurn(sessionId: string): void {
		const sessionReads = this.reads.get(sessionId);
		if (sessionReads) {
			sessionReads.clear();
		}
	}

	/**
	 * Remove all records for a session (called when session ends).
	 */
	clearSession(sessionId: string): void {
		this.reads.delete(sessionId);
	}

	/**
	 * Evict sessions whose last activity is older than SESSION_TTL_MS.
	 * Called lazily on each record/check call.
	 */
	private lazyCleanup(): void {
		const now = Date.now();
		if (now - this.lastCleanup < SESSION_TTL_MS) return;

		this.lastCleanup = now;
		const cutoff = now - SESSION_TTL_MS;

		for (const [sessionId, sessionReads] of this.reads) {
			let hasRecent = false;
			for (const record of sessionReads.values()) {
				if (record.timestamp > cutoff) {
					hasRecent = true;
					break;
				}
			}
			if (!hasRecent) {
				this.reads.delete(sessionId);
			}
		}
	}
}
