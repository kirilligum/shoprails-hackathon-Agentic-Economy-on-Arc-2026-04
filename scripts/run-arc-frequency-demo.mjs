import { runFrequencyProof } from "../src/arc-frequency.js";

function readArg(name, fallback) {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.split("=").slice(1).join("=");
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

const count = Number(readArg("count", "50"));
const amountUsdc = readArg("amount", "0.000001");
const force = process.argv.includes("--force");

const proof = await runFrequencyProof({ count, amountUsdc, force });
console.log(JSON.stringify({
  status: proof.status,
  confirmedCount: proof.confirmedCount,
  amountUsdc: proof.amountUsdc,
  totalActionValueUsdc: proof.totalActionValueUsdc,
  averageTransactionsPerSecond: proof.averageTransactionsPerSecond,
  firstTx: proof.transactions[0]?.txUrl,
  lastTx: proof.transactions.at(-1)?.txUrl,
  artifact: "artifacts/arc-frequency-demo-live.json"
}, null, 2));
