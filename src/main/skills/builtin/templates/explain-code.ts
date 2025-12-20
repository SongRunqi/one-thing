/**
 * Built-in Skill: Explain Code
 */

import type { SkillDefinition, PromptTemplateConfig } from '../../../../shared/ipc.js'

const config: PromptTemplateConfig = {
  template: `Please explain the following code in detail:

\`\`\`
{{input}}
\`\`\`

Please provide:
1. **Overview**: What this code does at a high level
2. **Step-by-step explanation**: How it works line by line
3. **Key concepts**: Important patterns or concepts used
4. **Potential improvements**: Any suggestions for optimization or better practices`,
  systemPrompt: 'You are a helpful programming tutor who explains code clearly and thoroughly.',
  includeContext: false,
}

export const definition: SkillDefinition = {
  id: 'explain-code',
  name: 'Explain Code',
  description: 'Get a detailed explanation of any code snippet',
  type: 'prompt-template',
  source: 'builtin',
  triggers: ['/explain', '@explain'],
  icon: 'code',
  category: 'Development',
  enabled: true,
  config,
}
