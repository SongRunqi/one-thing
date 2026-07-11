import dailyNoteRaw from "../content/memory-daily-note.md?raw";
import reviewRaw from "../content/memory-review.md?raw";
import captureRaw from "../content/memory-capture.md?raw";
import dreamingRaw from "../content/memory-dreaming.md?raw";

// Normalize trailing newlines so that the .md file can end with \n
// without changing the runtime value. Original code used .join(' '),
// which produces no trailing newline.
const normalize = (s: string) => s.replace(/\n+$/, "");

export const CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT =
	normalize(dailyNoteRaw);
export const CORE_SOUL_MEMORY_MEMORY_FLUSH_SYSTEM_PROMPT =
	CORE_SOUL_MEMORY_DAILY_NOTE_EXTRACTION_SYSTEM_PROMPT;
export const CORE_SOUL_MEMORY_REVIEW_SYSTEM_PROMPT = normalize(reviewRaw);
export const CORE_SOUL_MEMORY_CAPTURE_SYSTEM_PROMPT = normalize(captureRaw);
export const CORE_SOUL_MEMORY_DREAMING_SYSTEM_PROMPT = normalize(dreamingRaw);
