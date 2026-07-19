export type OnethingPracticeKind = 'kegel' | 'pomodoro' | 'exercise'

/** Who wrote the entry: the rhythm timer, the strip's quick-log form, or the agent tool. */
export type OnethingPracticeSource = 'timer' | 'manual' | 'agent'

export interface OnethingPracticeKegelDetail {
  holdSec: number
  relaxSec: number
  /** Total reps completed across the whole session (all sets). */
  repsDone: number
  /** Reps per set. */
  repsTarget: number
  setsDone: number
  setsTarget: number
}

export interface OnethingPracticePomodoroDetail {
  minutes: number
  elapsedMin: number
  completed: boolean
  /** Optional free-form name given at start, on top of the category in `name`. */
  label?: string
}

export interface OnethingPracticeExerciseDetail {
  sets?: number
  repsPerSet?: number
  durationMin?: number
}

export interface OnethingPracticeLedgerRecord {
  id: string
  /** Epoch ms of when the entry was recorded (session end for timer entries). */
  ts: number
  kind: OnethingPracticeKind
  source: OnethingPracticeSource
  /** kegel: '凯格尔'; pomodoro: the category; exercise: the activity name (俯卧撑…). */
  name: string
  note?: string
  kegel?: OnethingPracticeKegelDetail
  pomodoro?: OnethingPracticePomodoroDetail
  exercise?: OnethingPracticeExerciseDetail
}

export interface OnethingPracticeRecordInput {
  ts?: number
  kind: OnethingPracticeKind
  source: OnethingPracticeSource
  name: string
  note?: string
  kegel?: OnethingPracticeKegelDetail
  pomodoro?: OnethingPracticePomodoroDetail
  exercise?: OnethingPracticeExerciseDetail
}

export interface OnethingPracticeKegelConfig {
  holdSec: number
  relaxSec: number
  /** Reps per set. */
  reps: number
  sets: number
  setRestSec: number
  sound: boolean
}

export interface OnethingPracticePomodoroConfig {
  minutes: number
  categories: string[]
  /** Category used by the menu's one-click start; set on every pomodoro start. */
  lastCategory?: string
}

export interface OnethingPracticeConfig {
  kegel: OnethingPracticeKegelConfig
  pomodoro: OnethingPracticePomodoroConfig
}

export const ONETHING_PRACTICE_DEFAULT_CONFIG: OnethingPracticeConfig = {
  kegel: { holdSec: 10, relaxSec: 5, reps: 20, sets: 3, setRestSec: 60, sound: true },
  pomodoro: { minutes: 25, categories: ['学习', '看视频', '写作', '其他'] },
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(max, Math.max(min, num))
}

/** Merges a possibly-partial/garbage persisted config onto defaults, clamping to sane ranges. */
export function normalizeOnethingPracticeConfig(raw: unknown): OnethingPracticeConfig {
  const source = (raw ?? {}) as { kegel?: Partial<OnethingPracticeKegelConfig>; pomodoro?: Partial<OnethingPracticePomodoroConfig> }
  const defaults = ONETHING_PRACTICE_DEFAULT_CONFIG
  const categories = Array.isArray(source.pomodoro?.categories)
    ? source.pomodoro.categories.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    : []
  return {
    kegel: {
      holdSec: clampInt(source.kegel?.holdSec, defaults.kegel.holdSec, 1, 600),
      relaxSec: clampInt(source.kegel?.relaxSec, defaults.kegel.relaxSec, 1, 600),
      reps: clampInt(source.kegel?.reps, defaults.kegel.reps, 1, 500),
      sets: clampInt(source.kegel?.sets, defaults.kegel.sets, 1, 20),
      setRestSec: clampInt(source.kegel?.setRestSec, defaults.kegel.setRestSec, 0, 3600),
      sound: typeof source.kegel?.sound === 'boolean' ? source.kegel.sound : defaults.kegel.sound,
    },
    pomodoro: normalizePomodoro(source.pomodoro, categories, defaults.pomodoro),
  }
}

function normalizePomodoro(
  source: Partial<OnethingPracticePomodoroConfig> | undefined,
  categories: string[],
  defaults: OnethingPracticePomodoroConfig,
): OnethingPracticePomodoroConfig {
  const finalCategories = categories.length > 0 ? categories : [...defaults.categories]
  const normalized: OnethingPracticePomodoroConfig = {
    minutes: clampInt(source?.minutes, defaults.minutes, 1, 240),
    categories: finalCategories,
  }
  if (typeof source?.lastCategory === 'string' && finalCategories.includes(source.lastCategory)) {
    normalized.lastCategory = source.lastCategory
  }
  return normalized
}
