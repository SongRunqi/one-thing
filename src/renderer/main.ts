import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { initializeIPCHub } from './services/ipc-hub'
import './styles/main.css'

// Apply theme immediately before mounting to prevent FOUC (Flash of Unstyled Content)
// This runs synchronously before Vue renders, ensuring correct theme from the start
function applyInitialTheme() {
  const html = document.documentElement

  // Check system preference
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const systemTheme = prefersDark ? 'dark' : 'light'

  // Apply system theme if not already set correctly
  const currentTheme = html.getAttribute('data-theme')
  if (currentTheme !== systemTheme) {
    html.setAttribute('data-theme', systemTheme)
  }

  // Ensure default color theme and base theme are set
  if (!html.getAttribute('data-color-theme')) {
    html.setAttribute('data-color-theme', 'blue')
  }
  if (!html.getAttribute('data-base-theme')) {
    html.setAttribute('data-base-theme', 'obsidian')
  }
}

// Apply theme before CSS is fully evaluated
applyInitialTheme()

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

// Initialize IPC Hub after Pinia is set up, before component mounts
// This ensures all IPC listeners are registered before any IPC calls
initializeIPCHub()

app.mount('#app')
