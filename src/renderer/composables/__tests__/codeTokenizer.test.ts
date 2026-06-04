import { describe, expect, it } from 'vitest'
import { renderCodeLines, renderTokenSpans, tokenizeCode } from '../codeTokenizer'

describe('codeTokenizer', () => {
  it('tokenizes JavaScript into stable class ranges', () => {
    const tokens = tokenizeCode('javascript', 'const name = "Ada"')

    expect(tokens.some(token => token.className.includes('tok-keyword'))).toBe(true)
    expect(tokens.some(token => token.className.includes('tok-string'))).toBe(true)
  })

  it('renders token spans without dropping plain text gaps', () => {
    const spans = renderTokenSpans('go', 'func main() { return }')
    const joined = spans.map(span => span.text).join('')

    expect(joined).toBe('func main() { return }')
    expect(spans.some(span => span.className.includes('tok-keyword'))).toBe(true)
  })

  it('keeps property names on their own semantic token class', () => {
    const tokens = tokenizeCode('javascript', 'user.name')

    expect(tokens.some(token => token.className.includes('tok-property'))).toBe(true)
  })

  it('falls back to a single plain span for unknown languages', () => {
    const spans = renderTokenSpans('made-up-lang', 'hello')

    expect(spans).toEqual([{ key: 'plain-0-5', text: 'hello', className: '' }])
  })

  it('renders streaming code as highlighted stable lines, including the active line', () => {
    const lines = renderCodeLines('bash', '# comment\nGET /api/v1/users')

    expect(lines).toHaveLength(2)
    expect(lines.map(line => line.tokens.map(token => token.text).join('')).join('\n'))
      .toBe('# comment\nGET /api/v1/users')
    expect(lines[0].tokens.some(token => token.className.includes('tok-comment'))).toBe(true)
  })
})
