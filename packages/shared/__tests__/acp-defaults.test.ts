/**
 * 预置 ACP agent 的两条性质。
 *
 * 第二条才是容易错的那个:新增一个预置项要能**到达老用户**。这本设置是「默认打底,
 * 存下来的按 id 覆盖」——不是「存过就整份用存的」。写反了的话,新预置项只有全新安装
 * 看得见,而所有老用户永远等不到它,还查不出来(没人报错)。
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_ACP_SETTINGS, normalizeACPSettings } from '../defaults/settings.js'

describe('预置 ACP agent', () => {
  it('Kimi Code 走 `kimi acp` —— 登录归 CLI,我们不碰 Key', () => {
    const kimi = DEFAULT_ACP_SETTINGS.agents.find(agent => agent.id === 'kimi-code')
    expect(kimi).toBeDefined()
    // 订阅的 OAuth 只对官方客户端开放,所以这里必须是官方 CLI 本体 + 它的 ACP 子命令。
    expect(kimi?.command).toBe('kimi')
    expect(kimi?.args).toEqual(['acp'])
    expect(kimi?.enabled).toBe(true)
  })

  it('新预置项到得了老用户 —— 存下来的按 id 覆盖,不是整份替换', () => {
    // 一份「装 app 时还没有 kimi-code」的旧设置:只存了改过的那一个。
    const stored = normalizeACPSettings({
      enabled: true,
      agents: [
        { id: 'claude-code', name: 'Claude Code', enabled: true, command: 'my-claude-acp' },
      ],
    })

    const ids = stored.agents.map(agent => agent.id)
    expect(ids).toContain('kimi-code')
    // 用户改过的那一条仍然是用户的。
    expect(stored.agents.find(agent => agent.id === 'claude-code')?.command)
      .toBe('my-claude-acp')
  })

  it('用户把 kimi 换成自己的包装脚本时不会被默认值改回去', () => {
    const stored = normalizeACPSettings({
      enabled: true,
      agents: [
        { id: 'kimi-code', name: 'Kimi Code', enabled: true, command: '/opt/kimi/bin/kimi', args: ['acp', '--verbose'] },
      ],
    })
    const kimi = stored.agents.find(agent => agent.id === 'kimi-code')
    expect(kimi?.command).toBe('/opt/kimi/bin/kimi')
    expect(kimi?.args).toEqual(['acp', '--verbose'])
  })
})
