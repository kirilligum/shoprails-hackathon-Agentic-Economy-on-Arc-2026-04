import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { ARC_CONFIG, atomicQueries, merchants } from "./data.js";

const WALLET_PATH = "artifacts/arc-demo-wallet.json";
const PROOF_PATH = "artifacts/x402-nanopayment-live.json";
const GATEWAY_API_TESTNET = "https://gateway-api-testnet.circle.com";
const DEFAULT_NANO_QUERY_ID = "q-sushi";
const MIN_GATEWAY_DEPOSIT_USDC = "0.01";

function toBaseUnits(amount) {
  return Math.max(1, Math.round(Number(amount) * 1_000_000)).toString();
}

function fromBaseUnits(amount) {
  return (Number(amount) / 1_000_000).toFixed(6);
}

function gatewayExplorerProof(id) {
  return id ? `https://gateway-api-testnet.circle.com/v1/x402/transfers/${id}` : null;
}

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item)));
}

async function privateKey() {
  if (!existsSync(WALLET_PATH)) {
    throw new Error(`Missing ${WALLET_PATH}; cannot sign Gateway nanopayments.`);
  }
  const artifact = JSON.parse(await readFile(WALLET_PATH, "utf8"));
  return artifact.privateKey;
}

async function saveProof(proof) {
  await mkdir(dirname(PROOF_PATH), { recursive: true });
  await writeFile(PROOF_PATH, JSON.stringify(jsonSafe(proof), null, 2));
}

export async function readNanopaymentProof() {
  if (!existsSync(PROOF_PATH)) return null;
  return JSON.parse(await readFile(PROOF_PATH, "utf8"));
}

export async function createGatewayClient() {
  return new GatewayClient({
    chain: ARC_CONFIG.gatewaySupportedChainName,
    privateKey: await privateKey()
  });
}

export function nanopaymentRequirement(queryId = DEFAULT_NANO_QUERY_ID) {
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

export function createPaymentRequired(url, queryId = DEFAULT_NANO_QUERY_ID) {
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

export function encodePaymentHeader(value) {
  return Buffer.from(JSON.stringify(jsonSafe(value))).toString("base64");
}

export function decodePaymentHeader(value) {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
}

export async function getGatewayBalances() {
  const client = await createGatewayClient();
  const balances = await client.getBalances();
  return jsonSafe({
    address: client.address,
    chain: client.getChainName(),
    balances
  });
}

export async function ensureGatewayDeposit(minAmount = MIN_GATEWAY_DEPOSIT_USDC) {
  const client = await createGatewayClient();
  const before = await client.getBalances();
  const minimum = BigInt(toBaseUnits(minAmount));

  if (before.gateway.available >= minimum) {
    return jsonSafe({
      deposited: false,
      address: client.address,
      minimumAmount: minAmount,
      before,
      after: before
    });
  }

  const result = await client.deposit(minAmount);
  const after = await client.getBalances();
  return jsonSafe({
    deposited: true,
    address: client.address,
    minimumAmount: minAmount,
    approvalTxHash: result.approvalTxHash || null,
    depositTxHash: result.depositTxHash,
    amount: result.formattedAmount,
    before,
    after,
    explorerUrl: ARC_CONFIG.explorerUrl
  });
}

export async function handleX402PremiumCatalog(req, res, absoluteUrl, queryId = DEFAULT_NANO_QUERY_ID) {
  const paymentHeader = req.headers["payment-signature"] || req.headers["payment-signature".toLowerCase()];
  const paymentRequired = createPaymentRequired(absoluteUrl, queryId);
  const { query, requirements } = nanopaymentRequirement(queryId);

  if (!paymentHeader) {
    res.writeHead(402, {
      "content-type": "application/json; charset=utf-8",
      "payment-required": encodePaymentHeader(paymentRequired)
    });
    res.end(JSON.stringify({ error: "PAYMENT_REQUIRED", paymentRequired }, null, 2));
    return;
  }

  const paymentPayload = decodePaymentHeader(paymentHeader);
  const facilitator = new BatchFacilitatorClient({ url: GATEWAY_API_TESTNET });
  const verify = await facilitator.verify(paymentPayload, requirements);
  if (!verify.isValid) {
    res.writeHead(402, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "PAYMENT_VERIFICATION_FAILED", verify }, null, 2));
    return;
  }

  const settle = await facilitator.settle(paymentPayload, requirements);
  if (!settle.success) {
    res.writeHead(402, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "PAYMENT_SETTLEMENT_FAILED", settle }, null, 2));
    return;
  }

  const paymentResponse = {
    success: true,
    transaction: settle.transaction || settle.transferId || "",
    network: requirements.network,
    payer: settle.payer || verify.payer || paymentPayload.payload?.authorization?.from || "",
    amount: requirements.amount
  };

  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "payment-response": encodePaymentHeader(paymentResponse)
  });
  res.end(JSON.stringify({
    premiumData: {
      queryId: query.id,
      category: query.category,
      query: query.query,
      freshness: "live-x402-paid",
      recommendations: ["sushi-party-set", "bamboo-utensils"]
    },
    x402: {
      amount: requirements.amount,
      formattedAmount: fromBaseUnits(requirements.amount),
      network: requirements.network,
      facilitator: GATEWAY_API_TESTNET,
      transaction: paymentResponse.transaction,
      transferProofUrl: gatewayExplorerProof(paymentResponse.transaction),
      verify,
      settle
    }
  }, null, 2));
}

export async function runNanopaymentProof(baseUrl, queryId = DEFAULT_NANO_QUERY_ID, { force = false } = {}) {
  const existing = await readNanopaymentProof();
  if (existing?.payment?.transaction && !force) return existing;

  const deposit = await ensureGatewayDeposit();
  const client = await createGatewayClient();
  const url = `${baseUrl.replace(/\/$/, "")}/api/x402/premium-catalog?queryId=${encodeURIComponent(queryId)}`;
  const paid = await client.pay(url);
  let transfer = null;
  if (paid.transaction) {
    try {
      transfer = await client.getTransferById(paid.transaction);
    } catch (error) {
      transfer = { error: error.message };
    }
  }

  const proof = jsonSafe({
    kind: "real_circle_x402_gateway",
    status: "paid",
    createdAt: new Date().toISOString(),
    url,
    deposit,
    payment: {
      amount: paid.amount,
      formattedAmount: paid.formattedAmount,
      transaction: paid.transaction,
      status: paid.status,
      transferProofUrl: gatewayExplorerProof(paid.transaction)
    },
    data: paid.data,
    transfer,
    docs: {
      nanopayments: "https://developers.circle.com/gateway/nanopayments",
      buyer: "https://developers.circle.com/gateway/nanopayments/howtos/x402-buyer",
      facilitator: "https://docs.x402.org/core-concepts/facilitator"
    }
  });
  await saveProof(proof);
  return proof;
}
