/**
 * 行内标签的渲染侧 —— 防线二「渲染验真」(docs/design/collab-team-v2.md §6.1)。
 *
 * 落库那一头(`@onething/runtime/collab` 的 `sanitizeCollabInlineMarkup`)保证
 * 转录里只剩下形状合法的 `<card>` / `<file>`;这一头回答另一个问题:**它指的
 * 东西存在吗?**
 *
 * 渲染分两拍,顺序就是安全性本身:
 *
 *  1. **markdown-it 行内规则**(同步、可缓存)把标签渲染成一枚中性的
 *     `<span class="collab-tag">`——看起来就是一段普通文字,不可点、无链接色。
 *     这是"降级纯文本"的默认态,`allowHtml` 保持 false 一字未动。
 *  2. **挂载期验真**(异步、永不进缓存)问一遍注册进来的 verifier:卡在不在
 *     看板上、文件在不在磁盘上。只有得到肯定答复的那一枚才被升格成可点链接。
 *
 * 于是「模型可以指向真实存在的东西,但指不出不存在的」是结构性的:谎报的标签
 * 拿不到升格,它顶多在群里显示成一串没人能点的短 id。
 *
 * verifier 由 App 层注册(`registerCollabTagVerifier`),这个模块自己不认识
 * Pinia、不认识 platformApi —— 没人注册时全部标签停在纯文本态,这也正是
 * 单测和 web 端该有的样子。
 */
import type MarkdownIt from 'markdown-it'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'
import { formatCollabCardShortId, matchCollabInlineTagAt } from '@onething/runtime/collab'

/** 卡验真的结果:不存在返回 null,存在则带上看板上的现时标题。 */
export interface CollabTagCardResolution {
  id: string
  title?: string
}

/** 文件验真的结果:不存在返回 null,存在则带上可打开的绝对路径。 */
export interface CollabTagFileResolution {
  absolutePath: string
}

export interface CollabTagVerifier {
  verifyCard(id: string): CollabTagCardResolution | null | Promise<CollabTagCardResolution | null>
  verifyFile(path: string): CollabTagFileResolution | null | Promise<CollabTagFileResolution | null>
}

/** 点击一枚验真通过的卡标签。App 层监听后滚动看板并高亮。 */
export const COLLAB_TAG_OPEN_CARD_EVENT = 'onething:collab-open-card'
/** 点击一枚验真通过的文件标签。App 层监听后走既有 openFile 链路。 */
export const COLLAB_TAG_OPEN_FILE_EVENT = 'onething:collab-open-file'

const CARD_ATTR = 'data-collab-card-id'
const FILE_ATTR = 'data-collab-file-path'
const RESOLVED_ATTR = 'data-collab-resolved'
const STATE_ATTR = 'data-collab-verify'

let verifier: CollabTagVerifier | null = null
let handlerInstalled = false
let observer: MutationObserver | null = null

/**
 * 验真缓存。同一张卡、同一个文件在一屏消息里可能被提到十几次,一次一问会把
 * statPath 打成风暴。
 *
 * 缓存的是 **Promise 而不是结果**:一屏标签是在同一拍里同时开验的,谁都还没
 * 回来,存结果的缓存这时全部是 miss,去重等于没做。null 结果照样缓存 ——
 * "不存在"同样是答案。
 */
const cardCache = new Map<string, Promise<CollabTagCardResolution | null>>()
const fileCache = new Map<string, Promise<CollabTagFileResolution | null>>()

/**
 * 注册验真器。传 null 注销(测试收尾用)。
 *
 * 注册会顺手清空缓存并重验当前 DOM:房间切换、看板刷新之后,昨天"不存在"的
 * 卡今天可能存在了。
 */
export function registerCollabTagVerifier(next: CollabTagVerifier | null): void {
  verifier = next
  cardCache.clear()
  fileCache.clear()
  if (typeof document !== 'undefined') {
    document.querySelectorAll<HTMLElement>('.collab-tag').forEach(element => {
      element.removeAttribute(STATE_ATTR)
    })
    void verifyCollabTagsIn(document)
  }
}

/** 看板变了(新建/删除卡)之后丢掉卡的记忆,让下一次挂载重问。 */
export function invalidateCollabTagCards(): void {
  cardCache.clear()
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 卡标签的默认文案:短 id(+模型写的标题)。验真通过后会换成看板现时标题。 */
function cardLabel(id: string, title?: string): string {
  return title ? `${formatCollabCardShortId(id)}「${title}」` : formatCollabCardShortId(id)
}

/** 文件标签的默认文案:路径的最后一段,完整路径进 title 属性。 */
function fileLabel(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : path
}

/**
 * markdown-it 插件:把白名单标签变成 token。
 *
 * 匹配用的是与落库转义同一个 `matchCollabInlineTagAt`,所以"渲染认得的标签"
 * 与"落库被规范化的标签"永远是同一批 —— 两边各写一套形状规则是这类系统最
 * 常见的裂缝。
 */
export function collabInlineTagPlugin(md: MarkdownIt): void {
  md.inline.ruler.before('autolink', 'collab_inline_tag', (state: StateInline, silent: boolean) => {
    if (state.src.charCodeAt(state.pos) !== 0x3c /* < */) return false
    const match = matchCollabInlineTagAt(state.src, state.pos)
    if (!match) return false
    if (!silent) {
      const token = state.push('collab_inline_tag', 'span', 0)
      token.meta = match
    }
    state.pos += match.length
    return true
  })

  md.renderer.rules.collab_inline_tag = (tokens, idx) => {
    const meta = tokens[idx].meta as { name: 'card' | 'file'; id?: string; path?: string; title?: string }
    if (meta.name === 'card') {
      const id = meta.id ?? ''
      return `<span class="collab-tag collab-tag--card" ${CARD_ATTR}="${escapeAttribute(id)}">`
        + `${escapeAttribute(cardLabel(id, meta.title))}</span>`
    }
    const path = meta.path ?? ''
    return `<span class="collab-tag collab-tag--file" ${FILE_ATTR}="${escapeAttribute(path)}"`
      + ` title="${escapeAttribute(path)}">${escapeAttribute(meta.title || fileLabel(path))}</span>`
  }
}

function resolveCard(id: string): Promise<CollabTagCardResolution | null> {
  const inFlight = cardCache.get(id)
  if (inFlight) return inFlight
  const started = Promise.resolve(verifier?.verifyCard(id) ?? null)
    .then(resolved => resolved ?? null)
    // 验真器抛错不等于"不存在",但也没法当"存在" —— 按不存在处理并把这次
    // 结果扔掉,下一次挂载重问。
    .catch(() => { cardCache.delete(id); return null })
  cardCache.set(id, started)
  return started
}

function resolveFile(path: string): Promise<CollabTagFileResolution | null> {
  const inFlight = fileCache.get(path)
  if (inFlight) return inFlight
  const started = Promise.resolve(verifier?.verifyFile(path) ?? null)
    .then(resolved => resolved ?? null)
    .catch(() => { fileCache.delete(path); return null })
  fileCache.set(path, started)
  return started
}

function promote(element: HTMLElement, label: string | undefined, resolved: string): void {
  element.setAttribute(STATE_ATTR, 'live')
  element.setAttribute(RESOLVED_ATTR, resolved)
  element.classList.add('is-live')
  element.setAttribute('role', 'link')
  element.setAttribute('tabindex', '0')
  if (label) element.textContent = label
}

/**
 * 验真一棵 DOM 子树里的所有标签。
 *
 * 没有 verifier 就一枚都不升格 —— 默认态是纯文本,这是刻意的:验真链路挂了
 * 的后果应该是"点不动",不该是"点了跳到不存在的东西"。
 */
export async function verifyCollabTagsIn(root: ParentNode): Promise<void> {
  const pending: Promise<void>[] = []
  root.querySelectorAll<HTMLElement>('.collab-tag').forEach(element => {
    if (element.getAttribute(STATE_ATTR)) return
    element.setAttribute(STATE_ATTR, 'checking')
    if (!verifier) {
      element.setAttribute(STATE_ATTR, 'plain')
      return
    }
    const cardId = element.getAttribute(CARD_ATTR)
    if (cardId) {
      pending.push(resolveCard(cardId).then(resolved => {
        if (!resolved) {
          element.setAttribute(STATE_ATTR, 'plain')
          return
        }
        promote(element, cardLabel(resolved.id, resolved.title), resolved.id)
      }))
      return
    }
    const filePath = element.getAttribute(FILE_ATTR)
    if (filePath) {
      pending.push(resolveFile(filePath).then(resolved => {
        if (!resolved) {
          element.setAttribute(STATE_ATTR, 'plain')
          return
        }
        promote(element, undefined, resolved.absolutePath)
      }))
      return
    }
    element.setAttribute(STATE_ATTR, 'plain')
  })
  await Promise.all(pending)
}

function openFromElement(element: HTMLElement): void {
  const resolved = element.getAttribute(RESOLVED_ATTR)
  if (!resolved) return
  const detail = element.classList.contains('collab-tag--card')
    ? { type: COLLAB_TAG_OPEN_CARD_EVENT, payload: { taskId: resolved } }
    : { type: COLLAB_TAG_OPEN_FILE_EVENT, payload: { filePath: resolved } }
  window.dispatchEvent(new CustomEvent(detail.type, { detail: detail.payload }))
}

/**
 * 安装一次性的委托监听 —— 与代码块复制按钮同一套路子(observer 挂载 + document
 * 级点击委托),因为渲染出来的是裸 DOM,没有 Vue 事件上下文可用。
 */
export function ensureCollabTagHandler(): void {
  if (handlerInstalled || typeof document === 'undefined') return
  handlerInstalled = true
  void verifyCollabTagsIn(document)

  if (typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(records => {
      for (const record of records) {
        record.addedNodes.forEach(node => {
          if (node instanceof Element) void verifyCollabTagsIn(node)
        })
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  }

  document.addEventListener('click', event => {
    const target = event.target as Element | null
    const tag = target?.closest?.('.collab-tag.is-live') as HTMLElement | null
    if (!tag) return
    event.preventDefault()
    openFromElement(tag)
  })

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const target = event.target as Element | null
    const tag = target?.closest?.('.collab-tag.is-live') as HTMLElement | null
    if (!tag) return
    event.preventDefault()
    openFromElement(tag)
  })
}
