/**
 * Render fallbacks for PracticeStrip before the real config arrives over IPC.
 * Mirrors ONETHING_PRACTICE_DEFAULT_CONFIG — no value import from
 * @onething/runtime/practice: that module pulls node:fs into the web bundle.
 */
import type { PracticeConfig } from '@/types'

export const ONETHING_PRACTICE_UI_DEFAULTS: PracticeConfig = {
  kegel: { holdSec: 10, relaxSec: 5, reps: 20, sets: 3, setRestSec: 60, sound: true },
  pomodoro: { minutes: 25, categories: ['学习', '看视频', '写作', '其他'] },
}
