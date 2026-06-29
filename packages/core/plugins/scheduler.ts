import type { CorePluginSchedulerAPI } from './types.js'

export interface PluginTaskSnapshotLike {
  id: string
  pluginId?: string
}

export interface CorePluginScheduledTaskLike<TContext = any> {
  id: string
  run(context: TContext): unknown
}

export interface CorePluginSchedulerHandleLike<TSnapshot, TRunOptions, TRunRecord> {
  id: string
  unregister(): void
  refresh(): TSnapshot | undefined
  getStatus(): TSnapshot | undefined
  runNow(options?: TRunOptions): Promise<TRunRecord>
  setEnabled(enabled: boolean): TSnapshot | undefined
}

export interface CorePluginSchedulerHost<
  TTask extends CorePluginScheduledTaskLike<any>,
  TSnapshot extends PluginTaskSnapshotLike,
  TRunOptions,
  TRunRecord,
> {
  register(task: TTask & { pluginId: string }): CorePluginSchedulerHandleLike<TSnapshot, TRunOptions, TRunRecord>
  getStatus(id: string): TSnapshot | undefined
  list(): TSnapshot[]
  refresh(id: string): TSnapshot | undefined
  runNow(id: string, options?: TRunOptions): Promise<TRunRecord>
  setEnabled(id: string, enabled: boolean): TSnapshot | undefined
}

export interface CreateScopedPluginSchedulerOptions<
  TTask extends CorePluginScheduledTaskLike<any>,
  TSnapshot extends PluginTaskSnapshotLike,
  TRunOptions,
  TRunRecord,
> {
  pluginId: string
  scheduler: CorePluginSchedulerHost<TTask, TSnapshot, TRunOptions, TRunRecord>
  disposeCallbacks?: Array<() => void>
}

export function scopePluginTaskId(pluginId: string, id: string): string {
  return `plugin:${pluginId}:${id}`
}

export function unscopePluginTaskId(pluginId: string, id: string): string {
  const prefix = scopePluginTaskId(pluginId, '')
  return id.startsWith(prefix) ? id.slice(prefix.length) : id
}

export function isPluginTaskSnapshot(pluginId: string, snapshot: { pluginId?: string }): boolean {
  return snapshot.pluginId === pluginId
}

export function unscopePluginTaskSnapshot<TSnapshot extends PluginTaskSnapshotLike>(
  pluginId: string,
  snapshot: TSnapshot | undefined,
): TSnapshot | undefined {
  return snapshot
    ? { ...snapshot, id: unscopePluginTaskId(pluginId, snapshot.id) }
    : undefined
}

function unscopedPluginRunContext(pluginId: string, taskId: string, context: unknown): unknown {
  if (context && typeof context === 'object') {
    return {
      ...context,
      taskId,
      pluginId,
    }
  }
  return context
}

export function createScopedPluginScheduler<
  TTask extends CorePluginScheduledTaskLike<any>,
  TSnapshot extends PluginTaskSnapshotLike,
  TRunOptions,
  TRunRecord,
>(
  options: CreateScopedPluginSchedulerOptions<TTask, TSnapshot, TRunOptions, TRunRecord>,
): CorePluginSchedulerAPI<
  TTask,
  CorePluginSchedulerHandleLike<TSnapshot, TRunOptions, TRunRecord>,
  TSnapshot,
  TRunOptions,
  TRunRecord
> {
  const { pluginId, scheduler } = options
  const disposeCallbacks = options.disposeCallbacks ?? []
  const unscopeSnapshot = (snapshot: TSnapshot | undefined): TSnapshot | undefined =>
    unscopePluginTaskSnapshot(pluginId, snapshot)

  return {
    register(task) {
      const pluginTaskId = task.id.trim()
      const scopedTaskId = scopePluginTaskId(pluginId, pluginTaskId)
      const handle = scheduler.register({
        ...task,
        id: scopedTaskId,
        pluginId,
        run: context => task.run(unscopedPluginRunContext(pluginId, pluginTaskId, context)),
      } as TTask & { pluginId: string })
      const cleanup = () => handle.unregister()
      disposeCallbacks.push(cleanup)
      return {
        id: pluginTaskId,
        unregister: cleanup,
        refresh: () => unscopeSnapshot(handle.refresh()),
        getStatus: () => unscopeSnapshot(handle.getStatus()),
        runNow: options => handle.runNow(options),
        setEnabled: enabled => unscopeSnapshot(handle.setEnabled(enabled)),
      }
    },
    getStatus(id) {
      return unscopeSnapshot(scheduler.getStatus(scopePluginTaskId(pluginId, id)))
    },
    list() {
      return scheduler.list()
        .filter(snapshot => isPluginTaskSnapshot(pluginId, snapshot))
        .map(snapshot => ({ ...snapshot, id: unscopePluginTaskId(pluginId, snapshot.id) }))
    },
    refresh(id) {
      return unscopeSnapshot(scheduler.refresh(scopePluginTaskId(pluginId, id)))
    },
    runNow(id, options) {
      return scheduler.runNow(scopePluginTaskId(pluginId, id), options)
    },
    setEnabled(id, enabled) {
      return unscopeSnapshot(scheduler.setEnabled(scopePluginTaskId(pluginId, id), enabled))
    },
  }
}
