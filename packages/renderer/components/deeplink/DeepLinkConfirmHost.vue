<template>
  <DeepLinkConfirmDialog
    v-if="request"
    :request="request"
    :busy="busy"
    :source-label="DEEPLINK_SOURCE_LABEL"
    @confirm="onConfirm"
    @cancel="onCancel"
  />
</template>

<script setup lang="ts">
/**
 * 渲染 `services/deeplink` 排到队首的那一张卡。由 `services/ui-overlay-host`
 * 挂载一次 —— 与 ConfirmHost / ToastHost 同规,理由也一样:
 *
 * App.vue 是六种互斥窗口模式的开关盘,而深链在**任何**模式下都可能到达
 * (冷启动那一条尤其:它到得比 appReady 还早)。挂在某一个分支里,就等于在
 * 别的分支里静默丢链。
 */
import { computed } from 'vue'
import DeepLinkConfirmDialog from './DeepLinkConfirmDialog.vue'
import {
  activeDeepLink,
  deepLinkBusy,
  dismissDeepLink,
  settleDeepLink,
} from '@/services/deeplink'

/** 与主进程的 `DEEPLINK_CARD_SOURCE_LABEL` 是同一句话的用户可见版本。 */
const DEEPLINK_SOURCE_LABEL = 'external link'

const request = computed(() => activeDeepLink.value)
const busy = computed(() => deepLinkBusy.value)

function onConfirm(): void {
  // 拒绝卡上的那个钮是"知道了",不回传 —— 它没有可派发的东西。
  if (request.value?.card.kind === 'rejected') {
    dismissDeepLink()
    return
  }
  void settleDeepLink(true)
}

function onCancel(): void {
  if (request.value?.card.kind === 'rejected') {
    dismissDeepLink()
    return
  }
  void settleDeepLink(false)
}
</script>
