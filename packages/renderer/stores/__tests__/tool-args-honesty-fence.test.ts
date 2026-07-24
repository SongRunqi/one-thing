import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildToolStepView,
  clearStreamingContentCache,
} from '../helpers/tool-step-view'
import type { Step, ToolCall } from '@/types'

/**
 * Honesty fence (design: docs/design/tool-args-streaming-honesty.md §P5-3).
 *
 * For ANY prefix of the argument byte stream, the rendered view must be a
 * faithful projection of exactly the received bytes:
 *  - nothing renders as settled (streamingContent/diff) while receiving;
 *  - every 'closed' draft field equals its final decoded value;
 *  - the single 'open' field is a strict prefix of its final decoded value;
 *  - the file path only surfaces once its closing quote arrived, and then
 *    only as the exact final value — never a half-received name;
 *  - no +N/−N counts exist anywhere before a real diff does.
 *
 * A future change that re-blurs draft and settled states should fail here.
 */

const FINAL_ARGS = {
  edits: [
    { oldText: '| Athens | English_UK | Idea |\n', newText: '| Athens | 中文 | Idea |\n' },
    { oldText: 'iva_config_insert("LA", \'*\')', newText: 'iva_config_insert("LA", \'*\', \'chatbot\')' },
    { oldText: 'remove me\n', newText: '' },
  ],
  path: '/Users/me/71.01 需求/IVA/115. IVA Premier+Think-Idea 0810.md',
}
const FINAL_TEXT = JSON.stringify(FINAL_ARGS)

function finalValueAt(path: string): string | undefined {
  const memberMatch = path.match(/^edits\[(\d+)\]\.(oldText|newText)$/)
  if (memberMatch) {
    return FINAL_ARGS.edits[Number(memberMatch[1])]?.[memberMatch[2] as 'oldText' | 'newText']
  }
  if (path === 'path') return FINAL_ARGS.path
  return undefined
}

function streamingStep(streamingArgs: string, id: string): Step {
  const toolCall: ToolCall = {
    id,
    toolId: 'edit',
    toolName: 'edit',
    arguments: {},
    status: 'input-streaming',
    timestamp: 0,
    streamingArgs,
  }
  return {
    id,
    type: 'tool-call',
    title: '调用工具: edit',
    status: 'running',
    timestamp: 0,
    toolCallId: id,
    toolCall,
  }
}

beforeEach(() => {
  clearStreamingContentCache()
})

describe('tool args honesty fence', () => {
  it('every prefix renders only what was actually received', () => {
    for (let cut = 1; cut <= FINAL_TEXT.length; cut += 3) {
      const prefix = FINAL_TEXT.slice(0, cut)
      const view = buildToolStepView(streamingStep(prefix, `fence-${cut}`))

      // Nothing may look settled while receiving.
      expect(view.streamingContent).toBeNull()
      expect(view.diff).toBeNull()
      expect(view.streamingPreviewLines).toEqual([])

      const draft = view.streamingDraft
      expect(draft).not.toBeNull()
      if (!draft) continue

      expect(draft.charsReceived).toBe(prefix.length)
      expect(draft.complete).toBe(cut === FINAL_TEXT.length)
      expect(draft.parseError).toBeUndefined()

      for (const field of draft.fields) {
        const finalValue = finalValueAt(field.path)
        expect(finalValue).toBeDefined()
        if (field.state === 'closed') {
          // Closed = the exact final value, byte for byte.
          expect(field.value).toBe(finalValue)
        } else {
          // Open = a strict prefix of the final value, never beyond it.
          expect(finalValue!.startsWith(field.value)).toBe(true)
        }
      }

      // The title never carries a half-received path.
      if (view.filePath) {
        expect(view.filePath).toBe(FINAL_ARGS.path)
        expect(draft.pathPending).toBe(false)
      } else {
        expect(draft.pathPending).toBe(true)
      }
    }
  })

  it('at the exact final byte the draft settles into full agreement with JSON.parse', () => {
    const view = buildToolStepView(streamingStep(FINAL_TEXT, 'fence-full'))
    const draft = view.streamingDraft
    expect(draft?.complete).toBe(true)
    expect(draft?.openPath).toBeNull()
    expect(draft?.replacements).toHaveLength(FINAL_ARGS.edits.length)
    for (const [index, edit] of FINAL_ARGS.edits.entries()) {
      expect(draft?.replacements[index].find).toEqual({ text: edit.oldText, open: false })
      expect(draft?.replacements[index].replace).toEqual({ text: edit.newText, open: false })
    }
    expect(draft?.filePath).toBe(FINAL_ARGS.path)
  })
})
