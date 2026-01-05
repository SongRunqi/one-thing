<template>
  <div class="empty-state default-theme">
    <div class="hero-section">
      <!-- Warm gradient orb -->
      <div class="warm-orb">
        <span class="orb-icon">✨</span>
      </div>
      <div class="empty-title">
        <span class="title-text">one thing</span>
      </div>
      <div class="empty-subtitle">有什么我可以帮助你的吗？</div>
    </div>

    <!-- Suggestion Cards -->
    <div class="suggestion-grid">
      <div class="suggestion-card" @click="$emit('suggestion', '帮我写一段代码，实现一个简单的功能。')">
        <div class="card-inner">
          <span class="card-icon">💻</span>
          <span>写代码</span>
        </div>
      </div>
      <div class="suggestion-card" @click="$emit('suggestion', '帮我写一篇文章，主题是...')">
        <div class="card-inner">
          <span class="card-icon">✍️</span>
          <span>写文章</span>
        </div>
      </div>
      <div class="suggestion-card" @click="$emit('suggestion', '和我一起头脑风暴，探讨一下...')">
        <div class="card-inner">
          <span class="card-icon">💡</span>
          <span>头脑风暴</span>
        </div>
      </div>
      <div class="suggestion-card" @click="$emit('suggestion', '帮我解释一下这个概念：')">
        <div class="card-inner">
          <span class="card-icon">📚</span>
          <span>学习新知</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineEmits<{
  suggestion: [text: string]
}>()
</script>

<style scoped>
/* Default Theme - 温馨舒适风格 */
.empty-state.default-theme {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: transparent;
  overflow: hidden;
  user-select: none;
  transform: translateZ(0);
}

.hero-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  margin-bottom: 40px;
  position: relative;
  z-index: 2;
}

/* Warm gradient orb */
.warm-orb {
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

.empty-subtitle {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 14px;
  color: var(--text-secondary);
  opacity: 0.8;
}

/* Suggestion Cards */
.suggestion-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  width: 100%;
  max-width: 500px;
  padding: 0 24px;
  z-index: 2;
  animation: cards-fade-in 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  opacity: 0;
}

@keyframes cards-fade-in {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.suggestion-card {
  padding: 1px;
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.3), transparent, rgba(245, 158, 11, 0.2));
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.card-inner {
  padding: 16px;
  background: var(--bg-elevated);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 11px;
  display: flex;
  align-items: center;
  gap: 12px;
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

.card-icon { font-size: 20px; }
</style>
