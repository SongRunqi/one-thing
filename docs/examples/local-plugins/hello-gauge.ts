/**
 * hello-gauge — 轻通道(本地单文件脚本)样例。
 *
 * 用法:把本文件拷进 `~/.onething/plugins-dev/`,重启桌面即生效。
 * id = 文件名(去扩展名)= `hello-gauge`,**无需 manifest / package.json / 构建**。
 *
 * 它拿到的是**窄化的 LocalPluginAPI** —— 只挂"自己给自己加东西"够用的面:
 * 注册工具 / 斜杠命令、订阅观察型事件、发横幅、读写自己的 KV、排定时任务。
 * `sessions` / `llm` / 面板 / 拦截钩子等需 manifest 声明的能力**物理不挂**在这里
 * (调用即 undefined)。要用它们,请打包成正式插件并在 contributes.permissions 声明。
 *
 * 类型:正式插件里可写 `(api: LocalPluginAPI) => void`
 * (`@onething/runtime` 的 `app/plugins/types` 导出该类型);本地脚本无构建、
 * 不解析路径,这里留空注解即可。
 */
export default function helloGauge(api) {
  // 每轮回答收尾计一次数,冒个横幅 —— 一个最小的"仪表"。
  api.on('stream:complete', () => {
    const turns = (api.store.get('turns') ?? 0) + 1
    api.store.set('turns', turns)
    api.ui.notify(`hello-gauge: done — ${turns} turn(s)`)
  })

  // /gauge:把当前计数念出来。
  api.registerCommand('gauge', {
    description: '显示 hello-gauge 记录的回合数',
    handler: async (_args, ctx) => {
      ctx.notify(`hello-gauge: ${api.store.get('turns') ?? 0} turn(s) so far`)
    },
  })
}
