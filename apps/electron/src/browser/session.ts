/**
 * The embedded browser runs on its own persistent partition — never the app UI's
 * defaultSession. This gives persistent cookies/localStorage (login survives
 * restart), skips the app CSP, and gets its own UA + permission + download policy.
 * See docs/design/browser-v2.md §D3.
 */
import { session, type Session } from 'electron'
import { applyElectronNetworkProxySettings, type ElectronProxyConfig } from '../network/proxy.js'

export const BROWSER_PARTITION = 'persist:browser'

let cachedSession: Session | null = null
let uaApplied = false

/**
 * The UA the embedded browser presents — the PROVEN recipe for logging into
 * Google inside an embedded Chromium (replicates Flow Browser, which logs into
 * Google on castlabs Electron). Verified against the real "browser may not be
 * secure" block 2026-07-26.
 *
 * The ONE thing that matters: strip ONLY the ` Electron/<ver>` token and keep
 * EVERYTHING else — the app product token (`onething/x.y.z`) AND the full
 * Chromium build version (`Chrome/146.0.7680.166`). Counter-intuitively, an
 * OVER-cleaned UA (version frozen to `<major>.0.0.0`, app token removed) reads
 * as FAKE to Google's login environment check and triggers "this browser or app
 * may not be secure". The minimal scrub is exactly what the working Flow build
 * sends. Sec-CH-UA still says "Chromium" — that is fine; Flow sends the same and
 * Google does not gate on the "Google Chrome" brand. See docs/design/browser-v2.md.
 */
export function buildChromeUserAgent(defaultUserAgent: string): string {
	return defaultUserAgent.replace(/\sElectron\/\S+/, '')
}

/**
 * Resolve (and lazily initialize) the browser partition session. UA MUST be set
 * before any WebContentsView is created on this session — setUserAgent does not
 * affect already-created WebContents (d.ts:12894). Callers create views only
 * after this returns.
 */
export function getBrowserPartitionSession(): Session {
	if (cachedSession) return cachedSession
	const ses = session.fromPartition(BROWSER_PARTITION)

	if (!uaApplied) {
		ses.setUserAgent(buildChromeUserAgent(ses.getUserAgent()))
		uaApplied = true
	}

	// Browser pages get a hard-deny permission policy by default; a per-domain
	// prompt for media/clipboard lands in P1b.
	ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
	ses.setPermissionCheckHandler(() => false)

	cachedSession = ses
	return ses
}

/** Mirror the app's proxy settings onto the browser partition (defaultSession-only otherwise). */
export async function applyBrowserProxy(proxy: ElectronProxyConfig): Promise<void> {
	await applyElectronNetworkProxySettings(proxy, { session: getBrowserPartitionSession() })
}

/** Test seam. */
export function resetBrowserSessionForTests(): void {
	cachedSession = null
	uaApplied = false
}
