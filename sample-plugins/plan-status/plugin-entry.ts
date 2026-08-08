/**
 * Plan Status Plugin — R5.x 锚点块 demo。
 *
 * Install: ln -s $(pwd)/sample-plugins/plan-status ~/.onething/plugins/plan-status
 *
 * 它在输入框上方(composer.above 锚点)放一条执行状态块:
 *   - 空闲:badge "idle" + 短文案
 *   - 流式中:progress(indeterminate) + "执行中"
 *   - 有步骤:badge(步骤 n/m) + 当前 running 步骤标题
 *   - 完成:badge(success) + 用时;出错:badge(danger) + 错误 + "清除"按钮
 *
 * 这个 demo 同时是 R5.x 的活文档:
 *   1. 声明先于代码 —— manifest 的 contributes.uiSlots 声明 (anchor, id),
 *      entry 里的 registerUiSlot 只做匹配绑定,错位即 registration 熔断。
 *   2. UI 不执行插件代码 —— render 返回的是描述树(v2),不是 DOM。
 *   3. 窄腰 —— 状态感知走既有事件面(api.on),刷新走 ctx.refresh() 的通知轨,
 *      render/action 走统一请求通道,没有一条新协议。
 */

/**
 * @param api The injected plugin API — a user plugin's entire power surface.
 *   It is never imported: the host passes it in.
 */
export default function planStatusPlugin(api) {
  const GLOBAL = '__global__'
  /** 按会话的内存态。 */
  const sessions = new Map()
  /** 每个会话最近一次 render 的 ctx —— 事件来了拿它 refresh,地址不自己拼。 */
  const latestCtx = new Map()

  function stateOf(sessionId) {
    const key = sessionId || GLOBAL
    let state = sessions.get(key)
    if (!state) {
      state = { phase: 'idle', steps: new Map(), startedAt: 0, finishedMs: 0, error: '' }
      sessions.set(key, state)
    }
    return state
  }

  // 事件可能连打:同一会话 200ms 内最多刷一次(宿主侧还有一层 150ms 合流)。
  const pendingRefresh = new Set()
  function refresh(sessionId) {
    const key = sessionId || GLOBAL
    if (pendingRefresh.has(key)) return
    pendingRefresh.add(key)
    setTimeout(() => {
      pendingRefresh.delete(key)
      latestCtx.get(key)?.refresh()
    }, 200)
  }

  // ── 事件面(log-monitor 已实证的订阅面) ──────────────────────────

  api.on('stream:start', (env) => {
    const state = stateOf(env?.sessionId)
    state.phase = 'streaming'
    state.steps = new Map()
    state.startedAt = Date.now()
    state.finishedMs = 0
    state.error = ''
    refresh(env?.sessionId)
  })

  api.on('step:updated', (env) => {
    const step = env?.payload ?? env
    if (!step?.stepId) return
    const state = stateOf(env?.sessionId)
    const previous = state.steps.get(step.stepId) ?? {}
    state.steps.set(step.stepId, { ...previous, ...(step.updates ?? {}) })
    refresh(env?.sessionId)
  })

  for (const type of ['stream:complete', 'stream:aborted']) {
    api.on(type, (env) => {
      const state = stateOf(env?.sessionId)
      if (state.phase === 'streaming') {
        state.phase = 'done'
        state.finishedMs = state.startedAt ? Date.now() - state.startedAt : 0
      }
      refresh(env?.sessionId)
    })
  }

  api.on('stream:error', (env) => {
    const state = stateOf(env?.sessionId)
    state.phase = 'error'
    state.error = String(env?.payload?.data?.message ?? env?.payload?.message ?? 'stream error')
    refresh(env?.sessionId)
  })

  // ── 描述树(v2) ──────────────────────────────────────────────────

  function buildTree(sessionId) {
    const state = stateOf(sessionId)
    const children = []

    if (state.phase === 'streaming') {
      const total = state.steps.size
      const done = [...state.steps.values()].filter(step => step.status === 'completed').length
      const running = [...state.steps.values()].find(step => step.status === 'running')
      children.push({ type: 'progress', indeterminate: true, label: '执行中' })
      if (total > 0) {
        children.push({ type: 'badge', text: `步骤 ${done}/${total}`, tone: 'accent' })
      }
      if (running?.title) {
        children.push({ type: 'markdown', text: truncate(running.title, 28) })
      }
    } else if (state.phase === 'done') {
      children.push({ type: 'badge', text: '完成', tone: 'success' })
      if (state.finishedMs > 0) {
        children.push({ type: 'markdown', text: `用时 ${(state.finishedMs / 1000).toFixed(1)}s` })
      }
    } else if (state.phase === 'error') {
      children.push({ type: 'badge', text: '出错', tone: 'danger' })
      children.push({ type: 'markdown', text: truncate(state.error, 32) })
      children.push({ type: 'button', label: '清除', actionId: 'reset' })
    } else {
      children.push({ type: 'badge', text: 'idle' })
      children.push({ type: 'markdown', text: 'Plan 执行状态' })
    }

    return {
      version: 2,
      body: { type: 'row', children },
      // 流式中按 1Hz 自刷(步骤计数/用时);稳态不轮询,事件驱动 refresh。
      refreshIntervalMs: state.phase === 'streaming' ? 1000 : undefined,
    }
  }

  // ── 锚点块 ──────────────────────────────────────────────────────

  api.registerUiSlot({
    anchor: 'composer.above',
    id: 'plan-status',

    render(ctx) {
      // ctx 携带 anchor 与 sessionId(R5.x-a)。本 demo 是会话块:按
      // ctx.sessionId 取状态;"全局块"= 不读 sessionId 的树,写法上没有特例。
      latestCtx.set(ctx.sessionId || GLOBAL, ctx)
      return buildTree(ctx.sessionId)
    },

    onAction(input, ctx) {
      if (input.actionId !== 'reset') return undefined
      sessions.delete(ctx.sessionId || GLOBAL)
      // 直接给新树,省一次往返(协议支持的两种刷新之一)。
      return { tree: buildTree(ctx.sessionId) }
    },
  })
}

function truncate(text, max) {
  const value = String(text ?? '')
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
