import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const rendererDir = path.resolve(dirname, '..', '..')

function readRendererFile(relativePath: string): string {
  return fs.readFileSync(path.join(rendererDir, relativePath), 'utf8')
}

describe('renderer highlight group variables', () => {
  it('routes hljs, streaming tokens, and tool diff syntax through the same keyword group', () => {
    const hljsTheme = readRendererFile('styles/hljs-theme.css')
    const streamingCodeBlock = readRendererFile('components/chat/message/StreamingCodeBlock.vue')
    const toolDiffPreview = readRendererFile('components/chat/ToolDiffPreview.vue')

    expect(hljsTheme).toContain('var(--hg-syntax-keyword-fg')
    expect(streamingCodeBlock).toContain('var(--hg-syntax-keyword-fg')
    expect(toolDiffPreview).toContain('var(--hg-syntax-keyword-fg')
  })
})
