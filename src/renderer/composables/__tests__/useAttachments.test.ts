// @vitest-environment happy-dom
import { reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAttachments } from '../useAttachments'

const mocks = vi.hoisted(() => ({
  settingsStore: null as any,
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => mocks.settingsStore,
}))

function makePasteEvent(files: File[]): ClipboardEvent {
  return {
    clipboardData: {
      files,
      items: files.map(file => ({
        kind: 'file',
        type: file.type,
        getAsFile: () => file,
      })),
    },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent
}

describe('useAttachments', () => {
  beforeEach(() => {
    mocks.settingsStore = reactive({
      settings: {
        ai: {
          provider: 'openai',
          providers: {
            openai: { model: 'gpt-vision' },
          },
        },
      },
      getCachedModels: vi.fn(() => [{
        id: 'gpt-vision',
        architecture: { input_modalities: ['text', 'image'] },
      }]),
    })

    vi.stubGlobal('Image', class {
      width = 640
      height = 480
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not intercept plain text paste events', async () => {
    const attachments = useAttachments()
    const event = {
      clipboardData: { files: [], items: [] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent

    const result = await attachments.handlePaste(event)

    expect(result.handled).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(attachments.attachedFiles.value).toEqual([])
  })

  it('creates image attachments with preview and dimensions from clipboard files', async () => {
    const attachments = useAttachments()
    const file = new File(['image-bytes'], 'screenshot.png', { type: 'image/png' })
    const event = makePasteEvent([file])

    const result = await attachments.handlePaste(event)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(result.accepted).toHaveLength(1)
    expect(result.rejected).toHaveLength(0)
    expect(attachments.attachedFiles.value[0]).toMatchObject({
      fileName: 'screenshot.png',
      mimeType: 'image/png',
      size: file.size,
      mediaType: 'image',
      width: 640,
      height: 480,
    })
    expect(attachments.attachedFiles.value[0].preview).toMatch(/^data:image\/png;base64,/)
    expect(attachments.toMessageAttachments()?.[0].base64Data).toBeTruthy()
  })

  it('creates document/file attachments for non-image clipboard files', async () => {
    const attachments = useAttachments()
    const file = new File(['pdf-bytes'], 'brief.pdf', { type: 'application/pdf' })
    const event = makePasteEvent([file])

    const result = await attachments.handlePaste(event)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(result.accepted).toHaveLength(1)
    expect(attachments.attachedFiles.value[0]).toMatchObject({
      fileName: 'brief.pdf',
      mimeType: 'application/pdf',
      mediaType: 'document',
    })
  })

  it('rejects files larger than the attachment size limit', async () => {
    const attachments = useAttachments()
    const file = new File(['x'], 'huge.bin', { type: 'application/octet-stream' })
    Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 + 1 })
    const event = makePasteEvent([file])

    const result = await attachments.handlePaste(event)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(result.accepted).toHaveLength(0)
    expect(result.rejected[0]).toMatchObject({
      fileName: 'huge.bin',
      reason: 'too-large',
    })
    expect(attachments.attachedFiles.value).toEqual([])
  })
})
