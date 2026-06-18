import { defineComponent, type PropType, type VNodeChild } from 'vue'

type RenderFunction = (context: never) => VNodeChild

export default defineComponent({
  name: 'VirtualTableRender',
  props: {
    render: {
      type: Function as PropType<RenderFunction | undefined>,
      default: undefined,
    },
    context: {
      type: Object as PropType<unknown>,
      required: true,
    },
    fallback: {
      type: [String, Number, Boolean, Object, Array] as PropType<VNodeChild>,
      default: '',
    },
  },
  setup(props) {
    return () => props.render ? props.render(props.context as never) : props.fallback
  },
})
