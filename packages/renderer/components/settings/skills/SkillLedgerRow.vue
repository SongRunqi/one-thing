<template>
  <li
    class="skill-row"
    :class="{ 'is-expanded': expanded, 'is-disabled': !skill.enabled }"
  >
    <div
      class="row-line"
      role="button"
      tabindex="0"
      @click="emit('toggle-expand')"
      @keydown.enter.prevent="emit('toggle-expand')"
      @keydown.space.prevent="emit('toggle-expand')"
    >
      <span class="row-name">{{ skill.name }}</span>
      <span
        v-if="agentLabel"
        class="agent-chip"
        :title="`Only loads for agent ${agentLabel}`"
      >{{ agentLabel }}</span>
      <span class="row-desc">{{ skill.description }}</span>
      <span
        class="row-actions"
        @click.stop
      >
        <button
          class="text-action"
          type="button"
          title="Open skill directory"
          @click="emit('open-directory')"
        >
          folder
        </button>
        <button
          v-if="canDelete"
          class="text-action is-danger"
          type="button"
          title="Delete skill"
          @click="emit('delete')"
        >
          delete
        </button>
        <button
          class="enable-dot"
          type="button"
          :class="{ 'is-on': skill.enabled }"
          :title="skill.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'"
          :aria-pressed="skill.enabled"
          @click="emit('toggle-enabled', !skill.enabled)"
        />
      </span>
    </div>

    <div
      v-if="expanded"
      class="row-detail"
    >
      <p class="detail-description">
        {{ skill.description }}
      </p>

      <div class="detail-meta">
        <span class="meta-label">path</span>
        <button
          class="meta-path"
          type="button"
          title="Open in file manager"
          @click="emit('open-directory')"
        >
          {{ skill.directoryPath }}
        </button>
      </div>

      <div
        v-if="skill.tags?.length"
        class="detail-meta"
      >
        <span class="meta-label">tags</span>
        <span class="meta-value">{{ skill.tags.join(', ') }}</span>
      </div>

      <div
        v-if="skill.allowedTools?.length"
        class="detail-meta"
      >
        <span class="meta-label">tools</span>
        <span class="meta-value">{{ skill.allowedTools.join(', ') }}</span>
      </div>

      <div class="detail-meta">
        <span class="meta-label">agent</span>
        <select
          class="agent-select"
          :value="skill.agentId ?? ''"
          @change="onAgentChange"
        >
          <option value="">
            All agents
          </option>
          <option
            v-for="agent in agents"
            :key="agent.id"
            :value="agent.id"
          >
            {{ agent.name }}
          </option>
        </select>
      </div>

      <pre
        v-if="skill.instructions"
        class="detail-instructions"
      >{{ instructionsPreview }}</pre>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AgentDefinition, SkillDefinition } from '@/types'

interface Props {
  skill: SkillDefinition
  agents: AgentDefinition[]
  agentLabel: string | null
  expanded: boolean
  canDelete?: boolean
}

interface Emits {
  (e: 'toggle-expand'): void
  (e: 'toggle-enabled', enabled: boolean): void
  (e: 'set-agent', agentId: string | null): void
  (e: 'delete'): void
  (e: 'open-directory'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const MAX_INSTRUCTIONS_PREVIEW = 1200

const instructionsPreview = computed(() => {
  const text = props.skill.instructions ?? ''
  return text.length > MAX_INSTRUCTIONS_PREVIEW
    ? `${text.slice(0, MAX_INSTRUCTIONS_PREVIEW)}\n…`
    : text
})

function onAgentChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  emit('set-agent', value || null)
}
</script>

<!-- Styles live in SkillsSettingsPanel.vue so the ledger reads as one sheet. -->