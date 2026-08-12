import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDefaultSettings } from '@shared/defaults/settings.js'
import { createDefaultVariablesFile } from '@onething/runtime/variables/schema'
import { resetVariablesStoreForTests } from '../../variables/store/index.js'
import { updateSettingsInMemory } from '../../stores/settings.js'
import { resolveMarkdownAsset, saveMarkdownAttachments } from '../asset-service.js'

const tempRoots: string[] = []

async function makeTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-assets-'))
  tempRoots.push(root)
  return root
}

function configureEditor(editor: Partial<ReturnType<typeof createDefaultSettings>['general']['editor']> = {}): void {
  const settings = createDefaultSettings()
  settings.general.editor = {
    ...settings.general.editor,
    ...editor,
  }
  updateSettingsInMemory(settings)
}

function fileInput(fileName: string, mimeType = 'image/png') {
  return {
    fileName,
    mimeType,
    base64Data: Buffer.from(`${fileName}:${mimeType}`).toString('base64'),
  }
}

beforeEach(() => {
  configureEditor()
  const store = resetVariablesStoreForTests()
  store.hydrateForTests({
    ...createDefaultVariablesFile(),
    user_note_dir: '',
    work_note_dir: '',
  })
})

afterEach(async () => {
  configureEditor()
  resetVariablesStoreForTests()
  await Promise.all(tempRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

describe('Markdown asset service', () => {
  it('resolves Obsidian attachment images from the configured attachment folder', async () => {
    const vault = await makeTempRoot()
    const notePath = path.join(vault, 'notes', 'today.md')
    const imagePath = path.join(vault, 'attachments', 'image.png')
    await fs.mkdir(path.dirname(notePath), { recursive: true })
    await fs.mkdir(path.join(vault, '.obsidian'), { recursive: true })
    await fs.mkdir(path.dirname(imagePath), { recursive: true })
    await fs.writeFile(path.join(vault, '.obsidian', 'app.json'), JSON.stringify({
      attachmentFolderPath: 'attachments',
      useMarkdownLinks: false,
    }))
    await fs.writeFile(notePath, '# Today')
    await fs.writeFile(imagePath, Buffer.from('image'))

    const asset = await resolveMarkdownAsset({
      documentPath: notePath,
      workspaceRoot: vault,
      rawTarget: 'image.png',
    })

    expect(asset).toMatchObject({
      kind: 'image',
      absolutePath: imagePath,
      fileName: 'image.png',
      mimeType: 'image/png',
    })
    expect(asset.dataUrl).toMatch(/^data:image\/png;base64,/)
  })

  it('resolves Obsidian basename file links through the vault index in large vaults', async () => {
    const vault = await makeTempRoot()
    const notePath = path.join(vault, 'notes', 'today.md')
    const attachmentPath = path.join(vault, 'resources', 'sheets', 'IN_Think-Idea_8068857301_VQ_List.xlsx')
    await fs.mkdir(path.dirname(notePath), { recursive: true })
    await fs.mkdir(path.dirname(attachmentPath), { recursive: true })
    await fs.mkdir(path.join(vault, '.obsidian'), { recursive: true })
    await fs.writeFile(path.join(vault, '.obsidian', 'app.json'), JSON.stringify({}))
    await fs.writeFile(notePath, '# Today')
    await fs.writeFile(attachmentPath, 'sheet')

    await Promise.all(Array.from({ length: 5005 }, (_, index) =>
      fs.writeFile(path.join(vault, `filler-${index}.txt`), 'filler'),
    ))

    const asset = await resolveMarkdownAsset({
      documentPath: notePath,
      workspaceRoot: vault,
      rawTarget: 'IN_Think-Idea_8068857301_VQ_List.xlsx',
    })

    expect(asset).toMatchObject({
      kind: 'file',
      absolutePath: attachmentPath,
      fileName: 'IN_Think-Idea_8068857301_VQ_List.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  })

  it('saves Obsidian pasted attachments with wikilinks and unique names', async () => {
    const vault = await makeTempRoot()
    const notePath = path.join(vault, 'notes', 'today.md')
    await fs.mkdir(path.dirname(notePath), { recursive: true })
    await fs.mkdir(path.join(vault, '.obsidian'), { recursive: true })
    await fs.mkdir(path.join(vault, 'attachments'), { recursive: true })
    await fs.writeFile(path.join(vault, '.obsidian', 'app.json'), JSON.stringify({
      attachmentFolderPath: 'attachments',
      useMarkdownLinks: false,
    }))
    await fs.writeFile(path.join(vault, 'attachments', 'clip.png'), 'existing')

    const result = await saveMarkdownAttachments({
      documentPath: notePath,
      workspaceRoot: vault,
      files: [fileInput('clip.png')],
    })

    expect(result.success).toBe(true)
    expect(result.insertText).toBe('![[attachments/clip-2.png]]')
    expect(result.attachments?.[0]).toMatchObject({
      fileName: 'clip-2.png',
      absolutePath: path.join(vault, 'attachments', 'clip-2.png'),
      linkText: '![[attachments/clip-2.png]]',
    })
    await expect(fs.stat(path.join(vault, 'attachments', 'clip-2.png'))).resolves.toBeTruthy()
  })

  it('requires a configured attachment folder for non-Obsidian note roots', async () => {
    const noteRoot = await makeTempRoot()
    const notePath = path.join(noteRoot, 'personal.md')
    await fs.writeFile(notePath, '# Personal')
    resetVariablesStoreForTests().hydrateForTests({
      ...createDefaultVariablesFile(),
      user_note_dir: noteRoot,
      work_note_dir: '',
    })

    const result = await saveMarkdownAttachments({
      documentPath: notePath,
      workspaceRoot: noteRoot,
      files: [fileInput('receipt.pdf', 'application/pdf')],
    })

    expect(result).toMatchObject({
      success: false,
      code: 'MISSING_NOTE_ATTACHMENT_DIR',
    })
  })

  it('saves non-Obsidian note attachments to the configured note folder', async () => {
    const noteRoot = await makeTempRoot()
    const notePath = path.join(noteRoot, 'personal', 'today.md')
    await fs.mkdir(path.dirname(notePath), { recursive: true })
    await fs.writeFile(notePath, '# Personal')
    resetVariablesStoreForTests().hydrateForTests({
      ...createDefaultVariablesFile(),
      user_note_dir: noteRoot,
      work_note_dir: '',
    })
    configureEditor({ markdownNoteAttachmentDirectory: 'assets' })

    const result = await saveMarkdownAttachments({
      documentPath: notePath,
      workspaceRoot: noteRoot,
      files: [fileInput('receipt.pdf', 'application/pdf')],
    })

    expect(result.success).toBe(true)
    expect(result.insertText).toBe('[receipt](../assets/receipt.pdf)')
    expect(result.attachments?.[0]?.absolutePath).toBe(path.join(noteRoot, 'assets', 'receipt.pdf'))
  })

  it('defaults project Markdown attachments to the workspace root', async () => {
    const workspace = await makeTempRoot()
    const notePath = path.join(workspace, 'docs', 'readme.md')
    await fs.mkdir(path.dirname(notePath), { recursive: true })
    await fs.writeFile(notePath, '# Project')

    const result = await saveMarkdownAttachments({
      documentPath: notePath,
      workspaceRoot: workspace,
      files: [fileInput('diagram.png')],
    })

    expect(result.success).toBe(true)
    expect(result.insertText).toBe('![diagram](../diagram.png)')
    expect(result.attachments?.[0]?.absolutePath).toBe(path.join(workspace, 'diagram.png'))
  })
})
