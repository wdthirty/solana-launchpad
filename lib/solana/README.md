# Solana Integration

This directory contains all Solana network configuration and utilities for the application.

## Configuration

The application is configured to use **Solana Devnet** for all development work. This ensures that:
- No real funds are at risk
- You can freely test transactions
- You can request SOL airdrops for testing

### Environment Variables

Add these to your `.env` file:

```bash
# Solana Network Configuration
NEXT_PUBLIC_SOLANA_NETWORK=devnet  # Options: devnet, testnet, mainnet-beta

# Optional: Custom RPC endpoint (leave empty to use Solana's default)
# NEXT_PUBLIC_SOLANA_RPC_ENDPOINT=https://your-custom-rpc.com
```

## Usage

### Basic Configuration

```typescript
import { getSolanaNetwork, getSolanaEndpoint, createSolanaConnection } from '@/lib/solana';

// Get current network
const network = getSolanaNetwork(); // 'devnet'

// Get RPC endpoint
const endpoint = getSolanaEndpoint(); // 'https://api.devnet.solana.com'

// Create a connection
const connection = createSolanaConnection();
```

### Working with Wallet

The wallet provider is already configured in `components/SupabaseWalletProvider.tsx`:

```typescript
import { useWallet } from '@solana/wallet-adapter-react';

function MyComponent() {
  const { publicKey, sendTransaction } = useWallet();

  // Your code here
}
```

### Utility Functions

```typescript
import {
  getSolBalance,
  requestAirdrop,
  formatPublicKey,
  getExplorerUrl,
  isDevnet,
} from '@/lib/solana';

// Get wallet balance
const balance = await getSolBalance(publicKey);
console.log(`Balance: ${balance} SOL`);

// Request airdrop (devnet only!)
if (isDevnet()) {
  const signature = await requestAirdrop(publicKey, 2); // 2 SOL
  console.log('Airdrop signature:', signature);
}

// Format public key
const shortKey = formatPublicKey(publicKey); // "AbC...XyZ"

// Get explorer URL
const explorerUrl = getExplorerUrl(signature, 'tx');
console.log('View on explorer:', explorerUrl);
```

### Safety Checks

```typescript
import { assertDevnet, isMainnet } from '@/lib/solana';

// Throw error if not on devnet
assertDevnet(); // Only for dev-only features

// Check network
if (isMainnet()) {
  console.warn('Running on mainnet - be careful!');
}
```

## Available Utilities

### Configuration (`config.ts`)
- `getSolanaNetwork()` - Get current network
- `getSolanaEndpoint()` - Get RPC endpoint
- `createSolanaConnection()` - Create new connection
- `isDevnet()` - Check if on devnet
- `isMainnet()` - Check if on mainnet
- `assertDevnet()` - Throw if not on devnet
- `getExplorerUrl()` - Get Solana explorer URL

### Utils (`utils.ts`)
- `getSolBalance()` - Get SOL balance
- `requestAirdrop()` - Request SOL airdrop (devnet only)
- `lamportsToSol()` - Convert lamports to SOL
- `solToLamports()` - Convert SOL to lamports
- `isValidPublicKey()` - Validate public key
- `getAccountInfo()` - Get account info
- `getRecentBlockhash()` - Get recent blockhash
- `formatPublicKey()` - Shorten public key display
- `getTransaction()` - Get transaction details
- `confirmTransaction()` - Wait for confirmation

## Testing on Devnet

### 1. Get Devnet SOL

```typescript
import { requestAirdrop } from '@/lib/solana';
import { useWallet } from '@solana/wallet-adapter-react';

function AirdropButton() {
  const { publicKey } = useWallet();

  const handleAirdrop = async () => {
    if (!publicKey) return;

    try {
      await requestAirdrop(publicKey, 2); // Request 2 SOL
      alert('Airdrop successful!');
    } catch (error) {
      console.error('Airdrop failed:', error);
    }
  };

  return <button onClick={handleAirdrop}>Request Airdrop</button>;
}
```

### 2. Send a Transaction

```typescript
import { useWallet } from '@solana/wallet-adapter-react';
import { Transaction, SystemProgram, PublicKey } from '@solana/web3.js';
import { createSolanaConnection, getRecentBlockhash } from '@/lib/solana';

async function sendSol() {
  const { publicKey, sendTransaction } = useWallet();
  const connection = createSolanaConnection();

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: publicKey,
      toPubkey: new PublicKey('DESTINATION_ADDRESS'),
      lamports: 1000000, // 0.001 SOL
    })
  );

  const signature = await sendTransaction(transaction, connection);
  await connection.confirmTransaction(signature);

  console.log('Transaction confirmed:', signature);
}
```

## Important Notes

1. **Always use devnet for development** - The app is configured to default to devnet
2. **Never commit mainnet credentials** - Keep production configs in production environments only
3. **Test thoroughly on devnet** - Before considering mainnet deployment
4. **Use custom RPC for production** - Solana's public RPC has rate limits

## Switching Networks (NOT RECOMMENDED DURING DEVELOPMENT)

To switch to a different network, update your `.env` file:

```bash
# ⚠️ WARNING: Only change this if you know what you're doing!
NEXT_PUBLIC_SOLANA_NETWORK=mainnet-beta  # Use with extreme caution!
```

## Resources

- [Solana Devnet Faucet](https://faucet.solana.com/)
- [Solana Explorer](https://explorer.solana.com/?cluster=devnet)
- [Solana Web3.js Documentation](https://solana-labs.github.io/solana-web3.js/)
- [Wallet Adapter Documentation](https://github.com/solana-labs/wallet-adapter)
