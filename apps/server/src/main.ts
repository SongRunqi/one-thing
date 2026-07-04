import { createOnethingHttpServer } from './http.js'
import { createDevelopmentOnethingServerRuntime } from './runtime.js'

const port = Number.parseInt(process.env.ONETHING_SERVER_PORT || '8787', 10)
const host = process.env.ONETHING_SERVER_HOST || '127.0.0.1'
const corsOrigin = process.env.ONETHING_CORS_ORIGIN || 'http://127.0.0.1:5174'
const workspaceRoot = process.env.ONETHING_SERVER_WORKSPACE_ROOT
const dataRoot = process.env.ONETHING_SERVER_DATA_ROOT
const settingsRoot = process.env.ONETHING_SERVER_SETTINGS_ROOT

const serverRuntime = createDevelopmentOnethingServerRuntime({ workspaceRoot, dataRoot, settingsRoot })
const server = createOnethingHttpServer({
  runtime: serverRuntime.runtime,
  corsOrigin,
})

server.listen(port, host, () => {
  console.log(`[onething-server] listening on http://${host}:${port}`)
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
