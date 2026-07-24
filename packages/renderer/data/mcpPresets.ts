/**
 * MCP Server Presets
 *
 * Common MCP servers with pre-configured settings
 */

export interface MCPPresetParameter {
  name: string
  key: string
  type: 'path' | 'text' | 'url'
  placeholder: string
  required?: boolean
  default?: string
  isEnvVar?: boolean
}

export interface MCPPreset {
  id: string
  name: string
  description: string
  icon: 'folder' | 'github' | 'globe' | 'database' | 'search' | 'download' | 'brain' | 'lightbulb' | 'star' | 'code' | 'terminal'
  category: 'filesystem' | 'database' | 'web' | 'development' | 'other'
  config: {
    transport: 'stdio' | 'sse'
    command?: string
    args?: string[]
    url?: string
  }
  parameters?: MCPPresetParameter[]
}

export const MCP_PRESETS: MCPPreset[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read, write, and manage files and directories',
    icon: 'folder',
    category: 'filesystem',
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '{path}'],
    },
    parameters: [
      {
        name: 'Allowed Path',
        key: 'path',
        type: 'path',
        placeholder: '/path/to/directory',
        required: true,
      },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Access GitHub repositories, issues, and pull requests',
    icon: 'github',
    category: 'development',
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
    },
    parameters: [
      {
        name: 'GitHub Token',
        key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        type: 'text',
        placeholder: 'ghp_xxxxxxxxxxxx',
        required: true,
        isEnvVar: true,
      },
    ],
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation and web scraping',
    icon: 'globe',
    category: 'web',
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    },
    parameters: [],
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases',
    icon: 'database',
    category: 'database',
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres', '{connectionString}'],
    },
    parameters: [
      {
        name: 'Connection String',
        key: 'connectionString',
        type: 'text',
        placeholder: 'postgresql://user:pass@localhost:5432/db',
        required: true,
      },
    ],
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Query and manage SQLite databases',
    icon: 'database',
    category: 'database',
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite', '{dbPath}'],
    },
    parameters: [
      {
        name: 'Database Path',
        key: 'dbPath',
        type: 'path',
        placeholder: '/path/to/database.db',
        required: true,
      },
    ],
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Web search using Brave Search API',
    icon: 'search',
    category: 'web',
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
    },
    parameters: [
      {
        name: 'Brave API Key',
        key: 'BRAVE_API_KEY',
        type: 'text',
        placeholder: 'Your Brave Search API key',
        required: true,
        isEnvVar: true,
      },
    ],
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: 'Fetch and parse web content',
    icon: 'download',
    category: 'web',
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch'],
    },
    parameters: [],
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Persistent memory and knowledge graph',
    icon: 'brain',
    category: 'other',
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
    parameters: [],
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: 'Step-by-step reasoning and problem solving',
    icon: 'lightbulb',
    category: 'other',
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    },
    parameters: [],
  },
  {
    id: 'everything',
    name: 'Everything',
    description: 'Demo server with sample tools, resources, and prompts',
    icon: 'star',
    category: 'other',
    config: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
    },
    parameters: [],
  },
]

export const PRESET_CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'filesystem', name: 'Filesystem' },
  { id: 'database', name: 'Database' },
  { id: 'web', name: 'Web' },
  { id: 'development', name: 'Development' },
  { id: 'other', name: 'Other' },
] as const

export type PresetCategory = (typeof PRESET_CATEGORIES)[number]['id']
