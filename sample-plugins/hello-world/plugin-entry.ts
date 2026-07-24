/**
 * Hello World Plugin — demonstrates the onething Plugin API.
 *
 * Install: ln -s $(pwd)/sample-plugins/hello-world ~/.onething/plugins/hello-world
 *
 * This plugin:
 *   1. Registers a "get_current_weather" tool the LLM can call
 *   2. Listens for tool:result events and reacts to bash errors
 *   3. Registers a /hello command
 *   4. Demonstrates persistent storage
 */

import { z } from 'zod'

/** @param {import('../../apps/electron/src/main/plugins/types').PluginAPI} api */
export default function helloWorldPlugin(api) {
  console.log(`[HelloWorld] Plugin loading... (id=${api.id})`)

  // ── 1. Register a tool the LLM can call ──
  api.registerTool({
    name: 'get_current_weather',
    description: 'Get the current weather for a city. Returns temperature, conditions, and humidity.',
    parameters: z.object({
      city: z.string().describe('The city name, e.g. "Beijing" or "San Francisco"'),
      units: z.enum(['celsius', 'fahrenheit']).optional().describe('Temperature units'),
    }),
    permissionGuard: 'safe',
    async execute(args, ctx) {
      ctx.metadata({ title: `Fetching weather for ${args.city}...` })

      // Simulate weather data (a real plugin would call an API)
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

  // ── 2. Listen for tool results and react ──
  api.on('tool:result', (envelope) => {
    const event = envelope.event
    if (event.toolName === 'bash' && event.toolCall?.result?.includes?.('command not found')) {
      console.log(`[HelloWorld] Detected "command not found" in session ${envelope.sessionId}`)
      // Could inject steering here, but we don't want to be too aggressive
    }
  })

  // ── 3. Register a slash command ──
  api.registerCommand('/hello', {
    description: 'Greet the user and show plugin status',
    async handler(args, ctx) {
      const name = args.trim() || 'World'
      ctx.notify(`Hello, ${name}! 👋`, 'info')

      // Count how many times this command has been used
      const count = (api.store.get('hello-count') || 0) + 1
      api.store.set('hello-count', count)

      // Queue a follow-up message for the LLM
      ctx.followUp(`The user was just greeted with a /hello command. This is the ${count}th time.`)
    },
  })

  // ── 4. Show stored state ──
  const greetCount = api.store.get('hello-count') || 0
  console.log(`[HelloWorld] Loaded! Previous hello count: ${greetCount}`)
}
