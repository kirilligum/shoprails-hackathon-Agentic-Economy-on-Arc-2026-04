import { atomicQueries, storefronts } from "./data.js";
import {
  createInitialState,
  reviewChat,
  runDemoMission
} from "./shoprails-tools.js";
import { DecisionStage, formatUsdc, getMerchant } from "./policy.js";

let state = createInitialState();
let activeWorkspaceTab = "mission";
let activeStore = "sushi";
let activeInstruction = null;
let chatDraft = "confirm all reviewed items";
let liveStatus = "";
let imageStatus = "";
let aiTestStatus = null;
let llmMode = "mock";
let imageMode = "gemini";
let llmConfig = null;

const app = document.querySelector("#app");

function stageLabel(stage) {
  return {
    [DecisionStage.BUY_NOW]: "Buy It Now",
    [DecisionStage.REVIEW_ESCROW]: "Review Escrow",
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

function recentArcTx() {
  const records = [...state.orders, ...state.reviewCart];
  const links = [];

  for (const item of records) {
    if (item.txHash) {
      links.push({
        label: item.stage === DecisionStage.BUY_NOW ? "Latest buy-now tx" : "Latest escrow tx",
        hash: item.txHash
      });
    }
    if (item.releaseTxHash) {
      links.push({ label: "Latest review payment tx", hash: item.releaseTxHash });
    }
  }

  return links.at(-1) || {
    label: "Real funding tx",
    hash: state.wallet.fundingTxHash
  };
}

function renderTxLinks(item) {
  const links = [];
  if (item.txHash) {
    const label = item.stage === DecisionStage.BUY_NOW ? "Real Arc USDC transfer" : "Real escrow tx";
    links.push(`<a class="tx-link" href="${arcTxUrl(item.txHash)}" target="_blank" rel="noreferrer">${label}</a>`);
  }
  if (item.releaseTxHash) {
    links.push(`<a class="tx-link" href="${arcTxUrl(item.releaseTxHash)}" target="_blank" rel="noreferrer">Real review payment tx</a>`);
  }
  if (item.onchainAmount) {
    links.push(`<small>Arc amount: ${item.onchainAmount} USDC</small>`);
  }
  if (item.liveEscrowId && item.liveEscrowContract) {
    links.push(`<a class="tx-link" href="${arcAddressUrl(item.liveEscrowContract)}" target="_blank" rel="noreferrer">Escrow #${item.liveEscrowId} contract</a>`);
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
  const transactions = [
    {
      id: "funding",
      label: "Circle faucet funding",
      amount: state.wallet.onchainBalance,
      href: arcTxUrl(state.wallet.fundingTxHash),
      status: "confirmed"
    }
  ];

  for (const item of [...state.orders, ...state.reviewCart]) {
    if (item.txHash) {
      transactions.push({
        id: `${item.id}-submit`,
        label: `${item.offerName} ${item.stage === DecisionStage.BUY_NOW ? "USDC transfer" : "escrow create"}`,
        amount: Number(item.onchainAmount || item.amount),
        href: arcTxUrl(item.txHash),
        status: `${item.escrowStatus} on Arc`
      });
    }
    if (item.releaseTxHash) {
      transactions.push({
        id: `${item.id}-release`,
        label: `${item.offerName} escrow release`,
        amount: Number(item.onchainAmount || item.amount),
        href: arcTxUrl(item.releaseTxHash),
        status: "released on Arc"
      });
    }
  }

  const escrow = state.proofs?.escrow;
  if (escrow?.deployTxHash) {
    transactions.push({
      id: "escrow-deploy",
      label: "ShopRails escrow deploy",
      amount: 0,
      href: arcTxUrl(escrow.deployTxHash),
      status: "real contract deploy"
    });
  }
  for (const flow of escrow?.flows || []) {
    if (flow.createTxHash) {
      transactions.push({
        id: `${flow.offerId}-escrow-create`,
        label: `${flow.offerName} escrow create`,
        amount: Number(flow.amountUsdc || 0),
        href: arcTxUrl(flow.createTxHash),
        status: `escrow #${flow.escrowId} held on contract`
      });
    }
    if (flow.releaseTxHash) {
      transactions.push({
        id: `${flow.offerId}-escrow-release`,
        label: `${flow.offerName} escrow release`,
        amount: Number(flow.amountUsdc || 0),
        href: arcTxUrl(flow.releaseTxHash),
        status: "released by reviewer"
      });
    }
    if (flow.refundTxHash) {
      transactions.push({
        id: `${flow.offerId}-escrow-refund`,
        label: `${flow.offerName} escrow refund`,
        amount: Number(flow.amountUsdc || 0),
        href: arcTxUrl(flow.refundTxHash),
        status: "refunded by reviewer"
      });
    }
  }

  const nano = state.proofs?.nanopayment;
  if (nano?.deposit?.approvalTxHash) {
    transactions.push({
      id: "gateway-approval",
      label: "Gateway approval for x402",
      amount: Number(nano.deposit.amount || 0),
      href: arcTxUrl(nano.deposit.approvalTxHash),
      status: "real Arc approval"
    });
  }
  if (nano?.deposit?.depositTxHash) {
    transactions.push({
      id: "gateway-deposit",
      label: "Gateway deposit for x402",
      amount: Number(nano.deposit.amount || 0),
      href: arcTxUrl(nano.deposit.depositTxHash),
      status: "real Circle Gateway deposit"
    });
  }

  return transactions;
}

function collectSimulatedTransactions() {
  const rows = [];
  for (const item of [...state.orders, ...state.reviewCart]) {
    if (item.simulatedSettlementId) {
      rows.push({
        id: item.simulatedSettlementId,
        label: `${item.offerName} ${item.stage === DecisionStage.BUY_NOW ? "policy decision" : "review hold decision"}`,
        amount: item.amount,
        status: item.txHash || item.releaseTxHash ? "backed by real Arc tx" : `${item.escrowStatus} · not submitted to Arc yet`
      });
    }
    if (item.simulatedReleaseId) {
      rows.push({
        id: item.simulatedReleaseId,
        label: `${item.offerName} buyer-approved review decision`,
        amount: item.amount,
        status: item.releaseTxHash ? "backed by real Arc tx" : "not submitted to Arc yet"
      });
    }
  }
  return rows;
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
      label: "Review cart",
      detail: `${pendingReview} pending, ${releasedReview} released`
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
          ${metric("Escrow", state.wallet.escrowed)}
          ${metric("Settled", state.wallet.spent)}
          ${metric("x402 data", state.wallet.nanopaymentSpent, 6)}
        </div>
        <div class="rail-stack">
          <div><b>Circle Wallets</b><span>${state.arc.walletChainCode} developer wallet</span></div>
          <div><b>Buyer address</b><span><a href="${arcAddressUrl(state.wallet.buyerAddress)}" target="_blank" rel="noreferrer">${shortAddress(state.wallet.buyerAddress)}</a></span></div>
          <div><b>Agent address</b><span><a href="${arcAddressUrl(state.wallet.agentAddress)}" target="_blank" rel="noreferrer">${shortAddress(state.wallet.agentAddress)}</a></span></div>
          <div><b>Escrow address</b><span><a href="${arcAddressUrl(state.wallet.escrowAddress)}" target="_blank" rel="noreferrer">${shortAddress(state.wallet.escrowAddress)}</a></span></div>
          <div><b>Arc Testnet</b><span>Chain ${state.arc.chainId}, gas paid in USDC</span></div>
          <div><b>Gateway</b><span>${state.arc.gatewaySupportedChainName}, domain ${state.arc.gatewayDomainId}</span></div>
          <div><b>Nanopayments</b><span>x402 GatewayWalletBatched signatures</span></div>
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
              <input type="number" value="${value}" min="0" data-policy="${category}" data-ai-description="Auto-buy limit for ${category} purchases before ShopRails routes the item to review escrow.">
            </label>
          `).join("")}
        </div>
      </section>

      <section class="panel tab-panel cart-panel" ${tabPanelAttrs("cart")}>
        <div class="section-head">
          <div>
            <p class="eyebrow">Shopping cart review</p>
            <h2>${pendingReview} pending, ${releasedReview} released, ${autoBought} buy now, ${declined} declined</h2>
          </div>
          <div class="cart-actions">
            <button class="ghost-light" data-action="explain-reviewed" ${state.decisions.length ? "" : "disabled"}>Explain choices</button>
            <button class="secondary" data-action="confirm-reviewed" ${state.reviewCart.length ? "" : "disabled"}>Release escrow</button>
          </div>
        </div>
        ${renderReviewTable()}
        ${renderFulfillment()}
        ${renderChat()}
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
        <span>${llmMode === "gemini" ? textModel : "mock-shoprails-llm"} · ${keyStatus}</span>
      </div>
      <div class="segmented" role="group" aria-label="LLM runtime">
        <button class="${llmMode === "mock" ? "active" : ""}" data-llm-mode="mock">Mock</button>
        <button class="${llmMode === "gemini" ? "active" : ""}" data-llm-mode="gemini">Gemini</button>
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
        ${proofBadge(realEscrow ? "real" : "warn", "Real Arc escrow", realEscrow ? `contract ${shortAddress(escrow.contractAddress)} create/release/refund` : "not loaded yet", realEscrow ? arcAddressUrl(escrow.contractAddress) : "")}
        ${proofBadge(realNano ? "real" : "warn", "Real x402 nanopayment", realNano ? `${nano.payment.formattedAmount} USDC transfer ${nano.payment.transaction}` : "run full demo to load proof", nano?.payment?.transferProofUrl || "")}
        ${proofBadge(realFrequency ? "real" : "warn", "50+ Arc tx burst", realFrequency ? `${frequency.confirmedCount} txs at ${frequency.amountUsdc} USDC/action` : "run npm run arc:frequency", frequency?.sampleTxUrls?.[0] || "")}
        ${proofBadge(realGemini ? "real" : "warn", "Real Gemini call", realGemini ? ai.configuredText.model : "click Test AI providers", "")}
        ${proofBadge(realImage ? "real" : "warn", "Real Nano Banana image", realImage ? ai.image.model : "click Test AI providers", ai?.image?.url || "")}
        ${proofBadge("sim", "Simulated receipt ledger", "x402-style receipts for every atomic query", "")}
        ${proofBadge(circle.configured ? "real" : "sim", "Circle Wallets API", circleDetail, circle.payment?.txUrl || (circleAddress ? arcAddressUrl(circleAddress) : ""))}
      </div>
      ${refundFlow ? `<small>Refund proof: <a href="${arcTxUrl(refundFlow.refundTxHash)}" target="_blank" rel="noreferrer">risk escrow refund tx</a></small>` : ""}
    </div>
  `;
}

function renderRiskStory() {
  return `
    <div class="risk-story">
      <h3>Risk and reputation path</h3>
      <div class="risk-flow">
        <div><b>Rules v1</b><span>budget, caps, whitelist, blacklist</span></div>
        <div><b>Reputation</b><span>seeded collaborative outlier score</span></div>
        <div><b>Privacy future</b><span>ZK proof of normal buying pattern</span></div>
        <div><b>Decision</b><span>buy now, review escrow, decline</span></div>
      </div>
    </div>
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
      status: released.some((item) => item.category === "costumes") ? "escrow released, packed" : "review needed",
      detail: "One-size accessories plus cheap pirate table props."
    },
    {
      label: "Assistant Maya",
      status: released.some((item) => item.category === "assistant") ? "escrow released, accepted" : "review needed",
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

function renderTransactionLedger() {
  const arcTransactions = collectArcTransactions();
  const simulatedTransactions = collectSimulatedTransactions();
  return `
    <div class="ledger">
      <div class="ledger-col">
        <h3>Real Arc transactions</h3>
        ${arcTransactions.map((tx) => `
          <a class="ledger-row" href="${tx.href}" target="_blank" rel="noreferrer">
            <span>${tx.label}</span>
            <b>${formatDisplayUsdc(tx.amount)}</b>
            <small>${tx.status}</small>
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
        ${state.proofs?.nanopayment?.payment?.transaction ? `
          <a class="ledger-row real-nano" href="${state.proofs.nanopayment.payment.transferProofUrl}" target="_blank" rel="noreferrer">
            <span>Real Circle x402 transfer</span>
            <b>${state.proofs.nanopayment.payment.formattedAmount} USDC</b>
            <small>${state.proofs.nanopayment.payment.transaction}</small>
          </a>
        ` : ""}
        ${state.nanopayments.length ? state.nanopayments.map((payment) => `
          <a class="ledger-row" href="${nanoReceiptUrl(payment.id)}" target="_blank" rel="noreferrer">
            <span>${payment.id} ${payment.protocol}/${payment.scheme}</span>
            <b>${payment.amount.toFixed(6)} USDC</b>
            <small>${payment.request}</small>
          </a>
        `).join("") : `<p class="empty log-empty">Run the mission to create x402 receipt links.</p>`}
      </div>
    </div>
  `;
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
            <p>${message.text}</p>
          </div>
        `).join("")}
      </div>
      <form class="chat-form" data-action="chat">
        <input name="message" value="${chatDraft}" placeholder="confirm all reviewed items" autocomplete="off" data-ai-description="Buyer review command input. Confirming releases all escrowed Arc USDC transactions.">
        <button class="primary" type="submit">Send</button>
      </form>
    </div>
  `;
}

function renderStore() {
  const store = storefronts.find((item) => item.id === activeStore);
  const merchant = getMerchant(store.merchantId, state.merchants);
  const offers = merchantOffers(store.merchantId);

  return `
    <div class="store">
      <div class="store-form">
        <h3>${merchant.name}</h3>
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
      <div class="products">
        ${offers.map((offer) => `
          <article class="product" data-shoprails-offer-id="${offer.id}" data-ai-description="${offer.reason}">
            <img src="${offer.image}" alt="${offer.name} product preview">
            <div>
              <h4>${offer.name}</h4>
              <p>${offer.quantityLabel}</p>
              <b>${formatUsdc(offer.price)}</b>
            </div>
          </article>
        `).join("")}
      </div>
    </div>
  `;
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
      chatDraft = "confirm all reviewed items";
      aiTestStatus = null;
      imageStatus = "";
      liveStatus = "Running perfect demo: Gemini 3.1 Flash-Lite, cached Circle x402 proof, Circle Wallets proof, cached Arc escrow proof, and cart release.";
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
        liveStatus = "Perfect demo loaded: real Gemini, real Nano Banana, real Circle x402 transfer, real Circle Wallets transfer, real Arc escrow contract links, cart released.";
      } catch (error) {
        liveStatus = `Full demo failed: ${error.message}`;
      }
      renderShell();
    });
  });

  app.querySelectorAll("[data-action='run-demo']").forEach((button) => {
    button.addEventListener("click", async () => {
      activeWorkspaceTab = "mission";
      state = createInitialState();
      chatDraft = "confirm all reviewed items";
      liveStatus = `Running ${llmMode === "gemini" ? "Gemini" : "mock"} LLM calls and loading verified Arc transactions at price / 100,000.`;
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
        liveStatus = `${llmMode === "gemini" ? "Gemini" : "Mock"} LLM calls logged. Verified Arc transaction links are loaded at price / 100,000.`;
      } catch (error) {
        state = createInitialState();
        runDemoMission(state);
        liveStatus = `Server LLM route was unavailable (${error.message}); fell back to deterministic mock calls.`;
      }
      renderShell();
    });
  });

  app.querySelector("[data-action='refresh-proofs']")?.addEventListener("click", async () => {
    liveStatus = "Refreshing cached proof artifacts...";
    renderShell();
    await loadProofs();
  });

  app.querySelector("[data-action='reset']").addEventListener("click", () => {
    state = createInitialState();
    activeWorkspaceTab = "mission";
    activeInstruction = null;
    chatDraft = "confirm all reviewed items";
    liveStatus = "";
    imageStatus = "";
    aiTestStatus = null;
    renderShell();
  });

  app.querySelectorAll("[data-action='confirm-reviewed']").forEach((button) => {
    button.addEventListener("click", async () => {
      chatDraft = "confirm all reviewed items";
      liveStatus = "Loaded verified buyer-approved review payments at price / 100,000.";
      reviewChat(state, { message: chatDraft });
      renderShell();
    });
  });

  app.querySelectorAll("[data-action='explain-reviewed']").forEach((button) => {
    button.addEventListener("click", () => {
      chatDraft = "why did you choose these items?";
      reviewChat(state, { message: chatDraft });
      renderShell();
    });
  });

  const approve = app.querySelector("[data-action='approve-all']");
  approve?.addEventListener("click", () => {
    chatDraft = "confirm all reviewed items";
    reviewChat(state, { message: "confirm all reviewed items" });
    renderShell();
  });

  app.querySelectorAll("[data-store]").forEach((button) => {
    button.addEventListener("click", () => {
      activeStore = button.dataset.store;
      activeInstruction = null;
      renderShell();
    });
  });

  app.querySelectorAll("[data-llm-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      llmMode = button.dataset.llmMode;
      liveStatus = llmMode === "gemini"
        ? "Gemini mode selected. The next run calls the server-side Gemini provider."
        : "Mock mode selected. The next run is deterministic and test-safe.";
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

  app.querySelector(".chat-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    chatDraft = String(form.get("message") || "confirm all reviewed items");
    reviewChat(state, { message: chatDraft });
    renderShell();
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
