import crypto from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatUnits, parseUnits } from "ethers";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { getArcSigner } from "../src/arc-live.js";
import { ARC_CONFIG, merchants } from "../src/data.js";

const ROOT = process.cwd();
const ENV_PATH = join(ROOT, ".env.local");
const ARTIFACT_PATH = join(ROOT, "artifacts", "circle-wallets-payment-live.json");
const TRANSFER_AMOUNT = "0.001";
const MIN_WALLET_BALANCE = parseUnits("0.02", 18);
const FUND_AMOUNT = parseUnits("0.05", 18);
const DESTINATION_MERCHANT = merchants["sushi-harbor"];

function parseEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function safeError(error) {
  const responseMessage = error?.response?.data?.message || error?.response?.data?.error;
  return {
    name: error?.name || "Error",
    message: responseMessage || error?.message || "Circle Wallets transfer failed",
    status: error?.response?.status || error?.status || ""
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollTransaction(client, transactionId) {
  let transaction = null;
  for (let attempt = 0; attempt < 75; attempt += 1) {
    const response = await client.getTransaction({ id: transactionId });
    transaction = response.data?.transaction || null;
    if (["COMPLETE", "CONFIRMED", "FAILED", "DENIED", "CANCELLED"].includes(transaction?.state)) {
      return transaction;
    }
    await sleep(2000);
  }
  return transaction;
}

async function main() {
  const force = process.argv.includes("--force");
  if (!force && existsSync(ARTIFACT_PATH)) {
    const cached = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
    if (cached.status === "COMPLETE" || cached.txHash) {
      console.log(JSON.stringify({
        status: cached.status,
        transactionId: cached.transactionId,
        txHash: cached.txHash,
        txUrl: cached.txUrl,
        cached: true
      }, null, 2));
      return;
    }
  }

  const env = parseEnvFile(ENV_PATH);
  const apiKey = process.env.CIRCLE_API_KEY || env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET || env.CIRCLE_ENTITY_SECRET;
  const walletAddress = process.env.CIRCLE_WALLET_ADDRESS || env.CIRCLE_WALLET_ADDRESS;
  const blockchain = process.env.CIRCLE_WALLET_BLOCKCHAIN || env.CIRCLE_WALLET_BLOCKCHAIN || "ARC-TESTNET";

  if (!apiKey || !entitySecret || !walletAddress) {
    throw new Error("Run npm run circle:setup before npm run circle:transfer.");
  }

  const signer = await getArcSigner();
  const beforeBalance = await signer.provider.getBalance(walletAddress);
  let fundingTxHash = "";
  let fundingBlockNumber = "";

  if (beforeBalance < MIN_WALLET_BALANCE) {
    const tx = await signer.sendTransaction({
      to: walletAddress,
      value: FUND_AMOUNT
    });
    const receipt = await tx.wait(1);
    fundingTxHash = tx.hash;
    fundingBlockNumber = receipt.blockNumber;
  }

  const client = initiateDeveloperControlledWalletsClient({
    apiKey,
    entitySecret,
    userAgent: "ShopRails Hackathon Demo"
  });

  const response = await client.createTransaction({
    blockchain,
    walletAddress,
    destinationAddress: DESTINATION_MERCHANT.wallet,
    amount: [TRANSFER_AMOUNT],
    tokenAddress: ARC_CONFIG.usdcAddress,
    fee: {
      type: "level",
      config: {
        feeLevel: "MEDIUM"
      }
    },
    refId: `shoprails-circle-wallet-${Date.now()}`,
    idempotencyKey: crypto.randomUUID()
  });

  const transactionId = response.data?.id;
  if (!transactionId) throw new Error("Circle did not return a transaction id.");

  const transaction = await pollTransaction(client, transactionId);
  const txHash = transaction?.txHash || "";
  const artifact = {
    kind: "circle_wallets_arc_transfer",
    status: transaction?.state || response.data?.state || "INITIATED",
    transactionId,
    txHash,
    txUrl: txHash ? `${ARC_CONFIG.explorerUrl}/tx/${txHash}` : "",
    amount: TRANSFER_AMOUNT,
    tokenAddress: ARC_CONFIG.usdcAddress,
    blockchain,
    from: walletAddress,
    to: DESTINATION_MERCHANT.wallet,
    merchant: DESTINATION_MERCHANT.name,
    fundingTxHash,
    fundingTxUrl: fundingTxHash ? `${ARC_CONFIG.explorerUrl}/tx/${fundingTxHash}` : "",
    fundingBlockNumber,
    beforeBalanceUsdc: formatUnits(beforeBalance, 18),
    finalTransaction: transaction,
    updatedAt: new Date().toISOString()
  };

  writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2), "utf8");
  console.log(JSON.stringify({
    status: artifact.status,
    transactionId,
    txHash,
    txUrl: artifact.txUrl,
    fundingTxHash,
    amount: TRANSFER_AMOUNT
  }, null, 2));
}

main().catch((error) => {
  const safe = safeError(error);
  writeFileSync(
    ARTIFACT_PATH,
    JSON.stringify(
      {
        kind: "circle_wallets_arc_transfer",
        status: "failed",
        error: safe,
        updatedAt: new Date().toISOString()
      },
      null,
      2
    ),
    "utf8"
  );
  console.error(`Circle Wallets transfer failed: ${safe.message}`);
  process.exitCode = 1;
});
