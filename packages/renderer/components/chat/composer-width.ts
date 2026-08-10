/**
 * 输入区宽度档位 → 实际宽度(纯函数)。
 *
 * 为什么是一枚**纯函数**而不是 ChatPanel 里的一段 CSS:
 * 生产环境里 composer 是 teleport 出去的(ChatWindow 的 `.chat-footer`),
 * `.chat-panel` 上的那几枚变量根本够不着它 —— 输入区的宽度**只**来自
 * `measureContentColumn` 写下的内联变量。档位因此必须在测量里兑现,而测量
 * 需要真 DOM;把裁决单独摘出来,它就能被直接验(与 `useInspectorDefault`
 * 同规:开合初值是纯函数,挂载不是)。
 *
 * 四档(docs/design/plugin-ui 之外的产品设置,契约在 @shared/ipc/settings 的
 * `ComposerWidth`):
 *  - `narrow`   —— 34rem,再被实测内容列宽钳住(窄窗下不会反而变宽);
 *  - `standard` —— **实测内容列宽**。现状值不在这里再写一份数字,它就是测量
 *                  结果本身;于是缺省档与改造前逐字节等价;
 *  - `wide`     —— 56rem,与样式表的 `--content-measure-wide` 同数;
 *  - `full`     —— 撑满内容列:面板宽减两侧各 24px,与窄窗断点里内容列的
 *                  `calc(100% - 48px)` 同一个数(不另发明一个边距)。
 */
import type { ComposerWidth } from '@shared/ipc/settings'

/** narrow 档的量尺(rem)。比缺省的阅读列量尺(46rem)窄一档。 */
export const COMPOSER_WIDTH_NARROW_REM = 34
/** wide 档的量尺(rem)。镜像样式表的 `--content-measure-wide`。 */
export const COMPOSER_WIDTH_WIDE_REM = 56
/** full 档两侧留白之和(px)。与 768px 断点下内容列的 `calc(100% - 48px)` 同数。 */
export const COMPOSER_FULL_GUTTER_PX = 48

export interface ComposerWidthInput {
  /** 实测的内容列宽(px)—— 也就是 standard 档的答案。 */
  columnWidth: number
  /** 聊天面(或 footer 挂点)的可用宽度(px)。 */
  panelWidth: number
}

/**
 * 档位 → 输入区宽度(px)。
 *
 * 未知档位(旧配置、脏值)一律按 standard 处置:归一本该在 `@shared` 的
 * `normalizeComposerWidth` 就做完,这里的 `default` 分支是第二道兜底,
 * 不是第二份判据 —— 它不认识任何具体的坏值,只知道"不认识的都当缺省"。
 */
export function resolveComposerWidth(
  gear: ComposerWidth | string | null | undefined,
  { columnWidth, panelWidth }: ComposerWidthInput,
  remToPx: (rem: number) => number,
): number {
  const room = Math.max(0, panelWidth - COMPOSER_FULL_GUTTER_PX)
  switch (gear) {
    case 'narrow':
      return Math.min(columnWidth, remToPx(COMPOSER_WIDTH_NARROW_REM))
    case 'wide':
      return Math.min(room, remToPx(COMPOSER_WIDTH_WIDE_REM))
    case 'full':
      return room
    default:
      return columnWidth
  }
}
