/**
 * 聊天面(say-only)的排版档(docs/design/im-workbench-layout.md §3 W2 / §5 C2′)。
 *
 * 数值取自方案 A 频道台样稿 `docs/design/im-redesign/a-channels.html`:
 * 30px 头像在左、署名行在上、正文 13px / 1.72。
 *
 * 为什么排版必须在 **JS** 里算,而不像其它视觉差异那样只写一条
 * `:root[data-shell-mode='workbench']` 的 CSS 门:
 *
 *  - `MessageList.vue` 的 `messageListStyles` 把 `--message-line-height-px`、
 *    `--content-spacing-px` 等一整排派生量**恒定以 inline style** 写到 DOM 上
 *    (它们由字号 × 行高算出来,没有 CSS 表达式可以替代)。inline 压过一切
 *    样式表规则,所以只在 CSS 里改字号会让「字号」与「派生出来的行高像素」
 *    对不上,排版节律直接错位。
 *  - 反过来,若把字号写成 `:root[data-shell-mode='workbench'] .message-list`
 *    的规则,它的特异性又会压过 `.message-list.density-compact` 这类用户档位类,
 *    把用户的密度选择废掉。
 *
 * 两个方向的坑指向同一个解法:**排版在 JS 里算,并且用户一旦有过显式排版选择就
 * 整档退让**——不做逐项混合(混合出来的既不是聊天面也不是用户要的那一档)。
 *
 * 这段「退让闸」是 C2 账页流唯一值得留下的逻辑,C2′ 把它整体搬到聊天面语汇下:
 * `ledger` → `say`,92px 署名列那套数值随 C2 一起作废。
 */

import { DEFAULT_CHAT_SETTINGS, DEFAULT_GENERAL_SETTINGS } from '@shared/defaults/settings'

/**
 * 聊天面的排版与栏位常量 —— **唯一真源**。
 *
 * CSS 侧只允许通过本组件树自己写出来的 inline 变量消费这些数,不许各自写死一份
 * (`__tests__/say-typography.test.ts` 用源文本比对钉住两边不漂移)。
 */
export const SAY_METRICS = {
  /** 正文 13px —— 方案 A `.a .msg p { font-size: 13px }` */
  fontSize: 13,
  /** 行高 1.72 —— 方案 A `.a .msg p { line-height: 1.72 }` */
  lineHeight: 1.72,
  /** 段落等内容间距系数(comfortable 是 0.75,聊天面略收) */
  contentSpacing: 0.55,
  /** 两条消息之间的回合间距。不能归零:hover 的操作行要画在这段留白里 */
  turnGapPx: 10,
  /** 左侧头像 —— 方案 A `.a .msg .gut { width: 30px }` */
  avatarSizePx: 30,
  /** 头像列与正文之间的沟 —— 方案 A `.a .msg { gap: 11px }` */
  gutterGapPx: 11,
  /** 一条消息上下的留白 —— 方案 A `.a .msg { padding: 5px 20px }` */
  rowPaddingBlockPx: 5,
  rowPaddingInlinePx: 20,
  /** 署名行的名字 —— 方案 A `.a .msg .sig b { font-size: 12.5px }` */
  signatureSizePx: 12.5,
} as const

export interface SayTypographyInput {
  /** 只有房/私聊走新聊天面;直聊(工程驾驶舱)永远不进这一档。 */
  isSaySurface: boolean
  /** `settings.general.messageListDensity` */
  messageListDensity?: string | null
  /** `settings.general.messageLineHeight` */
  messageLineHeight?: number | null
  /** `settings.chat.chatFontSize` */
  chatFontSize?: number | null
}

/**
 * 用户是否有过**显式**的排版选择。
 *
 * 陷阱:`messageListDensity`('comfortable')与 `chatFontSize`(15)在
 * `packages/shared/defaults/settings.ts` 里是**有默认值的**,生产里这两个字段
 * 几乎恒有值。所以「有值即退让」会让聊天面档永远不生效——判据必须是
 * **与默认值不同**。`messageLineHeight` 没有默认值,有值即显式。
 *
 * 代价说清楚:一个手动把密度点回 'comfortable'、字号点回 15 的用户,与从未
 * 动过的用户在这里不可区分,会拿到聊天面档。这是可接受的——那两个值正是聊天面
 * 要替换掉的默认档,而不是他坚持的另一种排版。
 */
export function hasExplicitTypographyChoice(
  input: Pick<SayTypographyInput, 'messageListDensity' | 'messageLineHeight' | 'chatFontSize'>,
): boolean {
  const { messageListDensity, messageLineHeight, chatFontSize } = input
  if (typeof messageLineHeight === 'number' && Number.isFinite(messageLineHeight) && messageLineHeight > 0) {
    return true
  }
  if (
    typeof chatFontSize === 'number'
    && Number.isFinite(chatFontSize)
    && chatFontSize > 0
    && chatFontSize !== DEFAULT_CHAT_SETTINGS.chatFontSize
  ) {
    return true
  }
  if (
    typeof messageListDensity === 'string'
    && messageListDensity.length > 0
    && messageListDensity !== DEFAULT_GENERAL_SETTINGS.messageListDensity
  ) {
    return true
  }
  return false
}

/** 聊天面排版档是否生效:房/私聊 **且** 用户没有过显式排版选择。 */
export function shouldUseSayTypography(input: SayTypographyInput): boolean {
  if (!input.isSaySurface) return false
  return !hasExplicitTypographyChoice(input)
}
