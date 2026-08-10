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
import { PLUGIN_AMBIENT_ANCHORS } from '@/workspace/plugin-panel-types'

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

/** 造一块地标,并给它一个非零矩形(happy-dom 默认全 0)。 */
function installAnchor(name: string, rect: Partial<DOMRect> = {}, parent: HTMLElement = document.body): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-ambient-anchor', name)
  el.getBoundingClientRect = () => ({
    top: 500, left: 100, right: 700, bottom: 560, width: 600, height: 60,
    x: 100, y: 500, toJSON: () => ({}), ...rect,
  }) as DOMRect
  parent.appendChild(el)
  return el
}

/** 造一个 composer 地标(v1 那一个包络)。 */
function installComposerAnchor(rect: Partial<DOMRect> = {}): HTMLElement {
  return installAnchor('composer', rect)
}

/** 跑到握手完成、拿到第一帧几何为止。 */
async function mountReady() {
  const wrapper = mount(PluginAmbientLayer, { props: { entryUrl: 'onething-plugin://snow-scene/ambient.html' } })
  const { posted, contentWindow } = stubFrame(wrapper)
  await wrapper.find('iframe').trigger('load')
  fromFrame(contentWindow, { token: posted[0].token, type: 'ambient-ready' })
  await flushPromises()
  return { wrapper, posted, contentWindow, token: posted[0].token as string }
}

const geometries = (posted: any[]) => posted.filter(m => m.type === 'ambient-geometry')
const lastGeometry = (posted: any[]) => geometries(posted)[geometries(posted).length - 1]

beforeEach(() => {
  // rAF → 微任务:`await flushPromises()` 之后几何就到了。
  //
  // **不能同步化**:真 rAF 永远在 `rafHandle = raf(cb)` 这一行赋值**之后**才回调,
  // 同步替身会让句柄被回调后的返回值覆盖成非 0,scheduleMeasure 从此永久早退 ——
  // 那是替身造的假象,不是被测代码的行为(第二次 resize 不再测量的判例)。
  let handle = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    handle += 1
    queueMicrotask(() => cb(0))
    return handle
  })
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

describe('氛围层:词表(L0 —— 名字 × kind × cardinality)', () => {
  it('握手后恰好发一次 vocabulary,且排在首帧几何之前', async () => {
    installComposerAnchor()
    const { posted } = await mountReady()

    const vocabIndex = posted.findIndex(m => m.type === 'ambient-vocabulary')
    const geometryIndex = posted.findIndex(m => m.type === 'ambient-geometry')
    expect(vocabIndex).toBeGreaterThan(-1)
    expect(posted.filter(m => m.type === 'ambient-vocabulary')).toHaveLength(1)
    // 词表先到:插件读第一批矩形时已经知道每个名字是什么种类。
    expect(vocabIndex).toBeLessThan(geometryIndex)
  })

  it('词表就是宿主那张静态表(包络是 envelope,其余全 surface)', async () => {
    const { posted } = await mountReady()
    const vocabulary = posted.find(m => m.type === 'ambient-vocabulary')
    expect(vocabulary.anchors).toEqual(PLUGIN_AMBIENT_ANCHORS)
    expect(Object.keys(vocabulary.anchors)).toEqual(['composer', 'composer.input', 'status.chip', 'composer.block'])
    expect(vocabulary.anchors.composer.cardinality).toBe('singleton')
    expect(vocabulary.anchors['status.chip'].cardinality).toBe('per-item')
    // composer 是兜底包络 —— kind 说话,插件不必点名(§8.1:通用物理不硬编码名字)。
    expect(vocabulary.anchors.composer.kind).toBe('envelope')
    const rest = Object.entries(vocabulary.anchors).filter(([name]) => name !== 'composer')
    expect(rest.every(([, spec]: [string, any]) => spec.kind === 'surface')).toBe(true)
  })

  it('重复的 ready 不重发词表(静态表只发一次)', async () => {
    const { posted, contentWindow, token } = await mountReady()
    fromFrame(contentWindow, { token, type: 'ambient-ready' })
    await flushPromises()
    expect(posted.filter(m => m.type === 'ambient-vocabulary')).toHaveLength(1)
  })

  it('握手没回来就没有词表', async () => {
    const wrapper = mount(PluginAmbientLayer, { props: { entryUrl: 'onething-plugin://snow-scene/ambient.html' } })
    const { posted } = stubFrame(wrapper)
    await wrapper.find('iframe').trigger('load')
    expect(posted.find(m => m.type === 'ambient-vocabulary')).toBeUndefined()
  })
})

describe('氛围层:surfaces(同名多实例 + 进出场)', () => {
  it('同名多实例各占一行,index 按文档序递增', async () => {
    installComposerAnchor()
    installAnchor('status.chip', { top: 470, left: 100, right: 180, bottom: 494, width: 80, height: 24 })
    installAnchor('status.chip', { top: 470, left: 190, right: 300, bottom: 494, width: 110, height: 24 })
    const { posted } = await mountReady()

    const chips = lastGeometry(posted).surfaces.filter((s: any) => s.name === 'status.chip')
    expect(chips).toHaveLength(2)
    expect(chips.map((s: any) => s.index)).toEqual([0, 1])
    expect(chips[0].rect).toMatchObject({ left: 100, width: 80, top: 470 })
    expect(chips[1].rect).toMatchObject({ left: 190, width: 110, top: 470 })
    // singleton 也在列(composer 是物理兜底包络),index 恒为 0。
    const composer = lastGeometry(posted).surfaces.filter((s: any) => s.name === 'composer')
    expect(composer).toHaveLength(1)
    expect(composer[0].index).toBe(0)
  })

  it('离场 = 从 surfaces 里缺席;singleton 在 anchors 里仍是 null', async () => {
    const composer = installComposerAnchor()
    const chip = installAnchor('status.chip', { top: 470, left: 100, right: 180, bottom: 494, width: 80, height: 24 })
    const { posted } = await mountReady()
    expect(lastGeometry(posted).surfaces.some((s: any) => s.name === 'status.chip')).toBe(true)

    chip.remove()
    composer.remove()
    window.dispatchEvent(new Event('resize'))
    await flushPromises()

    const geometry = lastGeometry(posted)
    // 数组天然表达进出场:不在列 = 不在场,没有 null 占位。
    expect(geometry.surfaces.some((s: any) => s.name === 'status.chip')).toBe(false)
    expect(geometry.surfaces.some((s: any) => s.name === 'composer')).toBe(false)
    // v1 的 map 语义一字不改:singleton 离场仍是显式 null。
    expect(geometry.anchors).toHaveProperty('composer')
    expect(geometry.anchors.composer).toBeNull()
  })

  it('singleton 取第一个**在场的**(分屏时非活动那份矩形为零,不能报成离场)', async () => {
    // 先挂一份关着的(v-show 关掉 = 零尺寸),再挂活着的那份。
    installAnchor('composer', { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 })
    installComposerAnchor()
    const { posted } = await mountReady()
    expect(lastGeometry(posted).composerRect).toMatchObject({ top: 500, width: 600 })
    expect(lastGeometry(posted).surfaces.filter((s: any) => s.name === 'composer')).toHaveLength(1)
  })

  it('零尺寸的地标(:empty / v-show 自隐)不算在场', async () => {
    installComposerAnchor()
    installAnchor('status.chip', { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 })
    const { posted } = await mountReady()
    expect(lastGeometry(posted).surfaces.some((s: any) => s.name === 'status.chip')).toBe(false)
  })

  it('per-item 地标不进 anchors map(map 只承载 singleton)', async () => {
    installComposerAnchor()
    installAnchor('composer.input', { top: 520, left: 100, right: 700, bottom: 560, width: 600, height: 40 })
    installAnchor('composer.block', { top: 440, left: 100, right: 700, bottom: 464, width: 600, height: 24 })
    const { posted } = await mountReady()

    const geometry = lastGeometry(posted)
    expect(Object.keys(geometry.anchors).sort()).toEqual(['composer', 'composer.input'])
    expect(geometry.surfaces.some((s: any) => s.name === 'composer.block')).toBe(true)
  })

  it('v1 字段照发:composerRect 与 anchors.composer 是同一块矩形', async () => {
    installComposerAnchor()
    const { posted } = await mountReady()
    const geometry = lastGeometry(posted)
    expect(geometry.composerRect).toMatchObject({ top: 500, left: 100, width: 600, height: 60 })
    expect(geometry.composerRect).toEqual(geometry.anchors.composer)
    expect(geometry.viewport).toEqual({ width: window.innerWidth, height: window.innerHeight })
  })
})

describe('氛围层:观察集合泛化(RO 重对准 + MO 进出场)', () => {
  class FakeResizeObserver {
    static instances: FakeResizeObserver[] = []
    observed: Element[] = []
    unobserved: Element[] = []
    constructor(public cb: () => void) { FakeResizeObserver.instances.push(this) }
    observe(el: Element): void { this.observed.push(el) }
    unobserve(el: Element): void { this.unobserved.push(el) }
    disconnect(): void {}
  }

  beforeEach(() => {
    FakeResizeObserver.instances = []
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  })

  it('观察集合随进出场重对准(新元素 observe、离场元素 unobserve)', async () => {
    const composer = installComposerAnchor()
    const chip = installAnchor('status.chip', { top: 470, left: 100, right: 180, bottom: 494, width: 80, height: 24 })
    await mountReady()

    const ro = FakeResizeObserver.instances[0]
    expect(ro.observed).toContain(document.documentElement)
    expect(ro.observed).toContain(composer)
    expect(ro.observed).toContain(chip)

    chip.remove()
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(ro.unobserved).toContain(chip)

    const nextChip = installAnchor('status.chip', { top: 470, left: 190, right: 300, bottom: 494, width: 110, height: 24 })
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(ro.observed).toContain(nextChip)
    // 没变过的那个不重复 observe(diff 是集合差,不是每轮全量重挂)。
    expect(ro.observed.filter(el => el === composer)).toHaveLength(1)
  })

  it('MutationObserver:地标进场(chip 出现在输入区里)触发重测', async () => {
    const composer = installComposerAnchor()
    const { posted } = await mountReady()
    const before = geometries(posted).length

    // 不发 resize —— 只靠 childList 侦测(chip 是被插进来的,不是变尺寸)。
    installAnchor('status.chip', { top: 470, left: 100, right: 180, bottom: 494, width: 80, height: 24 }, composer)
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 0))

    const after = geometries(posted)
    expect(after.length).toBeGreaterThan(before)
    expect(after[after.length - 1].surfaces.some((s: any) => s.name === 'status.chip')).toBe(true)
  })

  it('没有宿主容器时不抛(退化为只靠 resize / RO)', async () => {
    const { posted } = await mountReady()
    expect(lastGeometry(posted).surfaces).toEqual([])
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(geometries(posted).length).toBeGreaterThan(1)
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
