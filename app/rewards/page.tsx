'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Gift, TrendingUp, Coins } from 'lucide-react';
import { useWalletUser } from '@/hooks/use-wallet-user';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { VersionedTransaction } from '@solana/web3.js';
import { getConnection } from '@/lib/solana/config';
import { RewardClaimBuilder } from '@/lib/services/reward-claim-builder.service';
import type { ClaimTransactionData } from '@/lib/services/reward-claim-builder.service';
import { toast } from 'sonner';

// Type for Phantom's signAndSendAllTransactions
interface PhantomProvider {
  signAndSendAllTransactions: (
    transactions: VersionedTransaction[],
    options?: { skipPreflight?: boolean; preflightCommitment?: string }
  ) => Promise<{ signatures: string[]; publicKey: { toBase58: () => string } }>;
  isPhantom?: boolean;
}

// Get Phantom provider if available
function getPhantomProvider(): PhantomProvider | null {
  if (typeof window === 'undefined') return null;
  const provider = (window as any).phantom?.solana;
  if (provider?.isPhantom) {
    return provider as PhantomProvider;
  }
  return null;
}

interface TokenRewards {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenLogo: string | null;
  dbcFeesSol: number;
  dammFeesSol: number;
  migrationFeeClaimable: boolean;
  migrationFeeSol: number;
  totalClaimableSol: number;
}

interface RewardData {
  totalClaimable: number;
  totalClaimed: number;
  dexRefunds: number;
  tokens: TokenRewards[];
}

function RewardsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse space-y-3">
                <div className="h-4 w-24 bg-muted rounded" />
                <div className="h-8 w-32 bg-muted rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-5 w-48 bg-muted rounded" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted" />
                  <div className="space-y-2">
                    <div className="h-4 w-24 bg-muted rounded" />
                    <div className="h-3 w-16 bg-muted rounded" />
                  </div>
                </div>
                <div className="h-8 w-20 bg-muted rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RewardsPageContent() {
  const router = useRouter();
  const { walletAddress, isAuthenticated } = useWalletUser();
  const { publicKey, signTransaction } = useWallet();
  const [rewards, setRewards] = useState<RewardData>({
    totalClaimable: 0,
    totalClaimed: 0,
    dexRefunds: 0,
    tokens: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isClaimingDexRefunds, setIsClaimingDexRefunds] = useState(false);
  const [claimingTokenAddress, setClaimingTokenAddress] = useState<string | null>(null);

  useEffect(() => {
    const fetchRewards = async () => {
      if (!walletAddress || !isAuthenticated) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        // Get auth session
        const { supabase } = await import('@/lib/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setIsLoading(false);
          return;
        }

        const rewardsResponse = await fetch(`/api/rewards/${walletAddress}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        if (!rewardsResponse.ok) {
          if (rewardsResponse.status === 404) {
            setRewards({
              totalClaimable: 0,
              totalClaimed: 0,
              dexRefunds: 0,
              tokens: [],
            });
            return;
          }
          throw new Error('Failed to fetch rewards');
        }

        const rewardsData = await rewardsResponse.json();

        if (!rewardsData.success || !rewardsData.data) {
          throw new Error('Invalid rewards response');
        }

        const { totalClaimedSol, tokens } = rewardsData.data;

        const dexRefunds = 0;

        const MIN_CLAIMABLE_SOL = 0.01;
        const filteredTokens = tokens
          .filter((t: any) => t.totalClaimableSol >= MIN_CLAIMABLE_SOL)
          .map((t: any) => ({
            tokenAddress: t.tokenAddress,
            tokenName: t.tokenName,
            tokenSymbol: t.tokenSymbol,
            tokenLogo: t.tokenLogo,
            dbcFeesSol: t.dbcFeesSol,
            dammFeesSol: t.dammFeesSol,
            migrationFeeClaimable: t.migrationFeeClaimable,
            migrationFeeSol: t.migrationFeeSol,
            totalClaimableSol: t.totalClaimableSol,
          }));

        const filteredTotalClaimable = filteredTokens.reduce(
          (sum: number, t: TokenRewards) => sum + t.totalClaimableSol,
          0
        );

        setRewards({
          totalClaimable: filteredTotalClaimable,
          totalClaimed: totalClaimedSol || 0,
          dexRefunds,
          tokens: filteredTokens,
        });
      } catch (error) {
        console.error('Error fetching rewards:', error);
        toast.error('Failed to load rewards');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRewards();
  }, [walletAddress, isAuthenticated]);

  const handleClaimToken = async (tokenAddress: string) => {
    if (!walletAddress || !isAuthenticated || !publicKey || !signTransaction) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      setClaimingTokenAddress(tokenAddress);

      // Get auth session
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Please connect your wallet');
        return;
      }

      const prepareResponse = await fetch('/api/rewards/prepare-claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          walletAddress,
          tokenAddress,
        }),
      });

      if (!prepareResponse.ok) {
        const errorData = await prepareResponse.json();
        throw new Error(errorData.error || 'Failed to prepare claim');
      }

      const prepareData = await prepareResponse.json();
      if (!prepareData.success || !prepareData.data) {
        throw new Error('Invalid prepare response');
      }

      const claimData: ClaimTransactionData = prepareData.data;

      const connection = getConnection();
      const claimBuilder = new RewardClaimBuilder(connection);

      const transactions = await claimBuilder.buildClaimTransactions(claimData, publicKey);

      for (let i = 0; i < transactions.length; i++) {
        const simulation = await connection.simulateTransaction(transactions[i], {
          sigVerify: false,
        });

        if (simulation.value.err) {
          console.error(`Transaction ${i + 1} simulation failed:`, simulation.value.err);
          throw new Error(`Transaction validation failed: ${JSON.stringify(simulation.value.err)}`);
        }
      }

      const phantomProvider = getPhantomProvider();
      let signatures: string[] = [];

      if (phantomProvider) {
        toast.info(`Approve ${transactions.length} transaction(s) in your wallet...`);

        const result = await phantomProvider.signAndSendAllTransactions(transactions, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        signatures = result.signatures;

        await Promise.all(
          signatures.map(async (sig) => {
            const latestBlockhash = await connection.getLatestBlockhash('confirmed');
            await connection.confirmTransaction({
              signature: sig,
              blockhash: latestBlockhash.blockhash,
              lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            }, 'confirmed');
          })
        );
      } else {
        for (const tx of transactions) {
          const signedTx = await signTransaction(tx);
          const signature = await connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });
          signatures.push(signature);

          const latestBlockhash = await connection.getLatestBlockhash('confirmed');
          await connection.confirmTransaction({
            signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          }, 'confirmed');
        }
      }

      const logResponse = await fetch('/api/rewards/log-claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          tokenAddress,
          creatorWallet: walletAddress,
          transactionSignature: signatures[0],
          claimedAmounts: {
            dbcSol: claimData.amounts.dbcSol,
            migrationSol: claimData.amounts.migrationSol,
            dammSol: claimData.amounts.dammSol,
          },
        }),
      });

      if (!logResponse.ok) {
        console.warn('Failed to log claim, but transaction succeeded');
      }

      toast.success(`Successfully claimed ${claimData.amounts.totalSol.toFixed(4)} SOL!`);

      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error: any) {
      console.error('Error claiming rewards:', error);
      toast.error(error.message || 'Failed to claim rewards');
    } finally {
      setClaimingTokenAddress(null);
    }
  };

  const handleClaimDexRefunds = async () => {
    if (!walletAddress || !isAuthenticated) {
      toast.error('Please connect your wallet');
      return;
    }

    if (rewards.dexRefunds === 0) {
      toast.info('No DEX refunds to claim');
      return;
    }

    try {
      setIsClaimingDexRefunds(true);

      await new Promise(resolve => setTimeout(resolve, 2000));

      toast.success(`Successfully claimed ${rewards.dexRefunds.toFixed(4)} SOL in DEX refunds!`);

      setRewards(prev => ({
        ...prev,
        dexRefunds: 0,
      }));
    } catch (error) {
      console.error('Error claiming DEX refunds:', error);
      toast.error('Failed to claim DEX refunds');
    } finally {
      setIsClaimingDexRefunds(false);
    }
  };

  const formatSol = (amount: number) => {
    return amount.toFixed(4);
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="max-w-4xl mx-auto w-full">
          <div className="text-center py-16">
            <Gift className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Connect your wallet</h2>
            <p className="text-muted-foreground">
              Connect your wallet to view and claim your creator rewards
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Rewards</h1>
          <p className="text-muted-foreground text-sm">
            Claim trading and migration fees from your created tokens
          </p>
        </div>

        {isLoading ? (
          <RewardsSkeleton />
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Total Claimable */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <Gift className="w-5 h-5 text-green-500" />
                    </div>
                    <span className="text-sm text-muted-foreground">Claimable</span>
                  </div>
                  <div className="text-2xl font-bold text-green-500">
                    {formatSol(rewards.totalClaimable)} SOL
                  </div>
                </CardContent>
              </Card>

              {/* Total Claimed */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <TrendingUp className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-sm text-muted-foreground">Total Claimed</span>
                  </div>
                  <div className="text-2xl font-bold">
                    {formatSol(rewards.totalClaimed)} SOL
                  </div>
                </CardContent>
              </Card>

              {/* DEX Refunds */}
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Coins className="w-5 h-5 text-blue-500" />
                    </div>
                    <span className="text-sm text-muted-foreground">DEX Refunds</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold text-blue-500">
                      {formatSol(rewards.dexRefunds)} SOL
                    </div>
                    {rewards.dexRefunds > 0 && (
                      <Button
                        size="sm"
                        onClick={handleClaimDexRefunds}
                        disabled={isClaimingDexRefunds}
                      >
                        {isClaimingDexRefunds ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Claim'
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Token Rewards List */}
            {rewards.tokens.length > 0 ? (
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold mb-4">Claimable by Token</h3>
                  <div className="space-y-1">
                    {rewards.tokens.map((token) => (
                      <div
                        key={token.tokenAddress}
                        className="flex items-center justify-between py-3 border-b border-border last:border-0"
                      >
                        <div
                          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => router.push(`/token/${token.tokenAddress}`)}
                        >
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                            {token.tokenLogo ? (
                              <img
                                src={token.tokenLogo}
                                alt={token.tokenSymbol}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <span className={`text-xs font-semibold ${token.tokenLogo ? 'hidden' : ''}`}>
                              {token.tokenSymbol.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <div className="font-medium hover:underline">{token.tokenName}</div>
                            <div className="text-sm text-muted-foreground">
                              {token.tokenSymbol}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="font-medium text-green-500">
                              {token.totalClaimableSol.toFixed(4)} SOL
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {token.dbcFeesSol > 0 && `DBC: ${token.dbcFeesSol.toFixed(4)}`}
                              {token.dbcFeesSol > 0 && token.dammFeesSol > 0 && ' · '}
                              {token.dammFeesSol > 0 && `DAMM: ${token.dammFeesSol.toFixed(4)}`}
                              {(token.dbcFeesSol > 0 || token.dammFeesSol > 0) && token.migrationFeeClaimable && token.migrationFeeSol > 0 && ' · '}
                              {token.migrationFeeClaimable && token.migrationFeeSol > 0 && `Migration: ${token.migrationFeeSol.toFixed(4)}`}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClaimToken(token.tokenAddress);
                            }}
                            disabled={claimingTokenAddress === token.tokenAddress}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {claimingTokenAddress === token.tokenAddress ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Claiming
                              </>
                            ) : (
                              'Claim'
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-12">
                  <div className="text-center">
                    <Gift className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No rewards yet</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                      Create tokens and earn trading fees when others trade
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => router.push('/')}
                    >
                      Create a Token
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function RewardsPage() {
  return (
    <Suspense fallback={null}>
      <RewardsPageContent />
    </Suspense>
  );
}
