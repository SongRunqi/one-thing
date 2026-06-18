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
              class="app-select-tag app-select-tag-count"
              :title="collapseTagsTooltip ? hiddenTagLabel : undefined"
            >
              +{{ hiddenTagCount }}
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
          ref="dropdownRef"
          class="app-select-dropdown"
          :class="popperClass"
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
  type StyleValue,
} from 'vue'
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
  placement?: 'top' | 'bottom'
  teleported?: boolean
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
  teleported: false,
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
const isOpen = ref(false)
const searchQuery = ref('')
const highlightedKey = ref<string | null>(null)
const listboxId = `app-select-listbox-${++selectIdCounter}`
const teleportedRect = ref<{ left: number; top: number; bottom: number; width: number } | null>(null)
let remoteTimer: ReturnType<typeof setTimeout> | null = null

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

const dropdownStyle = computed<StyleValue>(() => {
  const style: Record<string, string> = {}

  if (componentProps.teleported) {
    const rect = teleportedRect.value
    style.position = 'fixed'
    if (rect) {
      style.left = `${Math.round(rect.left)}px`
      style.minWidth = `${Math.round(rect.width)}px`
      if (componentProps.fitInputWidth) {
        style.width = `${Math.round(rect.width)}px`
      }

      if (componentProps.placement === 'top') {
        style.bottom = `${Math.round(Math.max(8, window.innerHeight - rect.top + componentProps.offset))}px`
        style.maxHeight = `${Math.round(Math.min(268, Math.max(96, rect.top - componentProps.offset - 8)))}px`
      } else {
        style.top = `${Math.round(rect.bottom + componentProps.offset)}px`
        style.maxHeight = `${Math.round(Math.min(268, Math.max(96, window.innerHeight - rect.bottom - componentProps.offset - 8)))}px`
      }
    }
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
    nextTick(() => {
      updateDropdownPosition()
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
  updateDropdownPosition()
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

  if (
    componentProps.defaultFirstOption ||
    !highlightedKey.value ||
    !options.some(option => option.key === highlightedKey.value)
  ) {
    highlightedKey.value = options[0].key
  }
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

function updateDropdownPosition() {
  if (!componentProps.teleported) return
  const rect = controlRef.value?.getBoundingClientRect()
  if (!rect) return
  teleportedRect.value = {
    left: rect.left,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
  }
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
  document.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('resize', updateDropdownPosition)
  window.addEventListener('scroll', updateDropdownPosition, true)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
  window.removeEventListener('resize', updateDropdownPosition)
  window.removeEventListener('scroll', updateDropdownPosition, true)
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
  color: var(--ui-text-primary-fg, var(--text));
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
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-input-bg, var(--bg-input, var(--bg)));
  color: var(--ui-text-primary-fg, var(--text));
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
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

.app-select-control:hover,
.app-select.is-open .app-select-control,
.app-select-control:focus {
  border-color: var(--ui-border-focus-border, var(--ui-accent-primary-fg, var(--accent)));
  background: var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg)));
}

.app-select-control:focus {
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 24%, transparent);
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
  color: var(--ui-text-muted-fg, var(--muted));
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
  color: var(--ui-text-primary-fg, var(--text));
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-select-single-value.is-placeholder,
.app-select-placeholder {
  color: var(--ui-text-muted-fg, var(--muted));
}

.app-select-input {
  flex: 1 1 40px;
  min-width: 24px;
  height: 24px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ui-text-primary-fg, var(--text));
}

.app-select-input::placeholder {
  color: var(--ui-text-muted-fg, var(--muted));
}

.app-select-tag {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  height: 22px;
  min-width: 0;
  gap: 4px;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 26%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 10%, transparent);
  color: var(--ui-text-primary-fg, var(--text));
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
  color: var(--ui-text-muted-fg, var(--muted));
}

.app-select-tag-close:hover {
  color: var(--ui-text-primary-fg, var(--text));
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
  color: var(--ui-text-muted-fg, var(--muted));
  cursor: pointer;
}

.app-select-clear:hover {
  color: var(--ui-text-primary-fg, var(--text));
  background: var(--ui-state-hover-bg, var(--hover));
}

.app-select-chevron {
  transition: transform 0.16s ease;
}

.app-select.is-open .app-select-chevron {
  transform: rotate(180deg);
}

.app-select-loading-icon {
  animation: app-select-spin 0.9s linear infinite;
}

.app-select-dropdown {
  position: absolute;
  z-index: calc(var(--z-dropdown, 100) + 20);
  left: 0;
  min-width: 100%;
  max-width: min(360px, calc(100vw - 24px));
  max-height: 268px;
  overflow: auto;
  padding: 5px;
  border: 1px solid var(--ui-border-default-border, var(--border));
  border-radius: 8px;
  background: var(--ui-surface-elevated-bg, var(--bg-elevated, var(--bg)));
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.18);
}

.app-select-option {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 31px;
  gap: 8px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-secondary-fg, var(--text-secondary, var(--text)));
  text-align: left;
  cursor: pointer;
}

.app-select-option:hover,
.app-select-option.highlighted {
  color: var(--ui-text-primary-fg, var(--text));
  background: var(--ui-state-hover-bg, var(--hover));
}

.app-select-option.selected {
  color: var(--ui-accent-primary-fg, var(--accent));
  background: color-mix(in srgb, var(--ui-accent-primary-fg, var(--accent)) 11%, transparent);
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
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.app-select-empty,
.app-select-dropdown-extra {
  padding: 9px 10px;
  color: var(--ui-text-muted-fg, var(--muted));
  font-size: 12px;
}

.app-select-dropdown-header {
  border-bottom: 1px solid var(--ui-border-subtle-border, var(--border-muted, var(--border)));
}

.app-select-dropdown-footer {
  border-top: 1px solid var(--ui-border-subtle-border, var(--border-muted, var(--border)));
}

.app-select-dropdown-enter-active,
.app-select-dropdown-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
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
