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
  // Tool diffs no longer carry their own highlighter: settled diffs render
  // through @pierre/diffs (shiki), which is themed via --diff-* in DiffView.
  it('routes hljs and streaming tokens through the same keyword group', () => {
    const hljsTheme = readRendererFile('styles/hljs-theme.css')
    const streamingCodeBlock = readRendererFile('components/chat/message/StreamingCodeBlock.vue')

    expect(hljsTheme).toContain('var(--hg-syntax-keyword-fg')
    expect(streamingCodeBlock).toContain('var(--hg-syntax-keyword-fg')
  })
})
