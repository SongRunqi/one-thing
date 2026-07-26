/**
 * Consistent real-Chrome identity for embedded browser views.
 *
 * setUserAgent only rewrites the UA *string* — it can't touch the Sec-CH-UA
 * request headers or navigator.userAgentData (d.ts:12902). Using it alone yields
 * "UA says Chrome / client hints say Chromium", a self-contradiction that is a
 * STRONGER fingerprint than doing nothing. The only documented way to make all
 * three surfaces agree — and to add the "Google Chrome" brand that Electron's
 * Chromium build omits — is CDP Network.setUserAgentOverride with a full
 * userAgentMetadata (this is exactly what Puppeteer/Playwright do).
 *
 * We present the genuine bundled Chromium version (process.versions.chrome) — an
 * honest, consistent identity, not a faked one. Requires a persistent
 * debugger.attach per view (the override clears on detach). Cost: mutually
 * exclusive with DevTools on the same view (handled by detach → fallback to the
 * string-layer UA). We never enable --enable-automation / Runtime.enable, so
 * navigator.webdriver stays false and the automation surface is minimal.
 *
 * See docs/design/browser-auth-profiles.md §3. On-machine verification is still
 * required (client-hints actually consistent, override clears on detach,
 * Electron 39 high-entropy hints not missing) — §3.3.
 */
import os from 'node:os'
import { buildChromeUserAgent } from './session.js'
import type { WebContents } from 'electron'

interface BrandVersion {
	brand: string
	version: string
}

interface UserAgentMetadata {
	brands: BrandVersion[]
	fullVersionList: BrandVersion[]
	platform: string
	platformVersion: string
	architecture: string
	model: string
	mobile: boolean
	bitness: string
	wow64: boolean
}

function chromeMajor(fullVersion: string): string {
	return fullVersion.split('.')[0] ?? ''
}

/** CDP UA-CH platform token: "macOS" / "Windows" / "Linux". */
function chPlatform(): string {
	switch (process.platform) {
		case 'darwin':
			return 'macOS'
		case 'win32':
			return 'Windows'
		default:
			return 'Linux'
	}
}

/** UA-CH architecture token from os.arch(): "arm" / "x86". */
function chArchitecture(): string {
	return os.arch() === 'arm64' || os.arch() === 'arm' ? 'arm' : 'x86'
}

function buildUserAgentMetadata(fullVersion: string): UserAgentMetadata {
	const major = chromeMajor(fullVersion)
	// GREASE brand — intentionally varied by real Chrome so servers can't depend
	// on it; a plausible current-format token is fine.
	const grease: BrandVersion = { brand: 'Not;A=Brand', version: '24' }
	return {
		brands: [
			grease,
			{ brand: 'Chromium', version: major },
			{ brand: 'Google Chrome', version: major },
		],
		fullVersionList: [
			{ brand: 'Not;A=Brand', version: '24.0.0.0' },
			{ brand: 'Chromium', version: fullVersion },
			{ brand: 'Google Chrome', version: fullVersion },
		],
		platform: chPlatform(),
		// Electron exposes the real OS version (e.g. "14.5.0" on macOS).
		platformVersion: process.getSystemVersion?.() ?? '',
		architecture: chArchitecture(),
		model: '',
		mobile: false,
		bitness: '64',
		wow64: false,
	}
}

/**
 * Attach a persistent debugger to the view and present a consistent real-Chrome
 * identity across UA string + Sec-CH-UA headers + navigator.userAgentData.
 * Never rejects — on any failure it resolves (the string-layer UA from
 * session.setUserAgent remains as fallback). Await before the first loadURL so
 * the identity is in effect for the initial request.
 */
export async function applyChromeIdentity(webContents: WebContents): Promise<void> {
	const chromeVersion = process.versions.chrome
	if (!chromeVersion) return

	const dbg = webContents.debugger
	try {
		if (!dbg.isAttached()) dbg.attach('1.3')
	} catch (error) {
		// Already attached (e.g. DevTools open) — skip; fallback UA applies.
		console.warn('[browser/identity] attach failed, using string-layer UA fallback:', error)
		return
	}

	// If DevTools takes over (or the view goes away) the override is gone; we do
	// NOT fight the user by auto-reattaching — the string-layer UA covers it.
	dbg.once('detach', (_event, reason) => {
		console.log('[browser/identity] debugger detached (identity override lost):', reason)
	})

	const userAgent = buildChromeUserAgent(webContents.getUserAgent())
	const metadata = buildUserAgentMetadata(chromeVersion)
	try {
		await dbg.sendCommand('Network.setUserAgentOverride', {
			userAgent,
			acceptLanguage: 'en-US,en;q=0.9',
			platform: chPlatform() === 'macOS' ? 'MacIntel' : chPlatform(),
			userAgentMetadata: metadata,
		})
		console.log('[browser/identity] setUserAgentOverride OK. ua=', userAgent, 'brands=', JSON.stringify(metadata.brands))
	} catch (error) {
		console.warn('[browser/identity] setUserAgentOverride FAILED:', error)
		return
	}

	// Self-check: read what the page ACTUALLY reports post-override (reading, not
	// faking). Confirms whether the identity took — the deciding diagnostic.
	try {
		const reported = await webContents.executeJavaScript(
			'navigator.userAgentData ? navigator.userAgentData.getHighEntropyValues(["brands","fullVersionList","platform","platformVersion"]) : "no-userAgentData"',
			true,
		)
		console.log('[browser/identity] page-reported navigator.userAgentData=', JSON.stringify(reported))
	} catch (error) {
		console.warn('[browser/identity] self-check executeJavaScript failed:', error)
	}
}
