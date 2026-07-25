import { createRadioTool } from '@onething/runtime/tools'
import { radioToolClose, radioToolOpen, radioToolStatus, requestSong } from '../../music/radio.js'

export const RadioTool = createRadioTool({
  open: radioToolOpen,
  close: radioToolClose,
  status: radioToolStatus,
  request: requestSong,
})
