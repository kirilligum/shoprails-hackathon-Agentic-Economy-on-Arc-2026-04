import { atomicQueries, storefronts } from "./data.js";
import {
  createInitialState,
  reviewChat
} from "./shoprails-tools.js";
import { DecisionStage, formatUsdc, getMerchant } from "./policy.js";
import { TRY_ON_PERSON_IMAGE } from "./try-on.js";

let state = createInitialState();
let activeWorkspaceTab = "cart";
let activeStore = "sushi";
let activeInstruction = null;
let chatDraft = state.mission.prompt;
let liveStatus = "";
let imageStatus = "";
let tryOnStatus = "";
let aiTestStatus = null;
let llmMode = "gemini";
let imageMode = "gemini";
let llmConfig = null;

const app = document.querySelector("#app");

function stageLabel(stage) {
  return {
    [DecisionStage.BUY_NOW]: "Buy It Now",
    [DecisionStage.REVIEW_ESCROW]: "Review",
    [DecisionStage.DECLINE_BLACKLISTED]: "Blacklisted",
    [DecisionStage.DECLINE_POLICY]: "Declined"
  }[stage] || stage;
}

function decisionClass(stage) {
  return {
    [DecisionStage.BUY_NOW]: "good",
    [DecisionStage.REVIEW_ESCROW]: "review",
    [DecisionStage.DECLINE_BLACKLISTED]: "bad",
    [DecisionStage.DECLINE_POLICY]: "bad"
  }[stage] || "neutral";
}

function arcTxUrl(txHash) {
  return `${state.arc.explorerUrl}/tx/${txHash}`;
}

function arcAddressUrl(address) {
  return `${state.arc.explorerUrl}/address/${address}`;
}

function nanoReceiptUrl(paymentId) {
  return `/api/receipts/nanopayment/${paymentId}`;
}

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDisplayUsdc(value) {
  const number = Number(value);
  return number > 0 && number < 0.01 ? `${number.toFixed(6)} USDC` : formatUsdc(number);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderChatText(value) {
  const linked = escapeHtml(value).replace(
    /https:\/\/testnet\.arcscan\.app\/tx\/0x[a-fA-F0-9]+/g,
    (url) => `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`
  );
  return linked;
}

function addChatLine(from, text) {
  state.chat.push({ from, text, at: new Date().toISOString() });
}

function isTryOnNano(payment) {
  return String(payment.kind || "").startsWith("tryon_") || payment.kind === "visualization_api";
}

function mergeTryOnPayload(payload) {
  if (payload.state) {
    state = payload.state;
    return;
  }
  const patch = payload.statePatch || {};
  if (patch.tryOn) state.tryOn = patch.tryOn;
  if (patch.wallet?.nanopaymentSpent !== undefined) {
    state.wallet.nanopaymentSpent = patch.wallet.nanopaymentSpent;
  }
  const incoming = patch.nanopayments || payload.nanoTransactions || [];
  const existing = new Set(state.nanopayments.map((payment) => payment.id));
  for (const payment of incoming) {
    if (!existing.has(payment.id)) {
      state.nanopayments.push(payment);
      existing.add(payment.id);
    }
  }
}

function isMissionRequest(message) {
  return /organize|setup|sushi dinner|pirate theme|hire a human assistant|order sushi/i.test(message)
    && /sushi|dinner|friends|mindsdb/i.test(message);
}

function recentArcTx() {
  const latest = collectArcTransactions()[0];
  return latest?.hash ? {
    label: latest.label,
    hash: latest.hash
  } : {
    label: "Real funding tx",
    hash: state.wallet.fundingTxHash
  };
}

function renderTxLinks(item) {
  const links = [];
  if (item.txHash) {
    const label = item.stage === DecisionStage.BUY_NOW ? "Real Arc USDC transfer" : "Real Arc review tx";
    links.push(`<a class="tx-link" href="${arcTxUrl(item.txHash)}" target="_blank" rel="noreferrer">${label}</a>`);
  }
  if (item.releaseTxHash) {
    links.push(`<a class="tx-link" href="${arcTxUrl(item.releaseTxHash)}" target="_blank" rel="noreferrer">Real review payment tx</a>`);
  }
  if (item.onchainAmount) {
    links.push(`<small>Arc amount: ${item.onchainAmount} USDC</small>`);
  }
  if (item.liveEscrowId && item.liveEscrowContract) {
    links.push(`<a class="tx-link" href="${arcAddressUrl(item.liveEscrowContract)}" target="_blank" rel="noreferrer">Review proof contract</a>`);
  }
  if (item.simulatedSettlementId) {
    links.push(`<small>Policy id: ${item.simulatedSettlementId}</small>`);
  }
  if (item.simulatedReleaseId) {
    links.push(`<small>Review id: ${item.simulatedReleaseId}</small>`);
  }
  if (!links.length) return `<small>No Arc signature</small>`;
  return links.join("");
}

function collectArcTransactions() {
  const transactions = [];
  const seen = new Set();

  function pushTx(tx) {
    if (!tx.hash || seen.has(tx.hash)) return;
    seen.add(tx.hash);
    transactions.push({
      ...tx,
      href: arcTxUrl(tx.hash),
      sortKey: Number(tx.blockNumber || tx.sortKey || 0)
    });
  }

  pushTx({
      id: "funding",
      label: "Circle faucet funding",
      amount: state.wallet.onchainBalance,
      hash: state.wallet.fundingTxHash,
      blockNumber: state.wallet.fundingBlockNumber,
      status: "confirmed",
      source: "faucet",
      counterparty: "Circle faucet"
  });

  for (const item of [...state.orders, ...state.reviewCart]) {
    if (item.txHash) {
      pushTx({
        id: `${item.id}-submit`,
        label: `${item.offerName} ${item.stage === DecisionStage.BUY_NOW ? "USDC transfer" : "review authorization"}`,
        amount: Number(item.onchainAmount || item.amount),
        hash: item.txHash,
        blockNumber: item.onchainBlockNumber,
        status: `${item.escrowStatus} on Arc`,
        source: item.stage === DecisionStage.BUY_NOW ? "buy-now" : "review",
        counterparty: item.merchantName || item.merchantWallet
      });
    }
    if (item.releaseTxHash) {
      pushTx({
        id: `${item.id}-release`,
        label: `${item.offerName} direct seller payment`,
        amount: Number(item.onchainAmount || item.amount),
        hash: item.releaseTxHash,
        blockNumber: item.onchainBlockNumber,
        status: "paid on Arc after review",
        source: "review payment",
        counterparty: item.merchantName || item.merchantWallet
      });
    }
  }

  const escrow = state.proofs?.escrow;
  if (escrow?.deployTxHash) {
    pushTx({
      id: "escrow-deploy",
      label: "ShopRails escrow deploy",
      amount: 0,
      hash: escrow.deployTxHash,
      blockNumber: escrow.deployBlockNumber,
      status: "real contract deploy",
      source: "contract",
      counterparty: escrow.contractAddress
    });
  }
  for (const flow of escrow?.flows || []) {
    if (flow.createTxHash) {
      pushTx({
        id: `${flow.offerId}-escrow-create`,
        label: `${flow.offerName} escrow create`,
        amount: Number(flow.amountUsdc || 0),
        hash: flow.createTxHash,
        blockNumber: flow.createBlockNumber,
        status: `escrow #${flow.escrowId} held on contract`,
        source: "escrow",
        counterparty: flow.sellerName || flow.seller
      });
    }
    if (flow.releaseTxHash) {
      pushTx({
        id: `${flow.offerId}-escrow-release`,
        label: `${flow.offerName} escrow release`,
        amount: Number(flow.amountUsdc || 0),
        hash: flow.releaseTxHash,
        blockNumber: flow.releaseBlockNumber,
        status: "released by reviewer",
        source: "escrow release",
        counterparty: flow.sellerName || flow.seller
      });
    }
    if (flow.refundTxHash) {
      pushTx({
        id: `${flow.offerId}-escrow-refund`,
        label: `${flow.offerName} escrow refund`,
        amount: Number(flow.amountUsdc || 0),
        hash: flow.refundTxHash,
        blockNumber: flow.refundBlockNumber,
        status: "refunded by reviewer",
        source: "refund",
        counterparty: flow.sellerName || flow.seller
      });
    }
  }

  const nano = state.proofs?.nanopayment;
  if (nano?.deposit?.approvalTxHash) {
    pushTx({
      id: "gateway-approval",
      label: "Gateway approval for x402",
      amount: Number(nano.deposit.amount || 0),
      hash: nano.deposit.approvalTxHash,
      blockNumber: nano.deposit.approvalBlockNumber,
      status: "real Arc approval",
      source: "Circle Gateway",
      counterparty: "GatewayWalletBatched"
    });
  }
  if (nano?.deposit?.depositTxHash) {
    pushTx({
      id: "gateway-deposit",
      label: "Gateway deposit for x402",
      amount: Number(nano.deposit.amount || 0),
      hash: nano.deposit.depositTxHash,
      blockNumber: nano.deposit.depositBlockNumber,
      status: "real Circle Gateway deposit",
      source: "Circle Gateway",
      counterparty: "x402 catalog funding"
    });
  }

  const circle = state.proofs?.circleWallets;
  if (circle?.payment?.txHash) {
    pushTx({
      id: "circle-wallets-payment",
      label: "Circle Wallets API seller payment",
      amount: Number(circle.payment.amount || 0),
      hash: circle.payment.txHash,
      status: circle.payment.status || "Circle Wallets transfer",
      source: "Circle Wallets",
      counterparty: "Sushi Harbor seller wallet",
      sortKey: 39030000
    });
  }

  for (const payment of state.nanopayments.filter((item) => item.txHash)) {
    pushTx({
      id: `${payment.id}-arc`,
      label: `${payment.action || payment.provider || "Nano action"} nano transaction`,
      amount: Number(payment.amount || 0),
      hash: payment.txHash,
      blockNumber: payment.blockNumber,
      status: payment.status || "confirmed",
      source: payment.source || payment.rail || "Circle Nanopayments",
      counterparty: payment.provider || payment.paidTo || "provider",
      sortKey: payment.blockNumber ? undefined : Date.now()
    });
  }

  for (const tx of state.proofs?.frequency?.transactions || []) {
    pushTx({
      id: tx.actionId,
      label: `50-action burst ${tx.actionId}`,
      amount: Number(tx.amountUsdc || 0),
      hash: tx.txHash,
      blockNumber: tx.blockNumber,
      status: `${tx.status}; ${tx.latencyMs} ms`,
      source: "Arc microtransaction burst",
      counterparty: tx.seller
    });
  }

  return transactions.sort((a, b) => b.sortKey - a.sortKey);
}

function collectSimulatedTransactions() {
  const rows = [];
  for (const item of [...state.orders, ...state.reviewCart]) {
    if (item.simulatedSettlementId) {
      rows.push({
        id: item.simulatedSettlementId,
        label: `${item.offerName} ${item.stage === DecisionStage.BUY_NOW ? "policy decision" : "review-required decision"}`,
        amount: item.amount,
        status: item.txHash || item.releaseTxHash ? "backed by real Arc tx" : `${item.escrowStatus} · direct payment not submitted yet`
      });
    }
    if (item.simulatedReleaseId) {
      rows.push({
        id: item.simulatedReleaseId,
        label: `${item.offerName} buyer-approved direct payment`,
        amount: item.amount,
        status: item.releaseTxHash ? "backed by real Arc tx" : "not submitted to Arc yet"
      });
    }
  }
  return rows;
}

function nanoStats() {
  const simulatedTotal = state.nanopayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const tryOnApi = state.nanopayments.filter(isTryOnNano);
  const sellerApi = state.nanopayments.filter((payment) => payment.kind !== "scorer_api" && !isTryOnNano(payment));
  const scorerApi = state.nanopayments.filter((payment) => payment.kind === "scorer_api" || payment.kind === "tryon_scorer");
  const tryOnTotal = tryOnApi.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const scorerTotal = scorerApi.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const sellerTotal = sellerApi.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const realAmount = Number(state.proofs?.nanopayment?.payment?.formattedAmount || 0);
  const count = state.nanopayments.length + (realAmount ? 1 : 0);
  const total = simulatedTotal + realAmount;
  const average = count ? total / count : 0;
  const cardFeeMultiple = average ? 0.3 / average : 0;
  const cheapestPurchase = Math.min(...state.catalog.map((offer) => Number(offer.price || Infinity)));
  const largestScorer = Math.max(...scorerApi.map((payment) => Number(payment.amount || 0)), 0);
  const scorerPriceMultiple = largestScorer ? cheapestPurchase / largestScorer : 0;
  return {
    count,
    simulatedCount: state.nanopayments.length,
    simulatedTotal,
    sellerApiCount: sellerApi.length,
    sellerTotal,
    scorerApiCount: scorerApi.length,
    scorerTotal,
    tryOnCount: tryOnApi.length,
    tryOnTotal,
    scorerPriceMultiple,
    realAmount,
    total,
    average,
    cardFeeMultiple,
    realTransfer: state.proofs?.nanopayment?.payment?.transaction || "",
    realTransferUrl: state.proofs?.nanopayment?.payment?.transferProofUrl || "",
    scheme: state.proofs?.nanopayment?.data?.x402?.scheme || "GatewayWalletBatched",
    facilitator: state.proofs?.nanopayment?.data?.x402?.facilitator || "Circle Gateway x402"
  };
}

function merchantOffers(merchantId) {
  return state.catalog.filter((offer) => offer.merchantId === merchantId);
}

function renderWorkspaceTabs({ autoBought, pendingReview, releasedReview, declined }) {
  const tabs = [
    {
      id: "mission",
      label: "Agent",
      detail: state.mission.status === "completed" ? "proofs ready" : "mission control"
    },
    {
      id: "wallet",
      label: "Wallet",
      detail: `${formatDisplayUsdc(state.wallet.available)} available`
    },
    {
      id: "cart",
      label: "Client",
      detail: `${pendingReview} pending, ${releasedReview} released`
    },
    {
      id: "scorer",
      label: "Scorer",
      detail: `${state.scorer.checks.length} paid checks`
    },
    {
      id: "stores",
      label: "Stores",
      detail: `${storefronts.length} agent-readable`
    }
  ];

  return `
    <nav class="workspace-tabs" role="tablist" aria-label="ShopRails demo surfaces">
      ${tabs.map((tab) => `
        <button
          type="button"
          class="${tab.id === activeWorkspaceTab ? "active" : ""}"
          role="tab"
          aria-selected="${tab.id === activeWorkspaceTab}"
          aria-controls="workspace-${tab.id}"
          id="tab-${tab.id}"
          data-workspace-tab="${tab.id}">
          <span>${tab.label}</span>
          <small>${tab.detail}</small>
        </button>
      `).join("")}
      <div class="workspace-summary" aria-label="Mission totals">
        <b>${autoBought}</b><span>buy now</span>
        <b>${declined}</b><span>declined</span>
      </div>
    </nav>
  `;
}

function tabPanelAttrs(id) {
  const selected = activeWorkspaceTab === id;
  return `id="workspace-${id}" role="tabpanel" aria-labelledby="tab-${id}" ${selected ? "" : "hidden"}`;
}

function renderShell() {
  const autoBought = state.decisions.filter((item) => item.stage === DecisionStage.BUY_NOW).length;
  const pendingReview = state.reviewCart.length;
  const releasedReview = state.orders.filter((item) => item.stage === DecisionStage.REVIEW_ESCROW).length;
  const declined = state.declined.length;
  const latestTx = recentArcTx();

  app.innerHTML = `
    <header class="topbar">
      <div>
        <p class="eyebrow">Arc + Circle agentic commerce demo</p>
        <h1>ShopRails</h1>
      </div>
      <div class="top-actions">
        <button class="ghost" data-action="reset">Reset</button>
        <button class="secondary" data-action="run-full-demo">Run full demo</button>
        <button class="primary" data-action="run-demo">Run OpenClaw mission</button>
      </div>
    </header>

    <main class="layout">
      ${renderWorkspaceTabs({ autoBought, pendingReview, releasedReview, declined })}

      <section class="panel tab-panel mission-panel" ${tabPanelAttrs("mission")}>
        <div class="section-head">
          <div>
            <p class="eyebrow">Agent activity</p>
            <h2>Pirate sushi dinner</h2>
          </div>
          <span class="status ${state.mission.status}">${state.mission.status.replaceAll("_", " ")}</span>
        </div>
        <p class="prompt">${state.mission.prompt}</p>
        ${liveStatus ? `<div class="live-status">${liveStatus}</div>` : ""}
        <button class="primary wide-action" data-action="run-full-demo">Run perfect hackathon demo</button>
        ${renderAiRuntimeControls()}
        ${renderProofPanel()}
        <div class="demo-rail">
          <button class="primary" data-action="run-demo">1. Run agent plan + show buy-now txs</button>
          <button class="secondary" data-action="explain-reviewed" ${state.decisions.length ? "" : "disabled"}>2. Explain cart</button>
          <button class="secondary" data-action="confirm-reviewed" ${state.reviewCart.length ? "" : "disabled"}>3. Confirm review + pay</button>
          <a class="arc-button" href="${arcTxUrl(latestTx.hash)}" target="_blank" rel="noreferrer">4. View real Arc tx</a>
        </div>
        <div class="split">
          <div>
            <h3>Atomic queries</h3>
            <div class="query-list">
              ${atomicQueries.map((query) => `
                <div class="query">
                  <span>${query.category}</span>
                  <strong>${query.x402Price.toFixed(6)} USDC</strong>
                </div>
              `).join("")}
            </div>
          </div>
          <div>
            <h3>LLM calls log</h3>
            ${renderLlmLog()}
          </div>
        </div>
        <h3 class="tool-title">ShopRails MCP/tool calls</h3>
        <div class="trace compact">
          ${state.toolLog.slice(0, 10).map((entry) => `
            <div class="trace-row">
              <code>${entry.name}</code>
              <span>${entry.output.stage || entry.output.count || entry.output.reply || "ok"}</span>
            </div>
          `).join("") || `<p class="empty">No tool calls yet.</p>`}
        </div>
      </section>

      <section class="panel tab-panel wallet-panel" ${tabPanelAttrs("wallet")}>
        <div class="section-head">
          <div>
            <p class="eyebrow">Wallet and policy</p>
            <h2>${formatUsdc(state.wallet.available)} available</h2>
          </div>
          <span class="rail">USDC on Arc</span>
        </div>
        <div class="wallet-grid">
          ${metric("Deposited", state.wallet.balance)}
          ${metric("On-chain", state.wallet.onchainBalance)}
          ${metric("Review pending", state.wallet.escrowed)}
          ${metric("Settled", state.wallet.spent)}
          ${metric("x402 data", state.wallet.nanopaymentSpent, 6)}
        </div>
        ${renderNanoAnalytics()}
        <div class="rail-stack">
          <div><b>Circle Wallets</b><span>${state.arc.walletChainCode} developer wallet</span></div>
          <div><b>Buyer address</b><span><a href="${arcAddressUrl(state.wallet.buyerAddress)}" target="_blank" rel="noreferrer">${shortAddress(state.wallet.buyerAddress)}</a></span></div>
          <div><b>Agent address</b><span><a href="${arcAddressUrl(state.wallet.agentAddress)}" target="_blank" rel="noreferrer">${shortAddress(state.wallet.agentAddress)}</a></span></div>
          <div><b>Scorer wallet</b><span><a href="${arcAddressUrl(state.architecture.scorerServer.wallet)}" target="_blank" rel="noreferrer">${shortAddress(state.architecture.scorerServer.wallet)}</a></span></div>
          <div><b>Arc Testnet</b><span>Chain ${state.arc.chainId}, gas paid in USDC</span></div>
          <div><b>Gateway</b><span>${state.arc.gatewaySupportedChainName}, domain ${state.arc.gatewayDomainId}</span></div>
          <div><b>Nanopayments</b><span>Seller APIs + TrustRails scorer via x402</span></div>
          <div><b>Latest real Arc tx</b><span><a href="${arcTxUrl(latestTx.hash)}" target="_blank" rel="noreferrer">${latestTx.label}</a></span></div>
        </div>
        <div class="fund-box">
          <div>
            <b>Fund this Arc Testnet address</b>
            <code>${state.wallet.buyerAddress}</code>
            <span class="fund-status">${formatUsdc(state.wallet.onchainBalance)} confirmed on-chain in block ${state.wallet.fundingBlockNumber}</span>
          </div>
          <div class="fund-actions">
            <button class="ghost-light" data-copy-address="${state.wallet.buyerAddress}">Copy address</button>
            <a class="arc-button" href="${state.arc.faucetUrl}" target="_blank" rel="noreferrer">Circle faucet</a>
            <a class="arc-button" href="${arcAddressUrl(state.wallet.buyerAddress)}" target="_blank" rel="noreferrer">ArcScan address</a>
            <a class="arc-button" href="${arcTxUrl(state.wallet.fundingTxHash)}" target="_blank" rel="noreferrer">Funding tx</a>
          </div>
        </div>
        ${renderTransactionLedger()}
        ${renderRiskStory()}
        <div class="policy-grid">
          ${Object.entries(state.policy.autoApproveByCategory).map(([category, value]) => `
            <label>
              <span>${category}</span>
              <input type="number" value="${value}" min="0" data-policy="${category}" data-ai-description="Auto-buy limit for ${category} purchases before ShopRails routes the item to buyer review.">
            </label>
          `).join("")}
        </div>
      </section>

      <section class="panel tab-panel cart-panel" ${tabPanelAttrs("cart")}>
        <div class="section-head">
          <div>
            <p class="eyebrow">Client checkout chat</p>
            <h2>${pendingReview} pending, ${releasedReview} released, ${autoBought} buy now, ${declined} declined</h2>
          </div>
          <div class="cart-actions">
            <button class="ghost-light" data-action="explain-reviewed" ${state.decisions.length ? "" : "disabled"}>Explain choices</button>
            <button class="secondary" data-action="confirm-reviewed" ${state.reviewCart.length ? "" : "disabled"}>Approve reviewed</button>
          </div>
        </div>
        ${renderReviewTable()}
        ${renderFulfillment()}
        ${renderChat()}
      </section>

      <section class="panel tab-panel scorer-panel" ${tabPanelAttrs("scorer")}>
        ${renderScorerPanel()}
      </section>

      <section class="panel tab-panel stores-panel" ${tabPanelAttrs("stores")}>
        <div class="section-head">
          <div>
            <p class="eyebrow">Agent-readable stores</p>
            <h2>Human pages, machine hints</h2>
          </div>
          <div class="store-actions">
            <button class="ghost-light" data-action="generate-images">Generate Nano Banana images</button>
            <span class="rail">data-ai-description</span>
          </div>
        </div>
        ${imageStatus ? `<div class="image-status">${imageStatus}</div>` : ""}
        <div class="tabs">
          ${storefronts.map((store) => `
            <button class="${store.id === activeStore ? "active" : ""}" data-store="${store.id}">${store.label}</button>
          `).join("")}
        </div>
        ${renderStore()}
      </section>
    </main>
  `;

  bindEvents();
}

function renderAiRuntimeControls() {
  const textModel = llmConfig?.textModel || "gemini-3.1-flash-lite-preview";
  const imageModel = llmConfig?.imageModel || "gemini-3.1-flash-image-preview";
  const keyStatus = llmConfig?.geminiKeyConfigured ? "Gemini key saved server-side" : "Gemini key missing";
  return `
    <div class="runtime-row">
      <div>
        <b>LLM calls</b>
        <span>${textModel} · ${keyStatus} · live only</span>
      </div>
      <div class="segmented" role="group" aria-label="LLM runtime">
        <button class="active" data-llm-mode="gemini">Gemini live</button>
      </div>
      <div>
        <b>Images</b>
        <span>${imageMode === "gemini" ? imageModel : "mock image provider"}</span>
      </div>
      <button class="ghost-light" data-action="test-ai-providers">Test AI providers</button>
    </div>
    ${renderAiTestStatus()}
  `;
}

function renderAiTestStatus() {
  if (!aiTestStatus) return "";
  if (typeof aiTestStatus === "string") {
    return `<div class="provider-test">${escapeHtml(aiTestStatus)}</div>`;
  }

  const configured = aiTestStatus.configuredText || {};
  const lite = aiTestStatus.flashLitePreview || {};
  const fallback = aiTestStatus.textFallback || {};
  const image = aiTestStatus.image || {};

  return `
    <div class="provider-test">
      <div class="provider-row ${configured.ok ? "ok" : "fail"}">
        <b>Gemini text</b>
        <span>${escapeHtml(configured.model || "unknown")} ${configured.ok ? "OK" : escapeHtml(configured.error || "failed")}</span>
      </div>
      <div class="provider-row ${lite.ok ? "ok" : "fail"}">
        <b>Gemini 3.1 Flash-Lite</b>
        <span>${escapeHtml(lite.model || "unknown")} ${lite.ok ? "OK" : escapeHtml(lite.error || "failed")}</span>
      </div>
      <div class="provider-row ${fallback.ok ? "ok" : "fail"}">
        <b>Text fallback</b>
        <span>${escapeHtml(fallback.model || "unknown")} ${fallback.ok ? "OK" : escapeHtml(fallback.error || "failed")}</span>
      </div>
      <div class="provider-row ${image.ok ? "ok" : "fail"}">
        <b>Nano Banana 2</b>
        <span>${escapeHtml(image.model || "unknown")} ${image.ok ? "OK" : escapeHtml(image.error || "failed")}</span>
        ${image.url ? `<a href="${image.url}" target="_blank" rel="noreferrer">image</a>` : ""}
      </div>
      <small>${escapeHtml(aiTestStatus.note || "")}</small>
    </div>
  `;
}

function proofBadge(kind, label, detail, href = "") {
  const link = href ? `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>` : `<b>${label}</b>`;
  return `
    <div class="proof-badge ${kind}">
      ${link}
      <span>${detail}</span>
    </div>
  `;
}

function renderProofPanel() {
  const proofs = state.proofs || {};
  const escrow = proofs.escrow;
  const nano = proofs.nanopayment;
  const frequency = proofs.frequency;
  const circle = proofs.circleWallets || {};
  const ai = proofs.ai || aiTestStatus;
  const escrowFlow = escrow?.flows?.find((flow) => flow.kind === "review_release");
  const refundFlow = escrow?.flows?.find((flow) => flow.kind === "refund_smoke");
  const realGemini = ai?.configuredText?.ok;
  const realImage = ai?.image?.ok;
  const realNano = nano?.payment?.transaction;
  const realEscrow = escrow?.contractAddress && escrowFlow?.releaseTxHash;
  const realFrequency = Number(frequency?.confirmedCount || 0) >= 50;
  const circleAddress = circle.wallet?.address || "";
  const circlePayment = circle.payment?.txHash;
  const circleDetail = circle.configured
    ? circlePayment
      ? `${circle.payment.amount} USDC paid by Circle Wallets`
      : `${circle.wallet?.blockchain || "ARC-TESTNET"} ${shortAddress(circleAddress)} ready`
    : circle.apiProbe?.ok
      ? "API key valid; run circle:setup"
      : "adapter ready; local signer active";

  return `
    <div class="proof-panel">
      <div class="proof-head">
        <h3>Judge proof panel</h3>
        <button class="ghost-light" data-action="refresh-proofs">Refresh proofs</button>
      </div>
      <div class="proof-grid">
        ${proofBadge(realEscrow ? "real" : "warn", "Real Arc tx proof", realEscrow ? `contract ${shortAddress(escrow.contractAddress)} create/release/refund` : "not loaded yet", realEscrow ? arcAddressUrl(escrow.contractAddress) : "")}
        ${proofBadge(realNano ? "real" : "warn", "Real x402 nanopayment", realNano ? `${nano.payment.formattedAmount} USDC transfer ${nano.payment.transaction}` : "run full demo to load proof", nano?.payment?.transferProofUrl || "")}
        ${proofBadge(realFrequency ? "real" : "warn", "50+ Arc tx burst", realFrequency ? `${frequency.confirmedCount} txs at ${frequency.amountUsdc} USDC/action` : "run npm run arc:frequency", frequency?.sampleTxUrls?.[0] || "")}
        ${proofBadge(realGemini ? "real" : "warn", "Real Gemini call", realGemini ? ai.configuredText.model : "click Test AI providers", "")}
        ${proofBadge(realImage ? "real" : "warn", "Real Nano Banana image", realImage ? ai.image.model : "click Test AI providers", ai?.image?.url || "")}
        ${proofBadge("sim", "Simulated receipt ledger", "x402-style receipts for every atomic query", "")}
        ${proofBadge(circle.configured ? "real" : "sim", "Circle Wallets API", circleDetail, circle.payment?.txUrl || (circleAddress ? arcAddressUrl(circleAddress) : ""))}
      </div>
      ${refundFlow ? `<small>Risk proof: <a href="${arcTxUrl(refundFlow.refundTxHash)}" target="_blank" rel="noreferrer">refund tx</a></small>` : ""}
    </div>
  `;
}

function renderRiskStory() {
  return `
    <div class="risk-story">
      <h3>Decentralized risk path</h3>
      <div class="risk-flow">
        <div><b>Buyer server</b><span>policy and purchase history</span></div>
        <div><b>Seller server</b><span>quote, wallet, product data</span></div>
        <div><b>Scorer API</b><span>paid x402 risk score</span></div>
        <div><b>Decision</b><span>buy now, review, decline</span></div>
      </div>
    </div>
  `;
}

function renderScorerPanel() {
  const checks = state.scorer.checks;
  const stats = nanoStats();
  const latestInput = state.scorer.latestInput;
  const latestOutput = state.scorer.latestOutput;

  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Independent scorer</p>
        <h2>${state.scorer.provider.name}</h2>
      </div>
      <span class="rail">${state.scorer.provider.priceUsdc.toFixed(6)} USDC/check</span>
    </div>
    <div class="scorer-architecture">
      <article>
        <span>Buyer server</span>
        <b>${state.architecture.buyerServer.name}</b>
        <p>${state.architecture.buyerServer.role}</p>
        <a class="worker-link" href="${state.architecture.buyerServer.workerUrl}" target="_blank" rel="noreferrer">${state.architecture.buyerServer.workerUrl}</a>
        <code>${state.architecture.buyerServer.endpoint}</code>
      </article>
      <article>
        <span>Seller servers</span>
        <b>${state.architecture.sellerServers.length} independent merchants</b>
        <p>${state.architecture.sellerServers.map((server) => server.name).join(", ")}</p>
        <a class="worker-link" href="${state.architecture.sellerServers[0]?.workerUrl}" target="_blank" rel="noreferrer">${state.architecture.sellerServers[0]?.workerUrl}</a>
        <code>paid quote/catalog APIs</code>
      </article>
      <article>
        <span>Scorer server</span>
        <b>${state.architecture.scorerServer.domain}</b>
        <p>${state.architecture.scorerServer.role}</p>
        <a class="worker-link" href="${state.architecture.scorerServer.workerUrl}" target="_blank" rel="noreferrer">${state.architecture.scorerServer.workerUrl}</a>
        <code>${state.architecture.scorerServer.endpoint}</code>
      </article>
    </div>
    <div class="scorer-metrics">
      ${metric("Paid scorer checks", checks.length, 0)}
      ${metric("Scorer nano spend", stats.scorerTotal, 6)}
      ${metric("Largest scorer call", state.scorer.provider.priceUsdc, 6)}
      <div class="metric">
        <span>Vs cheapest purchase</span>
        <strong>${stats.scorerPriceMultiple ? `${Math.floor(stats.scorerPriceMultiple).toLocaleString()}x` : "n/a"}</strong>
      </div>
    </div>
    <div class="scorer-note">
      The buyer server sends buyer history, policy, item amount, and seller metadata to TrustRails. TrustRails returns a score and decision hint. Each scorer call is paid as its own Circle/x402 nanopayment and is more than 10,000x smaller than the final purchase prices in this demo.
    </div>
    ${checks.length ? `
      <div class="table-wrap scorer-table">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Seller</th>
              <th>Score</th>
              <th>Decision</th>
              <th>Scorer nanopayment</th>
            </tr>
          </thead>
          <tbody>
            ${checks.map((check) => `
              <tr>
                <td><b>${check.offerName}</b><span>${check.amount.toFixed(2)} USDC purchase</span></td>
                <td><b>${check.merchantName}</b><span>${check.domain}</span></td>
                <td><b>${check.approvalScore}/100</b><span>risk ${check.riskScore}/100</span></td>
                <td><span class="pill ${decisionClass(check.decision)}">${stageLabel(check.decision)}</span><small>${check.reasons[0]}</small></td>
                <td>
                  <a class="tx-link" href="${nanoReceiptUrl(check.nanopayment.id)}" target="_blank" rel="noreferrer">${check.nanopayment.id}</a>
                  <span>${check.nanopayment.amount.toFixed(6)} USDC</span>
                  <small>${check.nanopayment.endpoint}</small>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="scorer-payload">
        <article>
          <b>Latest scorer input</b>
          <pre>${escapeHtml(JSON.stringify(latestInput, null, 2))}</pre>
        </article>
        <article>
          <b>Latest scorer output</b>
          <pre>${escapeHtml(JSON.stringify(latestOutput, null, 2))}</pre>
        </article>
      </div>
    ` : `<p class="empty table-empty">Run the agent mission to call the TrustRails scorer for each candidate item.</p>`}
  `;
}

function renderFulfillment() {
  const released = state.orders.filter((item) => item.stage === DecisionStage.REVIEW_ESCROW);
  const buyNow = state.orders.filter((item) => item.stage === DecisionStage.BUY_NOW);
  if (!state.decisions.length) return "";

  const cards = [
    {
      label: "Sushi delivery",
      status: buyNow.some((item) => item.category === "sushi") ? "paid, kitchen confirmed" : "waiting",
      detail: "Arrives Friday 6:40 PM with vegetarian rolls."
    },
    {
      label: "Serving kit",
      status: buyNow.some((item) => item.category === "drinks") ? "paid, bundled with sushi" : "waiting",
      detail: "Chopsticks, soy sauce, napkins, and trays."
    },
    {
      label: "Costumes and props",
      status: released.some((item) => item.category === "costumes") ? "paid after review, packed" : "review needed",
      detail: "One-size accessories plus cheap pirate table props."
    },
    {
      label: "Assistant Maya",
      status: released.some((item) => item.category === "assistant") ? "paid after review, accepted" : "review needed",
      detail: "Receives deliveries, unpacks, stages table, texts photos."
    }
  ];

  return `
    <div class="fulfillment">
      <h3>Merchant fulfillment</h3>
      <div class="fulfillment-grid">
        ${cards.map((card) => `
          <article>
            <b>${card.label}</b>
            <span>${card.status}</span>
            <p>${card.detail}</p>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function renderTryOnNanoLedger() {
  const rows = state.tryOn?.nanoTransactions || state.nanopayments.filter(isTryOnNano);
  if (!rows.length) {
    return `
      <div class="tryon-ledger empty-tryon">
        <div>
          <b>Virtual try-on nano transactions</b>
          <small>Click Stores > Costume Store > photo icon > Put on to create four highlighted Arc nano txs.</small>
        </div>
      </div>
    `;
  }

  const total = rows.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return `
    <div class="tryon-ledger">
      <div class="tryon-ledger-head">
        <div>
          <b>Virtual try-on nano transactions</b>
          <small>${rows.length} txs · ${total.toFixed(6)} USDC · each action is below $0.01</small>
        </div>
        ${state.tryOn?.selectedOfferName ? `<span>${state.tryOn.selectedOfferName}</span>` : ""}
      </div>
      ${rows.map((payment) => {
        const href = payment.txUrl || (payment.txHash ? arcTxUrl(payment.txHash) : nanoReceiptUrl(payment.id));
        return `
          <a class="ledger-row tryon-nano" href="${href}" target="_blank" rel="noreferrer">
            <span>${payment.action || payment.provider}</span>
            <b>${Number(payment.amount || 0).toFixed(6)} USDC</b>
            <small>${payment.provider} · ${payment.endpoint} · ${payment.status || "pending"}</small>
            <small>${payment.txHash ? shortAddress(payment.txHash) : "no Arc hash yet"} · ${payment.source || payment.rail || "Circle Nanopayments"}</small>
          </a>
        `;
      }).join("")}
    </div>
  `;
}

function renderTransactionLedger() {
  const arcTransactions = collectArcTransactions();
  const simulatedTransactions = collectSimulatedTransactions();
  return `
    <div class="ledger">
      <div class="ledger-col">
        <h3>Real Arc transactions (${arcTransactions.length}, newest first)</h3>
        ${arcTransactions.map((tx) => `
          <a class="ledger-row" href="${tx.href}" target="_blank" rel="noreferrer">
            <span>${tx.label}</span>
            <b>${formatDisplayUsdc(tx.amount)}</b>
            <small><strong>Block ${tx.blockNumber || "pending"}</strong> · ${tx.source || "Arc"} · ${tx.counterparty || "counterparty"}</small>
            <small><code>${shortAddress(tx.hash)}</code> · ${tx.status}</small>
          </a>
        `).join("")}
        ${simulatedTransactions.length ? `<h3>Simulated ShopRails settlements</h3>` : ""}
        ${simulatedTransactions.map((tx) => `
          <div class="ledger-row simulated">
            <span>${tx.label}</span>
            <b>${formatDisplayUsdc(tx.amount)}</b>
            <small>${tx.id} · ${tx.status}</small>
          </div>
        `).join("")}
      </div>
      <div class="ledger-col">
        <h3>Nano transactions</h3>
        ${renderTryOnNanoLedger()}
        ${state.proofs?.nanopayment?.payment?.transaction ? `
          <a class="ledger-row real-nano" href="${state.proofs.nanopayment.payment.transferProofUrl}" target="_blank" rel="noreferrer">
            <span>Real Circle x402 transfer</span>
            <b>${state.proofs.nanopayment.payment.formattedAmount} USDC</b>
            <small>${state.proofs.nanopayment.payment.transaction}</small>
          </a>
        ` : ""}
        ${state.nanopayments.length ? state.nanopayments.map((payment) => `
          <a class="ledger-row ${isTryOnNano(payment) ? "tryon-nano compact-tryon" : ""}" href="${payment.txUrl || (payment.txHash ? arcTxUrl(payment.txHash) : nanoReceiptUrl(payment.id))}" target="_blank" rel="noreferrer">
            <span>${payment.action || payment.id} ${payment.protocol}/${payment.scheme}</span>
            <b>${payment.amount.toFixed(6)} USDC</b>
            <small>${payment.request}</small>
            ${payment.txHash ? `<small>${shortAddress(payment.txHash)} · ${payment.status || "confirmed"}</small>` : ""}
          </a>
        `).join("") : `<p class="empty log-empty">Run the mission to create x402 receipt links.</p>`}
      </div>
    </div>
  `;
}

function renderNanoAnalytics() {
  const stats = nanoStats();
  return `
    <div class="nano-analytics">
      <div class="section-head compact-head">
        <div>
          <h3>Nanopayment analytics</h3>
          <p>Per-action pricing for seller APIs and independent scorer calls.</p>
        </div>
        ${stats.realTransferUrl ? `<a class="tx-link inline-link" href="${stats.realTransferUrl}" target="_blank" rel="noreferrer">real x402 transfer</a>` : ""}
      </div>
      <div class="nano-grid">
        <div><span>Paid data actions</span><b>${stats.count}</b><small>${stats.simulatedCount} simulated receipts + ${stats.realAmount ? 1 : 0} real x402</small></div>
        <div><span>Seller API nano</span><b>${stats.sellerTotal.toFixed(6)} USDC</b><small>${stats.sellerApiCount} catalog/quote/discovery calls</small></div>
        <div><span>Scorer nano</span><b>${stats.scorerTotal.toFixed(6)} USDC</b><small>${stats.scorerApiCount} TrustRails calls; ${stats.scorerPriceMultiple ? `${Math.floor(stats.scorerPriceMultiple).toLocaleString()}x` : "n/a"} under cheapest purchase</small></div>
        <div><span>Try-on flow</span><b>${stats.tryOnCount || 0} nano txs</b><small>${(stats.tryOnTotal || 0).toFixed(6)} USDC; all under $0.01 and far smaller than costume prices</small></div>
        <div><span>Total data spend</span><b>${stats.total.toFixed(6)} USDC</b><small>avg ${stats.average.toFixed(6)} USDC/action</small></div>
        <div><span>Real x402 amount</span><b>${stats.realAmount.toFixed(6)} USDC</b><small>${stats.realTransfer || "run full demo"}</small></div>
        <div><span>Card fee breakage</span><b>${stats.cardFeeMultiple ? `${Math.round(stats.cardFeeMultiple)}x` : "n/a"}</b><small>0.30 USD fixed fee vs avg action price</small></div>
      </div>
      <div class="nano-query-strip">
        ${atomicQueries.map((query) => `
          <span><b>${query.category}</b>${query.x402Price.toFixed(6)} USDC</span>
        `).join("")}
        <span><b>scorer</b>${state.scorer.provider.priceUsdc.toFixed(6)} USDC/check</span>
      </div>
    </div>
  `;
}

function cartExplanationRows() {
  return state.reviewCart.length ? state.reviewCart : [...state.orders, ...state.declined];
}

function cartReferenceAnswer(message = "explain the cart") {
  const rows = cartExplanationRows();
  if (!rows.length) return "No items are waiting for review.";

  if (/tx|transaction|arcscan|proof|link/i.test(message)) {
    return transactionChatReply();
  }

  return [
    `${state.orders.length} item(s) are already Buy It Now, ${state.reviewCart.length} item(s) are waiting for buyer review, and ${state.declined.length} item(s) were declined.`,
    ...rows.map((item) => `${item.offerName}: ${item.agentReason}`)
  ].join("\n");
}

function cartTransactionLines() {
  return collectArcTransactions().map((tx) => `${tx.label}: ${tx.href} (${formatDisplayUsdc(tx.amount)}, ${tx.status})`);
}

function transactionChatReply() {
  const lines = cartTransactionLines();
  if (!lines.length) return "No Arc transactions are loaded yet. Run the agent plan first.";
  return ["Current ArcScan transaction links:", ...lines].join("\n");
}

function cartChatPrompt(message) {
  const rows = cartExplanationRows();
  return [
    "You are the ShopRails Client checkout assistant talking to the buyer.",
    "Use only the state below. Do not invent products, prices, sellers, risk reasons, balances, or transaction hashes.",
    "If the buyer asks for confirmation or release, do not claim funds moved; the deterministic checkout tool performs release only after the explicit confirm command.",
    "If the buyer asks for transaction links, copy the listed ArcScan URLs exactly.",
    "Keep the answer concise and practical.",
    `Buyer message: ${message}`,
    `Mission: ${state.mission.prompt}`,
    `Mission status: ${state.mission.status}`,
    `Wallet: ${formatDisplayUsdc(state.wallet.available)} available, ${formatDisplayUsdc(state.wallet.escrowed)} pending review, ${formatDisplayUsdc(state.wallet.spent)} spent`,
    `Buy-now items: ${state.orders.filter((item) => item.stage === DecisionStage.BUY_NOW).map((item) => `${item.offerName} (${item.onchainAmount || item.amount} USDC on Arc)`).join("; ") || "none"}`,
    `Review items: ${state.reviewCart.map((item) => `${item.offerName} (${item.agentReason})`).join("; ") || "none"}`,
    `Declined items: ${state.declined.map((item) => `${item.offerName} (${item.reasons[0]})`).join("; ") || "none"}`,
    `Rows available to explain: ${rows.map((item) => `${item.offerName}: ${item.agentReason}; decision=${stageLabel(item.stage)}; status=${item.escrowStatus}; risk=${item.reasons[0]}`).join(" | ") || "none"}`,
    `Arc transactions: ${cartTransactionLines().join(" | ") || "none yet"}`,
    `Reference answer shape: ${cartReferenceAnswer(message)}`
  ].join("\n");
}

async function answerCartFromUi(message) {
  addChatLine("Buyer", message);
  const reference = cartReferenceAnswer(message);

  try {
    const response = await fetch("/api/llm/call", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        llmMode: "gemini",
        name: /why|explain|reason/i.test(message) ? "client.explain_cart" : "client.chat",
        prompt: cartChatPrompt(message),
        fallback: reference
      })
    });
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error(payload.error || "Gemini cart explanation failed");
    }
    const text = payload.text || reference;
    addChatLine("Shopping Cart", text);
    state.llmLog.unshift({
      id: `llm-${state.llmLog.length + 1}`,
      at: new Date().toISOString(),
      model: `${payload.provider === "gemini" ? "Gemini" : payload.provider} ${payload.model}`.trim(),
      name: /why|explain|reason/i.test(message) ? "client.explain_cart" : "client.chat",
      prompt: cartChatPrompt(message),
      output: text
    });
    state.toolLog.unshift({
      id: `log-${state.toolLog.length + 1}`,
      at: new Date().toISOString(),
      name: "review.chat",
      input: { message },
      output: { reply: text, mode: payload.provider || "gemini" }
    });
  } catch (error) {
    addChatLine("Shopping Cart", `Real Gemini chat is unavailable right now, so I did not generate a mock LLM response. ${error.message}`);
  }
}

function renderLlmLog() {
  if (!state.llmLog.length) return `<p class="empty log-empty">Click Run agent plan to show the LLM calls.</p>`;

  return `
    <div class="llm-log">
      ${state.llmLog.map((entry) => `
        <article class="llm-call">
          <div>
            <code>${entry.name}</code>
            <span>${entry.model}</span>
          </div>
          <p>${entry.output}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function metric(label, value, digits = 2) {
  return `
    <div class="metric">
      <span>${label}</span>
      <strong>${Number(value).toFixed(digits)}</strong>
    </div>
  `;
}

function renderReviewTable() {
  const rows = [...state.orders, ...state.reviewCart, ...state.declined];
  if (!rows.length) return `<p class="empty table-empty">Run the mission to populate the cart.</p>`;

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Seller</th>
            <th>Amount</th>
            <th>Decision</th>
            <th>Scorer</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item) => `
            <tr>
              <td>
                <b>${item.offerName}</b>
                <span>${item.category}</span>
              </td>
              <td>
                <b>${item.merchantName}</b>
                <span>${item.domain}</span>
                <a class="tx-link" href="${arcAddressUrl(item.merchantWallet)}" target="_blank" rel="noreferrer">${shortAddress(item.merchantWallet)}</a>
              </td>
              <td>${formatUsdc(item.amount)}</td>
              <td><span class="pill ${decisionClass(item.stage)}">${stageLabel(item.stage)}</span><small>${item.escrowStatus}</small>${renderTxLinks(item)}</td>
              <td>
                <b>${item.scorerScore ?? "n/a"}/100</b>
                ${item.scorerPaymentId ? `<a class="tx-link" href="${nanoReceiptUrl(item.scorerPaymentId)}" target="_blank" rel="noreferrer">${item.scorerPaymentId}</a>` : ""}
                ${item.scorerRiskScore ? `<small>risk ${item.scorerRiskScore}/100</small>` : ""}
              </td>
              <td>${item.agentReason}<em>${item.reasons[0]}</em></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderChat() {
  return `
    <div class="chat">
      <div class="messages">
        ${state.chat.slice(-4).map((message) => `
          <div class="message ${message.from === "Buyer" ? "buyer" : ""}">
            <span>${message.from}</span>
            <p>${renderChatText(message.text)}</p>
          </div>
        `).join("")}
      </div>
      <form class="chat-form" data-action="chat">
        <textarea name="message" placeholder="Ask ShopRails to plan, explain, or confirm reviewed items" autocomplete="off" data-ai-description="Buyer command input. The mission prompt starts the agent shopping plan; explain summarizes the cart; confirm approves reviewed direct Arc USDC transactions.">${escapeHtml(chatDraft)}</textarea>
        <button class="primary" type="submit">Send</button>
      </form>
    </div>
  `;
}

function renderStore() {
  const store = storefronts.find((item) => item.id === activeStore);
  const merchant = getMerchant(store.merchantId, state.merchants);
  const offers = merchantOffers(store.merchantId);

  if (store.id === "assistant") {
    return renderAssistantMarketplace(store, merchant, offers);
  }

  return renderCommerceStore(store, merchant, offers);
}

function renderAiFields(store, modifier = "") {
  return `
    <div class="ai-fields ${modifier}">
      ${store.fields.map((field) => `
        <label class="ai-field">
          <span>${field.label}</span>
          <div class="input-row">
            ${field.type === "textarea"
              ? `<textarea data-ai-description="${field.ai}" data-shoprails-field="${field.id}" aria-label="${field.label}">${field.value}</textarea>`
              : `<input value="${field.value}" data-ai-description="${field.ai}" data-shoprails-field="${field.id}" aria-label="${field.label}">`}
            <button type="button" class="ai-help" data-help="${store.id}:${field.id}" alt="AI field instructions" aria-label="AI field instructions">AI</button>
          </div>
          ${activeInstruction === `${store.id}:${field.id}` ? `<small class="instruction">${field.ai}</small>` : ""}
        </label>
      `).join("")}
    </div>
  `;
}

function commerceBadgeForOffer(offer) {
  const merchant = getMerchant(offer.merchantId, state.merchants);
  if (merchant.trustTier === "blocked") return { label: "Blocked", className: "blocked" };
  if (offer.category === "assistant" || offer.price > (state.policy.autoApproveByCategory[offer.category] || 0)) {
    return { label: "Review", className: "review" };
  }
  return { label: "Buy now", className: "good" };
}

function renderCostumeTryOnPanel(costumeOffers) {
  const latest = state.tryOn?.latest;
  const hasPhoto = Boolean(state.tryOn?.personImageUrl);
  const selected = latest?.offerName || state.tryOn?.selectedOfferName || "No costume selected";
  return `
    <section class="tryon-panel" data-ai-description="Virtual try-on workflow. The buyer agent pays seller catalog, availability, scorer, and visualization APIs as four sub-cent nano transactions before generating the try-on image.">
      <div class="tryon-copy">
        <p class="eyebrow">Nano Banana try-on</p>
        <h3>Upload once, try costumes with paid API actions</h3>
        <p>Each Put on click creates four highlighted nano transactions: catalog search, availability, TrustRails scorer, and costume visualization.</p>
        <button class="secondary tryon-photo-button" type="button" data-action="load-tryon-photo" aria-label="Load Kirill standing photo">
          <span class="photo-icon" aria-hidden="true"></span>
          <span>${hasPhoto ? "Kirill photo loaded" : "Load Kirill photo"}</span>
        </button>
        ${tryOnStatus ? `<small class="tryon-status">${escapeHtml(tryOnStatus)}</small>` : ""}
      </div>
      <div class="tryon-stage">
        <figure>
          ${hasPhoto
            ? `<img src="${state.tryOn.personImageUrl}" alt="Kirill standing reference photo for virtual try-on">`
            : `<div class="tryon-placeholder">Reference photo</div>`}
          <figcaption>Reference photo</figcaption>
        </figure>
        <figure>
          ${latest?.image?.url
            ? `<img src="${latest.image.url}" alt="${selected} virtual try-on generated image">`
            : `<div class="tryon-placeholder">Generated try-on</div>`}
          <figcaption>${selected}</figcaption>
        </figure>
      </div>
      <div class="tryon-meta">
        <span><b>Model</b>${latest?.image?.model || "gemini-3.1-flash-image-preview"}</span>
        <span><b>Prompt</b>${latest?.promptSummary || "Retail virtual try-on preserving pose, face, lighting, and background."}</span>
        <span><b>Nano price</b>4 × 0.000001 USDC</span>
      </div>
      ${latest?.nanoTransactions?.length ? `
        <div class="tryon-nano-list">
          ${latest.nanoTransactions.map((payment) => `
            <a href="${payment.txUrl || nanoReceiptUrl(payment.id)}" target="_blank" rel="noreferrer">
              <span>${payment.action}</span>
              <b>${Number(payment.amount || 0).toFixed(6)} USDC</b>
              <small>${payment.txHash ? shortAddress(payment.txHash) : payment.status}</small>
            </a>
          `).join("")}
        </div>
      ` : `
        <div class="tryon-suggestions">
          ${costumeOffers.map((offer) => `<span>${offer.name}</span>`).join("")}
        </div>
      `}
    </section>
  `;
}

function renderCommerceStore(store, merchant, offers) {
  const heroOffer = offers[0];
  const cartTotal = offers.reduce((sum, offer) => sum + offer.price, 0);
  const isCostumeStore = store.id === "costumes";
  const costumeOffers = offers.filter((offer) => offer.category === "costumes");

  return `
    <div class="commerce-store" data-ai-description="ShopRails merchant storefront for ${merchant.name}. Product cards expose machine-readable offer IDs, delivery windows, prices, and risk signals.">
      <div class="commerce-banner">
        <span>${merchant.name}</span>
        <b>${store.id === "sushi" ? "Friday office delivery" : "Party-ready pirate supplies"}</b>
        <small>${merchant.rating.toFixed(1)} stars · ${merchant.trustTier} seller · ${merchant.domain}</small>
      </div>
      ${isCostumeStore ? renderCostumeTryOnPanel(costumeOffers) : ""}
      <div class="commerce-layout">
        <aside class="agent-order-panel">
          <div>
            <p class="eyebrow">Agent checkout context</p>
            <h3>${store.id === "sushi" ? "Dinner delivery details" : "Theme and sizing"}</h3>
          </div>
          ${renderAiFields(store, "stacked")}
          <div class="mini-cart" data-ai-description="Projected merchant cart summary for the agent before ShopRails policy evaluation.">
            <span>Suggested cart</span>
            <b>${formatUsdc(cartTotal)}</b>
            <small>${offers.length} offer${offers.length === 1 ? "" : "s"} · Arc demo settlement at price / 100,000</small>
          </div>
        </aside>
        <section class="shopfront">
          <div class="shop-hero" data-ai-description="${heroOffer?.reason || "Featured merchant offer"}">
            <div>
              <p class="eyebrow">${store.id === "sushi" ? "Chef selected" : "Party bundle"}</p>
              <h3>${heroOffer?.name || merchant.name}</h3>
              <p>${heroOffer?.reason || "Agent-readable storefront offer."}</p>
              <div class="hero-actions">
                <button class="primary" type="button">Add to intent</button>
                <button class="ghost-light" type="button">Compare policy</button>
              </div>
            </div>
            ${heroOffer ? `<img src="${heroOffer.image}" alt="${heroOffer.name} featured product image">` : ""}
          </div>
          <div class="commerce-toolbar">
            <div>
              <b>${store.id === "sushi" ? "Delivery menu" : "Costumes and props"}</b>
              <span>Sorted by agent fit and policy risk</span>
            </div>
            <div class="commerce-filters" aria-label="Storefront filters">
              <span>In stock</span>
              <span>Arrives Friday</span>
              <span>USDC ready</span>
            </div>
          </div>
          <div class="shopify-grid">
            ${offers.map((offer) => {
              const badge = commerceBadgeForOffer(offer);
              return `
                <article class="shop-product" data-shoprails-offer-id="${offer.id}" data-ai-description="${offer.reason}">
                  <div class="product-media">
                    <img src="${offer.image}" alt="${offer.name} product preview">
                    <span class="store-badge ${badge.className}">${badge.label}</span>
                  </div>
                  <div class="shop-product-body">
                    <div>
                      <h4>${offer.name}</h4>
                      <p>${offer.quantityLabel}</p>
                    </div>
                    <b>${formatUsdc(offer.price)}</b>
                    <small>${offer.deliveryWindow}</small>
                    <div class="product-meta">
                      <span>Risk ${offer.riskScore}</span>
                      <span>${offer.brand}</span>
                    </div>
                    <div class="product-actions">
                      <button class="ghost-light" type="button">View offer</button>
                      ${isCostumeStore && offer.category === "costumes" ? `
                        <button
                          class="secondary put-on-button"
                          type="button"
                          data-action="put-on-costume"
                          data-offer-id="${offer.id}"
                          ${state.tryOn?.personImageUrl ? "" : "disabled"}
                          aria-label="Generate virtual try-on for ${offer.name}"
                        >Put on</button>
                      ` : ""}
                    </div>
                  </div>
                </article>
              `;
            }).join("")}
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderAssistantMarketplace(store, merchant, offers) {
  const primary = offers[0];
  return `
    <div class="service-marketplace" data-ai-description="ShopRails human-services marketplace. Agents must specify work scope, timing, acceptance criteria, and buyer review before payment release.">
      <div class="service-searchbar">
        <div>
          <p class="eyebrow">Human assistant marketplace</p>
          <h3>Hire setup help near the office</h3>
        </div>
        <div class="service-query" data-ai-description="Search parameters for matching a human assistant to the buyer's dinner setup task.">
          <span>Office dinner setup</span>
          <span>Friday 5:30 PM</span>
          <span>MindsDB office</span>
        </div>
      </div>
      <div class="service-layout">
        <aside class="service-brief">
          <h3>Job brief for agent</h3>
          ${renderAiFields(store, "stacked")}
          <div class="scope-list">
            <b>Scope checklist</b>
            <span>Receive deliveries</span>
            <span>Unpack sushi and serving kit</span>
            <span>Place pirate props</span>
            <span>Text completion photos</span>
          </div>
          <div class="review-required">
            <span>Buyer review required</span>
            <b>${formatUsdc(primary?.price || 0)}</b>
            <small>Human labor always routes to buyer review.</small>
          </div>
        </aside>
        <section class="pro-results">
          <div class="results-head">
            <b>Best matches</b>
            <span>Ranked by availability, rating, and task fit</span>
          </div>
          ${offers.map((offer) => `
            <article class="pro-card" data-shoprails-offer-id="${offer.id}" data-ai-description="${offer.reason}">
              <img src="${offer.image}" alt="${offer.name} profile photo">
              <div class="pro-main">
                <div class="pro-title">
                  <div>
                    <h4>${offer.name}</h4>
                    <p>${merchant.name} · ${merchant.domain}</p>
                  </div>
                  <span class="store-badge review">Review</span>
                </div>
                <div class="pro-stats">
                  <span>${merchant.rating.toFixed(1)} rating</span>
                  <span>${offer.unit}</span>
                  <span>Risk ${offer.riskScore}</span>
                </div>
                <p>${offer.reason}</p>
                <div class="service-instructions">
                  <b>Instructions for assistant</b>
                  <span>${offer.serviceInstructions || store.fields.find((field) => field.id === "instructions")?.value || "See task instructions."}</span>
                </div>
              </div>
              <aside class="quote-card">
                <span>Fixed quote</span>
                <b>${formatUsdc(offer.price)}</b>
                <small>${offer.deliveryWindow}</small>
                <button class="secondary" type="button">Request booking</button>
                <button class="ghost-light" type="button">Message pro</button>
              </aside>
            </article>
          `).join("")}
        </section>
      </div>
    </div>
  `;
}

async function runMissionFromUi({ sourceMessage = "", keepTab = "mission" } = {}) {
  const cachedProofs = state.proofs;
  const buyerMessage = sourceMessage.trim();
  activeWorkspaceTab = keepTab;
  state = createInitialState();
  state.proofs = { ...state.proofs, ...cachedProofs };
  if (buyerMessage) addChatLine("Buyer", buyerMessage);
  chatDraft = "explain the cart";
  liveStatus = "Running real Gemini LLM calls and loading verified Arc transactions at price / 100,000.";
  renderShell();

  try {
    await fetch("/api/demo/reset", { method: "POST" });
    const response = await fetch("/api/demo/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ llmMode })
    });
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error(payload.error || "Demo run failed");
    }
    state = payload.state;
    state.proofs = { ...state.proofs, ...cachedProofs };
    if (buyerMessage) addChatLine("Buyer", buyerMessage);
    addChatLine(
      "Shopping Cart",
      `Agent plan complete. ${state.orders.length} item(s) are Buy It Now, ${state.reviewCart.length} item(s) are waiting for buyer review, and ${state.declined.length} item(s) were declined before signing.`
    );
    chatDraft = "explain the cart";
    liveStatus = "Real Gemini LLM calls logged. Verified Arc transaction links are loaded at price / 100,000.";
  } catch (error) {
    state = createInitialState();
    state.proofs = { ...state.proofs, ...cachedProofs };
    if (buyerMessage) addChatLine("Buyer", buyerMessage);
    addChatLine("Shopping Cart", `Real Gemini planning failed, so ShopRails did not generate a mock plan. Check the server key/provider and retry. ${error.message}`);
    chatDraft = state.mission.prompt;
    liveStatus = `Real Gemini planning failed: ${error.message}`;
  }
  activeWorkspaceTab = keepTab;
  renderShell();
}

async function submitCartCommand(message) {
  const trimmed = message.trim();
  if (!trimmed) return;

  if (isMissionRequest(trimmed)) {
    await runMissionFromUi({ sourceMessage: trimmed, keepTab: "cart" });
    return;
  }

  activeWorkspaceTab = "cart";
  if (/why|explain|reason/i.test(trimmed)) {
    await answerCartFromUi(trimmed);
    chatDraft = "confirm all reviewed items";
    renderShell();
    return;
  }

  if (/confirm all reviewed items/i.test(trimmed)) {
    reviewChat(state, { message: trimmed });
    chatDraft = "show me the Arc transactions";
    liveStatus = "Reviewed items approved. The cart chat includes clickable ArcScan transaction URLs.";
  } else if (/tx|transaction|arcscan|proof|link/i.test(trimmed)) {
    addChatLine("Buyer", trimmed);
    addChatLine("Shopping Cart", transactionChatReply());
    state.toolLog.unshift({
      id: `log-${state.toolLog.length + 1}`,
      at: new Date().toISOString(),
      name: "review.transactions",
      input: { message: trimmed },
      output: { links: cartTransactionLines() }
    });
    chatDraft = "confirm all reviewed items";
  } else {
    await answerCartFromUi(trimmed);
    chatDraft = "confirm all reviewed items";
  }
  renderShell();
}

function bindEvents() {
  app.querySelectorAll("[data-workspace-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeWorkspaceTab = button.dataset.workspaceTab;
      renderShell();
    });
  });

  app.querySelectorAll("[data-action='run-full-demo']").forEach((button) => {
    button.addEventListener("click", async () => {
      llmMode = "gemini";
      activeWorkspaceTab = "mission";
      state = createInitialState();
      chatDraft = "show me the Arc transactions";
      aiTestStatus = null;
      imageStatus = "";
      tryOnStatus = "";
      liveStatus = "Running perfect demo: Gemini 3.1 Flash-Lite, cached Circle x402 proof, Circle Wallets proof, cached Arc transaction proof, and reviewed cart approval.";
      renderShell();
      try {
        const response = await fetch("/api/demo/full", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ llmMode: "gemini" })
        });
        const payload = await response.json();
        if (!response.ok || payload.error) {
          throw new Error(payload.error || "Full demo failed");
        }
        state = payload.state;
        state.proofs = payload.proofs;
        reviewChat(state, { message: "confirm all reviewed items" });
        chatDraft = "show me the Arc transactions";
        liveStatus = "Perfect demo loaded: real Gemini, real Nano Banana, real Circle x402 transfer, real Circle Wallets transfer, real Arc transaction links, reviewed cart approved.";
      } catch (error) {
        liveStatus = `Full demo failed: ${error.message}`;
      }
      renderShell();
    });
  });

  app.querySelectorAll("[data-action='run-demo']").forEach((button) => {
    button.addEventListener("click", async () => {
      await runMissionFromUi({ sourceMessage: state.mission.prompt, keepTab: "mission" });
    });
  });

  app.querySelector("[data-action='refresh-proofs']")?.addEventListener("click", async () => {
    liveStatus = "Refreshing cached proof artifacts...";
    renderShell();
    await loadProofs();
  });

  app.querySelector("[data-action='reset']").addEventListener("click", () => {
    state = createInitialState();
    activeWorkspaceTab = "cart";
    activeInstruction = null;
    chatDraft = state.mission.prompt;
    liveStatus = "";
    imageStatus = "";
    tryOnStatus = "";
    aiTestStatus = null;
    renderShell();
  });

  app.querySelectorAll("[data-action='confirm-reviewed']").forEach((button) => {
    button.addEventListener("click", async () => {
      await submitCartCommand("confirm all reviewed items");
    });
  });

  app.querySelectorAll("[data-action='explain-reviewed']").forEach((button) => {
    button.addEventListener("click", async () => {
      await submitCartCommand("explain the cart");
    });
  });

  const approve = app.querySelector("[data-action='approve-all']");
  approve?.addEventListener("click", () => {
    submitCartCommand("confirm all reviewed items");
  });

  app.querySelectorAll("[data-store]").forEach((button) => {
    button.addEventListener("click", () => {
      activeStore = button.dataset.store;
      activeInstruction = null;
      renderShell();
    });
  });

  app.querySelector("[data-action='load-tryon-photo']")?.addEventListener("click", () => {
    state.tryOn = {
      ...(state.tryOn || {}),
      personImageUrl: TRY_ON_PERSON_IMAGE,
      latest: state.tryOn?.latest || null,
      nanoTransactions: state.tryOn?.nanoTransactions || [],
      runs: state.tryOn?.runs || 0
    };
    activeWorkspaceTab = "stores";
    activeStore = "costumes";
    tryOnStatus = "Seeded Kirill standing photo loaded. Choose a costume and click Put on.";
    renderShell();
  });

  app.querySelectorAll("[data-action='put-on-costume']").forEach((button) => {
    button.addEventListener("click", async () => {
      const offerId = button.dataset.offerId;
      const personImageUrl = state.tryOn?.personImageUrl || TRY_ON_PERSON_IMAGE;
      activeWorkspaceTab = "stores";
      activeStore = "costumes";
      tryOnStatus = "Generating Nano Banana try-on and creating four Arc nano transactions...";
      renderShell();
      try {
        const response = await fetch("/api/costumes/try-on", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ offerId, personImageUrl, imageMode })
        });
        const payload = await response.json();
        if (!response.ok || payload.error) {
          throw new Error(payload.error || "Costume try-on failed");
        }
        mergeTryOnPayload(payload);
        const liveCount = (payload.nanoTransactions || []).filter((tx) => tx.txUrl).length;
        tryOnStatus = `Try-on ready for ${state.tryOn?.selectedOfferName || offerId}. ${liveCount} ArcScan nano tx link(s) available in Wallet.`;
      } catch (error) {
        tryOnStatus = `Try-on failed: ${error.message}`;
      }
      renderShell();
    });
  });

  app.querySelectorAll("[data-llm-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      llmMode = "gemini";
      liveStatus = "Gemini live mode selected. Demo chat and planning do not use mock LLM responses.";
      renderShell();
    });
  });

  app.querySelector("[data-action='test-ai-providers']")?.addEventListener("click", async () => {
    aiTestStatus = "Testing Gemini 3.1 Flash-Lite, text fallback, and Nano Banana 2 image generation...";
    renderShell();
    try {
      const response = await fetch("/api/ai/self-test", { method: "POST" });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error || "AI provider self-test failed");
      }
      aiTestStatus = payload;
    } catch (error) {
      aiTestStatus = `AI provider self-test failed: ${error.message}`;
    }
    renderShell();
  });

  app.querySelector("[data-action='generate-images']")?.addEventListener("click", async () => {
    imageStatus = `Generating storefront images with ${imageMode === "gemini" ? "Google Nano Banana / Gemini image" : "mock image"} provider...`;
    renderShell();
    try {
      const response = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: imageMode })
      });
      const payload = await response.json();
      if (!response.ok && response.status !== 207) {
        throw new Error(payload.error || "Image generation failed");
      }
      if (payload.state) state = payload.state;
      const generated = payload.assets?.length || 0;
      const failed = payload.errors?.length || 0;
      imageStatus = failed
        ? `Generated ${generated} image(s); ${failed} fell back to existing product art.`
        : `Generated ${generated} Nano Banana product image(s) and applied them to the stores.`;
    } catch (error) {
      imageMode = "mock";
      const response = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "mock" })
      });
      const payload = await response.json();
      if (payload.state) state = payload.state;
      imageStatus = `Gemini image generation was unavailable (${error.message}); loaded mock image assets for the demo.`;
    }
    renderShell();
  });

  app.querySelectorAll("[data-help]").forEach((button) => {
    button.addEventListener("click", () => {
      activeInstruction = activeInstruction === button.dataset.help ? null : button.dataset.help;
      renderShell();
    });
  });

  app.querySelectorAll("[data-copy-address]").forEach((button) => {
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(button.dataset.copyAddress);
      button.textContent = "Copied";
    });
  });

  app.querySelector(".chat-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submitCartCommand(String(form.get("message") || state.mission.prompt));
  });

  app.querySelectorAll("[data-policy]").forEach((input) => {
    input.addEventListener("change", () => {
      state.policy.autoApproveByCategory[input.dataset.policy] = Number(input.value);
    });
  });
}

async function settleItemsOnArc(items, kind) {
  if (!items.length) return;

  const payload = items.map((item) => ({
    id: item.id,
    label: item.offerName,
    kind,
    to: item.merchantWallet,
    amount: item.amount
  }));
  const response = await fetch("/api/arc/settle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: payload })
  });
  const result = await response.json();
  if (!response.ok || result.error) {
    throw new Error(result.error || "Arc settlement failed");
  }

  for (const tx of result.transactions) {
    const target = [...state.orders, ...state.reviewCart].find((item) => item.id === tx.itemId);
    if (!target) continue;
    target.onchainAmount = tx.amountUsdc;
    target.onchainBlockNumber = tx.blockNumber;
    target.realArcStatus = tx.status;
    if (kind === "buy_now") {
      target.txHash = tx.hash;
    } else {
      target.releaseTxHash = tx.hash;
    }
  }
}

async function loadRuntimeConfig() {
  try {
    const response = await fetch("/api/llm/config");
    if (response.ok) {
      llmConfig = await response.json();
    }
  } catch {
    llmConfig = null;
  }
  renderShell();
}

async function loadProofs() {
  try {
    const response = await fetch("/api/proofs");
    if (response.ok) {
      const proofs = await response.json();
      state.proofs = {
        ...state.proofs,
        ...proofs
      };
      liveStatus = liveStatus === "Refreshing cached proof artifacts..." ? "Proof artifacts loaded." : liveStatus;
    }
  } catch {
    // Proofs are optional; the core demo still works without cached proof artifacts.
  }
  renderShell();
}

renderShell();
loadRuntimeConfig();
loadProofs();
