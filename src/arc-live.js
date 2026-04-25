import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { JsonRpcProvider, Wallet, formatUnits, parseUnits } from "ethers";
import { ARC_CONFIG } from "./data.js";

const WALLET_PATH = "artifacts/arc-demo-wallet.json";
const PRICE_SCALE = 100000;

let cachedWallet;

export function scaledArcAmount(priceUsdc) {
  return (Number(priceUsdc) / PRICE_SCALE).toFixed(6);
}

export async function getArcSigner() {
  if (cachedWallet) return cachedWallet;
  if (!existsSync(WALLET_PATH)) {
    throw new Error(`Missing ${WALLET_PATH}. Generate the demo wallet before sending Arc transactions.`);
  }

  const raw = await readFile(WALLET_PATH, "utf8");
  const artifact = JSON.parse(raw);
  const provider = new JsonRpcProvider(ARC_CONFIG.rpcUrl, {
    chainId: ARC_CONFIG.chainId,
    name: "arc-testnet"
  });
  cachedWallet = new Wallet(artifact.privateKey, provider);
  return cachedWallet;
}

export async function getArcBalance(address) {
  const signer = await getArcSigner();
  const balance = await signer.provider.getBalance(address);
  return {
    address,
    balanceWei: balance.toString(),
    balanceUsdc: Number(formatUnits(balance, 18))
  };
}

export async function sendScaledUsdcTransactions(items) {
  const signer = await getArcSigner();
  const results = [];

  for (const item of items) {
    const amountUsdc = scaledArcAmount(item.amount);
    const tx = await signer.sendTransaction({
      to: item.to,
      value: parseUnits(amountUsdc, 18)
    });
    const receipt = await tx.wait(1);

    results.push({
      itemId: item.id,
      label: item.label,
      kind: item.kind,
      to: item.to,
      humanPrice: item.amount,
      amountUsdc,
      hash: tx.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? "confirmed" : "failed"
    });
  }

  return results;
}
