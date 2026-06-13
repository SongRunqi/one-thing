// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Container from '../Container.vue'
import { createContainerStyle } from '../container'

const __CONTAINER_SOURCE__ = readFileSync(
  resolve(process.cwd(), 'src/renderer/components/common/Container.vue'),
  'utf8',
)

describe('Container', () => {
  it('renders header, sidebar, main, and footer regions together', () => {
    const wrapper = mount(Container, {
      props: {
        as: 'article',
        sidebarWidth: 320,
        gap: 'md',
        fullHeight: true,
      },
      slots: {
        header: '<div class="header-slot">Header</div>',
        sidebar: '<nav class="sidebar-slot">Sidebar</nav>',
        default: '<section class="main-slot">Main</section>',
        footer: '<div class="footer-slot">Footer</div>',
      },
    })

    expect(wrapper.element.tagName).toBe('ARTICLE')
    expect(wrapper.classes()).toContain('has-header')
    expect(wrapper.classes()).toContain('has-sidebar')
    expect(wrapper.classes()).toContain('has-footer')
    expect(wrapper.classes()).toContain('is-full-height')
    expect(wrapper.find('.layout-container-header .header-slot').text()).toBe('Header')
    expect(wrapper.find('.layout-container-sidebar .sidebar-slot').text()).toBe('Sidebar')
    expect(wrapper.find('.layout-container-main .main-slot').text()).toBe('Main')
    expect(wrapper.find('.layout-container-footer .footer-slot').text()).toBe('Footer')
    expect(wrapper.attributes('style')).toContain('--layout-container-sidebar-width: 320px')
    expect(wrapper.attributes('style')).toContain('--layout-container-gap: 12px')
    expect(wrapper.attributes('style')).toContain('--layout-container-height: 100%')
  })

  it('supports main-only usage without optional regions', () => {
    const wrapper = mount(Container, {
      slots: {
        default: '<p class="main-only">Only main</p>',
      },
    })

    expect(wrapper.find('.layout-container-header').exists()).toBe(false)
    expect(wrapper.find('.layout-container-sidebar').exists()).toBe(false)
    expect(wrapper.find('.layout-container-footer').exists()).toBe(false)
    expect(wrapper.find('.layout-container-main .main-only').text()).toBe('Only main')
  })

  it('passes class and style hooks to internal regions', () => {
    const wrapper = mount(Container, {
      props: {
        headerClass: 'custom-header',
        headerStyle: { minHeight: '44px' },
        bodyClass: 'custom-body',
        bodyStyle: { display: 'flex' },
        sidebarClass: 'custom-sidebar',
        sidebarStyle: { overflow: 'hidden' },
        mainClass: 'custom-main',
        mainStyle: { flexDirection: 'column' },
        footerClass: 'custom-footer',
        footerStyle: { minHeight: '28px' },
      },
      slots: {
        header: 'Header',
        sidebar: 'Sidebar',
        default: 'Main',
        footer: 'Footer',
      },
    })

    const header = wrapper.find('.layout-container-header')
    const body = wrapper.find('.layout-container-body')
    const sidebar = wrapper.find('.layout-container-sidebar')
    const main = wrapper.find('.layout-container-main')
    const footer = wrapper.find('.layout-container-footer')

    expect(header.classes()).toContain('custom-header')
    expect((header.element as HTMLElement).style.minHeight).toBe('44px')
    expect(body.classes()).toContain('custom-body')
    expect((body.element as HTMLElement).style.display).toBe('flex')
    expect(sidebar.classes()).toContain('custom-sidebar')
    expect((sidebar.element as HTMLElement).style.overflow).toBe('hidden')
    expect(main.classes()).toContain('custom-main')
    expect((main.element as HTMLElement).style.flexDirection).toBe('column')
    expect(footer.classes()).toContain('custom-footer')
    expect((footer.element as HTMLElement).style.minHeight).toBe('28px')
  })

  it('places a right sidebar after the main region in document order', () => {
    const wrapper = mount(Container, {
      props: {
        sidebarPosition: 'right',
      },
      slots: {
        sidebar: '<span>Sidebar</span>',
        default: '<span>Main</span>',
      },
    })

    const bodyChildren = wrapper.find('.layout-container-body').element.children

    expect(wrapper.classes()).toContain('is-sidebar-right')
    expect(bodyChildren[0]?.classList.contains('layout-container-main')).toBe(true)
    expect(bodyChildren[1]?.classList.contains('layout-container-sidebar')).toBe(true)
  })

  it('supports header and footer without a sidebar', () => {
    const wrapper = mount(Container, {
      slots: {
        header: 'Header',
        default: 'Main',
        footer: 'Footer',
      },
    })

    expect(wrapper.find('.layout-container-header').exists()).toBe(true)
    expect(wrapper.find('.layout-container-sidebar').exists()).toBe(false)
    expect(wrapper.find('.layout-container-main').text()).toBe('Main')
    expect(wrapper.find('.layout-container-footer').exists()).toBe(true)
  })

  it('supports sidebar and main without header or footer', () => {
    const wrapper = mount(Container, {
      slots: {
        sidebar: 'Sidebar',
        default: 'Main',
      },
    })

    expect(wrapper.find('.layout-container-header').exists()).toBe(false)
    expect(wrapper.find('.layout-container-sidebar').text()).toBe('Sidebar')
    expect(wrapper.find('.layout-container-main').text()).toBe('Main')
    expect(wrapper.find('.layout-container-footer').exists()).toBe(false)
  })

  it('pins the body to the flexible grid row even when header or footer are omitted', () => {
    const source = __CONTAINER_SOURCE__

    expect(source).toContain('.layout-container-header {\n  grid-row: 1;')
    expect(source).toContain('.layout-container-body {\n  grid-row: 2;')
    expect(source).toContain('.layout-container-footer {\n  grid-row: 3;')
  })

  it('supports configurable flex layout for the body region', () => {
    const wrapper = mount(Container, {
      props: {
        bodyDirection: {
          base: 'column',
          md: 'row',
        },
        bodyWrap: true,
        bodyAlign: 'center',
        bodyJustify: 'between',
        bodyAlignContent: 'around',
        mainFlex: '2 1 0',
        sidebarFlex: {
          base: '0 0 12rem',
          lg: '1 0 16rem',
        },
      },
      slots: {
        sidebar: 'Sidebar',
        default: 'Main',
      },
    })

    const style = wrapper.attributes('style')

    expect(style).toContain('--layout-container-body-direction: column')
    expect(style).toContain('--layout-container-body-direction-md: row')
    expect(style).toContain('--layout-container-body-wrap: wrap')
    expect(style).toContain('--layout-container-body-align-items: center')
    expect(style).toContain('--layout-container-body-justify-content: space-between')
    expect(style).toContain('--layout-container-body-align-content: space-around')
    expect(style).toContain('--layout-container-main-flex: 2 1 0')
    expect(style).toContain('--layout-container-sidebar-flex: 0 0 12rem')
    expect(style).toContain('--layout-container-sidebar-flex-lg: 1 0 16rem')
  })

  it('creates responsive variables for dimensions, spacing, and overflow', () => {
    const style = createContainerStyle({
      width: {
        base: '100%',
        lg: '960px',
      },
      minHeight: {
        base: 240,
        md: '100vh',
      },
      rowGap: 'sm',
      columnGap: {
        base: 'md',
        xl: 32,
      },
      sidebarWidth: {
        base: 220,
        md: '18rem',
      },
      mainPadding: 'lg',
      sidebarPadding: {
        base: 'sm',
        lg: 'xl',
      },
      mainOverflow: {
        base: 'auto',
        md: 'hidden',
      },
      bodyDirection: {
        base: 'column',
        md: 'row',
      },
      bodyWrap: false,
      bodyJustify: 'evenly',
      mainFlex: 2,
    })

    expect(style['--layout-container-width']).toBe('100%')
    expect(style['--layout-container-width-lg']).toBe('960px')
    expect(style['--layout-container-min-height']).toBe('240px')
    expect(style['--layout-container-min-height-md']).toBe('100vh')
    expect(style['--layout-container-row-gap']).toBe('8px')
    expect(style['--layout-container-column-gap']).toBe('12px')
    expect(style['--layout-container-column-gap-xl']).toBe('32px')
    expect(style['--layout-container-sidebar-width']).toBe('220px')
    expect(style['--layout-container-sidebar-width-md']).toBe('18rem')
    expect(style['--layout-container-main-padding']).toBe('16px')
    expect(style['--layout-container-sidebar-padding']).toBe('8px')
    expect(style['--layout-container-sidebar-padding-lg']).toBe('24px')
    expect(style['--layout-container-main-overflow']).toBe('auto')
    expect(style['--layout-container-main-overflow-md']).toBe('hidden')
    expect(style['--layout-container-body-direction']).toBe('column')
    expect(style['--layout-container-body-direction-md']).toBe('row')
    expect(style['--layout-container-body-wrap']).toBe('nowrap')
    expect(style['--layout-container-body-justify-content']).toBe('space-evenly')
    expect(style['--layout-container-main-flex']).toBe(2)
  })
})
