#!/usr/bin/env node
// UI style checker — the enforcement half of docs/design/ui-system.md.
//
// 十条行级规则,扫 packages/renderer,输出 `[ui] failed: <相对路径>:<行号> <规则名>`。
// 刻意只做行级正则 + 极轻量的分区/选择器跟踪,不做 CSS/AST 解析:方案 §4 的判断是
// 维护成本必须低到没人想绕开它。误报走文件级白名单注释 `/* ui-gate-allow: <rule> */`
// (也认 `// ui-gate-allow:` 和 `<!-- ui-gate-allow: -->`;多条用逗号分隔,`all` 全放)。
//
// 单独跑 `bun run ui:check` 看全量;`bun run ui:gate` 只对基线之外的新增报错。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scanRoot = path.join(root, 'packages/renderer')

const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__', '__snapshots__', '.git'])
const EXTENSIONS = new Set(['.vue', '.css', '.ts'])

// 原语层:浮层机制的合法住址。业务组件要浮层得走这里,而不是自己 Teleport。
// (P1 之后这份名单会缩到 useFloatingLayer 一处。)
const TELEPORT_PRIMITIVES = new Set([
  // 原语层(P1 起 Popover 是唯一的浮层机制;ContextMenu 已是 Dropdown 的薄包装,
  // 自己不再 teleport,留在表里只是为了它万一又长出来时仍是合法的原语位置)。
  'components/common/Popover.vue',
  'components/common/Dropdown.vue',
  'components/common/ContextMenu.vue',
  // P2:模态壳。Dialog 不是锚定浮层(它自己居中,没有定位内核可继承),
  // 但 Teleport/遮罩/--z-modal/Esc/焦点同样归它,所以它也是原语位置。
  'components/common/Dialog.vue',
  'components/common/Tooltip.vue',
  'components/common/Select.vue',
  // P5:Mention 接了同一个定位内核(useFloatingLayer),Teleport 是内核要求的
  // `position: fixed` 模式的一半 —— 与 Select 同一条理由,同一个位置。
  'components/common/Mention.vue',
  'components/common/ImagePreview.vue',
  'components/common/Table.vue',
])

/**
 * `title` 在这些组件上是**属性名恰好叫 title 的 prop**(Dialog 的标题栏文案),
 * 不是原生 tooltip —— 规则要放它们过去,否则 P2 之后每个迁走的对话框都会被
 * 自己的标题绊倒。名单刻意只列确认过的组件:`<Button :title>` 这类会透传成
 * 原生 title 的,仍然该被抓。
 */
const TITLE_PROP_COMPONENTS = new Set(['Dialog'])

/**
 * zones: 规则只在它讲得通的分区里跑。
 *  - template:.vue 的 <template>
 *  - script:  .vue 的 <script> + 整个 .ts
 *  - style:   .vue 的 <style> + 整个 .css + .ts(CSS-in-JS 字符串)
 */
const RULES = [
  {
    name: 'z-literal',
    zones: ['style', 'script'],
    // ≥10 的字面层级。局部堆叠(个位数)不管 —— 卡片内角标不该被这条挡住。
    test: line =>
      /z-index:\s*\d{2,}/.test(line) || /\bzIndex\s*:\s*['"`]?\d{2,}/.test(line),
  },
  {
    name: 'z-fallback',
    zones: ['style', 'script'],
    // `var(--z-dropdown, 1000)` 的真值是 100 —— fallback 漂移是实测事故源,
    // 而 variables.css 全局加载,fallback 本就没有存在意义。
    test: line => /var\(\s*--z-[a-z-]+\s*,/.test(line),
  },
  {
    name: 'raw-teleport',
    zones: ['template'],
    // 只抓 to="body"。Teleport 到自定义容器(MessageList/ChatPanel 那类)是布局手段,不是浮层机制。
    test: (line, ctx) => /<Teleport\s+to="body"/.test(line) && !TELEPORT_PRIMITIVES.has(ctx.rel),
  },
  {
    name: 'native-select',
    zones: ['template'],
    // \b 而不是 [\s>]:属性通常换行写,`<select` 常常就是整行的结尾。
    test: line => /<select\b/.test(line),
  },
  {
    name: 'native-confirm',
    zones: ['script'],
    test: (line, ctx) =>
      /(^|[^.\w])(confirm|alert)\s*\(/.test(line) &&
      // 自己定义的同名函数不算调用原生的(RejectReasonDialog 就有一个 function confirm())。
      !/\b(function|const|let|var|async)\s+(confirm|alert)\b/.test(line) &&
      // P2 的替代品就叫 confirm()/notice() —— 引了服务的文件里,`await confirm({…})`
      // 是治愈后的样子,不是病灶。判据卡在 import 上而不是 `await` 之类的措辞上:
      // 一个文件要么用服务,要么用原生,不会两者混着来。
      !ctx.usesConfirmService &&
      !line.trimStart().startsWith('//') &&
      !line.trimStart().startsWith('*'),
  },
  {
    name: 'title-attr',
    zones: ['template'],
    test: (line, ctx) =>
      /\s:?title="/.test(line) &&
      // 语义场景放行:img/abbr 的 title 是无障碍属性,<title> 是 SVG/文档标题,
      // iframe 的 title 是它的**可及名**(嵌套浏览上下文没有别的命名途径,
      // 换成 Tooltip 反而会让屏幕阅读器读到一个无名 frame)。
      // 同时看行内和 ctx.tag —— 属性换行写时 `<img` 不在同一行,只看行内会漏。
      !/<(img|abbr|svg|title|iframe)\b/.test(line) &&
      !['img', 'abbr', 'svg', 'title', 'iframe'].includes(ctx.tag) &&
      // `<slot :title="title">` 是作用域插槽的 prop —— <slot> 不渲染元素,
      // 它身上的 title 永远到不了 DOM,不可能是原生 tooltip。
      // (P5 实测:CollapseGroup/CollapsePanel 的 4 处误报全是这一种。)
      ctx.tag !== 'slot' &&
      !TITLE_PROP_COMPONENTS.has(ctx.tag) &&
      !/document\.title/.test(line),
  },
  {
    name: 'ui-hex-fallback',
    zones: ['style', 'script'],
    // dark 主题下 token 缺失即爆白 —— fallback 只能是另一个变量,不能是颜色字面量。
    test: line => /var\(\s*--ui-[^,)]+,\s*(#|rgba?\()/.test(line),
  },
  {
    name: 'transition-literal',
    zones: ['style', 'script'],
    test: line => {
      // 注释里提到时长不是违规("expand transition (~160ms)" 那类旁注被抓过)。
      const trimmed = line.trimStart()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false
      if (!/\btransition\b[^;]*?\d+(\.\d+)?m?s/.test(line)) return false
      if (/var\(\s*--duration/.test(line)) return false
      // `transition-duration: 0s` 是"关掉过渡",不是一档时长 —— 没有档位可归,
      // 归了反而把 reduced-motion 分支写坏。只有非零时长才算债。
      return [...line.matchAll(/(\d*\.?\d+)(ms|s)\b/g)].some(m => Number(m[1]) !== 0)
    },
  },
  {
    name: 'shadow-literal-floating',
    zones: ['style'],
    // 只管浮层类选择器里的字面阴影;存量 121 种字面值分期消,不在这条的射程内。
    test: (line, ctx) =>
      /box-shadow:/.test(line) &&
      !/var\(\s*--/.test(line) &&
      !/box-shadow:\s*(none|inset)/.test(line) &&
      /(popover|dropdown|menu|dialog|tooltip|flyout|popup|modal)/i.test(ctx.selector),
  },
  {
    name: 'focus-bare',
    zones: ['style'],
    test: line =>
      /:focus(?![-\w])/.test(line) &&
      /[{,]/.test(line) &&
      // `:focus:not(:focus-visible) { outline: none }` 是**关掉鼠标点击焦点环**的
      // 标准写法 —— 它正是这条规则想要的结果,不是病灶。判据卡在这个完整组合上,
      // 不是"行里出现过 focus-visible"。
      !/:focus:not\(\s*:focus-visible\s*\)/.test(line) &&
      // 输入框 caret 场景:裸 :focus 是对的(:focus-visible 在键入时不触发)。
      // 白名单卡在**元素选择器**上,不是"行里出现过 input 这几个字":
      // `.model-select-btn:focus` 不是输入框,放它过去等于把这条规则废掉。
      // 引号也算合法前导:CSS-in-JS 里选择器是字符串键(`'input.x:focus': {`),
      // 少了这三个字符,editor/ 下写对了元素选择器的规则照样报红。
      !/(^|[\s,>+~('"`])(input|textarea|select)\b/i.test(line) &&
      !/(contenteditable|caret)/i.test(line),
  },
]

const RULES_BY_NAME = new Map(RULES.map(rule => [rule.name, rule]))

function collectFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) collectFiles(full, out)
    else if (EXTENSIONS.has(path.extname(entry))) out.push(full)
  }
  return out
}

function allowedRules(text) {
  const allowed = new Set()
  for (const match of text.matchAll(/ui-gate-allow:([^\n]*)/gi)) {
    for (const chunk of match[1].split(',')) {
      // 只取每段开头的规则名 token —— 注释结束符(`-->`、`*/`)会黏在最后一段上,
      // 整段 trim 出来的 "native-select --" 跟规则名对不上,那条白名单就等于没写。
      const name = /^[a-z][a-z0-9-]*/.exec(chunk.trim())?.[0]
      if (name) allowed.add(name)
    }
  }
  return allowed
}

/** .vue 分区跟踪:顶层 <template>/<script>/<style> 的粗切,够用就行。 */
function zoneTracker(ext) {
  if (ext === '.css') return () => 'style'
  // .ts 同时是脚本和样式来源(editor/ 下有 CSS-in-JS)。
  if (ext === '.ts') return () => 'script+style'
  let zone = ''
  // 必须锚在第 0 列:SFC 顶层块总在行首,而 `<template #header>` 具名插槽是缩进的。
  // 早先允许缩进时,第一个插槽的 `</template>` 就把 zone 清空了,后面整片模板漏扫。
  return line => {
    const open = /^<(template|script|style)[\s>]/.exec(line)
    if (open) {
      zone = open[1]
      return zone
    }
    if (/^<\/(template|script|style)>/.test(line)) {
      const closing = zone
      zone = ''
      return closing
    }
    return zone
  }
}

function zoneMatches(ruleZones, zone) {
  if (!zone) return false
  return ruleZones.some(z => zone === z || zone.split('+').includes(z))
}

const failures = []

for (const file of collectFiles(scanRoot).sort()) {
  const rel = path.relative(scanRoot, file)
  const text = readFileSync(file, 'utf8')
  const allowed = allowedRules(text)
  if (allowed.has('all')) continue

  const ext = path.extname(file)
  const nextZone = zoneTracker(ext)
  // 服务本体与它的宿主也算"用服务的文件"。
  const usesConfirmService = /composables\/useConfirm/.test(text)
    || rel === 'composables/useConfirm.ts'
  let selector = ''
  // 最近一个开标签名,只为 title-attr 分辨"prop 还是原生属性"服务。
  let tag = ''

  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const zone = nextZone(line)

    // 选择器跟踪:最近一次开花括号左边的东西。shadow-literal-floating 只靠它判断"是不是浮层"。
    // 取"含 `{`"而不是"以 `{` 结尾" —— 单行规则块 `.x-menu { box-shadow: … }` 也得认出来。
    const trimmed = line.trim()
    if (trimmed.includes('{') && !trimmed.startsWith('@')) {
      selector = trimmed.slice(0, trimmed.indexOf('{')).trim()
    }

    if (zone === 'template') {
      const openTag = /<([A-Za-z][\w.-]*)/.exec(line)
      if (openTag) tag = openTag[1]
    }

    const ctx = { rel, selector, line: i + 1, usesConfirmService, tag }
    for (const rule of RULES) {
      if (allowed.has(rule.name)) continue
      if (!zoneMatches(rule.zones, zone)) continue
      if (rule.test(line, ctx)) failures.push(`[ui] failed: ${rel}:${i + 1} ${rule.name}`)
    }

    if (trimmed.includes('}')) selector = ''
  }
}

for (const failure of failures) console.log(failure)

const byRule = new Map()
for (const failure of failures) {
  const rule = failure.slice(failure.lastIndexOf(' ') + 1)
  byRule.set(rule, (byRule.get(rule) ?? 0) + 1)
}

console.log('')
console.log(`[ui] ${failures.length} violation(s) across ${RULES.length} rules:`)
for (const rule of RULES) console.log(`  ${rule.name}: ${byRule.get(rule.name) ?? 0}`)
if (RULES_BY_NAME.size !== RULES.length) throw new Error('duplicate rule name')

process.exit(failures.length > 0 ? 1 : 0)
