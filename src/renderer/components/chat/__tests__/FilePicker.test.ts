// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FilePicker from '../FilePicker.vue'

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('FilePicker keyboard handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', Object.assign(window, {
      electronAPI: {
        listVariables: vi.fn().mockResolvedValue({ success: true, variables: [] }),
        listFiles: vi.fn().mockResolvedValue({
          success: true,
          files: ['/repo/src/editor/TextEditor.vue'],
        }),
      },
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('selects the highlighted file on Enter before the editor can insert a newline', async () => {
    const wrapper = mount(FilePicker, {
      attachTo: document.body,
      props: {
        visible: true,
        query: 'editor',
        cwd: '/repo',
        sessionId: 'session-1',
      },
    })

    await vi.advanceTimersByTimeAsync(200)
    await settle()

    const editorKeydown = vi.fn()
    document.addEventListener('keydown', editorKeydown)

    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(event)
    await settle()

    expect(wrapper.emitted('select')?.[0]).toEqual(['/repo/src/editor/TextEditor.vue'])
    expect(event.defaultPrevented).toBe(true)
    expect(editorKeydown).not.toHaveBeenCalled()

    document.removeEventListener('keydown', editorKeydown)
  })
})
