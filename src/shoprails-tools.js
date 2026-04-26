import { ARC_CONFIG, atomicQueries, buyerProfile, buyerServer, demoIntents, defaultPolicy, demoWallets, merchants, offers, scorerServer, sellerServers, verifiedDemoTransactions, verifiedFunding } from "./data.js";
import { DecisionStage, createPolicyState, evaluatePurchase, getMerchant, getOffer } from "./policy.js";
import { scorePurchase } from "./scorer.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function fakeHash(...parts) {
  const input = parts.join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `0x${hex.repeat(8)}`;
}

function demoSettlementId(...parts) {
  return `demo-${fakeHash(...parts).slice(2, 12)}`;
}

function arcTxUrl(txHash) {
  return `${ARC_CONFIG.explorerUrl}/tx/${txHash}`;
}

function logTool(state, name, input, output) {
  state.toolLog.unshift({
    id: `log-${state.toolLog.length + 1}`,
    at: nowIso(),
    name,
    input,
    output
  });
}

function logLlm(state, name, prompt, output, model = "OpenClaw + ShopRails skill") {
  state.llmLog.unshift({
    id: `llm-${state.llmLog.length + 1}`,
    at: nowIso(),
    model,
    name,
    prompt,
    output
  });
}

async function logGeneratedLlm(state, llm, name, prompt, fallback) {
  const response = await llm.generateText({ name, prompt, fallback });
  const model = response.provider === "gemini" ? `Gemini ${response.model}` : response.model;
  logLlm(state, name, prompt, response.text || fallback, model);
}

function addNanoPayment(state, action) {
  const amount = Number(action.x402Price ?? action.priceUsdc ?? action.amount ?? 0);
  const provider = action.provider || "AIsa real-time catalog endpoint";
  const endpoint = action.endpoint || "/api/catalog/search";
  const request = action.query || action.request || action.purpose || "";
  const kind = action.kind || "seller_api";
  const payment = {
    id: `x402-${state.nanopayments.length + 1}`,
    protocol: "x402",
    rail: "Circle Nanopayments",
    scheme: "GatewayWalletBatched",
    chain: ARC_CONFIG.gatewaySupportedChainName,
    amount,
    kind,
    provider,
    endpoint,
    paidTo: provider,
    request,
    signature: fakeHash(action.id || paymentSeed(state), provider, endpoint, request, amount).slice(0, 18)
  };
  state.nanopayments.push(payment);
  state.wallet.nanopaymentSpent = Number((state.wallet.nanopaymentSpent + amount).toFixed(6));
  return payment;
}

function paymentSeed(state) {
  return `payment-${state.nanopayments.length + 1}`;
}

export function getNanopaymentReceipt(paymentId, currentState = null) {
  const existing = currentState?.nanopayments?.find((payment) => payment.id === paymentId);
  if (existing) {
    return {
      id: existing.id,
      protocol: existing.protocol,
      rail: existing.rail,
      scheme: existing.scheme,
      chain: existing.chain,
      currency: "USDC",
      amount: existing.amount,
      paidTo: existing.paidTo,
      provider: existing.provider,
      endpoint: existing.endpoint,
      request: existing.request,
      kind: existing.kind,
      paymentRequired: {
        network: ARC_CONFIG.gatewaySupportedChainName,
        maxAmountRequired: `${existing.amount.toFixed(6)} USDC`,
        resource: existing.endpoint,
        mimeType: "application/json"
      },
      paymentProof: {
        xPaymentHeader: fakeHash(existing.id, "x-payment", existing.amount),
        gatewayWallet: ARC_CONFIG.gatewayWalletAddress,
        signature: existing.signature
      },
      status: "accepted_for_demo",
      note: existing.kind === "scorer_api"
        ? "Hackathon receipt for a TrustRails scorer API request. Production would verify and submit through the x402 facilitator."
        : "Hackathon receipt for the x402/Circle Nanopayments data request. Production would verify and submit through the x402 facilitator."
    };
  }

  const index = Number(String(paymentId || "").replace("x402-", "")) - 1;
  const query = atomicQueries[index];
  if (!query) throw new Error(`Unknown nanopayment receipt: ${paymentId}`);

  return {
    id: `x402-${index + 1}`,
    protocol: "x402",
    rail: "Circle Nanopayments",
    scheme: "GatewayWalletBatched",
    chain: ARC_CONFIG.gatewaySupportedChainName,
    currency: "USDC",
    amount: query.x402Price,
    paidTo: "AIsa real-time catalog endpoint",
    provider: "AIsa real-time catalog endpoint",
    endpoint: "/api/catalog/search",
    kind: "seller_api",
    request: query.query,
    paymentRequired: {
      network: ARC_CONFIG.gatewaySupportedChainName,
      maxAmountRequired: `${query.x402Price} USDC`,
      resource: "premium real-time catalog search",
      mimeType: "application/json"
    },
    paymentProof: {
      xPaymentHeader: fakeHash(query.id, "x-payment", query.x402Price),
      gatewayWallet: ARC_CONFIG.gatewayWalletAddress,
      signature: fakeHash(query.id, query.query, query.x402Price).slice(0, 18)
    },
    status: "accepted_for_demo",
    note: "Hackathon receipt for the x402/Circle Nanopayments data request. Production would verify and submit through the x402 facilitator."
  };
}

function applySpend(state, result, escrow) {
  const offer = getOffer(result.offerId, state.catalog);
  const merchant = getMerchant(result.merchantId, state.merchants);

  if (escrow) {
    state.wallet.escrowed = Number((state.wallet.escrowed + result.amount).toFixed(2));
  } else {
    state.wallet.available = Number((state.wallet.available - result.amount).toFixed(2));
    state.wallet.spent = Number((state.wallet.spent + result.amount).toFixed(2));
  }

  state.categorySpend[offer.category] = Number(((state.categorySpend[offer.category] || 0) + result.amount).toFixed(2));
  state.merchantSpend[merchant.id] = Number(((state.merchantSpend[merchant.id] || 0) + result.amount).toFixed(2));
}

export function createInitialState() {
  return {
    arc: clone(ARC_CONFIG),
    wallet: {
      owner: "Buyer demo account",
      balance: defaultPolicy.totalBudget,
      available: defaultPolicy.totalBudget,
      escrowed: 0,
      spent: 0,
      nanopaymentSpent: 0,
      buyerWallet: demoWallets.buyer.circleId,
      buyerAddress: demoWallets.buyer.address,
      agentWallet: demoWallets.agent.circleId,
      agentAddress: demoWallets.agent.address,
      escrowAddress: demoWallets.escrow.address,
      gatewayBalance: defaultPolicy.totalBudget,
      onchainBalance: verifiedFunding.currentBalance,
      fundingTxHash: verifiedFunding.txHash,
      fundingBlockNumber: verifiedFunding.blockNumber
    },
    buyerProfile: clone(buyerProfile),
    architecture: {
      buyerServer: clone(buyerServer),
      sellerServers: clone(sellerServers),
      scorerServer: clone(scorerServer)
    },
    scorer: {
      provider: clone(scorerServer),
      checks: [],
      latestInput: null,
      latestOutput: null
    },
    policy: createPolicyState(),
    catalog: clone(offers),
    merchants: clone(merchants),
    categorySpend: {},
    merchantSpend: {},
    decisions: [],
    orders: [],
    reviewCart: [],
    declined: [],
    nanopayments: [],
    proofs: {
      ai: null,
      nanopayment: null,
      escrow: null,
      frequency: null,
      circleWallets: {
        mode: "adapter_ready",
        status: "local_signer_active",
        reason: "Set CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET to switch one payment to Circle Wallets API signing."
      }
    },
    toolLog: [],
    llmLog: [],
    chat: [
      {
        from: "ShopRails",
        text: "Send the prefilled request to start the agent shopping plan. After review, ask for an explanation or type 'confirm all reviewed items' to approve direct seller payments.",
        at: nowIso()
      }
    ],
    mission: {
      prompt: "Organize and setup a sushi dinner for my friends on Friday, May 1, 2026. 10 people. 7 PM. At MindsDB office. Pirate theme. Order sushi, pirate one-size costumes, cheap props, and hire a human assistant.",
      status: "ready",
      steps: []
    }
  };
}

export function walletGetBalance(state) {
  const output = {
    balance: state.wallet.balance,
    available: state.wallet.available,
    escrowed: state.wallet.escrowed,
    spent: state.wallet.spent,
    nanopaymentSpent: state.wallet.nanopaymentSpent,
    scorerNanopaymentSpent: state.nanopayments
      .filter((payment) => payment.kind === "scorer_api")
      .reduce((sum, payment) => Number((sum + Number(payment.amount || 0)).toFixed(6)), 0),
    gatewayBalance: state.wallet.gatewayBalance,
    buyerAddress: state.wallet.buyerAddress,
    agentAddress: state.wallet.agentAddress,
    escrowAddress: state.wallet.escrowAddress,
    onchainBalance: state.wallet.onchainBalance,
    fundingTxHash: state.wallet.fundingTxHash,
    currency: "USDC",
    chain: ARC_CONFIG.networkName
  };
  logTool(state, "wallet.get_balance", {}, output);
  return output;
}

export function scorerEvaluate(state, input) {
  const offer = getOffer(input.offerId, state.catalog);
  const merchant = getMerchant(offer.merchantId, state.merchants);
  const amount = Number((offer.price * (input.quantity || 1)).toFixed(2));
  const score = scorePurchase({
    buyerProfile: state.buyerProfile,
    policy: state.policy,
    offer,
    merchant,
    amount
  });
  const payment = addNanoPayment(state, {
    id: `score-${offer.id}`,
    kind: "scorer_api",
    provider: state.scorer.provider.name,
    endpoint: state.scorer.provider.endpoint,
    priceUsdc: state.scorer.provider.priceUsdc,
    request: `${state.buyerProfile.name} history + ${merchant.domain} + ${offer.id}`,
    purpose: `Score ${offer.name}`
  });
  const record = {
    id: `score-${state.scorer.checks.length + 1}`,
    at: nowIso(),
    offerId: offer.id,
    offerName: offer.name,
    merchantId: merchant.id,
    merchantName: merchant.name,
    domain: merchant.domain,
    amount,
    nanopayment: payment,
    ...score
  };
  state.scorer.checks.push(record);
  state.scorer.latestInput = score.payload;
  state.scorer.latestOutput = {
    decision: score.decision,
    decisionLabel: score.decisionLabel,
    approvalScore: score.approvalScore,
    riskScore: score.riskScore,
    reasons: score.reasons
  };
  logTool(state, "scorer.evaluate", {
    buyer: state.buyerProfile.id,
    seller: merchant.domain,
    offerId: offer.id
  }, {
    decision: score.decision,
    approvalScore: score.approvalScore,
    riskScore: score.riskScore,
    nanopayment: payment.id
  });
  return record;
}

export function catalogSearch(state, input) {
  const category = input.category || "";
  const query = input.query || "";
  const atomic = atomicQueries.find((item) => item.category === category) || {
    id: `q-${category || "general"}`,
    category,
    query,
    x402Price: 0.0001
  };
  const payment = addNanoPayment(state, atomic);
  const results = state.catalog.filter((offer) => {
    const categoryMatch = category ? offer.category === category : true;
    const queryMatch = query
      ? `${offer.name} ${offer.brand} ${offer.reason}`.toLowerCase().includes(query.toLowerCase().split(" ")[0])
      : true;
    return categoryMatch && (queryMatch || categoryMatch);
  });
  const output = { results, nanopayment: payment };
  logTool(state, "catalog.search", input, {
    count: results.length,
    nanopayment: payment
  });
  return output;
}

export function merchantGetOffer(state, input) {
  const offer = getOffer(input.offerId, state.catalog);
  const merchant = getMerchant(offer.merchantId, state.merchants);
  const output = { offer, merchant };
  logTool(state, "merchant.get_offer", input, {
    offerId: offer.id,
    merchant: merchant.name,
    domain: merchant.domain
  });
  return output;
}

export function checkoutEvaluate(state, input) {
  const scorer = scorerEvaluate(state, input);
  const output = evaluatePurchase(input, state, scorer);
  logTool(state, "checkout.evaluate", input, {
    stage: output.stage,
    amount: output.amount,
    reasons: output.reasons,
    scorerPayment: scorer.nanopayment.id
  });
  return output;
}

export function checkoutSubmit(state, input) {
  const scorer = scorerEvaluate(state, input);
  const result = evaluatePurchase(input, state, scorer);
  const simulatedSettlementId = demoSettlementId(result.offerId, result.amount, result.stage);
  const record = {
    ...result,
    scorer,
    scorerCheckId: scorer.id,
    scorerPaymentId: scorer.nanopayment.id,
    scorerScore: scorer.approvalScore,
    scorerRiskScore: scorer.riskScore,
    id: `decision-${state.decisions.length + 1}`,
    submittedAt: nowIso(),
    arc: {
      network: ARC_CONFIG.networkName,
      chainId: ARC_CONFIG.chainId,
      usdcAddress: ARC_CONFIG.usdcAddress,
      explorerUrl: ARC_CONFIG.explorerUrl
    }
  };

  if (result.stage === DecisionStage.BUY_NOW) {
    applySpend(state, result, false);
    record.escrowStatus = "settled";
    record.simulatedSettlementId = simulatedSettlementId;
    const verified = verifiedDemoTransactions[result.offerId];
    if (verified?.kind === "buy_now") {
      record.txHash = verified.txHash;
      record.onchainAmount = verified.amountUsdc;
      record.onchainBlockNumber = verified.blockNumber;
      record.realArcStatus = verified.status;
    }
    state.orders.push(record);
  } else if (result.stage === DecisionStage.REVIEW_ESCROW) {
    applySpend(state, result, true);
    record.escrowStatus = "awaiting buyer review";
    record.escrowId = `review-${state.reviewCart.length + 1}`;
    record.simulatedSettlementId = simulatedSettlementId;
    const verified = verifiedDemoTransactions[result.offerId];
    if (verified?.kind === "review_release") {
      record.txHash = verified.txHash;
      record.onchainAmount = verified.amountUsdc;
      record.onchainBlockNumber = verified.blockNumber;
      record.realArcStatus = verified.status;
      record.liveEscrowId = verified.escrowId;
      record.liveEscrowContract = verified.escrowContract;
    }
    state.reviewCart.push(record);
  } else {
    record.escrowStatus = "blocked";
    record.txHash = null;
    record.simulatedSettlementId = null;
    state.declined.push(record);
  }

  state.decisions.push(record);
  logTool(state, "checkout.submit", input, {
    stage: record.stage,
    escrowStatus: record.escrowStatus,
    txHash: record.txHash || null,
    simulatedSettlementId: record.simulatedSettlementId,
    scorerPayment: scorer.nanopayment.id
  });
  return record;
}

export function reviewList(state) {
  const output = { items: state.reviewCart, chat: state.chat };
  logTool(state, "review.list", {}, { count: state.reviewCart.length });
  return output;
}

export function reviewApprove(state, input = {}) {
  const ids = input.ids?.length ? input.ids : state.reviewCart.map((item) => item.id);
  const approved = [];
  const remaining = [];

  for (const item of state.reviewCart) {
    if (ids.includes(item.id)) {
      const releaseId = demoSettlementId("release", item.id, item.amount);
      const released = {
        ...item,
        escrowStatus: "released",
        simulatedReleaseId: releaseId,
        releasedAt: nowIso()
      };
      const verified = verifiedDemoTransactions[item.offerId];
      if (verified?.kind === "review_release") {
        released.releaseTxHash = verified.releaseTxHash || verified.txHash;
        released.onchainAmount = verified.amountUsdc;
        released.onchainBlockNumber = verified.releaseBlockNumber || verified.blockNumber;
        released.realArcStatus = verified.status;
        released.liveEscrowId = verified.escrowId || item.liveEscrowId;
        released.liveEscrowContract = verified.escrowContract || item.liveEscrowContract;
      }
      approved.push(released);
      state.orders.push(released);
      state.wallet.escrowed = Number((state.wallet.escrowed - item.amount).toFixed(2));
      state.wallet.available = Number((state.wallet.available - item.amount).toFixed(2));
      state.wallet.spent = Number((state.wallet.spent + item.amount).toFixed(2));
    } else {
      remaining.push(item);
    }
  }

  state.reviewCart = remaining;
  const output = { approved, remaining: state.reviewCart };
  logTool(state, "review.approve", input, {
    approved: approved.length,
    releasedUsdc: Number(approved.reduce((sum, item) => sum + item.amount, 0).toFixed(2))
  });
  return output;
}

export function reviewChat(state, input) {
  const message = (input.message || "").trim();
  if (!message) throw new Error("review.chat requires a message");

  state.chat.push({ from: "Buyer", text: message, at: nowIso() });

  let reply;
  if (/confirm all reviewed items/i.test(message)) {
    const result = reviewApprove(state, {});
    state.mission.status = "completed";
    if (!result.approved.length) {
      reply = "No reviewed items remain. The cart is already approved or nothing has been reviewed yet.";
    } else {
      const txLines = result.approved.flatMap((item) => [
        item.txHash ? `${item.offerName} review authorization: ${arcTxUrl(item.txHash)}` : "",
        item.releaseTxHash ? `${item.offerName} direct seller payment: ${arcTxUrl(item.releaseTxHash)}` : ""
      ]).filter(Boolean);
      reply = [
        `Confirmed ${result.approved.length} reviewed item(s). Circle Wallets submitted direct Arc USDC payment transactions to sellers.`,
        "ArcScan transactions:",
        ...txLines
      ].join("\n");
    }
  } else if (/why|explain|reason/i.test(message)) {
    const rows = state.reviewCart.length ? state.reviewCart : [...state.orders, ...state.declined];
    reply = rows.length
      ? rows.map((item) => `${item.offerName}: ${item.agentReason}`).join("\n")
      : "No items are waiting for review.";
  } else {
    reply = "I can approve reviewed items, explain why each item was chosen, or keep items waiting for review.";
  }

  state.chat.push({ from: "Shopping Cart", text: reply, at: nowIso() });
  const output = { reply, chat: state.chat };
  logTool(state, "review.chat", input, { reply });
  return output;
}

export async function runDemoMissionWithLlm(state, llm) {
  state.mission.status = "running";
  state.mission.steps = [];
  await logGeneratedLlm(
    state,
    llm,
    "llm.plan_mission",
    state.mission.prompt,
    "Split the buyer request into sushi delivery, serving kit, costumes, props, and a setup assistant. Keep total spend under 500 USDC and route human services to review."
  );
  walletGetBalance(state);

  await logGeneratedLlm(
    state,
    llm,
    "llm.expand_atomic_queries",
    "Generate purchasable searches from the party context.",
    atomicQueries.map((query) => `${query.category}: ${query.query}`).join(" | ")
  );

  for (const query of atomicQueries) {
    const search = catalogSearch(state, query);
    state.mission.steps.push({
      type: "search",
      label: query.category,
      detail: query.query,
      resultCount: search.results.length,
      nanopayment: search.nanopayment.amount
    });
  }

  await logGeneratedLlm(
    state,
    llm,
    "llm.rank_offers",
    "Pick the best offers for a 10-person pirate sushi dinner.",
    "Selected sushi for 10, serving kit, cheap props, one-size costume pack, and Maya R. for setup. Rejected the blacklisted mystery props offer despite low price."
  );

  const submitted = [];
  for (const intent of demoIntents) {
    const offer = merchantGetOffer(state, intent).offer;
    const decision = checkoutSubmit(state, intent);
    submitted.push(decision);
    state.mission.steps.push({
      type: "decision",
      label: offer.name,
      detail: decision.stage,
      amount: decision.amount
    });
  }

  await logGeneratedLlm(
    state,
    llm,
    "llm.review_summary",
    "Explain the cart state to the buyer.",
    `${state.orders.length} item(s) settled immediately, ${state.reviewCart.length} item(s) waiting for buyer review, ${state.declined.length} item(s) declined before signing.`
  );

  state.mission.status = "waiting_for_review";
  return {
    mission: state.mission,
    submitted,
    reviewItems: state.reviewCart.length,
    declined: state.declined.length,
    autoBought: state.orders.length
  };
}

export function runDemoMission(state) {
  state.mission.status = "running";
  state.mission.steps = [];
  logLlm(
    state,
    "llm.plan_mission",
    state.mission.prompt,
    "Split the buyer request into sushi delivery, serving kit, costumes, props, and a setup assistant. Keep total spend under 500 USDC and route human services to review."
  );
  walletGetBalance(state);

  logLlm(
    state,
    "llm.expand_atomic_queries",
    "Generate purchasable searches from the party context.",
    atomicQueries.map((query) => `${query.category}: ${query.query}`).join(" | ")
  );

  for (const query of atomicQueries) {
    const search = catalogSearch(state, query);
    state.mission.steps.push({
      type: "search",
      label: query.category,
      detail: query.query,
      resultCount: search.results.length,
      nanopayment: search.nanopayment.amount
    });
  }

  logLlm(
    state,
    "llm.rank_offers",
    "Pick the best offers for a 10-person pirate sushi dinner.",
    "Selected sushi for 10, serving kit, cheap props, one-size costume pack, and Maya R. for setup. Rejected the blacklisted mystery props offer despite low price."
  );

  const submitted = [];
  for (const intent of demoIntents) {
    const offer = merchantGetOffer(state, intent).offer;
    const decision = checkoutSubmit(state, intent);
    submitted.push(decision);
    state.mission.steps.push({
      type: "decision",
      label: offer.name,
      detail: decision.stage,
      amount: decision.amount
    });
  }

  logLlm(
    state,
    "llm.review_summary",
    "Explain the cart state to the buyer.",
    `${state.orders.length} item(s) settled immediately, ${state.reviewCart.length} item(s) waiting for buyer review, ${state.declined.length} item(s) declined before signing.`
  );

  state.mission.status = "waiting_for_review";
  return {
    mission: state.mission,
    submitted,
    reviewItems: state.reviewCart.length,
    declined: state.declined.length,
    autoBought: state.orders.length
  };
}
