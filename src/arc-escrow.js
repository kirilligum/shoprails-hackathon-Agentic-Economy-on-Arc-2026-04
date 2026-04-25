import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import solc from "solc";
import { Contract, ContractFactory, formatUnits, parseUnits } from "ethers";
import { ARC_CONFIG, merchants, offers } from "./data.js";
import { getArcSigner, scaledArcAmount } from "./arc-live.js";

const CONTRACT_PATH = "contracts/ShopRailsEscrow.sol";
const ARTIFACT_PATH = "artifacts/arc-escrow-live.json";

function explorerTx(hash) {
  return `${ARC_CONFIG.explorerUrl}/tx/${hash}`;
}

function explorerAddress(address) {
  return `${ARC_CONFIG.explorerUrl}/address/${address}`;
}

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item)));
}

async function saveArtifact(artifact) {
  await mkdir(dirname(ARTIFACT_PATH), { recursive: true });
  await writeFile(ARTIFACT_PATH, JSON.stringify(jsonSafe(artifact), null, 2));
}

export async function readEscrowArtifact() {
  if (!existsSync(ARTIFACT_PATH)) return null;
  return JSON.parse(await readFile(ARTIFACT_PATH, "utf8"));
}

export async function compileEscrowContract() {
  const source = await readFile(CONTRACT_PATH, "utf8");
  const input = {
    language: "Solidity",
    sources: {
      "ShopRailsEscrow.sol": { content: source }
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"]
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter((item) => item.severity === "error");
  if (errors.length) {
    throw new Error(errors.map((item) => item.formattedMessage).join("\n"));
  }

  const contract = output.contracts["ShopRailsEscrow.sol"].ShopRailsEscrow;
  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`
  };
}

export async function deployEscrowContract({ force = false } = {}) {
  const existing = await readEscrowArtifact();
  if (existing?.contractAddress && !force) return existing;

  const signer = await getArcSigner();
  const compiled = await compileEscrowContract();
  const factory = new ContractFactory(compiled.abi, compiled.bytecode, signer);
  const contract = await factory.deploy(await signer.getAddress());
  const receipt = await contract.deploymentTransaction().wait(1);
  const artifact = {
    network: ARC_CONFIG.networkName,
    chainId: ARC_CONFIG.chainId,
    contractAddress: await contract.getAddress(),
    reviewer: await signer.getAddress(),
    abi: compiled.abi,
    deployTxHash: receipt.hash,
    deployBlockNumber: receipt.blockNumber,
    explorerUrl: ARC_CONFIG.explorerUrl,
    createdAt: new Date().toISOString(),
    flows: []
  };
  await saveArtifact(artifact);
  return artifact;
}

async function getEscrowContract() {
  const artifact = await deployEscrowContract();
  const signer = await getArcSigner();
  return {
    artifact,
    contract: new Contract(artifact.contractAddress, artifact.abi, signer),
    signer
  };
}

function offerFor(id) {
  const offer = offers.find((item) => item.id === id);
  if (!offer) throw new Error(`Unknown offer ${id}`);
  const merchant = merchants[offer.merchantId];
  if (!merchant) throw new Error(`Unknown merchant ${offer.merchantId}`);
  return { offer, merchant };
}

function escrowIdFromReceipt(receipt) {
  for (const log of receipt.logs || []) {
    try {
      const parsed = log.fragment ? log : null;
      if (parsed?.name === "EscrowCreated") return parsed.args.escrowId.toString();
    } catch {
      // ethers ContractTransactionReceipt may already expose parsed logs for known events.
    }
  }
  for (const log of receipt.logs || []) {
    if (log.eventName === "EscrowCreated") return log.args.escrowId.toString();
  }
  return null;
}

export async function createEscrowForOffer(offerId, decisionId = "live-policy-review") {
  const { artifact, contract } = await getEscrowContract();
  const { offer, merchant } = offerFor(offerId);
  const amountUsdc = scaledArcAmount(offer.price);
  const amountWei = parseUnits(amountUsdc, ARC_CONFIG.nativeDecimals);
  const tx = await contract.createEscrow(merchant.wallet, offerId, decisionId, { value: amountWei });
  const receipt = await tx.wait(1);
  const parsed = receipt.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((log) => log?.name === "EscrowCreated");

  return {
    offerId,
    offerName: offer.name,
    seller: merchant.wallet,
    sellerName: merchant.name,
    amountUsdc,
    amountWei: amountWei.toString(),
    escrowId: parsed?.args?.escrowId?.toString() || escrowIdFromReceipt(receipt),
    createTxHash: tx.hash,
    createBlockNumber: receipt.blockNumber,
    createTxUrl: explorerTx(tx.hash),
    contractAddress: artifact.contractAddress,
    contractUrl: explorerAddress(artifact.contractAddress),
    status: "held"
  };
}

export async function releaseEscrow(escrowId) {
  const { contract } = await getEscrowContract();
  const tx = await contract.release(escrowId);
  const receipt = await tx.wait(1);
  return {
    escrowId: String(escrowId),
    releaseTxHash: tx.hash,
    releaseBlockNumber: receipt.blockNumber,
    releaseTxUrl: explorerTx(tx.hash),
    status: "released"
  };
}

export async function refundEscrow(escrowId) {
  const { contract } = await getEscrowContract();
  const tx = await contract.refund(escrowId);
  const receipt = await tx.wait(1);
  return {
    escrowId: String(escrowId),
    refundTxHash: tx.hash,
    refundBlockNumber: receipt.blockNumber,
    refundTxUrl: explorerTx(tx.hash),
    status: "refunded"
  };
}

export async function getEscrowOnchainState(escrowId) {
  const { contract } = await getEscrowContract();
  const item = await contract.escrows(escrowId);
  return {
    escrowId: String(escrowId),
    buyer: item.buyer,
    seller: item.seller,
    amountWei: item.amount.toString(),
    amountUsdc: formatUnits(item.amount, ARC_CONFIG.nativeDecimals),
    offerId: item.offerId,
    policyDecisionId: item.policyDecisionId,
    statusCode: Number(item.status),
    status: ["none", "held", "released", "refunded"][Number(item.status)] || "unknown"
  };
}

export async function runEscrowDemo({ force = false } = {}) {
  const artifact = await deployEscrowContract({ force });
  if (artifact.flows?.some((flow) => flow.kind === "review_release") && !force) {
    return artifact;
  }

  const flows = [];
  for (const offerId of ["crew-costume-pack", "assistant-maya"]) {
    const created = await createEscrowForOffer(offerId, `live-review-${offerId}`);
    const released = await releaseEscrow(created.escrowId);
    flows.push({
      kind: "review_release",
      ...created,
      ...released,
      finalState: await getEscrowOnchainState(created.escrowId)
    });
  }

  const refundCreated = await createEscrowForOffer("gold-compass-listing", "live-refund-risk-smoke");
  const refunded = await refundEscrow(refundCreated.escrowId);
  flows.push({
    kind: "refund_smoke",
    ...refundCreated,
    ...refunded,
    finalState: await getEscrowOnchainState(refundCreated.escrowId)
  });

  const updated = {
    ...artifact,
    flows,
    lastRunAt: new Date().toISOString()
  };
  await saveArtifact(updated);
  return updated;
}
