/**
 * 插件系统的两张**策略表**(R7)。
 *
 * 一张管"运行期失败该罚多重",一张管"注册表被拆掉时正在用它的东西怎么办"。
 * 它们放在一起,是因为它们犯的是同一种错:**判据一旦撒在各个上报点上,就必然
 * 漂移**。这条战役里同一个病已经出现过四次(熔断计数按插件还是按 scope、
 * transient 的两类、终止事件名单、白名单的补集写法),每一次的修法都是同一句话:
 * 把判据收进一张表,并让"漏登记"在编译期或测试里变红。
 *
 * 所以两张表都用 `Record<联合, 规则>`:往联合里加一个成员而不给规则,typecheck
 * 当场失败;而"有没有漏掉一种真实存在的 scope"由测试用真实字符串反查。
 */

// ── 表一:失败严重度 ────────────────────────────

/**
 * 罚则。
 *
 * - `disable-plugin`:整体禁用。用于**每轮都跑**的东西 —— 它坏了会拖垮全应用,
 *   禁用是较小的伤害。
 * - `degrade-surface`:只标记出问题的那一个界面不可用,插件的工具/命令/提示词/
 *   定时任务照常。用于**用户主动触发**的东西。
 */
export type PluginFailureRemedy = 'disable-plugin' | 'degrade-surface'

export interface PluginSeverityRule {
  threshold: number
  remedy: PluginFailureRemedy
  /** 写给人看的一句话:为什么是这个罚则。 */
  rationale: string
}

/**
 * scope 家族 —— 每一个都必须在下面的表里有条目。
 *
 * 加一个家族而忘了加规则 = typecheck 失败(Record 少键)。
 */
export const PLUGIN_SCOPE_FAMILIES = [
  'prompt-context',
  'lifecycle-hook',
  'event-handler',
  'event-emit',
  'ui-request',
  'plugin-request',
  'storage',
  'settings-change',
  'conversation-control',
  'registration',
  'connector',
  'entry',
] as const

export type PluginScopeFamily = (typeof PLUGIN_SCOPE_FAMILIES)[number]

const DEFAULT_THRESHOLD = 3

export const PLUGIN_SEVERITY_TABLE: Record<PluginScopeFamily, PluginSeverityRule> = {
  // ── 每轮都跑的:坏了拖垮全应用,禁用是较小的伤害 ──
  'prompt-context': {
    threshold: DEFAULT_THRESHOLD,
    remedy: 'disable-plugin',
    rationale: '每次发消息都跑;坏了每一轮对话都受影响,而用户看不到任何错误态。',
  },
  'lifecycle-hook': {
    threshold: DEFAULT_THRESHOLD,
    remedy: 'disable-plugin',
    rationale: 'beforeContextCompact / afterAssistantResponse 每轮都跑,同上。',
  },
  'event-handler': {
    threshold: DEFAULT_THRESHOLD,
    remedy: 'disable-plugin',
    rationale: '事件订阅是高频后台路径,失败完全不可见 —— 熔断存在的原始理由。',
  },
  'event-emit': {
    threshold: DEFAULT_THRESHOLD,
    remedy: 'disable-plugin',
    rationale: '同上;而且发不出去的自定义事件会让别的插件静默失联。',
  },
  storage: {
    threshold: DEFAULT_THRESHOLD,
    remedy: 'disable-plugin',
    rationale: '写不进盘的插件继续跑只会积累更多不一致;停下来比带病运行安全。',
  },
  'settings-change': {
    threshold: DEFAULT_THRESHOLD,
    remedy: 'disable-plugin',
    rationale: '配置推送失败意味着插件在用一份过期配置工作,而没人会发现。',
  },
  'conversation-control': {
    threshold: DEFAULT_THRESHOLD,
    remedy: 'disable-plugin',
    rationale: 'steer / followUp 直接改对话走向,失败是后台的,用户只会觉得"它没反应"。',
  },
  registration: {
    threshold: 1,
    remedy: 'disable-plugin',
    rationale: '注册期违规(未声明的面板 id、抢占保留命名空间)是**代码错误**,'
      + '不是运行期抖动,重试没有意义 —— 阈值 1,第一次就算数。',
  },
  entry: {
    threshold: 1,
    remedy: 'disable-plugin',
    rationale: '入口都没跑起来,后面注册的一切都无从谈起;继续重试只会一遍遍'
      + '重放同一个加载错误。',
  },

  // ── 用户主动触发的:失败当场可见,不该连坐 ──
  'ui-request': {
    threshold: DEFAULT_THRESHOLD,
    remedy: 'degrade-surface',
    rationale: '面板动作是用户刚点下、当场看到错误态与重试按钮的 —— "运行期失败'
      + '不可见"这个前提不成立。面板只在打开时跑,失败自限于一个界面,'
      + '不该连坐掉插件的工具/命令/提示词/定时任务。',
  },
  'plugin-request': {
    threshold: DEFAULT_THRESHOLD,
    remedy: 'degrade-surface',
    rationale: '插件自有请求同样是用户触发形态(UI 发起、当场看到结果),'
      + '与面板同族。',
  },
  connector: {
    threshold: DEFAULT_THRESHOLD,
    remedy: 'degrade-surface',
    rationale: 'IM 连接器坏掉只影响那条渠道;桌面端的会话与工具照常可用,'
      + '整体禁用会把一个渠道故障放大成插件故障。',
  },
}

/**
 * scope 字符串 → 家族。
 *
 * 顺序重要:`request:panel:*` 必须排在 `request:*` 前面,否则面板请求会被归进
 * 普通请求家族。返回 null 表示"这个 scope 不在任何家族里" —— 那是登记漏了,
 * 由测试用真实字符串反查兜住。
 */
export function classifyPluginScope(scope: string): PluginScopeFamily | null {
  if (!scope) return null
  if (scope.startsWith('request:panel:')) return 'ui-request'
  if (scope.startsWith('request:')) return 'plugin-request'
  if (scope.startsWith('promptContext')) return 'prompt-context'
  if (scope.startsWith('beforeContextCompact') || scope.startsWith('afterAssistantResponse')) return 'lifecycle-hook'
  if (scope.startsWith('events.emit')) return 'event-emit'
  if (scope.startsWith('event:')) return 'event-handler'
  if (scope.startsWith('storage')) return 'storage'
  if (scope.startsWith('settings:')) return 'settings-change'
  if (scope === 'steer' || scope === 'followUp') return 'conversation-control'
  if (scope.startsWith('register')) return 'registration'
  if (scope.startsWith('connector')) return 'connector'
  if (scope === 'entry' || scope === 'install') return 'entry'
  return null
}

export interface ResolvedPluginSeverity extends PluginSeverityRule {
  family: PluginScopeFamily | null
  /**
   * 降级时要标记哪一个界面。
   *
   * 对面板是 `panel:<panelId>`,对普通请求是 `request:<action>` —— 用户能据此
   * 认出"是这一处坏了",而不是"这个插件坏了"。
   */
  surface?: string
}

/** 未登记的 scope 一律按最保守处理(整体禁用)—— 与 R0–R6 的既有行为一致。 */
const UNCLASSIFIED_RULE: PluginSeverityRule = {
  threshold: DEFAULT_THRESHOLD,
  remedy: 'disable-plugin',
  rationale: '未登记的 scope:按既有行为整体禁用。登记漏了由测试反查兜住。',
}

export function resolvePluginScopeSeverity(scope: string): ResolvedPluginSeverity {
  const family = classifyPluginScope(scope)
  const rule = family ? PLUGIN_SEVERITY_TABLE[family] : UNCLASSIFIED_RULE
  if (rule.remedy !== 'degrade-surface') return { family, ...rule }
  return { family, ...rule, surface: describePluginSurface(scope) }
}

/** 从 scope 里截出"是哪一个界面坏了"。 */
export function describePluginSurface(scope: string): string {
  // request:panel:render:logs / request:panel:action:logs → panel:logs
  const panel = /^request:panel:(?:render|action):(.+)$/.exec(scope)
  if (panel) return `panel:${panel[1]}`
  if (scope.startsWith('request:')) return scope
  if (scope.startsWith('connector')) return scope
  return scope
}

// ── 表二:注册表的拆除语义 ──────────────────────

/**
 * 一个注册表被插件占用着、而插件被停用时,正在用它的东西怎么办。
 *
 * - `reject-disable`:拒绝停用。用于**停用即数据损坏**的注册表(有活跃依赖且
 *   没有安全的回退)。代价是用户会被一个插件卡住,所以要求非常高。
 * - `degrade-to-default`:优雅撤下,调用方回落宿主默认行为。
 * - `fail-open`:直接撤下,后续调用报错由调用方自理。用于调用方本来就必须处理
 *   "不存在"的注册表。
 */
export type PluginRegistryTeardown = 'reject-disable' | 'degrade-to-default' | 'fail-open'

export interface PluginRegistryPolicy {
  teardown: PluginRegistryTeardown
  /** 停用时**正在用它的东西**会经历什么 —— 每个注册表开放时必须回答。 */
  inFlight: string
  /** 只在跑插件的宿主生效造成的行为分叉(§6 方案 A)。 */
  hostDivergence: string
}

/**
 * 已经对插件开放的注册表。
 *
 * **纪律:一次只开一个。** 原方案就定下这条,R7 继续守 —— 每开一个都要先回答
 * "停用时正在用它的东西怎么办",而那个答案只有在真正接线时才知道靠不靠谱。
 */
export const PLUGIN_OPEN_REGISTRIES = ['im-connector'] as const

export type PluginOpenRegistry = (typeof PLUGIN_OPEN_REGISTRIES)[number]

export const PLUGIN_REGISTRY_POLICY: Record<PluginOpenRegistry, PluginRegistryPolicy> = {
  'im-connector': {
    teardown: 'degrade-to-default',
    inFlight: '停用时退订函数被调用,连接器从注册表摘除;此后 sendIMReply 对该 '
      + 'connector id 抛一个说得清的错误,而不是静默丢消息。已有会话不受影响 —— '
      + '它们的历史与状态都在会话存储里,与连接器无关。',
    hostDivergence: '仅桌面宿主执行插件(§6 方案 A):server 端镜像里插件注册的连接器'
      + '不存在,经该渠道的回复会落到"未注册"错误。',
  },
}

/**
 * **明确不开**的注册表与理由。
 *
 * 写进代码而不只是文档:下一个人想开哪一个,第一站会撞见这里的理由,
 * 而不是从零重新论证一遍。
 */
export const PLUGIN_DEFERRED_REGISTRIES: Record<string, string> = {
  'ai-provider': '会话正在用一个 provider 时把它抽走,语义最复杂(在飞请求、'
    + '历史重建、模型能力协商都要有答案)。等到有真实需求再设计,不为对称性而开。',
  'variable-provider': 'VariableRegistry 至今没有 unregister —— 要先补上退订面。'
    + '(原方案建议拿它当第一个试点,恰好选反了:它是五个里唯一拆不掉的。)',
  'permission-capability': 'registerCapability 形状上可开,但它直接扩张安全面,'
    + '与 H 线的硬隔离一起设计才说得清 —— 在插件还与宿主同进程时开放它,'
    + '等于让插件自己定义自己的权限边界。',
  'post-trigger': '触发器每轮都跑,属于 disable-plugin 那一族;开放前要先有'
    + '"一个坏触发器不拖垮整条回合"的证据。',
  'background-job': '与调度器职责重叠(api.scheduler 已经能表达绝大多数需求),'
    + '先看有没有 scheduler 表达不了的真实用例。',
}
