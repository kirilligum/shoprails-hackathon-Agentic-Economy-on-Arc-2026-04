import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = process.cwd();
const dist = resolve(root, "dist");

function assertInsideRoot(path) {
  const rel = relative(resolve(root), resolve(path));
  if (rel.startsWith("..") || rel === "..") {
    throw new Error(`Refusing to write outside workspace: ${path}`);
  }
}

async function copyFile(from, to) {
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to);
}

async function copyDir(from, to) {
  await mkdir(to, { recursive: true });
  await cp(from, to, { recursive: true });
}

assertInsideRoot(dist);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await copyFile("index.html", join(dist, "index.html"));

for (const file of ["app.js", "styles.css", "data.js", "policy.js", "scorer.js", "shoprails-tools.js", "try-on.js"]) {
  await copyFile(join("src", file), join(dist, "src", file));
}

await copyDir(join("artifacts", "generated-images"), join(dist, "artifacts", "generated-images"));
await copyFile("kirill_standing.jpg", join(dist, "artifacts", "kirill_standing.jpg"));

const artifactRootFiles = await readdir("artifacts", { withFileTypes: true });
const allowedJson = new Set([
  "arc-escrow-live.json",
  "arc-frequency-demo-live.json",
  "cached-llm-responses.json",
  "circle-wallets-live.json",
  "circle-wallets-payment-live.json",
  "x402-nanopayment-live.json"
]);

for (const entry of artifactRootFiles) {
  if (!entry.isFile()) continue;
  const isPublicImage = /\.(png|jpg|jpeg|webp|svg)$/i.test(entry.name);
  const isPublicProof = allowedJson.has(entry.name);
  if (!isPublicImage && !isPublicProof) continue;
  await copyFile(join("artifacts", entry.name), join(dist, "artifacts", entry.name));
}

console.log(`Built Cloudflare assets in ${dist}`);
