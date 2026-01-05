<template>
  <div class="empty-state new-year-theme">
    <!-- 背景星星层 - 微妙闪烁 -->
    <div class="stars-layer">
      <span
        v-for="i in 15"
        :key="'star-' + i"
        class="star"
        :style="starStyle(i)"
      >
        {{ starChar(i) }}
      </span>
    </div>

    <!-- 彩带层 - 极慢飘落 -->
    <div class="confetti-layer">
      <span
        v-for="i in 10"
        :key="'confetti-' + i"
        class="confetti-piece"
        :style="confettiStyle(i)"
      ></span>
    </div>

    <!-- 主内容 -->
    <div class="hero-section">
      <!-- 新年 Orb -->
      <div class="new-year-orb">
        <span class="orb-icon">🎆</span>
      </div>

      <!-- 年份 -->
      <div class="year-display">
        <span
          v-for="(digit, index) in yearDigits"
          :key="index"
          class="digit"
          :style="{ animationDelay: `${index * 0.1}s` }"
        >
          {{ digit }}
        </span>
      </div>

      <!-- 标题 -->
      <div class="empty-title">
        <span class="title-text">one thing</span>
      </div>

      <!-- 祝福语 -->
      <div class="empty-subtitle">
        <span class="greeting">新年快乐 · Happy New Year</span>
      </div>
    </div>

    <!-- 建议卡片 -->
    <div class="suggestion-grid">
      <div
        class="suggestion-card"
        @click="$emit('suggestion', '帮我写一段温馨的新年祝福语，发给亲朋好友。')"
      >
        <div class="card-inner">
          <span class="card-icon">🎊</span>
          <span>新年祝福</span>
        </div>
      </div>
      <div
        class="suggestion-card"
        @click="$emit('suggestion', `帮我制定一份${currentYear}年的新年计划和目标。`)"
      >
        <div class="card-inner">
          <span class="card-icon">📋</span>
          <span>新年计划</span>
        </div>
      </div>
      <div
        class="suggestion-card"
        @click="$emit('suggestion', '推荐一些适合新年跨年的活动或电影。')"
      >
        <div class="card-inner">
          <span class="card-icon">🎬</span>
          <span>跨年活动</span>
        </div>
      </div>
      <div
        class="suggestion-card"
        @click="$emit('suggestion', '帮我总结回顾一下过去一年的收获和成长。')"
      >
        <div class="card-inner">
          <span class="card-icon">📝</span>
          <span>年度总结</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

defineEmits<{
  suggestion: [text: string]
}>()

// 动态年份
const currentYear = new Date().getFullYear()
const yearDigits = computed(() => String(currentYear).split(''))

// 星星字符
const starChars = ['✦', '✧', '·', '✦', '·', '✧']
function starChar(i: number) {
  return starChars[i % starChars.length]
}

// 星星位置样式
function starStyle(i: number) {
  const left = (i * 7 + 3) % 100
  const top = (i * 11 + 5) % 50
  const delay = (i * 0.5) % 4
  const duration = 4 + (i % 3)
  const size = 8 + (i % 4)
  return {
    left: `${left}%`,
    top: `${top}%`,
    fontSize: `${size}px`,
    animationDelay: `${delay}s`,
    animationDuration: `${duration}s`,
  }
}

// 彩带位置样式
function confettiStyle(i: number) {
  const left = (i * 10 + 5) % 100
  const delay = (i * 1.5) % 12
  const duration = 12 + (i % 5)
  const colors = ['#fbbf24', '#f87171', '#a78bfa', '#34d399', '#60a5fa']
  const color = colors[i % colors.length]
  const size = 4 + (i % 4)
  return {
    left: `${left}%`,
    backgroundColor: color,
    width: `${size}px`,
    height: `${size * 1.5}px`,
    animationDelay: `${delay}s`,
    animationDuration: `${duration}s`,
  }
}
</script>

<style scoped>
/* 主容器 */
.empty-state.new-year-theme {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: transparent;
  overflow: hidden;
  user-select: none;
}

/* ========== 星星层 ========== */
.stars-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

.star {
  position: absolute;
  color: var(--text);
  opacity: 0.15;
  animation: twinkle ease-in-out infinite;
}

@keyframes twinkle {
  0%, 100% { opacity: 0.1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(1.1); }
}

/* ========== 彩带层 ========== */
.confetti-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

.confetti-piece {
  position: absolute;
  top: -20px;
  border-radius: 2px;
  opacity: 0;
  animation: confetti-drift linear infinite;
}

@keyframes confetti-drift {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 0;
  }
  5% {
    opacity: 0.25;
  }
  95% {
    opacity: 0.25;
  }
  100% {
    transform: translateY(calc(100vh + 40px)) rotate(720deg);
    opacity: 0;
  }
}

/* ========== 主内容 ========== */
.hero-section {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
}

/* 新年 Orb - 继承 DefaultTheme 风格 */
.new-year-orb {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 30%, #fbbf24 60%, #f59e0b 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 0 40px rgba(251, 191, 36, 0.3),
    0 0 80px rgba(251, 191, 36, 0.15);
  animation: orb-glow 4s ease-in-out infinite;
}

.orb-icon {
  font-size: 40px;
  animation: orb-float 3s ease-in-out infinite;
}

@keyframes orb-glow {
  0%, 100% {
    box-shadow:
      0 0 40px rgba(251, 191, 36, 0.3),
      0 0 80px rgba(251, 191, 36, 0.15);
    transform: scale(1);
  }
  50% {
    box-shadow:
      0 0 50px rgba(251, 191, 36, 0.4),
      0 0 100px rgba(251, 191, 36, 0.2);
    transform: scale(1.02);
  }
}

@keyframes orb-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

/* 年份数字 */
.year-display {
  display: flex;
  gap: 2px;
}

.digit {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 36px;
  font-weight: 700;
  color: var(--text);
  opacity: 0.9;
  animation: digit-appear 0.5s ease-out backwards;
}

@keyframes digit-appear {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 0.9;
    transform: translateY(0);
  }
}

/* 标题 */
.empty-title {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 32px;
  font-weight: 600;
}

.title-text {
  background: linear-gradient(90deg, var(--text), #d97706);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* 祝福语 */
.empty-subtitle {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 14px;
}

.greeting {
  color: var(--text-secondary);
  opacity: 0.8;
  letter-spacing: 0.05em;
}

/* ========== 建议卡片 ========== */
.suggestion-grid {
  position: relative;
  z-index: 10;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  width: 100%;
  max-width: 500px;
  padding: 0 24px;
  animation: cards-fade-in 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  animation-delay: 0.3s;
  opacity: 0;
}

@keyframes cards-fade-in {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.suggestion-card {
  padding: 1px;
  background: linear-gradient(
    135deg,
    rgba(251, 191, 36, 0.3),
    transparent,
    rgba(245, 158, 11, 0.2)
  );
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.card-inner {
  padding: 14px 16px;
  background: var(--bg-elevated);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 11px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  transition: all 0.3s ease;
}

.suggestion-card:hover {
  transform: translateY(-4px);
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.5), rgba(245, 158, 11, 0.3));
  box-shadow: 0 10px 30px rgba(251, 191, 36, 0.15);
}

.suggestion-card:hover .card-inner {
  background: var(--hover);
}

.card-icon {
  font-size: 18px;
}
</style>
