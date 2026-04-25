import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  Blockchain,
  initiateDeveloperControlledWalletsClient,
  registerEntitySecretCiphertext
} from "@circle-fin/developer-controlled-wallets";

const ROOT = process.cwd();
const ENV_PATH = join(ROOT, ".env.local");
const ARTIFACT_PATH = join(ROOT, "artifacts", "circle-wallets-live.json");
const RECOVERY_DIR = join(ROOT, "artifacts", "circle-wallets-recovery");
const BLOCKCHAIN = Blockchain.ArcTestnet || "ARC-TESTNET";
const WALLET_REF_ID = "shoprails-hackathon-buyer";

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

function upsertEnvValues(path, updates) {
  const original = existsSync(path) ? readFileSync(path, "utf8") : "";
  const seen = new Set();
  const lines = original.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match || !Object.hasOwn(updates, match[1])) return line;
    seen.add(match[1]);
    return `${match[1]}=${updates[match[1]]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) lines.push(`${key}=${value}`);
  }

  writeFileSync(path, lines.join("\n").replace(/\n{3,}/g, "\n\n"), "utf8");
}

function safeError(error) {
  const responseMessage = error?.response?.data?.message || error?.response?.data?.error;
  return {
    name: error?.name || "Error",
    message: responseMessage || error?.message || "Circle request failed",
    status: error?.response?.status || error?.status || ""
  };
}

async function quietCircleCall(callback) {
  const originalLog = console.log;
  console.log = () => {};
  try {
    return await callback();
  } finally {
    console.log = originalLog;
  }
}

async function main() {
  const env = parseEnvFile(ENV_PATH);
  const apiKey = process.env.CIRCLE_API_KEY || env.CIRCLE_API_KEY;
  if (!apiKey) {
    throw new Error("CIRCLE_API_KEY is required in .env.local.");
  }

  mkdirSync(RECOVERY_DIR, { recursive: true });
  mkdirSync(join(ROOT, "artifacts"), { recursive: true });

  const updates = {};
  const steps = [];
  let entitySecret = process.env.CIRCLE_ENTITY_SECRET || env.CIRCLE_ENTITY_SECRET;

  if (!entitySecret) {
    entitySecret = crypto.randomBytes(32).toString("hex");
    try {
      await quietCircleCall(() =>
        registerEntitySecretCiphertext({
          apiKey,
          entitySecret,
          recoveryFileDownloadPath: RECOVERY_DIR
        })
      );
      updates.CIRCLE_ENTITY_SECRET = entitySecret;
      steps.push("registered_entity_secret");
    } catch (error) {
      const safe = safeError(error);
      writeFileSync(
        ARTIFACT_PATH,
        JSON.stringify(
          {
            kind: "circle_wallets_live",
            status: "entity_secret_registration_failed",
            error: safe,
            updatedAt: new Date().toISOString()
          },
          null,
          2
        ),
        "utf8"
      );
      throw new Error(`Circle entity secret registration failed: ${safe.message}`);
    }
  } else {
    steps.push("using_existing_entity_secret");
  }

  const client = initiateDeveloperControlledWalletsClient({
    apiKey,
    entitySecret,
    userAgent: "ShopRails Hackathon Demo"
  });

  let walletSetId = process.env.CIRCLE_WALLET_SET_ID || env.CIRCLE_WALLET_SET_ID;
  let walletSet = null;
  if (walletSetId) {
    try {
      walletSet = (await client.getWalletSet({ id: walletSetId })).data?.walletSet || null;
      steps.push("using_existing_wallet_set");
    } catch {
      walletSetId = "";
    }
  }

  if (!walletSetId) {
    const response = await client.createWalletSet({
      name: "ShopRails Hackathon Demo",
      idempotencyKey: crypto.randomUUID()
    });
    walletSet = response.data?.walletSet || null;
    walletSetId = walletSet?.id;
    if (!walletSetId) throw new Error("Circle did not return a wallet set id.");
    updates.CIRCLE_WALLET_SET_ID = walletSetId;
    steps.push("created_wallet_set");
  }

  let wallet = null;
  const existingWalletId = process.env.CIRCLE_WALLET_ID || env.CIRCLE_WALLET_ID;
  if (existingWalletId) {
    try {
      wallet = (await client.getWallet({ id: existingWalletId })).data?.wallet || null;
      steps.push("using_existing_wallet");
    } catch {
      wallet = null;
    }
  }

  if (!wallet) {
    const listed = await client.listWallets({
      walletSetId,
      blockchain: BLOCKCHAIN,
      refId: WALLET_REF_ID,
      pageSize: 10
    });
    wallet = listed.data?.wallets?.[0] || null;
    if (wallet) steps.push("found_existing_wallet");
  }

  if (!wallet) {
    const response = await client.createWallets({
      blockchains: [BLOCKCHAIN],
      count: 1,
      walletSetId,
      accountType: "EOA",
      metadata: [
        {
          name: "ShopRails Buyer Agent Wallet",
          refId: WALLET_REF_ID
        }
      ],
      idempotencyKey: crypto.randomUUID()
    });
    wallet = response.data?.wallets?.[0] || null;
    if (!wallet?.id || !wallet?.address) throw new Error("Circle did not return an Arc Testnet wallet.");
    steps.push("created_arc_testnet_wallet");
  }

  updates.CIRCLE_WALLET_SET_ID = walletSetId;
  updates.CIRCLE_WALLET_ID = wallet.id;
  updates.CIRCLE_WALLET_ADDRESS = wallet.address;
  updates.CIRCLE_WALLET_BLOCKCHAIN = wallet.blockchain || BLOCKCHAIN;
  if (!env.CIRCLE_ENTITY_SECRET && !updates.CIRCLE_ENTITY_SECRET) {
    updates.CIRCLE_ENTITY_SECRET = entitySecret;
  }
  upsertEnvValues(ENV_PATH, updates);

  const artifact = {
    kind: "circle_wallets_live",
    status: "ready",
    steps,
    walletSet: walletSet || { id: walletSetId },
    wallet,
    recovery: {
      directory: "artifacts/circle-wallets-recovery",
      savedBySdk: true
    },
    arcscanAddressUrl: `https://testnet.arcscan.app/address/${wallet.address}`,
    updatedAt: new Date().toISOString()
  };

  writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2), "utf8");

  console.log(JSON.stringify({
    status: artifact.status,
    walletSetId,
    walletId: wallet.id,
    walletAddress: wallet.address,
    blockchain: wallet.blockchain || BLOCKCHAIN,
    artifact: resolve(ARTIFACT_PATH),
    recoveryDirectory: "artifacts/circle-wallets-recovery",
    steps
  }, null, 2));
}

main().catch((error) => {
  const safe = safeError(error);
  console.error(`Circle Wallets setup failed: ${safe.message}`);
  process.exitCode = 1;
});
