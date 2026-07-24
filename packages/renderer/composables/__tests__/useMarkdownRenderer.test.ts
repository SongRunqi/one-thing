// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../useMarkdownRenderer'

describe('useMarkdownRenderer', () => {
  it('escapes raw html for document markdown by default', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">', false, { surface: 'document' })

    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img src=x')
  })

  it('renders code copy button hosts without inline handlers', () => {
    const html = renderMarkdown('```ts\nconst value = 1\n```', false, { surface: 'document' })

    expect(html).toContain('class="code-block-copy-host"')
    expect(html).toContain('data-code=')
    expect(html).not.toContain(['<', 'button'].join(''))
    expect(html).not.toContain('onclick=')
  })

  it('renders emoji shortcodes in document text', () => {
    const html = renderMarkdown('Ship it :rocket: :sparkles:', false, { surface: 'document' })

    expect(html).toContain('🚀')
    expect(html).toContain('✨')
    expect(html).not.toContain(':rocket:')
  })

  it('keeps emoji shortcodes literal inside inline code', () => {
    const html = renderMarkdown('`:rocket:`', false, { surface: 'document' })

    expect(html).toContain(':rocket:')
    expect(html).not.toContain('🚀')
  })

  it('rewrites sandbox: image sources to file:// URLs', () => {
    const html = renderMarkdown('![cat](<sandbox:/Users/me/cute cat.png>)', false, { surface: 'document' })

    expect(html).toContain('src="file:///Users/me/cute%20cat.png"')
    expect(html).not.toContain('sandbox:')
  })

  it('rewrites bare absolute-path image sources to file:// URLs', () => {
    const html = renderMarkdown('![shot](/Users/me/pic.png)', false, { surface: 'document' })

    expect(html).toContain('src="file:///Users/me/pic.png"')
  })

  it('leaves remote and media image sources untouched', () => {
    const remote = renderMarkdown('![web](https://example.com/a.png)', false, { surface: 'document' })
    const media = renderMarkdown('![Generated Image|mediaId:abc](media://abc.png)', false, { surface: 'document' })

    expect(remote).toContain('src="https://example.com/a.png"')
    expect(media).toContain('src="media://abc.png"')
  })
})
