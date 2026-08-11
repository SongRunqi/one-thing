import { createTaskTool } from '@onething/runtime/tools'
import { dispatchTask } from '../../tasks/dispatch.js'

/**
 * 派工工具的装配(自举差距审计 P0-3 / P0-5,`docs/audit/self-hosting-gap-audit-2026-08-11.md`)。
 *
 * 与其它 builtin 同一条口径:形状、闸的阈值、拒绝措辞在产品层
 * (`tools/builtin/task.ts` + `tasks/index.ts`),会建会话 / 驱动引擎 / 等终端事件 /
 * 回投唤醒的那台机器在 `app/tasks/dispatch.ts`。这里只是那条接线。
 *
 * **只进桌面全量档**:headless 与 readonly 都不注册它。派工会开出真会话、真花
 * token、真在本机跑工具 —— 这不是一个零副作用的动作。
 */
export const TaskTool = createTaskTool({
  dispatch: request => dispatchTask(request),
})
