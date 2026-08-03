/**
 * id 生成走 Web Crypto(`globalThis.crypto`)而不是 `node:crypto`。
 *
 * 不是风格偏好:core/actors 的纯层(envelope/lease)经 `@onething/runtime/collab/actors`
 * 被 renderer 引用,顶层 `import 'node:crypto'` 会被 vite 外部化成「访问即抛错」的
 * 占位 —— 真机首启当场炸在 ids.ts:1(2026-08-03)。Web Crypto 在浏览器/Node≥19/bun/
 * Electron 全平台原生,产物同样是 UUID v4,消费者零差异。
 */
export function createCoreId(): string {
  return globalThis.crypto.randomUUID()
}
