import { buyerProfile, buyerServer, defaultPolicy } from "../src/data.js";
import { json, handleOptions } from "./shared.js";

function manifest(request) {
  const origin = new URL(request.url).origin;
  return {
    service: "ShopRails Buyer Server",
    role: buyerServer.role,
    workerUrl: origin,
    wallet: buyerServer.wallet,
    endpoints: {
      intent: `${origin}/api/buyer/intent`,
      policy: `${origin}/api/buyer/policy`,
      profile: `${origin}/api/buyer/profile`
    }
  };
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return handleOptions();
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/.well-known/shoprails.json") {
      return json(manifest(request));
    }

    if (url.pathname === "/api/buyer/profile") {
      return json({ buyer: buyerProfile });
    }

    if (url.pathname === "/api/buyer/policy") {
      return json({ policy: defaultPolicy });
    }

    if (url.pathname === "/api/buyer/intent") {
      return json({
        buyer: buyerProfile,
        policy: defaultPolicy,
        prompt: "Organize and setup a sushi dinner for my friends on Friday, May 1, 2026. 10 people. 7 PM. At MindsDB office. Pirate theme.",
        note: "This worker represents the buyer-owned policy/history server. It does not custody funds."
      });
    }

    return json({ error: "Unknown buyer server route" }, 404);
  }
};
