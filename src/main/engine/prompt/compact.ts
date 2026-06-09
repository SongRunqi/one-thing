/**
 * Context Compaction Prompt
 *
 * Builds the summarization prompt used when compacting long conversation history.
 */

export function buildContextCompactPrompt(messages: string, previousSummary?: string): string {
  return `You are a conversation summarization assistant. Please read the following conversation history and generate a structured summary.\n\n${previousSummary ? `## Existing Summary\n${previousSummary}\n\nUpdate and merge this existing summary with the additional conversation history below. Do not duplicate details.\n\n` : ''}## Conversation History\n${messages}\n\n## Task\nGenerate a summary that includes:\n1. **Main Topics**: What was primarily discussed\n2. **Key Decisions**: Important decisions or conclusions made\n3. **Context Information**: User preferences, conventions, important background\n4. **Ongoing Tasks**: Incomplete items or to-dos\n\n## Requirements\n- Output in clear Markdown format\n- Keep it within 500 words\n- Preserve all important technical details and context\n- Use third person description ("The user mentioned...", "The assistant suggested...")`
}
