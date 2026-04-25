import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { readFile } from "node:fs/promises";
import { deployEscrowContract, readEscrowArtifact, runEscrowDemo } from "./src/arc-escrow.js";
import { readFrequencyProof, runFrequencyProof } from "./src/arc-frequency.js";
import { getArcBalance, scaledArcAmount, sendScaledUsdcTransactions } from "./src/arc-live.js";
import { getCircleWalletsStatus } from "./src/circle-wallets.js";
import { createLlmProvider, generateProductImageAsset, getLlmRuntimeConfig, runAiProviderSelfTest } from "./src/llm-providers.js";
import { ensureGatewayDeposit, getGatewayBalances, handleX402PremiumCatalog, readNanopaymentProof, runNanopaymentProof } from "./src/x402-live.js";
import {
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
  walletGetBalance
} from "./src/shoprails-tools.js";

const PORT = Number(process.env.PORT || 4173);
const ROOT = process.cwd();

let state = createInitialState();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(ROOT, safePath);
  const type = contentTypes[extname(filePath)] || "application/octet-stream";

  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": type });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

async function routeApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const body = req.method === "POST" ? await readJson(req) : {};

  if (req.method === "POST" && url.pathname === "/api/demo/reset") {
    state = createInitialState();
    return sendJson(res, 200, { state });
  }

  if (req.method === "POST" && url.pathname === "/api/demo/run") {
    const llmMode = body.llmMode || url.searchParams.get("llm") || "mock";
    const result = await runDemoMissionWithLlm(state, createLlmProvider(llmMode));
    return sendJson(res, 200, { result, state });
  }

  if (req.method === "POST" && url.pathname === "/api/demo/full") {
    state = createInitialState();
    const llmMode = body.llmMode || "gemini";
    const result = await runDemoMissionWithLlm(state, createLlmProvider(llmMode));
    const proofs = {
      ai: await runAiProviderSelfTest(),
      escrow: await runEscrowDemo(),
      nanopayment: await runNanopaymentProof(`http://${req.headers.host}`),
      circleWallets: await getCircleWalletsStatus(),
      frequency: await readFrequencyProof()
    };
    state.proofs = proofs;
    return sendJson(res, 200, { result, proofs, state });
  }

  if (req.method === "GET" && url.pathname === "/api/llm/config") {
    return sendJson(res, 200, getLlmRuntimeConfig());
  }

  if (req.method === "POST" && url.pathname === "/api/llm/call") {
    const llm = createLlmProvider(body.llmMode || "mock");
    const result = await llm.generateText({
      name: body.name || "llm.demo_call",
      prompt: body.prompt || "Explain ShopRails in one sentence.",
      fallback: body.fallback || "ShopRails lets agents shop with wallet policies, risk review, and Arc USDC settlement."
    });
    return sendJson(res, 200, result);
  }

  if (req.method === "POST" && url.pathname === "/api/ai/self-test") {
    return sendJson(res, 200, await runAiProviderSelfTest());
  }

  if (req.method === "POST" && url.pathname === "/api/images/generate") {
    const mode = body.imageMode || body.mode || "mock";
    const ids = Array.isArray(body.offerIds) && body.offerIds.length
      ? new Set(body.offerIds)
      : new Set(state.catalog.map((offer) => offer.id));
    const selected = state.catalog.filter((offer) => ids.has(offer.id));
    const assets = [];
    const errors = [];

    for (const offer of selected) {
      try {
        const asset = await generateProductImageAsset(offer, mode);
        assets.push(asset);
        const stateOffer = state.catalog.find((item) => item.id === offer.id);
        if (stateOffer) stateOffer.image = asset.url;
      } catch (error) {
        errors.push({ offerId: offer.id, message: error.message });
      }
    }

    return sendJson(res, errors.length ? 207 : 200, { assets, errors, state });
  }

  if (req.method === "GET" && url.pathname === "/api/mcp/wallet.get_balance") {
    return sendJson(res, 200, walletGetBalance(state));
  }

  if (req.method === "GET" && url.pathname === "/api/arc/balance") {
    const address = url.searchParams.get("address") || state.wallet.buyerAddress;
    return sendJson(res, 200, await getArcBalance(address));
  }

  if (req.method === "GET" && url.pathname === "/api/arc/escrow") {
    return sendJson(res, 200, (await readEscrowArtifact()) || { status: "not_deployed" });
  }

  if (req.method === "GET" && url.pathname === "/api/proofs") {
    return sendJson(res, 200, {
      ai: null,
      escrow: await readEscrowArtifact(),
      nanopayment: await readNanopaymentProof(),
      circleWallets: await getCircleWalletsStatus(),
      frequency: await readFrequencyProof()
    });
  }

  if (req.method === "GET" && url.pathname === "/api/circle/wallets/status") {
    return sendJson(res, 200, await getCircleWalletsStatus());
  }

  if (req.method === "POST" && url.pathname === "/api/arc/escrow/deploy") {
    return sendJson(res, 200, await deployEscrowContract({ force: Boolean(body.force) }));
  }

  if (req.method === "POST" && url.pathname === "/api/arc/escrow/demo") {
    const proof = await runEscrowDemo({ force: Boolean(body.force) });
    state.proofs.escrow = proof;
    return sendJson(res, 200, { proof, state });
  }

  if (req.method === "POST" && url.pathname === "/api/arc/settle") {
    const items = (body.items || []).map((item) => ({
      id: item.id,
      label: item.label,
      kind: item.kind,
      to: item.to,
      amount: Number(item.amount),
      scaledAmount: scaledArcAmount(Number(item.amount))
    }));

    if (body.dryRun) {
      return sendJson(res, 200, {
        dryRun: true,
        items,
        scale: "price / 100000"
      });
    }

    return sendJson(res, 200, {
      dryRun: false,
      transactions: await sendScaledUsdcTransactions(items)
    });
  }

  if (req.method === "POST" && url.pathname === "/api/arc/frequency") {
    const proof = await runFrequencyProof({
      count: Number(body.count || 50),
      amountUsdc: body.amountUsdc || "0.000001",
      force: Boolean(body.force)
    });
    state.proofs.frequency = proof;
    return sendJson(res, 200, { proof, state });
  }

  if (req.method === "GET" && url.pathname === "/api/mcp/catalog.search") {
    return sendJson(
      res,
      200,
      catalogSearch(state, {
        query: url.searchParams.get("query") || "",
        category: url.searchParams.get("category") || ""
      })
    );
  }

  if (req.method === "GET" && url.pathname === "/api/x402/gateway/balances") {
    return sendJson(res, 200, await getGatewayBalances());
  }

  if (req.method === "POST" && url.pathname === "/api/x402/gateway/deposit") {
    return sendJson(res, 200, await ensureGatewayDeposit(body.minAmount || "0.01"));
  }

  if (req.method === "POST" && url.pathname === "/api/x402/nanopayment/run") {
    const proof = await runNanopaymentProof(`http://${req.headers.host}`, body.queryId || "q-sushi", { force: Boolean(body.force) });
    state.proofs.nanopayment = proof;
    return sendJson(res, 200, { proof, state });
  }

  if (req.method === "GET" && url.pathname === "/api/x402/premium-catalog") {
    const absoluteUrl = `http://${req.headers.host}${url.pathname}${url.search}`;
    await handleX402PremiumCatalog(req, res, absoluteUrl, url.searchParams.get("queryId") || "q-sushi");
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/mcp/merchant.get_offer") {
    return sendJson(res, 200, merchantGetOffer(state, { offerId: url.searchParams.get("offerId") }));
  }

  if (req.method === "POST" && url.pathname === "/api/mcp/checkout.evaluate") {
    return sendJson(res, 200, checkoutEvaluate(state, body));
  }

  if (req.method === "POST" && url.pathname === "/api/mcp/checkout.submit") {
    return sendJson(res, 200, checkoutSubmit(state, body));
  }

  if (req.method === "GET" && url.pathname === "/api/mcp/review.list") {
    return sendJson(res, 200, reviewList(state));
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/receipts/nanopayment/")) {
    const paymentId = url.pathname.split("/").at(-1);
    return sendJson(res, 200, getNanopaymentReceipt(paymentId));
  }

  if (req.method === "POST" && url.pathname === "/api/mcp/review.chat") {
    return sendJson(res, 200, reviewChat(state, body));
  }

  if (req.method === "POST" && url.pathname === "/api/mcp/review.approve") {
    return sendJson(res, 200, reviewApprove(state, body));
  }

  return sendJson(res, 404, { error: "Unknown API route" });
}

const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await routeApi(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`ShopRails demo running at http://localhost:${PORT}`);
});
