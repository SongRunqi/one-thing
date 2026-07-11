import compactRaw from "./content/compact.md?raw";

// Normalize all trailing newlines so the .md file can have any number of
// trailing blank lines without changing the assembled prompt.
const normalize = (s: string) => s.replace(/\n+$/, "");

export function buildContextCompactPrompt(
	messages: string,
	previousSummary?: string,
): string {
	const staticBlock = normalize(compactRaw);
	const tail = `${
		previousSummary
			? `Existing summary JSON or text:\n${previousSummary}\n\n`
			: ""
	}Conversation history to compact:\n${messages}`;
	// Original template literal had \n\n between static block and dynamic tail
	return staticBlock + "\n\n" + tail;
}
