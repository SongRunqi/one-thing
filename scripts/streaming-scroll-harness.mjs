#!/usr/bin/env node
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import electronPath from 'electron'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
const tmp = await mkdtemp(join(tmpdir(), 'onething-stream-harness-'))
const resultPath = join(tmp, 'result.json')
const mainPath = join(tmp, 'electron-main.cjs')
const rootHarnessPath = join(root, '.streaming-scroll-harness.html')

const streamingSource = [
  '这里是一段会持续增长的代码：',
  '',
  '```python',
  'import asyncio',
  'from dataclasses import dataclass',
  '',
  '@dataclass',
  'class Job:',
  '    name: str',
  '    delay: float',
  '',
  'async def run_job(job: Job) -> str:',
  '    await asyncio.sleep(job.delay)',
  '    return f"{job.name}:done"',
  '',
  'async def main():',
  '    jobs = [',
  '        Job("alpha", 0.1),',
  '        Job("beta", 0.2),',
  '        Job("gamma", 0.15),',
  '    ]',
  '    results = await asyncio.gather(*(run_job(job) for job in jobs))',
  '    for item in results:',
  '        print(item)',
  '',
  'if __name__ == "__main__":',
  '    asyncio.run(main())',
  '```',
].join('\n')

const harnessHtml = `<!doctype html>
<html data-theme="light" data-color-theme="blue" data-base-theme="obsidian">
<head>
  <meta charset="UTF-8" />
  <style>
    html, body, #app { width: 100%; height: 100%; margin: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fff; }
    .viewport {
      width: 980px;
      height: 620px;
      margin: 0 auto;
      overflow-y: auto;
      background: #fff;
      border: 1px solid #ddd;
    }
    .spacer { height: 720px; }
    .message {
      width: 720px;
      margin: 0 auto;
      padding: 24px 0 96px;
      color: #353945;
      font-size: 15px;
      line-height: 1.7;
    }
    .content { overflow-anchor: none; }
    .code-block-container {
      border: 1px solid #dedede;
      border-radius: 12px;
      background: #f3f3f3;
      overflow: hidden;
      margin: 12px 0;
    }
    .code-block-header {
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      border-bottom: 1px solid #dedede;
      color: #6b7280;
      font-size: 13px;
      box-sizing: border-box;
    }
    .code-block-copy { border: 0; background: transparent; color: #6b7280; }
    .bubble.assistant { width: 100%; }
    .content-display, .content-wrapper { width: 100%; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    const noopUnsubscribe = () => {}
    window.electronAPI = new Proxy({}, {
      get(_target, prop) {
        if (String(prop).startsWith('on')) return () => noopUnsubscribe
        return async () => ({ success: true, sessions: [], messages: [], settings: {}, data: null })
      }
    })
  </script>
  <script type="module">
    import { createApp, h, nextTick, onMounted, ref } from 'vue'
    import StreamingMarkdown from '/src/renderer/components/chat/message/StreamingMarkdown.vue'

    const target = ${JSON.stringify(streamingSource)}
    const chunkSizes = [1, 2, 3, 8, 5, 13, 21, 4, 34, 2, 55, 7, 3, 89]
    const content = ref('')
    const isStreaming = ref(true)
    const samples = []
    let previousCodeNode = null
    let remounts = 0
    let maxDistanceToBottom = 0
    let maxPostResizeDistance = 0
    let maxCodeTopJump = 0
    let previousCodeTop = null
    let previousHeight = null
    const lineNodes = new Map()
    let unchangedLineNodeReplacements = 0
    let resizeCount = 0

    function raf() {
      return new Promise(resolve => requestAnimationFrame(() => resolve()))
    }

    function getMaxScrollTop(scroller) {
      return Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    }

    function pinToBottom(source) {
      const scroller = document.querySelector('.viewport')
      if (!scroller) return
      scroller.scrollTop = getMaxScrollTop(scroller)
      collect(source)
    }

    function collect(source) {
      const scroller = document.querySelector('.viewport')
      const code = document.querySelector('.code-block-container')
      if (!scroller) return

      const distance = Math.max(0, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop)
      maxDistanceToBottom = Math.max(maxDistanceToBottom, distance)

      if (code) {
        if (previousCodeNode && previousCodeNode !== code) remounts++
        previousCodeNode = code

        const rect = code.getBoundingClientRect()
        const top = Math.round(rect.top * 100) / 100
        const height = Math.round(rect.height * 100) / 100
        if (previousCodeTop !== null && previousHeight !== null) {
          const heightDelta = height - previousHeight
          const topDelta = top - previousCodeTop
          // When following at bottom, growth should move content upward by roughly
          // the height delta. Extra positive/negative movement is visual jitter.
          const expectedTopDelta = heightDelta > 0 ? -heightDelta : 0
          maxCodeTopJump = Math.max(maxCodeTopJump, Math.abs(topDelta - expectedTopDelta))
        }
        previousCodeTop = top
        previousHeight = height

        const lines = Array.from(code.querySelectorAll('.code-line'))
        for (let i = 0; i < lines.length; i++) {
          const text = lines[i].textContent || ''
          const prev = lineNodes.get(i)
          if (prev && prev.text === text && prev.node !== lines[i]) unchangedLineNodeReplacements++
          lineNodes.set(i, { text, node: lines[i] })
        }
      }

      samples.push({
        source,
        len: content.value.length,
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        distance,
        codeHeight: code ? code.getBoundingClientRect().height : 0,
        lineCount: code ? code.querySelectorAll('.code-line').length : 0,
      })
    }

    createApp({
      components: { StreamingMarkdown },
      setup() {
        onMounted(async () => {
          const scroller = document.querySelector('.viewport')
          const ro = new ResizeObserver(() => {
            resizeCount++
            pinToBottom('resize')
            const distance = Math.max(0, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop)
            maxPostResizeDistance = Math.max(maxPostResizeDistance, distance)
          })
          ro.observe(document.querySelector('.message'))
          const mo = new MutationObserver(() => {
            pinToBottom('mutation')
          })
          mo.observe(document.querySelector('.message'), {
            childList: true,
            subtree: true,
            characterData: true,
          })

          await nextTick()
          pinToBottom('mounted')

          let cursor = 0
          let chunkIndex = 0
          while (cursor < target.length) {
            cursor = Math.min(target.length, cursor + chunkSizes[chunkIndex % chunkSizes.length])
            chunkIndex++
            content.value = target.slice(0, cursor)
            await nextTick()
            await raf()
            collect('frame')
          }
          isStreaming.value = false
          await nextTick()
          await raf()
          pinToBottom('complete')
          ro.disconnect()
          mo.disconnect()

          window.__streamHarnessResult = {
            ok: remounts === 0 &&
              unchangedLineNodeReplacements === 0 &&
              maxPostResizeDistance <= 1 &&
              maxDistanceToBottom <= 1,
            remounts,
            unchangedLineNodeReplacements,
            maxDistanceToBottom,
            maxPostResizeDistance,
            maxCodeTopJump,
            resizeCount,
            samples: samples.slice(-24),
          }
        })
        return { content, isStreaming }
      },
      render() {
        return h('div', { class: 'viewport' }, [
          h('div', { class: 'spacer' }),
          h('div', { class: 'message' }, [
            h(StreamingMarkdown, {
              content: this.content,
              isUser: false,
              isStreaming: this.isStreaming,
            }),
          ]),
        ])
      },
    }).mount('#app')
  </script>
</body>
</html>`

await writeFile(rootHarnessPath, harnessHtml)
await writeFile(mainPath, `
const { app, BrowserWindow } = require('electron')
const { writeFileSync } = require('node:fs')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1100,
    height: 760,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })
  const logs = []
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    logs.push({ level, message, line, sourceId })
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    logs.push({ level: 'error', message: 'render-process-gone ' + JSON.stringify(details) })
  })
  try {
    await win.loadURL(process.env.HARNESS_URL)
    const result = await win.webContents.executeJavaScript(\`
      new Promise((resolve, reject) => {
        const started = performance.now()
        const timer = setInterval(() => {
          if (window.__streamHarnessResult) {
            clearInterval(timer)
            resolve(window.__streamHarnessResult)
          } else if (performance.now() - started > 15000) {
            clearInterval(timer)
            reject(new Error('stream harness timed out'))
          }
        }, 25)
      })
    \`)
    result.logs = logs
    writeFileSync(process.env.RESULT_PATH, JSON.stringify(result, null, 2))
  } catch (err) {
    writeFileSync(process.env.RESULT_PATH, JSON.stringify({
      ok: false,
      error: String(err && err.stack || err),
      logs,
    }, null, 2))
  } finally {
    await app.quit()
  }
})
`)

let server
try {
  server = await createServer({
    root,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    resolve: {
      alias: {
        '@': resolve(root, 'src/renderer'),
        '@renderer': resolve(root, 'src/renderer'),
        '@shared': resolve(root, 'src/shared'),
      },
    },
    plugins: [vue()],
  })

  await server.listen()
  const address = server.httpServer.address()
  const port = typeof address === 'object' && address ? address.port : 5173

  const child = spawn(electronPath, [mainPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HARNESS_URL: `http://127.0.0.1:${port}/.streaming-scroll-harness.html`,
      RESULT_PATH: resultPath,
    },
  })

  let stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk.toString() })
  child.stdout.pipe(process.stdout)

  const code = await new Promise(resolve => child.on('exit', resolve))
  if (code !== 0) {
    process.stderr.write(stderr)
    process.exit(code ?? 1)
  }

  const result = JSON.parse(await (await import('node:fs/promises')).readFile(resultPath, 'utf8'))
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exit(1)
} finally {
  await server?.close()
  await rm(rootHarnessPath, { force: true })
  await rm(tmp, { recursive: true, force: true })
}
