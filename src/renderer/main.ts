import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { initializeIPCHub } from './services/ipc-hub'
import './styles/main.css'

// Note: Initial theme is handled by index.html inline script to prevent FOUC
// The settings store will apply the user's saved preference after loading

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

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

// Initialize IPC Hub after Pinia is set up, before component mounts
// This ensures all IPC listeners are registered before any IPC calls
initializeIPCHub()

app.mount('#app')
