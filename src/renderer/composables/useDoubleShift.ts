/**
 * Double Shift detection composable
 *
 * Fires callback when Shift is pressed twice within 300ms,
 * without any other keys in between (avoids Shift+A false triggers).
 */

import { onMounted, onUnmounted } from 'vue'

export function useDoubleShift(callback: () => void, interval = 300) {
  let lastShiftUp = 0
  let shiftClean = false

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Shift' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      shiftClean = true
    } else {
      shiftClean = false
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.key !== 'Shift' || !shiftClean) {
      shiftClean = false
      return
    }

    const now = Date.now()
    if (now - lastShiftUp < interval) {
      lastShiftUp = 0
      callback()
    } else {
      lastShiftUp = now
    }
    shiftClean = false
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('keyup', onKeyUp, true)
  })
}
