const ENABLED = (import.meta as any).env?.DEV === true
const SAMPLE_INTERVAL = 50
let counter = 0
let sampling = false

export function perfMark(name: string): void {
  if (!ENABLED) return
  if (name.endsWith('-start')) {
    sampling = (++counter % SAMPLE_INTERVAL === 0)
  }
  if (!sampling) return
  performance.mark(name)
}

export function perfMeasure(label: string, startMark: string, endMark: string): void {
  if (!ENABLED || !sampling) return
  try {
    performance.measure(label, startMark, endMark)
  } catch { /* marks may have been cleared */ }
  performance.clearMarks(startMark)
  performance.clearMarks(endMark)
}
