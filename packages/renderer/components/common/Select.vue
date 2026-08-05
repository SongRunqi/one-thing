<template>
  <div
    ref="rootRef"
    class="app-select"
    :class="selectClasses"
    @keydown="handleKeydown"
    @focusin="handleFocusIn"
    @focusout="handleFocusOut"
  >
    <div
      ref="controlRef"
      class="app-select-control"
      role="combobox"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      :aria-controls="listboxId"
      :aria-disabled="disabled ? 'true' : undefined"
      :aria-label="ariaLabel || placeholder"
      :tabindex="disabled ? -1 : tabindex"
      @click="handleControlClick"
    >
      <span
        v-if="$slots.prefix"
        class="app-select-prefix"
      >
        <slot name="prefix" />
      </span>

      <div class="app-select-selection">
        <template v-if="multiple">
          <slot
            v-if="$slots.tag"
            name="tag"
            :data="selectedOptions"
            :select-disabled="disabled"
            :delete-tag="deleteTagFromSlot"
          />

          <template v-else>
            <button
              v-for="option in visibleTagOptions"
              :key="`tag-${option.key}`"
              class="app-select-tag"
              type="button"
              :disabled="disabled"
              @click.stop
            >
              <span class="app-select-tag-label">{{ option.label }}</span>
              <X
                class="app-select-tag-close"
                :size="12"
                :stroke-width="2"
                aria-hidden="true"
                @click.stop="removeSelectedOption(option)"
              />
            </button>

            <span
              v-if="hiddenTagCount > 0"
              ref="hiddenTagRef"
              class="app-select-tag app-select-tag-count"
            >
              +{{ hiddenTagCount }}
              <!-- detached trigger:`+N` 是 tag 行里的一枚 flex 子项,套 wrapper 会
                   把它挤出行内节奏。trigger-el 模式下 Tooltip 自身 display:none。 -->
              <Tooltip
                v-if="collapseTagsTooltip"
                :trigger-el="hiddenTagRef"
                :text="hiddenTagLabel"
              />
            </span>
          </template>

          <span
            v-if="selectedOptions.length === 0 && !searchQuery"
            class="app-select-placeholder"
          >
            {{ placeholder }}
          </span>

          <input
            v-if="filterable"
            :id="id"
            ref="inputRef"
            v-model="searchQuery"
            :name="name"
            :autocomplete="autocomplete"
            class="app-select-input"
            type="text"
            :placeholder="selectedOptions.length === 0 ? placeholder : ''"
            :disabled="disabled"
            @click.stop
          >
        </template>

        <template v-else>
          <input
            v-if="filterable"
            v-show="isOpen || searchQuery || selectedOptions.length === 0"
            :id="id"
            ref="inputRef"
            v-model="searchQuery"
            :name="name"
            :autocomplete="autocomplete"
            class="app-select-input"
            type="text"
            :placeholder="singleInputPlaceholder"
            :disabled="disabled"
            @click.stop
          >

          <span
            v-if="!filterable || (!isOpen && !searchQuery)"
            class="app-select-single-value"
            :class="{ 'is-placeholder': selectedOptions.length === 0 }"
          >
            <slot
              v-if="selectedOptions[0] && $slots.label"
              name="label"
              :label="selectedOptions[0].label"
              :value="selectedOptions[0].value"
              :option="selectedOptions[0].raw"
              :index="0"
            />
            <template v-else>
              {{ selectedOptions[0]?.label || placeholder }}
            </template>
          </span>
        </template>
      </div>

      <button
        v-if="showClear"
        class="app-select-clear"
        type="button"
        aria-label="Clear selection"
        @click.stop.prevent="clearSelection"
      >
        <CircleX
          :size="15"
          :stroke-width="2"
          aria-hidden="true"
        />
      </button>

      <span class="app-select-suffix">
        <LoaderCircle
          v-if="loading"
          class="app-select-loading-icon"
          :size="15"
          :stroke-width="2"
          aria-hidden="true"
        />
        <ChevronDown
          v-else
          class="app-select-chevron"
          :size="15"
          :stroke-width="2"
          aria-hidden="true"
        />
      </span>
    </div>

    <Teleport
      to="body"
      :disabled="!componentProps.teleported"
    >
      <Transition name="app-select-dropdown">
        <div
          v-if="isOpen"
          :id="listboxId"
          :ref="setDropdownEl"
          class="app-select-dropdown"
          :class="[popperClass, `app-select-dropdown--${componentProps.variant}`]"
          :data-placement="componentProps.teleported ? (layer.placement.value ?? undefined) : undefined"
          :style="dropdownStyle"
          role="listbox"
          :aria-multiselectable="multiple ? 'true' : undefined"
          @scroll="handleDropdownScroll"
        >
          <div
            v-if="$slots.header"
            class="app-select-dropdown-extra app-select-dropdown-header"
          >
            <slot name="header" />
          </div>

          <div
            v-if="loading"
            class="app-select-empty app-select-loading"
          >
            <slot name="loading">
              {{ loadingText }}
            </slot>
          </div>

          <template v-else-if="renderItems.length > 0">
            <template
              v-for="item in renderItems"
              :key="item.key"
            >
              <div
                v-if="item.type === 'group'"
                class="app-select-group-label"
                :class="{ disabled: item.disabled }"
              >
                {{ item.label }}
              </div>

              <button
                v-else
                class="app-select-option"
                type="button"
                role="option"
                :class="{
                  selected: isSelected(item.option),
                  highlighted: highlightedKey === item.option.key,
                  created: item.option.created,
                }"
                :data-select-key="item.option.key"
                :aria-selected="isSelected(item.option)"
                :disabled="item.option.disabled"
                @mouseenter="highlightedKey = item.option.key"
                @click="selectOption(item.option)"
              >
                <slot
                  name="option"
                  :option="item.option.raw"
                  :label="item.option.label"
                  :value="item.option.value"
                  :selected="isSelected(item.option)"
                  :disabled="item.option.disabled"
                  :created="item.option.created"
                  :index="item.index"
                >
                  <span class="app-select-option-label">{{ item.option.label }}</span>
                </slot>

                <Check
                  v-if="isSelected(item.option)"
                  class="app-select-option-check"
                  :size="15"
                  :stroke-width="2"
                  aria-hidden="true"
                />
              </button>
            </template>
          </template>

          <div
            v-else
            class="app-select-empty"
          >
            <slot name="empty">
              {{ emptyText }}
            </slot>
          </div>

          <div
            v-if="$slots.footer"
            class="app-select-dropdown-extra app-select-dropdown-footer"
          >
            <slot name="footer" />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import {
  Check,
  ChevronDown,
  CircleX,
  LoaderCircle,
  X,
} from 'lucide-vue-next'
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  toRefs,
  watch,
  type CSSProperties,
  type StyleValue,
} from 'vue'
import Tooltip from '@/components/common/Tooltip.vue'
import type { ComputedPosition, FloatingPlacement } from '@/composables/floating/compute-position'
import { popEscLayer, pushEscLayer } from '@/composables/floating/esc-stack'
import {
  useFloatingLayer,
  type FloatingZLayer,
} from '@/composables/floating/useFloatingLayer'
import type {
  SelectFilterMethod,
  SelectModelValue,
  SelectNormalizedOption,
  SelectOptionLike,
  SelectOptionProps,
  SelectRemoteMethod,
  SelectSize,
  SelectValue,
} from './select'

interface SelectProps {
  modelValue?: SelectModelValue
  options?: SelectOptionLike[]
  props?: SelectOptionProps
  multiple?: boolean
  disabled?: boolean
  clearable?: boolean
  size?: SelectSize
  placeholder?: string
  id?: string
  name?: string
  autocomplete?: string
  ariaLabel?: string
  tabindex?: number
  filterable?: boolean
  allowCreate?: boolean
  filterMethod?: SelectFilterMethod
  remote?: boolean
  remoteMethod?: SelectRemoteMethod
  debounce?: number
  loading?: boolean
  loadingText?: string
  noMatchText?: string
  noDataText?: string
  multipleLimit?: number
  collapseTags?: boolean
  collapseTagsTooltip?: boolean
  maxCollapseTags?: number
  reserveKeyword?: boolean
  defaultFirstOption?: boolean
  automaticDropdown?: boolean
  valueKey?: string
  emptyValues?: SelectValue[]
  valueOnClear?: SelectValue | (() => SelectValue)
  popperClass?: string
  popperStyle?: StyleValue
  fitInputWidth?: boolean
  offset?: number
  /**
   * Bare `'top'` / `'bottom'` keep their historical meaning — the panel's start
   * edge lines up with the control's, so they normalise to `top-start` /
   * `bottom-start`. Pass an explicit `-end` when the panel is wider than a
   * right-aligned trigger.
   */
  placement?: FloatingPlacement
  /** Flip to the opposite side when the requested one has no room (teleported only). */
  flip?: boolean
  /** Keep the panel inside the viewport (teleported only). */
  clamp?: boolean
  /**
   * Which stop of the z ladder the panel sits on (docs/design/ui-system.md §3).
   * The default `dropdown` + `zOffset: 20` reproduces the historical
   * `calc(var(--z-dropdown) + 20)`. **Inside a Dialog pass `z-layer="modal"`** —
   * dropdown+20 (=120) cannot beat `--z-modal` (600).
   */
  zLayer?: FloatingZLayer
  /** Relative order inside the stop: `calc(var(--z-x) + n)`, n ≤ 30. */
  zOffset?: number
  /** Full z-index expression; the escape hatch out of the ladder. */
  baseZ?: string
  teleported?: boolean
  /**
   * The three registers this app actually draws form controls in:
   *  - `box`       the rounded input surface (chat, panels) — the default.
   *  - `ledger`    the settings-area drafting box: square hairline frame, no
   *                fill. Reproduces what `SettingsPage`'s `:deep(select)` +
   *                `:deep(.form-input)` rules draw today, so a migrated tab is
   *                visually unchanged.
   *  - `underline` the line IS the control (paper dialogs, room sheets):
   *                no frame, one hairline underneath that inks up on focus.
   *
   * Consumers must NOT reproduce these with their own scoped rule on the root:
   * `.app-select[data-v-select]` and `.theirs[data-v-consumer]` are both
   * (0,2,0), and the tie is settled by stylesheet injection order — which
   * reshuffles whenever a component is added (ui-system.md §1).
   */
  variant?: 'box' | 'ledger' | 'underline'
}

type RenderItem =
  | {
    type: 'group'
    key: string
    label: string
    disabled: boolean
  }
  | {
    type: 'option'
    key: string
    option: SelectNormalizedOption
    index: number
  }

let selectIdCounter = 0

const componentProps = withDefaults(defineProps<SelectProps>(), {
  modelValue: undefined,
  options: () => [],
  props: () => ({}),
  multiple: false,
  disabled: false,
  clearable: false,
  size: 'default',
  placeholder: 'Select',
  id: undefined,
  name: undefined,
  autocomplete: 'off',
  ariaLabel: undefined,
  tabindex: 0,
  filterable: false,
  allowCreate: false,
  filterMethod: undefined,
  remote: false,
  remoteMethod: undefined,
  debounce: 300,
  loading: false,
  loadingText: 'Loading',
  noMatchText: 'No matching data',
  noDataText: 'No data',
  multipleLimit: 0,
  collapseTags: false,
  collapseTagsTooltip: false,
  maxCollapseTags: 1,
  reserveKeyword: true,
  defaultFirstOption: false,
  automaticDropdown: false,
  valueKey: 'value',
  emptyValues: () => [undefined, null, ''],
  valueOnClear: undefined,
  popperClass: undefined,
  popperStyle: undefined,
  fitInputWidth: false,
  offset: 6,
  placement: 'bottom',
  flip: true,
  clamp: true,
  zLayer: 'dropdown',
  zOffset: 20,
  baseZ: undefined,
  teleported: false,
  variant: 'box',
})

const emit = defineEmits<{
  'update:modelValue': [value: SelectModelValue]
  change: [value: SelectModelValue]
  'visible-change': [visible: boolean]
  'remove-tag': [value: SelectValue]
  clear: []
  focus: [event: FocusEvent]
  blur: [event: FocusEvent]
  'popup-scroll': [event: Event]
  'end-reached': [event: Event]
}>()

const rootRef = ref<HTMLElement | null>(null)
const controlRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const hiddenTagRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const searchQuery = ref('')
const highlightedKey = ref<string | null>(null)
const listboxId = `app-select-listbox-${++selectIdCounter}`
/** Measured from the control on every (re)placement — see `handlePositioned`. */
const anchorWidth = ref(0)
const availableHeight = ref(0)
let remoteTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Teleported mode is driven by the one positioning kernel
 * (`composables/floating/useFloatingLayer`) — flip, viewport clamping and
 * scroll/resize tracking come from there instead of the hand-rolled
 * `getBoundingClientRect()` + `top/left` arithmetic this component used to own.
 *
 * Two deliberate splits of responsibility:
 *  - `closeOn.outside` stays OFF: `handlePointerDown` below also has to spare
 *    the filter input and the tags, and two owners for one decision is how
 *    dismissal bugs are born. `closeOn.esc` is ON, because the kernel's
 *    capture-phase listener is the only thing that can beat an enclosing
 *    Dialog to the key (see `escToken` below).
 *  - In-flow mode (`teleported: false`, still the default) needs no kernel
 *    positioning at all: the panel is `position: absolute` inside the control's
 *    own box, so it tracks the anchor for free. It also keeps the panel inside
 *    the caller's DOM, which is what `MediaPanel`'s
 *    `:deep(.app-select-dropdown)` relies on.
 */
const layer = useFloatingLayer({
  open: isOpen,
  anchor: () => (componentProps.teleported ? controlRef.value : null),
  placement: () => normalizedPlacement.value,
  offset: () => componentProps.offset,
  flip: () => componentProps.flip,
  clamp: () => componentProps.clamp,
  zLayer: () => componentProps.zLayer,
  zOffset: () => componentProps.zOffset,
  baseZ: () => componentProps.baseZ,
  width: () => (componentProps.fitInputWidth ? 'anchor' : undefined),
  closeOn: () => ({ esc: true }),
  onPositioned: handlePositioned,
})

/**
 * An open panel is a layer above whatever opened it, so it — not the enclosing
 * Dialog — owns Escape while it is up. Registration order cannot express that:
 * both listeners are `window` + capture and the Dialog always registers first,
 * so it would close the whole sheet out from under the dropdown (real
 * regression, caught in `RoomSettingsDialog`; the native `<select>` never had
 * it because the OS popup ate the key). The shared stack is the arbiter.
 */
const escToken = Symbol('select')

watch(isOpen, (open) => {
  if (open) pushEscLayer(escToken)
  else popEscLayer(escToken)
})

// A panel torn down while open (route change, v-if on an ancestor) must not
// leave its token wedged on top of the stack — Escape would go dead app-wide.
onUnmounted(() => popEscLayer(escToken))

function setDropdownEl(el: unknown) {
  dropdownRef.value = el instanceof HTMLElement ? el : null
  layer.setFloatingEl(el)
}

const {
  multiple,
  disabled,
  filterable,
  loading,
  loadingText,
  placeholder,
  id,
  name,
  autocomplete,
  ariaLabel,
  tabindex,
  collapseTagsTooltip,
  popperClass,
} = toRefs(componentProps)

const optionKeys = computed(() => ({
  value: componentProps.props.value || 'value',
  label: componentProps.props.label || 'label',
  disabled: componentProps.props.disabled || 'disabled',
  options: componentProps.props.options || 'options',
}))

const selectClasses = computed(() => [
  `app-select--${componentProps.size}`,
  `app-select--${componentProps.variant}`,
  {
    'is-open': isOpen.value,
    'is-disabled': componentProps.disabled,
    'is-filterable': componentProps.filterable,
    'is-multiple': componentProps.multiple,
    'has-value': selectedOptions.value.length > 0,
  },
])

const normalizedGroups = computed(() => {
  const groups: Array<{
    key: string
    label: string
    disabled: boolean
    options: SelectNormalizedOption[]
  }> = []

  componentProps.options.forEach((raw, rawIndex) => {
    if (isRecord(raw) && Array.isArray(raw[optionKeys.value.options])) {
      const groupLabel = stringifyLabel(raw[optionKeys.value.label], `Group ${rawIndex + 1}`)
      const groupDisabled = Boolean(raw[optionKeys.value.disabled])
      const groupOptions = (raw[optionKeys.value.options] as SelectOptionLike[]).map((child, index) =>
        normalizeOption(child, `${rawIndex}-${index}`, {
          groupLabel,
          groupDisabled,
        })
      )
      groups.push({
        key: `group-${rawIndex}-${groupLabel}`,
        label: groupLabel,
        disabled: groupDisabled,
        options: groupOptions,
      })
      return
    }

    groups.push({
      key: `ungrouped-${rawIndex}`,
      label: '',
      disabled: false,
      options: [normalizeOption(raw, `${rawIndex}`)],
    })
  })

  return groups
})

const allOptions = computed(() => normalizedGroups.value.flatMap(group => group.options))

const selectedOptions = computed<SelectNormalizedOption[]>(() => {
  if (componentProps.multiple) {
    const values = Array.isArray(componentProps.modelValue) ? componentProps.modelValue : []
    return values.map(value => findOptionByValue(value) || optionFromValue(value))
  }

  const value = Array.isArray(componentProps.modelValue)
    ? componentProps.modelValue[0]
    : componentProps.modelValue
  const existingOption = findOptionByValue(value)

  if (existingOption) return [existingOption]
  if (isEmptyValue(value)) return []
  return [optionFromValue(value)]
})

const filteredGroups = computed(() => {
  const query = searchQuery.value.trim()

  if (!componentProps.filterable || componentProps.remote || !query) {
    return normalizedGroups.value
  }

  const loweredQuery = query.toLowerCase()
  return normalizedGroups.value
    .map(group => ({
      ...group,
      options: group.options.filter(option => {
        if (componentProps.filterMethod) {
          return componentProps.filterMethod(query, option)
        }

        return option.label.toLowerCase().includes(loweredQuery)
      }),
    }))
    .filter(group => group.options.length > 0)
})

const visibleGroups = computed(() => {
  const groups = filteredGroups.value.map(group => ({
    ...group,
    options: [...group.options],
  }))
  const created = createdOption.value

  if (created) {
    groups.unshift({
      key: 'created-options',
      label: '',
      disabled: false,
      options: [created],
    })
  }

  return groups
})

const createdOption = computed<SelectNormalizedOption | null>(() => {
  const query = searchQuery.value.trim()
  if (!componentProps.filterable || !componentProps.allowCreate || !query) return null

  const normalizedQuery = query.toLowerCase()
  const exists = allOptions.value.some(option =>
    option.label.toLowerCase() === normalizedQuery ||
    String(valueIdentity(option.value)).toLowerCase() === normalizedQuery
  )

  if (exists) return null

  return {
    key: `created-${query}`,
    value: query,
    label: query,
    disabled: false,
    raw: {
      [optionKeys.value.value]: query,
      [optionKeys.value.label]: query,
    },
    created: true,
  }
})

const renderItems = computed<RenderItem[]>(() => {
  let index = 0
  return visibleGroups.value.flatMap(group => {
    const items: RenderItem[] = []

    if (group.label) {
      items.push({
        type: 'group',
        key: group.key,
        label: group.label,
        disabled: group.disabled,
      })
    }

    group.options.forEach(option => {
      items.push({
        type: 'option',
        key: option.key,
        option,
        index,
      })
      index += 1
    })

    return items
  })
})

const selectableOptions = computed(() =>
  visibleGroups.value.flatMap(group => group.options).filter(option => !option.disabled)
)

const visibleTagOptions = computed(() => {
  if (!componentProps.collapseTags) return selectedOptions.value
  return selectedOptions.value.slice(0, Math.max(componentProps.maxCollapseTags, 0))
})

const hiddenTagCount = computed(() =>
  Math.max(selectedOptions.value.length - visibleTagOptions.value.length, 0)
)

const hiddenTagLabel = computed(() =>
  selectedOptions.value
    .slice(visibleTagOptions.value.length)
    .map(option => option.label)
    .join(', ')
)

const singleInputPlaceholder = computed(() => {
  const selected = selectedOptions.value[0]
  return selected ? selected.label : componentProps.placeholder
})

const showClear = computed(() =>
  componentProps.clearable &&
  !componentProps.disabled &&
  selectedOptions.value.length > 0
)

const emptyText = computed(() => {
  if (componentProps.options.length === 0 && !searchQuery.value) return componentProps.noDataText
  return componentProps.noMatchText
})

/**
 * Bare `top`/`bottom` historically meant "aligned with the control's left
 * edge", which in the kernel's vocabulary is `-start`. Normalising here keeps
 * the three existing call sites pixel-identical while opening the full
 * placement grammar to new ones.
 */
const normalizedPlacement = computed<FloatingPlacement>(() => {
  if (componentProps.placement === 'top') return 'top-start'
  if (componentProps.placement === 'bottom') return 'bottom-start'
  return componentProps.placement
})

/**
 * The one thing the kernel deliberately does not do: shrink the layer to the
 * space that is actually left. Clamping only slides a box back inside the
 * viewport; a 30-option list still has to be told it may only be 200px tall.
 * Measured off the resolved side (post-flip) and written through a
 * change-threshold so the ResizeObserver → update → resize ring cannot spin.
 */
function handlePositioned(position: ComputedPosition) {
  const rect = controlRef.value?.getBoundingClientRect()
  if (!rect) return

  const width = Math.round(rect.width)
  if (width !== anchorWidth.value) anchorWidth.value = width

  const gap = componentProps.offset + 8
  const space = position.placement.startsWith('top')
    ? rect.top - gap
    : window.innerHeight - rect.bottom - gap
  const next = Math.round(Math.min(268, Math.max(96, space)))
  if (Math.abs(next - availableHeight.value) > 1) availableHeight.value = next
}

const dropdownStyle = computed<StyleValue>(() => {
  const style: CSSProperties = {}

  if (componentProps.teleported) {
    Object.assign(style, layer.floatingStyle.value)
    if (anchorWidth.value > 0) style.minWidth = `${anchorWidth.value}px`
    if (availableHeight.value > 0) style.maxHeight = `${availableHeight.value}px`
  } else if (componentProps.placement === 'top') {
    style.top = 'auto'
    style.bottom = `calc(100% + ${componentProps.offset}px)`
  } else {
    style.top = `calc(100% + ${componentProps.offset}px)`
  }

  if (componentProps.fitInputWidth && !componentProps.teleported) {
    style.width = '100%'
  }

  if (typeof componentProps.popperStyle === 'string') {
    return [style, componentProps.popperStyle]
  }

  if (Array.isArray(componentProps.popperStyle)) {
    return [style, ...componentProps.popperStyle]
  }

  return {
    ...style,
    ...(componentProps.popperStyle || {}),
  }
})

watch(isOpen, visible => {
  emit('visible-change', visible)

  if (visible) {
    // Seeded before the panel renders: the kernel measures it on the very next
    // tick, and a panel that has not yet been told its minimum width would be
    // measured at its content width and then jump when the width lands.
    if (componentProps.teleported) {
      anchorWidth.value = Math.round(controlRef.value?.getBoundingClientRect().width ?? 0)
    }
    nextTick(() => {
      ensureHighlightedOption()
      if (componentProps.filterable) inputRef.value?.focus()
    })
    return
  }

  highlightedKey.value = null
  if (!componentProps.multiple) searchQuery.value = ''
})

watch(selectableOptions, () => {
  if (!isOpen.value) return
  ensureHighlightedOption()
})

watch(searchQuery, query => {
  if (!componentProps.filterable || !componentProps.remote || !componentProps.remoteMethod) return

  if (remoteTimer) {
    clearTimeout(remoteTimer)
    remoteTimer = null
  }

  remoteTimer = setTimeout(() => {
    void componentProps.remoteMethod?.(query)
  }, Math.max(componentProps.debounce, 0))
})

function normalizeOption(
  raw: SelectOptionLike,
  keySeed: string,
  context: { groupLabel?: string; groupDisabled?: boolean } = {},
): SelectNormalizedOption {
  if (!isRecord(raw)) {
    return {
      key: `option-${keySeed}-${String(raw)}`,
      value: raw,
      label: stringifyLabel(raw, ''),
      disabled: Boolean(context.groupDisabled),
      raw,
      groupLabel: context.groupLabel,
    }
  }

  const value = raw[optionKeys.value.value] as SelectValue
  const labelSource = raw[optionKeys.value.label] ?? value
  const disabled = Boolean(context.groupDisabled || raw[optionKeys.value.disabled])

  return {
    key: `option-${keySeed}-${String(valueIdentity(value))}`,
    value,
    label: stringifyLabel(labelSource, ''),
    disabled,
    raw,
    groupLabel: context.groupLabel,
  }
}

function optionFromValue(value: SelectValue): SelectNormalizedOption {
  return {
    key: `selected-${String(valueIdentity(value))}`,
    value,
    label: stringifyLabel(isRecord(value) ? value[optionKeys.value.label] ?? valueIdentity(value) : value, ''),
    disabled: false,
    raw: isRecord(value) ? value : { [optionKeys.value.value]: value },
  }
}

function findOptionByValue(value: SelectValue): SelectNormalizedOption | undefined {
  return allOptions.value.find(option => areValuesEqual(option.value, value))
}

function isSelected(option: SelectNormalizedOption) {
  return selectedOptions.value.some(selected => areValuesEqual(selected.value, option.value))
}

function selectOption(option: SelectNormalizedOption) {
  if (componentProps.disabled || option.disabled) return

  if (componentProps.multiple) {
    const values = Array.isArray(componentProps.modelValue)
      ? [...componentProps.modelValue]
      : []
    const existingIndex = values.findIndex(value => areValuesEqual(value, option.value))

    if (existingIndex >= 0) {
      const [removed] = values.splice(existingIndex, 1)
      emit('remove-tag', removed)
    } else {
      const limit = componentProps.multipleLimit
      if (limit > 0 && values.length >= limit) return
      values.push(option.value)
    }

    emitValue(values)
    if (!componentProps.reserveKeyword) searchQuery.value = ''
    return
  }

  emitValue(option.value)
  searchQuery.value = ''
  closeDropdown()
}

function emitValue(value: SelectModelValue) {
  emit('update:modelValue', value)
  emit('change', value)
}

function removeSelectedOption(option: SelectNormalizedOption) {
  if (componentProps.disabled) return

  if (!componentProps.multiple) {
    clearSelection()
    return
  }

  const values = Array.isArray(componentProps.modelValue)
    ? componentProps.modelValue.filter(value => !areValuesEqual(value, option.value))
    : []
  emit('remove-tag', option.value)
  emitValue(values)
}

function deleteTagFromSlot(optionOrValue: SelectNormalizedOption | SelectValue) {
  const option = isNormalizedOption(optionOrValue)
    ? optionOrValue
    : selectedOptions.value.find(selected => areValuesEqual(selected.value, optionOrValue))
  if (option) removeSelectedOption(option)
}

function clearSelection() {
  if (componentProps.disabled) return

  const value = componentProps.multiple
    ? []
    : typeof componentProps.valueOnClear === 'function'
      ? componentProps.valueOnClear()
      : componentProps.valueOnClear

  searchQuery.value = ''
  emitValue(value)
  emit('clear')
}

function handleControlClick() {
  if (componentProps.disabled) return

  if (componentProps.filterable) {
    openDropdown()
    nextTick(() => inputRef.value?.focus())
    return
  }

  toggleDropdown()
}

function handleKeydown(event: KeyboardEvent) {
  if (componentProps.disabled) return

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      if (!isOpen.value) openDropdown()
      else moveHighlight(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      if (!isOpen.value) openDropdown()
      else moveHighlight(-1)
      break
    case 'Enter':
      if (!isOpen.value) {
        event.preventDefault()
        openDropdown()
        return
      }

      if (highlightedOption.value) {
        event.preventDefault()
        selectOption(highlightedOption.value)
      }
      break
    case 'Escape':
      if (isOpen.value) {
        event.preventDefault()
        closeDropdown()
      }
      break
    case 'Tab':
      closeDropdown()
      break
    case 'Backspace':
      if (
        componentProps.multiple &&
        componentProps.filterable &&
        !searchQuery.value &&
        selectedOptions.value.length > 0
      ) {
        removeSelectedOption(selectedOptions.value[selectedOptions.value.length - 1])
      }
      break
  }
}

const highlightedOption = computed(() =>
  selectableOptions.value.find(option => option.key === highlightedKey.value) || null
)

function openDropdown() {
  if (componentProps.disabled || isOpen.value) return
  isOpen.value = true
}

function closeDropdown() {
  if (!isOpen.value) return
  isOpen.value = false
}

function toggleDropdown() {
  if (isOpen.value) closeDropdown()
  else openDropdown()
}

function moveHighlight(delta: 1 | -1) {
  const options = selectableOptions.value
  if (options.length === 0) return

  const currentIndex = options.findIndex(option => option.key === highlightedKey.value)
  const nextIndex = currentIndex < 0
    ? delta > 0 ? 0 : options.length - 1
    : (currentIndex + delta + options.length) % options.length

  highlightedKey.value = options[nextIndex].key
  scrollHighlightedIntoView()
}

function ensureHighlightedOption() {
  const options = selectableOptions.value
  if (options.length === 0) {
    highlightedKey.value = null
    return
  }

  // If the currently-highlighted option still exists, keep it.
  if (highlightedKey.value && options.some(option => option.key === highlightedKey.value)) {
    return
  }

  // When opening the dropdown (no previous highlight), prefer the
  // currently-selected option so the user sees what they have.
  if (!componentProps.multiple && selectedOptions.value[0]) {
    highlightedKey.value = selectedOptions.value[0].key
    return
  }

  if (componentProps.defaultFirstOption) {
    highlightedKey.value = options[0].key
    return
  }

  // Fallback: clear highlight when nothing else matches.
  highlightedKey.value = null
}

function scrollHighlightedIntoView() {
  nextTick(() => {
    if (!dropdownRef.value || !highlightedKey.value) return
    const option = Array.from(
      dropdownRef.value.querySelectorAll<HTMLElement>('.app-select-option')
    ).find(element => element.dataset.selectKey === highlightedKey.value)
    option?.scrollIntoView({ block: 'nearest' })
  })
}

function handleDropdownScroll(event: Event) {
  emit('popup-scroll', event)

  const element = event.currentTarget as HTMLElement | null
  if (!element) return

  const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight
  if (distanceToBottom <= 8) {
    emit('end-reached', event)
  }
}

function handleFocusIn(event: FocusEvent) {
  emit('focus', event)

  if (componentProps.automaticDropdown && !componentProps.disabled) {
    openDropdown()
  }
}

function handleFocusOut(event: FocusEvent) {
  requestAnimationFrame(() => {
    if (rootRef.value?.contains(document.activeElement)) return
    if (dropdownRef.value?.contains(document.activeElement)) return
    emit('blur', event)
  })
}

function handlePointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (rootRef.value?.contains(target) || dropdownRef.value?.contains(target)) return
  closeDropdown()
}

function focus() {
  if (componentProps.disabled) return
  if (componentProps.filterable) inputRef.value?.focus()
  else controlRef.value?.focus()
}

function blur() {
  inputRef.value?.blur()
  controlRef.value?.blur()
}

function selectedLabel() {
  return componentProps.multiple
    ? selectedOptions.value.map(option => option.label)
    : selectedOptions.value[0]?.label || ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringifyLabel(value: unknown, fallback: string) {
  if (value === undefined || value === null) return fallback
  return String(value)
}

function valueIdentity(value: SelectValue): unknown {
  if (isRecord(value) && componentProps.valueKey in value) {
    return value[componentProps.valueKey]
  }
  return value
}

function areValuesEqual(left: SelectValue, right: SelectValue) {
  const leftIdentity = valueIdentity(left)
  const rightIdentity = valueIdentity(right)
  return Object.is(leftIdentity, rightIdentity)
}

function isEmptyValue(value: SelectValue) {
  return componentProps.emptyValues.some(empty => areValuesEqual(empty, value))
}

function isNormalizedOption(value: unknown): value is SelectNormalizedOption {
  return isRecord(value) && 'key' in value && 'value' in value && 'label' in value
}

onMounted(() => {
  // Scroll/resize tracking is the kernel's (bound only while open); this
  // listener is the dismissal half, which Select still arbitrates itself.
  document.addEventListener('pointerdown', handlePointerDown)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
  if (remoteTimer) clearTimeout(remoteTimer)
})

defineExpose({
  blur,
  focus,
  selectedLabel,
})
</script>

<style scoped>
.app-select {
  position: relative;
  display: inline-flex;
  width: 100%;
  min-width: 0;
  color: var(--ui-text-primary-fg);
  font-size: 13px;
}

.app-select--small {
  font-size: 12px;
}

.app-select--large {
  font-size: 14px;
}

.app-select-control {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  min-height: 34px;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid var(--ui-border-default-border);
  border-radius: 8px;
  background: var(--ui-surface-input-bg);
  color: var(--ui-text-primary-fg);
  cursor: pointer;
  transition: border-color var(--duration-normal) var(--ease-default), box-shadow var(--duration-normal) var(--ease-default), background var(--duration-normal) var(--ease-default);
}

.app-select--small .app-select-control {
  min-height: 30px;
  padding: 3px 7px;
  border-radius: 7px;
}

.app-select--large .app-select-control {
  min-height: 38px;
  padding: 5px 10px;
}

/* The control is a `role="combobox"` div with its own paint, so the UA outline
   is replaced, never merely removed: `box` draws a ring, `ledger`/`underline`
   ink their frame/rule. Scoped per variant because the box's fill would
   repaint a control whose whole point is that it has none. */
.app-select-control {
  outline: none;
}

.app-select--box .app-select-control:hover,
.app-select--box.is-open .app-select-control,
.app-select--box .app-select-control:focus-visible {
  border-color: var(--ui-border-focus-border, var(--ui-accent-primary-fg));
  background: var(--ui-surface-input-focus-bg, var(--ui-surface-elevated-bg));
}

.app-select--box .app-select-control:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg) 24%, transparent);
}

/* ————— ledger variant (设置区制图盒) —————
   The settings page draws every native select as a square hairline box with no
   fill; this is that box, owned by the component instead of by a `:deep(select)`
   rule the migrated markup would no longer match. The `--settings-*` reads are
   deliberate: inside SettingsPage they pick up the page's ink scale, outside it
   they fall through to the app tokens. */
.app-select--ledger .app-select-control {
  min-height: 32px;
  padding: 4px 8px;
  border: 1px solid var(--settings-rule, var(--ui-border-default-border));
  border-radius: 0;
  background: transparent;
  color: var(--settings-ink, var(--ui-text-primary-fg));
  font-size: 13px;
}

.app-select--ledger .app-select-control:hover {
  border-color: color-mix(in srgb, var(--settings-ink, var(--ui-text-primary-fg)) 40%, transparent);
  background: transparent;
}

.app-select--ledger.is-open .app-select-control,
.app-select--ledger .app-select-control:focus-visible {
  border-color: var(--settings-accent, var(--ui-accent-primary-fg));
  background: transparent;
  box-shadow: none;
}

.app-select--ledger .app-select-single-value,
.app-select--ledger .app-select-placeholder {
  color: inherit;
}

/* Square panel to match the square control. Scoped styles reach teleported
   nodes because Vue stamps this component's scope id on them. */
.app-select-dropdown--ledger {
  padding: 2px 4px;
  border-radius: var(--radius-xs);
}

.app-select-dropdown--ledger .app-select-option {
  min-height: 28px;
  font-size: 13px;
}

/* ————— 画线 rows (ledger + underline) —————
 * The seam above keeps two filled rows apart; here the two states stop being
 * the same kind of mark at all. `selected` is PERSISTENT and `hover` is
 * TRANSIENT, and in the 画线 registers a persistent state is a LINE, not a
 * slab — the settings page already says so everywhere else (`.member-line.is-on`
 * thickens a rule, `sidebar-entry.is-active` is `inset 2px 0 0 accent` over a
 * transparent fill). `Dropdown.vue` reached the same conclusion in P1 for the
 * opposite reason: "单靠 menu-hover token 在有些主题下与菜单底色几乎同色".
 *
 * So: hover keeps the faint fill, selected takes the left rule + accent ink and
 * gives up its fill. The two channels are orthogonal, which is what lets the
 * rows survive being adjacent — and lets one row show both (hovering the
 * selected item) without the states cancelling.
 *
 * `box` deliberately keeps its tinted fill: it is a 面 register, its panel and
 * rows are rounded, and it already carries the ✓ as a second channel. Shared
 * across all three: the 2px rhythm, the panel-padding inset, and the ✓.
 */
.app-select-dropdown--ledger .app-select-option,
.app-select-dropdown--underline .app-select-option {
  position: relative;
  padding-left: 12px;
  border-radius: var(--radius-xs);
}

.app-select-dropdown--ledger .app-select-option::before,
.app-select-dropdown--underline .app-select-option::before {
  content: '';
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 3px;
  width: 2px;
  border-radius: 1px;
  background: transparent;
  transition: background var(--duration-fast) var(--ease-default);
}

/* Two classes deeper than the base `.app-select-option.selected` on purpose —
   equal specificity would hand the decision to injection order (the tie that
   shipped a solid-pill ledger Switch earlier in this same pass). */
.app-select-dropdown--ledger .app-select-option.selected,
.app-select-dropdown--underline .app-select-option.selected {
  background: transparent;
  color: var(--ui-accent-primary-fg);
}

.app-select-dropdown--ledger .app-select-option.selected::before,
.app-select-dropdown--underline .app-select-option.selected::before {
  background: var(--ui-accent-primary-fg);
}

/* Hovering the selected row: the fill returns UNDER the rule, so the row reads
   as "the current one, under the cursor" rather than losing either state.
   A selected row is never allowed to stop answering the pointer (ui-system.md §1).
 *
 * Deepened by the same notch `box` takes below, and for a measured reason: the
 * bare hover token clears the panel by ~11 RGB levels on the light themes but
 * only ~5 on One Dark (`--ui-state-hover-bg` against the panel mix, measured),
 * and 5 levels under a row that ALREADY carries a rule and accent ink reads as
 * nothing moving. Mixing the opposite tone in — `--ui-text-primary-fg`, light on
 * dark themes and dark on light ones — buys the step back on both sides without
 * a per-theme constant. Still a fill, still under the rule: the two channels
 * stay orthogonal. */
.app-select-dropdown--ledger .app-select-option.selected:hover,
.app-select-dropdown--ledger .app-select-option.selected.highlighted,
.app-select-dropdown--underline .app-select-option.selected:hover,
.app-select-dropdown--underline .app-select-option.selected.highlighted {
  background: color-mix(
    in srgb,
    var(--ui-state-hover-bg) 94%,
    var(--ui-text-primary-fg)
  );
}

/* ————— underline variant (设置区画线风) —————
   The line IS the control: no frame, no fill, one hairline that inks up on
   focus/open. Published as a variant rather than left to consumers because a
   consumer class on `.app-select` ties with the component's own rule at
   (0,2,0) and the winner is whatever stylesheet was injected last. */
.app-select--underline .app-select-control {
  min-height: 0;
  padding: 4px 0 5px;
  border: none;
  border-bottom: 1px solid var(--ui-border-default-border);
  border-radius: 0;
  background: transparent;
}

.app-select--underline .app-select-control:hover,
.app-select--underline.is-open .app-select-control,
.app-select--underline .app-select-control:focus-visible {
  border-bottom-color: var(--ui-accent-primary-fg);
  background: transparent;
  box-shadow: none;
}

.app-select--underline.app-select--small .app-select-control {
  min-height: 0;
  padding: 3px 0 4px;
  border-radius: 0;
}

.app-select.is-disabled {
  opacity: 0.58;
}

.app-select.is-disabled .app-select-control {
  cursor: default;
}

.app-select-prefix,
.app-select-suffix {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  color: var(--ui-text-muted-fg);
}

.app-select-selection {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-width: 0;
  gap: 4px;
  flex-wrap: wrap;
}

.app-select-single-value,
.app-select-placeholder {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-primary-fg);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select-single-value.is-placeholder,
.app-select-placeholder {
  color: var(--ui-text-muted-fg);
}

.app-select-input {
  flex: 1 1 40px;
  min-width: 24px;
  height: 24px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ui-text-primary-fg);
}

.app-select-input::placeholder {
  color: var(--ui-text-muted-fg);
}

.app-select-tag {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  height: 22px;
  min-width: 0;
  gap: 4px;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--ui-accent-primary-fg) 26%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-accent-primary-fg) 10%, transparent);
  color: var(--ui-text-primary-fg);
  font-size: 12px;
  line-height: 1;
}

button.app-select-tag {
  cursor: default;
}

.app-select-tag-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select-tag-close {
  flex: 0 0 auto;
  cursor: pointer;
  color: var(--ui-text-muted-fg);
}

.app-select-tag-close:hover {
  color: var(--ui-text-primary-fg);
}

.app-select-clear {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ui-text-muted-fg);
  cursor: pointer;
}

.app-select-clear:hover {
  color: var(--ui-text-primary-fg);
  background: var(--ui-state-hover-bg);
}

.app-select-chevron {
  transition: transform var(--duration-normal) var(--ease-default);
}

.app-select.is-open .app-select-chevron {
  transform: rotate(180deg);
}

.app-select-loading-icon {
  animation: app-select-spin 0.9s linear infinite;
}

.app-select-dropdown {
  position: absolute;
  z-index: calc(var(--z-dropdown) + 20);
  left: 0;
  min-width: 100%;
  max-width: min(360px, calc(100vw - 24px));
  max-height: 268px;
  overflow: auto;
  /* 3px block / 5px inline: the rows below carry 2px of their own vertical
     margin, so the panel gives that back and the outer inset is unchanged.
     (Padding also stops the first row's margin collapsing into the panel.) */
  padding: 3px 5px;
  border: 1px solid var(--ui-border-default-border);
  border-radius: 8px;
  background: color-mix(in oklch, var(--ui-surface-panel-bg, var(--ui-surface-app-bg)) 70%, var(--ui-surface-elevated-bg) 30%);
  box-shadow: var(--shadow-floating);
}

/*
 * Rows are SEPARATED, not merely rounded.
 *
 * A rounded block only reads as a block while something un-filled sits next to
 * it: give a `hover` row and a `selected` row a shared edge and each one's
 * radius is filled in by the neighbour's straight edge, so the pair renders as
 * one continuous slab and the boundary disappears (real report — the composer's
 * permission picker, where the two states also resolve to near-identical greys
 * in the light themes). `margin-block` is the seam that keeps them two rows.
 *
 * 2px, not 1px each: the panel is a plain block container, so adjacent rows'
 * vertical margins COLLAPSE to the larger of the two. `1px` reads as 1px
 * between rows, not 2 — measured, not assumed. The panel's block padding gives
 * the 2px back so the outer inset is unchanged.
 *
 * Select is the only member of the picker family that needs this: `Dropdown`
 * (ContextMenuItem has no `selected`) and `Mention` carry a single TRANSIENT
 * state, so no two adjacent rows can ever both be filled. Adding a seam there
 * would be churn against the tight-row convention menus are read with.
 */
.app-select-option {
  /* One definition of "the selected slab", so the deepened hover below cannot
     drift away from the resting state it is supposed to be one notch above. */
  --select-option-selected-bg: color-mix(in srgb, var(--ui-accent-primary-fg) 11%, transparent);

  display: flex;
  align-items: center;
  width: 100%;
  min-height: 31px;
  margin-block: 2px;
  gap: 8px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-secondary-fg);
  text-align: left;
  cursor: pointer;
}

.app-select-option:hover,
.app-select-option.highlighted {
  color: var(--ui-text-primary-fg);
  background: var(--ui-state-hover-bg);
}

.app-select-option.selected {
  color: var(--ui-accent-primary-fg);
  background: var(--select-option-selected-bg);
}

/* Hovering the row that is ALREADY selected.
 *
 * Without this rule `box` is a dead zone: `.app-select-option.selected` (0,2,0)
 * is authored after `.app-select-option:hover` (0,2,0), so the tinted slab
 * simply swallows the hover fill and the cursor changes nothing (real report).
 * A selected row is still a row you can point at, and every other register in
 * the app answers the pointer.
 *
 * `box` keeps its slab — it is the 面 register — so the only channel left is to
 * DEEPEN it. The admixture is `--ui-text-primary-fg`, the same "mix the opposite
 * tone in" move the global `.btn.primary:hover` and `RoomSurface`'s send disc
 * make: that token is dark on light themes and light on dark ones, so "one notch
 * deeper" holds in both without a hard-coded alpha or hex. Raising the accent's
 * own alpha instead would fail on dark themes, where more accent over a dark
 * panel is a smaller step than the eye needs.
 *
 * Prefixed with `--box` on purpose: (0,4,0) beats `.selected` (0,2,0) outright
 * instead of tying at (0,3,0)-vs-(0,2,0)… and, more importantly, keeps this out
 * of the 画线 panels, whose own (0,5,0) refill below is a different recipe.
 * Same selector serves `:hover` and keyboard `.highlighted` — one channel, one
 * geometry (ui-system.md §1).
 */
.app-select-dropdown--box .app-select-option.selected:hover,
.app-select-dropdown--box .app-select-option.selected.highlighted {
  background: color-mix(
    in srgb,
    var(--select-option-selected-bg) 92%,
    var(--ui-text-primary-fg)
  );
}

.app-select-option:disabled,
.app-select-group-label.disabled {
  opacity: 0.48;
  cursor: default;
}

.app-select-option-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select-option-check {
  flex: 0 0 auto;
  margin-left: auto;
}

.app-select-group-label {
  padding: 7px 8px 4px;
  color: var(--ui-text-muted-fg);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.app-select-empty,
.app-select-dropdown-extra {
  padding: 9px 10px;
  color: var(--ui-text-muted-fg);
  font-size: 12px;
}

.app-select-dropdown-header {
  border-bottom: 1px solid var(--ui-border-subtle-border, var(--border-muted));
}

.app-select-dropdown-footer {
  border-top: 1px solid var(--ui-border-subtle-border, var(--border-muted));
}

.app-select-dropdown-enter-active,
.app-select-dropdown-leave-active {
  transition: opacity var(--duration-fast) var(--ease-default), transform var(--duration-fast) var(--ease-default);
}

.app-select-dropdown-enter-from,
.app-select-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

@keyframes app-select-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
