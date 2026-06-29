type MaybePromise<T> = T | Promise<T>

export interface OnethingProviderUsageTokenLike {
  accountId?: string
  email?: string
  planType?: string
  isFedrampAccount?: boolean
}

export interface OnethingProviderUsageAccount {
  id?: string
  email?: string
  planType?: string
  isFedramp?: boolean
}

export interface GetOnethingProviderUsageOptions<
  TToken extends OnethingProviderUsageTokenLike = OnethingProviderUsageTokenLike,
  TUsage = unknown,
> {
  providerId: string
  codexProviderIds?: readonly string[]
  canonicalCodexProviderId?: string
  refreshTokenIfNeeded(providerId: string): MaybePromise<TToken>
  fetchCodexUsage(token: TToken): MaybePromise<TUsage>
  now?(): number
  errorMessage?(error: unknown): string
}

export type GetOnethingProviderUsageResult<TUsage = unknown> =
  | {
      success: true
      providerId: string
      unsupported: true
    }
  | {
      success: true
      providerId: string
      capturedAt: number
      account: OnethingProviderUsageAccount
      usage: TUsage
    }
  | {
      success: false
      providerId: string
      error: string
    }

export function onethingProviderUsageAccountFromToken(
  token: OnethingProviderUsageTokenLike,
): OnethingProviderUsageAccount {
  return {
    id: token.accountId,
    email: token.email,
    planType: token.planType,
    isFedramp: token.isFedrampAccount,
  }
}

export async function getOnethingProviderUsage<
  TToken extends OnethingProviderUsageTokenLike,
  TUsage,
>(
  options: GetOnethingProviderUsageOptions<TToken, TUsage>,
): Promise<GetOnethingProviderUsageResult<TUsage>> {
  const codexProviderIds = options.codexProviderIds ?? ['codex']
  const canonicalCodexProviderId = options.canonicalCodexProviderId ?? codexProviderIds[0] ?? 'codex'

  if (!codexProviderIds.includes(options.providerId)) {
    return {
      success: true,
      providerId: options.providerId,
      unsupported: true,
    }
  }

  try {
    const token = await options.refreshTokenIfNeeded(canonicalCodexProviderId)
    const usage = await options.fetchCodexUsage(token)
    return {
      success: true,
      providerId: canonicalCodexProviderId,
      capturedAt: options.now?.() ?? Date.now(),
      account: onethingProviderUsageAccountFromToken(token),
      usage,
    }
  } catch (error) {
    return {
      success: false,
      providerId: canonicalCodexProviderId,
      error: options.errorMessage?.(error)
        ?? (error instanceof Error && error.message ? error.message : 'Failed to fetch provider usage'),
    }
  }
}
