import { advanceStreamingReveal } from './streamingReveal'

export interface SmoothTextOptions {
  charsPerSecond?: number
  minCharsPerFrame?: number
  maxCharsPerFrame?: number
  maxNewlinesPerFrame?: number
  reducedMotion?: boolean
}

export function advanceSmoothStreamingText(
  current: string,
  target: string,
  elapsedMs: number,
  options: SmoothTextOptions = {},
): string {
  return advanceStreamingReveal(current, target, elapsedMs, {
    unitsPerSecond: options.charsPerSecond ? Math.max(1, Math.round(options.charsPerSecond / 42)) : undefined,
    minUnitsPerFrame: options.minCharsPerFrame ? Math.max(1, Math.round(options.minCharsPerFrame / 8)) : undefined,
    maxUnitsPerFrame: options.maxCharsPerFrame ? Math.max(1, Math.round(options.maxCharsPerFrame / 8)) : undefined,
    maxCharsPerFrame: options.maxCharsPerFrame,
    maxNewlinesPerFrame: options.maxNewlinesPerFrame,
    reducedMotion: options.reducedMotion,
  }).content
}
