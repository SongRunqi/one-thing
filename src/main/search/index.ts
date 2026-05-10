/**
 * Search Everywhere — module entry point
 */

export { registerSearchHandlers } from './ipc.js'
export { openSearchWindow, closeSearchWindow, toggleSearchWindow, warmSearchWindow, getSearchWindow } from './window.js'
export { executeSearch } from './providers.js'
