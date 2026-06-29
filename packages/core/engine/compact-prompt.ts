export function buildContextCompactPrompt(messages: string, previousSummary?: string): string {
  return `You are an AI agent context compaction assistant.
Compress the conversation history into stable structured JSON. Return valid JSON only, with no Markdown fences and no extra text.

Use this exact object shape:
{
  "goal": "The user's core goal in one sentence",
  "completed": ["Completed steps, one sentence each"],
  "pending": ["Unfinished steps that must not be dropped"],
  "key_findings": ["Important facts, constraints, errors, or discoveries"],
  "decisions": ["Important decisions plus the reason for each decision"],
  "artifacts": ["Files, code, outputs, or references created or changed, including paths when available"]
}

Rules:
- Preserve causal chains behind decisions, not only conclusions.
- Preserve file names, paths, code-change intent, and test results.
- Preserve errors, failed attempts, and retry reasons so the agent does not repeat them.
- Never drop pending steps.
- Merge with the existing summary when one is supplied, without duplicating details.
- Keep each array concise, but prefer retaining important specifics over shortening aggressively.

${previousSummary ? `Existing summary JSON or text:\n${previousSummary}\n\n` : ''}Conversation history to compact:
${messages}`
}
