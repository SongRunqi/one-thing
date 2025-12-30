<template>
  <div class="empty-state futuristic-christmas">
    <!-- Starry Background Particles -->
    <div class="star-field">
      <div v-for="i in 12" :key="i" class="star-particle"></div>
    </div>

    <div class="holo-hero">
      <div class="geometric-tree">
        <div class="tree-layer"></div>
        <div class="tree-layer"></div>
        <div class="tree-layer"></div>
        <div class="tree-glow"></div>
      </div>
      <div class="empty-title">
        <span class="typing-text">one thing</span>
      </div>
      <div class="empty-subtitle">BEYOND_HORIZON_2025</div>
    </div>

    <!-- Holographic Suggestion Cards -->
    <div class="holo-grid">
      <div class="holo-card" @click="$emit('suggestion', 'Help me write a warm Christmas greeting for my family.')">
        <div class="holo-card-inner">
          <span class="holo-icon">✉️</span>
          <span>Synthesize Greeting</span>
        </div>
      </div>
      <div class="holo-card" @click="$emit('suggestion', 'Generate a list of unique Christmas gift ideas for a developer.')">
        <div class="holo-card-inner">
          <span class="holo-icon">🎁</span>
          <span>Query Gift Data</span>
        </div>
      </div>
      <div class="holo-card" @click="$emit('suggestion', 'Create a festive CSS snowflake animation code.')">
        <div class="holo-card-inner">
          <span class="holo-icon">❄️</span>
          <span>Render Snow.css</span>
        </div>
      </div>
      <div class="holo-card" @click="$emit('suggestion', 'Plan a cozy Christmas dinner menu for 4 people.')">
        <div class="holo-card-inner">
          <span class="holo-icon">🍽️</span>
          <span>Optimize Menu</span>
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
/* Futuristic Geometric Christmas Theme */
.empty-state.futuristic-christmas {
  position: relative;
  width: 100%;
  max-width: 800px;
  background: transparent;
  padding: 40px 20px;
  overflow: hidden;
  user-select: none;
  /* Force GPU layer to prevent flicker during layout changes */
  transform: translateZ(0);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.holo-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  margin-bottom: 60px;
  position: relative;
  z-index: 2;
}

/* Geometric Tree */
.geometric-tree {
  position: relative;
  width: 120px;
  height: 160px;
  display: flex;
  flex-direction: column;
  align-items: center;
  filter: drop-shadow(0 0 20px rgba(59, 130, 246, 0.4));
  animation: holo-float 6s ease-in-out infinite;
  /* GPU acceleration for filter and animation */
  will-change: transform;
  backface-visibility: hidden;
}

@keyframes holo-float {
  0%, 100% { transform: translateY(0) scale(1.05); }
  50% { transform: translateY(-15px) scale(0.95); }
}

.tree-layer {
  position: absolute;
  width: 0;
  height: 0;
  border-left: 50px solid transparent;
  border-right: 50px solid transparent;
  border-bottom: 80px solid rgba(59, 130, 246, 0.2);
  top: 40px;
}

.tree-layer:nth-child(2) {
  border-left-width: 40px;
  border-right-width: 40px;
  border-bottom-width: 60px;
  border-bottom-color: rgba(96, 165, 250, 0.3);
  top: 15px;
}

.tree-layer:nth-child(3) {
  border-left-width: 30px;
  border-right-width: 30px;
  border-bottom-width: 40px;
  border-bottom-color: rgba(147, 197, 253, 0.4);
  top: 0;
}

.tree-glow {
  position: absolute;
  bottom: 0;
  width: 90px;
  height: 90px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%);
  filter: blur(10px);
  /* GPU layer for blur filter */
  transform: translateZ(0);
}

.empty-subtitle {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 11px;
  letter-spacing: 0.3em;
  color: #60a5fa;
  text-transform: uppercase;
  font-weight: 500;
  opacity: 0.8;
  animation: text-pulse 3s ease-in-out infinite;
}

@keyframes text-pulse {
  0%, 100% { opacity: 0.5; text-shadow: 0 0 5px rgba(96, 165, 250, 0); }
  50% { opacity: 1; text-shadow: 0 0 10px rgba(96, 165, 250, 0.5); }
}

/* Star Field */
.star-field {
  position: absolute;
  inset: 0;
  z-index: 1;
  /* Create own compositing layer to prevent flicker during layout changes */
  transform: translateZ(0);
  isolation: isolate;
}

.star-particle {
  position: absolute;
  width: 4px;
  height: 4px;
  background: #60a5fa;
  border-radius: 50%;
  filter: blur(1px);
  animation: star-move linear infinite;
  opacity: 0.6;
}

@keyframes star-move {
  0% { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
  10% { opacity: 0.6; }
  90% { opacity: 0.6; }
  100% { transform: translateY(600px) translateX(50px) scale(0); opacity: 0; }
}

.star-particle:nth-child(4n) { width: 6px; height: 6px; background: #fbbf24; }

.star-particle:nth-child(1) { left: 10%; animation-duration: 15s; }
.star-particle:nth-child(2) { left: 25%; animation-duration: 12s; animation-delay: 2s; }
.star-particle:nth-child(3) { left: 40%; animation-duration: 18s; animation-delay: 4s; }
.star-particle:nth-child(4) { left: 55%; animation-duration: 14s; animation-delay: 1s; }
.star-particle:nth-child(5) { left: 70%; animation-duration: 16s; animation-delay: 3s; }
.star-particle:nth-child(6) { left: 85%; animation-duration: 13s; animation-delay: 5s; }
.star-particle:nth-child(7) { left: 15%; animation-duration: 11s; }
.star-particle:nth-child(8) { left: 90%; animation-duration: 17s; }
.star-particle:nth-child(9) { left: 45%; animation-duration: 14s; }
.star-particle:nth-child(10) { left: 30%; animation-duration: 15s; }
.star-particle:nth-child(11) { left: 60%; animation-duration: 12s; }
.star-particle:nth-child(12) { left: 80%; animation-duration: 16s; }

/* Holographic Cards */
.holo-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  width: 100%;
  padding: 0 24px;
  z-index: 2;
  animation: holo-fade-in 1s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  opacity: 0;
}

@keyframes holo-fade-in {
  from { opacity: 0; transform: translateY(30px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.holo-card {
  padding: 1px;
  background: linear-gradient(135deg, rgba(96, 165, 250, 0.5), transparent, rgba(96, 165, 250, 0.2));
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.holo-card-inner {
  padding: 16px;
  background: var(--bg-elevated);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 11px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  transition: all 0.3s ease;
  /* GPU acceleration to prevent flicker during layout changes */
  transform: translateZ(0);
}

.holo-card:hover {
  transform: translateY(-8px) scale(1.02);
  filter: brightness(1.2);
  background: linear-gradient(135deg, #60a5fa, #fbbf24);
  box-shadow: 0 15px 40px rgba(59, 130, 246, 0.3);
}

.holo-card:hover .holo-card-inner {
  background: var(--hover);
}

.holo-icon { font-size: 20px; }
</style>
