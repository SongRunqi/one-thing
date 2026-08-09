// @vitest-environment happy-dom
/**
 * G2 验收(渲染侧):氛围层的握手、几何喂送、pause/resume、拆除,以及两条
 * 结构契约(点击穿透 + z 位在内容之上、浮层之下)。
 *
 * 与 webview 面板同一套 token 握手(见 PluginWebviewFrame.test.ts),只是氛围层
 * 是纯视觉:没有 invoke/result,多了 geometry / pause / resume。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PluginAmbientLayer from '../PluginAmbientLayer.vue'

const here = dirname(fileURLToPath(import.meta.url))

/** 假的 iframe contentWindow —— 记账 postMessage,不真的去取 onething-plugin://。 */
function stubFrame(wrapper: any) {
  const posted: any[] = []
  const contentWindow = { postMessage: (message: any) => posted.push(message) }
  const iframe = wrapper.find('iframe').element as HTMLIFrameElement
  Object.defineProperty(iframe, 'contentWindow', { value: contentWindow, configurable: true })
  return { posted, contentWindow, iframe }
}

/** 从 iframe 那一侧发一条消息(source 必须是它的 contentWindow)。 */
function fromFrame(contentWindow: unknown, data: unknown): void {
  const event = new MessageEvent('message', { data, origin: 'null' })
  Object.defineProperty(event, 'source', { value: contentWindow })
  window.dispatchEvent(event)
}

/** 造一个 composer 地标,并给它一个非零矩形(happy-dom 默认全 0)。 */
function installComposerAnchor(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-ambient-anchor', 'composer')
  el.getBoundingClientRect = () => ({
    top: 500, left: 100, right: 700, bottom: 560, width: 600, height: 60,
    x: 100, y: 500, toJSON: () => ({}), ...rect,
  }) as DOMRect
  document.body.appendChild(el)
  return el
}

beforeEach(() => {
  // rAF 同步化 —— scheduleMeasure 走它,测试里要立刻拿到几何。
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  document.querySelectorAll('[data-ambient-anchor]').forEach(el => el.remove())
  vi.unstubAllGlobals()
})

describe('氛围层:握手', () => {
  it('挂载后 iframe 是全窗 sandbox=allow-scripts(无 allow-same-origin)', () => {
    const wrapper = mount(PluginAmbientLayer, { props: { entryUrl: 'onething-plugin://snow-scene/ambient.html' } })
    const iframe = wrapper.find('iframe')
    expect(iframe.attributes('src')).toBe('onething-plugin://snow-scene/ambient.html')
    expect(iframe.attributes('sandbox')).toBe('allow-scripts')
    expect(iframe.attributes('referrerpolicy')).toBe('no-referrer')
    // 纯装饰:对辅助技术隐身、不进 Tab 焦点序列。
    expect(iframe.attributes('aria-hidden')).toBe('true')
    expect(iframe.attributes('tabindex')).toBe('-1')
  })

  it('首帧 load 推 init,带 token', async () => {
    const wrapper = mount(PluginAmbientLayer, { props: { entryUrl: 'onething-plugin://snow-scene/ambient.html' } })
    const { posted } = stubFrame(wrapper)
    await wrapper.find('iframe').trigger('load')
    expect(posted).toHaveLength(1)
    expect(posted[0].type).toBe('ambient-init')
    expect(typeof posted[0].token).toBe('string')
    expect(posted[0].token.length).toBeGreaterThan(8)
  })
})

describe('氛围层:几何喂送', () => {
  it('ready 之后推 geometry —— viewport + composerRect 的形状', async () => {
    installComposerAnchor({})
    const wrapper = mount(PluginAmbientLayer, { props: { entryUrl: 'onething-plugin://snow-scene/ambient.html' } })
    const { posted, contentWindow } = stubFrame(wrapper)
    await wrapper.find('iframe').trigger('load')
    const token = posted[0].token

    fromFrame(contentWindow, { token, type: 'ambient-ready' })
    await flushPromises()

    const geometry = posted.find(m => m.type === 'ambient-geometry')
    expect(geometry).toBeTruthy()
    expect(geometry.token).toBe(token)
    expect(geometry.viewport).toEqual({ width: window.innerWidth, height: window.innerHeight })
    expect(geometry.composerRect).toMatchObject({ top: 500, left: 100, width: 600, height: 60 })
    // 地标是宿主枚举的一张表(append-only),不暴露任意 DOM。
    expect(geometry.anchors).toHaveProperty('composer')
  })

  it('没有 composer 地标时 composerRect = null(而不是抛)', async () => {
    const wrapper = mount(PluginAmbientLayer, { props: { entryUrl: 'onething-plugin://snow-scene/ambient.html' } })
    const { posted, contentWindow } = stubFrame(wrapper)
    await wrapper.find('iframe').trigger('load')
    fromFrame(contentWindow, { token: posted[0].token, type: 'ambient-ready' })
    await flushPromises()
    expect(posted.find(m => m.type === 'ambient-geometry').composerRect).toBeNull()
  })

  it('window resize 触发再推一次几何(节流走 rAF)', async () => {
    installComposerAnchor({})
    const wrapper = mount(PluginAmbientLayer, { props: { entryUrl: 'onething-plugin://snow-scene/ambient.html' } })
    const { posted, contentWindow } = stubFrame(wrapper)
    await wrapper.find('iframe').trigger('load')
    fromFrame(contentWindow, { token: posted[0].token, type: 'ambient-ready' })
    await flushPromises()
    const before = posted.filter(m => m.type === 'ambient-geometry').length

    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(posted.filter(m => m.type === 'ambient-geometry').length).toBeGreaterThan(before)
  })

  it('握手没回来就不推几何(resize 也不推)', async () => {
    const wrapper = mount(PluginAmbientLayer, { props: { entryUrl: 'onething-plugin://snow-scene/ambient.html' } })
    const { posted } = stubFrame(wrapper)
    await wrapper.find('iframe').trigger('load')
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(posted.find(m => m.type === 'ambient-geometry')).toBeUndefined()
  })
})

describe('氛围层:pause / resume(窗口失焦/隐藏即停)', () => {
  it('失焦推 pause,重新聚焦推 resume', async () => {
    const wrapper = mount(PluginAmbientLayer, { props: { entryUrl: 'onething-plugin://snow-scene/ambient.html' } })
    const { posted, contentWindow } = stubFrame(wrapper)
    await wrapper.find('iframe').trigger('load')
    fromFrame(contentWindow, { token: posted[0].token, type: 'ambient-ready' })
    await flushPromises()

    window.dispatchEvent(new Event('blur'))
    expect(posted.some(m => m.type === 'ambient-pause')).toBe(true)

    window.dispatchEvent(new Event('focus'))
    expect(posted.some(m => m.type === 'ambient-resume')).toBe(true)
  })

  it('握手前失焦不发消息(iframe 还没起,发了也没人收)', async () => {
    const wrapper = mount(PluginAmbientLayer, { props: { entryUrl: 'onething-plugin://snow-scene/ambient.html' } })
    const { posted } = stubFrame(wrapper)
    await wrapper.find('iframe').trigger('load')
    window.dispatchEvent(new Event('blur'))
    expect(posted.some(m => m.type === 'ambient-pause')).toBe(false)
  })
})

describe('氛围层:token 闸与拆除', () => {
  it('伪造 token / 陌生 source 的 ready 被丢弃 —— 不触发几何', async () => {
    installComposerAnchor({})
    const wrapper = mount(PluginAmbientLayer, { props: { entryUrl: 'onething-plugin://snow-scene/ambient.html' } })
    const { posted, contentWindow } = stubFrame(wrapper)
    await wrapper.find('iframe').trigger('load')

    fromFrame(contentWindow, { token: 'forged', type: 'ambient-ready' })
    fromFrame({ postMessage: () => {} }, { token: posted[0].token, type: 'ambient-ready' })
    await flushPromises()
    expect(posted.find(m => m.type === 'ambient-geometry')).toBeUndefined()
  })

  it('卸载后 window 上不留 message 监听,迟到的 ready 什么也触发不了', async () => {
    const wrapper = mount(PluginAmbientLayer, { props: { entryUrl: 'onething-plugin://snow-scene/ambient.html' } })
    const { posted, contentWindow } = stubFrame(wrapper)
    await wrapper.find('iframe').trigger('load')
    const token = posted[0].token

    const removeSpy = vi.spyOn(window, 'removeEventListener')
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function))

    const before = posted.length
    fromFrame(contentWindow, { token, type: 'ambient-ready' })
    await flushPromises()
    expect(posted).toHaveLength(before)
    removeSpy.mockRestore()
  })
})

describe('氛围层:结构契约(点击穿透 + z 位)', () => {
  const source = readFileSync(resolve(here, '../PluginAmbientLayer.vue'), 'utf-8')

  it('层与 iframe 都 pointer-events:none —— 点击穿透到真 UI', () => {
    // 无 CSS 注入(vitest css:false),所以验的是源码契约:两处都写死穿透。
    expect(source).toMatch(/pointer-events:\s*none/)
    // 根容器全窗定位。
    expect(source).toMatch(/position:\s*fixed/)
    expect(source).toMatch(/inset:\s*0/)
  })

  it('z 位用 --z-ambient token,不是数字字面量(过 ui-gate)', () => {
    expect(source).toMatch(/z-index:\s*var\(--z-ambient\)/)
    expect(source).not.toMatch(/z-index:\s*\d/)
  })

  it('--z-ambient 数值在内容(sticky)之上、浮层(dropdown)之下', () => {
    const vars = readFileSync(resolve(here, '../../../styles/variables.css'), 'utf-8')
    const read = (name: string) => Number(new RegExp(`--${name}:\\s*(\\d+)`).exec(vars)?.[1])
    const sticky = read('z-sticky')
    const ambient = read('z-ambient')
    const dropdown = read('z-dropdown')
    expect(Number.isFinite(ambient)).toBe(true)
    expect(ambient).toBeGreaterThan(sticky)
    expect(ambient).toBeLessThan(dropdown)
  })
})
