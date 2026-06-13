import { createApp } from 'vue'
import ToolUiAuditApp from './ToolUiAuditApp.vue'
import '../../src/renderer/styles/main.css'
import './tool-ui-audit.css'

const html = document.documentElement
html.setAttribute('data-theme', 'dark')
html.setAttribute('data-color-theme', 'blue')
html.setAttribute('data-base-theme', 'obsidian')

createApp(ToolUiAuditApp).mount('#app')
