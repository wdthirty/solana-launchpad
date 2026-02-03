import { NextRequest, NextResponse } from 'next/server';
import { createHeliusRpcClient } from '@/lib/solana';
import { supabase } from '@/lib/supabase';

// GET /api/users/wallet/[walletAddress]/balance - Get SOL and token balances for a wallet
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ walletAddress: string }> }
) {
  try {
    const { walletAddress } = await params;
    
    const rpcClient = createHeliusRpcClient();
    
    // Get SOL balance
    const balanceInSol = await rpcClient.getBalanceInSol({
      publicKey: walletAddress,
      commitment: 'confirmed',
    });

    // Get SPL token balances
    const tokenAccounts = await rpcClient.getTokenAccountsByOwner({
      publicKey: walletAddress,
      commitment: 'confirmed',
    });

    // Fetch token metadata from database for tokens we know about
    const tokenMints = tokenAccounts.map(account => account.mint);
    let tokenMetadataMap: Record<string, { name: string | null; symbol: string | null; market_cap: number | null }> = {};

    if (tokenMints.length > 0) {
      const { data: tokens } = await supabase
        .from('tokens')
        .select('address, name, symbol, market_cap')
        .in('address', tokenMints);

      if (tokens) {
        tokens.forEach(token => {
          tokenMetadataMap[token.address] = {
            name: token.name,
            symbol: token.symbol,
            market_cap: token.market_cap,
          };
        });
      }
    }

    // Combine token accounts with metadata
    const tokensWithMetadata = tokenAccounts.map(account => {
      const metadata = tokenMetadataMap[account.mint];
      return {
        mint: account.mint,
        amount: account.amount,
        amountString: account.amountString,
        decimals: account.decimals,
        name: metadata?.name || null,
        symbol: metadata?.symbol || null,
        marketCap: metadata?.market_cap || null,
      };
    });

    return NextResponse.json({
      sol: balanceInSol,
      tokens: tokensWithMetadata,
    });
  } catch (error) {
    console.error('Error getting balance:', error);
    return NextResponse.json(
      { error: 'Failed to get balance' },
      { status: 500 }
    );
  }
}

