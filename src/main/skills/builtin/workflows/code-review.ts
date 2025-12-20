/**
 * Built-in Skill: Code Review
 *
 * A workflow skill that performs comprehensive code review
 */

import type {
  SkillDefinition,
  WorkflowConfig,
  SkillExecutionContext,
  SkillExecutionResult,
} from '../../../../shared/ipc.js'
import type { SkillHandler } from '../../types.js'

const config: WorkflowConfig = {
  parameters: [
    {
      name: 'focus',
      type: 'select',
      description: 'Review focus area',
      required: false,
      default: 'all',
      options: ['all', 'security', 'performance', 'style', 'bugs'],
    },
    {
      name: 'severity',
      type: 'select',
      description: 'Minimum severity to report',
      required: false,
      default: 'low',
      options: ['low', 'medium', 'high', 'critical'],
    },
  ],
  steps: [
    {
      id: 'analyze',
      type: 'prompt',
      name: 'Analyze Code',
      config: {
        template: 'Analyze this code for potential issues',
      },
      next: 'format',
    },
    {
      id: 'format',
      type: 'transform',
      name: 'Format Results',
      config: {
        format: 'markdown-checklist',
      },
    },
  ],
  entryStep: 'analyze',
  timeout: 30000,
}

export const handler: SkillHandler = async (
  _config: WorkflowConfig,
  context: SkillExecutionContext
): Promise<SkillExecutionResult> => {
  const focus = context.parameters?.focus || 'all'
  const severity = context.parameters?.severity || 'low'

  // Build the review prompt based on focus area
  let focusInstructions = ''
  switch (focus) {
    case 'security':
      focusInstructions = `Focus on security vulnerabilities:
- SQL injection, XSS, CSRF risks
- Authentication/authorization issues
- Sensitive data exposure
- Input validation problems`
      break
    case 'performance':
      focusInstructions = `Focus on performance issues:
- Inefficient algorithms or data structures
- Memory leaks or excessive allocations
- Unnecessary computations or I/O
- Caching opportunities`
      break
    case 'style':
      focusInstructions = `Focus on code style and readability:
- Naming conventions
- Code organization and structure
- Comments and documentation
- Consistency with best practices`
      break
    case 'bugs':
      focusInstructions = `Focus on potential bugs:
- Logic errors
- Edge cases not handled
- Null/undefined handling
- Race conditions or async issues`
      break
    default:
      focusInstructions = `Perform a comprehensive review covering:
- Security vulnerabilities
- Performance issues
- Code style and readability
- Potential bugs and edge cases`
  }

  const reviewPrompt = `Please perform a code review of the following code:

\`\`\`
${context.input}
\`\`\`

${focusInstructions}

Minimum severity level to report: **${severity}**

Please provide your review in the following format:

## Summary
Brief overview of the code quality

## Issues Found
List each issue with:
- **[SEVERITY]** Issue title
  - Description: What the issue is
  - Location: Where in the code
  - Suggestion: How to fix it

## Positive Aspects
What's done well in this code

## Recommendations
Overall suggestions for improvement`

  return {
    success: true,
    output: reviewPrompt,
    stepResults: [
      {
        stepId: 'analyze',
        output: reviewPrompt,
        duration: 0,
      },
    ],
  }
}

export const definition: SkillDefinition = {
  id: 'code-review',
  name: 'Code Review',
  description: 'Perform a comprehensive code review with configurable focus and severity',
  type: 'workflow',
  source: 'builtin',
  triggers: ['/review', '@review', '/code-review'],
  icon: 'check-circle',
  category: 'Development',
  enabled: true,
  config,
}
