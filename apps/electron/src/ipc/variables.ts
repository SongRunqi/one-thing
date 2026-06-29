import { IPC_CHANNELS } from '@shared/ipc.js'
import {
  deleteOnethingVariableForIpc,
  listOnethingVariablesForIpc,
  setOnethingVariableForIpc,
  type VariablesDeleteRequest,
  type VariablesListRequest,
  type VariablesSetRequest,
} from '@onething/runtime/variables'
import { getVariableRegistry } from '@onething/runtime/variables/registry'
import { registerElectronVariablesIpcHandlers } from './variables-controller.js'

export { registerElectronVariablesIpcHandlers } from './variables-controller.js'
export type {
  ElectronIpcMainLike,
  ElectronVariablesIpcChannels,
  RegisterElectronVariablesIpcHandlersOptions,
} from './variables-controller.js'

export function registerVariableHandlers(): void {
  registerElectronVariablesIpcHandlers({
    channels: {
      list: IPC_CHANNELS.VARIABLES_LIST,
      set: IPC_CHANNELS.VARIABLES_SET,
      delete: IPC_CHANNELS.VARIABLES_DELETE,
    },
    listVariables: (request: VariablesListRequest) => {
      return listOnethingVariablesForIpc({
        request,
        listVariables: context => getVariableRegistry().list(context),
      })
    },
    setVariable: (request: VariablesSetRequest) => {
      return setOnethingVariableForIpc({
        request,
        setVariable: (context, input) => getVariableRegistry().set(context, input),
      })
    },
    deleteVariable: (request: VariablesDeleteRequest) => {
      return deleteOnethingVariableForIpc({
        request,
        deleteVariable: (context, name, scope) => getVariableRegistry().delete(context, name, scope),
      })
    },
    logger: console,
  })
}
