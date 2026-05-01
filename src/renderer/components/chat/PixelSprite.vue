<template>
  <canvas
    ref="canvasRef"
    class="pixel-sprite"
    :width="frame[0].length * scale"
    :height="frame.length * scale"
  />
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { PALETTE } from '@/composables/pixelPet/palette'

interface Props {
  /** 2D grid of palette indices. Each non-zero cell paints a colored square. */
  frame: number[][]
  /** Pixel-to-screen multiplier. 4 → a 32×32 sprite renders at 128×128. */
  scale?: number
}

const props = withDefaults(defineProps<Props>(), {
  scale: 4,
})

const canvasRef = ref<HTMLCanvasElement | null>(null)

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Disable any sub-pixel smoothing — pixel art must stay crisp at every scale.
  ctx.imageSmoothingEnabled = false

  const { frame, scale } = props
  const w = frame[0]?.length ?? 0
  const h = frame.length

  // Repaint from scratch each frame so old pixels never bleed through.
  ctx.clearRect(0, 0, w * scale, h * scale)

  for (let y = 0; y < h; y++) {
    const row = frame[y]
    for (let x = 0; x < w; x++) {
      const idx = row[x]
      const color = PALETTE[idx]
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  }
}

onMounted(draw)
watch(() => [props.frame, props.scale], draw, { deep: true })
</script>

<style scoped>
.pixel-sprite {
  /* Belt-and-suspenders: even with imageSmoothingEnabled=false on the 2D
     context, the browser may still resample when the canvas itself is scaled
     by CSS. `pixelated` rendering keeps every drawn pixel sharp. */
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
  display: block;
}
</style>
