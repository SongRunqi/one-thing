#!/usr/bin/env node
/**
 * 收版:把开发工作树(dev-self 分支)已提交的活合并进主工作树。
 *
 * 自举回路的最后一步。仪式感只有这一条命令 —— 主实例(A)若以 dev 模式在跑,
 * electron-vite 监听着主树文件,合并落盘即自动重建 + 自动重启,**不需要手动停/起**。
 *
 * 守卫:
 *  - 只允许在主工作树跑(dev 工作树里收版没有意义,方向反了);
 *  - 合并会动到的文件若与你未提交的改动冲突,git 会自己拒绝并说明,工作区不会被弄脏;
 *  - 无事可合时如实说,不制造空 merge。
 */
import { execFileSync } from 'node:child_process'

const DEV_BRANCH = 'dev-self'

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

const topLevel = git('rev-parse', '--show-toplevel')
const gitDir = git('rev-parse', '--git-dir')
// worktree 的 git-dir 形如 <主仓>/.git/worktrees/<name>;主工作树的就是 <主仓>/.git。
if (/\/worktrees\//.test(gitDir)) {
  console.error(`[self-pull] 这里是开发工作树(${topLevel})。收版要在主工作树里跑 —— 方向是 dev → 主。`)
  process.exit(1)
}

let range
try {
  range = git('rev-list', '--count', `HEAD..${DEV_BRANCH}`)
} catch {
  console.error(`[self-pull] 找不到分支 ${DEV_BRANCH}。先建开发工作树:git worktree add ../start-electron-dev -b ${DEV_BRANCH}`)
  process.exit(1)
}

if (range === '0') {
  console.log(`[self-pull] ${DEV_BRANCH} 上没有新提交,无事可收。`)
  process.exit(0)
}

console.log(`[self-pull] ${DEV_BRANCH} 领先 ${range} 个提交:`)
console.log(git('log', '--oneline', `HEAD..${DEV_BRANCH}`))

try {
  execFileSync('git', ['merge', DEV_BRANCH, '--no-edit'], { stdio: 'inherit' })
} catch {
  console.error('[self-pull] 合并未完成(冲突或会覆盖你未提交的改动,git 的说明在上面)。工作区没有被弄脏;处理后重跑即可。')
  process.exit(1)
}

console.log('[self-pull] 已收版。主实例若在 dev 模式运行,electron-vite 会自动重建并重启 —— 不用手动停/起。')
