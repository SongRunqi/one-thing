import { z } from 'zod'

export default function helloWorldPlugin(api) {
  console.log(`[HelloWorld] Plugin loading... (id=${api.id})`)

  api.registerTool({
    name: 'get_current_weather',
    description: 'Get the current weather for a city. Returns temperature, conditions, and humidity.',
    parameters: z.object({
      city: z.string().describe('The city name, e.g. "Beijing" or "San Francisco"'),
      units: z.enum(['celsius', 'fahrenheit']).optional().describe('Temperature units'),
    }),
    // 宿主会把插件注册的工具**强制**改成 permission-gated —— 插件不能给自己发
    // 免检通行证('safe' 落在自动执行集里)。这里写什么都不影响判定;
    // 要声明能力请用 manifest 的 contributes.permissions。
    permissionGuard: 'permission-gated',
    async execute(args, ctx) {
      ctx.metadata({ title: `Fetching weather for ${args.city}...` })
      const temps = { beijing: 22, shanghai: 25, 'san francisco': 18, tokyo: 20 }
      const city = args.city.toLowerCase()
      const temp = temps[city] ?? 20
      return {
        title: `Weather: ${args.city}`,
        output: `Current weather in ${args.city}: ${temp}°${args.units === 'fahrenheit' ? 'F' : 'C'}, partly cloudy, humidity 65%.`,
        metadata: { city: args.city, temperature: temp, units: args.units || 'celsius' },
      }
    },
  })

  api.on('tool:result', (envelope) => {
    const event = envelope.event
    if (event.toolCall?.toolName === 'bash' && event.toolCall?.result?.includes?.('command not found')) {
      console.log(`[HelloWorld] Detected "command not found" in session ${envelope.sessionId}`)
    }
  })

  api.registerCommand('/hello', {
    description: 'Greet the user',
    async handler(args, ctx) {
      const name = args.trim() || 'World'
      ctx.notify(`Hello, ${name}! 👋`, 'info')
      const count = (api.store.get('hello-count') || 0) + 1
      api.store.set('hello-count', count)
      ctx.followUp(`The user was just greeted with a /hello command. This is the ${count}th time.`)
    },
  })

  const greetCount = api.store.get('hello-count') || 0
  console.log(`[HelloWorld] Loaded! Previous hello count: ${greetCount}`)
}
