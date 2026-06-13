import type { Component, ComputedRef, InjectionKey } from 'vue'

export type BreadcrumbSeparatorIcon = string | Component
export type BreadcrumbQueryValue = string | number | boolean | null | undefined
export type BreadcrumbQueryValueList = BreadcrumbQueryValue | BreadcrumbQueryValue[]
export type BreadcrumbQuery = Record<string, BreadcrumbQueryValueList>

export interface BreadcrumbLocation {
  path?: string
  query?: BreadcrumbQuery
  hash?: string
}

export type BreadcrumbTo = string | BreadcrumbLocation

export interface BreadcrumbNavigatePayload {
  to: BreadcrumbTo
  replace: boolean
  href: string
  event: MouseEvent
}

export interface BreadcrumbContext {
  separator: ComputedRef<string>
  separatorIcon: ComputedRef<BreadcrumbSeparatorIcon | undefined>
}

export const breadcrumbContextKey = Symbol('BreadcrumbContext') as InjectionKey<BreadcrumbContext>

export function normalizeBreadcrumbSeparator(separator: string | undefined): string {
  return separator ?? '/'
}

export function resolveBreadcrumbHref(to: BreadcrumbTo | undefined): string {
  if (typeof to === 'string') return to
  if (!to) return ''

  const path = to.path ?? ''
  const query = stringifyBreadcrumbQuery(to.query)
  const hash = normalizeBreadcrumbHash(to.hash)

  return `${path}${query}${hash}`
}

export function stringifyBreadcrumbQuery(query: BreadcrumbQuery | undefined): string {
  if (!query) return ''

  const parts: string[] = []

  Object.entries(query).forEach(([key, value]) => {
    const values = Array.isArray(value) ? value : [value]

    values.forEach(item => {
      if (item === undefined) return

      const encodedKey = encodeURIComponent(key)
      if (item === null) {
        parts.push(encodedKey)
        return
      }

      parts.push(`${encodedKey}=${encodeURIComponent(String(item))}`)
    })
  })

  return parts.length ? `?${parts.join('&')}` : ''
}

function normalizeBreadcrumbHash(hash: string | undefined): string {
  if (!hash) return ''
  return hash.startsWith('#') ? hash : `#${hash}`
}
