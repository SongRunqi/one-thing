import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const appDir = '/Users/yitiansong/data/code/start-electron'
const brainDir = '/Users/yitiansong/.gemini/antigravity/brain/3582ed95-c32a-4531-81ba-efe26abf75fd'

const appVuePath = path.join(appDir, 'src/renderer/App.vue')
const mainIndexPath = path.join(appDir, 'src/main/index.ts')

// Backup original files
const appVueBackup = fs.readFileSync(appVuePath, 'utf8')
const mainIndexBackup = fs.readFileSync(mainIndexPath, 'utf8')

const panels = [
  { name: 'media', filename: 'media__1780936103063.png' },
  { name: 'memory', filename: 'media__1780936108870.png' },
  { name: 'agents', filename: 'media__1780936114825.png' },
  { name: 'tasks', filename: 'media__1780936119846.png' }
]

try {
  for (const panel of panels) {
    console.log(`[Screenshot] Preparing capture for panel: ${panel.name}...`)

    // 1. Modify App.vue to open the panel by default
    const modifiedAppVue = appVueBackup.replace(
      /const activeWorkspacePanel = ref<WorkspacePanel \| null>\(null\)/,
      `const activeWorkspacePanel = ref<WorkspacePanel | null>('${panel.name}')`
    )
    fs.writeFileSync(appVuePath, modifiedAppVue, 'utf8')

    // 2. Modify src/main/index.ts to inject the capturePage logic
    const outputPath = path.join(brainDir, panel.filename)
    const screenshotHook = `
  mainWindow = createWindow()
  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        console.log('[Screenshot] Capturing page for ${panel.name}...')
        const image = await mainWindow.webContents.capturePage()
        const fs = await import('fs')
        fs.writeFileSync('${outputPath}', image.toPNG())
        // Also save to generic screenshot_result.png for verification
        fs.writeFileSync('${path.join(brainDir, 'screenshot_result.png')}', image.toPNG())
        console.log('[Screenshot] Saved successfully to ${panel.filename}')
        app.quit()
      } catch (err) {
        console.error('[Screenshot] Error:', err)
        app.quit()
      }
    }, 4500)
  })
`
    const modifiedMainIndex = mainIndexBackup.replace(
      /mainWindow = createWindow\(\)\s+attachVoiceTrayMainWindow\(mainWindow\)/,
      `attachVoiceTrayMainWindow(mainWindow)`
    ).replace(
      /attachVoiceTrayMainWindow\(mainWindow\)/,
      screenshotHook + '\n  attachVoiceTrayMainWindow(mainWindow)'
    )
    
    fs.writeFileSync(mainIndexPath, modifiedMainIndex, 'utf8')

    // 3. Run electron dev
    console.log(`[Screenshot] Launching Electron app for ${panel.name}...`)
    try {
      execSync('bun run dev', { cwd: appDir, stdio: 'inherit' })
    } catch (runErr) {
      console.log(`[Screenshot] App closed/exited.`)
    }
  }
} finally {
  // Restore original files
  console.log('[Screenshot] Restoring original files...')
  fs.writeFileSync(appVuePath, appVueBackup, 'utf8')
  fs.writeFileSync(mainIndexPath, mainIndexBackup, 'utf8')
  console.log('[Screenshot] Files successfully restored.')
}
