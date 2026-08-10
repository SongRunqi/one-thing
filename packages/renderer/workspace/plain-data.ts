/**
 * 序列化边界的去响应式工具 —— 插件 UI 层的**边界铁律**。
 *
 * 宿主的插件 UI 层(描述树、webview、氛围层)拿 Vue 响应式数据干活,而它有
 * 多个**序列化边界**:postMessage(sandbox iframe)、主进程 invoke(主进程)。
 * 结构化克隆不认 Proxy —— 响应式对象一过边界就是 "An object can't be cloned"。
 *
 * 这个病已经犯过两次,两次都是宿主的锅、插件无辜:
 *  - canvas-clock(4e0cfc6f):PluginWebviewFrame 把响应式树递进 postMessage;
 *  - file-pick(2026-08-10):PluginPanelNode 把响应式节点的 accept 数组递进 IPC。
 *
 * 规则:**凡是往 postMessage / invoke 里递的对象,必须过这里**。散修(在各
 * 调用点手工 [...spread] / toRaw)治标不治本 —— 下一个边界还会重犯。
 *
 * JSON 往返顺带把 undefined 字段剥掉,与结构化克隆语义的差异(丢函数/Date
 * 变字符串)在插件 UI 层不构成问题:这些边界上的载荷本就该是纯 JSON 数据。
 */
export function toPlainData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
