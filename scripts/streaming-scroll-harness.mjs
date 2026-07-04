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
  'Streaming should stay soft even while the response is still growing. This paragraph deliberately mixes short words, punctuation, and a little 中文文本 so the word-level reveal has real prose to animate.',
  '',
  'The second paragraph keeps pressure on markdown parsing without changing the storage or event protocol. New words should fade in near the live tail while older text stays stable and cheap to repaint.',
  '',
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
    import StepsPanel from '/src/renderer/components/chat/StepsPanel.vue'

    const target = ${JSON.stringify(streamingSource)}
    const toolArgTarget = JSON.stringify({
      file_path: '/tmp/generated-streaming-tool.ts',
      content: Array.from({ length: 180 }, (_, index) => \`export const value\${index} = \${index}\`).join('\\n'),
    })
    const editDiff = [
      '--- a/tmp/generated-streaming-tool.ts',
      '+++ b/tmp/generated-streaming-tool.ts',
      '@@ -1,4 +1,5 @@',
      '-export const value0 = 0',
      '+export const value0 = 1',
      ' export const value1 = 1',
      '+export const value2 = 2',
    ].join('\\n')
    const chunkSizes = [1, 2, 3, 8, 5, 13, 21, 4, 34, 2, 55, 7, 3, 89]
    const content = ref('')
    const isStreaming = ref(true)
    const toolSteps = ref([
      {
        id: 'tool-streaming-write',
        type: 'tool-call',
        title: 'write',
        status: 'running',
        timestamp: Date.now(),
        toolCallId: 'tool-streaming-write',
        toolCall: {
          id: 'tool-streaming-write',
          toolId: 'write',
          toolName: 'write',
          arguments: {},
          status: 'input-streaming',
          timestamp: Date.now(),
          streamingArgs: '',
        },
      },
      {
        id: 'tool-edit-confirm',
        type: 'tool-call',
        title: 'edit',
        status: 'awaiting-confirmation',
        timestamp: Date.now(),
        toolCallId: 'tool-edit-confirm',
        result: JSON.stringify({ diff: editDiff, additions: 2, deletions: 1, filePath: '/tmp/generated-streaming-tool.ts' }),
        toolCall: {
          id: 'tool-edit-confirm',
          toolId: 'edit',
          toolName: 'edit',
          arguments: { file_path: '/tmp/generated-streaming-tool.ts' },
          status: 'pending',
          timestamp: Date.now(),
          requiresConfirmation: true,
          changes: {
            diff: editDiff,
            filePath: '/tmp/generated-streaming-tool.ts',
            additions: 2,
            deletions: 1,
          },
        },
      },
    ])
    const samples = []
    const frameTimes = []
    const longTasks = []
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
    let maxStreamWordSpans = 0
    let maxCodeLineHooks = 0
    let maxDiffLineHooks = 0
    let maxToolActivityRows = 0
    let completeBefore = null
    let completeAfter = null
    let writeRowExpanded = false
    let writePreviewObserved = false
    let previousWritePreviewNode = null
    let writePreviewRemounts = 0
    let writePreviewMissingFrames = 0

    let longTaskObserver = null
    if (
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes?.includes('longtask')
    ) {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push(entry.duration)
        }
      })
      longTaskObserver.observe({ entryTypes: ['longtask'] })
    }

    function raf() {
      return new Promise(resolve => requestAnimationFrame((ts) => {
        frameTimes.push(ts)
        resolve(ts)
      }))
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

      maxStreamWordSpans = Math.max(maxStreamWordSpans, document.querySelectorAll('[data-stream-word]').length)
      maxCodeLineHooks = Math.max(maxCodeLineHooks, document.querySelectorAll('[data-code-line]').length)
      maxDiffLineHooks = Math.max(maxDiffLineHooks, document.querySelectorAll('[data-diff-line]').length)
      maxToolActivityRows = Math.max(maxToolActivityRows, document.querySelectorAll('[data-tool-activity-row]').length)
      trackWritePreview()

      samples.push({
        source,
        len: content.value.length,
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        distance,
        codeHeight: code ? code.getBoundingClientRect().height : 0,
        lineCount: code ? code.querySelectorAll('[data-code-line]').length : 0,
      })
    }

    function findWriteActivityRow() {
      const rows = Array.from(document.querySelectorAll('[data-tool-activity-row]'))
      return rows.find(row => {
        const action = row.querySelector('.node-action')?.textContent?.trim() || ''
        return action === 'Write' || action === 'Writing' || action === 'Wrote'
      }) || null
    }

    function expandWriteRowOnce() {
      if (writeRowExpanded) return
      const writeRow = findWriteActivityRow()
      if (!writeRow) return
      if (writeRow.querySelector('.diff-preview')) {
        writeRowExpanded = true
        return
      }
      const target = writeRow.querySelector('.operation-row.has-details .node-target')
        || writeRow.querySelector('.collapse-panel-header[aria-expanded="false"]')
        || writeRow.querySelector('.collapse-panel-header')
      if (!target) return
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      writeRowExpanded = true
    }

    function trackWritePreview() {
      if (!writeRowExpanded) return
      const writeRow = findWriteActivityRow()
      const preview = writeRow?.querySelector('.diff-preview') || null
      if (!preview) {
        if (writePreviewObserved) writePreviewMissingFrames++
        return
      }
      if (previousWritePreviewNode && previousWritePreviewNode !== preview) {
        writePreviewRemounts++
      }
      previousWritePreviewNode = preview
      writePreviewObserved = true
    }

    function captureCompleteState(label) {
      const scroller = document.querySelector('.viewport')
      const message = document.querySelector('.message')
      const codeLines = Array.from(document.querySelectorAll('[data-code-line]'))
      if (!scroller) return null
      return {
        label,
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        distance: Math.max(0, scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop),
        messageHeight: message ? message.getBoundingClientRect().height : 0,
        markdownSegments: document.querySelectorAll('.md-segment').length,
        streamWordSpans: document.querySelectorAll('[data-stream-word]').length,
        codeLineCount: codeLines.length,
        codeLineNodes: codeLines,
        toolRows: document.querySelectorAll('[data-tool-activity-row]').length,
      }
    }

    function countCompleteCodeLineReplacements(before, after) {
      if (!before || !after) return 0
      const count = Math.min(before.codeLineNodes.length, after.codeLineNodes.length)
      let replacements = Math.abs(before.codeLineNodes.length - after.codeLineNodes.length)
      for (let i = 0; i < count; i++) {
        if (before.codeLineNodes[i] !== after.codeLineNodes[i]) replacements++
      }
      return replacements
    }

    function updateStreamingToolArgs(cursor) {
      const nextArgs = toolArgTarget.slice(0, Math.min(toolArgTarget.length, cursor * 18))
      const current = toolSteps.value[0]
      toolSteps.value = [
        {
          ...current,
          toolCall: {
            ...current.toolCall,
            streamingArgs: nextArgs,
          },
        },
        toolSteps.value[1],
      ]
    }

    function finalizeStreamingWriteArgs() {
      const current = toolSteps.value[0]
      toolSteps.value = [
        {
          ...current,
          status: 'running',
          toolCall: {
            ...current.toolCall,
            status: 'executing',
            arguments: JSON.parse(toolArgTarget),
            streamingArgs: undefined,
          },
        },
        toolSteps.value[1],
      ]
    }

    function percentile(values, p) {
      if (values.length === 0) return 0
      const sorted = [...values].sort((a, b) => a - b)
      return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]
    }

    createApp({
      components: { StreamingMarkdown, StepsPanel },
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
            updateStreamingToolArgs(cursor)
            await nextTick()
            expandWriteRowOnce()
            await raf()
            collect('frame')
          }
          for (let i = 0; i < 90; i++) {
            await nextTick()
            await raf()
            pinToBottom('pre-complete-drain')
            if (document.body.textContent.includes('asyncio.run(main())')) break
          }
          finalizeStreamingWriteArgs()
          await nextTick()
          await raf()
          pinToBottom('write-finalized-args')
          longTasks.length = 0
          completeBefore = captureCompleteState('before-complete')
          isStreaming.value = false
          for (let i = 0; i < 3; i++) {
            await nextTick()
            await raf()
            pinToBottom('complete-settle-frame')
          }
          completeAfter = captureCompleteState('after-complete')
          for (let i = 0; i < 90; i++) {
            await nextTick()
            await raf()
            pinToBottom('settle')
            const finalLineVisible = document.body.textContent.includes('asyncio.run(main())')
            const writeArgsSettled = !toolSteps.value[0].toolCall.streamingArgs ||
              toolSteps.value[0].toolCall.streamingArgs.length === toolArgTarget.length
            if (finalLineVisible && writeArgsSettled) break
          }
          pinToBottom('complete')
          ro.disconnect()
          mo.disconnect()
          longTaskObserver?.disconnect()

          const frameGaps = []
          for (let i = 1; i < frameTimes.length; i++) {
            frameGaps.push(frameTimes[i] - frameTimes[i - 1])
          }
          const p95RafGap = percentile(frameGaps, 0.95)
          const maxLongTaskMs = longTasks.length > 0 ? Math.max(...longTasks) : 0
          const completeCodeLineReplacements = countCompleteCodeLineReplacements(completeBefore, completeAfter)
          const completeMarkdownSegmentDelta = completeBefore && completeAfter
            ? Math.abs(completeBefore.markdownSegments - completeAfter.markdownSegments)
            : 0
          const completeToolRowDelta = completeBefore && completeAfter
            ? Math.abs(completeBefore.toolRows - completeAfter.toolRows)
            : 0
          const completeStreamWordDelta = completeBefore && completeAfter
            ? Math.abs(completeBefore.streamWordSpans - completeAfter.streamWordSpans)
            : 0
          const completeDistanceDelta = completeBefore && completeAfter
            ? Math.abs(completeBefore.distance - completeAfter.distance)
            : 0
          const completeMessageHeightDelta = completeBefore && completeAfter
            ? Math.abs(completeBefore.messageHeight - completeAfter.messageHeight)
            : 0

          window.__streamHarnessResult = {
            ok: remounts === 0 &&
              unchangedLineNodeReplacements === 0 &&
              completeCodeLineReplacements === 0 &&
              completeMarkdownSegmentDelta === 0 &&
            completeToolRowDelta === 0 &&
              completeStreamWordDelta === 0 &&
              completeDistanceDelta <= 1 &&
              completeMessageHeightDelta <= 1 &&
              maxPostResizeDistance <= 1 &&
              maxDistanceToBottom <= 1 &&
              maxLongTaskMs <= 50 &&
              p95RafGap <= 34 &&
              writeRowExpanded &&
              writePreviewObserved &&
              writePreviewRemounts === 0 &&
              writePreviewMissingFrames === 0 &&
              maxStreamWordSpans > 0 &&
              maxCodeLineHooks > 0 &&
              maxDiffLineHooks > 0 &&
              maxToolActivityRows >= 2,
            remounts,
            unchangedLineNodeReplacements,
            maxDistanceToBottom,
            maxPostResizeDistance,
            maxCodeTopJump,
            resizeCount,
            p95RafGap,
            maxLongTaskMs,
            completeCodeLineReplacements,
            completeMarkdownSegmentDelta,
            completeToolRowDelta,
            completeStreamWordDelta,
            completeDistanceDelta,
            completeMessageHeightDelta,
            writeRowExpanded,
            writePreviewObserved,
            writePreviewRemounts,
            writePreviewMissingFrames,
            maxStreamWordSpans,
            maxCodeLineHooks,
            maxDiffLineHooks,
            maxToolActivityRows,
            samples: samples.slice(-24),
          }
        })
        return { content, isStreaming, toolSteps }
      },
      render() {
        return h('div', { class: 'viewport' }, [
          h('div', { class: 'spacer' }),
          h('div', { class: 'message' }, [
            h(StepsPanel, {
              steps: this.toolSteps,
              onConfirm: () => {},
              onReject: () => {},
              onOpenFile: () => {},
            }),
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
        '@onething/core': resolve(root, 'packages/core'),
        '@onething/runtime': resolve(root, 'packages/onething-runtime/src'),
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
