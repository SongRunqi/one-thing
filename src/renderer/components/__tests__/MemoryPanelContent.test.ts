// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

function memoryOverview(): MemoryOverview {
  const settings = createDefaultSettings()
  const now = Date.now()
  return {
    enabled: true,
    agentId: 'default',
    root: '/tmp/onething-memory',
    memoryDir: '/tmp/onething-memory',
    soulPath: '/tmp/onething-memory/SOUL.md',
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
        searchMemory: vi.fn().mockResolvedValue({ success: true, results: [] }),
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

  it('keeps Memory panel focused on overview, profile, notes, and search', async () => {
    const wrapper = mount(MemoryPanelContent)
    await vi.waitFor(() => {
      expect(window.electronAPI.getMemoryOverview).toHaveBeenCalledWith('default')
      expect(wrapper.text()).toContain('/tmp/onething-memory')
    })

    const labels = wrapper.findAll('.memory-tab').map(tab => tab.text())
    expect(labels).toEqual(['Overview', 'Profile', 'Notes', 'Search'])
    expect(labels).not.toContain('Settings')
    expect(labels).not.toContain('Logs')
    expect(wrapper.find('.memory-snapshot').exists()).toBe(false)
    expect(wrapper.find('.memory-hero').text()).toContain('What AI knows')
    expect(wrapper.find('.memory-hero').text()).toContain('Memory has learned')
    expect(wrapper.find('.memory-hero-stats').text()).toContain('Durable facts')
    expect(wrapper.find('.memory-activity').text()).toContain('What AI learned recently')
    expect(wrapper.find('.memory-activity').text()).toContain('User: Timezone')
    expect(wrapper.find('.memory-activity').text()).not.toContain('daily/2026-06-07.md')
    expect(wrapper.find('.diagnostics-domain').text()).toContain('How memory is operating')
    expect(wrapper.find('.memory-map-block').exists()).toBe(false)
    expect(wrapper.find('.health-card-block').exists()).toBe(false)
    expect(wrapper.find('.root-path').exists()).toBe(false)
  })

  it('keeps readable Profile CRUD entry points available', async () => {
    const wrapper = mount(MemoryPanelContent)
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('/tmp/onething-memory')
    })

    await wrapper.findAll('.memory-tab').find(tab => tab.text().includes('Profile'))!.trigger('click')
    await vi.waitFor(() => {
      expect(window.electronAPI.listMemoryGraphEntities).toHaveBeenCalled()
      expect(wrapper.text()).toContain('Facts 1')
    })

    expect(wrapper.text()).toContain('Connections 0')
    expect(wrapper.text()).toContain('Entities 1')
    expect(wrapper.text()).toContain('Duplicates 0')
    expect(wrapper.find('.profile-page').text()).toContain('Shape what AI knows about you')
    expect(wrapper.text()).toContain('New fact')
    expect(wrapper.find('input[placeholder="Search profile..."]').exists()).toBe(true)
    expect(wrapper.find('.toolbar-actions').exists()).toBe(true)
  })

  it('separates notes and search into task-oriented workspaces', async () => {
    const wrapper = mount(MemoryPanelContent)
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('/tmp/onething-memory')
    })

    await wrapper.findAll('.memory-tab').find(tab => tab.text().includes('Notes'))!.trigger('click')
    await vi.waitFor(() => {
      expect(window.electronAPI.readMemoryFile).toHaveBeenCalled()
    })
    expect(wrapper.find('.notes-workspace').exists()).toBe(true)
    expect(wrapper.find('.notes-page').text()).toContain('Review raw memory notes')
    expect(wrapper.find('.viewer').exists()).toBe(true)
    expect(wrapper.find('.viewer').text()).toContain('Saved')

    await wrapper.findAll('.memory-tab').find(tab => tab.text().includes('Search'))!.trigger('click')
    expect(wrapper.find('.search-page').text()).toContain('Find or add memory')
    expect(wrapper.find('.search-workspace').text()).toContain('Recall memory')
    expect(wrapper.find('.search-workspace').text()).toContain('Append note')
    expect(wrapper.find('.results-surface').text()).toContain('Review')
    expect(wrapper.find('.results-surface').text()).toContain('Ready to recall')
  })
})
