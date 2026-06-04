import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { initializeIPCHub } from './services/ipc-hub'
import './styles/main.css'

// Note: Initial theme is handled by index.html inline script to prevent FOUC
// The settings store will apply the user's saved preference after loading

// The standalone Todo window is a transparent macOS panel whose rounded shape
// is drawn by `.todo-plan-window` (border-radius: 22px). The global opaque
// `html/body/#app` background would otherwise fill the square behind it and
// peek out at the corners, so flag the root to make those layers transparent.
if (window.location.hash.startsWith('#/todo-plan')) {
  document.documentElement.classList.add('transparent-window-root')
}

// Ensure theme attribute is valid (fixes HMR issues where 'system' might persist)
const html = document.documentElement
const currentTheme = html.getAttribute('data-theme')
if (currentTheme !== 'light' && currentTheme !== 'dark') {
  // Invalid theme value (e.g., 'system' from old code or HMR state)
  // Fall back to cached theme or default
  const cached = localStorage.getItem('cached-theme')
  const fixedTheme = (cached === 'light' || cached === 'dark') ? cached : 'dark'
  console.log('[Theme] main.ts: Fixing invalid data-theme:', currentTheme, '->', fixedTheme)
  html.setAttribute('data-theme', fixedTheme)
}

// Ensure default color theme and base theme are set if not already
if (!html.getAttribute('data-color-theme')) {
  html.setAttribute('data-color-theme', 'blue')
}
if (!html.getAttribute('data-base-theme')) {
  html.setAttribute('data-base-theme', 'obsidian')
}

// Preload @fontsource variable fonts BEFORE Vue mounts. The default
// `font-display: swap` would otherwise paint with system fallbacks (PingFang
// SC on macOS) and re-flow once Noto Sans SC arrives — visible as a vertical
// shift in the sidebar list a few hundred ms after launch.
//
// document.fonts.load() returns a promise that resolves once the font is in
// the FontFaceSet. By awaiting it before createApp().mount() we guarantee the
// very first Vue paint is already on the intended font.
async function preloadCriticalFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  const loads: Array<[string, string]> = [
    ['400 14px "Public Sans Variable"', 'The quick brown fox'],
    ['500 14px "Public Sans Variable"', 'The quick brown fox'],
    ['600 14px "Public Sans Variable"', 'The quick brown fox'],
    ['400 14px "Noto Sans SC Variable"', '启动会话列表服务器抓包进入笔记目录'],
    ['500 14px "Noto Sans SC Variable"', '启动会话列表服务器抓包进入笔记目录'],
    ['600 14px "Noto Sans SC Variable"', '启动会话列表服务器抓包进入笔记目录'],
  ]
  await Promise.all(loads.map(([spec, text]) => document.fonts.load(spec, text).catch(() => null)))
}

// 1.5s cap: cold-start loading of local woff2 from disk is ~100-400ms, but if
// something's wrong (corrupt asset, FS error) we don't want to wedge mount.
await Promise.race([
  preloadCriticalFonts(),
  new Promise<void>(resolve => setTimeout(resolve, 1500)),
])

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

// Initialize IPC Hub after Pinia is set up, before component mounts
// This ensures all IPC listeners are registered before any IPC calls
initializeIPCHub()

app.mount('#app')
