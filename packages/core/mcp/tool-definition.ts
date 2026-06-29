import { toJsonSchemaObject, type JsonSchemaObject, type JsonValue } from '../json.js'
import type { MCPToolInfo } from './types.js'
import { MCP_ROUTER_TOOL_ID } from './tool-id-registry.js'
import { getMCPRouterDefinition, type MCPModelFacingToolDefinition } from './router.js'

export type CoreMCPToolParameterType = 'string' | 'number' | 'boolean' | 'object' | 'array'

export interface CoreMCPToolParameter {
  name: string
  type: CoreMCPToolParameterType
  description: string
  required?: boolean
  enum?: string[]
  default?: JsonValue
}

export type CoreMCPJsonSchemaValidationKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'json'

export interface CoreMCPJsonSchemaValidationPlan {
  kind: CoreMCPJsonSchemaValidationKind
  description?: string
  required: boolean
  enumValues?: string[]
  items?: CoreMCPJsonSchemaValidationPlan
  properties?: Record<string, CoreMCPJsonSchemaValidationPlan>
}

export interface CoreMCPToolDefinition {
  id: string
  name: string
  description: string
  parameters: CoreMCPToolParameter[]
  parameterSchema?: JsonSchemaObject
  enabled: boolean
  autoExecute: boolean
  permissionGuard?: 'safe' | 'sandboxed' | 'internal-check' | 'permission-gated' | 'external'
  executionMode?: 'parallel' | 'sequential'
  renderKind?: 'text' | 'bash' | 'diff' | 'file' | 'search' | 'image' | 'custom'
  category: 'builtin' | 'custom'
  icon?: string
  source?: 'builtin' | 'plugin' | 'mcp'
}

export function jsonSchemaStringEnum(schema: JsonSchemaObject): string[] | undefined {
  const values = Array.isArray(schema.enum)
    ? schema.enum.filter((item): item is string => typeof item === 'string')
    : []
  return values.length > 0 ? values : undefined
}

export function jsonSchemaDescription(schema: JsonSchemaObject): string {
  return typeof schema.description === 'string' ? schema.description : ''
}

export function jsonSchemaDefault(schema: JsonSchemaObject): JsonValue | undefined {
  const value = schema.default
  return value === undefined ? undefined : value
}

export function mapJsonSchemaToolParameterType(
  jsonType: string | string[] | undefined,
): CoreMCPToolParameterType {
  if (Array.isArray(jsonType)) {
    const nonNull = jsonType.find(type => type !== 'null')
    return mapJsonSchemaToolParameterType(nonNull)
  }

  switch (jsonType) {
    case 'string':
      return 'string'
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return 'array'
    case 'object':
    default:
      return 'object'
  }
}

function jsonSchemaPrimaryType(schema: JsonSchemaObject): string {
  return Array.isArray(schema.type)
    ? schema.type.find(type => type !== 'null') || 'string'
    : schema.type || 'string'
}

export function planJsonSchemaValidation(
  schema: JsonSchemaObject,
  options: { required?: boolean } = {},
): CoreMCPJsonSchemaValidationPlan {
  const description = jsonSchemaDescription(schema) || undefined
  const required = options.required !== false
  const type = jsonSchemaPrimaryType(schema)

  switch (type) {
    case 'string':
      return {
        kind: 'string',
        description,
        required,
        enumValues: jsonSchemaStringEnum(schema),
      }
    case 'number':
    case 'integer':
      return { kind: 'number', description, required }
    case 'boolean':
      return { kind: 'boolean', description, required }
    case 'array':
      return {
        kind: 'array',
        description,
        required,
        items: schema.items ? planJsonSchemaValidation(schema.items) : undefined,
      }
    case 'object':
      if (!schema.properties) {
        return { kind: 'object', description, required }
      }
      return {
        kind: 'object',
        description,
        required,
        properties: Object.fromEntries(Object.entries(schema.properties).map(([name, childSchema]) => [
          name,
          planJsonSchemaValidation(childSchema, {
            required: (schema.required || []).includes(name),
          }),
        ])),
      }
    default:
      return { kind: 'json', description, required }
  }
}

export function planMCPInputSchemaValidation(
  inputSchema: Pick<JsonSchemaObject, 'properties' | 'required'>,
): Record<string, CoreMCPJsonSchemaValidationPlan> {
  const required = inputSchema.required || []
  return Object.fromEntries(Object.entries(inputSchema.properties || {}).map(([name, schema]) => [
    name,
    planJsonSchemaValidation(schema, { required: required.includes(name) }),
  ]))
}

export function mcpToolToCoreToolDefinition(mcpTool: MCPToolInfo): CoreMCPToolDefinition {
  const parameters: CoreMCPToolParameter[] = []

  if (mcpTool.inputSchema.properties) {
    const required = mcpTool.inputSchema.required || []

    for (const [name, schema] of Object.entries(mcpTool.inputSchema.properties)) {
      parameters.push({
        name,
        type: mapJsonSchemaToolParameterType(schema.type),
        description: jsonSchemaDescription(schema),
        required: required.includes(name),
        enum: jsonSchemaStringEnum(schema),
        default: jsonSchemaDefault(schema),
      })
    }
  }

  return {
    id: `mcp:${mcpTool.serverId}:${mcpTool.name}`,
    name: mcpTool.name,
    description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
    parameters,
    parameterSchema: toJsonSchemaObject(mcpTool.inputSchema),
    enabled: true,
    autoExecute: false,
    permissionGuard: 'permission-gated',
    category: 'custom',
    icon: 'mcp',
  }
}

export function mcpRouterToCoreToolDefinition(
  router: MCPModelFacingToolDefinition = getMCPRouterDefinition(),
): CoreMCPToolDefinition {
  return {
    id: MCP_ROUTER_TOOL_ID,
    name: 'MCP Search',
    description: router.description,
    parameters: router.parameters.map(param => ({
      name: param.name,
      type: mapJsonSchemaToolParameterType(param.type),
      description: param.description,
      required: param.required,
      enum: param.enum,
    })),
    parameterSchema: router.parameterSchema,
    enabled: true,
    autoExecute: false,
    permissionGuard: 'permission-gated',
    executionMode: 'sequential',
    renderKind: 'text',
    category: 'custom',
    icon: 'mcp',
    source: 'mcp',
  }
}
