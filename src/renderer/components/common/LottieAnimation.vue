<template>
  <div ref="container" class="lottie-container"></div>
</template>

<script setup lang="ts">
/**
 * LottieAnimation - Lottie 动画播放器组件
 *
 * 封装 lottie-web 库，提供简洁的 Vue 接口来播放 Lottie JSON 动画
 * 支持两种加载方式：
 * 1. animationData - 直接传入 JSON 对象
 * 2. path - 通过 URL 加载 JSON 文件
 */
import lottie, { type AnimationItem } from 'lottie-web'
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Lottie JSON 动画数据 (与 path 二选一) */
    animationData?: object
    /** Lottie JSON 文件 URL (与 animationData 二选一) */
    path?: string
    /** 是否循环播放 */
    loop?: boolean
    /** 是否自动播放 */
    autoplay?: boolean
    /** 渲染器类型 */
    renderer?: 'svg' | 'canvas' | 'html'
    /** 播放速度 (1 = 正常速度) */
    speed?: number
  }>(),
  {
    loop: true,
    autoplay: true,
    renderer: 'svg',
    speed: 1,
  }
)

const emit = defineEmits<{
  complete: []
  loopComplete: []
  enterFrame: [frame: number]
  loaded: []
  error: [error: Error]
}>()

const container = ref<HTMLElement>()
let animation: AnimationItem | null = null

onMounted(() => {
  if (!container.value) return

  // 支持两种加载方式：animationData 或 path
  const config: Parameters<typeof lottie.loadAnimation>[0] = {
    container: container.value,
    renderer: props.renderer,
    loop: props.loop,
    autoplay: props.autoplay,
  }

  if (props.animationData) {
    config.animationData = props.animationData
  } else if (props.path) {
    config.path = props.path
  } else {
    console.warn('LottieAnimation: 需要提供 animationData 或 path')
    return
  }

  animation = lottie.loadAnimation(config)
  animation.setSpeed(props.speed)

  // 事件监听
  animation.addEventListener('complete', () => emit('complete'))
  animation.addEventListener('loopComplete', () => emit('loopComplete'))
  animation.addEventListener('enterFrame', (e: any) => emit('enterFrame', e.currentTime))
  animation.addEventListener('DOMLoaded', () => emit('loaded'))
  animation.addEventListener('data_failed', () => emit('error', new Error('Failed to load animation')))
})

onUnmounted(() => {
  animation?.destroy()
  animation = null
})

// 响应速度变化
watch(
  () => props.speed,
  (newSpeed) => {
    animation?.setSpeed(newSpeed)
  }
)

// 暴露控制方法
defineExpose({
  play: () => animation?.play(),
  pause: () => animation?.pause(),
  stop: () => animation?.stop(),
  goToAndPlay: (frame: number) => animation?.goToAndPlay(frame, true),
  goToAndStop: (frame: number) => animation?.goToAndStop(frame, true),
})
</script>

<style scoped>
.lottie-container {
  width: 100%;
  height: 100%;
}
</style>
