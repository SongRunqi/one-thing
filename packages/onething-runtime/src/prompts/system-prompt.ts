import defaultSystemRaw from "./content/default-system.md?raw";
import guidelinesRaw from "./content/tool-guidelines.md?raw";
import rulesRaw from "./content/tool-workspace-rules.md?raw";
import knownProjectsRaw from "./content/known-projects-instructions.md?raw";

// Normalize all trailing newlines so the .md file can have any number of
// trailing blank lines without changing the runtime value.
const normalize = (s: string) => s.replace(/\n+$/, "");

// Split a .md file into lines (original arrays were one element per line).
// Filter empty strings so trailing blank lines in .md don't create phantom elements.
const splitLines = (s: string) => normalize(s).split("\n").filter(Boolean);

export const ONETHING_DEFAULT_SYSTEM_PROMPT = normalize(defaultSystemRaw);
export const ONETHING_TOOL_GUIDELINES = splitLines(guidelinesRaw);
export const ONETHING_TOOL_WORKSPACE_RULES = splitLines(rulesRaw);
export const ONETHING_KNOWN_PROJECTS_INSTRUCTIONS = normalize(knownProjectsRaw);
