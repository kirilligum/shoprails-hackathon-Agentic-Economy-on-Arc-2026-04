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
        ai: "Choose a delivery time that lands 10 to 30 minutes before the meal time. Use local office time."
      },
      {
        id: "diet-notes",
        label: "Diet notes",
        type: "text",
        value: "Include vegetarian rolls",
        ai: "Mention known dietary constraints and avoid inventing allergies not supplied by the buyer."
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
        ai: "When exact sizes are unavailable, prefer adjustable accessories over fitted garments."
      },
      {
        id: "theme",
        label: "Theme",
        type: "text",
        value: "Friendly pirate dinner",
        ai: "Use the buyer's party theme. Avoid weapons or props that create office safety problems."
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
        ai: "Schedule enough time before guest arrival to receive deliveries and unpack food."
      },
      {
        id: "instructions",
        label: "Task instructions",
        type: "textarea",
        value: "Receive deliveries, set table for 10, place pirate props, text completion photos.",
        ai: "Give clear, bounded instructions. Include location, timing, acceptance criteria, and what not to do."
      }
    ]
  }
];
