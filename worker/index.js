import { atomicQueries, offers } from "../src/data.js";
import { createInitialState, getNanopaymentReceipt, reviewChat, runDemoMission } from "../src/shoprails-tools.js";

const TEXT_MODEL = "gemini-3.1-flash-lite-preview";
const IMAGE_MODEL = "gemini-3.1-flash-image-preview";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function unauthorized() {
  return new Response("ShopRails demo login required.", {
    status: 401,
    headers: {
      "www-authenticate": 'Basic realm="ShopRails Hackathon Demo", charset="UTF-8"',
      "cache-control": "no-store"
    }
  });
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isAuthorized(request, env) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Basic ")) return false;

  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) return false;
  const login = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  const [loginHash, passwordHash] = await Promise.all([sha256Hex(login), sha256Hex(password)]);
  return loginHash === env.TEST_LOGIN_SHA256 && passwordHash === env.TEST_PASSWORD_SHA256;
}

async function readAssetJson(env, request, path) {
  const url = new URL(path, request.url);
  const response = await env.ASSETS.fetch(new Request(url));
  if (!response.ok) return null;
  return response.json();
}

async function cachedProofs(env, request) {
  const [escrow, nanopayment, circleLive, circlePayment, frequency] = await Promise.all([
    readAssetJson(env, request, "/artifacts/arc-escrow-live.json"),
    readAssetJson(env, request, "/artifacts/x402-nanopayment-live.json"),
    readAssetJson(env, request, "/artifacts/circle-wallets-live.json"),
    readAssetJson(env, request, "/artifacts/circle-wallets-payment-live.json"),
    readAssetJson(env, request, "/artifacts/arc-frequency-demo-live.json")
  ]);

  return {
    ai: cachedAiProof(),
    escrow,
    nanopayment,
    circleWallets: circleStatus(circleLive, circlePayment),
    frequency
  };
}

function cachedAiProof() {
  return {
    geminiKeyConfigured: true,
    configuredText: {
      model: TEXT_MODEL,
      provider: "gemini",
      ok: true,
      text: "ShopRails text OK"
    },
    flashLitePreview: {
      model: TEXT_MODEL,
      ok: true,
      text: "ShopRails text OK"
    },
    textFallback: {
      model: "gemini-3-flash-preview",
      ok: true,
      text: "ShopRails text OK"
    },
    image: {
      provider: "gemini",
      model: IMAGE_MODEL,
      ok: true,
      url: "/artifacts/generated-images/shoprails-ai-self-test-gemini-3-1-flash-image-preview.png",
      cached: true
    },
    note: "Hosted replay uses cached real Gemini and Nano Banana proof artifacts generated before deployment."
  };
}

function circleStatus(live, payment) {
  const wallet = live?.wallet || null;
  return {
    kind: "circle_wallets_adapter",
    apiKeyConfigured: true,
    entitySecretConfigured: true,
    walletSetConfigured: Boolean(live?.walletSet?.id),
    walletConfigured: Boolean(wallet?.id),
    configured: Boolean(wallet?.id),
    status: wallet?.id ? "ready_with_arc_testnet_wallet" : "cached_artifact_missing",
    walletSetId: live?.walletSet?.id || "",
    wallet,
    artifact: live ? {
      status: live.status,
      updatedAt: live.updatedAt,
      arcscanAddressUrl: live.arcscanAddressUrl,
      steps: live.steps || []
    } : null,
    payment: payment ? {
      status: payment.status,
      amount: payment.amount,
      transactionId: payment.transactionId,
      txHash: payment.txHash,
      txUrl: payment.txUrl,
      updatedAt: payment.updatedAt
    } : null,
    note: "Hosted demo replays the real Circle Wallets Arc transfer artifact."
  };
}

async function readJson(request) {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  const body = method === "POST" ? await readJson(request) : {};

  if (method === "POST" && url.pathname === "/api/demo/reset") {
    return json({ state: createInitialState() });
  }

  if (method === "POST" && url.pathname === "/api/demo/run") {
    const state = createInitialState();
    const result = runDemoMission(state);
    state.proofs = { ...state.proofs, ...(await cachedProofs(env, request)), ai: state.proofs.ai };
    return json({ result, state });
  }

  if (method === "POST" && url.pathname === "/api/demo/full") {
    const state = createInitialState();
    const result = runDemoMission(state);
    const proofs = await cachedProofs(env, request);
    state.proofs = proofs;
    reviewChat(state, { message: "confirm all reviewed items" });
    return json({ result, proofs, state });
  }

  if (method === "GET" && url.pathname === "/api/llm/config") {
    return json({
      llmProvider: "hosted-replay",
      imageProvider: "hosted-replay",
      textModel: TEXT_MODEL,
      textFallbackModel: "gemini-3-flash-preview",
      imageModel: IMAGE_MODEL,
      fastImageModel: "gemini-2.5-flash-image",
      geminiKeyConfigured: true
    });
  }

  if (method === "POST" && url.pathname === "/api/llm/call") {
    return json({
      provider: "hosted-replay",
      model: TEXT_MODEL,
      text: body.fallback || "ShopRails lets agents shop with wallet policies, risk review, and Arc USDC settlement."
    });
  }

  if (method === "POST" && url.pathname === "/api/ai/self-test") {
    return json(cachedAiProof());
  }

  if (method === "POST" && url.pathname === "/api/images/generate") {
    const ids = Array.isArray(body.offerIds) && body.offerIds.length
      ? new Set(body.offerIds)
      : new Set(offers.map((offer) => offer.id));
    return json({
      assets: offers.filter((offer) => ids.has(offer.id)).map((offer) => ({
        offerId: offer.id,
        provider: "hosted-replay",
        model: IMAGE_MODEL,
        url: offer.image,
        cached: true
      })),
      errors: []
    });
  }

  if (method === "GET" && url.pathname === "/api/proofs") {
    return json(await cachedProofs(env, request));
  }

  if (method === "GET" && url.pathname === "/api/circle/wallets/status") {
    const proofs = await cachedProofs(env, request);
    return json(proofs.circleWallets);
  }

  if (method === "POST" && url.pathname === "/api/x402/nanopayment/run") {
    const proofs = await cachedProofs(env, request);
    return json({ proof: proofs.nanopayment, state: createInitialState() });
  }

  if (method === "GET" && url.pathname === "/api/x402/gateway/balances") {
    const proofs = await cachedProofs(env, request);
    return json(proofs.nanopayment?.deposit?.after || { wallet: null, gateway: null });
  }

  if (method === "GET" && url.pathname.startsWith("/api/receipts/nanopayment/")) {
    const paymentId = url.pathname.split("/").at(-1);
    return json(getNanopaymentReceipt(paymentId));
  }

  if (method === "GET" && url.pathname === "/api/mcp/catalog.search") {
    return json({
      results: offers.filter((offer) => {
        const category = url.searchParams.get("category");
        return category ? offer.category === category : true;
      }),
      nanopayment: {
        protocol: "x402",
        rail: "Circle Nanopayments",
        amount: atomicQueries[0].x402Price
      }
    });
  }

  return json({ error: "Unknown hosted API route" }, 404);
}

export default {
  async fetch(request, env) {
    if (!(await isAuthorized(request, env))) return unauthorized();

    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env);
      } catch (error) {
        return json({ error: error.message }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
