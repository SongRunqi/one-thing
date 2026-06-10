// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MessageBubble from '../MessageBubble.vue'
import StreamingCodeBlock from '../StreamingCodeBlock.vue'
import StreamingMarkdown from '../StreamingMarkdown.vue'
import StepsPanel from '../../StepsPanel.vue'
import type { ChatMessage, ContentPart, MessageAttachment, Step, ToolCall } from '@/types'
import { clearStreamingContentCache } from '@/stores/helpers/tool-step-view'

function installRaf() {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number,
  )
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
}

async function advance(ms = 20) {
  await vi.advanceTimersByTimeAsync(ms)
  await nextTick()
}

const markdownStubs = {
  StreamingMarkdown: {
    name: 'StreamingMarkdown',
    props: ['content', 'isUser', 'isStreaming'],
    template: '<div data-renderer="streaming" :data-streaming="String(isStreaming)">{{ content }}</div>',
  },
  StaticMarkdown: {
    name: 'StaticMarkdown',
    props: ['content', 'isUser'],
    template: '<div data-renderer="static">{{ content }}</div>',
  },
  StepsPanel: { template: '<div />' },
  TextEditor: { template: '<textarea />' },
}

function toolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 'tc1',
    toolId: 'edit',
    toolName: 'edit',
    arguments: { path: '/tmp/a.ts' },
    status: 'pending',
    timestamp: 0,
    changes: {
      diff: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n',
      filePath: '/tmp/a.ts',
      additions: 1,
      deletions: 1,
    },
    ...overrides,
  }
}

function step(overrides: Partial<Step> = {}): Step {
  return {
    id: 'step1',
    type: 'tool-call',
    title: 'edit',
    status: 'awaiting-confirmation',
    timestamp: 0,
    toolCallId: 'tc1',
    toolCall: toolCall({ requiresConfirmation: true }),
    ...overrides,
  }
}

function writeStep(overrides: Partial<Step> = {}, toolOverrides: Partial<ToolCall> = {}): Step {
  const writeToolCall: ToolCall = {
    id: 'write1',
    toolId: 'write',
    toolName: 'write',
    arguments: {},
    status: 'input-streaming',
    timestamp: 0,
    ...toolOverrides,
  }

  return {
    id: 'write-step',
    type: 'tool-call',
    title: 'write',
    status: 'running',
    timestamp: 0,
    toolCallId: writeToolCall.id,
    toolCall: writeToolCall,
    ...overrides,
  }
}

function imageAttachment(overrides: Partial<MessageAttachment> = {}): MessageAttachment {
  return {
    id: 'img1',
    fileName: 'screenshot.png',
    mimeType: 'image/png',
    size: 12,
    mediaType: 'image',
    base64Data: 'abc123',
    ...overrides,
  }
}

function fileAttachment(overrides: Partial<MessageAttachment> = {}): MessageAttachment {
  return {
    id: 'file1',
    fileName: 'notes.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    mediaType: 'document',
    base64Data: 'pdf123',
    ...overrides,
  }
}

describe('stream end visual stability', () => {
  beforeEach(() => {
    installRaf()
    clearStreamingContentCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps freshly streamed assistant text on StreamingMarkdown after stream complete', async () => {
    const parts: ContentPart[] = [{ type: 'text', content: 'Hello there' }]
    const wrapper = mount(MessageBubble, {
      props: {
        role: 'assistant',
        content: 'Hello there',
        contentParts: parts,
        isStreaming: true,
      },
      global: { stubs: markdownStubs },
    })

    expect(wrapper.find('[data-renderer="streaming"]').exists()).toBe(true)
    expect(wrapper.find('[data-renderer="static"]').exists()).toBe(false)

    await wrapper.setProps({ isStreaming: false })
    await nextTick()

    expect(wrapper.find('[data-renderer="streaming"]').exists()).toBe(true)
    expect(wrapper.find('[data-renderer="streaming"]').attributes('data-streaming')).toBe('false')
    expect(wrapper.find('[data-renderer="static"]').exists()).toBe(false)
  })

  it('uses StaticMarkdown for cold completed assistant messages', () => {
    const parts: ContentPart[] = [{ type: 'text', content: 'Already complete' }]
    const wrapper = mount(MessageBubble, {
      props: {
        role: 'assistant',
        content: 'Already complete',
        contentParts: parts,
        isStreaming: false,
      },
      global: { stubs: markdownStubs },
    })

    expect(wrapper.find('[data-renderer="static"]').exists()).toBe(true)
    expect(wrapper.find('[data-renderer="streaming"]').exists()).toBe(false)
  })

  it('keeps word wrappers during settling and removes new-word animation classes', async () => {
    const wrapper = mount(StreamingMarkdown, {
      props: {
        content: 'Hello streaming world',
        isUser: false,
        isStreaming: true,
      },
    })
    await nextTick()

    expect(wrapper.findAll('[data-stream-word]').length).toBeGreaterThan(0)
    expect(wrapper.findAll('.stream-word.is-new').length).toBeGreaterThan(0)

    await wrapper.setProps({ isStreaming: false })
    await advance()

    expect(wrapper.findAll('[data-stream-word]').length).toBeGreaterThan(0)
    expect(wrapper.findAll('.stream-word.is-new')).toHaveLength(0)

    await advance(240)
    expect(wrapper.findAll('[data-stream-word]')).toHaveLength(0)
  })

  it('does not replace unchanged code line nodes when complete flips true', async () => {
    const wrapper = mount(StreamingCodeBlock, {
      props: {
        lang: 'ts',
        content: 'const a = 1\nconst b = 2',
        complete: false,
        isStreaming: true,
      },
    })
    await nextTick()
    await advance()

    const before = wrapper.findAll('[data-code-line]').map(line => line.element)
    await wrapper.setProps({ complete: true, isStreaming: false })
    await advance()
    const after = wrapper.findAll('[data-code-line]').map(line => line.element)

    expect(after).toHaveLength(before.length)
    expect(after[0]).toBe(before[0])
    expect(after[1]).toBe(before[1])
  })

  it('groups consecutive steps of the same tool type correctly', async () => {
    const wrapper = mount(StepsPanel, {
      props: {
        steps: [
          step({ id: 'step1', title: 'edit', toolCall: toolCall({ id: 'tc1', toolName: 'edit' }) }),
          step({ id: 'step2', title: 'edit', toolCall: toolCall({ id: 'tc2', toolName: 'edit' }) }),
        ],
      },
      global: {
        stubs: {
          FartCallItem: { template: '<div />' },
        },
      },
    })
    await nextTick()

    const groups = wrapper.findAll('.workflow-group')
    expect(groups).toHaveLength(1)
    expect(groups[0].classes()).toContain('edit')
    expect(groups[0].find('.group-header-anchor > .group-header').exists()).toBe(true)
    expect(wrapper.find('.group-summary-text').text()).toBe('2 edits')
    expect(wrapper.find('.operation-status-icon').exists()).toBe(true)
    expect(wrapper.find('.group-type-icon').exists()).toBe(false)
    expect(wrapper.find('.group-final-result').exists()).toBe(false)
  })

  it('does not repeat diff stats in expanded operation metadata', async () => {
    const wrapper = mount(StepsPanel, {
      props: {
        steps: [
          step({
            id: 'step1',
            status: 'completed',
            toolCall: toolCall({ id: 'tc1', toolName: 'edit', status: 'completed', requiresConfirmation: false }),
          }),
          step({
            id: 'step2',
            status: 'completed',
            toolCall: toolCall({ id: 'tc2', toolName: 'edit', status: 'completed', requiresConfirmation: false }),
          }),
        ],
      },
      global: {
        stubs: {
          FartCallItem: { template: '<div />' },
        },
      },
    })
    await nextTick()

    await wrapper.find('.group-header').trigger('click')
    await nextTick()

    const meta = wrapper.find('.tree-node-row .node-meta').text()
    expect(meta).toBe('+1 -1')
    expect(meta).not.toContain('(+1 -1)')
  })

  it('toggles collapsed and expanded states on click', async () => {
    const wrapper = mount(StepsPanel, {
      props: {
        steps: [
          step({
            id: 'step1',
            status: 'completed',
            toolCall: toolCall({ id: 'tc1', status: 'completed', requiresConfirmation: false }),
          }),
          step({
            id: 'step2',
            status: 'completed',
            toolCall: toolCall({ id: 'tc2', status: 'completed', requiresConfirmation: false }),
          }),
        ],
      },
      global: {
        stubs: {
          FartCallItem: { template: '<div />' },
        },
      },
    })
    await nextTick()

    expect(wrapper.find('.workflow-group').classes()).toContain('collapsed')
    expect(wrapper.find('.group-timeline-tree').exists()).toBe(false)

    await wrapper.find('.group-header').trigger('click')
    await nextTick()

    expect(wrapper.find('.workflow-group').classes()).toContain('expanded')
    expect(wrapper.find('.group-timeline-tree').exists()).toBe(true)

    await wrapper.find('.group-header').trigger('click')
    await nextTick()

    expect(wrapper.find('.workflow-group').classes()).toContain('collapsed')
    expect(wrapper.find('.group-timeline-tree').exists()).toBe(false)
  })

  it('renders vertical timeline checklist with node content when expanded', async () => {
    const wrapper = mount(StepsPanel, {
      props: {
        steps: [
          step({
            id: 'step1',
            status: 'completed',
            toolCall: toolCall({ id: 'tc1', toolName: 'write', status: 'completed', requiresConfirmation: false }),
          }),
          step({
            id: 'step2',
            status: 'completed',
            toolCall: toolCall({ id: 'tc2', toolName: 'write', status: 'completed', requiresConfirmation: false }),
          }),
        ],
      },
      global: {
        stubs: {
          FartCallItem: { template: '<div />' },
        },
      },
    })
    await nextTick()

    await wrapper.find('.group-header').trigger('click')
    await nextTick()

    const nodes = wrapper.findAll('.tree-node-row')
    expect(nodes).toHaveLength(2)
    expect(nodes[0].find('.node-target').text()).toBe('Wrote a.ts')
    expect(nodes[0].find('.node-action').text().trim()).toBe('Wrote')
    expect(nodes[0].find('.node-target-name').text()).toBe('a.ts')
    expect(nodes[0].find('.node-target-name').classes()).toContain('file-link')
  })

  it('expands inline details when a step node is clicked', async () => {
    const wrapper = mount(StepsPanel, {
      props: {
        steps: [
          step({
            id: 'step1',
            status: 'completed',
            toolCall: toolCall({ id: 'tc1', toolName: 'write', status: 'completed', requiresConfirmation: false }),
          }),
          step({
            id: 'step2',
            status: 'completed',
            toolCall: toolCall({ id: 'tc2', toolName: 'write', status: 'completed', requiresConfirmation: false }),
          }),
        ],
      },
      global: {
        stubs: {
          FartCallItem: { template: '<div />' },
        },
      },
    })
    await nextTick()

    await wrapper.find('.group-header').trigger('click')
    await nextTick()

    await wrapper.find('.tree-node-row .node-target').trigger('click')
    await nextTick()

    expect(wrapper.find('.activity-inline-details').exists()).toBe(true)
  })

  it('auto-expands failed tool calls and shows failure summaries in groups', async () => {
    const wrapper = mount(StepsPanel, {
      props: {
        steps: [
          step({
            id: 'failed-edit-1',
            status: 'failed',
            error: 'No matching text found in file',
            toolCall: toolCall({
              id: 'tc-failed-edit-1',
              toolName: 'edit',
              status: 'failed',
              requiresConfirmation: false,
              changes: undefined,
              arguments: { path: '/tmp/project/src/app.ts' },
            }),
          }),
          step({
            id: 'failed-edit-2',
            status: 'failed',
            error: 'No matching text found in file',
            toolCall: toolCall({
              id: 'tc-failed-edit-2',
              toolName: 'edit',
              status: 'failed',
              requiresConfirmation: false,
              changes: undefined,
              arguments: { path: '/tmp/project/src/other.ts' },
            }),
          }),
        ],
      },
      global: {
        stubs: {
          FartCallItem: { template: '<div />' },
        },
      },
    })
    await nextTick()

    expect(wrapper.find('.workflow-group').classes()).toContain('expanded')
    expect(wrapper.findAll('.tree-node-row')).toHaveLength(2)
    expect(wrapper.findAll('.operation-failure')).toHaveLength(2)
    expect(wrapper.find('.operation-failure').text()).toContain('No matching text found')
    expect(wrapper.findAll('.activity-inline-details')).toHaveLength(2)
  })

  it('keeps expanded tool calls when reopening a group', async () => {
    const wrapper = mount(StepsPanel, {
      props: {
        steps: [
          step({
            id: 'write-1',
            status: 'completed',
            toolCall: toolCall({
              id: 'tc-write-1',
              toolName: 'write',
              status: 'completed',
              requiresConfirmation: false,
            }),
          }),
          step({
            id: 'write-2',
            status: 'completed',
            toolCall: toolCall({
              id: 'tc-write-2',
              toolName: 'write',
              status: 'completed',
              requiresConfirmation: false,
            }),
          }),
        ],
      },
      global: {
        stubs: {
          FartCallItem: { template: '<div />' },
        },
      },
    })
    await nextTick()

    await wrapper.find('.group-header').trigger('click')
    await nextTick()
    await wrapper.find('.tree-node-row .node-target').trigger('click')
    await nextTick()

    expect(wrapper.find('.activity-inline-details').exists()).toBe(true)

    await wrapper.find('.group-header').trigger('click')
    await nextTick()
    await wrapper.find('.group-header').trigger('click')
    await nextTick()

    expect(wrapper.findAll('.tree-node-row')).toHaveLength(2)
    expect(wrapper.find('.activity-inline-details').exists()).toBe(true)
  })

  it('renders as a single flat row when there is only one tool call and expands it inline', async () => {
    const wrapper = mount(StepsPanel, {
      props: {
        steps: [
          step({
            id: 'step1',
            status: 'completed',
            toolCall: toolCall({ id: 'tc1', toolName: 'write', status: 'completed', requiresConfirmation: false }),
          }),
        ],
      },
      global: {
        stubs: {
          FartCallItem: { template: '<div />' },
        },
      },
    })
    await nextTick()

    expect(wrapper.find('.operation-row').exists()).toBe(true)
    expect(wrapper.find('.workflow-group').exists()).toBe(false)
    expect(wrapper.find('.operation-row .node-target').text()).toBe('Wrote a.ts')
    expect(wrapper.find('.operation-row .node-action').text().trim()).toBe('Wrote')
    expect(wrapper.find('.operation-row .node-target-name').text()).toBe('a.ts')

    await wrapper.find('.operation-row .node-target').trigger('click')
    await nextTick()

    expect(wrapper.find('.activity-inline-details').exists()).toBe(true)
  })

  it('renders failed edit rows with filename and compact reason', async () => {
    const wrapper = mount(StepsPanel, {
      props: {
        steps: [
          step({
            id: 'failed-edit',
            status: 'failed',
            error: 'No matching text found in file',
            toolCall: toolCall({
              id: 'tc-failed-edit',
              status: 'failed',
              requiresConfirmation: false,
              changes: undefined,
              arguments: {
                path: '/tmp/project/src/app.ts',
                edits: [{ oldText: 'missing', newText: 'replacement' }],
              },
            }),
          }),
        ],
      },
      global: {
        stubs: {
          FartCallItem: { template: '<div />' },
        },
      },
    })
    await nextTick()

    expect(wrapper.find('.operation-row .node-target').text()).toBe('Edit failed: app.ts')
    expect(wrapper.find('.operation-failure').text()).toContain('No matching text found')
    expect(wrapper.find('.group-final-result').exists()).toBe(false)
    expect(wrapper.find('.activity-inline-details').exists()).toBe(true)
  })

  it('opens image attachments from base64 data and stops click bubbling', async () => {
    const wrapper = mount(MessageBubble, {
      props: {
        role: 'user',
        content: '',
        attachments: [imageAttachment()],
        isStreaming: false,
      },
      global: { stubs: markdownStubs },
    })
    const parentClick = vi.fn()
    wrapper.find('.bubble').element.addEventListener('click', parentClick)

    wrapper.find('.attachment-image').element.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    }))
    await nextTick()

    expect(parentClick).not.toHaveBeenCalled()
    expect(wrapper.emitted('openImage')?.[0]).toEqual([
      'data:image/png;base64,abc123',
      'screenshot.png',
    ])
  })

  it('renders an image generation skeleton content part', async () => {
    const wrapper = mount(MessageBubble, {
      props: {
        role: 'assistant',
        content: '',
        contentParts: [{ type: 'image-loading', label: 'Generating image' }],
        isStreaming: true,
      },
      global: { stubs: markdownStubs },
    })

    const skeleton = wrapper.find('.image-generation-skeleton')
    expect(skeleton.exists()).toBe(true)
    expect(skeleton.attributes('aria-label')).toBe('Generating image')
  })

  it('renders tool-loop waiting after data steps', async () => {
    const wrapper = mount(MessageBubble, {
      props: {
        role: 'assistant',
        content: '',
        contentParts: [
          { type: 'data-steps', turnIndex: 1 },
          { type: 'waiting', turnIndex: 2 },
        ],
        steps: [step({ turnIndex: 1 })],
        isStreaming: true,
      },
      global: { stubs: markdownStubs },
    })

    const waiting = wrapper.find('.tool-loop-waiting')
    expect(waiting.exists()).toBe(true)
    expect(waiting.text()).toContain('Waiting')
  })

  it('hides opening waiting because MessageThinking owns that status', async () => {
    const wrapper = mount(MessageBubble, {
      props: {
        role: 'assistant',
        content: '',
        contentParts: [{ type: 'waiting', turnIndex: 1 }],
        isStreaming: true,
      },
      global: { stubs: markdownStubs },
    })

    expect(wrapper.find('.tool-loop-waiting').exists()).toBe(false)
  })

  it('opens image attachments from url-only sources', async () => {
    const wrapper = mount(MessageBubble, {
      props: {
        role: 'user',
        content: '',
        attachments: [imageAttachment({
          base64Data: undefined,
          url: 'media://session/image.png',
        })],
        isStreaming: false,
      },
      global: { stubs: markdownStubs },
    })

    await wrapper.find('.attachment-image').trigger('click')

    expect(wrapper.emitted('openImage')?.[0]).toEqual([
      'media://session/image.png',
      'screenshot.png',
    ])
  })

  it('does not open previews for non-image attachments', async () => {
    const wrapper = mount(MessageBubble, {
      props: {
        role: 'user',
        content: '',
        attachments: [fileAttachment()],
        isStreaming: false,
      },
      global: { stubs: markdownStubs },
    })

    expect(wrapper.find('.attachment-image').exists()).toBe(false)
    await wrapper.find('.attachment-file').trigger('click')

    expect(wrapper.emitted('openImage')).toBeUndefined()
  })

  it('routes attachment image opens through the Electron preview window', async () => {
    const openImagePreview = vi.fn()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
    Object.defineProperty(window, 'electronAPI', {
      value: { openImagePreview },
      configurable: true,
    })
    const { default: MessageItem } = await import('../../MessageItem.vue')
    const message: ChatMessage = {
      id: 'm1',
      role: 'user',
      content: '',
      timestamp: 0,
      attachments: [imageAttachment()],
    }
    const wrapper = mount(MessageItem, {
      props: { message },
      global: {
        stubs: {
          ...markdownStubs,
          ImagePreview: { template: '<div />' },
          MessageActions: { template: '<div />' },
          MessageError: { template: '<div />' },
          MessageSystem: { template: '<div />' },
          MessageThinking: { template: '<div />' },
          SelectionToolbar: { template: '<div />' },
          StepsPanel: { template: '<div />' },
        },
      },
    })

    await wrapper.find('.attachment-image').trigger('click')

    expect(openImagePreview).toHaveBeenCalledWith(
      'data:image/png;base64,abc123',
      'screenshot.png',
    )
  })
})
