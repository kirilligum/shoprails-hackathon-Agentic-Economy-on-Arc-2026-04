import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState, reviewChat, runDemoMission } from "../src/shoprails-tools.js";
import { DecisionStage } from "../src/policy.js";

test("demo mission produces buy-now, review, declined, and nanopayment records", () => {
  const state = createInitialState();
  const result = runDemoMission(state);

  assert.equal(result.autoBought, 3);
  assert.equal(result.reviewItems, 2);
  assert.equal(result.declined, 1);
  assert.equal(state.nanopayments.length, 5);
  assert.ok(state.wallet.nanopaymentSpent > 0);
  assert.ok(state.decisions.some((decision) => decision.stage === DecisionStage.DECLINE_BLACKLISTED));
});

test("review chat confirmation releases all escrowed purchases", () => {
  const state = createInitialState();
  runDemoMission(state);

  assert.equal(state.reviewCart.length, 2);
  assert.equal(state.wallet.escrowed, 210);

  const response = reviewChat(state, { message: "confirm all reviewed items" });

  assert.match(response.reply, /Confirmed 2/);
  assert.equal(state.reviewCart.length, 0);
  assert.equal(state.wallet.escrowed, 0);
  assert.equal(state.wallet.spent, 451);
});
