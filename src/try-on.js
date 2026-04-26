import { ARC_CONFIG, merchants, offers, scorerServer } from "./data.js";

export const TRY_ON_PERSON_IMAGE = "/artifacts/kirill_standing.jpg";
export const TRY_ON_IMAGE_MODEL = "gemini-3.1-flash-image-preview";
export const TRY_ON_NANO_AMOUNT = 0.000001;

export function tryOnCacheKey(offerId, model = TRY_ON_IMAGE_MODEL) {
  return `tryon:kirill:${offerId}:${model}`;
}

export function tryOnFileName(offerId, model = TRY_ON_IMAGE_MODEL) {
  return `try-on-${offerId}-kirill-${model}.png`;
}

export function getCostumeTryOnOffer(offerId, catalog = offers) {
  const offer = catalog.find((item) => item.id === offerId);
  if (!offer) {
    throw new Error(`Unknown costume offer: ${offerId}`);
  }
  if (offer.category !== "costumes") {
    throw new Error(`Virtual try-on is only available for costume offers. ${offer.name} is ${offer.category}.`);
  }
  const merchant = merchants[offer.merchantId];
  if (!merchant || offer.merchantId !== "sevenseas-costumes") {
    throw new Error("Virtual try-on is only enabled for the Seven Seas costume seller.");
  }
  return { offer, merchant };
}

export function buildTryOnPrompt(offer) {
  return [
    "Create a realistic fashion e-commerce virtual try-on image using the provided full-body reference photo.",
    "",
    "Preserve the person's face, identity, body shape, stance, camera angle, lighting, and background as much as possible.",
    `Replace only the visible outfit/accessories with the selected pirate costume: ${offer.name}.`,
    "Make the outfit look naturally worn, correctly scaled to the body, with believable fabric drape and clean product styling.",
    "",
    "Keep it presentation-safe and retail-ready. No weapons, no text overlays, no logos, no watermark-like text, no extra people, no distorted hands or face.",
    "Output a polished full-body fashion-store preview."
  ].join("\n");
}

export function buildTryOnNanoActions(offerId, catalog = offers) {
  const { offer, merchant } = getCostumeTryOnOffer(offerId, catalog);
  const amountUsdc = TRY_ON_NANO_AMOUNT.toFixed(6);

  return [
    {
      id: `tryon-${offer.id}-catalog`,
      kind: "tryon_catalog_search",
      action: "Seller catalog search",
      provider: merchant.name,
      endpoint: "/api/catalog/search",
      request: `Find pirate costume alternatives matching ${offer.name}`,
      amountUsdc,
      amount: TRY_ON_NANO_AMOUNT,
      paidTo: merchant.wallet
    },
    {
      id: `tryon-${offer.id}-availability`,
      kind: "tryon_availability",
      action: "Seller availability check",
      provider: merchant.name,
      endpoint: "/api/availability",
      request: `Check quantity and Friday delivery for ${offer.name}`,
      amountUsdc,
      amount: TRY_ON_NANO_AMOUNT,
      paidTo: merchant.wallet
    },
    {
      id: `tryon-${offer.id}-scorer`,
      kind: "tryon_scorer",
      action: "TrustRails scorer check",
      provider: scorerServer.name,
      endpoint: scorerServer.endpoint,
      request: `Score buyer history, ${merchant.domain}, and ${offer.name}`,
      amountUsdc,
      amount: TRY_ON_NANO_AMOUNT,
      paidTo: scorerServer.wallet
    },
    {
      id: `tryon-${offer.id}-visualize`,
      kind: "visualization_api",
      action: "Nano Banana costume visualization",
      provider: "Seven Seas Visualizer",
      endpoint: "/api/visualize-costume",
      request: `Generate Kirill virtual try-on for ${offer.name}`,
      amountUsdc,
      amount: TRY_ON_NANO_AMOUNT,
      paidTo: merchant.wallet,
      model: TRY_ON_IMAGE_MODEL
    }
  ].map((action, index) => ({
    ...action,
    index: index + 1,
    protocol: "x402",
    rail: "Circle Nanopayments",
    scheme: "GatewayWalletBatched",
    chain: ARC_CONFIG.gatewaySupportedChainName,
    currency: "USDC"
  }));
}

export function dryRunTryOnNanoActions(offerId, catalog = offers) {
  return buildTryOnNanoActions(offerId, catalog).map((action) => ({
    ...action,
    status: "dry_run",
    txHash: "",
    txUrl: "",
    live: false,
    source: "dry_run"
  }));
}
