# ShopRails Circle + Arc Integration Notes

## Hackathon Rail

ShopRails targets Arc Testnet and Circle infrastructure:

- Arc Testnet RPC: `https://rpc.testnet.arc.network`
- Chain ID: `5042002`
- Native currency: `USDC`
- Arc USDC optional ERC-20 interface: `0x3600000000000000000000000000000000000000`
- Circle Wallets chain code: `ARC-TESTNET`
- Circle Gateway supported chain name: `arcTestnet`
- Gateway domain ID: `26`
- Gateway Wallet contract from Circle examples: `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`

## Demo Mapping

The local app simulates the full transaction lifecycle while keeping the
integration points explicit:

1. Buyer deposits `500 USDC` into a ShopRails wallet backed by Circle Wallets.
2. Agent search requests pay premium catalog endpoints through x402-style
   Circle Nanopayments.
3. `BUY_NOW` decisions settle as Circle Wallet transfers on Arc USDC.
4. `REVIEW_ESCROW` decisions create escrow entries that correspond to
   `ShopRailsEscrow.createEscrow`.
5. Buyer chat command `confirm all reviewed items` releases held funds.
6. `DECLINE_*` decisions are blocked before Circle signing.

## Production Upgrade Path

- Replace the local state store with a database table for wallets, policies,
  intents, decisions, escrows, and audit logs.
- Replace simulated Circle calls with Circle Wallets API calls for creating
  developer-controlled or user-controlled wallets on `ARC-TESTNET`.
- Use Circle Gateway deposits for unified USDC balances and the
  `@circle-fin/x402-batching` SDK for gas-free Nanopayments.
- Deploy `contracts/ShopRailsEscrow.sol` to Arc Testnet and store real
  `escrowId`, `txHash`, and `releaseTxHash` values.
- Add webhooks for Circle transaction status and escrow settlement events.

## Source References

- Arc network details: https://docs.arc.network/arc/references/connect-to-arc
- Arc contract addresses: https://docs.arc.network/arc/references/contract-addresses
- Circle Wallets: https://developers.circle.com/wallets
- Developer-controlled wallets: https://developers.circle.com/wallets/dev-controlled
- Gateway supported blockchains: https://developers.circle.com/gateway/references/supported-blockchains
- Nanopayments x402: https://developers.circle.com/gateway/nanopayments/concepts/x402
