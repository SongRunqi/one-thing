import { execSync } from 'child_process'

try {
  console.log('Building Electron main process...')
  execSync('npx tsc -p tsconfig.electron.json', {
    stdio: 'inherit',
  })
  console.log('✓ Main process built successfully')
} catch (error) {
  console.error('✗ Failed to build main process:', error.message)
  process.exit(1)
}
