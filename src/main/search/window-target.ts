const AUXILIARY_HASH_PREFIXES = [
  '#/search',
  '#/settings',
  '#/todo-plan',
  '#/image-preview',
]

export function isRendererWindowUrl(url: string): boolean {
  const devUrl = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173'
  return url.startsWith('file://') || url.startsWith(devUrl)
}

export function isMainAppWindowUrl(url: string): boolean {
  if (!isRendererWindowUrl(url)) return false

  let hash = ''
  try {
    hash = new URL(url).hash
  } catch {
    return false
  }

  return !AUXILIARY_HASH_PREFIXES.some(prefix => hash.startsWith(prefix))
}
