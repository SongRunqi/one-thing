import { describe, expect, it } from 'vitest'
import {
  buildOnethingRipgrepFileListArgs,
  buildOnethingRipgrepSearchArgs,
  getOnethingRipgrepPlatformConfig,
  parseOnethingRipgrepSearchOutput,
} from '../ripgrep.js'

describe('runtime ripgrep helpers', () => {
  it('builds file listing args with hidden files and git excluded by default', () => {
    expect(buildOnethingRipgrepFileListArgs({ glob: ['*.ts'], noIgnore: true })).toEqual([
      '--files',
      '--follow',
      '--hidden',
      '--no-ignore',
      '--glob=!.git/*',
      '--glob=*.ts',
    ])

    expect(buildOnethingRipgrepFileListArgs({ hidden: false })).toEqual([
      '--files',
      '--follow',
      '--glob=!.git/*',
    ])
  })

  it('builds search args and preserves literal glob order', () => {
    expect(buildOnethingRipgrepSearchArgs({
      cwd: '/repo',
      pattern: 'hello|world',
      glob: ['*.ts', '!dist/*'],
      maxCount: 5,
      ignoreCase: true,
      literal: true,
    })).toEqual([
      '-n',
      '-H',
      '--color=never',
      '--hidden',
      '--field-match-separator=|',
      '--ignore-case',
      '--fixed-strings',
      '--glob',
      '*.ts',
      '--glob',
      '!dist/*',
      '--max-count',
      '5',
      '--regexp',
      'hello|world',
      '/repo',
    ])
  })

  it('parses ripgrep search output with separators in matched text', () => {
    expect(parseOnethingRipgrepSearchOutput([
      'src/a.ts|12|hello|world',
      'src/b.ts|3|plain',
      'bad-line',
      '',
    ].join('\n'))).toEqual([
      { path: 'src/a.ts', lineNumber: 12, lineText: 'hello|world' },
      { path: 'src/b.ts', lineNumber: 3, lineText: 'plain' },
    ])
  })

  it('exposes supported platform metadata', () => {
    expect(getOnethingRipgrepPlatformConfig('x64-linux')).toEqual({
      platform: 'x86_64-unknown-linux-musl',
      extension: 'tar.gz',
    })
    expect(getOnethingRipgrepPlatformConfig('mips-plan9')).toBeUndefined()
  })
})
