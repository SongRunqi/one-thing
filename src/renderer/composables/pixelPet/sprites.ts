/**
 * Pet sprite data — 32×32 grids of palette indices.
 *
 * Authored as ASCII strings (one char per pixel) for editability, then
 * decoded to integer 2D arrays at module load. The KEY map below is the
 * source-of-truth for which char picks which palette slot.
 *
 *   .  transparent (0)
 *   m  light orange (1)        — belly / highlight
 *   M  main orange  (2)        — body
 *   D  dark outline (3)
 *   P  pink         (4)        — ear inner / cheeks
 *   K  near-black   (5)        — eyes / nose / mouth
 *   W  white        (6)        — reserved (eye highlight)
 *
 * Every row MUST be exactly 32 chars wide and the array MUST have 32 rows
 * — `decode()` throws otherwise so a typo surfaces immediately.
 */

const KEY: Record<string, number> = {
  '.': 0,
  'm': 1,
  'M': 2,
  'D': 3,
  'P': 4,
  'K': 5,
  'W': 6,
}

export const SPRITE_SIZE = 32

function decode(rows: string[], spriteName: string): number[][] {
  if (rows.length !== SPRITE_SIZE) {
    throw new Error(`Sprite "${spriteName}" has ${rows.length} rows, expected ${SPRITE_SIZE}`)
  }
  return rows.map((row, y) => {
    if (row.length !== SPRITE_SIZE) {
      throw new Error(`Sprite "${spriteName}" row ${y} has length ${row.length}, expected ${SPRITE_SIZE}: "${row}"`)
    }
    return Array.from(row).map((ch, x) => {
      const idx = KEY[ch]
      if (idx === undefined) {
        throw new Error(`Sprite "${spriteName}" row ${y} col ${x} has unknown char "${ch}"`)
      }
      return idx
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────
// Cat — orange tabby, idle pose (Stage 1: single static frame).
//
// Anatomy:
//   rows  2- 5  ears (DPPD outline + pink inner)
//   row   6     ear-to-head transition
//   rows  7-19  head body
//   rows 11-12  eyes (KK pairs)
//   rows 14-15  nose + mouth (KDK + K)
//   rows 16-17  cheek dots (PP pairs)
//   rows 20-22  chin narrowing
//   rows 23-28  body with light-orange belly
//   row  29     two front paws
// ─────────────────────────────────────────────────────────────────────────

export const CAT_IDLE_FRAME_1: number[][] = decode([
  '................................', // 00
  '................................', // 01
  '.....DD..................DD.....', // 02
  '....DPPD................DPPD....', // 03
  '....DPPD................DPPD....', // 04
  '....DPPD................DPPD....', // 05
  '....DDDDMMMMMMMMMMMMMMMMDDDD....', // 06
  '.....DMMMMMMMMMMMMMMMMMMMMD.....', // 07
  '.....DMMMMMMMMMMMMMMMMMMMMD.....', // 08
  '....DMMMMMMMMMMMMMMMMMMMMMMD....', // 09
  '....DMMMMMMMMMMMMMMMMMMMMMMD....', // 10
  '....DMMMKKMMMMMMMMMMMMKKMMMD....', // 11  eyes
  '....DMMMKKMMMMMMMMMMMMKKMMMD....', // 12  eyes
  '....DMMMMMMMMMMMMMMMMMMMMMMD....', // 13
  '....DMMMMMMMMMMDKDMMMMMMMMMD....', // 14  nose
  '....DMMMMMMMMMMMKMMMMMMMMMMD....', // 15  mouth tip
  '....DMMPPMMMMMMMMMMMMMMPPMMD....', // 16  cheeks
  '....DMMPPMMMMMMMMMMMMMMPPMMD....', // 17  cheeks
  '....DMMMMMMMMMMMMMMMMMMMMMMD....', // 18
  '....DDMMMMMMMMMMMMMMMMMMMMDD....', // 19
  '.....DDDMMMMMMMMMMMMMMMMDDD.....', // 20  chin
  '........DDMMMMMMMMMMMMDD........', // 21
  '........DMMMMMMMMMMMMMMD........', // 22  body top
  '........DMmmmmmmmmmmmmMD........', // 23  belly
  '........DMmmmmmmmmmmmmMD........', // 24
  '.......DMmmmmmmmmmmmmmmMD.......', // 25
  '.......DMmmmmmmmmmmmmmmMD.......', // 26
  '.......DMmmmmmmmmmmmmmmMD.......', // 27
  '........DDmmmmmmmmmmmmDD........', // 28
  '..........DDD......DDD..........', // 29  paws
  '................................', // 30
  '................................', // 31
], 'cat-idle-1')
