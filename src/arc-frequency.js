import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { formatUnits, parseUnits } from "ethers";
import { getArcSigner } from "./arc-live.js";
import { ARC_CONFIG, merchants } from "./data.js";

const PROOF_PATH = "artifacts/arc-frequency-demo-live.json";
const DEFAULT_COUNT = 50;
const DEFAULT_AMOUNT_USDC = "0.000001";

function txUrl(hash) {
  return `${ARC_CONFIG.explorerUrl}/tx/${hash}`;
}

function merchantTargets() {
  return [
    { category: "sushi", merchant: merchants["sushi-harbor"] },
    { category: "props", merchant: merchants["sevenseas-costumes"] },
    { category: "assistant", merchant: merchants.taskdock }
  ];
}

async function saveProof(proof) {
  await mkdir(dirname(PROOF_PATH), { recursive: true });
  await writeFile(PROOF_PATH, JSON.stringify(proof, null, 2));
}

export async function readFrequencyProof() {
  if (!existsSync(PROOF_PATH)) return null;
  return JSON.parse(await readFile(PROOF_PATH, "utf8"));
}

export async function runFrequencyProof({
  count = DEFAULT_COUNT,
  amountUsdc = DEFAULT_AMOUNT_USDC,
  force = false
} = {}) {
  const existing = await readFrequencyProof();
  if (existing?.confirmedCount >= count && !force) return existing;

  const signer = await getArcSigner();
  const targets = merchantTargets();
  const value = parseUnits(amountUsdc, ARC_CONFIG.nativeDecimals);
  const startedAt = new Date();
  const startingBalance = await signer.provider.getBalance(signer.address);
  const transactions = [];

  for (let index = 0; index < count; index += 1) {
    const target = targets[index % targets.length];
    const sentAt = Date.now();
    const tx = await signer.sendTransaction({
      to: target.merchant.wallet,
      value
    });
    const receipt = await tx.wait(1);

    transactions.push({
      index: index + 1,
      actionId: `price-check-${String(index + 1).padStart(2, "0")}`,
      category: target.category,
      seller: target.merchant.name,
      to: target.merchant.wallet,
      amountUsdc,
      txHash: tx.hash,
      txUrl: txUrl(tx.hash),
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? "confirmed" : "failed",
      latencyMs: Date.now() - sentAt
    });
    process.stdout.write(`confirmed ${index + 1}/${count} ${tx.hash}\n`);
  }

  const endedAt = new Date();
  const endingBalance = await signer.provider.getBalance(signer.address);
  const durationMs = endedAt.getTime() - startedAt.getTime();
  const confirmedCount = transactions.filter((tx) => tx.status === "confirmed").length;
  const totalActionValue = Number(amountUsdc) * confirmedCount;
  const balanceSpent = startingBalance - endingBalance;

  const proof = {
    kind: "real_arc_transaction_frequency",
    status: confirmedCount === count ? "confirmed" : "partial",
    network: ARC_CONFIG.networkName,
    chainId: ARC_CONFIG.chainId,
    rpcUrl: ARC_CONFIG.rpcUrl,
    explorerUrl: ARC_CONFIG.explorerUrl,
    walletAddress: signer.address,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs,
    confirmedCount,
    requestedCount: count,
    amountUsdc,
    perActionPriceOk: Number(amountUsdc) <= 0.01,
    totalActionValueUsdc: totalActionValue.toFixed(6),
    balanceSpentIncludingGasUsdc: formatUnits(balanceSpent, ARC_CONFIG.nativeDecimals),
    averageTransactionsPerSecond: Number((confirmedCount / Math.max(durationMs / 1000, 1)).toFixed(3)),
    firstBlock: transactions[0]?.blockNumber || null,
    lastBlock: transactions.at(-1)?.blockNumber || null,
    sampleTxUrls: transactions.slice(0, 5).map((tx) => tx.txUrl),
    marginExplanation:
      "Each action is priced at 0.000001 USDC. Traditional card rails cannot settle this because fixed fees would exceed the revenue, while Arc uses USDC-native settlement and predictable gas for high-frequency agent actions.",
    transactions
  };

  await saveProof(proof);
  return proof;
}
