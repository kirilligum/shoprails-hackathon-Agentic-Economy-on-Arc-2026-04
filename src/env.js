import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let loaded = false;

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const separator = trimmed.indexOf("=");
  if (separator === -1) return null;

  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return key ? [key, value] : null;
}

export function loadLocalEnv(root = process.cwd()) {
  if (loaded) return;
  loaded = true;

  for (const name of [".env.local", ".env"]) {
    const path = join(root, name);
    if (!existsSync(path)) continue;

    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

export function shoprailsEnv() {
  loadLocalEnv();
  return {
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    llmProvider: process.env.SHOPRAILS_LLM_PROVIDER || "gemini",
    imageProvider: process.env.SHOPRAILS_IMAGE_PROVIDER || "mock",
    textModel: process.env.SHOPRAILS_TEXT_MODEL || "gemini-3.1-flash-lite-preview",
    textFallbackModel: process.env.SHOPRAILS_TEXT_FALLBACK_MODEL || "gemini-3-flash-preview",
    imageModel: process.env.SHOPRAILS_IMAGE_MODEL || "gemini-3.1-flash-image-preview",
    fastImageModel: process.env.SHOPRAILS_FAST_IMAGE_MODEL || "gemini-2.5-flash-image",
    circleApiKey: process.env.CIRCLE_API_KEY || "",
    circleEntitySecret: process.env.CIRCLE_ENTITY_SECRET || "",
    circleWalletSetId: process.env.CIRCLE_WALLET_SET_ID || "",
    circleWalletId: process.env.CIRCLE_WALLET_ID || "",
    circleWalletAddress: process.env.CIRCLE_WALLET_ADDRESS || "",
    circleWalletBlockchain: process.env.CIRCLE_WALLET_BLOCKCHAIN || "ARC-TESTNET"
  };
}
