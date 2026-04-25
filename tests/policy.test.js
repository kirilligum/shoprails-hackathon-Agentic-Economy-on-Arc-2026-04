import test from "node:test";
import assert from "node:assert/strict";
import { DecisionStage, evaluatePurchase } from "../src/policy.js";
import { createInitialState } from "../src/shoprails-tools.js";

test("trusted sushi under category threshold is buy now", () => {
  const state = createInitialState();
  const decision = evaluatePurchase({ offerId: "sushi-party-set" }, state);

  assert.equal(decision.stage, DecisionStage.BUY_NOW);
  assert.equal(decision.amount, 184);
});

test("category cap breach goes to review escrow", () => {
  const state = createInitialState();
  state.policy.autoApproveByCategory.costumes = 200;
  state.categorySpend.costumes = 100;

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
