'use client';

import { useEffect, useState, useRef } from 'react';
import { useBalanceSubscription } from '@/hooks/use-balance-subscription';
import { PasswordProtection } from '@/components/PasswordProtection';
import { useAblyClient } from '@/contexts/AblyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import type { BalanceUpdate } from '@/types/balance';

interface LogEntry {
  id: number;
  timestamp: Date;
  type: 'message' | 'info' | 'error' | 'presence';
  data: unknown;
}

export default function TestBalancePage() {
  const { sol, tokens, isLoading, isConnected, lastUpdated } = useBalanceSubscription();
  const { client, isConnected: ablyConnected } = useAblyClient();
  const { user, isAuthenticated } = useAuth();
  const { publicKey, connected } = useWallet();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);

  const addLog = (type: LogEntry['type'], data: unknown) => {
    const id = logIdRef.current++;
    setLogs(prev => [
      { id, timestamp: new Date(), type, data },
      ...prev.slice(0, 49), // Keep last 50 logs
    ]);
  };

  // Monitor presence channel for debugging
  useEffect(() => {
    if (!client || !ablyConnected || !user?.id || !publicKey) return;

    const presenceChannel = client.channels.get('balance:presence');
    const walletAddress = publicKey.toBase58();

    // Subscribe to presence events to see what's happening
    const enterHandler = (member: { clientId: string; data: unknown }) => {
      addLog('presence', { event: 'enter', clientId: member.clientId, data: member.data });
    };
    const leaveHandler = (member: { clientId: string; data: unknown }) => {
      addLog('presence', { event: 'leave', clientId: member.clientId, data: member.data });
    };

    presenceChannel.presence.subscribe('enter', enterHandler);
    presenceChannel.presence.subscribe('leave', leaveHandler);

    // Check current presence members
    presenceChannel.presence.get().then((members) => {
      addLog('info', {
        message: 'Current presence members',
        count: members.length,
        members: members.map(m => ({ clientId: m.clientId, data: m.data })),
      });
    }).catch((err) => {
      addLog('error', { message: 'Failed to get presence members', error: String(err) });
    });

    // Log that we're monitoring
    addLog('info', {
      message: 'Monitoring presence channel',
      channel: 'balance:presence',
      wallet: walletAddress,
      userId: user.id,
    });

    return () => {
      presenceChannel.presence.unsubscribe('enter', enterHandler);
      presenceChannel.presence.unsubscribe('leave', leaveHandler);
    };
  }, [client, ablyConnected, user?.id, publicKey]);

  // Subscribe to raw balance messages for debugging
  useEffect(() => {
    if (!client || !ablyConnected || !user?.id) return;

    const balanceChannel = client.channels.get(`user:${user.id}:balance`);

    const handler = (message: { name: string; data: BalanceUpdate }) => {
      addLog('message', {
        event: message.name,
        payload: message.data,
      });
    };

    balanceChannel.subscribe(handler);

    addLog('info', { message: 'Subscribed to balance channel', channel: `user:${user.id}:balance` });

    return () => {
      balanceChannel.unsubscribe(handler);
    };
  }, [client, ablyConnected, user?.id]);

  // Log state changes
  useEffect(() => {
    if (isConnected && lastUpdated) {
      addLog('info', {
        message: 'Balance state updated',
        sol,
        tokenCount: tokens.length,
        lastUpdated: new Date(lastUpdated).toISOString(),
      });
    }
  }, [sol, tokens, isConnected, lastUpdated]);

  return (
    <PasswordProtection title="Test Page" description="Enter password to access test pages.">
      <div className="min-h-screen bg-black text-white p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <h1 className="text-2xl font-bold">Balance Subscription Test</h1>

        {/* Connection Status */}
        <div className="bg-zinc-900 rounded-lg p-4 space-y-2">
          <h2 className="text-lg font-semibold mb-3">Connection Status</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Wallet Connected:</div>
            <div className={connected ? 'text-green-400' : 'text-red-400'}>
              {connected ? 'Yes' : 'No'}
            </div>
            <div>Wallet Address:</div>
            <div className="font-mono text-xs truncate">
              {publicKey?.toBase58() || '-'}
            </div>
            <div>Authenticated:</div>
            <div className={isAuthenticated ? 'text-green-400' : 'text-red-400'}>
              {isAuthenticated ? 'Yes' : 'No'}
            </div>
            <div>User ID:</div>
            <div className="font-mono text-xs truncate">{user?.id || '-'}</div>
            <div>Ably Connected:</div>
            <div className={ablyConnected ? 'text-green-400' : 'text-red-400'}>
              {ablyConnected ? 'Yes' : 'No'}
            </div>
            <div>Balance Subscription:</div>
            <div className={isConnected ? 'text-green-400' : isLoading ? 'text-yellow-400' : 'text-red-400'}>
              {isLoading ? 'Loading...' : isConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
        </div>

        {/* Current Balances */}
        <div className="bg-zinc-900 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Current Balances</h2>

          {!isConnected ? (
            <p className="text-zinc-500">
              {isLoading ? 'Loading...' : 'Connect wallet and sign in to see balances'}
            </p>
          ) : (
            <div className="space-y-4">
              {/* SOL Balance */}
              <div className="flex items-center justify-between p-3 bg-zinc-800 rounded">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full" />
                  <div>
                    <div className="font-semibold">SOL</div>
                    <div className="text-xs text-zinc-500">Native Token</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono">{sol?.toFixed(4) ?? '0.0000'}</div>
                </div>
              </div>

              {/* Platform Tokens */}
              {tokens.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm text-zinc-400">Platform Tokens ({tokens.length})</div>
                  {tokens.map(token => (
                    <div key={token.mint} className="flex items-center justify-between p-3 bg-zinc-800 rounded">
                      <div>
                        <div className="font-semibold">{token.symbol}</div>
                        <div className="text-xs text-zinc-500">{token.name}</div>
                        <div className="text-xs text-zinc-600 font-mono">{token.mint}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono">{token.amount.toLocaleString()}</div>
                        <div className="text-xs text-zinc-500">decimals: {token.decimals}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-zinc-500">No platform tokens held</div>
              )}

              {lastUpdated && (
                <div className="text-xs text-zinc-600">
                  Last updated: {new Date(lastUpdated).toLocaleTimeString()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Note about platform tokens */}
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4 text-sm">
          <strong className="text-yellow-500">Note:</strong>{' '}
          <span className="text-yellow-200/80">
            This service only tracks <strong>platform tokens</strong> (tokens created on this platform).
            Random SPL tokens in your wallet are not tracked.
          </span>
        </div>

        {/* Message Log */}
        <div className="bg-zinc-900 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Message Log</h2>
            <button
              onClick={() => setLogs([])}
              className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded"
            >
              Clear
            </button>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-zinc-500 text-sm">No messages yet...</p>
            ) : (
              logs.map(log => (
                <div
                  key={log.id}
                  className={`p-2 rounded text-xs font-mono ${
                    log.type === 'message'
                      ? 'bg-blue-900/30 border border-blue-700/50'
                      : log.type === 'error'
                      ? 'bg-red-900/30 border border-red-700/50'
                      : log.type === 'presence'
                      ? 'bg-purple-900/30 border border-purple-700/50'
                      : 'bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase ${
                      log.type === 'message'
                        ? 'bg-blue-600'
                        : log.type === 'error'
                        ? 'bg-red-600'
                        : log.type === 'presence'
                        ? 'bg-purple-600'
                        : 'bg-zinc-600'
                    }`}>
                      {log.type}
                    </span>
                    <span className="text-zinc-500">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap break-all text-zinc-300">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>
        </div>
      </div>
    </PasswordProtection>
  );
}
