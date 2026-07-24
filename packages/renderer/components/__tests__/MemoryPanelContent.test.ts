// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MemoryPanelContent from '../memory/MemoryPanelContent.vue'

const sessionsStore = vi.hoisted(() => ({
  currentSession: {
    id: 'session-1',
    agentId: 'default',
  },
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => sessionsStore,
}))

afterEach(() => {
  document.body.innerHTML = ''
})

function memoryOverview() {
  const now = Date.now()
  return {
    enabled: true,
    agentId: 'default',
    root: '/tmp/onething-memory',
    memoryDir: '/tmp/onething-memory',
    status: {
      lastCaptureStatus: 'ok',
      lastCaptureAt: now,
    },
    files: [
      {
        absolutePath: '/tmp/onething-memory/SOUL.md',
        relativePath: 'SOUL.md',
        kind: 'soul',
        size: 120,
        mtimeMs: now,
        lineCount: 8,
        preview: 'Profile notes',
      },
      {
        absolutePath: '/tmp/onething-memory/USER.md',
        relativePath: 'USER.md',
        kind: 'user',
        size: 90,
        mtimeMs: now,
        lineCount: 5,
        preview: 'User preferences',
      },
      {
        absolutePath: '/tmp/onething-memory/MEMORY.md',
        relativePath: 'MEMORY.md',
        kind: 'memory',
        size: 80,
        mtimeMs: now,
        lineCount: 4,
        preview: 'AI notes',
      },
      {
        absolutePath: '/tmp/onething-memory/daily/2026-06-07.md',
        relativePath: 'daily/2026-06-07.md',
        kind: 'daily',
        date: '2026-06-07',
        size: 180,
        mtimeMs: now,
        lineCount: 12,
        preview: 'Daily note',
      },
    ],
  }
}

describe('MemoryPanelContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        getMemoryOverview: vi.fn().mockResolvedValue({ success: true, overview: memoryOverview() }),
        readMemoryFile: vi.fn().mockResolvedValue({
          success: true,
          file: {
            relativePath: 'SOUL.md',
            startLine: 1,
            endLine: 2,
            text: 'Profile notes',
            truncated: false,
          },
        }),
        saveMemoryFile: vi.fn().mockResolvedValue({ success: true }),
        revealPath: vi.fn(),
        openPath: vi.fn(),
      },
    })
  })

  it('renders the notes page without the deleted profile facts section', async () => {
    const wrapper = mount(MemoryPanelContent)
    await vi.waitFor(() => {
      expect(window.electronAPI.getMemoryOverview).toHaveBeenCalledWith('default')
      expect(wrapper.find('.notes-header').text()).toContain('Saved')
    })

    expect(wrapper.find('.profile-section').exists()).toBe(false)
    expect(wrapper.find('.memory-profile-table').exists()).toBe(false)
    expect(wrapper.find('.profile-search-input').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Search facts')
    expect(wrapper.text()).not.toContain('No profile rows yet.')

    expect(wrapper.find('.notes-section').exists()).toBe(true)
    expect(wrapper.find('.notes-header').text()).toContain('Notes')
    expect(wrapper.find('.notes-header .view-select').exists()).toBe(true)
    expect(wrapper.find('.notes-header .notes-editor-tabs').text()).toContain('preview')
    expect(wrapper.findAll('.notes-header .notes-file-action').map(button => button.text())).toEqual(['save', 'reload', 'open'])
    expect(wrapper.find('.notes-workspace').exists()).toBe(true)
    expect(wrapper.find('.viewer').exists()).toBe(true)
  })

  it('offers only surviving note filters (no reflection reports)', async () => {
    const wrapper = mount(MemoryPanelContent)
    await vi.waitFor(() => {
      expect(wrapper.findAll('.file-row').length).toBeGreaterThan(0)
    })

    const options = wrapper.findAll('.notes-header .view-select option').map(option => option.attributes('value'))
    expect(options).toEqual(['all', 'ai', 'daily'])
    expect(wrapper.find('.notes-header .view-select').text()).not.toContain('Reflection reports')
  })

  it('shows a plain muted loading note while memory overview is loading', async () => {
    window.electronAPI.getMemoryOverview = vi.fn(() => new Promise(() => {})) as any

    const wrapper = mount(MemoryPanelContent)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.ledger-note.loading-note').exists()).toBe(true)
    expect(wrapper.text()).toContain('loading memory')
    expect(wrapper.find('.loading-spinner-root').exists()).toBe(false)
  })

  it('renders fixed-height note rows with category badges instead of size metadata', async () => {
    const wrapper = mount(MemoryPanelContent)
    await vi.waitFor(() => {
      expect(wrapper.findAll('.file-row').length).toBeGreaterThan(0)
    })

    const rows = wrapper.findAll('.file-row')
    const firstRow = rows[0]
    expect(firstRow.find('.file-icon').exists()).toBe(true)
    expect(firstRow.find('.file-title-row .file-name').exists()).toBe(true)
    expect(firstRow.find('.file-title-row .badge').exists()).toBe(true)
    expect(firstRow.find('.file-path').exists()).toBe(false)
    expect(firstRow.find('.file-meta').exists()).toBe(false)
    expect(firstRow.find('.file-date').exists()).toBe(true)
    expect(firstRow.find('.file-preview').exists()).toBe(true)
    expect(firstRow.text()).not.toContain('lines')
    expect(firstRow.text()).not.toContain('120 B')

    const dailyRow = rows.find(row => row.text().includes('Daily capture'))
    expect(dailyRow?.find('.badge').text()).toBe('Daily')
  })
})
