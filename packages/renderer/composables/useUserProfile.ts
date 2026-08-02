/**
 * 「我的资料」的渲染侧读法(docs/design/agent-dm-user.md §2.4)。
 *
 * app 层有 `resolveUserIdentity()` 收口,renderer 这一侧需要同一件事的另一个
 * 形态:响应式(改名后署名当场跟着变)、且不落新 IPC —— settings 已经在
 * settings store 里,再开一条通道等于给同一份资料造第二个真源。
 *
 * 缺省链与 app 层**刻意不同**的只有一处:署名回退是「我」而不是「用户」。
 * 「用户」是别人怎么称呼我,「我」是我怎么称呼自己 —— 同一个人在两个视角下
 * 本来就该是两个词(§5 Q2)。
 */
import { computed } from 'vue'
import { COLLAB_REPLY_USER_LABEL } from '@onething/runtime/collab'
import { useSettingsStore } from '@/stores/settings'

/** 没配置名字时,自己看自己的称呼。被 @ 时渲染成的也是这个词。 */
export const USER_SELF_LABEL = '我'
/** 没配置头像时用户的缺省 emoji。`AgentAvatar` 自己的 🤖 是给 agent 的。 */
export const USER_AVATAR_FALLBACK = '🙂'

export interface UserProfileView {
  /** 署名用:名字 || 「我」。 */
  name: string
  /** 名字本身(没配置就是空串)—— 需要区分"配没配"的地方读它。 */
  configuredName: string
  handle: string
  avatar: string
  avatarImage: string
}

/**
 * `@` 能点亮用户的全部写法:两个常量词 + TA 的名字与句柄,去重。
 *
 * 常量词永远在列:资料是空的时候「@用户」也得认得出来。
 */
export function collabUserMentionLabels(profile: {
  configuredName?: string
  handle?: string
}): string[] {
  return [...new Set([
    COLLAB_REPLY_USER_LABEL,
    USER_SELF_LABEL,
    profile.configuredName?.trim() || '',
    profile.handle?.trim() || '',
  ].filter(Boolean))]
}

/** 这个署名指的是用户本人吗(引用快照的作者行按名字比对,没有 id 可用)。 */
export function isCollabUserAuthorLabel(
  label: string | undefined | null,
  profile: { configuredName?: string },
): boolean {
  const trimmed = label?.trim()
  if (!trimmed) return false
  return trimmed === COLLAB_REPLY_USER_LABEL
    || trimmed === USER_SELF_LABEL
    || trimmed === profile.configuredName?.trim()
}

/**
 * 设置 store 现取,拿不到就当没配置。
 *
 * 防的是**测试宿主**,不是产品路径:settings store 的 setup 会注册一个
 * `platformApi.onSystemThemeChanged` 监听,而消息行的既有单测只 mock 了它们自己
 * 认识的那几个 store 与几个 platform 方法。身份是署名旁边的一个装饰,不该让
 * 一堆与它无关的测试为了渲染一条消息去认识设置系统 —— Sidebar 的外壳形态门
 * 是同一处先例(取不到就退回缺省)。
 */
function readUserProfileSettings() {
  try {
    return useSettingsStore().settings?.general?.userProfile
  } catch {
    return undefined
  }
}

export function useUserProfile() {
  const profile = computed<UserProfileView>(() => {
    const source = readUserProfileSettings()
    const configuredName = source?.name?.trim() || ''
    return {
      name: configuredName || USER_SELF_LABEL,
      configuredName,
      handle: source?.handle?.trim() || '',
      avatar: source?.avatar?.trim() || '',
      avatarImage: source?.avatarImage?.trim() || '',
    }
  })

  const mentionLabels = computed(() => collabUserMentionLabels(profile.value))

  return { profile, mentionLabels }
}
