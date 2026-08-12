import type {
  OnethingUsageBucket,
  OnethingUsagePricingQuality,
  OnethingUsageProjectTotals,
  OnethingUsageSummaryGranularity,
} from "@onething/runtime/usage";

export type { OnethingUsageBreakdownEntry, OnethingUsageBucket, OnethingUsagePricingQuality, OnethingUsageProjectTotals, OnethingUsageSummaryGranularity } from "@onething/runtime/usage";

export interface GetUsageSummaryRequest {
  granularity: OnethingUsageSummaryGranularity;
  count?: number;
}

export interface GetUsageSummaryResponse {
  granularity: OnethingUsageSummaryGranularity;
  buckets: OnethingUsageBucket[];
  totalApiCostUSD: number;
  totalSubscriptionCostUSD: number;
  pricingQuality: OnethingUsagePricingQuality;
  byProject: OnethingUsageProjectTotals[];
}

export interface GetSessionUsageRequest {
  sessionId: string;
}

export interface GetSessionUsageResponse {
  apiCostUSD: number;
  subscriptionCostUSD: number;
  turnCount: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
    totalTokens: number;
  };
}
