// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MemoryPanelContent from '../memory/MemoryPanelContent.vue'
import { createDefaultSettings, normalizeSoulMemorySettings } from '../../../shared/defaults/settings'
import type { MemoryOverview } from '../../../shared/ipc'

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

function memoryOverview(): MemoryOverview {
  const settings = createDefaultSettings()
  const now = Date.now()
  return {
    enabled: true,
    agentId: 'default',
    root: '/tmp/onething-memory',
    memoryDir: '/tmp/onething-memory',
    soulPath: '/tmp/onething-memory/SOUL.md',
    userPath: '/tmp/onething-memory/USER.md',
    memoryPath: '/tmp/onething-memory/MEMORY.md',
    dreamsPath: '/tmp/onething-memory/DREAMS.md',
    todayPath: '/tmp/onething-memory/daily/2026-06-07.md',
    dbPath: '/tmp/onething-memory/memory.sqlite',
    settings: normalizeSoulMemorySettings(settings.general.soulMemory),
    status: {
      indexedFiles: 4,
      indexedChunks: 8,
      ftsTokenizer: 'unicode61',
      lastCaptureStatus: 'ok',
      lastCaptureAt: now,
      lastFlushAt: now,
    },
    dreaming: {
      enabled: true,
      frequency: '0 3 * * *',
      lastRunAt: now,
      lastApplied: 1,
      lastStatus: 'applied',
      lastSourceFiles: ['daily/2026-06-07.md'],
      nextRunAt: now + 3600000,
      inFlight: false,
    },
    pendingCaptures: [],
    canonicalCount: 2,
    graph: {
      entities: 1,
      observations: 1,
      relations: 0,
      pendingDuplicates: 0,
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
      {
        absolutePath: '/tmp/onething-memory/DREAMS.md',
        relativePath: 'DREAMS.md',
        kind: 'dreams',
        size: 220,
        mtimeMs: now,
        lineCount: 14,
        preview: 'Dreaming note',
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
        rebuildMemoryIndex: vi.fn().mockResolvedValue({ success: true }),
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
        searchMemory: vi.fn().mockResolvedValue({ success: true, hits: [] }),
        appendMemory: vi.fn().mockResolvedValue({ success: true }),
        revealPath: vi.fn(),
        openPath: vi.fn(),
        listMemoryGraphEntities: vi.fn().mockResolvedValue({
          success: true,
          entities: [{
            id: 'user:self',
            entityType: 'user',
            name: 'user',
            displayName: 'User',
            aliases: [],
            confidence: 1,
            sensitivity: 'normal',
            source: 'test',
            createdAt: 1,
            updatedAt: 1,
          }],
        }),
        listMemoryGraphObservations: vi.fn().mockResolvedValue({
          success: true,
          observations: [{
            id: 'obs-1',
            entityId: 'user:self',
            entityDisplayName: 'User',
            kind: 'fact',
            slot: 'timezone',
            value: 'Asia/Shanghai',
            text: 'User is in Asia/Shanghai.',
            confidence: 0.9,
            sensitivity: 'normal',
            source: 'test',
            status: 'active',
            createdAt: 1,
            updatedAt: 1,
          }],
        }),
        listMemoryGraphRelations: vi.fn().mockResolvedValue({ success: true, relations: [] }),
        listMemoryGraphDuplicates: vi.fn().mockResolvedValue({ success: true, duplicates: [] }),
        getMemoryGraphAudit: vi.fn().mockResolvedValue({ success: true, events: [] }),
        upsertMemoryGraphEntity: vi.fn().mockResolvedValue({ success: true }),
        deleteMemoryGraphEntity: vi.fn().mockResolvedValue({ success: true }),
        upsertMemoryGraphObservation: vi.fn().mockResolvedValue({ success: true }),
        deleteMemoryGraphObservation: vi.fn().mockResolvedValue({ success: true }),
        upsertMemoryGraphRelation: vi.fn().mockResolvedValue({ success: true }),
        deleteMemoryGraphRelation: vi.fn().mockResolvedValue({ success: true }),
        mergeMemoryGraphDuplicate: vi.fn().mockResolvedValue({ success: true }),
        ignoreMemoryGraphDuplicate: vi.fn().mockResolvedValue({ success: true }),
      },
    })
  })

  it('renders a unified memory page with search, profile, and notes', async () => {
    const wrapper = mount(MemoryPanelContent)
    await vi.waitFor(() => {
      expect(window.electronAPI.getMemoryOverview).toHaveBeenCalledWith('default')
      expect(wrapper.text()).toContain('User is in Asia/Shanghai.')
    })

    expect(wrapper.find('.memory-tab').exists()).toBe(false)
    expect(wrapper.find('.memory-hero').exists()).toBe(false)
    expect(wrapper.find('.diagnostics-card').exists()).toBe(false)
    expect(wrapper.find('.diagnostics-domain').exists()).toBe(false)
    expect(wrapper.find('.memory-state-line').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('files indexed')
    expect(wrapper.find('.memory-search-strip').exists()).toBe(false)
    expect(wrapper.find('.memory-top-search').exists()).toBe(false)
    expect(wrapper.find('.profile-section .profile-search-input .filter-search-input').exists()).toBe(true)
    expect(wrapper.find('.profile-section .memory-profile-table.app-table').exists()).toBe(true)
    expect(wrapper.find('.profile-section .memory-profile-table.app-table').classes()).not.toContain('is-striped')
    expect(wrapper.find('.profile-section .memory-profile-table .app-table-scrollbar').attributes('style')).toContain('height: var(--memory-table-height)')
    const memoryContent = wrapper.find('.profile-section .collapse-panel-content.simple-profile-list')
    expect(memoryContent.exists()).toBe(true)
    expect(memoryContent.element.firstElementChild?.classList.contains('memory-profile-table')).toBe(true)
    expect(wrapper.find('.profile-section').text()).toContain('Memory')
    expect(wrapper.find('.profile-section').text()).toContain('User is in Asia/Shanghai.')
    expect(wrapper.find('.profile-section').text()).toContain('Fact')
    expect(wrapper.find('.profile-section').text()).toContain('Kind')
    expect(wrapper.find('.memory-panel-title span').exists()).toBe(false)
    expect(wrapper.find('.profile-section').text()).not.toContain('User: Timezone')
    expect(wrapper.text()).not.toContain('Create fact')
    expect(wrapper.find('.notes-section').exists()).toBe(true)
    expect(wrapper.find('.notes-header').text()).toContain('Notes')
    expect(wrapper.find('.notes-header').text()).not.toContain('Memory notes')
    expect(wrapper.find('.notes-header .view-select').exists()).toBe(true)
    expect(wrapper.find('.notes-header .notes-editor-tabs').text()).toContain('Preview')
    expect(wrapper.find('.notes-header').text()).toContain('Save')
    expect(wrapper.find('.notes-header').text()).toContain('Reload')
    expect(wrapper.find('.notes-header').text()).toContain('Open')
    expect(wrapper.find('.notes-workspace').exists()).toBe(true)
    expect(wrapper.find('.notes-header').text()).toContain('Saved')
  })

  it('uses themed loading spinner while memory overview is loading', async () => {
    window.electronAPI.getMemoryOverview = vi.fn(() => new Promise(() => {})) as any

    const wrapper = mount(MemoryPanelContent)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.loading-spinner-root').exists()).toBe(true)
    expect(wrapper.find('.loading-spinner-ring').exists()).toBe(true)
    expect(wrapper.text()).toContain('Loading memory...')
  })

  it('filters the scrollable memory list', async () => {
    const wrapper = mount(MemoryPanelContent)
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('User is in Asia/Shanghai.')
    })

    const profileInput = wrapper.find('.profile-search-input .filter-search-input')
    expect(profileInput.exists()).toBe(true)
    expect(wrapper.find('.simple-profile-list').exists()).toBe(true)
    expect(wrapper.find('.simple-profile-list').text()).toContain('User is in Asia/Shanghai.')
    expect(wrapper.find('.toolbar-actions').exists()).toBe(false)

    await profileInput.setValue('missing')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.simple-profile-list').text()).toContain('No profile rows yet.')

    await profileInput.setValue('Asia')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.simple-profile-list').text()).toContain('User is in Asia/Shanghai.')
  })

  it('closes the kind filter menu after choosing a filter', async () => {
    const wrapper = mount(MemoryPanelContent)
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('User is in Asia/Shanghai.')
    })

    await wrapper.find('.memory-profile-table .app-table-filter-button').trigger('click')
    expect(document.body.querySelector('.app-table-filter-menu')).not.toBeNull()

    const factOption = Array
      .from(document.body.querySelectorAll('.app-table-filter-option'))
      .find(option => option.textContent?.includes('Fact')) as HTMLElement | undefined
    expect(factOption).toBeTruthy()

    factOption!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(document.body.querySelector('.app-table-filter-menu')).toBeNull()
    expect(wrapper.find('.simple-profile-list').text()).toContain('User is in Asia/Shanghai.')
  })

  it('collapses the memory list while keeping header search available', async () => {
    const wrapper = mount(MemoryPanelContent)
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('User is in Asia/Shanghai.')
    })

    const collapseTrigger = wrapper.find('.profile-section .collapse-panel-header')
    expect(collapseTrigger.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.profile-section .profile-search-input .filter-search-input').exists()).toBe(true)

    await collapseTrigger.trigger('click')
    await wrapper.vm.$nextTick()

    expect(collapseTrigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.simple-profile-list').exists()).toBe(false)
    expect(wrapper.find('.profile-section .profile-search-input .filter-search-input').exists()).toBe(true)

    await collapseTrigger.trigger('click')
    await wrapper.vm.$nextTick()

    expect(collapseTrigger.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.simple-profile-list').exists()).toBe(true)
  })

  it('renders expanded memory details as a responsive grid instead of a nested collapse panel', async () => {
    const wrapper = mount(MemoryPanelContent)
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('User is in Asia/Shanghai.')
    })

    await wrapper.find('.memory-profile-table .app-table-expand-button').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.memory-row-detail-panel').exists()).toBe(false)
    expect(wrapper.find('.memory-detail-layout').exists()).toBe(true)
    expect(wrapper.find('.memory-detail-grid').exists()).toBe(true)
    expect(wrapper.find('.memory-detail-value').text()).toContain('Asia/Shanghai')
    expect(wrapper.find('.memory-detail-grid').text()).toContain('Confidence')
    expect(wrapper.find('.memory-detail-grid').text()).toContain('90%')
    expect(wrapper.find('.memory-detail-evidence').exists()).toBe(false)
  })

  it('edits a memory row inline', async () => {
    const wrapper = mount(MemoryPanelContent)
    await vi.waitFor(() => {
      expect(wrapper.find('.memory-row-edit').exists()).toBe(true)
    })

    await wrapper.find('.memory-row-edit').trigger('click')
    const textarea = wrapper.find('.memory-edit-textarea')
    expect(textarea.exists()).toBe(true)

    await textarea.setValue('Updated memory text.')
    await wrapper.find('.memory-edit-form').trigger('submit')

    await vi.waitFor(() => {
      expect(window.electronAPI.upsertMemoryGraphObservation).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'default',
        id: 'obs-1',
        entityId: 'user:self',
        kind: 'fact',
        slot: 'timezone',
        value: 'Asia/Shanghai',
        text: 'Updated memory text.',
      }))
    })
    expect(wrapper.find('.simple-profile-list').text()).toContain('Updated memory text.')
    expect(wrapper.find('.memory-edit-textarea').exists()).toBe(false)
  })

  it('deletes a memory row after confirmation', async () => {
    const originalConfirm = window.confirm
    const confirmMock = vi.fn(() => true)
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      writable: true,
      value: confirmMock,
    })
    const wrapper = mount(MemoryPanelContent)
    await vi.waitFor(() => {
      expect(wrapper.find('.memory-row-delete').exists()).toBe(true)
    })

    await wrapper.find('.memory-row-delete').trigger('click')

    await vi.waitFor(() => {
      expect(window.electronAPI.deleteMemoryGraphObservation).toHaveBeenCalledWith({
        agentId: 'default',
        id: 'obs-1',
      })
    })
    expect(confirmMock).toHaveBeenCalledWith('Delete this memory?')
    expect(wrapper.find('.simple-profile-list').text()).toContain('No profile rows yet.')
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      writable: true,
      value: originalConfirm,
    })
  })

  it('keeps notes visible while the memory facts search filters', async () => {
    const wrapper = mount(MemoryPanelContent)
    await vi.waitFor(() => {
      expect(wrapper.find('.notes-header').text()).toContain('Saved')
    })
    expect(wrapper.find('.notes-workspace').exists()).toBe(true)
    expect(wrapper.find('.notes-page').exists()).toBe(true)
    expect(wrapper.find('.viewer').exists()).toBe(true)

    expect(wrapper.find('.memory-top-search').exists()).toBe(false)

    await wrapper.find('.profile-search-input .filter-search-input').setValue('missing')
    await wrapper.vm.$nextTick()

    expect(window.electronAPI.searchMemory).not.toHaveBeenCalled()
    expect(wrapper.find('.simple-profile-list').text()).toContain('No profile rows yet.')
    expect(wrapper.find('.notes-workspace').exists()).toBe(true)
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
