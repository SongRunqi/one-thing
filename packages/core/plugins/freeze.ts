/**
 * 深冻结 —— 快照语义的执行面。
 *
 * `Object.freeze` 只冻顶层:一份 `{ tags: ['a'] }` 冻完之后 `snapshot.tags.push('x')`
 * 照样成功,而那个数组很可能是 manifest 里 `schema.default` 的**本体** ——
 * 一次 push 就污染了此后所有读取方,直到重启。
 *
 * 住在 core 是因为两边都要用:core 的 api-builder 交出 `api.settings.get()` 的
 * 快照,app 层的配置存储交出有效值快照,两处必须是同一套语义。
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function deepFreezeCorePluginValue<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (Array.isArray(value)) {
    if (seen.has(value)) return value
    seen.add(value)
    value.forEach(item => deepFreezeCorePluginValue(item, seen))
    return Object.freeze(value)
  }
  if (isPlainRecord(value)) {
    if (seen.has(value)) return value
    seen.add(value)
    Object.values(value).forEach(item => deepFreezeCorePluginValue(item, seen))
    return Object.freeze(value) as T
  }
  return value
}
