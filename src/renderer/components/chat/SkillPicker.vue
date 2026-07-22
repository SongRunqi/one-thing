<template>
  <ComposerExtensionPanel
    :visible="visible"
    title="Skills"
    :count="filteredSkills.length"
    :empty-text="emptyText"
  >
    <div class="composer-extension-list">
      <div
        v-for="(skill, index) in filteredSkills"
        :key="skill.id"
        :class="['composer-extension-row', { selected: index === selectedIndex }]"
        @click="selectSkill(skill)"
        @mouseenter="selectedIndex = index"
      >
        <div class="composer-extension-row-icon">
          <User
            v-if="skill.source === 'user'"
            :size="15"
            :stroke-width="2"
          />
          <Folder
            v-else
            :size="15"
            :stroke-width="2"
          />
        </div>
        <div class="composer-extension-row-main">
          <div class="composer-extension-row-title skill-title">
            {{ skill.name }}
          </div>
          <div class="composer-extension-row-description">
            {{ skill.description }}
          </div>
        </div>
        <div class="composer-extension-row-meta">
          {{ skill.source === 'user' ? 'User' : 'Project' }}
        </div>
      </div>
    </div>
  </ComposerExtensionPanel>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Folder, User } from 'lucide-vue-next'
import ComposerExtensionPanel from './ComposerExtensionPanel.vue'
import type { SkillDefinition } from '@/types'

const props = defineProps<{
  visible: boolean
  query: string
  skills: SkillDefinition[]
}>()

const emit = defineEmits<{
  select: [skill: SkillDefinition]
  close: []
}>()

const selectedIndex = ref(0)

const filteredSkills = computed(() => {
  const q = props.query.toLowerCase()
  return props.skills
    .filter(skill => skill.enabled)
    .filter(skill => {
      return skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q)
    })
})

const emptyText = computed(() => {
  const query = props.query.trim()
  return query ? `No skills found for "${query}"` : 'No skills available'
})

watch(
  () => [props.query, props.visible, filteredSkills.value.length],
  () => {
    selectedIndex.value = 0
  },
)

function selectSkill(skill: SkillDefinition) {
  emit('select', skill)
}
</script>

<style scoped>
.skill-title {
  font-family: var(--font-mono);
}
</style>
