import { h, render, type VNodeChild } from 'vue'
import Button from './Button.vue'
import type { ButtonNativeType, ButtonSize, ButtonType } from './button'

type DomButtonAttrValue = string | number | boolean | undefined | null

export interface DomButtonOptions {
  className?: string
  type?: ButtonType
  size?: ButtonSize
  nativeType?: ButtonNativeType
  plain?: boolean
  round?: boolean
  dashed?: boolean
  circle?: boolean
  text?: boolean
  disabled?: boolean
  styled?: boolean
  unstyled?: boolean
  title?: string
  ariaLabel?: string
  attrs?: Record<string, DomButtonAttrValue>
  children?: VNodeChild | (() => VNodeChild)
  onClick?: (event: MouseEvent) => void
  onMouseDown?: (event: MouseEvent) => void
  onDblClick?: (event: MouseEvent) => void
  onKeydown?: (event: KeyboardEvent) => void
}

export interface MountedDomButton {
  host: HTMLSpanElement
  button: HTMLButtonElement
  update: (options: DomButtonOptions) => void
  unmount: () => void
}

const mountedButtons = new WeakMap<HTMLElement, MountedDomButton>()

export function createDomButton(options: DomButtonOptions): MountedDomButton {
  const host = document.createElement('span')
  host.className = 'dom-button-host'
  host.style.display = 'contents'
  return mountDomButton(host, options)
}

export function mountDomButton(host: HTMLElement, options: DomButtonOptions): MountedDomButton {
  const existing = mountedButtons.get(host)
  if (existing) {
    existing.update(options)
    return existing
  }

  host.dataset.domButtonHost = 'true'

  let currentOptions = options
  let button: HTMLButtonElement | null = null

  function renderButton() {
    render(h(Button, buttonProps(currentOptions), buttonChildren(currentOptions)), host)
    button = host.querySelector('button')

    if (!button) {
      throw new Error('Button component did not render a button element')
    }
  }

  const mounted: MountedDomButton = {
    host: host as HTMLSpanElement,
    get button() {
      if (!button) renderButton()
      return button as HTMLButtonElement
    },
    update(nextOptions) {
      currentOptions = nextOptions
      renderButton()
    },
    unmount() {
      render(null, host)
      mountedButtons.delete(host)
    },
  }

  mountedButtons.set(host, mounted)
  renderButton()
  return mounted
}

export function unmountDomButton(host: HTMLElement): void {
  mountedButtons.get(host)?.unmount()
}

export function unmountDomButtons(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-dom-button-host="true"]').forEach(unmountDomButton)
}

function buttonProps(options: DomButtonOptions): Record<string, unknown> {
  return {
    ...compactAttrs(options.attrs),
    class: options.className,
    type: options.type,
    size: options.size,
    nativeType: options.nativeType ?? 'button',
    plain: options.plain,
    round: options.round,
    dashed: options.dashed,
    circle: options.circle,
    text: options.text,
    disabled: options.disabled,
    unstyled: options.styled ? false : (options.unstyled ?? true),
    title: options.title,
    'aria-label': options.ariaLabel,
    onClick: options.onClick,
    onMousedown: options.onMouseDown,
    onDblclick: options.onDblClick,
    onKeydown: options.onKeydown,
  }
}

function buttonChildren(options: DomButtonOptions): (() => VNodeChild) | undefined {
  if (options.children === undefined) return undefined
  if (typeof options.children === 'function') return options.children as () => VNodeChild

  const children = options.children
  return () => children
}

function compactAttrs(attrs: DomButtonOptions['attrs']): Record<string, DomButtonAttrValue> {
  if (!attrs) return {}

  return Object.fromEntries(
    Object.entries(attrs).filter(([, value]) => value !== undefined && value !== null),
  )
}
