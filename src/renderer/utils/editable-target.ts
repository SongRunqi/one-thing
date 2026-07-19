/**
 * 判断事件目标是否是可编辑控件（输入框 / 文本域 / contenteditable / select）。
 *
 * 用途：容器级的键盘处理（菜单项、tab、按钮化的 div）会把 Enter/Space 当作激活键
 * preventDefault 掉。当容器里嵌了输入控件时，这些键属于输入控件本身，容器必须让行，
 * 否则用户在里面打不出空格、按不了回车。
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true

  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    // 按钮类 input（button/submit/checkbox/radio）本身就该响应 Enter/Space
    const type = (target as HTMLInputElement).type
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'file'].includes(type)
  }

  return false
}
