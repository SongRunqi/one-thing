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
import {
  COLLAB_REPLY_USER_LABEL,
  formatCollabCardShortId,
  matchCollabInlineTagAt,
  renderCollabMentionText,
} from '@onething/runtime/collab'
import type { CollabAgentLike, CollabMentionLike } from '@onething/runtime/collab'

/** 卡验真的结果:不存在返回 null,存在则带上看板上的现时标题。 */
export interface CollabTagCardResolution {
  id: string
  title?: string
  /** 泳道 —— chip 上那枚色点取它(设计稿 §C)。缺省画中性点。 */
  status?: string
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
/** 点击一枚升格过的 @提及 pill。App 层监听后打开那位同事的空间。 */
export const COLLAB_TAG_OPEN_AGENT_EVENT = 'onething:collab-open-agent'

const CARD_ATTR = 'data-collab-card-id'
const FILE_ATTR = 'data-collab-file-path'
const RESOLVED_ATTR = 'data-collab-resolved'
const STATE_ATTR = 'data-collab-verify'

const MENTION_AGENT_ATTR = 'data-mention-agent-id'
const MENTION_KIND_ATTR = 'data-mention-kind'
const MENTION_STATE_ATTR = 'data-mention-state'

/**
 * @提及 pill 的第一拍标记(im-message 设计稿 §A)。
 *
 * 正文在进 markdown-it 之前被改写:每一处**已经解析过身份**的 `@名字` 换成
 * `@␠kind|id|name␠`(␠ = 哨兵)。用 `@` 打头是刻意的 —— markdown-it 的 text 规则把 `@`
 * 当终止符,行内规则因此拿得到这个位置;换个普通字符会被 text 规则整段吞掉。
 *
 * 哨兵取**私用区 U+E000** 而不是 NUL:markdown-it 的 normalize 会先把 NUL
 * 换成 U+FFFD,标记还没进规则就被拆散了(实测)。私用区码位它一个字都不碰。
 *
 * 哨兵在改写前先从原文里清干净(见 renderCollabMentionMarkup),所以没有人
 * 能自己写出一枚标记来伪造 pill —— 谁被提及只由 message.mentions 说了算。
 */
const MENTION_SENTINEL = '\ue000'
const MENTION_SENTINEL_CODE = 0xe000
/**
 * \u6807\u8bb0\u4f53\u5185\u7684\u5b57\u6bb5\u5206\u9694\u7b26\u4e5f\u8d70\u79c1\u7528\u533a(U+E001),\u4e0d\u80fd\u7528 `|`:\u8868\u683c\u5207\u5217\u53d1\u751f\u5728**\u5757\u7ea7
 * \u89e3\u6790**,\u65e9\u4e8e\u4e00\u5207\u884c\u5185\u89c4\u5219 \u2014\u2014 \u8868\u683c\u5355\u5143\u683c\u91cc\u7684\u4e00\u679a\u63d0\u53ca\u82e5\u5e26\u88f8 `|`,\u4f1a\u5148\u88ab\u5f53\u6210
 * \u5217\u5206\u9694\u7ebf\u628a\u6574\u884c\u5207\u788e(\u5b9e\u6d4b:@\u5c0f\u674e \u5728\u8868\u683c\u91cc\u88c2\u6210\u4e24\u683c)\u3002
 */
const MENTION_FIELD_SEP = '\ue001'

/**
 * 用户本人的称呼。mentions[] 里只装 agent id,用户永远不可能出现在里面,所以
 * 「@我」是唯一一处按名字认的提及。
 *
 * 两个常量词是**兜底**,不是全集(agent-dm-user.md §2.4):配了资料之后
 * `@一天` / `@yitian` 同样该点亮,而那两个词是会变的,所以由调用点现传 ——
 * 这个模块不认识 Pinia,身份从哪来永远是它的调用者说了算(文件头纪律)。
 */
const MENTION_USER_LABELS = [COLLAB_REPLY_USER_LABEL, '我'] as const
/** pill 上写给用户看的第一人称。UI 别处(署名、头像)也一律叫「我」。 */
const MENTION_SELF_TEXT = '我'

/** 提及升格要问的东西:这位同事现在什么颜色?查无此人返回 null(不升格)。 */
export interface CollabMentionResolver {
  resolveAgent(agentId: string): { color?: string | null } | null
}

let verifier: CollabTagVerifier | null = null
let mentionResolver: CollabMentionResolver | null = null
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

interface MentionMeta {
  kind: 'agent' | 'user'
  agentId: string
  name: string
}

/**
 * 正文改写:把已解析身份的 `@名字` 换成第一拍标记。
 *
 * 身份从哪来是这条链的全部要害 —— 走的是 runtime 那一个
 * `renderCollabMentionText` walker,识别、改名重绘、重名歧义判定全在它手里。
 * 渲染层在这里**不做任何名字匹配**:老转录(没有 mentions 字段)拿不到任何
 * hit,于是原样落到普通文字上,一枚 pill 都不长。
 */
export function renderCollabMentionMarkup(
  text: string | undefined | null,
  mentions: readonly CollabMentionLike[] | undefined,
  agents: readonly CollabAgentLike[],
  /** 用户的全部写法(名字/句柄)。不传就只认两个常量词。 */
  userLabels?: readonly string[],
): string {
  // 先清哨兵与字段分隔符:标记只能由这里生成,谁都不能自己写一枚出来。
  const source = (text ?? '').split(MENTION_SENTINEL).join('').split(MENTION_FIELD_SEP).join('')
  return renderCollabMentionText(source, mentions, agents, {
    userLabels: userLabels?.length ? userLabels : MENTION_USER_LABELS,
    renderHit: hit => {
      const name = hit.kind === 'user' ? MENTION_SELF_TEXT : hit.name
      return `@${MENTION_SENTINEL}${hit.kind}${MENTION_FIELD_SEP}${encodeURIComponent(hit.agentId ?? '')}`
        + `${MENTION_FIELD_SEP}${encodeURIComponent(name)}${MENTION_SENTINEL}`
    },
  })
}

/** 标记体 → meta。形状不对就返回 null,那一段于是当普通文字渲染。 */
function parseMentionPayload(payload: string): MentionMeta | null {
  const parts = payload.split(MENTION_FIELD_SEP)
  if (parts.length !== 3) return null
  const [kind, rawId, rawName] = parts
  if (kind !== 'agent' && kind !== 'user') return null
  let agentId = ''
  let name = ''
  try {
    agentId = decodeURIComponent(rawId)
    name = decodeURIComponent(rawName)
  } catch {
    return null
  }
  if (!name) return null
  if (kind === 'agent' && !agentId) return null
  return { kind, agentId, name }
}

/**
 * 第一拍的中性 pill。
 *
 * agent 那一枚**不带任何颜色** —— 身份色是第二拍(挂载期)刷上去的,所以
 * 改名换色都不脏 markdownRenderCache。`@我` 那一枚是终局态:提示色写死在
 * CSS 里,它指的人不会改名也不会换色。
 */
function mentionSpanHtml(meta: MentionMeta): string {
  const text = escapeAttribute(`@${meta.name}`)
  if (meta.kind === 'user') {
    return `<span class="md-mention md-mention--me" ${MENTION_KIND_ATTR}="user">${text}</span>`
  }
  return `<span class="md-mention" ${MENTION_KIND_ATTR}="agent"`
    + ` ${MENTION_AGENT_ATTR}="${escapeAttribute(meta.agentId)}">${text}</span>`
}

/**
 * 非 markdown 面的同一枚 pill(用户自己发的消息走 `escapeHtml` 直出,不进
 * markdown-it)。标记里只有 `@`、哨兵和 percent-encoding,转义器一个字符都
 * 不碰它,所以这里在**转义之后**替换是安全的,并且与行内规则共用同一个
 * `mentionSpanHtml` —— 两个面上的 pill 不可能长得不一样。
 */
export function replaceCollabMentionMarkers(escapedHtml: string): string {
  if (!escapedHtml.includes(MENTION_SENTINEL)) return escapedHtml
  // 与 MENTION_SENTINEL 同一个字符;写成字面量是为了让形状一眼可读。
  return escapedHtml.replace(/@\ue000([^\ue000]*)\ue000/g, (_whole, payload: string) => {
    const meta = parseMentionPayload(payload)
    // 畸形标记(理论上生成不出来)退回哑文本,绝不把哨兵字符留在 DOM 里。
    return meta ? mentionSpanHtml(meta) : `@${escapeAttribute(payload)}`
  })
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

  /**
   * @提及 pill 的第一拍。规则挂在 `@` 上 —— markdown-it 的 text 规则把 `@`
   * 当终止符,所以行内规则在这个位置一定被叫到;标记体只有 percent-encoding
   * 和两枚哨兵,不可能与任何 markdown 语法撞车。
   */
  md.inline.ruler.before('autolink', 'collab_mention', (state: StateInline, silent: boolean) => {
    if (state.src.charCodeAt(state.pos) !== 0x40 /* @ */) return false
    if (state.src.charCodeAt(state.pos + 1) !== MENTION_SENTINEL_CODE) return false
    const end = state.src.indexOf(MENTION_SENTINEL, state.pos + 2)
    if (end < 0) return false
    const meta = parseMentionPayload(state.src.slice(state.pos + 2, end))
    if (!meta) return false
    if (!silent) {
      const token = state.push('collab_mention', 'span', 0)
      token.meta = meta
    }
    state.pos = end + 1
    return true
  })

  md.renderer.rules.collab_mention = (tokens, idx) => mentionSpanHtml(tokens[idx].meta as MentionMeta)

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

/** 文件名拆成 主名 + 扩展名 —— chip 上扩展名淡一档(设计稿 §C)。 */
function splitFileName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return { base: name, ext: '' }
  return { base: name.slice(0, dot), ext: name.slice(dot) }
}

const FILE_CHIP_ICON = '<svg class="collab-tag-icon" viewBox="0 0 24 24" fill="none"'
  + ' stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"'
  + ' aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>'
  + '<path d="M14 2v6h6"/></svg>'

/**
 * 验真通过的 chip 内构(设计稿 §C)。
 *
 * 内构只在**升格时**才拼出来,和身份色一样活在 DOM 上、永不进缓存 —— 缓存里
 * 躺着的仍旧是那枚谁也点不动的中性 span。
 */
function promoteCardChip(element: HTMLElement, resolved: CollabTagCardResolution): void {
  promote(element, undefined, resolved.id)
  element.classList.add('collab-tag-chip')
  if (resolved.status) element.setAttribute('data-collab-status', resolved.status)
  const title = resolved.title ? `「${resolved.title}」` : ''
  element.innerHTML = '<span class="collab-tag-dot" aria-hidden="true"></span>'
    + `<span class="collab-tag-id">${escapeAttribute(formatCollabCardShortId(resolved.id))}</span>`
    + (title ? `<span class="collab-tag-name">${escapeAttribute(title)}</span>` : '')
}

function promoteFileChip(element: HTMLElement, resolved: CollabTagFileResolution): void {
  promote(element, undefined, resolved.absolutePath)
  element.classList.add('collab-tag-chip')
  // hover 出**绝对路径**:模型写的是相对路径,人要看的是它到底落在哪。
  element.setAttribute('title', resolved.absolutePath)
  const { base, ext } = splitFileName(fileLabel(resolved.absolutePath))
  element.innerHTML = FILE_CHIP_ICON
    + `<span class="collab-tag-name">${escapeAttribute(base)}`
    + (ext ? `<span class="collab-tag-ext">${escapeAttribute(ext)}</span>` : '')
    + '</span>'
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
        promoteCardChip(element, resolved)
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
        promoteFileChip(element, resolved)
      }))
      return
    }
    element.setAttribute(STATE_ATTR, 'plain')
  })
  promoteCollabMentionsIn(root)
  await Promise.all(pending)
}

/**
 * 提及 pill 的第二拍:按 roster 刷身份色、挂点击。
 *
 * 与标签验真同一副拍子,理由也同一条 —— **升格永不进缓存**。第一拍那枚
 * 中性 span 才是被 markdownRenderCache 记住的东西,身份色只活在 DOM 上,
 * 于是改色不必失效任何缓存。
 *
 * 没有 resolver、或者这位同事已经不在花名册上:停在中性态。降级的样子是
 * 「一个点不动的名字」,不是一枚点了没反应的假 pill。
 */
export function promoteCollabMentionsIn(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(`.md-mention[${MENTION_AGENT_ATTR}]`).forEach(element => {
    if (element.getAttribute(MENTION_STATE_ATTR)) return
    const agentId = element.getAttribute(MENTION_AGENT_ATTR) || ''
    const resolved = agentId && mentionResolver ? mentionResolver.resolveAgent(agentId) : null
    if (!resolved) {
      element.setAttribute(MENTION_STATE_ATTR, 'plain')
      return
    }
    element.setAttribute(MENTION_STATE_ATTR, 'live')
    element.classList.add('is-live')
    element.setAttribute('role', 'link')
    element.setAttribute('tabindex', '0')
    // 身份色走自定义属性,染字与染底(10%)在 CSS 里一处算出来。
    if (resolved.color) element.style.setProperty('--md-mention-color', resolved.color)
  })
}

/**
 * 注册提及升格器。传 null 注销(测试收尾用)。
 *
 * 与验真器同款:注册顺手重刷当前 DOM,因为花名册刚换过一批颜色/成员。
 */
export function registerCollabMentionResolver(next: CollabMentionResolver | null): void {
  mentionResolver = next
  if (typeof document === 'undefined') return
  document.querySelectorAll<HTMLElement>('.md-mention').forEach(element => {
    element.removeAttribute(MENTION_STATE_ATTR)
    element.classList.remove('is-live')
  })
  promoteCollabMentionsIn(document)
}

function openFromElement(element: HTMLElement): void {
  if (element.classList.contains('md-mention')) {
    const agentId = element.getAttribute(MENTION_AGENT_ATTR)
    if (!agentId) return
    window.dispatchEvent(new CustomEvent(COLLAB_TAG_OPEN_AGENT_EVENT, { detail: { agentId } }))
    return
  }
  const resolved = element.getAttribute(RESOLVED_ATTR)
  if (!resolved) return
  const detail = element.classList.contains('collab-tag--card')
    ? { type: COLLAB_TAG_OPEN_CARD_EVENT, payload: { taskId: resolved } }
    : { type: COLLAB_TAG_OPEN_FILE_EVENT, payload: { filePath: resolved } }
  window.dispatchEvent(new CustomEvent(detail.type, { detail: detail.payload }))
}

/** 委托选择器:验真通过的标签 + 升格过的提及 pill,同一套点击/回车语义。 */
const LIVE_TARGET_SELECTOR = '.collab-tag.is-live, .md-mention.is-live'

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
    const tag = target?.closest?.(LIVE_TARGET_SELECTOR) as HTMLElement | null
    if (!tag) return
    event.preventDefault()
    openFromElement(tag)
  })

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const target = event.target as Element | null
    const tag = target?.closest?.(LIVE_TARGET_SELECTOR) as HTMLElement | null
    if (!tag) return
    event.preventDefault()
    openFromElement(tag)
  })
}
