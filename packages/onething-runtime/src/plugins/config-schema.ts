/**
 * 插件配置的 JSON Schema **子集**校验器(R3)。
 *
 * 手写、不引 ajv:core 是零依赖层,而为了校验一层扁平对象引一个完整 JSON Schema
 * 实现也不划算。
 *
 * **住在产品层而不是装配层**:它是纯函数(没有宿主依赖),而设置页需要同一份
 * 归约结果 —— renderer 可以吃 @onething/runtime/plugins,吃不到 @onething/app。
 * 两边各写一份 schema→控件 的解析器,就是形状漂移的开始。
 *
 * **支持的子集 = 设置 UI 能渲染的控件集**。这两件事必须是同一份清单:能校验
 * 但渲染不出来 = 用户改不了;能渲染但校验不了 = 脏值进盘。所以子集清单写成
 * 常量,将来扩控件时同步扩这里("表达力不够就补原语",不是放宽校验)。
 *
 * 支持:boolean / string / number / integer / enum(string) / string 数组;
 * 顶层单层 object。超出子集 → 整个插件的配置区显示"schema 不受支持"并列出原因,
 * 不崩、不静默。
 */

/** 控件集 —— 与 PluginsSettingsTab 的渲染分支一一对应。 */
export const PLUGIN_CONFIG_CONTROLS = [
  'switch',
  'text',
  'number',
  'select',
  'string-list',
] as const

export type PluginConfigControl = (typeof PLUGIN_CONFIG_CONTROLS)[number]

export interface PluginConfigField {
  key: string
  control: PluginConfigControl
  label: string
  hint?: string
  required: boolean
  /** select 的候选值。 */
  options?: string[]
  /** number 控件的边界(schema 的 minimum/maximum);仅提示与校验用。 */
  minimum?: number
  maximum?: number
  /** integer 时步进为 1。 */
  integer?: boolean
  defaultValue: unknown
}

export type PluginConfigSchemaDescription =
  | { supported: true; title?: string; fields: PluginConfigField[] }
  | { supported: false; reasons: string[] }

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, char => char.toUpperCase())
}

interface FieldSchema {
  type?: unknown
  enum?: unknown
  items?: unknown
  default?: unknown
  description?: unknown
  title?: unknown
  minimum?: unknown
  maximum?: unknown
}

/**
 * 把一条属性 schema 归约成一个控件。
 * 返回 string = 不支持的理由(会被聚合到配置区的说明里)。
 */
function describeField(
  key: string,
  raw: unknown,
  required: Set<string>,
  ui: Record<string, { label?: string; hint?: string; control?: string }>,
): PluginConfigField | string {
  if (!isPlainRecord(raw)) return `"${key}": property schema must be an object`
  const schema = raw as FieldSchema
  const hint = ui[key]?.hint ?? (typeof schema.description === 'string' ? schema.description : undefined)
  const label = ui[key]?.label ?? (typeof schema.title === 'string' ? schema.title : humanizeKey(key))
  const base = { key, label, hint, required: required.has(key) }

  // enum 优先于 type:一个带 enum 的 string 是下拉,不是自由文本。
  if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum) || schema.enum.length === 0) {
      return `"${key}": enum must be a non-empty array`
    }
    if (schema.enum.some(option => typeof option !== 'string')) {
      return `"${key}": only string enums are supported`
    }
    const options = schema.enum as string[]
    return { ...base, control: 'select', options, defaultValue: schema.default ?? options[0] }
  }

  const type = schema.type
  if (typeof type !== 'string') {
    return `"${key}": type must be one of boolean/string/number/integer/array`
  }

  switch (type) {
    case 'boolean':
      return { ...base, control: 'switch', defaultValue: schema.default ?? false }
    case 'string':
      return { ...base, control: 'text', defaultValue: schema.default ?? '' }
    case 'number':
    case 'integer':
      return {
        ...base,
        control: 'number',
        integer: type === 'integer',
        minimum: typeof schema.minimum === 'number' ? schema.minimum : undefined,
        maximum: typeof schema.maximum === 'number' ? schema.maximum : undefined,
        defaultValue: schema.default ?? (typeof schema.minimum === 'number' ? schema.minimum : 0),
      }
    case 'array': {
      const items = schema.items
      if (!isPlainRecord(items) || (items as FieldSchema).type !== 'string') {
        return `"${key}": only arrays of strings are supported`
      }
      return { ...base, control: 'string-list', defaultValue: schema.default ?? [] }
    }
    default:
      return `"${key}": unsupported type "${type}" (supported: boolean/string/number/integer/array-of-string)`
  }
}

/**
 * 把 manifest 的 schema 归约成宿主能渲染的字段表。
 *
 * 不支持时返回全部原因 —— 让插件作者一次看到所有要改的地方,而不是修一条报一条。
 */
export function describePluginConfigSchema(
  schema: unknown,
  options: {
    title?: string
    ui?: Record<string, { label?: string; hint?: string; control?: string }>
  } = {},
): PluginConfigSchemaDescription {
  if (!isPlainRecord(schema)) {
    return { supported: false, reasons: ['settings schema must be a JSON Schema object'] }
  }
  if (schema.type !== undefined && schema.type !== 'object') {
    return { supported: false, reasons: [`top-level schema must be type "object" (got "${String(schema.type)}")`] }
  }
  const properties = schema.properties
  if (properties !== undefined && !isPlainRecord(properties)) {
    return { supported: false, reasons: ['schema.properties must be an object'] }
  }
  if (!properties || Object.keys(properties).length === 0) {
    return { supported: true, title: options.title, fields: [] }
  }

  const required = new Set(
    Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : [],
  )
  const ui = options.ui ?? {}
  const fields: PluginConfigField[] = []
  const reasons: string[] = []

  for (const [key, raw] of Object.entries(properties)) {
    const described = describeField(key, raw, required, ui)
    if (typeof described === 'string') {
      reasons.push(described)
      continue
    }
    const requestedControl = ui[key]?.control
    if (requestedControl && !(PLUGIN_CONFIG_CONTROLS as readonly string[]).includes(requestedControl)) {
      reasons.push(`"${key}": ui.control "${requestedControl}" is not one of ${PLUGIN_CONFIG_CONTROLS.join('/')}`)
      continue
    }
    fields.push(requestedControl
      ? { ...described, control: requestedControl as PluginConfigControl }
      : described)
  }

  if (reasons.length > 0) return { supported: false, reasons }
  return { supported: true, title: options.title, fields }
}

export interface PluginConfigCoercion {
  config: Record<string, unknown>
  /** 存量坏值被回退成默认值的说明(读取路径 warn 用)。 */
  warnings: string[]
  /** 写入路径的硬错误:调用方给了这条 schema 不接受的值。 */
  errors: string[]
  /** 被剥掉的未知键。 */
  strippedKeys: string[]
}

function coerceField(field: PluginConfigField, value: unknown): { value: unknown; error?: string } {
  switch (field.control) {
    case 'switch':
      if (typeof value === 'boolean') return { value }
      return { value: field.defaultValue, error: `"${field.key}" must be a boolean` }
    case 'text':
      if (typeof value === 'string') return { value }
      return { value: field.defaultValue, error: `"${field.key}" must be a string` }
    case 'select':
      if (typeof value === 'string' && (field.options ?? []).includes(value)) return { value }
      return { value: field.defaultValue, error: `"${field.key}" must be one of ${(field.options ?? []).join('/')}` }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { value: field.defaultValue, error: `"${field.key}" must be a finite number` }
      }
      if (field.integer && !Number.isInteger(value)) {
        return { value: field.defaultValue, error: `"${field.key}" must be an integer` }
      }
      if (field.minimum !== undefined && value < field.minimum) {
        return { value: field.defaultValue, error: `"${field.key}" must be >= ${field.minimum}` }
      }
      if (field.maximum !== undefined && value > field.maximum) {
        return { value: field.defaultValue, error: `"${field.key}" must be <= ${field.maximum}` }
      }
      return { value }
    }
    case 'string-list':
      if (Array.isArray(value) && value.every(item => typeof item === 'string')) return { value: [...value] }
      return { value: field.defaultValue, error: `"${field.key}" must be an array of strings` }
    default:
      return { value: field.defaultValue, error: `"${field.key}" has an unsupported control` }
  }
}

/**
 * 读取/写入共用的归一化。
 *
 * - 缺失的键 → 填默认值;
 * - 非法的值 → **回退默认并记 warning**(zod 的 .catch 语义)。存量坏值不该让
 *   插件拿不到配置,更不该发明一个迁移框架去"修"它;
 * - 未知的键 → 剥掉(schema 是唯一事实源,盘上多出来的东西不代表任何契约)。
 */
export function coercePluginConfig(
  fields: PluginConfigField[],
  stored: unknown,
): PluginConfigCoercion {
  const input = isPlainRecord(stored) ? stored : {}
  const config: Record<string, unknown> = {}
  const warnings: string[] = []
  const errors: string[] = []

  for (const field of fields) {
    if (!(field.key in input)) {
      config[field.key] = field.defaultValue
      continue
    }
    const { value, error } = coerceField(field, input[field.key])
    config[field.key] = value
    if (error) {
      warnings.push(`${error}; falling back to the default`)
      errors.push(error)
    }
  }

  const known = new Set(fields.map(field => field.key))
  const strippedKeys = Object.keys(input).filter(key => !known.has(key))

  return { config, warnings, errors, strippedKeys }
}
