import { createGoalTool } from '@onething/runtime/tools'
import { remainingGoalTokens } from '@onething/runtime/goals'
import { getGoal, goalLimits, updateGoalFromModel } from '../../goals/index.js'

export const GoalTool = createGoalTool({
  getGoal,
  updateGoalFromModel,
  remainingTokens: goal => remainingGoalTokens(goal, goalLimits()),
})
