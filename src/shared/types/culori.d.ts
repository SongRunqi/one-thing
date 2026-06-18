declare module 'culori' {
  export interface CuloriColor {
    mode?: string
    r?: number
    g?: number
    b?: number
    l?: number
    c?: number
    h?: number
    alpha?: number
  }

  export function converter(mode: string): (color: string | CuloriColor) => CuloriColor | undefined
  export function clampRgb(color: CuloriColor | undefined): CuloriColor
  export function formatHex(color: CuloriColor | undefined): string
  export function wcagContrast(first: string | CuloriColor, second: string | CuloriColor): number
}
