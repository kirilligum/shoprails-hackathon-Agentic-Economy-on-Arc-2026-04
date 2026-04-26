import { buyerProfile, defaultPolicy, merchants, offers, scorerServer } from "../src/data.js";
import { scorePurchase } from "../src/scorer.js";
import { json, readJson, handleOptions } from "./shared.js";

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

function manifest(request) {
  const origin = new URL(request.url).origin;
  return {
    service: scorerServer.name,
    role: scorerServer.role,
    workerUrl: origin,
    wallet: scorerServer.wallet,
    endpoint: `${origin}${scorerServer.endpoint}`,
    priceUsdc: scorerServer.priceUsdc.toFixed(6),
    x402: {
      rail: "Circle Nanopayments",
      scheme: "GatewayWalletBatched",
      mode: "demo_receipt"
    }
  };
}

function evaluate(input = {}) {
  const offer = offers.find((item) => item.id === (input.offerId || "crew-costume-pack")) || offers[0];
  const merchant = merchants[offer.merchantId];
  const amount = Number((offer.price * (input.quantity || 1)).toFixed(2));
  const score = scorePurchase({
    buyerProfile,
    policy: defaultPolicy,
    offer,
    merchant,
    amount
  });
  const payment = {
    id: `x402-scorer-${offer.id}`,
    protocol: "x402",
    rail: "Circle Nanopayments",
    scheme: "GatewayWalletBatched",
    provider: scorerServer.name,
    endpoint: scorerServer.endpoint,
    kind: "scorer_api",
    amount: scorerServer.priceUsdc,
    paidTo: scorerServer.wallet,
    request: `${buyerProfile.name} history + ${merchant.domain} + ${offer.id}`,
    signature: fakeHash(offer.id, merchant.domain, scorerServer.priceUsdc).slice(0, 18)
  };

  return {
    ...score,
    input: score.payload,
    nanopayment: payment,
    note: "Separate Cloudflare Worker for independent TrustRails scoring. Buyer sends history and seller/item metadata; scorer returns a decision hint."
  };
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return handleOptions();
    const url = new URL(request.url);
    const body = request.method === "POST" ? await readJson(request) : {};

    if (url.pathname === "/" || url.pathname === "/.well-known/shoprails.json") {
      return json(manifest(request));
    }

    if (url.pathname === "/api/scorer/evaluate") {
      return json(evaluate(body.offerId ? body : Object.fromEntries(url.searchParams)));
    }

    return json({ error: "Unknown scorer route" }, 404);
  }
};
