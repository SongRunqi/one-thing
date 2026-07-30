<template>
  <img
    v-if="src && !broken"
    v-bind="$attrs"
    class="agent-avatar agent-avatar-image"
    :src="src"
    :style="boxStyle"
    alt=""
    decoding="async"
    @error="broken = true"
  >
  <span
    v-else
    v-bind="$attrs"
    class="agent-avatar agent-avatar-emoji"
  >{{ emoji }}</span>
</template>

<script setup lang="ts">
/**
 * An agent's identity mark — one component for all of them
 * (docs/design/todo2-fix-plan.md P2).
 *
 * Nine surfaces used to render `{{ agent.avatar || '🤖' }}` by hand, which is
 * why a picture avatar had nowhere to land. They now all render this: a picture
 * when the agent has one, its emoji when it does not, and the emoji again when
 * the picture fails to load (a missing file must not leave a hole where a face
 * belongs).
 *
 * WHAT THIS COMPONENT DOES NOT DO: draw the frame. Every call site already owns
 * the look of its own stamp — the 28px hairline circle in the room gutter, the
 * 15px one in a tab, the bare 15px glyph in a member list — and those rules
 * reach the root element here through the parent's scoped CSS. So the emoji
 * branch carries NO inline style at all and renders byte-identically to the
 * span it replaced; `size` sizes the `<img>` only, which is the one thing a
 * font-size cannot do.
 */
import { computed, ref, watch } from 'vue'
import { platformApi } from '@/platform'
import { AGENT_AVATAR_FALLBACK, resolveAgentAvatarSrc } from './agent-avatar'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  /** Emoji mark. Falls back to 🤖 when absent. */
  avatar?: string
  /** Media library file name of the picture avatar; wins over the emoji. */
  avatarImage?: string
  /**
   * Picture box in px. Only the `<img>` reads it — the emoji branch is sized by
   * the call site's own font-size, exactly as before this component existed.
   */
  size?: number
}>()

/** Latches per reference: a retry loop on a broken file would spin forever. */
const broken = ref(false)

const src = computed(() =>
  resolveAgentAvatarSrc(props.avatarImage, platformApi.environment))

const emoji = computed(() => props.avatar?.trim() || AGENT_AVATAR_FALLBACK)

const boxStyle = computed(() => props.size
  ? { width: `${props.size}px`, height: `${props.size}px` }
  : undefined)

watch(src, () => { broken.value = false })
</script>

<style scoped>
.agent-avatar {
  flex: none;
  user-select: none;
}

.agent-avatar-emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* A face is cropped to fill its stamp, never squashed to fit it. The radius is
   50% so a bare call site still gets a round mark; a call site whose own class
   says otherwise (a rounded square, say) wins on specificity. */
.agent-avatar-image {
  /* inline-block, not block: three call sites sit in running text (the typing
     line, the signature row) where a block image would break the line. */
  display: inline-block;
  vertical-align: middle;
  border-radius: 50%;
  object-fit: cover;
  object-position: center;
}
</style>
