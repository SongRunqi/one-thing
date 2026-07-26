/**
 * Terminal Module
 * Wire contracts for the real PTY terminal (user-driven shells; NOT the ACP
 * protocol "terminal", which is a pipes-based registry inside the ACP client).
 * See docs/design/terminal-system.md.
 */

export interface TerminalCreateRequest {
	cwd?: string
	shell?: string
	/**
	 * cols/rows may be omitted: at create time xterm is not mounted yet and
	 * cannot be measured. The service spawns at 80x24 and the first mounted
	 * view corrects via resize.
	 */
	cols?: number
	rows?: number
	/** Seeds the initial cwd only — terminals are app-scoped, not session-scoped. */
	sessionId?: string
}

export interface TerminalInfo {
	id: string
	title: string
	cwd: string
	shell: string
	cols: number
	rows: number
	createdAt: number
	exited?: { code: number | null }
}

export interface TerminalCreateResponse {
	success: boolean
	terminal?: TerminalInfo
	error?: string
}

export interface TerminalListResponse {
	success: boolean
	terminals: TerminalInfo[]
	error?: string
}

export interface TerminalWriteRequest {
	terminalId: string
	data: string
}

export interface TerminalResizeRequest {
	terminalId: string
	cols: number
	rows: number
}

export interface TerminalKillRequest {
	terminalId: string
}

/**
 * Flow-control ack, one-way renderer→main (ipcRenderer.send, no invoke round
 * trip — a lost ack only delays resume by one beat; the attach generation
 * protocol resets the ledger anyway).
 * `bytes` is measured in JS string length (UTF-16 code units) on BOTH sides —
 * mixing utf8 byte counts would drift the watermark ledger on CJK output.
 */
export interface TerminalAckPayload {
	terminalId: string
	bytes: number
	generation: number
}

export interface TerminalAttachRequest {
	terminalId: string
}

export interface TerminalOutputChunk {
	seq: number
	data: string
}

/**
 * Attach = reattach protocol (renderer reload / view mount): one call returns
 * the scrollback snapshot AND resets the flow-control generation.
 */
export interface TerminalAttachResponse {
	success: boolean
	/** Carries current cols/rows — open/resize xterm to these BEFORE replaying. */
	info?: TerminalInfo
	chunks?: TerminalOutputChunk[]
	lastSeq?: number
	/** True when the ring buffer wrapped: replay may start mid-escape-sequence — write a full reset (\x1bc) first. */
	truncated?: boolean
	/** Flow-control generation; every ack must carry it, stale-generation acks are dropped. */
	generation?: number
	error?: string
}

export interface TerminalSimpleResponse {
	success: boolean
	error?: string
}

/** Push payload on IPC_CHANNELS.TERMINAL_DATA. */
export interface TerminalDataEvent {
	terminalId: string
	seq: number
	data: string
}

/** Push payload on IPC_CHANNELS.TERMINAL_EXIT (always emitted AFTER the final data flush). */
export interface TerminalExitEvent {
	terminalId: string
	exitCode: number | null
}
