# ShopRails Hackathon MVP

ShopRails is an agent-native commerce rail for the Nano Payments x Arc hackathon. It lets an LLM shop across merchant surfaces while buyer policy, risk scoring, Circle Wallets, x402 Nanopayments, and Arc USDC escrow decide whether each item is bought now, held for review, or declined.

## Run

```powershell
npm start
```

Secrets live in `.env.local` and are loaded only by `server.js`. The browser can
see whether Gemini is configured, but it never receives the API key.

Open `http://localhost:4173`. The safest hackathon path is one click:

1. Click `Run full demo` in the header or `Run perfect hackathon demo`.
2. Point at the Judge proof panel.
3. Open the real x402 transfer link and an Arc escrow tx link if asked.

The manual path still works:

1. Click `1. Run agent plan + show buy-now txs`.
2. Click `2. Explain cart`.
3. Click `3. Confirm review + pay`.
4. Click `4. View real Arc tx`.

The live Arc demo scales displayed prices by `100,000x` for testnet settlement.
For example, a `60.00 USDC` costume line sends `0.000600 USDC` on Arc
Testnet. Real proofs are cached under `artifacts/` so repeat full-demo clicks
do not accidentally duplicate testnet spending.

The controlled Arc Testnet demo wallet address is:

```text
0xE6420890312234643FC16a42147f7d8EeD9Be1F6
```

Address link: https://testnet.arcscan.app/address/0xE6420890312234643FC16a42147f7d8EeD9Be1F6

Confirmed funding transaction:

```text
https://testnet.arcscan.app/tx/0xdcb1e3d6f8cf96d7a10387588876e1ec00ead9a7e3dce18ebd1a160e13c2af54
```

Circle faucet: https://faucet.circle.com/

Circle Wallets Arc Testnet EOA created by `npm run circle:setup`:

```text
0x7d160d05d05a6f8175abd9ec04a48ec48642190f
```

Circle Wallets address link: https://testnet.arcscan.app/address/0x7d160d05d05a6f8175abd9ec04a48ec48642190f

Circle Wallets signed transfer proof:

```text
https://testnet.arcscan.app/tx/0x95c1c62fb23da00c732bdf38869894032797a1eb4669596bed3830837c599d07
```

## Demo Path

1. Buyer starts with `500 USDC` in a ShopRails wallet.
2. OpenClaw decomposes the sushi dinner request into atomic catalog queries.
3. One catalog request is a real Circle Gateway/x402 nanopayment; the rest are
   labeled simulated receipt rows for the fuller agent trace.
4. Trusted, low-risk items settle immediately on Arc USDC.
5. Higher-risk or human-service items go to a real payable Arc escrow contract.
6. ArcScan transaction links appear in the wallet panel and each cart row.
7. Blacklisted seller/brand offers are declined before signing.
8. The chat input is prefilled with `confirm all reviewed items` for a one-click release path.

## Live Proofs

- Real Circle x402 transfer:
  `ca4e40f9-1936-4e27-98bd-1b7b33f9c6b8`
- Real x402 proof file:
  `artifacts/x402-nanopayment-live.json`
- Real Arc escrow contract:
  `0x50c86d09A84186b87C60600Fb43aec5b4687EADC`
- Escrow deploy tx:
  https://testnet.arcscan.app/tx/0x0c3b3ae13c0909c7140a693101b16298324f82b1a4d5191178d0ba090363f6c3
- Costume escrow create/release:
  https://testnet.arcscan.app/tx/0x5d3e06fe2c6b322d2cedffca55e912ecfa4d8d0b4231681c00074ccd0c16553c
  https://testnet.arcscan.app/tx/0x97c45dd3df1ca083914ad49c0dbdaeb2fae23bf16bccaf5bdf0b67bede694f2d
- Assistant escrow create/release:
  https://testnet.arcscan.app/tx/0xf8754e0a5b73f40ff697ea61702d2f5bcf0d99004ddc21df801d18b739705c1c
  https://testnet.arcscan.app/tx/0x57f624e52c6c0f045b28fa3aab445f0a968972d148128642bed76137a583fdb4
- Refund smoke create/refund:
  https://testnet.arcscan.app/tx/0x6c8bc81515c7a5b1ae75243b54a5fadc8caee79bb5df01dbc1704d632b96b2b4
  https://testnet.arcscan.app/tx/0x3a389f9c1500b0d493c5036db882c6e2f7d00e8f0f99731cf86e89d5d4be7397

The Circle Wallets API path is live: the API key is valid, the entity secret is
registered, wallet set `ec3951bc-f5cd-530a-bff4-4b081e69c265` exists, an
`ARC-TESTNET` EOA wallet is created, and transaction
`6232e39e-6b50-560f-9004-ac09b700a1e3` sent `0.001 USDC` through Circle
Wallets to the Sushi Harbor seller address.

## LLM And Images

- Default tests use the deterministic mock provider.
- The UI has a Mock/Gemini toggle for the LLM call log.
- Real text calls use `SHOPRAILS_TEXT_MODEL`, currently
  `gemini-3.1-flash-lite-preview`, with
  `SHOPRAILS_TEXT_FALLBACK_MODEL=gemini-3-flash-preview`.
- Product images were generated with the Gemini image provider configured by
  `SHOPRAILS_IMAGE_MODEL`, currently `gemini-3.1-flash-image-preview`
  (Nano Banana 2).
- Re-clicking `Generate Nano Banana images` reuses cached files in
  `artifacts/generated-images` before making another image call.
- Click `Test AI providers` in the mission panel to verify Gemini 3.1
  Flash-Lite, text fallback, and Nano Banana 2 image generation from the app.

Server-side demo endpoints:

```text
GET  /api/llm/config
POST /api/llm/call
POST /api/images/generate
POST /api/demo/run
POST /api/demo/full
GET  /api/proofs
GET  /api/circle/wallets/status
POST /api/arc/escrow/demo
POST /api/x402/nanopayment/run
```

## 90-Second Pitch

Agents cannot safely fill in credit cards, so ShopRails gives them a safer
commerce rail. The buyer funds an AI wallet with USDC on Arc, sets policy, and
asks an agent to organize a pirate sushi dinner. The agent searches merchant
pages that are both human-visible and machine-readable, pays one premium catalog
API with Circle x402 nanopayments, and sends purchase intents through policy.
Low-risk items buy now. Human services and higher-control items go to an Arc
escrow contract. The buyer reviews the cart, chats with it, and releases funds.
The proof panel shows what is real: Gemini 3.1 Flash-Lite calls, Nano Banana 2
images, Circle x402 transfer, Arc escrow transactions, plus clearly labeled
simulated receipt rows for the broader demo trace.

Backup if Wi-Fi stalls: click `Run full demo`; it uses cached live proofs. If
the browser misbehaves, show `artifacts/shoprails-full-demo-proof-panel.png` or
run:

```powershell
npm run demo:capture
```

## Tech Mapping

- Arc Testnet: chain ID `5042002`, RPC `https://rpc.testnet.arc.network`
- USDC: native gas token plus optional ERC-20 interface at `0x3600000000000000000000000000000000000000`
- Circle Wallets: represented as programmable buyer and agent wallets
- Circle Gateway: represented as the unified wallet balance on `arcTestnet`
- Circle Nanopayments: represented as x402 `GatewayWalletBatched` catalog-data payments
- Escrow: `contracts/ShopRailsEscrow.sol`

## Tests

```powershell
npm test
```

The tests cover buy-now, review escrow, blacklist decline, high-risk review, budget decline, the full mission split, and chat-based escrow release.
