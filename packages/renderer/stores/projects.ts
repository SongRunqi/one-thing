/**
 * 项目名册 store —— 左栏「项目」分组的持久底账。
 *
 * 后端的 project-dirs 子系统早就齐了(`<store>/project-dirs/index.json` +
 * list/add/update/remove 的 IPC 与 `/api/project-dirs` 路由),但渲染层一直没接:
 * 左栏的项目分组是**推导**出来的 —— 会话的 workingDirectory 撞在一起才成一组。
 * 于是「新建一个还没有会话的项目」无处安放:它没有会话,推导不出分组。
 *
 * 这个 store 把那份底账接进来。名册里的项目**不靠会话存在**,空项目照样占一格,
 * 那正是「新建项目 → 在里面开第一个会话」这条路要站的地方。推导出来的项目
 * (老会话带的 cwd)不受影响 —— 两份在 `useSessionOrganizer` 里按目录并起来。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ProjectDirSummary } from '@shared/ipc'
import { platformApi } from '@/platform'
import { normalizeProjectDir } from '@/utils/project-dir'

export const useProjectsStore = defineStore('projects', () => {
  const entries = ref<ProjectDirSummary[]>([])
  const loading = ref(false)
  const lastError = ref<string | null>(null)

  async function load(): Promise<void> {
    loading.value = true
    try {
      const response = await platformApi.projectDirsList()
      if (response.success) {
        entries.value = response.entries ?? []
        lastError.value = null
      } else {
        lastError.value = response.error || 'Failed to load projects'
      }
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : 'Failed to load projects'
      console.error('Failed to load project dirs:', error)
    } finally {
      loading.value = false
    }
  }

  /**
   * 登记一个目录。后端对同一路径是 upsert(重复登记只刷新 lastUsedAt),
   * 所以这里不必先查重 —— 用户挑了一个已在名册里的目录,结果是它浮到最前,
   * 而不是一句错误。
   */
  async function add(path: string, description?: string): Promise<boolean> {
    const normalized = normalizeProjectDir(path)
    if (!normalized) return false
    try {
      const response = await platformApi.projectDirsAdd(normalized, description)
      if (!response.success) {
        lastError.value = response.error || 'Failed to add project'
        return false
      }
      await load()
      return true
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : 'Failed to add project'
      console.error('Failed to add project dir:', error)
      return false
    }
  }

  /**
   * 从名册移除。**只是取消登记**:该目录下的会话一条都不动,它们会退回
   * 「推导出来的项目」那条路 —— 还有会话的目录照样成组,只有空项目才真正消失。
   */
  async function remove(path: string): Promise<boolean> {
    const normalized = normalizeProjectDir(path)
    if (!normalized) return false
    try {
      const response = await platformApi.projectDirsRemove(normalized)
      if (!response.success) {
        lastError.value = response.error || 'Failed to remove project'
        return false
      }
      entries.value = entries.value.filter(
        entry => normalizeProjectDir(entry.path) !== normalized,
      )
      return true
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : 'Failed to remove project'
      console.error('Failed to remove project dir:', error)
      return false
    }
  }

  return { entries, loading, lastError, load, add, remove }
})
