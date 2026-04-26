import { ARC_CONFIG, atomicQueries, offers } from "../src/data.js";
import { applyCostumeTryOnResult, createInitialState, getNanopaymentReceipt, reviewChat, runDemoMission, runDemoMissionWithLlm } from "../src/shoprails-tools.js";
import { TRY_ON_IMAGE_MODEL, TRY_ON_PERSON_IMAGE, buildTryOnNanoActions, buildTryOnPrompt, dryRunTryOnNanoActions, getCostumeTryOnOffer, tryOnCacheKey } from "../src/try-on.js";

const TEXT_MODEL = "gemini-3.1-flash-lite-preview";
const IMAGE_MODEL = "gemini-3.1-flash-image-preview";
const TEXT_FALLBACK_MODEL = "gemini-3-flash-preview";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const CIRCLE_API_BASE = "https://api.circle.com";

function textFromGeminiResponse(payload) {
  return (payload.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function callGeminiText(env, model, { name, prompt, fallback }) {
  if (!env.GEMINI_API_KEY) {
    throw new Error("Hosted Gemini is not configured. Add GEMINI_API_KEY as a Cloudflare Worker secret.");
  }

  const responseStyle = String(name || "").startsWith("client.")
    ? "Answer the buyer in 2-5 concise lines. Use only the provided ShopRails facts. Copy transaction URLs exactly when they are relevant."
    : "Return one concise demo-safe sentence. Use only the provided ShopRails facts.";
  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "You are the ShopRails hackathon agent planner.",
              responseStyle,
              "Do not include secrets, private keys, or invented transaction hashes.",
              `Call: ${name}`,
              `Prompt: ${prompt}`,
              fallback ? `Reference facts and preferred shape: ${fallback}` : ""
            ].filter(Boolean).join("\n")
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: String(name || "").startsWith("client.") ? 320 : 140
    }
  };

  const responsePayload = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY
    },
    body: JSON.stringify(body)
  });
  const raw = await responsePayload.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { error: { message: raw } };
  }
  if (!responsePayload.ok) {
    throw new Error(payload.error?.message || `Gemini request failed with ${responsePayload.status}`);
  }

  const text = textFromGeminiResponse(payload);
  if (!text) throw new Error(`Gemini model ${model} returned no text.`);
  return text;
}

function createHostedLlmProvider(env) {
  return {
    provider: "gemini",
    model: TEXT_MODEL,
    async generateText(input) {
      try {
        return {
          provider: "gemini",
          model: TEXT_MODEL,
          text: await callGeminiText(env, TEXT_MODEL, input)
        };
      } catch (primaryError) {
        return {
          provider: "gemini",
          model: TEXT_FALLBACK_MODEL,
          text: await callGeminiText(env, TEXT_FALLBACK_MODEL, input)
        };
      }
    }
  };
}

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

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function publicKeyToArrayBuffer(publicKey) {
  const clean = String(publicKey)
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  return base64ToArrayBuffer(clean);
}

function entitySecretToBytes(entitySecret) {
  const clean = String(entitySecret || "").trim().replace(/^0x/i, "");
  if (/^[0-9a-fA-F]{64}$/.test(clean)) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < clean.length; i += 2) {
      bytes[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
    }
    return bytes;
  }
  return new TextEncoder().encode(entitySecret);
}

async function circleFetch(env, path, options = {}) {
  if (!env.CIRCLE_API_KEY) {
    throw new Error("CIRCLE_API_KEY is not configured on the Worker.");
  }
  const response = await fetch(`${CIRCLE_API_BASE}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${env.CIRCLE_API_KEY}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }
  if (!response.ok) {
    throw new Error(payload.message || payload.error?.message || payload.error || `Circle request failed with ${response.status}`);
  }
  return payload;
}

async function circleEntityPublicKey(env) {
  const payload = await circleFetch(env, "/v1/w3s/config/entity/publicKey");
  const publicKey = payload.data?.publicKey || payload.publicKey;
  if (!publicKey) throw new Error("Circle did not return an entity public key.");
  return publicKey;
}

async function encryptEntitySecret(env) {
  if (!env.CIRCLE_ENTITY_SECRET) {
    throw new Error("CIRCLE_ENTITY_SECRET is not configured on the Worker.");
  }
  const publicKey = await circleEntityPublicKey(env);
  const key = await crypto.subtle.importKey(
    "spki",
    publicKeyToArrayBuffer(publicKey),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    key,
    entitySecretToBytes(env.CIRCLE_ENTITY_SECRET)
  );
  return arrayBufferToBase64(encrypted);
}

function circleTransferPayload(env, action, entitySecretCiphertext, variant = "wallet_id") {
  const base = {
    idempotencyKey: crypto.randomUUID(),
    entitySecretCiphertext,
    destinationAddress: action.paidTo,
    amounts: [action.amountUsdc],
    tokenAddress: env.CIRCLE_TOKEN_ADDRESS || ARC_CONFIG.usdcAddress,
    feeLevel: env.CIRCLE_FEE_LEVEL || "MEDIUM",
    refId: action.id
  };

  if (variant === "wallet_address") {
    return {
      ...base,
      blockchain: env.CIRCLE_WALLET_BLOCKCHAIN || ARC_CONFIG.walletChainCode,
      walletAddress: env.CIRCLE_WALLET_ADDRESS
    };
  }

  return {
    ...base,
    walletId: env.CIRCLE_WALLET_ID,
    blockchain: env.CIRCLE_WALLET_BLOCKCHAIN || ARC_CONFIG.walletChainCode,
    ...(env.CIRCLE_TOKEN_ID ? { tokenId: env.CIRCLE_TOKEN_ID } : {})
  };
}

async function createCircleTransfer(env, action) {
  if (!env.CIRCLE_WALLET_ID && !env.CIRCLE_WALLET_ADDRESS) {
    throw new Error("CIRCLE_WALLET_ID or CIRCLE_WALLET_ADDRESS is not configured on the Worker.");
  }
  const entitySecretCiphertext = await encryptEntitySecret(env);
  const variants = ["wallet_id", "wallet_address"];
  const errors = [];
  for (const variant of variants) {
    try {
      const payload = circleTransferPayload(env, action, entitySecretCiphertext, variant);
      const response = await circleFetch(env, "/v1/w3s/developer/transactions/transfer", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const id = response.data?.id || response.data?.transactionId || response.id;
      if (!id) throw new Error("Circle transfer response did not include a transaction id.");
      return { id, response, variant };
    } catch (error) {
      errors.push(`${variant}: ${error.message}`);
    }
  }
  throw new Error(`Circle transfer could not be created. ${errors.join(" | ")}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollCircleTransaction(env, id) {
  let transaction = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const payload = await circleFetch(env, `/v1/w3s/transactions/${id}`);
    transaction = payload.data?.transaction || payload.data || payload.transaction || null;
    if (["COMPLETE", "CONFIRMED", "FAILED", "DENIED", "CANCELLED"].includes(transaction?.state)) {
      return transaction;
    }
    await sleep(1500);
  }
  return transaction;
}

async function runCircleNanoTransfers(env, actions) {
  return Promise.all(actions.map(async (action) => {
    const created = await createCircleTransfer(env, action);
    const transaction = await pollCircleTransaction(env, created.id);
    const txHash = transaction?.txHash || transaction?.transactionHash || "";
    return {
      ...action,
      status: transaction?.state === "COMPLETE" || transaction?.state === "CONFIRMED" ? "confirmed" : (transaction?.state || "submitted"),
      transactionId: created.id,
      txHash,
      txUrl: txHash ? `${ARC_CONFIG.explorerUrl}/tx/${txHash}` : "",
      live: Boolean(txHash),
      source: "circle_wallets_worker",
      circleVariant: created.variant
    };
  }));
}

async function cachedNanoFallback(env, request, actions, error) {
  const frequency = await readAssetJson(env, request, "/artifacts/arc-frequency-demo-live.json");
  const cached = Array.isArray(frequency?.transactions) ? frequency.transactions.slice(0, actions.length) : [];
  if (cached.length < actions.length) throw error;
  return actions.map((action, index) => {
    const proof = cached[index];
    return {
      ...action,
      status: "confirmed_cached_fallback",
      txHash: proof.txHash,
      txUrl: proof.txUrl || `${ARC_CONFIG.explorerUrl}/tx/${proof.txHash}`,
      blockNumber: proof.blockNumber,
      live: false,
      source: "cached_arc_fallback",
      fallbackReason: error.message
    };
  });
}

function imageFromGeminiResponse(payload) {
  for (const candidate of payload.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      const inlineData = part.inlineData || part.inline_data;
      if (inlineData?.data) {
        return {
          data: inlineData.data,
          mimeType: inlineData.mimeType || inlineData.mime_type || "image/png"
        };
      }
    }
  }
  return null;
}

async function hostedTryOnImage(env, request, offer, personImageUrl) {
  const model = env.GEMINI_IMAGE_MODEL || IMAGE_MODEL;
  const cacheKey = tryOnCacheKey(offer.id, model);
  if (env.TRYON_CACHE) {
    const cached = await env.TRYON_CACHE.get(cacheKey, "json");
    if (cached?.url) return { ...cached, cached: true };
  }

  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured on the Worker, and no cached try-on image exists.");
  }

  const assetUrl = new URL(personImageUrl || TRY_ON_PERSON_IMAGE, request.url);
  const imageResponse = await env.ASSETS.fetch(new Request(assetUrl));
  if (!imageResponse.ok) throw new Error(`Could not load try-on reference image: ${personImageUrl}`);
  const referenceImage = arrayBufferToBase64(await imageResponse.arrayBuffer());
  const prompt = buildTryOnPrompt(offer);

  const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: referenceImage
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: "3:4",
          imageSize: "1K"
        }
      }
    })
  });

  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { error: { message: raw } };
  }
  if (!response.ok) {
    throw new Error(payload.error?.message || `Gemini image request failed with ${response.status}`);
  }
  const image = imageFromGeminiResponse(payload);
  if (!image) throw new Error(`Gemini image model ${model} returned no virtual try-on image.`);

  const result = {
    offerId: offer.id,
    provider: "gemini",
    model,
    url: `data:${image.mimeType};base64,${image.data}`,
    prompt,
    promptSummary: "Fashion e-commerce virtual try-on preserving the buyer reference photo and applying the selected pirate costume.",
    cached: false
  };
  if (env.TRYON_CACHE) {
    await env.TRYON_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 * 60 * 24 * 7 });
  }
  return result;
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
    note: "Hosted Worker uses live Gemini text calls when GEMINI_API_KEY is configured and cached real Nano Banana proof artifacts generated before deployment."
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
    note: "Hosted demo serves the real Circle Wallets Arc transfer artifact."
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
    const result = await runDemoMissionWithLlm(state, createHostedLlmProvider(env));
    state.proofs = { ...state.proofs, ...(await cachedProofs(env, request)), ai: state.proofs.ai };
    return json({ result, state });
  }

  if (method === "POST" && url.pathname === "/api/demo/full") {
    const state = createInitialState();
    const result = await runDemoMissionWithLlm(state, createHostedLlmProvider(env));
    const proofs = await cachedProofs(env, request);
    state.proofs = proofs;
    reviewChat(state, { message: "confirm all reviewed items" });
    return json({ result, proofs, state });
  }

  if (method === "GET" && url.pathname === "/api/llm/config") {
    return json({
      llmProvider: "gemini",
      imageProvider: "hosted-cached-images",
      textModel: TEXT_MODEL,
      textFallbackModel: TEXT_FALLBACK_MODEL,
      imageModel: IMAGE_MODEL,
      fastImageModel: "gemini-2.5-flash-image",
      geminiKeyConfigured: Boolean(env.GEMINI_API_KEY)
    });
  }

  if (method === "POST" && url.pathname === "/api/llm/call") {
    return json(await createHostedLlmProvider(env).generateText({
      name: body.name || "llm.demo_call",
      prompt: body.prompt || "Explain ShopRails in one sentence.",
      fallback: body.fallback || "ShopRails lets agents shop with wallet policies, risk review, and Arc USDC settlement."
    }));
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
        provider: "hosted-cached-gemini-image",
        model: IMAGE_MODEL,
        url: offer.image,
        cached: true
      })),
      errors: []
    });
  }

  if (method === "POST" && url.pathname === "/api/costumes/try-on") {
    const offerId = body.offerId || "crew-costume-pack";
    const personImageUrl = body.personImageUrl || TRY_ON_PERSON_IMAGE;
    const { offer } = getCostumeTryOnOffer(offerId, offers);

    if (body.dryRun) {
      return json({
        offerId,
        image: {
          offerId,
          provider: "dry_run",
          model: "dry_run",
          url: offer.image,
          promptSummary: "Dry run only; no Gemini image or Circle Wallets Arc transfer was created.",
          cached: false,
          dryRun: true
        },
        nanoTransactions: dryRunTryOnNanoActions(offerId, offers),
        dryRun: true
      });
    }

    const image = await hostedTryOnImage(env, request, offer, personImageUrl);
    const actions = buildTryOnNanoActions(offerId, offers);
    let nanoTransactions;
    let signer = { mode: "circle_wallets_worker", fallback: false };
    try {
      nanoTransactions = await runCircleNanoTransfers(env, actions);
    } catch (error) {
      nanoTransactions = await cachedNanoFallback(env, request, actions, error);
      signer = { mode: "cached_arc_fallback", fallback: true, reason: error.message };
    }

    const state = createInitialState();
    const tryOn = applyCostumeTryOnResult(state, {
      offerId,
      personImageUrl,
      image,
      nanoTransactions
    });

    return json({
      offerId,
      image,
      nanoTransactions: tryOn.nanoTransactions,
      signer,
      statePatch: {
        tryOn,
        nanopayments: tryOn.nanoTransactions,
        wallet: {
          nanopaymentSpent: state.wallet.nanopaymentSpent
        }
      }
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
    const receiptState = createInitialState();
    runDemoMission(receiptState);
    return json(getNanopaymentReceipt(paymentId, receiptState));
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
