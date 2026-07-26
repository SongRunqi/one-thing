/**
 * Chromium command-line flags the embedded browser needs, applied BEFORE the
 * app becomes ready. Lives in the electron-host layer so main-process.ts never
 * imports electron directly (boundary rule: main delegates all Electron
 * ownership to apps/electron host modules).
 */
import { app } from 'electron'

let applied = false

/**
 * FedCM is broken in Electron and its mere presence trips Google's login
 * environment check ("this browser or app may not be secure"). Disabling it is
 * part of the proven embedded-Google-login recipe (replicates Flow Browser).
 * MUST be called before app 'ready'. Idempotent.
 */
export function applyEmbeddedBrowserChromiumFlags(): void {
	if (applied) return
	applied = true
	app.commandLine.appendSwitch('--disable-features', 'FedCm')
}
