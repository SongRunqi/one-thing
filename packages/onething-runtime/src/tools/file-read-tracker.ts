/**
 * FileReadTracker
 *
 * Per-session record of the file content the model has already seen — either
 * by reading a file via `read`, or by producing it via `write`/`edit`. Used by
 * `edit`/`write` to enforce a read-before-mutation guard.
 *
 * The guard exists to stop mutations built on stale content, so a record stays
 * valid exactly as long as the file on disk still hashes to what was seen:
 * `check()` compares the recorded hash against the caller-supplied current
 * hash and demands a re-read only when they diverge. Records deliberately
 * survive across turns — content the model has seen does not become stale
 * because the user sent another message, and expiring records by turn only
 * forced re-reads of files that were still byte-for-byte identical.
 *
 * Lifecycle:
 * - `record()`  — by `read` after a successful text read, and by
 *                 `write`/`edit` after a successful mutation
 * - `check()`   — by `edit`/`write` before mutation
 * - `clearSession()` — when a session ends
 * - `lazyCleanup()`  — TTL-based eviction of stale sessions (30 min inactivity)
 */

export type ReadCheckResult = { read: true } | { read: false; reason: string };

interface ReadRecord {
	/** Content hash of what the model saw (sha256 from hashTextFileSnapshot). */
	hash: string;
	/** Last activity timestamp for TTL eviction. */
	timestamp: number;
}

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class FileReadTracker {
	private reads = new Map<string, Map<string, ReadRecord>>();
	private lastCleanup = Date.now();

	/**
	 * Record the content hash the model has seen for a file in this session.
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
	 * Check whether the model has seen the file's current content.
	 *
	 * `currentHash` is the hash of the file as it exists on disk right now; when
	 * omitted the check degrades to a presence check.
	 */
	check(
		sessionId: string,
		filePath: string,
		currentHash?: string,
	): ReadCheckResult {
		this.lazyCleanup();

		const record = this.reads.get(sessionId)?.get(filePath);
		if (!record) {
			return {
				read: false,
				reason: `File not read yet. Use read("${filePath}") to get current content, then retry.`,
			};
		}

		if (currentHash !== undefined && record.hash !== currentHash) {
			return {
				read: false,
				reason: `File changed on disk since you last saw it. Use read("${filePath}") to get current content, then retry.`,
			};
		}

		record.timestamp = Date.now();
		return { read: true };
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
