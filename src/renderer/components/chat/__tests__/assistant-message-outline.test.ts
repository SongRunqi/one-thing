// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_OUTLINE_ANCHOR_ATTR,
  buildAssistantMessageOutlineMarkers,
  shouldShowAssistantMessageOutline,
} from '../assistant-message-outline'

function element(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

function setBoxHeight(target: HTMLElement, height: number) {
  Object.defineProperty(target, 'offsetHeight', {
    configurable: true,
    value: height,
  })
}

function setClientHeight(target: HTMLElement, height: number) {
  Object.defineProperty(target, 'clientHeight', {
    configurable: true,
    value: height,
  })
}

describe('assistant-message-outline', () => {
  it('builds heading markers and ignores landmarks when there are enough headings', () => {
    const row = element(`
      <div class="content">
        <h1>Plan</h1>
        <p>Intro</p>
        <h2>Implementation</h2>
        <div class="code-block-container"><div class="code-block-lang">ts</div></div>
      </div>
    `)

    const markers = buildAssistantMessageOutlineMarkers('m1', row)

    expect(markers.map(marker => marker.label)).toEqual(['Plan', 'Implementation'])
    expect(markers.map(marker => marker.level)).toEqual([1, 2])
    expect(row.querySelector('h1')?.getAttribute(ASSISTANT_OUTLINE_ANCHOR_ATTR)).toBe('m1:0')
    expect(row.querySelector('h2')?.getAttribute(ASSISTANT_OUTLINE_ANCHOR_ATTR)).toBe('m1:1')
    expect(row.querySelector('.code-block-container')?.getAttribute(ASSISTANT_OUTLINE_ANCHOR_ATTR)).toBeNull()
  })

  it('adds code, table, and image landmarks when headings are sparse', () => {
    const row = element(`
      <div class="content">
        <h2>Only heading</h2>
        <div class="code-block-container"><div class="code-block-lang">python</div></div>
        <table><tr><td>A</td></tr></table>
        <img alt="Generated architecture diagram">
      </div>
    `)

    const markers = buildAssistantMessageOutlineMarkers('m2', row)

    expect(markers.map(marker => marker.label)).toEqual([
      'Only heading',
      'Code - python',
      'Table',
      'Image - Generated architecture diagram',
    ])
    expect(markers.map(marker => marker.kind)).toEqual(['heading', 'code', 'table', 'image'])
  })

  it('requires enough markers and a tall row before showing the outline', () => {
    const row = document.createElement('div')
    const scroller = document.createElement('div')
    setBoxHeight(row, 700)
    setClientHeight(scroller, 700)

    expect(shouldShowAssistantMessageOutline(row, scroller, 1)).toBe(false)
    expect(shouldShowAssistantMessageOutline(row, scroller, 2)).toBe(true)

    setBoxHeight(row, 400)
    expect(shouldShowAssistantMessageOutline(row, scroller, 2)).toBe(false)
  })
})

