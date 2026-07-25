import { createOnethingHttpServer } from './http.js'
import { createDevelopmentOnethingServerRuntime } from './runtime.js'

const port = Number.parseInt(process.env.ONETHING_SERVER_PORT || '8787', 10)
const host = process.env.ONETHING_SERVER_HOST || '127.0.0.1'
const corsOrigin = process.env.ONETHING_CORS_ORIGIN || 'http://127.0.0.1:5174'
const authToken = process.env.ONETHING_SERVER_TOKEN
const workspaceRoot = process.env.ONETHING_SERVER_WORKSPACE_ROOT
const dataRoot = process.env.ONETHING_SERVER_DATA_ROOT
const settingsRoot = process.env.ONETHING_SERVER_SETTINGS_ROOT

const runtimeCreateStart = Date.now()
const serverRuntime = await createDevelopmentOnethingServerRuntime({ workspaceRoot, dataRoot, settingsRoot })
console.log(`[Perf][Startup] runtime-created in ${Date.now() - runtimeCreateStart}ms`)
const server = createOnethingHttpServer({
  runtime: serverRuntime.runtime,
  corsOrigin,
  authToken,
})

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1'])
if (!authToken && !loopbackHosts.has(host)) {
  console.warn(
    `[onething-server] WARNING: listening on ${host} without ONETHING_SERVER_TOKEN — `
    + 'the API is reachable from other machines without authentication.',
  )
}

server.listen(port, host, () => {
  console.log(`[onething-server] listening on http://${host}:${port}`)
  console.log(`[Perf][Startup] http-listening +${Math.round(process.uptime() * 1000)}ms since process start`)
})

function shutdown(signal: NodeJS.Signals): void {
  console.log(`[onething-server] received ${signal}, shutting down`)
  server.close(() => {
    serverRuntime.shutdown()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
