import {
	VariableError,
	isReservedName,
	type ContextVariable,
} from "@onething/runtime/variables";

/**
 * Trust guard for variable access from externally-routed sessions.
 *
 * Sessions routed from external identities (gateway IM contacts, API callers)
 * carry originIdentityKey; desktop/voice sessions never do. Global-effect
 * variables (scope=global custom vars, note directories) are shared across
 * every session — letting an external contact write them would inject text
 * into the owner's prompts, and listing them would leak owner context.
 */

// Reserved names that write to global state even without scope="global"
// (NotesProvider claims them regardless of the declared scope).
const GLOBAL_EFFECT_NAMES = new Set([
	"ai_note_dir",
	"user_note_dir",
	"work_note_dir",
]);

export interface ChannelGuardSession {
	originIdentityKey?: string;
}

export interface ChannelSessionGuard {
	isExternalIdentitySession(sessionId: string): boolean;
	/** Hide custom global variables from externally-routed sessions. */
	filterVariablesForSession(
		sessionId: string,
		variables: ContextVariable[],
	): ContextVariable[];
	/** Throw FORBIDDEN when an external session writes global-effect state. */
	assertExternalWriteAllowed(
		sessionId: string,
		name: string | undefined,
		scope: "global" | "session" | undefined,
	): void;
}

export function createChannelSessionGuard(
	getSession: (sessionId: string) => ChannelGuardSession | undefined,
): ChannelSessionGuard {
	const isExternalIdentitySession = (sessionId: string): boolean =>
		Boolean(getSession(sessionId)?.originIdentityKey);

	return {
		isExternalIdentitySession,

		filterVariablesForSession(sessionId, variables) {
			if (!isExternalIdentitySession(sessionId)) return variables;
			// Custom global-store variables are owner context; reserved global
			// names (note dirs) stay visible because workspace plumbing relies
			// on them.
			return variables.filter(
				(variable) =>
					!(variable.scope === "global" && !isReservedName(variable.name)),
			);
		},

		assertExternalWriteAllowed(sessionId, name, scope) {
			if (!isExternalIdentitySession(sessionId)) return;
			if (scope !== "global" && !(name && GLOBAL_EFFECT_NAMES.has(name)))
				return;
			throw new VariableError(
				"FORBIDDEN",
				"Global variables are shared across all sessions and cannot be modified from a channel or API session. Use a session-scoped variable instead.",
			);
		},
	};
}
