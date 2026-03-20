/**
 * Handlebars Helpers
 *
 * Custom helper functions for the Handlebars template engine.
 */

import Handlebars from 'handlebars'
import type { PlanItemStatus } from './types.js'

/**
 * Register all custom helpers on a Handlebars instance
 */
export function registerHelpers(handlebars: typeof Handlebars): void {
  // Equality check: {{#if (eq a b)}}
  handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b)

  // Not equal: {{#if (neq a b)}}
  handlebars.registerHelper('neq', (a: unknown, b: unknown) => a !== b)

  // Greater than: {{#if (gt a b)}}
  handlebars.registerHelper('gt', (a: number, b: number) => a > b)

  // Less than: {{#if (lt a b)}}
  handlebars.registerHelper('lt', (a: number, b: number) => a < b)

  // And helper: {{#if (and a b c)}}
  handlebars.registerHelper('and', (...args: unknown[]) => {
    // Remove the options object (last argument)
    const values = args.slice(0, -1)
    return values.every(Boolean)
  })

  // Or helper: {{#if (or a b c)}}
  handlebars.registerHelper('or', (...args: unknown[]) => {
    // Remove the options object (last argument)
    const values = args.slice(0, -1)
    return values.some(Boolean)
  })

  // Not helper: {{#if (not a)}}
  handlebars.registerHelper('not', (value: unknown) => !value)

  // Array length: {{length items}}
  handlebars.registerHelper('length', (arr: unknown) => {
    if (Array.isArray(arr)) return arr.length
    return 0
  })

  // Truncate text: {{truncate text 1000}}
  handlebars.registerHelper('truncate', (text: string, length: number) => {
    if (!text) return ''
    if (typeof text !== 'string') return ''
    if (text.length <= length) return text
    return text.slice(0, length) + '\n\n... (truncated)'
  })

  // Format plan item status icon: {{planIcon status}}
  handlebars.registerHelper('planIcon', (status: PlanItemStatus) => {
    switch (status) {
      case 'completed':
        return '[x]'
      case 'in_progress':
        return '[>]'
      default:
        return '[ ]'
    }
  })

  // Join array with separator: {{join arr ", "}}
  handlebars.registerHelper('join', (arr: unknown[], sep: string) => {
    if (!Array.isArray(arr)) return ''
    return arr.join(sep)
  })

  // Indent text by n spaces: {{indent content 4}}
  handlebars.registerHelper('indent', (text: string, spaces: number) => {
    if (!text) return ''
    if (typeof text !== 'string') return ''
    const indent = ' '.repeat(spaces)
    return text
      .split('\n')
      .map(line => indent + line)
      .join('\n')
  })

  // Concat strings: {{concat "a" "b" "c"}}
  handlebars.registerHelper('concat', (...args: unknown[]) => {
    // Remove the options object (last argument)
    const values = args.slice(0, -1)
    return values.join('')
  })

  // Add 1 to index (for 1-based numbering): {{add1 @index}}
  handlebars.registerHelper('add1', (num: number) => {
    return (num || 0) + 1
  })

  // Check if value is truthy and not empty string: {{#if (hasValue val)}}
  handlebars.registerHelper('hasValue', (value: unknown) => {
    if (value === null || value === undefined) return false
    if (typeof value === 'string') return value.trim().length > 0
    if (Array.isArray(value)) return value.length > 0
    return true
  })
}
