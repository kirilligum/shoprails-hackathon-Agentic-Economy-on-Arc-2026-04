function money(value) {
  return Number(value.toFixed(6));
}

function productImage(kind, label, colors) {
  const [bg, accent, ink] = colors;
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 220" role="img" aria-label="${label}">
    <defs>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="${bg}"/>
        <stop offset="100%" stop-color="${accent}"/>
      </linearGradient>
      <filter id="s" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#172033" flood-opacity=".18"/>
      </filter>
    </defs>
    <rect width="360" height="220" rx="0" fill="url(#g)"/>
    <path d="M0 166 C75 136 121 202 196 170 C255 145 302 135 360 160 L360 220 L0 220 Z" fill="#ffffff" opacity=".38"/>
    ${kind === "sushi" ? `
      <g filter="url(#s)">
        <ellipse cx="135" cy="120" rx="58" ry="30" fill="#f8fafc"/>
        <ellipse cx="135" cy="120" rx="36" ry="18" fill="#0f172a"/>
        <rect x="198" y="72" width="94" height="64" rx="18" fill="#f8fafc"/>
        <rect x="206" y="82" width="78" height="44" rx="14" fill="#fb7185"/>
        <path d="M78 154 L278 154" stroke="${ink}" stroke-width="9" stroke-linecap="round"/>
        <path d="M91 171 L291 171" stroke="${ink}" stroke-width="9" stroke-linecap="round"/>
      </g>` : ""}
    ${kind === "costume" ? `
      <g filter="url(#s)">
        <path d="M112 72 L172 48 L234 72 L218 170 L128 170 Z" fill="#111827"/>
        <path d="M128 88 L218 88 L208 136 L138 136 Z" fill="#fbbf24"/>
        <path d="M95 88 C145 42 215 42 266 88 C225 83 184 83 143 88 Z" fill="#111827"/>
        <circle cx="180" cy="116" r="10" fill="#f8fafc"/>
        <path d="M155 146 C174 158 192 158 211 146" stroke="#f8fafc" stroke-width="8" fill="none" stroke-linecap="round"/>
      </g>` : ""}
    ${kind === "assistant" ? `
      <g filter="url(#s)">
        <circle cx="181" cy="78" r="34" fill="#f8fafc"/>
        <path d="M115 180 C122 137 145 113 181 113 C216 113 240 137 247 180 Z" fill="#2563eb"/>
        <rect x="246" y="88" width="56" height="68" rx="12" fill="#f8fafc"/>
        <path d="M258 109 L292 109 M258 127 L284 127 M258 145 L292 145" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>
      </g>` : ""}
    ${kind === "props" ? `
      <g filter="url(#s)">
        <path d="M91 154 L256 55" stroke="${ink}" stroke-width="13" stroke-linecap="round"/>
        <path d="M228 76 L286 101 L231 132 Z" fill="#f8fafc"/>
        <circle cx="131" cy="128" r="42" fill="#fbbf24"/>
        <circle cx="131" cy="128" r="20" fill="#111827"/>
        <path d="M71 75 L138 53 L205 75 L185 101 L91 101 Z" fill="#111827"/>
      </g>` : ""}
    <text x="22" y="34" fill="${ink}" font-family="Arial, sans-serif" font-size="19" font-weight="700">${label}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const ARC_CONFIG = {
  networkName: "Arc Testnet",
  chainId: 5042002,
  rpcUrl: "https://rpc.testnet.arc.network",
  explorerUrl: "https://testnet.arcscan.app",
  faucetUrl: "https://faucet.circle.com/",
  nativeCurrency: "USDC",
  nativeDecimals: 18,
  usdcAddress: "0x3600000000000000000000000000000000000000",
  walletChainCode: "ARC-TESTNET",
  gatewaySupportedChainName: "arcTestnet",
  gatewayDomainId: 26,
  gatewayWalletAddress: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
  nanopaymentMinimum: 0.000001
};

export const verifiedFunding = {
  txHash: "0xdcb1e3d6f8cf96d7a10387588876e1ec00ead9a7e3dce18ebd1a160e13c2af54",
  from: "0x319dd63e0ac72e7ac74443029d074032c043460f",
  to: "0xE6420890312234643FC16a42147f7d8EeD9Be1F6",
  amount: 20,
  currentBalance: 19.65368997984,
  blockNumber: 39012267,
  status: "confirmed"
};

export const verifiedDemoTransactions = {
  "sushi-party-set": {
    kind: "buy_now",
    amountUsdc: "0.001840",
    txHash: "0xaa212bda4c8c0eaa307bb02b6a7b77d90dc66f10ac0d666fa6d8ace9106b9f24",
    blockNumber: 39020641,
    status: "confirmed"
  },
  "bamboo-utensils": {
    kind: "buy_now",
    amountUsdc: "0.000220",
    txHash: "0xbcae9999571fd6e704703425d7bf3a7129c2d928f7533581258a42ade92460bd",
    blockNumber: 39020651,
    status: "confirmed"
  },
  "pirate-props-bundle": {
    kind: "buy_now",
    amountUsdc: "0.000340",
    txHash: "0xfde09042d86469cf2881f39e442d2481eb8bd2a162269c9e91abf637d526e5cc",
    blockNumber: 39020653,
    status: "confirmed"
  },
  "crew-costume-pack": {
    kind: "review_release",
    amountUsdc: "0.000600",
    txHash: "0x5d3e06fe2c6b322d2cedffca55e912ecfa4d8d0b4231681c00074ccd0c16553c",
    releaseTxHash: "0x97c45dd3df1ca083914ad49c0dbdaeb2fae23bf16bccaf5bdf0b67bede694f2d",
    escrowId: "1",
    escrowContract: "0x50c86d09A84186b87C60600Fb43aec5b4687EADC",
    blockNumber: 39028456,
    releaseBlockNumber: 39028465,
    status: "confirmed"
  },
  "assistant-maya": {
    kind: "review_release",
    amountUsdc: "0.000950",
    txHash: "0xf8754e0a5b73f40ff697ea61702d2f5bcf0d99004ddc21df801d18b739705c1c",
    releaseTxHash: "0x57f624e52c6c0f045b28fa3aab445f0a968972d148128642bed76137a583fdb4",
    escrowId: "2",
    escrowContract: "0x50c86d09A84186b87C60600Fb43aec5b4687EADC",
    blockNumber: 39028475,
    releaseBlockNumber: 39028484,
    status: "confirmed"
  },
  "gold-compass-listing": {
    kind: "refund_smoke",
    amountUsdc: "0.000790",
    txHash: "0x6c8bc81515c7a5b1ae75243b54a5fadc8caee79bb5df01dbc1704d632b96b2b4",
    refundTxHash: "0x3a389f9c1500b0d493c5036db882c6e2f7d00e8f0f99731cf86e89d5d4be7397",
    escrowId: "3",
    escrowContract: "0x50c86d09A84186b87C60600Fb43aec5b4687EADC",
    blockNumber: 39028494,
    refundBlockNumber: 39028504,
    status: "confirmed"
  }
};

export const defaultPolicy = {
  totalBudget: 500,
  autoApproveByCategory: {
    sushi: 220,
    drinks: 35,
    props: 45,
    costumes: 50,
    assistant: 0
  },
  categoryCaps: {
    sushi: 240,
    drinks: 35,
    props: 60,
    costumes: 180,
    assistant: 120
  },
  merchantDailyCap: 250,
  reviewRiskScore: 65,
  declineRiskScore: 90,
  alwaysReviewCategories: ["assistant"],
  whitelistedDomains: [
    "sushi-harbor.shoprails.demo",
    "sevenseas-costumes.shoprails.demo",
    "taskdock.shoprails.demo"
  ],
  blacklistedDomains: ["blackbeard-outlet.invalid"],
  blacklistedBrands: ["Grey Market Costume Liquidators"],
  timeWindow: "24h"
};

export const merchants = {
  "sushi-harbor": {
    id: "sushi-harbor",
    name: "Sushi Harbor",
    domain: "sushi-harbor.shoprails.demo",
    wallet: "0xa11ce00000000000000000000000000000000001",
    trustTier: "trusted",
    rating: 4.8,
    reputationScore: 18
  },
  "sevenseas-costumes": {
    id: "sevenseas-costumes",
    name: "Seven Seas Costume Co.",
    domain: "sevenseas-costumes.shoprails.demo",
    wallet: "0xb0b0000000000000000000000000000000000002",
    trustTier: "standard",
    rating: 4.5,
    reputationScore: 39
  },
  "taskdock": {
    id: "taskdock",
    name: "TaskDock Assistants",
    domain: "taskdock.shoprails.demo",
    wallet: "0xc0ffee0000000000000000000000000000000003",
    trustTier: "standard",
    rating: 4.7,
    reputationScore: 44
  },
  "blackbeard-outlet": {
    id: "blackbeard-outlet",
    name: "Blackbeard Outlet",
    domain: "blackbeard-outlet.invalid",
    wallet: "0xbad0000000000000000000000000000000000004",
    trustTier: "blocked",
    rating: 2.1,
    reputationScore: 96
  },
  "unknown-bazaar": {
    id: "unknown-bazaar",
    name: "Unknown Bazaar",
    domain: "unknown-bazaar.example",
    wallet: "0xe11a000000000000000000000000000000000005",
    trustTier: "unverified",
    rating: 3.0,
    reputationScore: 72
  }
};

export const demoWallets = {
  buyer: {
    label: "Buyer wallet",
    circleId: "circle_dev_wallet:buyer_arc_testnet_001",
    address: "0xE6420890312234643FC16a42147f7d8EeD9Be1F6"
  },
  agent: {
    label: "OpenClaw agent wallet",
    circleId: "circle_dev_wallet:openclaw_agent_001",
    address: "0xA63c533A2B63D4d75985dffBA977E250a88f4E48"
  },
  escrow: {
    label: "ShopRails escrow contract",
    circleId: "arc_testnet_contract:shoprails_escrow",
    address: "0x50c86d09A84186b87C60600Fb43aec5b4687EADC"
  }
};

export const buyerServer = {
  id: "buyer-server",
  name: "Maya's Buyer Server",
  domain: "buyer.shoprails.demo",
  workerUrl: "https://shoprails-buyer-server.kirill-igum.workers.dev",
  endpoint: "/api/buyer/intent",
  role: "Holds buyer policy, purchase history, and signed payment authority.",
  wallet: demoWallets.buyer.address
};

export const sellerServers = [
  {
    id: "sushi-seller-server",
    merchantId: "sushi-harbor",
    name: "Sushi Harbor Seller Server",
    workerUrl: "https://shoprails-seller-server.kirill-igum.workers.dev",
    endpoint: "/api/seller/sushi/quote",
    paidEndpoints: ["catalog.search", "product.detail", "availability", "quote"]
  },
  {
    id: "costume-seller-server",
    merchantId: "sevenseas-costumes",
    name: "Seven Seas Seller Server",
    workerUrl: "https://shoprails-seller-server.kirill-igum.workers.dev",
    endpoint: "/api/seller/costumes/quote",
    paidEndpoints: ["catalog.search", "availability", "quote", "visualize"]
  },
  {
    id: "assistant-seller-server",
    merchantId: "taskdock",
    name: "TaskDock Seller Server",
    workerUrl: "https://shoprails-seller-server.kirill-igum.workers.dev",
    endpoint: "/api/seller/assistant/quote",
    paidEndpoints: ["services.search", "availability", "quote", "brief.validate"]
  }
];

export const scorerServer = {
  id: "trustrails-scorer",
  name: "TrustRails Scorer",
  domain: "trustrails.scorer.demo",
  workerUrl: "https://shoprails-scorer-server.kirill-igum.workers.dev",
  endpoint: "/api/scorer/evaluate",
  wallet: "0x40000000000000000000000000000000000000D4",
  priceUsdc: money(0.000006),
  role: "Independent reputation API that scores buyer history, seller trust, item risk, and policy fit."
};

export const buyerProfile = {
  id: "buyer-maya-chen",
  name: "Maya Chen",
  wallet: demoWallets.buyer.address,
  successfulOrders: 38,
  chargebacks: 0,
  averageOrderUsdc: 72,
  categoryHistory: {
    sushi: { orders: 5, averageUsdc: 160, refundRate: 0 },
    drinks: { orders: 9, averageUsdc: 28, refundRate: 0 },
    props: { orders: 12, averageUsdc: 26, refundRate: 0.01 },
    costumes: { orders: 3, averageUsdc: 68, refundRate: 0 },
    assistant: { orders: 4, averageUsdc: 82, refundRate: 0 }
  },
  merchantHistory: {
    "sushi-harbor.shoprails.demo": { successfulOrders: 3, lastOrderDaysAgo: 11 },
    "sevenseas-costumes.shoprails.demo": { successfulOrders: 2, lastOrderDaysAgo: 43 },
    "taskdock.shoprails.demo": { successfulOrders: 1, lastOrderDaysAgo: 27 }
  }
};

export const offers = [
  {
    id: "sushi-party-set",
    merchantId: "sushi-harbor",
    name: "10-person sushi party set",
    category: "sushi",
    brand: "Sushi Harbor",
    price: 184,
    unit: "set",
    quantityLabel: "serves 10",
    deliveryWindow: "Friday 6:30 PM - 6:50 PM",
    reason: "Balanced rolls, vegetarian pieces, and nigiri sized for ten guests before the 7 PM dinner.",
    riskScore: 21,
    image: "/artifacts/generated-images/sushi-party-set-gemini-3-1-flash-image-preview.png"
  },
  {
    id: "bamboo-utensils",
    merchantId: "sushi-harbor",
    name: "Bamboo chopsticks and soy kit",
    category: "drinks",
    brand: "Sushi Harbor",
    price: 22,
    unit: "kit",
    quantityLabel: "12 guest kit",
    deliveryWindow: "Friday with sushi order",
    reason: "Adds chopsticks, soy sauce, napkins, and serving trays so the assistant can set the dinner quickly.",
    riskScore: 16,
    image: "/artifacts/generated-images/bamboo-utensils-gemini-3-1-flash-image-preview.png"
  },
  {
    id: "chef-nigiri-roll-platter",
    merchantId: "sushi-harbor",
    name: "Chef nigiri and roll platter",
    category: "sushi",
    brand: "Sushi Harbor",
    price: 218,
    unit: "platter",
    quantityLabel: "72 pieces, serves 10-12",
    deliveryWindow: "Friday 6:10 PM - 6:25 PM",
    reason: "A higher-end mix of nigiri, classic rolls, and cucumber maki with a reliable delivery slot before the event deadline.",
    riskScore: 24,
    image: "/artifacts/generated-images/chef-nigiri-roll-platter-gemini-3-1-flash-image-preview.png"
  },
  {
    id: "vegetarian-maki-tray",
    merchantId: "sushi-harbor",
    name: "Vegetarian maki tray",
    category: "sushi",
    brand: "Sushi Harbor",
    price: 54,
    unit: "tray",
    quantityLabel: "36 avocado, cucumber, yam rolls",
    deliveryWindow: "Friday 6:15 PM - 6:30 PM",
    reason: "Adds a clear vegetarian option without requiring the agent to guess guests' dietary needs.",
    riskScore: 18,
    image: "/artifacts/generated-images/vegetarian-maki-tray-gemini-3-1-flash-image-preview.png"
  },
  {
    id: "sparkling-yuzu-soda-pack",
    merchantId: "sushi-harbor",
    name: "Sparkling yuzu soda pack",
    category: "drinks",
    brand: "Sushi Harbor",
    price: 28,
    unit: "pack",
    quantityLabel: "12 cans",
    deliveryWindow: "Friday with sushi order",
    reason: "Office-friendly drinks that pair with sushi and stay under the beverage auto-approve cap.",
    riskScore: 14,
    image: "/artifacts/generated-images/sparkling-yuzu-soda-pack-gemini-3-1-flash-image-preview.png"
  },
  {
    id: "miso-soup-service",
    merchantId: "sushi-harbor",
    name: "Miso soup thermos service",
    category: "sushi",
    brand: "Sushi Harbor",
    price: 42,
    unit: "service",
    quantityLabel: "10 compostable cups",
    deliveryWindow: "Friday 6:20 PM - 6:35 PM",
    reason: "Warm side service for ten guests; useful but delivery sits close enough to the deadline that an agent should inspect it.",
    riskScore: 31,
    image: "/artifacts/generated-images/miso-soup-service-gemini-3-1-flash-image-preview.png"
  },
  {
    id: "mochi-dessert-box",
    merchantId: "sushi-harbor",
    name: "Mochi dessert box",
    category: "drinks",
    brand: "Sushi Harbor",
    price: 32,
    unit: "box",
    quantityLabel: "15 assorted pieces",
    deliveryWindow: "Friday with sushi order",
    reason: "A small dessert add-on that rounds out the dinner while keeping the cart easy to explain.",
    riskScore: 17,
    image: "/artifacts/generated-images/mochi-dessert-box-gemini-3-1-flash-image-preview.png"
  },
  {
    id: "pirate-props-bundle",
    merchantId: "sevenseas-costumes",
    name: "Cheap pirate props bundle",
    category: "props",
    brand: "Seven Seas Basics",
    price: 34,
    unit: "bundle",
    quantityLabel: "eye patches, coins, flags",
    deliveryWindow: "Friday before 4 PM",
    reason: "Low-cost table props that carry the theme without consuming the costume budget.",
    riskScore: 33,
    image: "/artifacts/generated-images/pirate-props-bundle-gemini-3-1-flash-image-preview.png"
  },
  {
    id: "crew-costume-pack",
    merchantId: "sevenseas-costumes",
    name: "One-size pirate costume pack",
    category: "costumes",
    brand: "Seven Seas Basics",
    price: 60,
    unit: "pack",
    quantityLabel: "10 one-size accessories",
    deliveryWindow: "Friday before 5 PM",
    reason: "Ten simple one-size kits avoid sizing questions and match the pirate theme request while keeping the demo price at 60 USDC.",
    riskScore: 48,
    image: "/artifacts/generated-images/crew-costume-pack-gemini-3-1-flash-image-preview.png"
  },
  {
    id: "red-sash-pirate-kit",
    merchantId: "sevenseas-costumes",
    name: "Red sash pirate accessory kit",
    category: "costumes",
    brand: "Seven Seas Basics",
    price: 48,
    unit: "kit",
    quantityLabel: "adjustable sash, hat, vest accents",
    deliveryWindow: "Friday before 5 PM",
    reason: "A lower-cost adjustable pirate look with a red sash and simple accessories that should fit most guests.",
    riskScore: 42,
    image: "/artifacts/generated-images/red-sash-pirate-kit-gemini-3-1-flash-image-preview.png"
  },
  {
    id: "captain-coat-kit",
    merchantId: "sevenseas-costumes",
    name: "Captain coat pirate kit",
    category: "costumes",
    brand: "Seven Seas Premium",
    price: 72,
    unit: "kit",
    quantityLabel: "coat-style costume, hat, sash",
    deliveryWindow: "Friday before 5 PM",
    reason: "A more polished captain-style outfit for the buyer preview; higher price routes it through review.",
    riskScore: 52,
    image: "/artifacts/generated-images/captain-coat-kit-gemini-3-1-flash-image-preview.png"
  },
  {
    id: "striped-deckhand-bundle",
    merchantId: "sevenseas-costumes",
    name: "Striped deckhand tee bundle",
    category: "costumes",
    brand: "Seven Seas Basics",
    price: 38,
    unit: "bundle",
    quantityLabel: "10 striped tees and bandanas",
    deliveryWindow: "Friday before 4 PM",
    reason: "A lightweight office-safe costume option with fewer accessories and a lower policy risk.",
    riskScore: 36,
    image: "/artifacts/generated-images/striped-deckhand-bundle-gemini-3-1-flash-image-preview.png"
  },
  {
    id: "foam-cutlass-party-pack",
    merchantId: "sevenseas-costumes",
    name: "Foam cutlass party pack",
    category: "props",
    brand: "Seven Seas Safety Props",
    price: 18,
    unit: "pack",
    quantityLabel: "10 soft foam props",
    deliveryWindow: "Friday before 4 PM",
    reason: "Theme props designed to be presentation-safe and office-safe, with a low price suitable for buy-now.",
    riskScore: 29,
    image: "/artifacts/generated-images/foam-cutlass-party-pack-gemini-3-1-flash-image-preview.png"
  },
  {
    id: "treasure-map-table-kit",
    merchantId: "sevenseas-costumes",
    name: "Treasure map table kit",
    category: "props",
    brand: "Seven Seas Party Goods",
    price: 26,
    unit: "kit",
    quantityLabel: "runner, place cards, coins",
    deliveryWindow: "Friday before 4 PM",
    reason: "A tidy table styling kit that makes the theme visible without requiring messy setup.",
    riskScore: 27,
    image: "/artifacts/generated-images/treasure-map-table-kit-gemini-3-1-flash-image-preview.png"
  },
  {
    id: "assistant-maya",
    merchantId: "taskdock",
    name: "Setup assistant Maya R.",
    category: "assistant",
    brand: "TaskDock",
    price: 95,
    unit: "2.5 hours",
    quantityLabel: "delivery receive and setup",
    deliveryWindow: "Friday 5:30 PM - 8:00 PM",
    reason: "Receives deliveries, unpacks sushi and props, sets up pirate theme, and texts completion photos.",
    riskScore: 57,
    image: "/artifacts/generated-images/assistant-maya-gemini-3-1-flash-image-preview.png",
    serviceInstructions: "Meet at MindsDB office lobby, receive deliveries, set table for 10, place props, discard packaging, and leave sushi refrigerated until 6:55 PM."
  },
  {
    id: "assistant-kai",
    merchantId: "taskdock",
    name: "Setup assistant Kai T.",
    category: "assistant",
    brand: "TaskDock",
    price: 82,
    unit: "2 hours",
    quantityLabel: "delivery receiving and cleanup",
    deliveryWindow: "Friday 5:45 PM - 7:45 PM",
    reason: "Lower-cost assistant who can receive deliveries, stage the dinner table, and complete basic cleanup after setup.",
    riskScore: 49,
    image: "/artifacts/generated-images/assistant-kai-gemini-3-1-flash-image-preview.png",
    serviceInstructions: "Arrive by 5:45 PM, meet deliveries in lobby, set sushi and props on the main table, and send a completion photo before 6:50 PM."
  },
  {
    id: "assistant-lina",
    merchantId: "taskdock",
    name: "Event runner Lina S.",
    category: "assistant",
    brand: "TaskDock Pro",
    price: 118,
    unit: "3 hours",
    quantityLabel: "setup, delivery triage, teardown",
    deliveryWindow: "Friday 5:15 PM - 8:15 PM",
    reason: "More coverage for setup and teardown; higher cost means the buyer should review before approving.",
    riskScore: 53,
    image: "/artifacts/generated-images/assistant-lina-gemini-3-1-flash-image-preview.png",
    serviceInstructions: "Coordinate all deliveries, set costumes near entry, arrange dinner table, monitor food temperature, and pack trash after guests arrive."
  },
  {
    id: "assistant-omar",
    merchantId: "taskdock",
    name: "Office concierge Omar D.",
    category: "assistant",
    brand: "TaskDock",
    price: 89,
    unit: "2 hours",
    quantityLabel: "front desk handoff and setup",
    deliveryWindow: "Friday 5:30 PM - 7:30 PM",
    reason: "Strong fit for office logistics because he can coordinate lobby access and vendor handoffs.",
    riskScore: 46,
    image: "/artifacts/generated-images/assistant-omar-gemini-3-1-flash-image-preview.png",
    serviceInstructions: "Handle lobby handoff, bring deliveries upstairs, unpack food, and message buyer if any vendor is delayed past 6:30 PM."
  },
  {
    id: "assistant-priya",
    merchantId: "taskdock",
    name: "Tablescape helper Priya N.",
    category: "assistant",
    brand: "TaskDock Creative",
    price: 76,
    unit: "90 minutes",
    quantityLabel: "props and table styling",
    deliveryWindow: "Friday 5:45 PM - 7:15 PM",
    reason: "Best for making the pirate theme look intentional; shorter shift keeps cost down.",
    riskScore: 43,
    image: "/artifacts/generated-images/assistant-priya-gemini-3-1-flash-image-preview.png",
    serviceInstructions: "Style the table runner, place props, lay out costumes, and leave labels visible for sushi and vegetarian rolls."
  },
  {
    id: "assistant-duo",
    merchantId: "taskdock",
    name: "Two-person rapid setup duo",
    category: "assistant",
    brand: "TaskDock Teams",
    price: 145,
    unit: "2 people, 90 minutes",
    quantityLabel: "fast setup team",
    deliveryWindow: "Friday 5:30 PM - 7:00 PM",
    reason: "Fastest option for a complex event, but the higher price and two-person service should require review.",
    riskScore: 58,
    image: "/artifacts/generated-images/assistant-duo-gemini-3-1-flash-image-preview.png",
    serviceInstructions: "Split duties: one person receives deliveries while the other styles table, stages costumes, and confirms readiness by 6:50 PM."
  },
  {
    id: "blacklisted-props",
    merchantId: "blackbeard-outlet",
    name: "Ultra-cheap pirate chest add-on",
    category: "props",
    brand: "Grey Market Costume Liquidators",
    price: 22,
    unit: "bundle",
    quantityLabel: "assorted mystery props",
    deliveryWindow: "unknown",
    reason: "Looks cheap, but seller is blacklisted for failed fulfillment and chargeback patterns.",
    riskScore: 97,
    image: "/artifacts/generated-images/blacklisted-props-gemini-3-1-flash-image-preview.png"
  },
  {
    id: "gold-compass-listing",
    merchantId: "unknown-bazaar",
    name: "Premium pirate compass listing",
    category: "props",
    brand: "Unknown Bazaar",
    price: 79,
    unit: "item",
    quantityLabel: "single prop",
    deliveryWindow: "same day unverified",
    reason: "Decorative item, but the price and seller history are outliers for a cheap-props task.",
    riskScore: 74,
    image: "/artifacts/generated-images/gold-compass-listing-gemini-3-1-flash-image-preview.png"
  }
];

export const atomicQueries = [
  {
    id: "q-sushi",
    category: "sushi",
    query: "sushi platter delivery for 10 people, Friday before 7 PM, MindsDB office",
    x402Price: money(0.00042)
  },
  {
    id: "q-serving",
    category: "drinks",
    query: "serving utensils chopsticks soy sauce kit for sushi dinner",
    x402Price: money(0.00018)
  },
  {
    id: "q-costumes",
    category: "costumes",
    query: "one-size pirate costumes or accessories for 10 adults",
    x402Price: money(0.00036)
  },
  {
    id: "q-props",
    category: "props",
    query: "cheap pirate theme props for office dinner table",
    x402Price: money(0.00024)
  },
  {
    id: "q-assistant",
    category: "assistant",
    query: "human assistant receive delivery unpack setup office dinner",
    x402Price: money(0.00047)
  }
];

export const demoIntents = [
  { offerId: "sushi-party-set", quantity: 1 },
  { offerId: "bamboo-utensils", quantity: 1 },
  { offerId: "pirate-props-bundle", quantity: 1 },
  { offerId: "crew-costume-pack", quantity: 1 },
  { offerId: "assistant-maya", quantity: 1 },
  { offerId: "blacklisted-props", quantity: 1 }
];

export const storefronts = [
  {
    id: "sushi",
    label: "Sushi Delivery",
    merchantId: "sushi-harbor",
    fields: [
      {
        id: "delivery-time",
        label: "Delivery time",
        type: "text",
        value: "Friday 6:40 PM",
        ai: `Purpose: choose the requested arrival time for the food delivery, not the guest arrival time.

Context for this buyer: the dinner starts Friday, May 1, 2026 at 7:00 PM at the MindsDB office in San Francisco. The buyer needs food in the room before guests arrive, but not so early that sushi sits out for too long.

Agent rule: target delivery between 6:00 PM and 6:30 PM local Pacific time. If the store only offers a later slot, route the order to buyer review. If the slot is after 6:45 PM, reject it unless the buyer explicitly says late delivery is acceptable.

Good few-shot examples:
- Buyer says "dinner at 7 PM" -> set delivery to "Friday 6:15 PM" or "Friday 6:30 PM".
- Buyer says "office party, assistant arrives at 6" -> choose a slot after assistant arrival, e.g. "Friday 6:15 PM".
- Store offers 5:15, 6:15, 6:50 -> choose 6:15; 6:50 is too close to guest arrival.

Bad examples:
- Do not set the field to "7 PM"; that is the event start, not delivery.
- Do not choose "ASAP" unless the buyer asked for immediate delivery.
- Do not invent a delivery address; use the known MindsDB office context from the mission.`
      },
      {
        id: "diet-notes",
        label: "Diet notes",
        type: "text",
        value: "Include vegetarian rolls",
        ai: `Purpose: communicate dietary preferences that affect the order composition. This field should help the seller build a safer platter for a mixed group.

Context for this buyer: the user did not provide allergies or religious restrictions. The agent should include a reasonable vegetarian option for 10 guests, but must not fabricate allergies, medical restrictions, or guest identities.

Agent rule: include known constraints and low-risk preferences. Use neutral language such as "include vegetarian rolls" and "label vegetarian pieces separately." If allergies are unknown, say they are unknown instead of guessing.

Good few-shot examples:
- Buyer says "10 people, sushi dinner" -> "Include vegetarian rolls; label vegetarian pieces separately."
- Buyer says "one vegetarian friend" -> "Include vegetarian rolls for at least 1 guest; keep vegetarian pieces grouped."
- Buyer says "no dietary info" -> "Include vegetarian rolls; allergies not specified."

Bad examples:
- Do not write "gluten-free" or "nut allergy" unless the buyer said so.
- Do not ask the sushi seller to optimize for pirate theme in food safety fields.
- Do not remove fish entirely unless the buyer asked for vegetarian sushi.`
      }
    ]
  },
  {
    id: "costumes",
    label: "Costume Store",
    merchantId: "sevenseas-costumes",
    fields: [
      {
        id: "sizes",
        label: "Sizing plan",
        type: "text",
        value: "One-size accessories",
        ai: `Purpose: describe how the costume seller should handle fit without requiring individual guest measurements.

Context for this buyer: the mission asks for pirate one-size costumes for 10 people. The agent does not know guests' sizes. Prefer adjustable accessories, hats, sashes, loose vests, and props over fitted garments.

Agent rule: if exact sizes are unknown, choose items described as one-size, adjustable, elastic, accessory-based, or bulk party kits. Avoid fitted coats, boots, pants, corsets, or anything requiring body measurements unless routed to review.

Good few-shot examples:
- Buyer says "10 people, one-size costumes" -> "10 adjustable one-size kits: hats, sashes, vests, eye patches."
- Store has "one-size accessory kit" and "tailored captain coat" -> prefer one-size kit for group purchase; use coat only for virtual try-on or buyer review.
- Guest count is 10 -> quantity should be 10 kits or one bundle explicitly serving 10 people.

Bad examples:
- Do not choose mixed S/M/L sizes unless the buyer provides a size distribution.
- Do not assume gendered sizing.
- Do not buy a single costume when the prompt asks for the whole group.`
      },
      {
        id: "theme",
        label: "Theme",
        type: "text",
        value: "Friendly pirate dinner",
        ai: `Purpose: translate the buyer's event theme into seller-safe product filters and visual styling.

Context for this buyer: this is an office sushi dinner with friends, not a theatrical combat scene. The theme should read as playful pirate decor and simple costumes.

Agent rule: prefer friendly, office-safe pirate styling: hats, sashes, striped shirts, table flags, maps, coins, and photo-friendly accessories. Avoid realistic weapons, sharp props, scary masks, alcohol-themed accessories, or anything that creates workplace safety concerns.

Good few-shot examples:
- "Pirate theme for office dinner" -> "friendly pirate dinner; hats, sashes, table props, no realistic weapons."
- "Cheap props" -> "eye patches, paper flags, table runner, plastic coins."
- "Virtual try-on" -> generate a clean retail preview of the outfit, not a fantasy battle scene.

Bad examples:
- Do not select realistic swords, firearms, or sharp hooks.
- Do not make the theme dark, threatening, or costume-party chaotic.
- Do not override buyer policy just because an item matches the theme.`
      }
    ]
  },
  {
    id: "assistant",
    label: "Assistant Marketplace",
    merchantId: "taskdock",
    fields: [
      {
        id: "arrival",
        label: "Arrival window",
        type: "text",
        value: "Friday 5:30 PM",
        ai: `Purpose: define when the human assistant should arrive onsite. This controls whether the assistant can receive deliveries, stage costumes, and finish setup before guests arrive.

Context for this buyer: dinner starts at 7:00 PM. Sushi should arrive by about 6:15-6:30 PM. The assistant needs time to find the office, coordinate lobby access, receive deliveries, unpack items, and send completion photos.

Agent rule: choose an assistant arrival between 5:30 PM and 6:00 PM. If the assistant can only arrive after 6:30 PM, route to review or reject because they cannot reliably receive food and set up before the event.

Good few-shot examples:
- Event starts 7 PM, delivery target 6:15 PM -> assistant arrival "Friday 5:45 PM".
- Seller offers 5:30-7:30 and 6:45-8:45 -> choose 5:30-7:30.
- If the assistant handles lobby delivery -> arrival must be before the first delivery window.

Bad examples:
- Do not set arrival to 7 PM; that is too late.
- Do not book a same-time arrival and delivery if the office has lobby access friction.
- Do not leave timing vague as "evening" when the seller needs a precise shift.`
      },
      {
        id: "instructions",
        label: "Task instructions",
        type: "textarea",
        value: "Receive deliveries, set table for 10, place pirate props, text completion photos.",
        ai: `Purpose: convert the buyer's vague "set it up" request into bounded work instructions a human can accept, price, and complete.

Context for this buyer: the assistant is not a party planner with unlimited discretion. They should receive deliveries, unpack items, stage the dinner area, and communicate status. This is a human-services purchase, so ShopRails always routes it to buyer review before payment.

Agent rule: instructions must include timing, location context, concrete tasks, escalation criteria, and acceptance criteria. Keep the scope to 2-3 hours and avoid asking for anything unsafe, personal, or open-ended.

Good few-shot examples:
- "Arrive at MindsDB office lobby by 5:45 PM. Receive sushi and costume deliveries. Bring items to the event room. Set table for 10. Place pirate props and costumes near entrance. Send completion photos by 6:50 PM."
- "If sushi has not arrived by 6:30 PM, text the buyer. Keep food labels visible. Do not discard receipts."
- "After setup, consolidate packaging near trash/recycling but do not move personal office items."

Bad examples:
- Do not ask the assistant to buy extra items with their own money.
- Do not ask them to access private office areas, computers, documents, or guest personal data.
- Do not leave the task as "make it nice"; define what complete means.`
      }
    ]
  }
];
