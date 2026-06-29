import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronMediaIpcHandlers } from '../media.js'

describe('electron media IPC host', () => {
  it('registers media handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const listAssets = vi.fn().mockResolvedValue([{ id: 'asset-1' }])
    const hideAsset = vi.fn().mockResolvedValue({ success: true })
    const rebuildLibrary = vi.fn().mockResolvedValue({ success: true, added: 1, skipped: 0 })
    const getGallery = vi.fn().mockResolvedValue({ success: true, assets: [] })
    const saveImage = vi.fn().mockResolvedValue({ id: 'item-1' })
    const loadAll = vi.fn().mockResolvedValue([{ id: 'item-1' }])
    const deleteMedia = vi.fn().mockResolvedValue(true)
    const clearAll = vi.fn().mockResolvedValue(undefined)
    const openPreview = vi.fn().mockResolvedValue({ success: true, previewId: 'preview-1' })
    const getPreview = vi.fn().mockReturnValue({ success: true, src: 'media://preview-1' })
    const openGallery = vi.fn().mockResolvedValue({ success: true })
    const readImageBase64 = vi.fn().mockReturnValue('data:image/png;base64,abc')

    registerElectronMediaIpcHandlers({
      channels: {
        listAssets: 'media:list-assets',
        hideAsset: 'media:hide-asset',
        rebuildLibrary: 'media:rebuild-library',
        getGallery: 'media:get-gallery',
        saveImage: 'media:save-image',
        loadAll: 'media:load-all',
        delete: 'media:delete',
        clearAll: 'media:clear-all',
        openPreview: 'image-preview:open',
        getPreview: 'image-preview:get',
        openGallery: 'image-gallery:open',
        readImageBase64: 'media:read-image-base64',
      },
      listAssets,
      hideAsset,
      rebuildLibrary,
      getGallery,
      saveImage,
      loadAll,
      delete: deleteMedia,
      clearAll,
      openPreview,
      getPreview,
      openGallery,
      readImageBase64,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(12)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'media:list-assets',
      'media:hide-asset',
      'media:rebuild-library',
      'media:get-gallery',
      'media:save-image',
      'media:load-all',
      'media:delete',
      'media:clear-all',
      'image-preview:open',
      'image-preview:get',
      'image-gallery:open',
      'media:read-image-base64',
    ])

    const query = { kind: 'image' }
    const galleryRequest = { assetId: 'asset-1', query }
    const saveRequest = {
      base64: 'abc',
      prompt: 'hello',
      model: 'gpt-image',
      sessionId: 'session-1',
      messageId: 'message-1',
    }
    const previewRequest = { src: 'media://asset-1', alt: 'asset' }
    const galleryOpenRequest = { mediaId: 'asset-1' }

    await expect(handle.mock.calls[0][1]({}, query)).resolves.toEqual([{ id: 'asset-1' }])
    await expect(handle.mock.calls[1][1]({}, 'asset-1')).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[2][1]({})).resolves.toEqual({ success: true, added: 1, skipped: 0 })
    await expect(handle.mock.calls[3][1]({}, galleryRequest)).resolves.toEqual({ success: true, assets: [] })
    await expect(handle.mock.calls[4][1]({}, saveRequest)).resolves.toEqual({ id: 'item-1' })
    await expect(handle.mock.calls[5][1]({})).resolves.toEqual([{ id: 'item-1' }])
    await expect(handle.mock.calls[6][1]({}, 'item-1')).resolves.toBe(true)
    await expect(handle.mock.calls[7][1]({})).resolves.toBeUndefined()
    await expect(handle.mock.calls[8][1]({}, previewRequest)).resolves.toEqual({
      success: true,
      previewId: 'preview-1',
    })
    expect(handle.mock.calls[9][1]({}, 'preview-1')).toEqual({ success: true, src: 'media://preview-1' })
    await expect(handle.mock.calls[10][1]({}, galleryOpenRequest)).resolves.toEqual({ success: true })
    expect(handle.mock.calls[11][1]({}, '/tmp/image.png')).toBe('data:image/png;base64,abc')

    expect(listAssets).toHaveBeenCalledWith(query)
    expect(hideAsset).toHaveBeenCalledWith('asset-1')
    expect(rebuildLibrary).toHaveBeenCalledWith()
    expect(getGallery).toHaveBeenCalledWith(galleryRequest)
    expect(saveImage).toHaveBeenCalledWith(saveRequest)
    expect(loadAll).toHaveBeenCalledWith()
    expect(deleteMedia).toHaveBeenCalledWith('item-1')
    expect(clearAll).toHaveBeenCalledWith()
    expect(openPreview).toHaveBeenCalledWith(previewRequest)
    expect(getPreview).toHaveBeenCalledWith('preview-1')
    expect(openGallery).toHaveBeenCalledWith(galleryOpenRequest)
    expect(readImageBase64).toHaveBeenCalledWith('/tmp/image.png')
  })
})
