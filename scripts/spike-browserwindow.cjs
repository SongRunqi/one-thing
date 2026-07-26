/**
 * Spike: test the pasted proposal's central claim VERBATIM —
 * "a plain Electron BrowserWindow (top-level) can log into Google normally."
 *
 * This is the proposal's own example, plus the two things a real attempt needs:
 *   - a clean, standard Chrome UA (strip the Electron token; Chrome freezes the
 *     version to <major>.0.0.0), and
 *   - system proxy (so connectivity matches your daily Chrome).
 *
 * Run:  node_modules/.bin/electron scripts/spike-browserwindow.cjs
 * Then: try to log into your Google account in the window that opens.
 *
 * If Google lets you in  -> the proposal is right, top-level BrowserWindow
 *                           differs from our embedded WebContentsView. I pivot.
 * If "browser may not be secure" -> BrowserWindow is blocked the same as the
 *                           WebContentsView you already tested. Claim is false.
 */
const { app, BrowserWindow, session } = require('electron')

app.whenReady().then(async () => {
  const PARTITION = 'persist:spike-google'
  const ses = session.fromPartition(PARTITION)

  // Follow the OS proxy, like Chrome does (so it can actually reach Google).
  try { await ses.setProxy({ mode: 'system' }) } catch { /* ignore */ }

  // Clean, standard Chrome UA for the bundled Chromium major — no Electron trace.
  const major = (process.versions.chrome || '142').split('.')[0]
  ses.setUserAgent(
    `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ` +
    `(KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`,
  )

  const win = new BrowserWindow({
    width: 1100,
    height: 850,
    title: 'SPIKE: BrowserWindow → Google login test',
    webPreferences: { partition: PARTITION, sandbox: true },
  })

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.log('[spike] did-fail-load:', code, desc, url, '(likely a proxy/network issue, not the Google block)')
  })

  await win.loadURL('https://accounts.google.com')
  console.log('[spike] loaded accounts.google.com in a top-level BrowserWindow.')
  console.log('[spike] → Try to log in. If Google says "browser may not be secure", the claim is false.')
})

app.on('window-all-closed', () => app.quit())
