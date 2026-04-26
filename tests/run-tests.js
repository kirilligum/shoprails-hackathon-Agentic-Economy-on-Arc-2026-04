import assert from "node:assert/strict";
import { DecisionStage, evaluatePurchase } from "../src/policy.js";
import { createLlmProvider } from "../src/llm-providers.js";
import { createInitialState, reviewChat, runDemoMission, runDemoMissionWithLlm } from "../src/shoprails-tools.js";

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("trusted sushi under category threshold is buy now", () => {
  const state = createInitialState();
  const decision = evaluatePurchase({ offerId: "sushi-party-set" }, state);

  assert.equal(decision.stage, DecisionStage.BUY_NOW);
  assert.equal(decision.amount, 184);
});

test("category cap breach goes to review escrow", () => {
  const state = createInitialState();
  state.policy.autoApproveByCategory.costumes = 200;
  state.categorySpend.costumes = 130;

  const decision = evaluatePurchase({ offerId: "crew-costume-pack" }, state);

  assert.equal(decision.stage, DecisionStage.REVIEW_ESCROW);
  assert.match(decision.reasons.join(" "), /category review cap/);
});

test("blacklisted domain or brand declines before signing", () => {
  const state = createInitialState();
  const decision = evaluatePurchase({ offerId: "blacklisted-props" }, state);

  assert.equal(decision.stage, DecisionStage.DECLINE_BLACKLISTED);
  assert.match(decision.route, /Blocked/);
});

test("high risk unverified seller requires review", () => {
  const state = createInitialState();
  const decision = evaluatePurchase({ offerId: "gold-compass-listing" }, state);

  assert.equal(decision.stage, DecisionStage.REVIEW_ESCROW);
  assert.match(decision.reasons.join(" "), /Risk score|outside the whitelist/);
});

test("total budget exceeded declines before signing", () => {
  const state = createInitialState();
  state.wallet.available = 10;

  const decision = evaluatePurchase({ offerId: "sushi-party-set" }, state);

  assert.equal(decision.stage, DecisionStage.DECLINE_POLICY);
  assert.match(decision.reasons.join(" "), /available wallet balance/);
});

test("demo mission produces buy-now, review, declined, and scorer nanopayment records", () => {
  const state = createInitialState();
  const result = runDemoMission(state);

  assert.equal(result.autoBought, 3);
  assert.equal(result.reviewItems, 2);
  assert.equal(result.declined, 1);
  assert.equal(state.nanopayments.length, 11);
  assert.equal(state.scorer.checks.length, 6);
  assert.equal(state.nanopayments.filter((payment) => payment.kind === "scorer_api").length, 6);
  assert.ok(state.wallet.nanopaymentSpent > 0);
  assert.ok(state.decisions.some((decision) => decision.stage === DecisionStage.DECLINE_BLACKLISTED));
});

test("scorer nanopayments are far smaller than purchase prices", () => {
  const state = createInitialState();
  runDemoMission(state);

  const smallestPurchase = Math.min(...state.catalog.map((offer) => offer.price));
  const largestScorerPayment = Math.max(...state.nanopayments
    .filter((payment) => payment.kind === "scorer_api")
    .map((payment) => payment.amount));

  assert.ok(smallestPurchase / largestScorerPayment >= 10000);
});

test("review chat confirmation approves all reviewed purchases", () => {
  const state = createInitialState();
  runDemoMission(state);

  assert.equal(state.reviewCart.length, 2);
  assert.equal(state.wallet.escrowed, 155);
  assert.equal(state.wallet.available, 260);

  const response = reviewChat(state, { message: "confirm all reviewed items" });

  assert.match(response.reply, /Confirmed 2/);
  assert.equal(state.reviewCart.length, 0);
  assert.equal(state.wallet.escrowed, 0);
  assert.equal(state.wallet.available, 105);
  assert.equal(state.wallet.spent, 395);
});

test("async demo mission supports the mock LLM provider", async () => {
  const state = createInitialState();
  const result = await runDemoMissionWithLlm(state, createLlmProvider("mock"));

  assert.equal(result.autoBought, 3);
  assert.equal(state.llmLog.length, 4);
  assert.ok(state.llmLog.every((entry) => entry.model === "mock-shoprails-llm"));
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(error.stack || error.message);
  }
}

if (failed) {
  console.error(`${failed} test(s) failed`);
  process.exit(1);
}

console.log(`${tests.length} test(s) passed`);
