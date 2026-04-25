import { shoprailsEnv } from "./env.js";
import { demoWallets } from "./data.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function shortFingerprint(value) {
  if (!value) return "";
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function readJsonArtifact(filename) {
  const artifactPath = join(process.cwd(), "artifacts", filename);
  if (!existsSync(artifactPath)) return null;

  try {
    return JSON.parse(readFileSync(artifactPath, "utf8"));
  } catch {
    return null;
  }
}

async function probeCircleApiKey(apiKey) {
  if (!apiKey) {
    return {
      ok: false,
      status: "missing_api_key"
    };
  }

  try {
    const response = await fetch("https://api.circle.com/v1/w3s/config/entity/publicKey", {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`
      }
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      entityPublicKeyConfigured: Boolean(payload.data?.publicKey),
      publicKeyFingerprint: payload.data?.publicKey ? shortFingerprint(payload.data.publicKey) : "",
      error: response.ok ? "" : payload.message || payload.error || response.statusText
    };
  } catch (error) {
    return {
      ok: false,
      status: "network_error",
      error: error.message
    };
  }
}

export async function getCircleWalletsStatus({ probe = true } = {}) {
  const env = shoprailsEnv();
  const artifact = readJsonArtifact("circle-wallets-live.json");
  const payment = readJsonArtifact("circle-wallets-payment-live.json");
  const apiKeyConfigured = Boolean(env.circleApiKey);
  const entitySecretConfigured = Boolean(env.circleEntitySecret);
  const walletSetConfigured = Boolean(env.circleWalletSetId);
  const walletConfigured = Boolean(env.circleWalletId && env.circleWalletAddress);
  const configured = Boolean(apiKeyConfigured && entitySecretConfigured && walletSetConfigured && walletConfigured);
  const apiProbe = probe ? await probeCircleApiKey(env.circleApiKey) : null;
  const liveWallet = artifact?.wallet || {
    id: env.circleWalletId,
    address: env.circleWalletAddress,
    blockchain: env.circleWalletBlockchain
  };

  return {
    kind: "circle_wallets_adapter",
    apiKeyConfigured,
    entitySecretConfigured,
    walletSetConfigured,
    walletConfigured,
    configured,
    status: configured
      ? "ready_with_arc_testnet_wallet"
      : apiKeyConfigured
        ? "api_key_validating_missing_wallet_secret_or_set"
        : "local_signer_active",
    apiProbe,
    walletSetId: env.circleWalletSetId,
    wallet: liveWallet,
    artifact: artifact
      ? {
          status: artifact.status,
          updatedAt: artifact.updatedAt,
          arcscanAddressUrl: artifact.arcscanAddressUrl,
          steps: artifact.steps || []
        }
      : null,
    payment: payment
      ? {
          status: payment.status,
          amount: payment.amount,
          transactionId: payment.transactionId,
          txHash: payment.txHash,
          txUrl: payment.txUrl,
          fundingTxHash: payment.fundingTxHash,
          fundingTxUrl: payment.fundingTxUrl,
          updatedAt: payment.updatedAt
        }
      : null,
    buyerWallet: demoWallets.buyer.circleId,
    agentWallet: demoWallets.agent.circleId,
    buyerAddress: demoWallets.buyer.address,
    agentAddress: demoWallets.agent.address,
    requiredEnv: ["CIRCLE_API_KEY", "CIRCLE_ENTITY_SECRET", "CIRCLE_WALLET_SET_ID", "CIRCLE_WALLET_ID"],
    note: configured
      ? "Circle Wallets credentials are configured with an Arc Testnet EOA wallet. Fund it from the Circle faucet before routing a live transaction through Circle Wallets."
      : apiKeyConfigured
        ? "Circle API key is saved server-side. Run npm run circle:setup to register the Entity Secret and create the Arc Testnet wallet."
        : "No Circle Wallets API credentials are configured locally, so live Arc/x402 proofs use the funded demo signer while the UI marks Circle Wallets as an adapter-ready path."
  };
}
