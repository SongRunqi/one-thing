// Global test setup.
//
// happy-dom's default document origin is http://localhost:3000, so any
// renderer code that fires platformApi web fallbacks (fetch('/api/…') or
// new EventSource('/api/…')) during a component test makes a REAL network
// attempt to that port. The refused connections surface as unhandled
// AggregateErrors that vitest occasionally attributes to whatever test is
// running — a standing source of flaky failures.
//
// Guarded to browser-like environments: node-env tests (server HTTP tests,
// provider tests with their own fetch doubles) keep the real fetch.
if (typeof window !== 'undefined') {
  const offlineFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({ success: false, error: 'Network is disabled in renderer tests.' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    )
  globalThis.fetch = offlineFetch
  window.fetch = offlineFetch

  class OfflineEventSource {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSED = 2
    readonly readyState = OfflineEventSource.CLOSED
    onerror: ((event: unknown) => void) | null = null
    onmessage: ((event: unknown) => void) | null = null
    onopen: ((event: unknown) => void) | null = null
    constructor(readonly url: string) {}
    addEventListener(): void {}
    removeEventListener(): void {}
    dispatchEvent(): boolean {
      return false
    }
    close(): void {}
  }
  ;(window as { EventSource: unknown }).EventSource = OfflineEventSource
  ;(globalThis as { EventSource: unknown }).EventSource = OfflineEventSource
}

export {}
