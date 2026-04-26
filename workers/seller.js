import { ARC_CONFIG, merchants, offers, sellerServers } from "../src/data.js";
import { json, readJson, handleOptions } from "./shared.js";

function manifest(request) {
  const origin = new URL(request.url).origin;
  return {
    service: "ShopRails Seller Servers",
    role: "Independent merchant APIs for paid catalog, availability, quote, and purchase-intent calls.",
    workerUrl: origin,
    network: ARC_CONFIG.networkName,
    currency: "USDC",
    sellers: sellerServers.map((server) => {
      const merchant = merchants[server.merchantId];
      return {
        ...server,
        workerUrl: origin,
        merchant: {
          id: merchant.id,
          name: merchant.name,
          domain: merchant.domain,
          wallet: merchant.wallet
        }
      };
    }),
    endpoints: {
      catalogSearch: `${origin}/api/catalog/search`,
      availability: `${origin}/api/availability`,
      quote: `${origin}/api/quote`,
      purchaseIntent: `${origin}/api/purchase-intent`
    },
    x402: {
      mode: "demo_receipt",
      pricesUsdc: {
        catalogSearch: "0.000420",
        availability: "0.000240",
        quote: "0.000470"
      }
    }
  };
}

function matchOffers({ category, merchantId, query }) {
  const queryText = String(query || "").toLowerCase();
  return offers.filter((offer) => {
    const categoryMatch = category ? offer.category === category : true;
    const merchantMatch = merchantId ? offer.merchantId === merchantId : true;
    const queryMatch = queryText
      ? `${offer.name} ${offer.brand} ${offer.reason}`.toLowerCase().includes(queryText.split(" ")[0])
      : true;
    return categoryMatch && merchantMatch && (queryMatch || categoryMatch);
  });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return handleOptions();
    const url = new URL(request.url);
    const body = request.method === "POST" ? await readJson(request) : {};

    if (url.pathname === "/" || url.pathname === "/.well-known/shoprails.json") {
      return json(manifest(request));
    }

    if (url.pathname === "/api/catalog/search") {
      const category = body.category || url.searchParams.get("category") || "";
      const merchantId = body.merchantId || url.searchParams.get("merchantId") || "";
      const query = body.query || url.searchParams.get("query") || "";
      return json({
        provider: "ShopRails Seller Server",
        endpoint: "/api/catalog/search",
        priceUsdc: "0.000420",
        results: matchOffers({ category, merchantId, query })
      });
    }

    if (url.pathname === "/api/availability") {
      return json({
        provider: "ShopRails Seller Server",
        endpoint: "/api/availability",
        priceUsdc: "0.000240",
        available: true,
        deliveryWindow: "Friday before 6:30 PM"
      });
    }

    if (url.pathname === "/api/quote") {
      const offerId = body.offerId || url.searchParams.get("offerId") || "sushi-party-set";
      const offer = offers.find((item) => item.id === offerId) || offers[0];
      const merchant = merchants[offer.merchantId];
      return json({
        provider: "ShopRails Seller Server",
        endpoint: "/api/quote",
        priceUsdc: "0.000470",
        quote: {
          quoteId: `quote_${offer.id}`,
          offerId: offer.id,
          sellerWallet: merchant.wallet,
          amountUsdc: offer.price.toFixed(2),
          merchant: merchant.name,
          deliveryWindow: offer.deliveryWindow,
          expiresAt: "2026-05-01T23:30:00Z"
        }
      });
    }

    if (url.pathname === "/api/purchase-intent") {
      const offerId = body.offerId || url.searchParams.get("offerId") || "sushi-party-set";
      const offer = offers.find((item) => item.id === offerId) || offers[0];
      const merchant = merchants[offer.merchantId];
      return json({
        orderId: `order_${offer.id}`,
        offerId: offer.id,
        sellerWallet: merchant.wallet,
        amountUsdc: offer.price.toFixed(2),
        paymentInstructions: {
          network: "arc-testnet",
          currency: "USDC",
          recipient: merchant.wallet
        }
      });
    }

    return json({ error: "Unknown seller server route" }, 404);
  }
};
