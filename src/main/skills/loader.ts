/**
 * Claude Code Skills Loader
 *
 * Loads skills from filesystem following official Claude Code Skills format:
 * - User skills: ~/.claude/skills/
 * - Project skills: .claude/skills/ (relative to working directory)
 *
 * Each skill is a directory containing:
 * - SKILL.md (required) - Markdown file with YAML frontmatter
 * - Additional files (optional) - scripts, templates, reference docs
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { app } from 'electron'
import type { SkillDefinition, SkillFile, SkillSource } from '../../shared/ipc.js'

// YAML frontmatter parser (simple implementation)
interface SkillFrontmatter {
  name: string
  description: string
  'allowed-tools'?: string[]
}

/**
 * Parse YAML frontmatter from SKILL.md content
 */
function parseFrontmatter(content: string): { frontmatter: SkillFrontmatter | null; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return { frontmatter: null, body: content }
  }

  const yamlContent = match[1]
  const body = match[2]

  // Simple YAML parsing for our specific use case
  const frontmatter: Partial<SkillFrontmatter> = {}

  const lines = yamlContent.split('\n')
  let currentKey: string | null = null
  let arrayValue: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // Check for array item
    if (trimmed.startsWith('- ') && currentKey === 'allowed-tools') {
      arrayValue.push(trimmed.slice(2).trim())
      continue
    }

    // Check for key-value pair
    const colonIndex = trimmed.indexOf(':')
    if (colonIndex > 0) {
      // Save previous array if exists
      if (currentKey === 'allowed-tools' && arrayValue.length > 0) {
        frontmatter['allowed-tools'] = arrayValue
        arrayValue = []
      }

      const key = trimmed.slice(0, colonIndex).trim()
      let value = trimmed.slice(colonIndex + 1).trim()

      // Handle inline array: allowed-tools: [Read, Write, Bash]
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1)
        frontmatter[key as keyof SkillFrontmatter] = value.split(',').map(s => s.trim()) as any
        currentKey = null
        continue
      }

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }

      if (value) {
        frontmatter[key as keyof SkillFrontmatter] = value as any
        currentKey = null
      } else {
        // Empty value might mean array follows
        currentKey = key
        arrayValue = []
      }
    }
  }

  // Save final array if exists
  if (currentKey === 'allowed-tools' && arrayValue.length > 0) {
    frontmatter['allowed-tools'] = arrayValue
  }

  return {
    frontmatter: frontmatter as SkillFrontmatter,
    body
  }
}

/**
 * Get the user skills directory path
 */
export function getUserSkillsPath(): string {
  return path.join(os.homedir(), '.claude', 'skills')
}

/**
 * Get the project skills directory path (single directory, no traversal)
 */
export function getProjectSkillsPath(cwd?: string): string {
  const workingDir = cwd || process.cwd()
  return path.join(workingDir, '.claude', 'skills')
}

/**
 * Get the official plugin skills directory path
 */
export function getPluginSkillsPath(): string {
  return path.join(os.homedir(), '.claude', 'plugins', 'cache', 'claude-plugins-official')
}

/**
 * Get the builtin skills directory path
 * Handles both development and production environments
 */
export function getBuiltinSkillsPath(): string {
  // In production, resources are in process.resourcesPath
  // In development, resources are in the project root
  const isDev = !app.isPackaged

  if (isDev) {
    // Development: resources/skills relative to project root
    // When running `electron dist/main/index.js`, app.getAppPath() returns dist/main
    // We need to go up TWO levels to reach project root
    const projectRoot = path.resolve(app.getAppPath(), '..', '..')
    return path.join(projectRoot, 'resources', 'skills')
  } else {
    // Production: resources are copied to app.asar.unpacked or extraResources
    return path.join(process.resourcesPath, 'skills')
  }
}

/**
 * Environment variable for additional skills directory
 */
const SKILLS_DIR_ENV = 'CLAUDE_SKILLS_DIR'

/**
 * Traverse upward from a directory to find all .claude directories
 * Similar to how git finds .git directories
 *
 * @param startDir - Directory to start traversal from
 * @param stopAt - Optional directory to stop at (e.g., home directory)
 * @returns Array of .claude/skills paths found (closest first)
 */
export function findProjectSkillPaths(startDir: string, stopAt?: string): string[] {
  const skillsPaths: string[] = []
  const homeDir = os.homedir()
  const stopDirectory = stopAt || homeDir

  let currentDir = path.resolve(startDir)
  const visitedDirs = new Set<string>()

  while (currentDir && !visitedDirs.has(currentDir)) {
    visitedDirs.add(currentDir)

    // Check for .claude/skills in current directory
    const skillsPath = path.join(currentDir, '.claude', 'skills')
    if (fs.existsSync(skillsPath) && fs.statSync(skillsPath).isDirectory()) {
      skillsPaths.push(skillsPath)
    }

    // Stop if we've reached the stop directory or root
    if (currentDir === stopDirectory || currentDir === path.dirname(currentDir)) {
      break
    }

    // Move up one directory
    currentDir = path.dirname(currentDir)
  }

  return skillsPaths
}

/**
 * Get skills directory from environment variable
 */
export function getEnvSkillsPath(): string | null {
  const envPath = process.env[SKILLS_DIR_ENV]
  if (envPath && fs.existsSync(envPath) && fs.statSync(envPath).isDirectory()) {
    return envPath
  }
  return null
}

/**
 * Determine file type based on extension and location
 */
function getFileType(fileName: string, filePath: string): SkillFile['type'] {
  const ext = path.extname(fileName).toLowerCase()

  if (ext === '.md') return 'markdown'
  if (['.py', '.js', '.ts', '.sh', '.bash'].includes(ext)) return 'script'
  if (filePath.includes('/templates/') || fileName.includes('template')) return 'template'

  return 'other'
}

/**
 * Directories to exclude when scanning skill files
 * These are common directories that shouldn't be included in skill context
 */
const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.tox',
  '.venv',
  'venv',
  '.env',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.cache',
  'coverage',
  '.nyc_output',
])

/**
 * Files to exclude when scanning skill files
 */
const EXCLUDED_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  '.gitignore',
  '.npmignore',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
])

/**
 * Scan a skill directory for additional files
 * Excludes common directories like node_modules, .git, etc.
 */
function scanSkillFiles(skillDir: string): SkillFile[] {
  const files: SkillFile[] = []

  function scanDir(dir: string, relativePath: string = '') {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name

        if (entry.isDirectory()) {
          // Skip excluded directories
          if (EXCLUDED_DIRECTORIES.has(entry.name)) {
            continue
          }
          scanDir(fullPath, relPath)
        } else if (entry.isFile() && entry.name !== 'SKILL.md') {
          // Skip excluded files
          if (EXCLUDED_FILES.has(entry.name)) {
            continue
          }
          files.push({
            name: relPath,
            path: fullPath,
            type: getFileType(entry.name, fullPath)
          })
        }
      }
    } catch (error) {
      // Directory might not exist or be readable
    }
  }

  scanDir(skillDir)
  return files
}

/**
 * Load a single skill from a directory
 */
function loadSkillFromDirectory(skillDir: string, source: SkillSource): SkillDefinition | null {
  const skillMdPath = path.join(skillDir, 'SKILL.md')

  // Check if SKILL.md exists
  if (!fs.existsSync(skillMdPath)) {
    return null
  }

  try {
    const content = fs.readFileSync(skillMdPath, 'utf-8')
    const { frontmatter, body } = parseFrontmatter(content)

    if (!frontmatter || !frontmatter.name || !frontmatter.description) {
      console.warn(`[Skills] Invalid SKILL.md in ${skillDir}: missing required frontmatter fields`)
      return null
    }

    // Validate name format
    if (!/^[a-z0-9-]+$/.test(frontmatter.name)) {
      console.warn(`[Skills] Invalid skill name "${frontmatter.name}": must be lowercase letters, numbers, and hyphens only`)
    }

    // Generate ID from source and name
    const id = `${source}:${frontmatter.name}`

    // Scan for additional files
    const files = scanSkillFiles(skillDir)

    const skill: SkillDefinition = {
      id,
      name: frontmatter.name,
      description: frontmatter.description,
      allowedTools: frontmatter['allowed-tools'],
      source,
      path: skillMdPath,
      directoryPath: skillDir,
      enabled: true,
      instructions: body.trim(),
      files: files.length > 0 ? files : undefined
    }

    return skill
  } catch (error) {
    console.error(`[Skills] Error loading skill from ${skillDir}:`, error)
    return null
  }
}

/**
 * Load all skills from a directory
 */
function loadSkillsFromPath(skillsDir: string, source: SkillSource): SkillDefinition[] {
  const skills: SkillDefinition[] = []

  if (!fs.existsSync(skillsDir)) {
    return skills
  }

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(skillsDir, entry.name)

      // Check if it's a directory or a symlink pointing to a directory
      let isDir = entry.isDirectory()
      if (!isDir && entry.isSymbolicLink()) {
        try {
          const stat = fs.statSync(fullPath) // statSync follows symlinks
          isDir = stat.isDirectory()
        } catch {
          // Symlink target doesn't exist, skip
          continue
        }
      }

      if (isDir) {
        const skill = loadSkillFromDirectory(fullPath, source)
        if (skill) {
          skills.push(skill)
        }
      }
    }
  } catch (error) {
    console.error(`[Skills] Error scanning ${skillsDir}:`, error)
  }

  return skills
}

/**
 * Load plugin skills from nested directory structure
 * Structure: ~/.claude/plugins/cache/claude-plugins-official/{plugin}/{version}/skills/{skill}/SKILL.md
 * Deduplicates by skill name (only keeps first found version of each skill)
 */
function loadPluginSkills(): SkillDefinition[] {
  const pluginCacheDir = getPluginSkillsPath()
  const skillsMap = new Map<string, SkillDefinition>()

  if (!fs.existsSync(pluginCacheDir)) {
    return []
  }

  try {
    // Iterate through plugin directories (e.g., vercel, frontend-design)
    const pluginDirs = fs.readdirSync(pluginCacheDir, { withFileTypes: true })

    for (const pluginDir of pluginDirs) {
      if (!pluginDir.isDirectory()) continue

      const pluginPath = path.join(pluginCacheDir, pluginDir.name)
      let versionDirs: fs.Dirent[] = []

      try {
        versionDirs = fs.readdirSync(pluginPath, { withFileTypes: true })
      } catch {
        continue
      }

      for (const versionDir of versionDirs) {
        if (!versionDir.isDirectory()) continue

        const skillsPath = path.join(pluginPath, versionDir.name, 'skills')
        if (!fs.existsSync(skillsPath)) continue

        // Load skills from this version's skills directory
        const loadedSkills = loadSkillsFromPath(skillsPath, 'plugin')

        // Deduplicate by skill name (keep first found)
        for (const skill of loadedSkills) {
          if (!skillsMap.has(skill.name)) {
            skillsMap.set(skill.name, skill)
          }
        }
      }
    }
  } catch (error) {
    console.error('[Skills] Error loading plugin skills:', error)
  }

  return Array.from(skillsMap.values())
}

/**
 * Load builtin skills from app resources
 */
function loadBuiltinSkills(): SkillDefinition[] {
  const builtinPath = getBuiltinSkillsPath()

  if (!fs.existsSync(builtinPath)) {
    console.log(`[Skills] Builtin skills path does not exist: ${builtinPath}`)
    return []
  }

  const skills = loadSkillsFromPath(builtinPath, 'builtin')
  console.log(`[Skills] Builtin skills path: ${builtinPath}, found ${skills.length} skills:`, skills.map(s => s.name))

  return skills
}

/**
 * Load all skills from user, project, plugin, and builtin directories
 * Uses upward traversal for project skills when workingDirectory is provided
 *
 * @param workingDirectory - Optional working directory for project skills (enables upward traversal)
 */
export function loadAllSkills(workingDirectory?: string): SkillDefinition[] {
  // 1. Builtin skills (shipped with the app, lowest priority - can be overridden)
  const builtinSkills = loadBuiltinSkills()

  // 2. User skills (global)
  const userSkillsPath = getUserSkillsPath()
  const userSkills = loadSkillsFromPath(userSkillsPath, 'user')
  console.log(`[Skills] User skills path: ${userSkillsPath}, found ${userSkills.length} skills:`, userSkills.map(s => s.name))

  // 3. Project skills (with upward traversal if workingDirectory provided)
  let projectSkills: SkillDefinition[] = []
  if (workingDirectory) {
    // Use upward traversal to find all .claude/skills directories
    // IMPORTANT: Exclude user skills path to avoid duplication (it's already loaded above)
    const allProjectSkillPaths = findProjectSkillPaths(workingDirectory)
    const projectSkillPaths = allProjectSkillPaths.filter(p => p !== userSkillsPath)
    console.log(`[Skills] Project skill paths from ${workingDirectory}:`, projectSkillPaths, `(excluded user path: ${userSkillsPath})`)
    const seenSkillIds = new Set<string>()

    for (const skillPath of projectSkillPaths) {
      const skills = loadSkillsFromPath(skillPath, 'project')
      // Deduplicate: closer skills take precedence
      for (const skill of skills) {
        if (!seenSkillIds.has(skill.id)) {
          seenSkillIds.add(skill.id)
          projectSkills.push(skill)
        }
      }
    }

    console.log(`[Skills] Found ${projectSkillPaths.length} project skill directories via upward traversal`)
  }

  // 4. Environment variable skills
  let envSkills: SkillDefinition[] = []
  const envSkillsPath = getEnvSkillsPath()
  console.log(`[Skills] Env skills path (${SKILLS_DIR_ENV}): ${envSkillsPath || 'not set'}`)
  if (envSkillsPath) {
    envSkills = loadSkillsFromPath(envSkillsPath, 'user') // Treat as user-level
    console.log(`[Skills] Loaded ${envSkills.length} skills from ${SKILLS_DIR_ENV}:`, envSkills.map(s => s.name))
  }

  // 5. Plugin skills
  const pluginSkills = loadPluginSkills()
  console.log(`[Skills] Plugin skills:`, pluginSkills.map(s => s.name))

  // Priority: project > user > env > plugin > builtin
  // Builtin skills can be overridden by user/project skills with the same name
  const allSkills = [...projectSkills, ...userSkills, ...envSkills, ...pluginSkills, ...builtinSkills]

  // Deduplicate by name (first one wins, so higher priority sources take precedence)
  const seenNames = new Set<string>()
  const dedupedSkills = allSkills.filter(skill => {
    if (seenNames.has(skill.name)) {
      return false
    }
    seenNames.add(skill.name)
    return true
  })

  console.log(`[Skills] Loaded ${builtinSkills.length} builtin, ${userSkills.length} user, ${projectSkills.length} project, ${envSkills.length} env, ${pluginSkills.length} plugin skills`)
  console.log(`[Skills] Total skills (after dedup): ${dedupedSkills.length}, names:`, dedupedSkills.map(s => s.name))

  return dedupedSkills
}

/**
 * Create a new skill
 */
export function createSkill(
  name: string,
  description: string,
  instructions: string,
  source: SkillSource
): SkillDefinition {
  // Validate name
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error('Skill name must contain only lowercase letters, numbers, and hyphens')
  }

  if (name.length > 64) {
    throw new Error('Skill name must be 64 characters or less')
  }

  if (description.length > 1024) {
    throw new Error('Skill description must be 1024 characters or less')
  }

  // Determine directory
  const skillsDir = source === 'user' ? getUserSkillsPath() : getProjectSkillsPath()
  const skillDir = path.join(skillsDir, name)

  // Check if already exists
  if (fs.existsSync(skillDir)) {
    throw new Error(`Skill "${name}" already exists in ${source} skills`)
  }

  // Create directory
  fs.mkdirSync(skillDir, { recursive: true })

  // Create SKILL.md content
  const skillMdContent = `---
name: ${name}
description: ${description}
---

${instructions}
`

  const skillMdPath = path.join(skillDir, 'SKILL.md')
  fs.writeFileSync(skillMdPath, skillMdContent, 'utf-8')

  // Return the created skill
  return {
    id: `${source}:${name}`,
    name,
    description,
    source,
    path: skillMdPath,
    directoryPath: skillDir,
    enabled: true,
    instructions
  }
}

/**
 * Get skill directory based on source
 */
function getSkillsDirBySource(source: string): string {
  switch (source) {
    case 'user':
      return getUserSkillsPath()
    case 'plugin':
      return getPluginSkillsPath()
    case 'project':
    default:
      return getProjectSkillsPath()
  }
}

/**
 * Delete a skill
 */
export function deleteSkill(skillId: string): boolean {
  const [source, name] = skillId.split(':')
  if (!source || !name) return false

  const skillsDir = getSkillsDirBySource(source)
  const skillDir = path.join(skillsDir, name)

  if (!fs.existsSync(skillDir)) {
    return false
  }

  try {
    fs.rmSync(skillDir, { recursive: true })
    console.log(`[Skills] Deleted skill: ${skillId}`)
    return true
  } catch (error) {
    console.error(`[Skills] Error deleting skill ${skillId}:`, error)
    return false
  }
}

/**
 * Read a file from a skill directory
 */
export function readSkillFile(skillId: string, fileName: string): string | null {
  const [source, name] = skillId.split(':')
  if (!source || !name) return null

  const skillsDir = getSkillsDirBySource(source)
  const filePath = path.join(skillsDir, name, fileName)

  // Security: ensure the path is within the skill directory
  const skillDir = path.join(skillsDir, name)
  const resolvedPath = path.resolve(filePath)
  if (!resolvedPath.startsWith(path.resolve(skillDir))) {
    console.error(`[Skills] Security: attempted to read file outside skill directory`)
    return null
  }

  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch (error) {
    return null
  }
}

/**
 * Ensure skills directories exist
 */
export function ensureSkillsDirectories(): void {
  const userSkillsDir = getUserSkillsPath()
  if (!fs.existsSync(userSkillsDir)) {
    fs.mkdirSync(userSkillsDir, { recursive: true })
    console.log(`[Skills] Created user skills directory: ${userSkillsDir}`)
  }
}
