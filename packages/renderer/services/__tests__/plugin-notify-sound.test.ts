// @vitest-environment happy-dom
/**
 * 提示音播放面的测试(M1)。
 *
 * 两件事:
 * 1. **配方表对枚举 exhaustive** —— 每个非 none 的枚举成员都真的发得出声音。
 * 2. **副窗不出声** —— 插件通知走 sendToAllWindows 广播,不设这道门开着设置窗
 *    时每条通知会响两声。
 *
 * "响不响"的裁决(静音 / 限频)不在这一层,那在主进程。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { PLUGIN_NOTIFY_SOUNDS } from '@onething/core/plugins/notify-sound'

// ── 最小 WebAudio 替身 ──────────────────────────

const started: Array<{ freq: number }> = []

class FakeParam {
  setValueAtTime = vi.fn()
  linearRampToValueAtTime = vi.fn()
  exponentialRampToValueAtTime = vi.fn()
}

class FakeOscillator {
  type = 'sine'
  frequency = new FakeParam()
  connect = vi.fn()
  stop = vi.fn()
  start = vi.fn(() => {
    started.push({ freq: this.frequency.setValueAtTime.mock.calls[0]?.[0] as number })
  })
}

class FakeAudioContext {
  state = 'running'
  currentTime = 0
  resume = vi.fn()
  destination = {}
  createOscillator = vi.fn(() => new FakeOscillator())
  createGain = vi.fn(() => ({ gain: new FakeParam(), connect: vi.fn() }))
}

function setHash(hash: string): void {
  window.location.hash = hash
}

let playPluginNotifySound: (sound: unknown) => void
let previewPluginNotifySound: (sound: never) => void

beforeEach(async () => {
  started.length = 0
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.resetModules()
  const mod = await import('../plugin-notify-sound')
  playPluginNotifySound = mod.playPluginNotifySound
  previewPluginNotifySound = mod.previewPluginNotifySound as never
  setHash('')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('playPluginNotifySound —— 配方表', () => {
  it('none 不发任何振荡器', () => {
    playPluginNotifySound('none')
    expect(started).toHaveLength(0)
  })

  it('每个非 none 的枚举成员都有真配方(exhaustive,没有哑档)', () => {
    for (const sound of PLUGIN_NOTIFY_SOUNDS) {
      if (sound === 'none') continue
      started.length = 0
      playPluginNotifySound(sound)
      expect(started.length, `${sound} 应当发出声音`).toBeGreaterThan(0)
      for (const tone of started) {
        // 人耳友好区间:既不是次声也不是刺耳的高频长鸣。
        expect(tone.freq).toBeGreaterThan(100)
        expect(tone.freq).toBeLessThan(4000)
      }
    }
  })

  it('枚举外的名字静默丢弃 —— 插件传不进自制配方', () => {
    playPluginNotifySound('airhorn')
    playPluginNotifySound(880)
    playPluginNotifySound({ freq: 3000, durationMs: 30000 })
    playPluginNotifySound(undefined)
    expect(started).toHaveLength(0)
  })
})

describe('副窗静音门', () => {
  it('主窗(hash 不是 #/ 路由)出声', () => {
    setHash('')
    playPluginNotifySound('chime')
    expect(started.length).toBeGreaterThan(0)
  })

  it('设置窗 / 搜索窗 / todo 窗都不出声 —— 广播下否则会响两次', () => {
    for (const hash of ['#/settings', '#/search', '#/todo-plan', '#/image-preview', '#/voice-runtime']) {
      started.length = 0
      setHash(hash)
      playPluginNotifySound('chime')
      expect(started, `${hash} 不应出声`).toHaveLength(0)
    }
  })

  it('试听绕过副窗门 —— 用户就在设置窗里按的那个按钮', () => {
    setHash('#/settings')
    previewPluginNotifySound('chime' as never)
    expect(started.length).toBeGreaterThan(0)
  })
})
