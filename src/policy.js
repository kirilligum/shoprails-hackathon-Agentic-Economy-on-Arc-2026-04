import { defaultPolicy, merchants, offers } from "./data.js";

export const DecisionStage = Object.freeze({
  BUY_NOW: "BUY_NOW",
  REVIEW_ESCROW: "REVIEW_ESCROW",
  DECLINE_BLACKLISTED: "DECLINE_BLACKLISTED",
  DECLINE_POLICY: "DECLINE_POLICY"
});

export function getOffer(offerId, catalog = offers) {
  const offer = catalog.find((item) => item.id === offerId);
  if (!offer) throw new Error(`Unknown offer: ${offerId}`);
  return offer;
}

export function getMerchant(merchantId, merchantMap = merchants) {
  const merchant = merchantMap[merchantId];
  if (!merchant) throw new Error(`Unknown merchant: ${merchantId}`);
  return merchant;
}

export function formatUsdc(amount, digits = 2) {
  return `${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })} USDC`;
}

export function createPolicyState(policy = defaultPolicy) {
  return {
    ...policy,
    autoApproveByCategory: { ...policy.autoApproveByCategory },
    categoryCaps: { ...policy.categoryCaps },
    whitelistedDomains: [...policy.whitelistedDomains],
    blacklistedDomains: [...policy.blacklistedDomains],
    blacklistedBrands: [...policy.blacklistedBrands],
    alwaysReviewCategories: [...policy.alwaysReviewCategories]
  };
}

export function buildRiskSignals(offer, merchant, policy = defaultPolicy) {
  const signals = [
    {
      code: "MERCHANT_REPUTATION",
      label: "Merchant reputation",
      score: merchant.reputationScore,
      detail: `${merchant.name} trust tier is ${merchant.trustTier}.`
    },
    {
      code: "COLLABORATIVE_PRICE_PATTERN",
      label: "Collaborative price pattern",
      score: offer.riskScore,
      detail: "Compared against anonymized seeded purchase clusters for similar agent tasks."
    }
  ];

  if (policy.blacklistedDomains.includes(merchant.domain)) {
    signals.push({
      code: "BLACKLISTED_DOMAIN",
      label: "Blacklisted domain",
      score: 100,
      detail: `${merchant.domain} is blocked by buyer policy.`
    });
  }

  if (policy.blacklistedBrands.includes(offer.brand)) {
    signals.push({
      code: "BLACKLISTED_BRAND",
      label: "Blacklisted brand",
      score: 100,
      detail: `${offer.brand} is blocked by buyer policy.`
    });
  }

  if (!policy.whitelistedDomains.includes(merchant.domain)) {
    signals.push({
      code: "DOMAIN_NOT_WHITELISTED",
      label: "Domain not whitelisted",
      score: Math.max(65, merchant.reputationScore),
      detail: `${merchant.domain} needs review because it is outside the buyer allowlist.`
    });
  }

  if (offer.category === "assistant") {
    signals.push({
      code: "HUMAN_SERVICE",
      label: "Human service",
      score: 70,
      detail: "Hiring a person requires buyer review and clear task instructions."
    });
  }

  return signals;
}

export function evaluatePurchase(intent, state) {
  const offer = getOffer(intent.offerId, state.catalog);
  const merchant = getMerchant(offer.merchantId, state.merchants);
  const policy = state.policy;
  const amount = Number((offer.price * (intent.quantity || 1)).toFixed(2));
  const spentInCategory = state.categorySpend[offer.category] || 0;
  const spentWithMerchant = state.merchantSpend[merchant.id] || 0;
  const autoLimit = policy.autoApproveByCategory[offer.category] ?? 0;
  const categoryCap = policy.categoryCaps[offer.category] ?? policy.totalBudget;
  const riskSignals = buildRiskSignals(offer, merchant, policy);
  const maxRisk = Math.max(...riskSignals.map((signal) => signal.score), offer.riskScore);
  const reasons = [];

  if (policy.blacklistedDomains.includes(merchant.domain) || policy.blacklistedBrands.includes(offer.brand)) {
    reasons.push("Seller or brand is blacklisted by buyer policy.");
    return decisionResult(DecisionStage.DECLINE_BLACKLISTED, offer, merchant, amount, riskSignals, reasons);
  }

  if (amount > state.wallet.available) {
    reasons.push(`Purchase would exceed available wallet balance of ${formatUsdc(state.wallet.available)}.`);
    return decisionResult(DecisionStage.DECLINE_POLICY, offer, merchant, amount, riskSignals, reasons);
  }

  if (state.wallet.spent + state.wallet.escrowed + amount > policy.totalBudget) {
    reasons.push(`Purchase would exceed the ${formatUsdc(policy.totalBudget)} mission budget.`);
    return decisionResult(DecisionStage.DECLINE_POLICY, offer, merchant, amount, riskSignals, reasons);
  }

  if (maxRisk >= policy.declineRiskScore) {
    reasons.push(`Risk score ${maxRisk} is above the decline threshold.`);
    return decisionResult(DecisionStage.DECLINE_POLICY, offer, merchant, amount, riskSignals, reasons);
  }

  if (policy.alwaysReviewCategories.includes(offer.category)) {
    reasons.push("Category requires human buyer review.");
  }

  if (amount > autoLimit) {
    reasons.push(`Amount ${formatUsdc(amount)} is above the ${offer.category} auto-buy limit of ${formatUsdc(autoLimit)}.`);
  }

  if (spentInCategory + amount > categoryCap) {
    reasons.push(`${offer.category} spend would pass the ${formatUsdc(categoryCap)} category review cap.`);
  }

  if (spentWithMerchant + amount > policy.merchantDailyCap) {
    reasons.push(`${merchant.name} would pass the ${formatUsdc(policy.merchantDailyCap)} merchant daily cap.`);
  }

  if (maxRisk >= policy.reviewRiskScore) {
    reasons.push(`Risk score ${maxRisk} requires review.`);
  }

  if (!policy.whitelistedDomains.includes(merchant.domain)) {
    reasons.push("Seller domain is outside the whitelist.");
  }

  if (reasons.length) {
    return decisionResult(DecisionStage.REVIEW_ESCROW, offer, merchant, amount, riskSignals, reasons);
  }

  reasons.push("Trusted seller, category, amount, and risk score are inside buyer policy.");
  return decisionResult(DecisionStage.BUY_NOW, offer, merchant, amount, riskSignals, reasons);
}

function decisionResult(stage, offer, merchant, amount, riskSignals, reasons) {
  const routeByStage = {
    [DecisionStage.BUY_NOW]: "Circle Wallets transfer on Arc USDC",
    [DecisionStage.REVIEW_ESCROW]: "Arc escrow contract, release after review",
    [DecisionStage.DECLINE_BLACKLISTED]: "Blocked before Circle signing",
    [DecisionStage.DECLINE_POLICY]: "Blocked before Circle signing"
  };

  return {
    stage,
    offerId: offer.id,
    offerName: offer.name,
    merchantId: merchant.id,
    merchantName: merchant.name,
    merchantWallet: merchant.wallet,
    domain: merchant.domain,
    category: offer.category,
    amount,
    brand: offer.brand,
    route: routeByStage[stage],
    reasons,
    riskSignals,
    agentReason: offer.reason
  };
}
