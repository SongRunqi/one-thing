/**
 * 「场」的清单(docs/design/im-workbench-layout.md §3 W1 / W7)。
 *
 * 这里钉的是那条硬纪律:左栏各处的未读汇总与"在忙"计数吃的是**同一份清单、
 * 同一个判定**。所以测的是清单本身与那条 filter,而不是各个界面的渲染 ——
 * 界面各测一遍,恰恰是两份口径开始漂移的方式。
 *
 * (取件自 `design/im-stage-d` 的 useStageScenes.test.ts;C0 阶段还没有消费点,
 *  「两处共用同一 composable」的断言等 C1 左栏落地时补。)
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildScenes, filterScenes } from '../useSceneLedger'

function readRendererFile(relativePath: string) {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')
}

const identityOf = (agentId: string) => (agentId === 'fe'
  ? { name: '小李', avatar: '🔧' }
  : { name: '已注销' })

function scenes() {
  return buildScenes({
    dmRooms: [{ id: 'dm-fe', name: '[私聊] 老名字', room: { memberAgentIds: ['fe'] }, updatedAt: 5 }],
    groupRooms: [{ id: 'room-1', name: '发布组', updatedAt: 4 }],
    pairDmRooms: [{ id: 'pair-1', name: '小李 ⇄ 小王', updatedAt: 3 }],
    chats: [{ id: 'chat-1', name: '重构 IPC', updatedAt: 2 }, { id: 'chat-2', updatedAt: 1 }],
    identityOf,
  })
}

describe('buildScenes', () => {
  it('四路 selector 摆成一份扁平清单,顺序 = 私聊 → 群 → 私下 → 直聊', () => {
    expect(scenes().map(scene => scene.sessionId))
      .toEqual(['dm-fe', 'room-1', 'pair-1', 'chat-1', 'chat-2'])
  })

  /* 房名冻结在建房那一刻;改名必须跟着变,所以 dm 场用同事现名而不是房名。 */
  it('私聊场署同事现名与头像,并带上 agentId(点头像要用)', () => {
    const dm = scenes()[0]
    expect(dm).toMatchObject({ kind: 'dm', name: '小李', agentId: 'fe', avatar: '🔧' })
  })

  it('查无此人退到墓碑,绝不冒充 default;没名字的会话有兜底标题', () => {
    const built = buildScenes({
      dmRooms: [{ id: 'dm-x', room: { memberAgentIds: ['ghost'] } }],
      groupRooms: [],
      pairDmRooms: [],
      chats: [{ id: 'chat-2' }],
      identityOf,
    })
    expect(built[0].name).toBe('已注销')
    expect(built[1].name).toBe('未命名会话')
  })
})

describe('filterScenes', () => {
  it('数的是**场**,不是消息 —— 一个场有几条新话都只记一次', () => {
    const unread = new Set(['room-1', 'chat-1'])
    const picked = filterScenes(scenes(), id => unread.has(id))
    expect(picked.map(scene => scene.sessionId)).toEqual(['room-1', 'chat-1'])
    expect(picked.length).toBe(2)
  })

  it('清单外的会话(执行会话 / 工作台)进不了未读汇总', () => {
    const picked = filterScenes(scenes(), id => id === 'agent-exec-fe-room-1')
    expect(picked).toEqual([])
  })
})

describe('同一口径的接线', () => {
  it('未读判定只转发 store 的 isUnreadSession,composable 里没有第二份规则', () => {
    const source = readRendererFile('composables/useSceneLedger.ts')
    expect(source).toContain('sessionsStore.isUnreadSession(sessionId)')
    // 自己算未读 = 立刻有两份口径。任何 readMark / lastReadAt 的字眼都算越界。
    expect(source).not.toContain('readMark')
    expect(source).not.toContain('lastReadAt')
  })

  it('「在忙」是两个既有信号的并集,不新起第三本账', () => {
    const source = readRendererFile('composables/useSceneLedger.ts')
    expect(source).toContain('chatStore.isSessionGenerating?.(sessionId)')
    expect(source).toContain('collabBoardStore.isRoomTurnActive?.(sessionId)')
  })

  it('取件后不留舞台语汇的第二份实现', () => {
    expect(() => readRendererFile('composables/useStageScenes.ts')).toThrow()
  })
})
