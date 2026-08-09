<template>
  <!-- 全窗氛围层(G2)。position:fixed + inset:0 + pointer-events:none —— 纯视觉,
       点击**穿透**到真 UI(这是对"画假 UI 诱导点击"的结构性封堵)。z 位插在
       内容层与浮层之间(--z-ambient = 50):雪飘在消息/输入框上方,但在下拉/
       菜单/对话框/权限账页/tooltip 之下。 -->
  <div class="plugin-ambient-layer">
    <iframe
      ref="frameEl"
      class="plugin-ambient-frame"
      :src="src"
      title="Plugin ambient effects"
      sandbox="allow-scripts"
      referrerpolicy="no-referrer"
      aria-hidden="true"
      tabindex="-1"
      @load="onFrameLoad"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 氛围层容器(G2 —— 全窗动画覆盖)。
 *
 * webview 的**第三个住址**(面板 → 围栏 → 全窗覆盖)。它复用 C 期 webview
 * 面板那一整套安全面(独立 origin + CSP + postMessage + 一次性 token 握手 ——
 * 见 `PluginWebviewFrame.vue`),只有三处不同:
 *
 *  1. **挂载位置与 z 位**:全窗、`pointer-events:none`、`--z-ambient`(内容之上、
 *     每一层可交互浮层之下)。
 *  2. **消息集**:氛围层是纯视觉,没有 invoke/result(它永远不回调宿主),多了
 *     `geometry`(枚举地标矩形)与 `pause`/`resume`(窗口失焦/隐藏即停)。
 *  3. **失败静默**:氛围是装饰,握手不回来就当它没有 —— 不弹错误页(那是内容
 *     面板才需要的),只在控制台留一句。
 *
 * **性能红线(透明窗丢帧判例在案 —— project_transparent_window_jank)**:
 * 动画全在 iframe 自己的 rAF,宿主一帧都不掺和。宿主只做两件轻活:窗口失焦/隐藏
 * 时推 `pause`(让 iframe 停 rAF),以及在 resize/布局变化时**节流**推几何
 * (rAF 合并,不是每帧)。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { PLUGIN_AMBIENT_MESSAGE } from '@/workspace/plugin-panel-types'

const props = defineProps<{
  /** `onething-plugin://<id>/<entry>` —— 胜出氛围层的入口(裁决已在主进程做完)。 */
  entryUrl: string
}>()

/**
 * 宿主枚举的几何地标(append-only —— 将来可加 sidebar 边、消息列表区)。
 * v1 两个:`composer`(输入框外框,雪落地堆积/雪人贴角的锚)。viewport 单独走
 * 字段。地标靠 `data-ambient-anchor` 显式标注,**不暴露任意 DOM** —— 插件拿到的
 * 只有这几块矩形。
 */
const AMBIENT_ANCHORS = ['composer'] as const

/**
 * 握手预算。给得宽:iframe 要起 canvas、建粒子系统。超时不是"慢",是"这一页
 * 大概率没起来" —— 装饰层里这只意味着"这次没有氛围",静默即可。
 */
const HANDSHAKE_BUDGET_MS = 10_000

const frameEl = ref<HTMLIFrameElement | null>(null)
const reloadNonce = ref(0)

const src = computed(() => {
  const url = props.entryUrl
  return reloadNonce.value ? `${url}?r=${reloadNonce.value}` : url
})

/** 一次性 token —— 每一代 iframe 一个新的(换 entry / 重载都换)。 */
let token = ''
let handshakeTimer: ReturnType<typeof setTimeout> | undefined
let handshakeDone = false
/** 当前是否应当运行(窗口可见且聚焦)。失焦/隐藏 → false → 推 pause。 */
let running = true
let rafHandle = 0
let resizeObserver: ResizeObserver | null = null
let observedAnchor: Element | null = null

function newToken(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function post(message: Record<string, unknown>): void {
  // opaque origin 只能用 '*';身份靠 token,不靠 targetOrigin(与 webview 同规)。
  frameEl.value?.contentWindow?.postMessage({ ...message, token }, '*')
}

/** 读取一块地标的视口矩形。iframe 全窗定位,视口坐标即 canvas 坐标。 */
function readAnchorRect(name: string): Record<string, number> | null {
  const el = document.querySelector(`[data-ambient-anchor="${name}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  // 零尺寸(v-show 关掉时可能出现)= 不在场,当作没有。
  if (r.width <= 0 || r.height <= 0) return null
  return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
}

/** 立刻测量并推一次几何(枚举地标 + viewport)。 */
function measure(): void {
  if (!handshakeDone) return
  const anchors: Record<string, Record<string, number> | null> = {}
  for (const name of AMBIENT_ANCHORS) anchors[name] = readAnchorRect(name)
  post({
    type: PLUGIN_AMBIENT_MESSAGE.geometry,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    // v1 唯一地标提到顶层,方便插件直接读 composerRect;anchors 里也带一份,
    // 为将来加地标留位(append-only)。
    composerRect: anchors.composer,
    anchors,
  })
  syncAnchorObservation()
}

/** rAF 合并的节流测量 —— resize/布局变化时调它,不是每帧。 */
function scheduleMeasure(): void {
  if (rafHandle) return
  const raf = window.requestAnimationFrame ?? ((cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 16))
  rafHandle = raf(() => {
    rafHandle = 0
    measure()
  })
}

/** composer 锚点元素可能随会话切换换一个 —— 每次测量后把观察对象对准当前那个。 */
function syncAnchorObservation(): void {
  if (!resizeObserver) return
  const anchor = document.querySelector('[data-ambient-anchor="composer"]')
  if (anchor === observedAnchor) return
  if (observedAnchor) resizeObserver.unobserve(observedAnchor)
  observedAnchor = anchor
  if (anchor) resizeObserver.observe(anchor)
}

function armHandshake(): void {
  clearTimeout(handshakeTimer)
  handshakeDone = false
  handshakeTimer = setTimeout(() => {
    if (handshakeDone) return
    // 装饰层:握手没回来就当它没有,不打扰用户。
    console.warn('[PluginAmbient] ambient page did not acknowledge the handshake; no effects shown')
  }, HANDSHAKE_BUDGET_MS)
}

function onFrameLoad(): void {
  post({ type: PLUGIN_AMBIENT_MESSAGE.init })
}

function setRunning(next: boolean): void {
  if (running === next) return
  running = next
  if (!handshakeDone) return
  post({ type: next ? PLUGIN_AMBIENT_MESSAGE.resume : PLUGIN_AMBIENT_MESSAGE.pause })
}

/** 窗口是否此刻该跑动画:可见即可(聚焦与否不影响可见性下的观感)。 */
function computeRunning(): boolean {
  return document.visibilityState !== 'hidden'
}

function onVisibility(): void {
  setRunning(computeRunning())
}
function onWindowBlur(): void {
  // 失焦(切到别的 app / 别的窗口)即停 —— 背景里飘雪白烧 CPU。
  setRunning(false)
}
function onWindowFocus(): void {
  setRunning(computeRunning())
}
function onResize(): void {
  scheduleMeasure()
}

function onMessage(event: MessageEvent): void {
  const frame = frameEl.value
  // 两道闸:source 挡别的 frame 冒充,token 挡同一 frame 的旧世代。
  if (!frame || event.source !== frame.contentWindow) return
  const data = event.data as { token?: unknown; type?: unknown } | null
  if (!data || typeof data !== 'object') return
  if (!token || data.token !== token) return

  if (data.type === PLUGIN_AMBIENT_MESSAGE.ready) {
    handshakeDone = true
    clearTimeout(handshakeTimer)
    // 首帧几何 + 当前运行态一起过去,iframe 不必再往返一次要。
    measure()
    if (!running) post({ type: PLUGIN_AMBIENT_MESSAGE.pause })
  }
}

/** 换了一层氛围(赢家变了)= 换一代 iframe:新 token、重取一次。 */
function reset(): void {
  token = newToken()
  handshakeDone = false
  running = computeRunning()
  reloadNonce.value += 1
  armHandshake()
}

onMounted(() => {
  token = newToken()
  running = computeRunning()
  window.addEventListener('message', onMessage)
  window.addEventListener('resize', onResize)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('focus', onWindowFocus)
  document.addEventListener('visibilitychange', onVisibility)
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => scheduleMeasure())
    // document 根:窗口/侧栏一类的布局变化(composer 列尺寸随之改)在这里兜底。
    resizeObserver.observe(document.documentElement)
    syncAnchorObservation()
  }
  armHandshake()
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('focus', onWindowFocus)
  document.removeEventListener('visibilitychange', onVisibility)
  clearTimeout(handshakeTimer)
  if (rafHandle) {
    const cancel = window.cancelAnimationFrame ?? window.clearTimeout
    cancel(rafHandle)
    rafHandle = 0
  }
  resizeObserver?.disconnect()
  resizeObserver = null
  observedAnchor = null
})

// 赢家换人(entryUrl 变)→ 换一代 iframe。同一 URL 不重置(避免无谓重载)。
watch(() => props.entryUrl, () => reset())
</script>

<style scoped>
.plugin-ambient-layer {
  position: fixed;
  inset: 0;
  /* 纯视觉:点击穿透到真 UI。这一条是氛围层"永远收不到交互"的执行点。 */
  pointer-events: none;
  /* 内容之上、每一层可交互浮层之下(层级表见 docs/design/ui-system.md §3)。 */
  z-index: var(--z-ambient);
  overflow: hidden;
}

.plugin-ambient-frame {
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
  pointer-events: none;
}
</style>
