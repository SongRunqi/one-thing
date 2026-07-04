import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

export const isDarwin = process.platform === 'darwin'

function outputOf(result) {
  return `${result.stdout || ''}${result.stderr || ''}`.trim()
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    ...options,
  })

  if (options.allowFailure || result.status === 0) return result

  const output = outputOf(result)
  throw new Error(`${command} ${args.join(' ')} failed${output ? `\n${output}` : ''}`)
}

function clearExtendedAttributes(targetPath) {
  run('xattr', ['-cr', targetPath], { allowFailure: true })
}

function removeSignature(targetPath) {
  run('codesign', ['--remove-signature', targetPath], { allowFailure: true })
}

function verifySignature(targetPath, deep = true) {
  const args = ['--verify']
  if (deep) args.push('--deep')
  args.push('--strict', targetPath)
  return run('codesign', args, { allowFailure: true })
}

function signingDetails(targetPath) {
  return outputOf(run('codesign', ['-dvvv', targetPath], { allowFailure: true }))
}

function xattrs(targetPath) {
  return outputOf(run('xattr', [targetPath], { allowFailure: true }))
}

export function needsCleanAdhocSignature(targetPath) {
  if (!isDarwin || !existsSync(targetPath)) return false

  if (verifySignature(targetPath).status !== 0) return true

  const details = signingDetails(targetPath)
  if (details.includes('linker-signed')) return true

  return /(^|\n)com\.apple\.quarantine(\n|$)/.test(xattrs(targetPath))
}

export function ensureCleanAdhocSignature(targetPath) {
  if (!isDarwin || !existsSync(targetPath)) return { signed: false, reason: 'skipped' }
  if (!needsCleanAdhocSignature(targetPath)) return { signed: false, reason: 'already-valid' }

  clearExtendedAttributes(targetPath)
  removeSignature(targetPath)
  run('codesign', ['--force', '--sign', '-', targetPath])
  run('codesign', ['--verify', '--deep', '--strict', targetPath])
  return { signed: true, reason: 're-signed' }
}

export function needsAppBundleSignature(appPath) {
  if (!isDarwin || !existsSync(appPath)) return false
  if (verifySignature(appPath).status !== 0) return true
  return signingDetails(appPath).includes('linker-signed')
}

export function ensureAppBundleSignature(appPath) {
  if (!isDarwin || !existsSync(appPath)) return { signed: false, reason: 'skipped' }
  if (!needsAppBundleSignature(appPath)) return { signed: false, reason: 'already-valid' }

  clearExtendedAttributes(appPath)
  run('codesign', ['--force', '--deep', '--sign', '-', appPath])
  run('codesign', ['--verify', '--deep', '--strict', appPath])
  return { signed: true, reason: 're-signed' }
}
