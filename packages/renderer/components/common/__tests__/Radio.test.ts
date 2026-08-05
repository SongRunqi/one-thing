// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import Radio from '../Radio.vue'
import RadioGroup from '../RadioGroup.vue'

describe('Radio', () => {
  it('works standalone with its own v-model', async () => {
    const wrapper = mount(Radio, {
      props: { modelValue: 'b', value: 'a', label: 'Option A', name: 'demo' },
    })

    const input = wrapper.find('input[type="radio"]')
    expect(input.attributes('name')).toBe('demo')
    expect(wrapper.classes()).not.toContain('is-checked')

    await input.setValue(true)
    expect(wrapper.emitted('update:modelValue')).toEqual([['a']])

    await wrapper.setProps({ modelValue: 'a' })
    expect(wrapper.classes()).toContain('is-checked')
  })

  it('generates a name so a lone radio is still a group of one', () => {
    const wrapper = mount(Radio, { props: { value: 'x' } })
    expect(wrapper.find('input').attributes('name')).toMatch(/^app-radio-\d+$/)
  })

  it('does not emit while disabled', async () => {
    const wrapper = mount(Radio, {
      props: { modelValue: 'b', value: 'a', disabled: true },
    })

    expect(wrapper.classes()).toContain('is-disabled')
    await wrapper.find('input').trigger('change')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})

describe('RadioGroup', () => {
  const Harness = defineComponent({
    components: { Radio, RadioGroup },
    setup() {
      const picked = ref('balanced')
      return { picked }
    },
    render() {
      return h(RadioGroup, {
        'modelValue': this.picked,
        'ariaLabel': 'Response timing',
        'onUpdate:modelValue': (value: unknown) => { this.picked = value as string },
      }, () => [
        h(Radio, { value: 'fast', label: 'Fast' }),
        h(Radio, { value: 'balanced', label: 'Balanced' }),
        h(Radio, { value: 'patient', label: 'Patient', disabled: true }),
      ])
    },
  })

  it('owns the value and the native name for its members', async () => {
    const wrapper = mount(Harness)

    expect(wrapper.find('[role="radiogroup"]').attributes('aria-label')).toBe('Response timing')

    const radios = wrapper.findAllComponents(Radio)
    expect(radios).toHaveLength(3)

    const names = wrapper.findAll('input').map(input => input.attributes('name'))
    expect(new Set(names).size).toBe(1)
    expect(names[0]).toMatch(/^app-radio-group-\d+$/)

    expect(radios[1].classes()).toContain('is-checked')
    expect(radios[0].classes()).not.toContain('is-checked')

    await wrapper.findAll('input')[0].setValue(true)
    await nextTick()

    expect(radios[0].classes()).toContain('is-checked')
    expect(radios[1].classes()).not.toContain('is-checked')
  })

  it('propagates the group disabled flag to every member', async () => {
    const wrapper = mount(RadioGroup, {
      props: { modelValue: 'a', disabled: true },
      slots: { default: () => [h(Radio, { value: 'a' }), h(Radio, { value: 'b' })] },
    })

    const inputs = wrapper.findAll('input')
    expect(inputs.every(input => (input.element as HTMLInputElement).disabled)).toBe(true)

    await inputs[1].trigger('change')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
