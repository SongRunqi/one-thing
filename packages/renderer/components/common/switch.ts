import type { Component } from 'vue'

export type SwitchValue = boolean | string | number
export type SwitchSize = '' | 'small' | 'default' | 'large'
export type SwitchIcon = string | Component
export type SwitchBeforeChange = () => boolean | Promise<boolean>

