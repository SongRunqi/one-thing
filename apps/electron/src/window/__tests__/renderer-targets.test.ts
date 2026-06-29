import { describe, expect, it, vi } from 'vitest'
import {
  getElectronRendererDevUrl,
  isElectronAppWebContents,
  isElectronMainAppWindowUrl,
  isElectronRendererWindowUrl,
  loadElectronMainWindowContent,
} from '../renderer-targets.js'

describe('electron renderer targets', () => {
  it('resolves the renderer dev URL from the host environment', () => {
    expect(getElectronRendererDevUrl({})).toBe('http://127.0.0.1:5173')
    expect(getElectronRendererDevUrl({ ELECTRON_RENDERER_URL: 'http://localhost:3000' })).toBe('http://localhost:3000')
  })

  it('identifies main renderer URLs and excludes auxiliary routes', () => {
    expect(isElectronMainAppWindowUrl('http://127.0.0.1:5173#theme=dark')).toBe(true)
    expect(isElectronMainAppWindowUrl('file:///app/dist/renderer/index.html#theme=light')).toBe(true)
    expect(isElectronMainAppWindowUrl('http://127.0.0.1:5173/#/settings?theme=dark')).toBe(false)
    expect(isElectronMainAppWindowUrl('file:///app/dist/renderer/index.html#/image-preview?mode=single')).toBe(false)
    expect(isElectronMainAppWindowUrl('https://example.com/#theme=dark')).toBe(false)
  })

  it('checks app webContents against dev and packaged renderer targets', () => {
    const webContents = { getURL: vi.fn(() => 'http://127.0.0.1:5173/#/chat') } as any

    expect(isElectronAppWebContents(webContents, {
      isDevelopment: true,
      rendererDevUrl: 'http://127.0.0.1:5173',
      rendererIndexPath: '/dist/renderer/index.html',
    })).toBe(true)
    expect(isElectronAppWebContents(null, {
      isDevelopment: true,
      rendererDevUrl: 'http://127.0.0.1:5173',
      rendererIndexPath: '/dist/renderer/index.html',
    })).toBe(false)

    webContents.getURL.mockReturnValue('file:///dist/renderer/index.html#theme=dark')
    expect(isElectronAppWebContents(webContents, {
      isDevelopment: false,
      rendererIndexPath: '/dist/renderer/index.html',
    })).toBe(true)
  })

  it('loads main window content for dev and packaged renderers', () => {
    const mainWindow = {
      loadURL: vi.fn(),
      loadFile: vi.fn(),
    } as any

    loadElectronMainWindowContent({
      mainWindow,
      isDevelopment: true,
      rendererDevUrl: 'http://127.0.0.1:5173',
      rendererIndexPath: '/dist/renderer/index.html',
      themeMode: 'dark',
    })
    expect(mainWindow.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173#theme=dark')

    loadElectronMainWindowContent({
      mainWindow,
      isDevelopment: false,
      rendererIndexPath: '/dist/renderer/index.html',
      themeMode: 'light',
    })
    expect(mainWindow.loadFile).toHaveBeenCalledWith('/dist/renderer/index.html', {
      hash: 'theme=light',
    })
  })

  it('keeps renderer URL checks configurable for alternate dev ports', () => {
    expect(isElectronRendererWindowUrl('http://localhost:3000/#/chat', {
      rendererDevUrl: 'http://localhost:3000',
    })).toBe(true)
  })
})
