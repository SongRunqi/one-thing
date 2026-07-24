// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import Breadcrumb from '../Breadcrumb.vue'
import BreadcrumbItem from '../BreadcrumbItem.vue'
import {
  normalizeBreadcrumbSeparator,
  resolveBreadcrumbHref,
  stringifyBreadcrumbQuery,
  type BreadcrumbNavigatePayload,
} from '../breadcrumb'

const TestIcon = defineComponent({
  name: 'TestIcon',
  setup() {
    return () => h('svg', { class: 'test-icon', viewBox: '0 0 16 16' })
  },
})

describe('Breadcrumb', () => {
  it('renders breadcrumb items with default separators and current-page state', () => {
    const wrapper = mount(Breadcrumb, {
      slots: {
        default: () => [
          h(BreadcrumbItem, { to: '/' }, { default: () => 'homepage' }),
          h(BreadcrumbItem, null, { default: () => 'promotion management' }),
          h(BreadcrumbItem, null, { default: () => 'promotion detail' }),
        ],
      },
    })

    expect(wrapper.classes()).toContain('app-breadcrumb')
    expect(wrapper.attributes('aria-label')).toBe('Breadcrumb')

    const items = wrapper.findAll('.app-breadcrumb-item')
    expect(items).toHaveLength(3)
    expect(items[0].classes()).toContain('is-link')
    expect(items[2].classes()).toContain('is-last')
    expect(items[2].find('[aria-current="page"]').exists()).toBe(true)
    expect(wrapper.findAll('.app-breadcrumb-item__separator-text').map(item => item.text())).toEqual(['/', '/'])
  })

  it('uses icon separators in preference to separator text', () => {
    const wrapper = mount(Breadcrumb, {
      props: {
        separator: '>',
        separatorIcon: TestIcon,
      },
      slots: {
        default: () => [
          h(BreadcrumbItem, null, { default: () => 'homepage' }),
          h(BreadcrumbItem, null, { default: () => 'promotion detail' }),
        ],
      },
    })

    expect(wrapper.find('.test-icon').exists()).toBe(true)
    expect(wrapper.find('.app-breadcrumb-item__separator-text').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('>')
  })

  it('emits navigate payloads for app-managed routing', async () => {
    const handleNavigate = vi.fn()
    const wrapper = mount(BreadcrumbItem, {
      props: {
        to: {
          path: '/docs',
          query: {
            page: 2,
            tag: ['vue', 'typescript'],
            empty: null,
            skip: undefined,
          },
          hash: 'api',
        },
        replace: true,
        onNavigate: handleNavigate,
      },
      slots: {
        default: 'Docs',
      },
    })

    const link = wrapper.find('a')
    expect(link.attributes('href')).toBe('/docs?page=2&tag=vue&tag=typescript&empty#api')

    await link.trigger('click')

    expect(handleNavigate).toHaveBeenCalledTimes(1)
    const payload = wrapper.emitted('navigate')?.[0][0] as BreadcrumbNavigatePayload
    expect(payload.href).toBe('/docs?page=2&tag=vue&tag=typescript&empty#api')
    expect(payload.replace).toBe(true)
    expect(payload.event.defaultPrevented).toBe(true)
  })

  it('normalizes separators and location values defensively', () => {
    expect(normalizeBreadcrumbSeparator(undefined)).toBe('/')
    expect(normalizeBreadcrumbSeparator('')).toBe('')
    expect(resolveBreadcrumbHref('/settings')).toBe('/settings')
    expect(resolveBreadcrumbHref({ path: '/settings', hash: '#general' })).toBe('/settings#general')
    expect(stringifyBreadcrumbQuery({ q: 'a b', enabled: true, missing: undefined })).toBe('?q=a%20b&enabled=true')
  })
})
