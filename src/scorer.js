import { buyerProfile as defaultBuyerProfile } from "./data.js";

export const ScorerDecision = Object.freeze({
  BUY_NOW: "BUY_NOW",
  REVIEW: "REVIEW_ESCROW",
  DECLINE_BLACKLISTED: "DECLINE_BLACKLISTED",
  DECLINE_POLICY: "DECLINE_POLICY"
});

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function decisionLabel(decision) {
  return {
    [ScorerDecision.BUY_NOW]: "buy now",
    [ScorerDecision.REVIEW]: "review",
    [ScorerDecision.DECLINE_BLACKLISTED]: "blacklisted",
    [ScorerDecision.DECLINE_POLICY]: "declined"
  }[decision] || decision;
}

export function buildScorerPayload({ buyerProfile = defaultBuyerProfile, policy, offer, merchant, amount }) {
  return {
    buyer: {
      id: buyerProfile.id,
      name: buyerProfile.name,
      wallet: buyerProfile.wallet,
      successfulOrders: buyerProfile.successfulOrders,
      chargebacks: buyerProfile.chargebacks,
      categoryHistory: buyerProfile.categoryHistory?.[offer.category] || null,
      merchantHistory: buyerProfile.merchantHistory?.[merchant.domain] || null
    },
    seller: {
      id: merchant.id,
      name: merchant.name,
      domain: merchant.domain,
      wallet: merchant.wallet,
      trustTier: merchant.trustTier,
      rating: merchant.rating,
      reputationScore: merchant.reputationScore
    },
    item: {
      id: offer.id,
      name: offer.name,
      category: offer.category,
      brand: offer.brand,
      amountUsdc: amount,
      seededRiskScore: offer.riskScore
    },
    policy: {
      autoApproveLimitUsdc: policy.autoApproveByCategory?.[offer.category] ?? 0,
      categoryCapUsdc: policy.categoryCaps?.[offer.category] ?? policy.totalBudget,
      alwaysReview: policy.alwaysReviewCategories || [],
      whitelistedDomains: policy.whitelistedDomains || [],
      blacklistedDomains: policy.blacklistedDomains || [],
      blacklistedBrands: policy.blacklistedBrands || []
    }
  };
}

export function scorePurchase({ buyerProfile = defaultBuyerProfile, policy, offer, merchant, amount }) {
  const payload = buildScorerPayload({ buyerProfile, policy, offer, merchant, amount });
  const categoryHistory = payload.buyer.categoryHistory || {};
  const merchantHistory = payload.buyer.merchantHistory || {};
  const autoLimit = payload.policy.autoApproveLimitUsdc;
  const categoryAverage = Number(categoryHistory.averageUsdc || buyerProfile.averageOrderUsdc || amount || 1);
  const amountRatio = categoryAverage ? amount / categoryAverage : 1;
  const whitelisted = payload.policy.whitelistedDomains.includes(merchant.domain);
  const blacklisted = payload.policy.blacklistedDomains.includes(merchant.domain)
    || payload.policy.blacklistedBrands.includes(offer.brand)
    || merchant.trustTier === "blocked";
  const repeatMerchantBoost = Math.min(8, Number(merchantHistory.successfulOrders || 0) * 2);
  const buyerReliabilityBoost = buyerProfile.chargebacks === 0 ? 3 : -12;
  const whitelistBoost = whitelisted ? 5 : -6;
  const ratingBoost = Math.max(0, Math.round((Number(merchant.rating || 0) - 4) * 4));
  const amountAnomaly = amountRatio > 2.5 ? 8 : amountRatio > 1.5 ? 4 : 0;
  const baseRisk = Math.max(Number(offer.riskScore || 0), Number(merchant.reputationScore || 0));
  const riskScore = clamp(baseRisk + amountAnomaly - repeatMerchantBoost - buyerReliabilityBoost - whitelistBoost - ratingBoost + (blacklisted ? 45 : 0));
  const approvalScore = clamp(100 - riskScore);
  const reasons = [];

  if (blacklisted) {
    reasons.push("Seller, domain, or brand is blocked by buyer policy or scorer reputation.");
  }
  if (!whitelisted) {
    reasons.push("Seller is outside the buyer allowlist.");
  }
  if (payload.policy.alwaysReview.includes(offer.category)) {
    reasons.push("Category always requires buyer review.");
  }
  if (amount > autoLimit) {
    reasons.push(`Amount is above the ${offer.category} auto-approve limit.`);
  }
  if (amountAnomaly) {
    reasons.push("Amount is an outlier against the buyer's category purchase history.");
  }
  if (repeatMerchantBoost) {
    reasons.push("Buyer has successful prior purchases with this seller.");
  }

  let decision = ScorerDecision.BUY_NOW;
  if (blacklisted) {
    decision = ScorerDecision.DECLINE_BLACKLISTED;
  } else if (riskScore >= policy.declineRiskScore) {
    decision = ScorerDecision.DECLINE_POLICY;
  } else if (riskScore >= policy.reviewRiskScore || amount > autoLimit || payload.policy.alwaysReview.includes(offer.category) || !whitelisted) {
    decision = ScorerDecision.REVIEW;
  }

  if (!reasons.length) {
    reasons.push("Seller, buyer history, amount, and policy are within scorer buy-now bounds.");
  }

  return {
    provider: "TrustRails Scorer",
    endpoint: "/api/scorer/evaluate",
    decision,
    decisionLabel: decisionLabel(decision),
    approvalScore,
    riskScore,
    trustScore: approvalScore,
    reasons,
    payload
  };
}
