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
 * A STANDARD, real-Chrome UA for the bundled Chromium major version — the exact
 * string a genuine Chrome would send, with NO Electron/app trace.
 *
 * Two details that matter (getting them wrong is itself a detection tell):
 *  - Real Chrome FREEZES the version to `<major>.0.0.0` (privacy, since Chrome
 *    100). Sending the full build (e.g. 142.0.7444.235) is non-standard.
 *  - Real Chrome FREEZES macOS to `Mac OS X 10_15_7` in the UA string.
 *
 * Set via session.setUserAgent(). This is the lightweight approach (no CDP, no
 * debugger); it leaves Sec-CH-UA saying "Chromium", which is the honest residual.
 */
export function buildChromeUserAgent(_defaultUserAgent?: string): string {
	const major = (process.versions.chrome ?? '142').split('.')[0]
	if (process.platform === 'win32') {
		return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
	}
	if (process.platform === 'linux') {
		return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
	}
	return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
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
