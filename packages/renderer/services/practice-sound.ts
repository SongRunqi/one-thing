/**
 * Practice phase cues, synthesized with WebAudio — no audio assets. Volumes
 * sit low on purpose: these are metronome taps for eyes-free kegel practice,
 * not notifications. See docs/design/practice-system.md §5.2.
 */
import type { PracticePhaseEdge } from '@/types'

let audioContext: AudioContext | null = null

function getContext(): AudioContext | null {
  try {
    if (!audioContext) audioContext = new AudioContext()
    if (audioContext.state === 'suspended') void audioContext.resume()
    return audioContext
  } catch {
    return null
  }
}

interface Tone {
  freq: number
  /** Optional glide target frequency. */
  freqTo?: number
  durationMs: number
  delayMs?: number
  gain?: number
}

function playTones(tones: Tone[]): void {
  const ctx = getContext()
  if (!ctx) return
  for (const tone of tones) {
    const start = ctx.currentTime + (tone.delayMs ?? 0) / 1000
    const end = start + tone.durationMs / 1000
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(tone.freq, start)
    if (tone.freqTo) osc.frequency.linearRampToValueAtTime(tone.freqTo, end)
    const peak = tone.gain ?? 0.1
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(peak, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0005, end)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(start)
    osc.stop(end + 0.02)
  }
}

export function playPracticeCue(edge: PracticePhaseEdge): void {
  switch (edge) {
    case 'hold-start':
      // Short bright tap: gather.
      playTones([{ freq: 880, durationMs: 90, gain: 0.12 }])
      return
    case 'relax-start':
      // Single soft low tone: release. Its low pitch and gentle fade read
      // clearly against the bright single hold tap, eyes-free, without a beep.
      playTones([{ freq: 392, durationMs: 260, gain: 0.12 }])
      return
    case 'set-rest-start':
      // Two falling tones: put it down for a minute.
      playTones([
        { freq: 660, durationMs: 120, gain: 0.09 },
        { freq: 440, durationMs: 160, delayMs: 140, gain: 0.09 },
      ])
      return
    case 'finished':
      // Two rising tones: done.
      playTones([
        { freq: 523, durationMs: 110, gain: 0.1 },
        { freq: 784, durationMs: 180, delayMs: 130, gain: 0.1 },
      ])
      return
    case 'focus-start':
      // Pomodoro start stays silent by design — focus needs no fanfare.
      return
  }
}
