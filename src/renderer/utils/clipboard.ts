type ElectronClipboardAPI = {
  writeClipboardText?: (text: string) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string }
}

async function writeWithElectronClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false

  const api = window.electronAPI as (typeof window.electronAPI & ElectronClipboardAPI) | undefined
  if (typeof api?.writeClipboardText !== 'function') return false

  try {
    const result = await api.writeClipboardText(text)
    return result?.success !== false
  } catch {
    return false
  }
}

async function writeWithNavigatorClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function writeWithExecCommand(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false

  const selection = document.getSelection()
  const previousRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
  const textarea = document.createElement('textarea')

  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'

  try {
    document.body.append(textarea)
    textarea.focus({ preventScroll: true })
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    return document.execCommand?.('copy') ?? false
  } catch {
    return false
  } finally {
    textarea.remove()
    if (selection && previousRange) {
      selection.removeAllRanges()
      selection.addRange(previousRange)
    }
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  const normalizedText = String(text ?? '')

  // In Electron, navigator.clipboard can be denied by Chromium permission state
  // even for click-triggered copy actions. The preload bridge uses Electron's
  // clipboard module and is the most reliable path for the desktop app.
  if (await writeWithElectronClipboard(normalizedText)) return true
  if (await writeWithNavigatorClipboard(normalizedText)) return true
  return writeWithExecCommand(normalizedText)
}
