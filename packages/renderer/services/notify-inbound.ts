/**
 * 「这条消息该不该弹系统通知」的纯规则(docs/design/agent-dm-user.md §4.3)。
 *
 * 决策留在 renderer 是结构决定:窗口焦点、会话可见性、未读水位全在这边的 store
 * 里,主进程对"用户是否正看着这间房"一无所知。而**规则本身**从 ipc-hub 抽出来
 * 放这儿,只是因为它值得被单测钉住 —— 判错一次的代价是骚扰,而骚扰一次就再也
 * 没人信这个通知了。
 *
 * ipc-hub 负责把状态喂进来(它握有 store),这里一个 store 都不认识。
 */

/** 同一间房两条通知之间的静默期。 */
export const NOTIFY_COOLDOWN_MS = 60_000
/** 通知正文的字数上限。系统通知本来就只显示两三行。 */
export const NOTIFY_BODY_MAX_CHARS = 80

export interface NotifyInboundInput {
  /** 落库消息的 role。 */
  role?: string
  /** 这是协调器的驱动行 / 思考记录 / pass 吗 —— 三者都不是"有人跟你说话"。 */
  structural: boolean
  /** 会话此刻正被人看着(当前页签 + 窗口在前台)。 */
  onScreen: boolean
  /** 会话是用户 ↔ agent 的托管私聊房。P2 的通知范围只有这一种。 */
  userDmRoom: boolean
  /** 设置里的「私聊消息系统通知」开关。 */
  enabled: boolean
  /** 上一条通知的时间戳(同一会话),没弹过传 undefined。 */
  lastNotifiedAt?: number
  now: number
}

/**
 * 五道门,顺序无所谓(全是与),但每一道都对应一种真实的误报:
 *
 *  - `role !== 'user'`:自己说的话不该通知自己(网关那头的自己也算);
 *  - 非结构行:驱动/思考/pass 不是发言,`system` 台账更不是;
 *  - 不在屏上:覆盖"窗口失焦"与"开着别的房"两种不在场;
 *  - 只在用户私聊房:群聊被 @ 留 P3(先把最该响的那一路做对);
 *  - 冷却窗:agent 常把一段话拆成几条 say,逐条弹是骚扰。首条即发,窗内静默 ——
 *    首条已经足够把人叫回来,回来后看到的是全部。
 */
export function shouldNotifyInbound(input: NotifyInboundInput): boolean {
  if (!input.enabled) return false
  if (input.role === 'user' || input.role !== 'assistant') return false
  if (input.structural) return false
  if (input.onScreen) return false
  if (!input.userDmRoom) return false
  if (
    typeof input.lastNotifiedAt === 'number'
    && input.now - input.lastNotifiedAt < NOTIFY_COOLDOWN_MS
  ) {
    return false
  }
  return true
}

/**
 * 正文摘要:剥 mention 句柄与 markdown 标记,压成一行,截到 80 字。
 *
 * 系统通知是纯文本,`**粗体**` 和 ``` 围栏在那里只是噪音;`@小李#3f9c1e2a`
 * 更是——句柄是给模型认人用的,人眼看到的应该是 `@小李`。
 */
export function summarizeNotificationBody(
  content: string | undefined | null,
  maxChars: number = NOTIFY_BODY_MAX_CHARS,
): string {
  const flat = (content ?? '')
    // 行内标签(<card/> / <file/>)与任何残留尖括号标记
    .replace(/<[^>]*>/g, ' ')
    // 围栏与行内代码的反引号:内容留着,记号去掉
    .replace(/```[^\n`]*/g, ' ')
    .replace(/`/g, '')
    // 图片先于链接:`![alt](src)` 里的 alt 不是正文
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // `@名字#3f9c1e2a` → `@名字`(句柄是模型面的东西)
    .replace(/(@[^\s#]*)#[0-9a-zA-Z-]{4,}/g, '$1')
    // 行首记号:标题、引用、列表
    .replace(/^\s{0,3}(#{1,6}\s+|>\s+|[-*+]\s+|\d+\.\s+)/gm, '')
    // 强调记号
    .replace(/[*_~]{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return flat.length > maxChars ? `${flat.slice(0, maxChars)}…` : flat
}
