import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

const buildOptions = {
  entryPoints: ['src/preload/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/preload/index.js',
  format: 'cjs',
  external: ['electron'],
  sourcemap: true,
}

if (watch) {
  const ctx = await esbuild.context(buildOptions)
  await ctx.watch()
  console.log('Watching preload for changes...')
} else {
  await esbuild.build(buildOptions)
  console.log('Preload build complete')
}
