/**
 * Infographic 类型定义
 * @antv/infographic 集成相关的类型
 */

// 信息图表项目
export interface InfographicItem {
  icon?: string
  label: string
  desc?: string
  value?: number
  image?: string
  color?: string
}

// 信息图表数据
export interface InfographicData {
  title?: string
  desc?: string
  items?: InfographicItem[]
}

// 信息图表配置
export interface InfographicConfig {
  template: string
  width?: number | string
  height?: number | string
  data: InfographicData
  theme?: 'default' | 'dark' | 'light' | 'hand-drawn'
  padding?: number | number[]
}

// 保存的信息图表
export interface SavedInfographic {
  id: string
  name: string
  config: InfographicConfig
  thumbnail?: string // base64 预览图
  createdAt: number
  updatedAt: number
}

// 导出请求
export interface ExportInfographicRequest {
  dataUrl: string
  format: 'png' | 'svg'
  name: string
}

// 导出响应
export interface ExportInfographicResponse {
  success: boolean
  path?: string
  error?: string
}

// 可用的模板列表
export const INFOGRAPHIC_TEMPLATES = [
  {
    id: 'list-row-simple-horizontal-arrow',
    name: '水平箭头流程',
    category: 'flow',
    description: '横向流程展示，适合展示步骤或阶段'
  },
  {
    id: 'list-column-simple',
    name: '垂直列表',
    category: 'list',
    description: '纵向列表展示，适合展示项目清单'
  },
  {
    id: 'list-grid-simple',
    name: '网格布局',
    category: 'grid',
    description: '网格形式展示，适合展示多个并列项目'
  },
  {
    id: 'comparison-horizontal',
    name: '水平对比',
    category: 'comparison',
    description: '左右对比展示，适合展示两个方案的比较'
  },
  {
    id: 'hierarchy-tree',
    name: '层级树',
    category: 'hierarchy',
    description: '树形结构展示，适合展示组织架构或分类'
  },
  {
    id: 'timeline-vertical',
    name: '垂直时间线',
    category: 'timeline',
    description: '时间线展示，适合展示历史或计划'
  },
  {
    id: 'pie-simple',
    name: '饼图',
    category: 'chart',
    description: '饼图展示，适合展示比例分布'
  },
  {
    id: 'bar-horizontal',
    name: '水平柱状图',
    category: 'chart',
    description: '横向柱状图，适合展示数值对比'
  }
] as const

export type InfographicTemplateId = typeof INFOGRAPHIC_TEMPLATES[number]['id']
