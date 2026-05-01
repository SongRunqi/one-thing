/**
 * Pixel pet palette — Endesga 32 精简版.
 *
 * Index 0 is null (transparent). Sprite data uses these indices to pick
 * a color; PixelSprite.vue paints each non-null cell to a canvas.
 *
 * Keep palette small (5–8 colors per pet) per the spec — discipline forces
 * a clean pixel-art look and prevents muddy gradients.
 */

export const PALETTE: ReadonlyArray<string | null> = [
  null,        // 0  transparent
  '#F0997B',   // 1  light orange   — belly / highlights
  '#D85A30',   // 2  main orange    — body
  '#993C1D',   // 3  dark outline   — silhouette / shading
  '#F4C0D1',   // 4  pink           — ear inner / cheeks
  '#2C2C2A',   // 5  near-black     — eyes / nose / mouth
  '#FFFFFF',   // 6  white          — eye highlight (reserved)
] as const

/** Background tint for the stage (warm rice paper). */
export const BG_COLOR = '#FAEEDA'
