/**
 * Provider families: one vendor exposed through two credential channels —
 * a pay-per-token API provider and a subscription OAuth provider. The two
 * remain distinct providers everywhere it matters (routing, wire protocol,
 * billing's subscription-vs-api split, persisted sessions); a family only
 * merges how they are PRESENTED: one connection card, one display name.
 */
export interface ProviderFamily {
	/** Family key — equals the API member's provider id. */
	id: string;
	/** Vendor display name shown on the merged card. */
	label: string;
	apiProviderId: string;
	subscriptionProviderId: string;
	/** Short tag for the subscription channel, e.g. "Codex". */
	subscriptionTag: string;
}

export const PROVIDER_FAMILIES: ProviderFamily[] = [
	{
		id: "grok",
		label: "Grok",
		apiProviderId: "grok",
		subscriptionProviderId: "grok-oauth",
		subscriptionTag: "Subscription",
	},
	{
		id: "openai",
		label: "OpenAI",
		apiProviderId: "openai",
		subscriptionProviderId: "codex",
		subscriptionTag: "Codex",
	},
	{
		id: "claude",
		label: "Claude",
		apiProviderId: "claude",
		subscriptionProviderId: "claude-code",
		subscriptionTag: "Claude Code",
	},
];

export function providerFamilyOf(providerId: string): ProviderFamily | null {
	return (
		PROVIDER_FAMILIES.find(
			(family) =>
				family.apiProviderId === providerId ||
				family.subscriptionProviderId === providerId,
		) ?? null
	);
}

export function isSubscriptionFamilyMember(providerId: string): boolean {
	return providerFamilyOf(providerId)?.subscriptionProviderId === providerId;
}

/**
 * Display name for lists that mix members of a family, e.g. the model ledger:
 * API member reads as the vendor ("OpenAI"), the subscription member as
 * vendor · tag ("OpenAI · Codex"). Non-family providers keep their own name.
 */
export function providerFamilyDisplayName(
	providerId: string,
	fallback: string,
): string {
	const family = providerFamilyOf(providerId);
	if (!family) return fallback;
	if (family.subscriptionProviderId === providerId) {
		// "Claude" + "Claude Code" would read "Claude · Claude Code" — when the
		// tag already carries the vendor name, the tag alone is the full name.
		if (family.subscriptionTag.startsWith(family.label)) {
			return family.subscriptionTag;
		}
		return `${family.label} · ${family.subscriptionTag}`;
	}
	return family.label;
}
