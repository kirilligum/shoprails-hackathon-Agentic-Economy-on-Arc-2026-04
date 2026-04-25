import { createECDH, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const MASK_64 = (1n << 64n) - 1n;
const SECP256K1_N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
];
const ROT = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14]
];

function rot(value, shift) {
  const n = BigInt(shift);
  if (n === 0n) return value & MASK_64;
  return ((value << n) | (value >> (64n - n))) & MASK_64;
}

function keccakF(state) {
  for (const rc of RC) {
    const c = new Array(5).fill(0n);
    const d = new Array(5).fill(0n);

    for (let x = 0; x < 5; x += 1) {
      c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x += 1) {
      d[x] = c[(x + 4) % 5] ^ rot(c[(x + 1) % 5], 1);
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] ^= d[x];
      }
    }

    const b = new Array(25).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        b[y + 5 * ((2 * x + 3 * y) % 5)] = rot(state[x + 5 * y], ROT[x][y]);
      }
    }

    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] = (b[x + 5 * y] ^ ((~b[((x + 1) % 5) + 5 * y]) & b[((x + 2) % 5) + 5 * y])) & MASK_64;
      }
    }

    state[0] ^= rc;
  }
}

function keccak256(bytes) {
  const rate = 136;
  const state = new Array(25).fill(0n);
  const input = Array.from(bytes);
  input.push(0x01);
  while ((input.length % rate) !== rate - 1) input.push(0);
  input.push(0x80);

  for (let offset = 0; offset < input.length; offset += rate) {
    const block = input.slice(offset, offset + rate);

    for (let i = 0; i < rate / 8; i += 1) {
      let lane = 0n;
      for (let j = 0; j < 8; j += 1) {
        lane |= BigInt(block[i * 8 + j] || 0) << BigInt(8 * j);
      }
      state[i] ^= lane;
    }
    keccakF(state);
  }

  const out = [];
  for (let i = 0; out.length < 32; i += 1) {
    const lane = state[i];
    for (let j = 0; j < 8 && out.length < 32; j += 1) {
      out.push(Number((lane >> BigInt(8 * j)) & 0xffn));
    }
  }
  return Buffer.from(out);
}

function privateKeyToAddress(privateKey) {
  const ecdh = createECDH("secp256k1");
  ecdh.setPrivateKey(privateKey);
  const publicKey = ecdh.getPublicKey(null, "uncompressed").subarray(1);
  return toChecksumAddress(keccak256(publicKey).subarray(-20).toString("hex"));
}

function toChecksumAddress(hexAddress) {
  const lower = hexAddress.toLowerCase();
  const hash = keccak256(Buffer.from(lower, "ascii")).toString("hex");
  let checksum = "0x";
  for (let i = 0; i < lower.length; i += 1) {
    checksum += Number.parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return checksum;
}

function randomPrivateKey() {
  while (true) {
    const key = randomBytes(32);
    const value = BigInt(`0x${key.toString("hex")}`);
    if (value > 0n && value < SECP256K1_N) return key;
  }
}

const emptyHash = keccak256(Buffer.alloc(0)).toString("hex");
if (emptyHash !== "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470") {
  throw new Error(`Keccak self-test failed: ${emptyHash}`);
}

const privateKey = randomPrivateKey();
const address = privateKeyToAddress(privateKey);
const wallet = {
  chain: "Arc Testnet",
  chainId: 5042002,
  rpcUrl: "https://rpc.testnet.arc.network",
  explorerAddressUrl: `https://testnet.arcscan.app/address/${address}`,
  address,
  privateKey: `0x${privateKey.toString("hex")}`,
  createdAt: new Date().toISOString()
};

await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/arc-demo-wallet.json", `${JSON.stringify(wallet, null, 2)}\n`, { mode: 0o600 });
console.log(address);
