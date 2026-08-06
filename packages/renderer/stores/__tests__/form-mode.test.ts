/**
 * 产品形态(docs/design/product-two-forms-chatgpt-shell.md D1/D6)。
 *
 * 钉四件事:
 *  1. 可选形态与 web 降级(没有 rooms 就只剩「对话」→ 调用方据此不画切换器);
 *  2. 老用户的搬迁 —— U3 之前没有形态,只有 rail 的四格,停在「会话」的人该落到
 *     对话形态;
 *  3. 跟随:点开一条房 → 协作,点开直聊 → 对话,拿不到 kind 就别动;
 *  4. 落点是 localStorage 的一个键,且与 rail 类别**不是同一个键**。
 */
import { describe, expect, it } from 'vitest'
import {
  SIDEBAR_FORM_MODES,
  SIDEBAR_FORM_MODE_STORAGE_KEY,
  formModeForSessionKind,
  resolveFormMode,
  resolveFormModes,
  type SidebarFormMode,
} from '../form-mode'
import { SIDEBAR_RAIL_STORAGE_KEY } from '@/components/sidebar/sidebar-sections'

const BOTH: readonly SidebarFormMode[] = ['chat', 'collab']
const CHAT_ONLY: readonly SidebarFormMode[] = ['chat']

describe('可选形态', () => {
  it('两种形态定序:对话在前,协作在后', () => {
    expect(SIDEBAR_FORM_MODES.map(mode => mode.id)).toEqual(['chat', 'collab'])
    expect(SIDEBAR_FORM_MODES.map(mode => mode.label)).toEqual(['对话', '协作'])
    // 每一项都得说得出自己是干什么的 —— 下拉里那行副文。
    expect(SIDEBAR_FORM_MODES.every(mode => mode.hint.length > 0)).toBe(true)
  })

  it('桌面端两种都在', () => {
    expect(resolveFormModes({ roomsEnabled: true })).toEqual(['chat', 'collab'])
  })

  /** web 端没有 rooms 协调器 —— 协作形态整个不存在,只剩一项(调用方据此不画切换器)。 */
  it('web 降级:只剩「对话」', () => {
    expect(resolveFormModes({ roomsEnabled: false })).toEqual(['chat'])
  })
})

describe('当前形态', () => {
  it('存过什么就是什么', () => {
    expect(resolveFormMode('chat', null, BOTH)).toBe('chat')
    expect(resolveFormMode('collab', null, BOTH)).toBe('collab')
  })

  /**
   * 老用户的搬迁:U3 之前只有 rail 的四格。停在「会话」看的就是直聊列表 →
   * 对话形态;停在其余三格看的是房 → 协作形态。
   */
  it('没有形态存档时按老的 rail 停靠位搬迁', () => {
    expect(resolveFormMode(null, 'sessions', BOTH)).toBe('chat')
    expect(resolveFormMode(null, 'recent', BOTH)).toBe('collab')
    expect(resolveFormMode(null, 'active', BOTH)).toBe('collab')
    expect(resolveFormMode(null, 'contacts', BOTH)).toBe('collab')
  })

  /**
   * 全新用户落协作 —— U3 之前 rail 的默认就是「消息」,换了形态的说法不该顺手
   * 换掉用户一进来看见的东西。
   */
  it('什么都没存过 → 桌面端落协作,web 端落对话', () => {
    expect(resolveFormMode(null, null, BOTH)).toBe('collab')
    expect(resolveFormMode(null, null, CHAT_ONLY)).toBe('chat')
  })

  it('存了读不懂的值 → 当作没存过', () => {
    expect(resolveFormMode('stage', 'sessions', BOTH)).toBe('chat')
    expect(resolveFormMode('Collab', null, BOTH)).toBe('collab')
  })

  /** web 端存档指着不存在的协作形态 —— 落回对话,不留一个点不出东西的左栏。 */
  it('存的形态已经不可选 → 退到可选的那个', () => {
    expect(resolveFormMode('collab', null, CHAT_ONLY)).toBe('chat')
  })

  it('落点是 localStorage 的一个键,且与 rail 类别不是同一个', () => {
    expect(SIDEBAR_FORM_MODE_STORAGE_KEY).toBe('onething:sidebar-form-mode')
    expect(SIDEBAR_FORM_MODE_STORAGE_KEY).not.toBe(SIDEBAR_RAIL_STORAGE_KEY)
  })
})

describe('跟随:左栏永远反映"你在哪儿"', () => {
  it('房(群聊 / 私聊)→ 协作', () => {
    expect(formModeForSessionKind('room', BOTH)).toBe('collab')
  })

  it('直聊与执行会话 → 对话', () => {
    expect(formModeForSessionKind('chat', BOTH)).toBe('chat')
    expect(formModeForSessionKind('work', BOTH)).toBe('chat')
    expect(formModeForSessionKind('agent', BOTH)).toBe('chat')
  })

  /** 一次读不到会话的抖动不该把左栏整棵换掉。 */
  it('拿不到 kind → null(别动)', () => {
    expect(formModeForSessionKind(null, BOTH)).toBe(null)
    expect(formModeForSessionKind(undefined, BOTH)).toBe(null)
    expect(formModeForSessionKind('', BOTH)).toBe(null)
  })

  /** web 端点开一条房(理论上到不了)也不该切到一个不存在的形态。 */
  it('目标形态不可选 → null(别动)', () => {
    expect(formModeForSessionKind('room', CHAT_ONLY)).toBe(null)
  })
})
