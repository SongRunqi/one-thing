/**
 * Built-in Skills Registration
 */

import { registerSkill } from '../registry.js'

// Import prompt template skills
import { definition as explainCode } from './templates/explain-code.js'
import { definition as summarize } from './templates/summarize.js'
import { definition as translate } from './templates/translate.js'

// Import workflow skills
import { definition as codeReview, handler as codeReviewHandler } from './workflows/code-review.js'

// List of all built-in prompt template skills
const builtinTemplates = [explainCode, summarize, translate]

// List of all built-in workflow skills with handlers
const builtinWorkflows = [{ definition: codeReview, handler: codeReviewHandler }]

/**
 * Register all built-in skills with the registry
 */
export function registerBuiltinSkills(): void {
  // Register prompt templates (use default handler)
  for (const skill of builtinTemplates) {
    registerSkill(skill)
  }

  // Register workflows with custom handlers
  for (const { definition, handler } of builtinWorkflows) {
    registerSkill(definition, handler)
  }

  console.log(
    `[BuiltinSkills] Registered ${builtinTemplates.length + builtinWorkflows.length} built-in skills`
  )
}
