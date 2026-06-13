<template>
  <main class="audit-shell">
    <div
      v-if="mode === 'matrix'"
      class="audit-flow-grid"
    >
      <AuditCard
        v-for="item in matrixCases"
        :key="item.id"
        :item="item"
      />
    </div>

    <div
      v-else-if="mode === 'flow'"
      class="audit-flow-grid"
    >
      <AuditCard
        v-for="item in flowCases"
        :key="item.id"
        :item="item"
      />
    </div>

    <AuditCard
      v-else
      :item="activeCase"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onMounted, watch } from 'vue'
import StepsPanel from '@/components/chat/StepsPanel.vue'
import {
  allMatrixCases,
  buildFlowCases,
  buildGroupCase,
  buildLongCommandCase,
  buildToolAuditCase,
  toolNames,
  type ToolAuditCase,
  type ToolAuditState,
} from './tool-ui-fixtures'

const params = new URLSearchParams(window.location.search)
const mode = computed(() => params.get('mode') || 'case')
const matrixCases = computed(() => allMatrixCases())
const flowCases = computed(() => buildFlowCases())

const activeCase = computed<ToolAuditCase>(() => {
  if (mode.value === 'flow-one') {
    const phase = Math.max(1, Math.min(6, Number(params.get('phase') || 1)))
    return buildFlowCases()[phase - 1]
  }
  if (mode.value === 'group') {
    const state = params.get('state')
    return buildGroupCase(state === 'expanded' || state === 'hover' ? state : 'collapsed')
  }
  if (mode.value === 'long-command') return buildLongCommandCase()

  const tool = params.get('tool') || toolNames[0]
  const state = (params.get('state') || 'completed') as ToolAuditState
  return buildToolAuditCase(tool, state)
})

const AuditCard = defineComponent({
  name: 'AuditCard',
  props: {
    item: {
      type: Object as () => ToolAuditCase,
      required: true,
    },
  },
  setup(props) {
    return () => h('section', {
      class: 'audit-card',
      'data-shot-id': props.item.id,
    }, [
      h('header', { class: 'audit-header' }, [
        h('div', { class: 'audit-title' }, props.item.title),
        h('div', { class: 'audit-kicker' }, props.item.id),
      ]),
      h('div', { class: 'audit-frame' }, [
        h(StepsPanel, {
          steps: props.item.steps,
          depth: 0,
          sessionId: 'tool-ui-audit',
        }),
      ]),
      h('p', { class: 'audit-note' }, props.item.note),
    ])
  },
})

async function applyRequestedInteractions() {
  await nextTick()
  await new Promise(resolve => window.setTimeout(resolve, 120))

  const shouldExpand =
    activeCase.value.autoExpand ||
    params.get('expand') === '1' ||
    params.get('state') === 'expanded'

  if (shouldExpand) {
    const groupHeader = document.querySelector<HTMLElement>('.group-header')
    if (mode.value === 'group' && groupHeader?.getAttribute('aria-expanded') === 'false') {
      groupHeader.click()
      await nextTick()
      await new Promise(resolve => window.setTimeout(resolve, 180))
      ;(window as unknown as { __TOOL_AUDIT_READY__?: boolean }).__TOOL_AUDIT_READY__ = true
      return
    }

    for (const row of Array.from(document.querySelectorAll<HTMLElement>('.operation-row.has-details'))) {
      if (!row.classList.contains('is-expanded')) {
        row.click()
        await nextTick()
      }
    }
    await new Promise(resolve => window.setTimeout(resolve, 260))
  }

  ;(window as unknown as { __TOOL_AUDIT_READY__?: boolean }).__TOOL_AUDIT_READY__ = true
}

onMounted(applyRequestedInteractions)
watch(activeCase, applyRequestedInteractions)
</script>
