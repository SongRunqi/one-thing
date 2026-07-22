// @vitest-environment happy-dom
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { useFileDrop } from '../useFileDrop'

function dragEvent(kinds: string[], files: File[] = []) {
  return {
    dataTransfer: { types: kinds, files, dropEffect: '' },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as DragEvent & { preventDefault: ReturnType<typeof vi.fn> }
}

/**
 * The composable registers window listeners on setup, so it has to run inside a
 * component instance for onBeforeUnmount to be legal.
 */
function mountDrop(options: Parameters<typeof useFileDrop>[0]) {
  let api: ReturnType<typeof useFileDrop>
  const wrapper = mount(defineComponent({
    setup() {
      api = useFileDrop(options)
      return () => h('div')
    },
  }))
  return { api: api!, wrapper }
}

describe('useFileDrop', () => {
  it('ignores drags that carry no files', async () => {
    const onFiles = vi.fn()
    const { api } = mountDrop({ onFiles })

    const enter = dragEvent(['text/plain'])
    api.dropHandlers.onDragenter(enter)

    expect(api.isDragActive.value).toBe(false)
    expect(enter.preventDefault).not.toHaveBeenCalled()

    await api.dropHandlers.onDrop(dragEvent(['text/plain']))
    expect(onFiles).not.toHaveBeenCalled()
  })

  it('stays active while the drag crosses child elements', () => {
    const { api } = mountDrop({ onFiles: vi.fn() })

    // enter zone → enter child → leave zone (bubbled from the child boundary)
    api.dropHandlers.onDragenter(dragEvent(['Files']))
    api.dropHandlers.onDragenter(dragEvent(['Files']))
    api.dropHandlers.onDragleave(dragEvent(['Files']))

    expect(api.isDragActive.value).toBe(true)

    api.dropHandlers.onDragleave(dragEvent(['Files']))
    expect(api.isDragActive.value).toBe(false)
  })

  it('claims the drop so it cannot escape to the window default', async () => {
    const onFiles = vi.fn()
    const { api } = mountDrop({ onFiles })
    const file = new File(['x'], 'a.txt', { type: 'text/plain' })

    const over = dragEvent(['Files'])
    api.dropHandlers.onDragover(over)
    // Without preventDefault on dragover the browser refuses the drop outright.
    expect(over.preventDefault).toHaveBeenCalled()
    expect(over.dataTransfer!.dropEffect).toBe('copy')

    const drop = dragEvent(['Files'], [file])
    await api.dropHandlers.onDrop(drop)

    expect(drop.preventDefault).toHaveBeenCalled()
    expect(onFiles).toHaveBeenCalledWith([file])
    expect(api.isDragActive.value).toBe(false)
  })

  it('does not accept files while disabled', async () => {
    const onFiles = vi.fn()
    const { api } = mountDrop({ onFiles, isDisabled: () => true })

    api.dropHandlers.onDragenter(dragEvent(['Files']))
    expect(api.isDragActive.value).toBe(false)

    await api.dropHandlers.onDrop(dragEvent(['Files'], [new File(['x'], 'a.txt')]))
    expect(onFiles).not.toHaveBeenCalled()
  })
})
