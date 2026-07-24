// P0 round-trip fidelity audit for the render-first note editor.
// Usage: bun scripts/markdown-roundtrip-audit.ts [extra-dirs...]
// Parses every markdown file through the ProseMirror note schema and
// serializes it back, measuring how much a "open → edit → save" cycle would
// rewrite untouched content. See docs/design/note-editor-prosemirror-midterm.md §P0.
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { parseNoteMarkdown, serializeNoteMarkdown } from '../packages/renderer/editor/prose/markdown-io'

const HOME = homedir()
const corpora: Array<{ name: string, dir: string }> = [
  { name: 'todo-plan(共写核心)', dir: join(HOME, '.onething/todo-plan') },
  { name: 'notes', dir: join(HOME, '.onething/notes') },
  { name: 'memory(agent 写)', dir: join(HOME, '.onething/memory') },
  { name: 'repo-docs(压力)', dir: join(process.cwd(), 'docs') },
]
for (const extra of process.argv.slice(2)) corpora.push({ name: extra, dir: extra })

function* walk(dir: string): Generator<string> {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return }
  for (const entry of entries) {
    const full = join(dir, entry)
    const stats = statSync(full)
    if (stats.isDirectory()) yield* walk(full)
    else if (entry.endsWith('.md')) yield full
  }
}

interface FileResult {
  file: string
  corpus: string
  status: 'identical' | 'changed' | 'parse-error'
  changedLines: number
  totalLines: number
  idempotent: boolean
  categories: string[]
  diff?: string
  error?: string
}

function classify(diff: string): string[] {
  const categories = new Set<string>()
  const removed = diff.split('\n').filter(line => line.startsWith('-') && !line.startsWith('---'))
  const added = diff.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'))
  const removedText = removed.join('\n')
  const addedText = added.join('\n')
  if (/^-\s*[*+]\s/m.test(removedText) && /^\+\s*-\s/m.test(addedText)) categories.add('列表符号统一为-')
  if (/\\[[\]*_`#|~]/.test(addedText)) categories.add('新增转义')
  if (/^-.*\s+$/m.test(removedText)) categories.add('尾随空白删除')
  if (/^-\s*$/m.test(removedText) || /^\+\s*$/m.test(addedText)) categories.add('空行数变化')
  if (/:---|---:/.test(removedText)) categories.add('表格对齐丢失')
  if (/^-\s*={3,}\s*$|^-\s*-{3,}\s*$/m.test(removedText) && /^\+#/m.test(addedText)) categories.add('setext标题转ATX')
  if (/^-\s{1,3}\S/m.test(removedText) && /^\+\s{2,}/m.test(addedText)) categories.add('列表缩进变化')
  if (/_[^_]+_/.test(removedText) && /\*[^*]+\*/.test(addedText)) categories.add('强调符号_→*')
  if (/^\+\\$/m.test(addedText) || /\\$/m.test(addedText)) categories.add('硬换行反斜杠')
  if (/^-#{1,6}[^ #]/m.test(removedText)) categories.add('ATX后补空格')
  if (/^-\s*\d+\)/m.test(removedText)) categories.add('有序列表)转.')
  if (categories.size === 0) categories.add('其它')
  return [...categories]
}

const results: FileResult[] = []
const tmp = join(tmpdir(), `md-audit-${Date.now()}`)
mkdirSync(tmp, { recursive: true })

for (const corpus of corpora) {
  for (const file of walk(corpus.dir)) {
    const original = readFileSync(file, 'utf8')
    const normalizedOriginal = original.replace(/\n+$/, '') + '\n'
    let result: FileResult
    try {
      const once = serializeNoteMarkdown(parseNoteMarkdown(original)).replace(/\n+$/, '') + '\n'
      const twice = serializeNoteMarkdown(parseNoteMarkdown(once)).replace(/\n+$/, '') + '\n'
      const idempotent = once === twice
      if (once === normalizedOriginal) {
        result = {
          file, corpus: corpus.name, status: 'identical', changedLines: 0,
          totalLines: normalizedOriginal.split('\n').length, idempotent, categories: [],
        }
      } else {
        const aPath = join(tmp, 'a.md')
        const bPath = join(tmp, 'b.md')
        writeFileSync(aPath, normalizedOriginal)
        writeFileSync(bPath, once)
        let diff = ''
        try {
          execFileSync('diff', ['-u', aPath, bPath], { encoding: 'utf8' })
        } catch (error) {
          diff = (error as { stdout?: string }).stdout || ''
        }
        const changedLines = diff.split('\n').filter(line => /^[-+][^-+]/.test(line) || line === '-' || line === '+').length
        result = {
          file, corpus: corpus.name, status: 'changed', changedLines,
          totalLines: normalizedOriginal.split('\n').length, idempotent,
          categories: classify(diff),
          diff: diff.split('\n').slice(0, 60).join('\n'),
        }
      }
    } catch (error) {
      result = {
        file, corpus: corpus.name, status: 'parse-error', changedLines: 0,
        totalLines: 0, idempotent: false, categories: ['解析失败'],
        error: String(error).slice(0, 300),
      }
    }
    results.push(result)
  }
}

// ---------------------------------------------------------------------------
const byCorpus = new Map<string, FileResult[]>()
for (const result of results) {
  const list = byCorpus.get(result.corpus) || []
  list.push(result)
  byCorpus.set(result.corpus, list)
}

const lines: string[] = []
lines.push(`# markdown 往返保真审计  ${new Date().toISOString().slice(0, 10)}`)
lines.push('')
for (const [corpus, files] of byCorpus) {
  const identical = files.filter(f => f.status === 'identical').length
  const errors = files.filter(f => f.status === 'parse-error')
  const changed = files.filter(f => f.status === 'changed')
  const nonIdempotent = files.filter(f => f.status !== 'parse-error' && !f.idempotent)
  const totalChanged = changed.reduce((sum, f) => sum + f.changedLines, 0)
  const totalLines = files.reduce((sum, f) => sum + f.totalLines, 0)
  lines.push(`## ${corpus}: ${files.length} 文件`)
  lines.push(`- 字节级一致: ${identical}/${files.length}`)
  lines.push(`- 有变化: ${changed.length}(变更 ${totalChanged} 行 / 共 ${totalLines} 行 = ${(totalChanged / Math.max(1, totalLines) * 100).toFixed(1)}%)`)
  lines.push(`- 解析失败: ${errors.length}`)
  lines.push(`- 非幂等(二次序列化仍变): ${nonIdempotent.length}`)
  const tally = new Map<string, number>()
  for (const file of changed) for (const category of file.categories) tally.set(category, (tally.get(category) || 0) + 1)
  if (tally.size) lines.push(`- 类别: ${[...tally.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(', ')}`)
  lines.push('')
}

lines.push('## 变更最大的文件(前 10)')
for (const file of [...results].filter(f => f.status === 'changed').sort((a, b) => b.changedLines - a.changedLines).slice(0, 10)) {
  lines.push(`### ${relative(HOME, file.file)} — ${file.changedLines}/${file.totalLines} 行 [${file.categories.join(',')}]${file.idempotent ? '' : ' ⚠️非幂等'}`)
  lines.push('```diff')
  lines.push(file.diff || '')
  lines.push('```')
}
lines.push('## 解析失败')
for (const file of results.filter(f => f.status === 'parse-error')) {
  lines.push(`- ${relative(HOME, file.file)}: ${file.error}`)
}

const outPath = process.env.AUDIT_OUT || join(tmp, 'report.md')
writeFileSync(outPath, lines.join('\n'))
console.log(lines.slice(0, 40).join('\n'))
console.log(`\n[full report] ${outPath}`)
