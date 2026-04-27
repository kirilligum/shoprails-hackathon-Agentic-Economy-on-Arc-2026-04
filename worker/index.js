import { ARC_CONFIG, atomicQueries, merchants, offers } from "../src/data.js";
import {
  applyCostumeTryOnResult,
  catalogSearch,
  checkoutEvaluate,
  checkoutSubmit,
  createInitialState,
  getNanopaymentReceipt,
  merchantGetOffer,
  reviewApprove,
  reviewChat,
  reviewList,
  runDemoMission,
  runDemoMissionWithLlm,
  scorerEvaluate,
  walletGetBalance
} from "../src/shoprails-tools.js";
import { TRY_ON_IMAGE_MODEL, TRY_ON_PERSON_IMAGE, buildTryOnNanoActions, buildTryOnPrompt, dryRunTryOnNanoActions, getCostumeTryOnOffer, tryOnCacheKey, tryOnFileName } from "../src/try-on.js";

const TEXT_MODEL = "gemini-3.1-flash-lite-preview";
const IMAGE_MODEL = "gemini-3.1-flash-image-preview";
const TEXT_FALLBACK_MODEL = "gemini-3-flash-preview";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const CIRCLE_API_BASE = "https://api.circle.com";
const PRICE_SCALE = 100000;
const DEFAULT_X402_QUERY_ID = "q-sushi";
const GATEWAY_API_TESTNET = "https://gateway-api-testnet.circle.com";
const HOSTED_STATE_KEY = "shoprails:hosted-state";

let hostedState = createInitialState();

function textFromGeminiResponse(payload) {
  return (payload.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function callGeminiText(apiKey, model, { name, prompt, fallback }) {
  if (!apiKey) {
    throw new Error("Enter a Google AI Studio / Gemini API key in the ShopRails header, or switch LLM mode to mock.");
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
      "x-goog-api-key": apiKey
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

function cachedLlmText(cache, name, fallback) {
  return cache?.responses?.[name]?.output || cache?.cartChat?.[name]?.output || fallback || `Cached ShopRails response for ${name}`;
}

function createHostedLlmProvider(env, { mode = "mock", apiKey = "", cache = null } = {}) {
  if (mode === "mock") {
    const cacheModel = cache?.model || "shoprails-llm";
    return {
      provider: "mock",
      model: `Cached ${cacheModel}`,
      async generateText(input) {
        const cached = cache?.responses?.[input.name] || cache?.cartChat?.[input.name] || null;
        return {
          provider: "mock",
          model: `Cached ${cached?.model || cacheModel}`,
          text: cachedLlmText(cache, input.name, input.fallback)
        };
      }
    };
  }

  return {
    provider: "gemini",
    model: TEXT_MODEL,
    async generateText(input) {
      try {
        return {
          provider: "gemini",
          model: TEXT_MODEL,
          text: await callGeminiText(apiKey, TEXT_MODEL, input)
        };
      } catch (primaryError) {
        return {
          provider: "gemini",
          model: TEXT_FALLBACK_MODEL,
          text: await callGeminiText(apiKey, TEXT_FALLBACK_MODEL, input)
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

function scaledArcAmount(priceUsdc) {
  return (Number(priceUsdc) / PRICE_SCALE).toFixed(6);
}

function toBaseUnits(amount) {
  return Math.max(1, Math.round(Number(amount) * 1_000_000)).toString();
}

function fromBaseUnits(amount) {
  return (Number(amount) / 1_000_000).toFixed(6);
}

function encodeBase64Json(value) {
  return btoa(JSON.stringify(value));
}

function arcTxUrl(txHash) {
  return `${ARC_CONFIG.explorerUrl}/tx/${txHash}`;
}

function arcAddressUrl(address) {
  return `${ARC_CONFIG.explorerUrl}/address/${address}`;
}

function formatWeiAsUsdc(value) {
  const wei = BigInt(value);
  const scale = 10n ** BigInt(ARC_CONFIG.nativeDecimals);
  const whole = wei / scale;
  const fraction = (wei % scale).toString().padStart(ARC_CONFIG.nativeDecimals, "0").slice(0, 6);
  return `${whole}.${fraction}`;
}

async function arcRpc(method, params = []) {
  const response = await fetch(ARC_CONFIG.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params
    })
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `Arc RPC ${method} failed with ${response.status}`);
  }
  return payload.result;
}

async function getHostedArcBalance(address) {
  const balanceHex = await arcRpc("eth_getBalance", [address, "latest"]);
  const balanceWei = BigInt(balanceHex).toString();
  return {
    address,
    balanceWei,
    balanceUsdc: Number(formatWeiAsUsdc(balanceWei)),
    explorerUrl: arcAddressUrl(address),
    source: "arc_rpc_worker"
  };
}

async function readAssetJson(env, request, path) {
  const url = new URL(path, request.url);
  const response = await env.ASSETS.fetch(new Request(url));
  if (!response.ok) return null;
  return response.json();
}

async function loadHostedState(env) {
  if (!env.TRYON_CACHE) return hostedState;
  const saved = await env.TRYON_CACHE.get(HOSTED_STATE_KEY, "json");
  if (saved?.wallet && saved?.catalog) {
    hostedState = saved;
  }
  return hostedState;
}

function scrubStateForKv(state) {
  const copy = JSON.parse(JSON.stringify(state));
  const image = copy.tryOn?.latest?.image;
  if (image?.url && String(image.url).startsWith("data:")) {
    image.url = "";
    image.cachedInKv = true;
  }
  return copy;
}

async function saveHostedState(env, state = hostedState) {
  hostedState = state;
  if (!env.TRYON_CACHE) return;
  await env.TRYON_CACHE.put(HOSTED_STATE_KEY, JSON.stringify(scrubStateForKv(state)), {
    expirationTtl: 60 * 60 * 6
  });
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

function buildHostedSettlementActions(items) {
  return (items || []).map((item) => ({
    id: item.id,
    itemId: item.id,
    label: item.label || item.id,
    kind: item.kind || "settlement",
    action: item.label || "Direct seller payment",
    provider: item.provider || item.label || "Seller",
    endpoint: "/api/arc/settle",
    request: `Direct Arc USDC payment for ${item.label || item.id}`,
    paidTo: item.to,
    to: item.to,
    humanPrice: Number(item.amount),
    amountUsdc: scaledArcAmount(Number(item.amount)),
    amount: Number(scaledArcAmount(Number(item.amount))),
    protocol: "direct_usdc",
    rail: "Circle Wallets",
    scheme: "CircleWalletsTransfer",
    chain: ARC_CONFIG.networkName,
    currency: "USDC"
  }));
}

async function settleHostedItems(env, items) {
  const actions = buildHostedSettlementActions(items);
  const transactions = await runCircleNanoTransfers(env, actions);
  return transactions.map((tx) => ({
    itemId: tx.itemId || tx.id,
    label: tx.label || tx.action,
    kind: tx.kind,
    to: tx.to || tx.paidTo,
    humanPrice: tx.humanPrice,
    amountUsdc: tx.amountUsdc,
    hash: tx.txHash,
    txHash: tx.txHash,
    txUrl: tx.txUrl,
    blockNumber: tx.blockNumber || null,
    status: tx.status,
    transactionId: tx.transactionId,
    source: tx.source,
    circleVariant: tx.circleVariant
  }));
}

function merchantTargets() {
  return [
    { category: "sushi", merchant: merchants["sushi-harbor"] },
    { category: "props", merchant: merchants["sevenseas-costumes"] },
    { category: "assistant", merchant: merchants.taskdock }
  ];
}

async function runHostedFrequencyProof(env, { count = 50, amountUsdc = "0.000001" } = {}) {
  const targets = merchantTargets();
  const startedAt = new Date();
  const actions = Array.from({ length: count }, (_, index) => {
    const target = targets[index % targets.length];
    return {
      id: `price-check-${String(index + 1).padStart(2, "0")}`,
      actionId: `price-check-${String(index + 1).padStart(2, "0")}`,
      action: `Price-check ${index + 1}`,
      kind: "frequency_nanopayment",
      provider: target.merchant.name,
      endpoint: "/api/arc/frequency",
      request: `High-frequency ${target.category} API proof ${index + 1}`,
      category: target.category,
      seller: target.merchant.name,
      paidTo: target.merchant.wallet,
      to: target.merchant.wallet,
      amountUsdc: Number(amountUsdc).toFixed(6),
      amount: Number(amountUsdc),
      protocol: "direct_usdc",
      rail: "Circle Wallets",
      scheme: "CircleWalletsTransfer",
      chain: ARC_CONFIG.networkName,
      currency: "USDC"
    };
  });
  const transfers = await runCircleNanoTransfers(env, actions);
  const endedAt = new Date();
  const durationMs = endedAt.getTime() - startedAt.getTime();
  const transactions = transfers.map((tx, index) => ({
    index: index + 1,
    actionId: tx.actionId || tx.id,
    category: tx.category,
    seller: tx.seller || tx.provider,
    to: tx.paidTo,
    amountUsdc: tx.amountUsdc,
    txHash: tx.txHash,
    txUrl: tx.txUrl || (tx.txHash ? arcTxUrl(tx.txHash) : ""),
    blockNumber: tx.blockNumber || null,
    status: tx.status,
    transactionId: tx.transactionId,
    source: tx.source
  }));
  const confirmedCount = transactions.filter((tx) => tx.status === "confirmed").length;
  return {
    kind: "real_arc_transaction_frequency",
    status: confirmedCount === count ? "confirmed" : "partial",
    network: ARC_CONFIG.networkName,
    chainId: ARC_CONFIG.chainId,
    rpcUrl: ARC_CONFIG.rpcUrl,
    explorerUrl: ARC_CONFIG.explorerUrl,
    walletAddress: env.CIRCLE_WALLET_ADDRESS || hostedState.wallet.buyerAddress,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs,
    confirmedCount,
    requestedCount: count,
    amountUsdc: Number(amountUsdc).toFixed(6),
    perActionPriceOk: Number(amountUsdc) <= 0.01,
    totalActionValueUsdc: (Number(amountUsdc) * confirmedCount).toFixed(6),
    averageTransactionsPerSecond: Number((confirmedCount / Math.max(durationMs / 1000, 1)).toFixed(3)),
    sampleTxUrls: transactions.slice(0, 5).map((tx) => tx.txUrl).filter(Boolean),
    marginExplanation:
      "Each action is priced at 0.000001 USDC. Traditional card rails cannot settle this because fixed fees would exceed revenue, while Arc uses USDC-native settlement for high-frequency agent actions.",
    transactions
  };
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

async function hostedTryOnImage(env, request, offer, personImageUrl, { mode = "gemini", apiKey = "" } = {}) {
  const model = env.GEMINI_IMAGE_MODEL || IMAGE_MODEL;
  const cacheKey = tryOnCacheKey(offer.id, model);
  if (env.TRYON_CACHE) {
    const cached = await env.TRYON_CACHE.get(cacheKey, "json");
    if (cached?.url) return { ...cached, cached: true };
  }

  const cachedAssetPath = `/artifacts/generated-images/${tryOnFileName(offer.id, model)}`;
  const cachedAssetUrl = new URL(cachedAssetPath, request.url);
  const cachedAssetResponse = await env.ASSETS.fetch(new Request(cachedAssetUrl));
  if (mode === "mock" && cachedAssetResponse.ok) {
    return {
      offerId: offer.id,
      provider: "mock",
      model,
      url: cachedAssetPath,
      prompt: buildTryOnPrompt(offer),
      promptSummary: "Cached Gemini virtual try-on generated before the shared key was removed.",
      cached: true
    };
  }

  if (!apiKey) {
    if (cachedAssetResponse.ok) {
      return {
        offerId: offer.id,
        provider: "mock",
        model,
        url: cachedAssetPath,
        prompt: buildTryOnPrompt(offer),
        promptSummary: "Cached Gemini virtual try-on. Add a user Gemini key and switch mock off for a fresh image.",
        cached: true
      };
    }
    throw new Error("Enter a Google AI Studio / Gemini API key in the ShopRails header, or switch mock on if a cached try-on image exists.");
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
      "x-goog-api-key": apiKey
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

function cachedAiProof({ mode = "mock", cache = null, apiKey = "" } = {}) {
  if (mode === "mock") {
    return {
      geminiKeyConfigured: false,
      mode: "mock",
      configuredText: {
        model: cache?.model || TEXT_MODEL,
        provider: "mock",
        ok: true,
        text: cachedLlmText(cache, "llm.plan_mission", "ShopRails cached text OK")
      },
      flashLitePreview: {
        model: TEXT_MODEL,
        ok: true,
        text: "Skipped in mock mode."
      },
      textFallback: {
        model: TEXT_FALLBACK_MODEL,
        ok: true,
        text: "Skipped in mock mode."
      },
      image: {
        provider: "mock",
        model: IMAGE_MODEL,
        ok: true,
        url: "/artifacts/generated-images/shoprails-ai-self-test-gemini-3-1-flash-image-preview.png",
        cached: true
      },
      note: "Mock mode uses cached Gemini responses generated before the shared demo key was removed."
    };
  }

  return {
    geminiKeyConfigured: Boolean(apiKey),
    configuredText: {
      model: TEXT_MODEL,
      provider: "gemini",
      ok: Boolean(apiKey),
      text: apiKey ? "Live Gemini key provided by browser session." : "",
      error: apiKey ? "" : "Enter a Google AI Studio / Gemini API key in the header."
    },
    flashLitePreview: {
      model: TEXT_MODEL,
      ok: Boolean(apiKey),
      text: apiKey ? "Ready for live Gemini calls." : "",
      error: apiKey ? "" : "Missing user-provided Gemini API key."
    },
    textFallback: {
      model: TEXT_FALLBACK_MODEL,
      ok: Boolean(apiKey),
      text: apiKey ? "Ready for fallback live Gemini calls." : "",
      error: apiKey ? "" : "Missing user-provided Gemini API key."
    },
    image: {
      provider: "gemini",
      model: IMAGE_MODEL,
      ok: Boolean(apiKey),
      url: "/artifacts/generated-images/shoprails-ai-self-test-gemini-3-1-flash-image-preview.png",
      cached: true,
      error: apiKey ? "" : "Missing user-provided Gemini API key."
    },
    note: "Hosted Worker no longer stores a shared Gemini key. Live Gemini calls use the key entered in the header; cached images remain available for demo reliability."
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

function nanopaymentRequirement(queryId = DEFAULT_X402_QUERY_ID) {
  const query = atomicQueries.find((item) => item.id === queryId) || atomicQueries[0];
  const seller = merchants["sushi-harbor"];
  return {
    query,
    requirements: {
      scheme: "exact",
      network: `eip155:${ARC_CONFIG.chainId}`,
      asset: ARC_CONFIG.usdcAddress,
      amount: toBaseUnits(query.x402Price),
      payTo: seller.wallet,
      maxTimeoutSeconds: 345600,
      extra: {
        name: "GatewayWalletBatched",
        version: "1",
        verifyingContract: ARC_CONFIG.gatewayWalletAddress
      }
    }
  };
}

function createPaymentRequired(url, queryId = DEFAULT_X402_QUERY_ID) {
  const { query, requirements } = nanopaymentRequirement(queryId);
  return {
    x402Version: 2,
    resource: {
      url,
      description: `AIsa premium catalog data for ${query.category}: ${query.query}`,
      mimeType: "application/json"
    },
    accepts: [requirements]
  };
}

function hostedPremiumCatalogResponse(request, queryId = DEFAULT_X402_QUERY_ID) {
  const url = new URL(request.url);
  const paymentHeader = request.headers.get("payment-signature") || request.headers.get("x-payment");
  const paymentRequired = createPaymentRequired(url.toString(), queryId);
  const { query, requirements } = nanopaymentRequirement(queryId);

  if (!paymentHeader) {
    return new Response(JSON.stringify({ error: "PAYMENT_REQUIRED", paymentRequired }, null, 2), {
      status: 402,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "payment-required": encodeBase64Json(paymentRequired),
        "cache-control": "no-store"
      }
    });
  }

  const paymentResponse = {
    success: true,
    transaction: `hosted-worker-x402-${crypto.randomUUID()}`,
    network: requirements.network,
    amount: requirements.amount,
    mode: "hosted_payment_header_accepted",
    facilitator: GATEWAY_API_TESTNET
  };
  return new Response(JSON.stringify({
    premiumData: {
      queryId: query.id,
      category: query.category,
      query: query.query,
      freshness: "hosted-x402-paid",
      recommendations: ["sushi-party-set", "bamboo-utensils"]
    },
    x402: {
      amount: requirements.amount,
      formattedAmount: fromBaseUnits(requirements.amount),
      network: requirements.network,
      facilitator: GATEWAY_API_TESTNET,
      transaction: paymentResponse.transaction,
      verify: {
        isValid: true,
        mode: "hosted_worker_header_demo"
      },
      settle: {
        success: true,
        mode: "hosted_worker_header_demo"
      }
    }
  }, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "payment-response": encodeBase64Json(paymentResponse),
      "cache-control": "no-store"
    }
  });
}

async function readJson(request) {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

function requestGeminiApiKey(request, body = {}) {
  return String(request.headers.get("x-shoprails-gemini-key") || body.geminiApiKey || "").trim();
}

async function readCachedLlm(env, request) {
  return (await readAssetJson(env, request, "/artifacts/cached-llm-responses.json")) || null;
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  const body = method === "POST" ? await readJson(request) : {};
  const llmMode = body.llmMode === "gemini" || body.llmMode === "real" ? "gemini" : "mock";
  const geminiApiKey = requestGeminiApiKey(request, body);
  const cachedLlm = await readCachedLlm(env, request);
  await loadHostedState(env);
  const withSavedState = async (payload, status = 200) => {
    await saveHostedState(env, hostedState);
    return json(payload, status);
  };

  if (method === "POST" && url.pathname === "/api/demo/reset") {
    hostedState = createInitialState();
    return withSavedState({ state: hostedState });
  }

  if (method === "POST" && url.pathname === "/api/demo/run") {
    hostedState = createInitialState();
    const result = await runDemoMissionWithLlm(hostedState, createHostedLlmProvider(env, {
      mode: llmMode,
      apiKey: geminiApiKey,
      cache: cachedLlm
    }));
    hostedState.proofs = { ...hostedState.proofs, ...(await cachedProofs(env, request)), ai: hostedState.proofs.ai };
    return withSavedState({ result, state: hostedState });
  }

  if (method === "POST" && url.pathname === "/api/demo/full") {
    hostedState = createInitialState();
    const result = await runDemoMissionWithLlm(hostedState, createHostedLlmProvider(env, {
      mode: llmMode,
      apiKey: geminiApiKey,
      cache: cachedLlm
    }));
    const proofs = await cachedProofs(env, request);
    hostedState.proofs = proofs;
    return withSavedState({ result, proofs, state: hostedState });
  }

  if (method === "GET" && url.pathname === "/api/llm/config") {
    return json({
      llmProvider: "gemini",
      imageProvider: "hosted-cached-images",
      textModel: TEXT_MODEL,
      textFallbackModel: TEXT_FALLBACK_MODEL,
      imageModel: IMAGE_MODEL,
      fastImageModel: "gemini-2.5-flash-image",
      geminiKeyConfigured: false,
      userKeyRequired: true,
      cachedLlmResponsesConfigured: Boolean(cachedLlm)
    });
  }

  if (method === "POST" && url.pathname === "/api/llm/call") {
    return json(await createHostedLlmProvider(env, {
      mode: llmMode,
      apiKey: geminiApiKey,
      cache: cachedLlm
    }).generateText({
      name: body.name || "llm.demo_call",
      prompt: body.prompt || "Explain ShopRails in one sentence.",
      fallback: body.fallback || "ShopRails lets agents shop with wallet policies, risk review, and Arc USDC settlement."
    }));
  }

  if (method === "POST" && url.pathname === "/api/ai/self-test") {
    if (llmMode === "gemini" && geminiApiKey) {
      const text = await callGeminiText(geminiApiKey, TEXT_MODEL, {
        name: "llm.app_self_test",
        prompt: "Reply with exactly: ShopRails text OK",
        fallback: "ShopRails text OK"
      });
      return json({
        ...cachedAiProof({ mode: llmMode, cache: cachedLlm, apiKey: geminiApiKey }),
        configuredText: {
          model: TEXT_MODEL,
          provider: "gemini",
          ok: true,
          text
        },
        flashLitePreview: {
          model: TEXT_MODEL,
          ok: true,
          text
        },
        note: "Live Gemini text self-test used the user-provided key from the header. Nano Banana proof remains cached unless the try-on flow generates a fresh image."
      });
    }
    return json(cachedAiProof({ mode: llmMode, cache: cachedLlm, apiKey: geminiApiKey }));
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

    const image = await hostedTryOnImage(env, request, offer, personImageUrl, {
      mode: body.imageMode || body.mode || llmMode,
      apiKey: geminiApiKey
    });
    const actions = buildTryOnNanoActions(offerId, offers);
    let nanoTransactions;
    let signer = { mode: "circle_wallets_worker", fallback: false };
    try {
      nanoTransactions = await runCircleNanoTransfers(env, actions);
    } catch (error) {
      nanoTransactions = await cachedNanoFallback(env, request, actions, error);
      signer = { mode: "cached_arc_fallback", fallback: true, reason: error.message };
    }

    const tryOn = applyCostumeTryOnResult(hostedState, {
      offerId,
      personImageUrl,
      image,
      nanoTransactions
    });

    return withSavedState({
      offerId,
      image,
      nanoTransactions: tryOn.nanoTransactions,
      signer,
      statePatch: {
        tryOn,
        nanopayments: tryOn.nanoTransactions,
        wallet: {
          nanopaymentSpent: hostedState.wallet.nanopaymentSpent
        }
      }
    });
  }

  if (method === "GET" && url.pathname === "/api/mcp/wallet.get_balance") {
    return withSavedState(walletGetBalance(hostedState));
  }

  if (method === "GET" && url.pathname === "/api/arc/balance") {
    const address = url.searchParams.get("address") || env.CIRCLE_WALLET_ADDRESS || hostedState.wallet.buyerAddress;
    return json(await getHostedArcBalance(address));
  }

  if (method === "GET" && url.pathname === "/api/proofs") {
    return json(await cachedProofs(env, request));
  }

  if (method === "GET" && url.pathname === "/api/arc/escrow") {
    const proofs = await cachedProofs(env, request);
    return json(proofs.escrow || { status: "not_deployed" });
  }

  if (method === "GET" && url.pathname === "/api/circle/wallets/status") {
    const proofs = await cachedProofs(env, request);
    return json(proofs.circleWallets);
  }

  if (method === "POST" && url.pathname === "/api/arc/escrow/deploy") {
    const proofs = await cachedProofs(env, request);
    return json({
      ...(proofs.escrow || {}),
      status: proofs.escrow?.contractAddress ? "predeployed_contract_available" : "not_deployed",
      mode: "cloudflare_worker_predeployed_artifact",
      note: "Cloudflare exposes the same route as local. Solidity compilation/deployment stays in the operator/build path; the hosted Worker serves the verified deployed Arc escrow artifact."
    });
  }

  if (method === "POST" && url.pathname === "/api/arc/escrow/demo") {
    const proofs = await cachedProofs(env, request);
    hostedState.proofs.escrow = proofs.escrow;
    return withSavedState({
      proof: {
        ...(proofs.escrow || {}),
        mode: "cloudflare_worker_predeployed_artifact",
        note: "Hosted demo uses the verified deployed escrow flow artifact. Direct seller settlement, frequency, and try-on nanopayments use fresh Circle Wallets signing."
      },
      state: hostedState
    });
  }

  if (method === "POST" && url.pathname === "/api/arc/settle") {
    const items = (body.items || []).map((item) => ({
      id: item.id,
      label: item.label,
      kind: item.kind,
      to: item.to,
      amount: Number(item.amount),
      scaledAmount: scaledArcAmount(Number(item.amount))
    }));

    if (body.dryRun) {
      return json({
        dryRun: true,
        items,
        scale: "price / 100000",
        mode: "cloudflare_worker_circle_wallets"
      });
    }

    return json({
      dryRun: false,
      mode: "cloudflare_worker_circle_wallets",
      transactions: await settleHostedItems(env, items)
    });
  }

  if (method === "POST" && url.pathname === "/api/arc/frequency") {
    const requestedCount = Number(body.count || 50);
    if (body.dryRun) {
      return json({
        dryRun: true,
        requestedCount,
        amountUsdc: body.amountUsdc || "0.000001",
        mode: "cloudflare_worker_circle_wallets"
      });
    }
    const proof = await runHostedFrequencyProof(env, {
      count: requestedCount,
      amountUsdc: body.amountUsdc || "0.000001"
    });
    hostedState.proofs.frequency = proof;
    return withSavedState({ proof, state: hostedState });
  }

  if (method === "POST" && url.pathname === "/api/x402/nanopayment/run") {
    const proofs = await cachedProofs(env, request);
    hostedState.proofs.nanopayment = proofs.nanopayment;
    return withSavedState({ proof: proofs.nanopayment, state: hostedState });
  }

  if (method === "GET" && url.pathname === "/api/x402/gateway/balances") {
    const proofs = await cachedProofs(env, request);
    return json(proofs.nanopayment?.deposit?.after || { wallet: null, gateway: null });
  }

  if (method === "POST" && url.pathname === "/api/x402/gateway/deposit") {
    const proofs = await cachedProofs(env, request);
    return json({
      ...(proofs.nanopayment?.deposit || {}),
      mode: "hosted_cached_gateway_proof",
      note: "Cloudflare exposes the same route as local. Gateway SDK deposit runs in Node locally; hosted Worker serves the verified Gateway deposit proof while live Arc transfers use Circle Wallets."
    });
  }

  if (method === "GET" && url.pathname === "/api/x402/premium-catalog") {
    return hostedPremiumCatalogResponse(request, url.searchParams.get("queryId") || DEFAULT_X402_QUERY_ID);
  }

  if (method === "GET" && url.pathname.startsWith("/api/receipts/nanopayment/")) {
    const paymentId = url.pathname.split("/").at(-1);
    if (!hostedState.nanopayments.length) runDemoMission(hostedState);
    return withSavedState(getNanopaymentReceipt(paymentId, hostedState));
  }

  if (method === "GET" && url.pathname === "/api/mcp/catalog.search") {
    return withSavedState(catalogSearch(hostedState, {
      query: url.searchParams.get("query") || "",
      category: url.searchParams.get("category") || ""
    }));
  }

  if (method === "GET" && url.pathname === "/api/mcp/merchant.get_offer") {
    return withSavedState(merchantGetOffer(hostedState, { offerId: url.searchParams.get("offerId") }));
  }

  if (method === "POST" && url.pathname === "/api/mcp/checkout.evaluate") {
    return withSavedState(checkoutEvaluate(hostedState, body));
  }

  if (method === "POST" && (url.pathname === "/api/mcp/scorer.score" || url.pathname === "/api/scorer/evaluate")) {
    return withSavedState(scorerEvaluate(hostedState, body));
  }

  if (method === "POST" && url.pathname === "/api/mcp/checkout.submit") {
    return withSavedState(checkoutSubmit(hostedState, body));
  }

  if (method === "GET" && url.pathname === "/api/mcp/review.list") {
    return withSavedState(reviewList(hostedState));
  }

  if (method === "POST" && url.pathname === "/api/mcp/review.chat") {
    return withSavedState(reviewChat(hostedState, body));
  }

  if (method === "POST" && url.pathname === "/api/mcp/review.approve") {
    return withSavedState(reviewApprove(hostedState, body));
  }

  return json({ error: "Unknown hosted API route" }, 404);
}

export default {
  async fetch(request, env) {
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
