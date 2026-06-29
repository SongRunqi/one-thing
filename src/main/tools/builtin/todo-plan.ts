import { createTodoPlanTool } from '@onething/runtime/tools'
import {
  createUserTodoNote,
  deleteUserTodoNote,
  readTodoPlanSnapshot,
  renameUserTodoNote,
  updateTodoPlanDocument,
} from '../../todo-plan/store.js'

export const TodoPlanTool = createTodoPlanTool({
  readSnapshot: readTodoPlanSnapshot,
  createUserNote: createUserTodoNote,
  updateDocument: updateTodoPlanDocument,
  renameUserNote: renameUserTodoNote,
  deleteUserNote: deleteUserTodoNote,
})
