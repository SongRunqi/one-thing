<template>
  <div class="empty-state default-theme">
    <!-- Ambient background -->
    <div class="ambient-bg">
      <div class="gradient-orb orb-1"></div>
      <div class="gradient-orb orb-2"></div>
    </div>

    <div class="content-wrapper">
      <!-- Hero Section -->
      <div class="hero-section">
        <div class="logo-container">
          <div class="logo-ring">
            <div class="logo-inner">
              <svg class="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5L12 3Z" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 12L20 7.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
                <path d="M12 12V21" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
                <path d="M12 12L4 7.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
              </svg>
            </div>
          </div>
        </div>

        <div class="text-content">
          <h1 class="title">
            <span class="title-gradient">0neThing</span>
          </h1>
          <p class="subtitle">有什么我可以帮助你的？</p>
        </div>
      </div>

      <!-- Suggestion Cards -->
      <div class="suggestions">
        <button
          v-for="suggestion in suggestions"
          :key="suggestion.id"
          class="suggestion-card"
          @click="$emit('suggestion', suggestion.prompt)"
        >
          <span class="card-icon">{{ suggestion.icon }}</span>
          <div class="card-content">
            <span class="card-title">{{ suggestion.title }}</span>
            <span class="card-desc">{{ suggestion.desc }}</span>
          </div>
          <svg class="card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineEmits<{
  suggestion: [text: string]
}>()

const suggestions = [
  {
    id: 'code',
    icon: '⌘',
    title: '写代码',
    desc: '帮你实现功能或解决问题',
    prompt: '帮我写一段代码，实现一个简单的功能。'
  },
  {
    id: 'write',
    icon: '✎',
    title: '写作',
    desc: '文章、文案、邮件等',
    prompt: '帮我写一篇文章，主题是...'
  },
  {
    id: 'brainstorm',
    icon: '◈',
    title: '头脑风暴',
    desc: '激发灵感，探索创意',
    prompt: '和我一起头脑风暴，探讨一下...'
  },
  {
    id: 'learn',
    icon: '◎',
    title: '学习',
    desc: '解释概念、解答疑问',
    prompt: '帮我解释一下这个概念：'
  }
]
</script>

<style scoped>
.empty-state.default-theme {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  user-select: none;
}

/* Ambient Background */
.ambient-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.gradient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
  animation: float 20s ease-in-out infinite;
}

.orb-1 {
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(var(--accent-rgb), 0.3) 0%, transparent 70%);
  top: -100px;
  right: -100px;
  animation-delay: 0s;
}

.orb-2 {
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(var(--accent-rgb), 0.2) 0%, transparent 70%);
  bottom: -50px;
  left: -50px;
  animation-delay: -10s;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(20px, -20px) scale(1.05); }
  50% { transform: translate(0, 10px) scale(0.95); }
  75% { transform: translate(-20px, -10px) scale(1.02); }
}

/* Content Wrapper */
.content-wrapper {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 48px;
  padding: 24px;
  animation: fadeIn 0.6s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Hero Section */
.hero-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.logo-container {
  position: relative;
}

.logo-ring {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  background: linear-gradient(
    135deg,
    rgba(var(--accent-rgb), 0.15) 0%,
    rgba(var(--accent-rgb), 0.05) 100%
  );
  border: 1px solid rgba(var(--accent-rgb), 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.3s ease;
}

.logo-ring::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 20px;
  padding: 1px;
  background: linear-gradient(
    135deg,
    rgba(var(--accent-rgb), 0.4),
    transparent 50%,
    rgba(var(--accent-rgb), 0.1)
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}

.logo-inner {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: var(--bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
}

.logo-icon {
  width: 28px;
  height: 28px;
  color: var(--accent);
}

.text-content {
  text-align: center;
}

.title {
  font-size: 28px;
  font-weight: 600;
  margin: 0 0 8px 0;
  letter-spacing: -0.02em;
}

.title-gradient {
  background: linear-gradient(
    135deg,
    var(--text-primary) 0%,
    var(--accent) 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subtitle {
  font-size: 15px;
  color: var(--text-muted);
  margin: 0;
  font-weight: 400;
}

/* Suggestion Cards */
.suggestions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  width: 100%;
  max-width: 480px;
}

.suggestion-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  position: relative;
  overflow: hidden;
}

.suggestion-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(var(--accent-rgb), 0.08) 0%,
    transparent 50%
  );
  opacity: 0;
  transition: opacity 0.2s ease;
}

.suggestion-card:hover {
  border-color: rgba(var(--accent-rgb), 0.3);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md), 0 0 0 1px rgba(var(--accent-rgb), 0.1);
}

.suggestion-card:hover::before {
  opacity: 1;
}

.suggestion-card:active {
  transform: translateY(0);
}

.card-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: rgba(var(--accent-rgb), 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: var(--accent);
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

.card-content {
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 1;
}

.card-title {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.card-desc {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-arrow {
  width: 16px;
  height: 16px;
  color: var(--text-faint);
  opacity: 0;
  transform: translateX(-4px);
  transition: all 0.2s ease;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

.suggestion-card:hover .card-arrow {
  opacity: 1;
  transform: translateX(0);
  color: var(--accent);
}

/* Responsive */
@media (max-width: 500px) {
  .suggestions {
    grid-template-columns: 1fr;
  }

  .content-wrapper {
    gap: 36px;
  }

  .title {
    font-size: 24px;
  }
}
</style>
