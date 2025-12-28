# Skill 系统架构

本文档详细描述 Skill 系统的实现细节和架构设计。

## 目录

1. [概述](#概述)
2. [核心文件](#核心文件)
3. [SKILL.md 格式](#skillmd-格式)
4. [目录结构](#目录结构)
5. [Skill 加载流程](#skill-加载流程)
6. [Prompt 构建](#prompt-构建)
7. [SkillTool 实现](#skilltool-实现)
8. [权限控制](#权限控制)
9. [IPC 接口](#ipc-接口)
10. [数据结构](#数据结构)

---

## 概述

Skill 系统是应用的技能扩展框架，遵循官方 Claude Code Skills 格式，支持用户自定义技能的加载和执行。

### 核心特性

- **三层加载**: 用户级、项目级、插件级 Skills
- **SKILL.md 格式**: 标准化的技能定义格式
- **向上遍历**: 项目 Skills 支持目录向上查找
- **权限控制**: Agent 级别的技能访问权限
- **动态发现**: 运行时自动发现和加载

---

## 核心文件

| 文件路径 | 功能 |
|---------|------|
| `src/main/skills/loader.ts` | Skill 加载器 |
| `src/main/skills/prompt-builder.ts` | 提示构建 |
| `src/main/skills/index.ts` | 导出 |
| `src/main/tools/builtin/skill.ts` | SkillTool 实现 |
| `src/main/ipc/skills.ts` | IPC handlers |
| `src/shared/ipc.ts` | 类型定义 |

---

## SKILL.md 格式

### 基本格式

```markdown
---
name: skill-name
description: 简要描述这个技能的功能
allowed-tools: [Read, Write, Bash]    # 可选：允许的工具列表
---

# 技能详细说明

这里是技能的具体使用说明和指导...

## 使用方法

1. 步骤一
2. 步骤二

## 示例

```code
示例代码
```
```

### Frontmatter 字段

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 技能名称，小写字母、数字、连字符 |
| `description` | string | 是 | 一句话描述 |
| `allowed-tools` | string[] | 否 | 允许使用的工具列表 |

### 解析逻辑

```typescript
// src/main/skills/loader.ts

function parseFrontmatter(content: string): {
  frontmatter: Record<string, any>
  body: string
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    return { frontmatter: {}, body: content }
  }

  const frontmatter = yaml.parse(match[1])
  const body = match[2].trim()

  return { frontmatter, body }
}
```

---

## 目录结构

### 三层加载优先级

```
~/.claude/skills/                    # 1. 用户级技能
  ├── skill-name-1/
  │   ├── SKILL.md                   # 必需：主文件
  │   ├── script.py                  # 可选：附加文件
  │   └── templates/                 # 可选：模板目录
  └── skill-name-2/
      └── SKILL.md

.claude/skills/                      # 2. 项目级技能（支持向上遍历）
  ├── project-skill-1/
  │   └── SKILL.md
  └── project-skill-2/
      └── SKILL.md

~/.claude/plugins/cache/claude-plugins-official/
                                     # 3. 插件技能（自动发现）
  ├── plugin-name/
  │   └── version/
  │       └── skills/
  │           └── skill-name/
  │               └── SKILL.md
```

### SkillFile 类型

```typescript
interface SkillFile {
  name: string                        // 相对路径
  path: string                        // 绝对路径
  type: 'markdown' | 'script' | 'template' | 'other'
}
```

---

## Skill 加载流程

### 主加载函数

```typescript
// src/main/skills/loader.ts

export async function loadAllSkills(workingDirectory?: string): Promise<SkillDefinition[]> {
  const skills: SkillDefinition[] = []

  // 1. 加载用户级 Skills
  const userSkillsPath = getUserSkillsPath()  // ~/.claude/skills
  if (await fs.exists(userSkillsPath)) {
    const userSkills = await loadSkillsFromPath(userSkillsPath, 'user')
    skills.push(...userSkills)
  }

  // 2. 加载项目级 Skills（向上遍历）
  const projectSkillPaths = await findProjectSkillPaths(workingDirectory || process.cwd())
  for (const projectPath of projectSkillPaths) {
    const projectSkills = await loadSkillsFromPath(projectPath, 'project')
    skills.push(...projectSkills)
  }

  // 3. 加载环境变量 Skills
  const envSkillsPath = getEnvSkillsPath()  // CLAUDE_SKILLS_DIR
  if (envSkillsPath && await fs.exists(envSkillsPath)) {
    const envSkills = await loadSkillsFromPath(envSkillsPath, 'user')
    skills.push(...envSkills)
  }

  // 4. 加载插件 Skills
  const pluginSkills = await loadPluginSkills()
  skills.push(...pluginSkills)

  return skills
}
```

### 项目 Skills 向上遍历

```typescript
export async function findProjectSkillPaths(startDir: string): Promise<string[]> {
  const paths: string[] = []
  let currentDir = startDir

  while (currentDir !== path.dirname(currentDir)) {  // 直到根目录
    const skillsPath = path.join(currentDir, '.claude', 'skills')
    if (await fs.exists(skillsPath)) {
      paths.push(skillsPath)
    }
    currentDir = path.dirname(currentDir)
  }

  return paths
}
```

### 单个 Skill 加载

```typescript
async function loadSkillFromDirectory(
  skillDir: string,
  source: SkillSource
): Promise<SkillDefinition | null> {
  const skillMdPath = path.join(skillDir, 'SKILL.md')

  if (!await fs.exists(skillMdPath)) {
    return null
  }

  const content = await fs.readFile(skillMdPath, 'utf-8')
  const { frontmatter, body } = parseFrontmatter(content)

  const name = frontmatter.name || path.basename(skillDir)
  const id = `${source}:${name}`

  // 收集附加文件
  const files = await collectSkillFiles(skillDir)

  return {
    id,
    name,
    description: frontmatter.description || '',
    source,
    path: skillMdPath,
    directoryPath: skillDir,
    enabled: true,
    instructions: body,
    allowedTools: frontmatter['allowed-tools'],
    files,
  }
}
```

### 流程图

```
loadAllSkills(workingDirectory)
  ├─→ 用户 Skills (~/.claude/skills)
  │   └─→ loadSkillsFromPath(getUserSkillsPath(), 'user')
  │
  ├─→ 项目 Skills (.claude/skills with upward traversal)
  │   └─→ findProjectSkillPaths(workingDirectory)
  │       ├─→ /project/.claude/skills
  │       ├─→ /parent/.claude/skills
  │       └─→ ... 直到根目录
  │
  ├─→ 环境变量 Skills (CLAUDE_SKILLS_DIR)
  │   └─→ getEnvSkillsPath()
  │
  └─→ 插件 Skills (~/.claude/plugins/cache/claude-plugins-official)
      └─→ loadPluginSkills()
          └─→ 遍历: plugin/{version}/skills/{skill}/SKILL.md
```

---

## Prompt 构建

### 三种构建模式

```typescript
// src/main/skills/prompt-builder.ts

// 1. 意识提示（工具启用时）
export function buildSkillsAwarenessPrompt(skills: SkillDefinition[]): string

// 2. 直接提示（工具禁用时）
export function buildSkillsDirectPrompt(skills: SkillDefinition[]): string

// 3. 工具提示（SkillTool 模式）
export function buildSkillToolPrompt(skills: SkillDefinition[]): string
```

### 意识提示

```typescript
export function buildSkillsAwarenessPrompt(skills: SkillDefinition[]): string {
  if (skills.length === 0) return ''

  let prompt = '## Available Skills\n\n'
  prompt += 'The following skills are available. Use Bash to read SKILL.md for detailed instructions.\n\n'

  for (const skill of skills) {
    prompt += `- **${skill.name}** (${skill.source})\n`
    prompt += `  Description: ${skill.description}\n`
    prompt += `  Path: ${skill.directoryPath}/\n`
    if (skill.files && skill.files.length > 0) {
      prompt += `  Files: ${skill.files.map(f => f.name).join(', ')}\n`
    }
    prompt += '\n'
  }

  return prompt
}
```

输出示例：
```
## Available Skills

The following skills are available. Use Bash to read SKILL.md for detailed instructions.

- **my-skill** (user)
  Description: A helpful skill for doing things
  Path: ~/.claude/skills/my-skill/
  Files: SKILL.md, script.py, templates/

- **project-skill** (project)
  Description: Project-specific skill
  Path: /project/.claude/skills/project-skill/
  Files: SKILL.md
```

### 直接提示

```typescript
export function buildSkillsDirectPrompt(skills: SkillDefinition[]): string {
  if (skills.length === 0) return ''

  let prompt = '## Available Skills\n\n'

  for (const skill of skills) {
    prompt += `### Skill: ${skill.name}\n`
    prompt += `**Description:** ${skill.description}\n\n`

    // 截断长指令
    const instructions = skill.instructions.length > 1000
      ? skill.instructions.substring(0, 1000) + '...'
      : skill.instructions

    prompt += instructions + '\n\n'
  }

  return prompt
}
```

### 工具提示

```typescript
export function buildSkillToolPrompt(skills: SkillDefinition[]): string {
  if (skills.length === 0) return ''

  let prompt = '## Available Skills\n\n'
  prompt += 'Use the `skill` tool to load detailed instructions for any skill.\n\n'

  for (const skill of skills) {
    prompt += `- **${skill.name}**: ${skill.description}\n`
  }

  return prompt
}
```

---

## SkillTool 实现

### 异步工具定义

```typescript
// src/main/tools/builtin/skill.ts

export const SkillTool = Tool.define(
  'skill',
  {
    name: 'Skill',
    category: 'builtin',
    autoExecute: true,  // 技能加载是只读的
  },
  async (ctx?: InitContext) => {
    // 1. 从 context 获取动态信息
    const skills = (ctx?.skills ?? []) as SkillDefinition[]
    const agentPermissions = ctx?.agent?.permissions

    // 2. 过滤可访问的技能
    const accessibleSkills = filterAccessibleSkills(skills, agentPermissions)

    // 3. 构建动态描述
    const description = buildDescription(accessibleSkills)

    // 4. 返回初始化结果
    return {
      description,
      parameters: z.object({
        skill: z.enum(
          accessibleSkills.length > 0
            ? accessibleSkills.map(s => s.id) as [string, ...string[]]
            : ['']
        ).describe('The skill to load'),
      }),

      async execute(args, toolCtx) {
        const skill = skills.find(s => s.id === args.skill)
        if (!skill) {
          return {
            title: 'Skill not found',
            output: `Unknown skill: ${args.skill}`,
            metadata: {}
          }
        }

        // 检查权限
        const permission = getSkillPermission(skill.name, agentPermissions)
        if (permission === 'deny') {
          return {
            title: 'Access denied',
            output: `You don't have permission to use "${skill.name}" skill`,
            metadata: {}
          }
        }

        // 显示确认对话（如果是 'ask'）
        if (permission === 'ask') {
          await Permission.ask({
            type: 'skill',
            pattern: [`skill/${skill.name}`],
            sessionId: toolCtx.sessionId,
            messageId: toolCtx.messageId,
            callId: toolCtx.toolCallId,
            title: `Load skill: ${skill.name}`,
          })
        }

        return {
          title: `Loaded: ${skill.name}`,
          output: skill.instructions,
          metadata: {
            skillName: skill.name,
            skillSource: skill.source,
            permission,
          }
        }
      }
    }
  }
)
```

### 执行流程

```
SkillTool.execute(args)
  ├─→ find skill by name from ctx.skills
  ├─→ getSkillPermission(name, ctx.agent?.permissions)
  ├─→ if permission === 'deny':
  │   └─→ return error
  ├─→ if permission === 'ask':
  │   └─→ Permission.ask({ type: 'skill', ... })
  ├─→ fs.readFileSync(skill.path, 'utf-8')
  └─→ return {
      title: `Loaded skill: ${name}`,
      output: `# Skill: ${name}\n${description}\n${instructions}\n...`,
      metadata: { skillName, skillSource, permission }
    }
```

---

## 权限控制

### Agent 权限配置

```typescript
interface AgentPermissions {
  skill?: {
    [pattern: string]: SkillPermission  // 'allow' | 'ask' | 'deny'
  }
}

type SkillPermission = 'allow' | 'ask' | 'deny'
```

### 权限匹配

```typescript
function getSkillPermission(
  skillName: string,
  agentPermissions?: AgentPermissions
): SkillPermission {
  if (!agentPermissions?.skill) {
    return 'allow'  // 默认允许
  }

  const patterns = Object.keys(agentPermissions.skill)

  // 支持通配符匹配
  for (const pattern of patterns) {
    if (Wildcard.match(skillName, pattern)) {
      return agentPermissions.skill[pattern]
    }
  }

  return 'allow'
}
```

### 过滤可访问的 Skills

```typescript
function filterAccessibleSkills(
  skills: SkillDefinition[],
  agentPermissions?: AgentPermissions
): SkillDefinition[] {
  return skills.filter(skill => {
    const permission = getSkillPermission(skill.name, agentPermissions)
    return permission !== 'deny'  // 排除 deny
  })
}
```

### 文件访问安全

```typescript
// src/main/skills/loader.ts

export async function readSkillFile(
  skillId: string,
  fileName: string
): Promise<string> {
  const skill = getSkillById(skillId)
  if (!skill) throw new Error('Skill not found')

  const targetPath = path.resolve(skill.directoryPath, fileName)

  // 安全检查：防止路径遍历攻击
  if (!targetPath.startsWith(skill.directoryPath)) {
    throw new Error('Access denied: path traversal detected')
  }

  return await fs.readFile(targetPath, 'utf-8')
}
```

---

## IPC 接口

### IPC 通道

| 通道 | 功能 |
|------|------|
| `SKILLS_GET_ALL` | 获取所有 skill |
| `SKILLS_REFRESH` | 从文件系统刷新 |
| `SKILLS_READ_FILE` | 读取 skill 文件 |
| `SKILLS_OPEN_DIRECTORY` | 在文件管理器打开 |
| `SKILLS_CREATE` | 创建新 skill |
| `SKILLS_DELETE` | 删除 skill |
| `SKILLS_TOGGLE_ENABLED` | 切换启用状态 |

### Handler 实现

```typescript
// src/main/ipc/skills.ts

// 初始化
export async function initializeSkills(): Promise<void> {
  // 1. 确保目录存在
  await ensureSkillsDirectories()

  // 2. 加载所有 skills
  const skills = await loadAllSkills()

  // 3. 从 settings 应用启用状态
  const settings = await getSettings()
  for (const skill of skills) {
    if (settings.skills?.skills?.[skill.id]) {
      skill.enabled = settings.skills.skills[skill.id].enabled
    }
  }

  loadedSkills = skills
}

// 获取 session 的 skill
export function getSkillsForSession(workingDirectory?: string): SkillDefinition[] {
  // 1. 重新加载（考虑工作目录的向上遍历）
  const skills = loadAllSkills(workingDirectory)

  // 2. 应用启用状态
  // 3. 返回启用的 skill
  return skills.filter(s => s.enabled)
}

// 全局获取已加载的 skill
export function getLoadedSkills(): SkillDefinition[] {
  return loadedSkills.filter(s => s.enabled)
}
```

### 创建和删除

```typescript
// 创建新 skill
export async function createSkill(
  name: string,
  description: string,
  instructions: string,
  source: 'user' | 'project' = 'user'
): Promise<SkillDefinition> {
  const skillsPath = source === 'user'
    ? getUserSkillsPath()
    : getProjectSkillsPath()

  const skillDir = path.join(skillsPath, name)
  await fs.mkdir(skillDir, { recursive: true })

  const content = `---
name: ${name}
description: ${description}
---

${instructions}
`

  await fs.writeFile(path.join(skillDir, 'SKILL.md'), content)

  return loadSkillFromDirectory(skillDir, source)
}

// 删除 skill
export async function deleteSkill(skillId: string): Promise<void> {
  const skill = getSkillById(skillId)
  if (!skill) throw new Error('Skill not found')

  // 只允许删除用户级 skills
  if (skill.source !== 'user') {
    throw new Error('Can only delete user skills')
  }

  await fs.rm(skill.directoryPath, { recursive: true })
  loadedSkills = loadedSkills.filter(s => s.id !== skillId)
}
```

---

## 数据结构

### SkillDefinition

```typescript
// src/shared/ipc.ts

type SkillSource = 'user' | 'project' | 'plugin'

interface SkillDefinition {
  id: string                          // 格式: "{source}:{name}"
  name: string                        // 小写字母、数字、连字符
  description: string                 // 一句话描述
  source: SkillSource                 // 来源
  path: string                        // SKILL.md 文件路径
  directoryPath: string               // Skill 目录路径
  enabled: boolean                    // 是否启用
  instructions: string                // SKILL.md 正文内容
  allowedTools?: string[]             // 允许的工具
  files?: SkillFile[]                 // 附加文件列表
}
```

### SkillFile

```typescript
interface SkillFile {
  name: string                        // 相对路径
  path: string                        // 绝对路径
  type: 'markdown' | 'script' | 'template' | 'other'
}
```

### SkillSettings

```typescript
interface SkillSettings {
  enableSkills: boolean
  skills: {
    [skillId: string]: {
      enabled: boolean
    }
  }
}
```

---

## 完整示例

### 创建自定义 Skill

1. 创建目录：`~/.claude/skills/my-skill/`

2. 创建 `SKILL.md`：
```markdown
---
name: my-skill
description: A skill that helps with specific tasks
allowed-tools: [Read, Write, Bash]
---

# My Custom Skill

This skill provides guidance for specific tasks.

## Usage

1. First, analyze the requirements
2. Then, implement the solution
3. Finally, verify the results

## Best Practices

- Always validate input
- Handle errors gracefully
- Write clear documentation
```

3. 可选：添加附加文件
```
~/.claude/skills/my-skill/
├── SKILL.md
├── helper.py
└── templates/
    └── template.txt
```

### 使用 Skill

```
User: Use the my-skill skill to help me with this task

AI: I'll load the my-skill skill to get the instructions.
[Calls skill tool with name="my-skill"]

AI: Based on the skill instructions, I'll follow these steps:
1. First, analyze the requirements...
```

---

## 扩展点

### 添加新 Skill 来源

1. 在 `loadAllSkills()` 中添加新的加载路径
2. 实现相应的 `loadSkillsFromXxx()` 函数
3. 更新 `SkillSource` 类型

### 自定义 Frontmatter 字段

1. 在 `parseFrontmatter()` 中解析新字段
2. 更新 `SkillDefinition` 接口
3. 在相应地方使用新字段

### 集成新的权限检查

1. 扩展 `AgentPermissions` 接口
2. 更新 `getSkillPermission()` 逻辑
3. 在 `SkillTool.execute()` 中应用
