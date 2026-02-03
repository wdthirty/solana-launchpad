# Solana Launchpad

Full-stack token launchpad on Solana. Curated token launches with bonding curve mechanics, real-time trading, live charts, community features, and creator rewards — all in one Next.js application backed by Supabase, Redis, and on-chain programs.

Users apply for whitelist access, launch tokens through Meteora's Dynamic Bonding Curve, and trade them with real-time price updates pushed via Ably WebSockets. The platform handles the full lifecycle: token creation, IPFS metadata upload, bonding curve pool deployment, swap execution, migration to DAMM v2 AMM, and creator reward claiming.

```
Browser
│
├── Wallet Adapter (Phantom, Solflare, etc.)
│   └── Solana transaction signing
│
├── Real-time data (Ably WebSocket)
│   ├── Live price ticks
│   ├── New token alerts
│   ├── Balance changes
│   └── Chat messages
│
└── Next.js App Router
    │
    ├── Server Components ── SSR token pages, SEO, metadata
    ├── API Routes ── token prep, swap building, search, rewards
    │   ├── Supabase (PostgreSQL) ── tokens, users, trades, comments
    │   ├── Upstash Redis ── rate limiting, caching, mint queue
    │   └── Pinata ── IPFS metadata + image uploads
    │
    └── On-chain (Solana)
        ├── Meteora DBC SDK ── bonding curve pool creation
        ├── Jupiter ── swap routing + price data
        └── SPL Token ── token minting, transfers, burns
```

## Features

| Feature | Description |
|---------|-------------|
| **Token Creation** | Multi-step wizard: metadata upload to IPFS via Pinata, mint keypair generation, Meteora DBC pool deployment. Supports custom bonding curves, vesting schedules, and creator lockups. |
| **Trading Terminal** | Real-time buy/sell panel with bonding curve price calculation, slippage controls, SOL/USD toggle. TradingView Advanced Charts integration for candlestick data. |
| **Live Price Feed** | Ably WebSocket channels push price updates, volume changes, and ATH events to all connected clients. No polling. |
| **Token Pages** | Dynamic SSR pages with chart, stats, buy/sell panel, top holders, bonding curve progress, community discussions, and comment threads. |
| **User Profiles** | Wallet-based auth with JWT sessions. Editable profiles with avatars, bios, social links. Trading history and portfolio tracking. |
| **Communities** | Per-token community pages with threaded discussions, announcements, and token-gated content. |
| **Rewards System** | Creator reward claiming from Meteora LP fees. Custom reward splits for special tokens. USDC reward distribution. |
| **Search** | Full-text search across tokens and users with debounced autocomplete dropdown. |
| **Whitelist** | Application-based whitelist system for token creators. Admin approval flow. |
| **Explore Feed** | Token discovery with sorting by market cap, volume, creation date. Featured token algorithm based on volume, holder count, and recency. |

## Project Structure

```
app/
├── token/[address]/       # Dynamic token trading page (SSR)
├── tokens/                # Token explorer / feed
├── create/                # Token creation wizard
├── create-token/          # Token deployment flow
├── profile/[username]/    # User profile pages
├── communities/           # Community pages + announcements
├── rewards/               # Creator reward claiming
├── apply/                 # Whitelist application
├── how-it-works/          # Platform guide
├── api/
│   ├── token/             # Token preparation, metadata, stats
│   ├── tokens/            # Token listing, search, feed
│   ├── mint-queue/        # Mint keypair queue management
│   ├── rewards/           # Reward calculation + claiming
│   ├── comments/          # Comment CRUD
│   ├── threads/           # Discussion threads
│   ├── search/            # Full-text search
│   ├── users/             # Profile management
│   ├── whitelist/         # Whitelist applications
│   ├── upload/            # Image upload to IPFS
│   ├── ably/              # WebSocket auth tokens
│   ├── sol-price/         # SOL/USD price feed
│   └── cron/              # Scheduled jobs

components/
├── AdvancedTradingView/   # TradingView charting integration
├── Terminal/              # Swap terminal component
├── Token/                 # Token page content + metadata
├── TokenChart/            # Price chart components
├── TokenHeader/           # Token page header + stats
├── TokenTable/            # Token feed table
├── panels/                # Trading page panels (buy/sell, chart, stats, holders, chat, etc.)
├── layout/                # TopNavBar, Footer, MobileBottomNav, LayoutWrapper
├── auth/                  # Wallet connection + auth modals
├── communities/           # Community + announcement components
├── search/                # Search overlay + results
└── ui/                    # shadcn/ui primitives

contexts/
├── AuthContext             # Wallet-based JWT authentication
├── AblyContext             # Real-time WebSocket connection
├── CurrentTokenContext     # Active token page state
├── SolPriceContext         # Live SOL/USD price
├── DataStreamProvider      # Real-time data subscriptions
├── TokenChartProvider      # Chart data management
└── UserProfileContext      # Current user profile

lib/
├── solana/                # Helius RPC client, Jupiter data client, WebSocket
├── swap/                  # SwapClient — builds swap transactions against Meteora DBC
├── services/              # Token creation, metadata upload, mint keypair, rewards
├── algorithms/            # Featured token scoring
├── config/                # App config, reward config
├── auth/                  # JWT session management
├── redis/                 # Upstash Redis client + caching
├── validations/           # Zod schemas for forms + API
└── format/                # Number, date, address formatting utilities
```

## Stack

**Frontend**: Next.js 15 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4, Framer Motion
**UI**: shadcn/ui, Radix UI, TradingView Charting Library, Three.js (react-three-fiber)
**Data**: Supabase (PostgreSQL + Auth + SSR), Upstash Redis, TanStack Query, Jotai, Zustand
**Real-time**: Ably (WebSocket pub/sub), Helius WebSocket
**Solana**: @solana/web3.js, @coral-xyz/anchor, Meteora DBC SDK, Jupiter, SPL Token
**Storage**: Pinata (IPFS) for token metadata + images
**Auth**: Wallet signature verification → JWT sessions (jose)
**Infra**: Vercel, Supabase, Upstash, Helius, Ably

## Getting Started

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Fill in: Supabase URL/keys, Helius API key, Ably key,
# Upstash Redis credentials, Pinata keys, RPC endpoints

# Run development server
pnpm dev
```

### Required Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_HELIUS_API_KEY=
NEXT_PUBLIC_ABLY_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
PINATA_JWT=
NEXT_PUBLIC_RPC_ENDPOINT=
PLATFORM_SIGNER_PRIVATE_KEY=
```

## Related

- **[solana-launchpad-pipeline](https://github.com/yourusername/solana-launchpad-pipeline)** — Real-time event processing pipeline. gRPC ingestion from Helius Laserstream → Kinesis → microservices that feed price updates, token events, and balance changes into this frontend via Ably.
