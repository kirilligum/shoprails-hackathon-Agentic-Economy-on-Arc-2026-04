import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { shoprailsEnv } from "./env.js";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GENERATED_DIR = join(process.cwd(), "artifacts", "generated-images");

function safeFileName(value) {
  return String(value).replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

function simpleMockSvg(label, colors) {
  const [bg, accent, ink] = colors;
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1344 768" role="img" aria-label="${label}">
  <rect width="1344" height="768" fill="${bg}"/>
  <path d="M0 588 C260 484 382 690 644 575 C870 477 1072 460 1344 570 L1344 768 L0 768 Z" fill="${accent}" opacity=".32"/>
  <rect x="92" y="92" width="1160" height="584" rx="32" fill="#ffffff" opacity=".56"/>
  <circle cx="332" cy="374" r="156" fill="${accent}" opacity=".78"/>
  <rect x="566" y="250" width="514" height="68" rx="20" fill="${ink}" opacity=".92"/>
  <rect x="566" y="354" width="408" height="44" rx="16" fill="${ink}" opacity=".72"/>
  <rect x="566" y="432" width="492" height="44" rx="16" fill="${ink}" opacity=".52"/>
  <text x="120" y="154" fill="${ink}" font-family="Arial, sans-serif" font-size="54" font-weight="800">${label}</text>
</svg>`.trim();
}

function mockTextFor(name, prompt, fallback) {
  const canned = {
    "llm.plan_mission":
      "Split the buyer request into sushi delivery, serving supplies, pirate costumes, cheap props, and a setup assistant. Enforce the 500 USDC policy and route custom human labor through review.",
    "llm.expand_atomic_queries":
      "Atomic searches: sushi platter for 10, chopsticks and soy kit, adjustable pirate accessories, office-safe props, and a setup assistant with delivery receiving instructions.",
    "llm.rank_offers":
      "Ranked by delivery fit, policy risk, seller reputation, and quantity match. Selected trusted sushi, low-cost props, one reviewed costume pack, and Maya R. for setup. Rejected the blacklisted outlet.",
    "llm.review_summary":
      "The cart is demo-ready: trusted low-risk items settled immediately, higher-control purchases are in review escrow, and blacklisted listings were declined before signing."
  };
  return canned[name] || fallback || `Mock LLM response for ${name}: ${prompt}`;
}

function textFromGeminiResponse(payload) {
  return (payload.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n")
    .trim();
}

function imageFromGeminiResponse(payload) {
  for (const candidate of payload.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      const inlineData = part.inlineData || part.inline_data;
      if (inlineData?.data) {
        return {
          data: inlineData.data,
          mimeType: inlineData.mimeType || inlineData.mime_type || "image/png"
        };
      }
    }
  }
  return null;
}

async function callGemini(model, body, apiKey) {
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY. Add it to .env.local before using real Gemini calls.");
  }

  const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify(body)
  });

  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { error: { message: raw } };
  }
  if (!response.ok) {
    const message = payload.error?.message || `Gemini request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export function getLlmRuntimeConfig() {
  const env = shoprailsEnv();
  return {
    llmProvider: "gemini",
    imageProvider: "gemini",
    textModel: env.textModel,
    textFallbackModel: env.textFallbackModel,
    imageModel: env.imageModel,
    fastImageModel: env.fastImageModel,
    geminiKeyConfigured: Boolean(env.geminiApiKey)
  };
}

export function createLlmProvider(mode = "mock") {
  const env = shoprailsEnv();
  const provider = mode === "gemini" || mode === "real" ? "gemini" : "mock";

  if (provider === "mock") {
    return {
      provider,
      model: "mock-shoprails-llm",
      async generateText({ name, prompt, fallback }) {
        return {
          provider,
          model: "mock-shoprails-llm",
          text: mockTextFor(name, prompt, fallback)
        };
      }
    };
  }

  return {
    provider,
    model: env.textModel,
    async generateText({ name, prompt, fallback }) {
      const responseStyle = String(name || "").startsWith("client.")
        ? "Answer the buyer in 2-5 concise lines. Use only the provided ShopRails facts. Copy transaction URLs exactly when they are relevant."
        : "Return one concise demo-safe sentence. Use only the provided ShopRails facts.";
      const body = {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  "You are the ShopRails hackathon agent planner.",
                  responseStyle,
                  "Do not include secrets, private keys, or invented transaction hashes.",
                  `Call: ${name}`,
                  `Prompt: ${prompt}`,
                  fallback ? `Reference facts and preferred shape: ${fallback}` : ""
                ].filter(Boolean).join("\n")
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: String(name || "").startsWith("client.") ? 320 : 140
        }
      };

      try {
        const payload = await callGemini(env.textModel, body, env.geminiApiKey);
        const text = textFromGeminiResponse(payload);
        if (!text) throw new Error(`Gemini model ${env.textModel} returned no text.`);
        return {
          provider,
          model: env.textModel,
          text
        };
      } catch (primaryError) {
        if (!env.textFallbackModel || env.textFallbackModel === env.textModel) throw primaryError;
        const payload = await callGemini(env.textFallbackModel, body, env.geminiApiKey);
        const text = textFromGeminiResponse(payload);
        if (!text) throw new Error(`Gemini fallback model ${env.textFallbackModel} returned no text.`);
        return {
          provider,
          model: env.textFallbackModel,
          text
        };
      }
    }
  };
}

export async function probeGeminiTextModel(model, prompt = "Reply with exactly: ShopRails text OK") {
  const env = shoprailsEnv();
  try {
    const payload = await callGemini(
      model,
      {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ]
      },
      env.geminiApiKey
    );
    return {
      model,
      ok: true,
      text: textFromGeminiResponse(payload)
    };
  } catch (error) {
    return {
      model,
      ok: false,
      error: error.message
    };
  }
}

export async function runAiProviderSelfTest() {
  const env = shoprailsEnv();
  const textPrompt = "Reply with exactly: ShopRails text OK";
  let configuredText;
  try {
    configuredText = await createLlmProvider("gemini").generateText({
      name: "llm.app_self_test",
      prompt: textPrompt,
      fallback: "ShopRails text OK"
    });
    configuredText = {
      model: configuredText.model,
      provider: configuredText.provider,
      ok: true,
      text: configuredText.text
    };
  } catch (error) {
    configuredText = {
      model: env.textModel,
      provider: "gemini",
      ok: false,
      error: error.message
    };
  }

  let image;
  try {
    image = await generateProductImageAsset(
      {
        id: "shoprails-ai-self-test",
        name: "ShopRails AI provider test tile",
        category: "props",
        reason: "A reusable app self-test image proving the Nano Banana 2 provider can create and serve an image."
      },
      "gemini"
    );
    image = {
      ...image,
      ok: true
    };
  } catch (error) {
    image = {
      provider: "gemini",
      model: env.imageModel,
      ok: false,
      error: error.message
    };
  }

  const flashLitePreview = await probeGeminiTextModel("gemini-3.1-flash-lite-preview", textPrompt);
  const textFallback = await probeGeminiTextModel(env.textFallbackModel, textPrompt);

  return {
    geminiKeyConfigured: Boolean(env.geminiApiKey),
    configuredText,
    flashLitePreview,
    textFallback,
    image,
    note: flashLitePreview.ok
      ? "Gemini 3.1 Flash-Lite Preview is the configured lightweight real LLM for ShopRails."
      : "Gemini 3.1 Flash-Lite Preview is configured, but this API key/version could not run it."
  };
}

export async function generateProductImageAsset(offer, mode = "mock") {
  const env = shoprailsEnv();
  const provider = mode === "gemini" || mode === "real" ? "gemini" : "mock";
  await mkdir(GENERATED_DIR, { recursive: true });

  if (provider === "mock") {
    const fileName = `${safeFileName(offer.id)}-mock.svg`;
    const path = join(GENERATED_DIR, fileName);
    if (!existsSync(path)) {
      const palette = {
        sushi: ["#e0f2fe", "#fb7185", "#0f172a"],
        drinks: ["#dcfce7", "#fbbf24", "#14532d"],
        props: ["#fef3c7", "#38bdf8", "#172033"],
        costumes: ["#dbeafe", "#fbbf24", "#111827"],
        assistant: ["#ede9fe", "#34d399", "#1e1b4b"]
      }[offer.category] || ["#f8fafc", "#94a3b8", "#172033"];
      await writeFile(path, simpleMockSvg(offer.name, palette), "utf8");
    }
    return {
      offerId: offer.id,
      provider,
      model: "mock-nano-banana",
      url: `/artifacts/generated-images/${fileName}`,
      prompt: "mock"
    };
  }

  const fileName = `${safeFileName(offer.id)}-${safeFileName(env.imageModel)}.png`;
  const path = join(GENERATED_DIR, fileName);
  const prompt = [
    "Create a polished 16:9 product card image for a hackathon demo storefront.",
    "No text overlays, no logos, no credit card visuals.",
    `Product: ${offer.name}.`,
    `Category: ${offer.category}.`,
    `Context: ${offer.reason}.`,
    "Style: crisp commercial product photography, bright studio lighting, realistic but demo-friendly."
  ].join(" ");

  if (existsSync(path)) {
    return {
      offerId: offer.id,
      provider,
      model: env.imageModel,
      url: `/artifacts/generated-images/${fileName}`,
      prompt,
      cached: true
    };
  }

  const body = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      imageConfig: {
        aspectRatio: "16:9",
        imageSize: "1K"
      }
    }
  };

  const payload = await callGemini(env.imageModel, body, env.geminiApiKey);
  const image = imageFromGeminiResponse(payload);
  if (!image) {
    throw new Error(`Gemini image model ${env.imageModel} returned no inline image data.`);
  }

  await writeFile(path, Buffer.from(image.data, "base64"));
  return {
    offerId: offer.id,
    provider,
    model: env.imageModel,
    url: `/artifacts/generated-images/${fileName}`,
    prompt
  };
}
