'use client';

/**
 * Simple Token Creation Test Page
 *
 * Basic page for testing token creation functionality.
 * Replace with custom implementation later.
 */

import { CreateTokenDialog } from '@/components/tokens/CreateTokenDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function CreateTokenPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2">Create Token</h1>
          <p className="text-muted-foreground">
            Launch a new token on Meteora DBC. Test page for development.
          </p>
        </div>

        {/* Info Card */}
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">How it works</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>Click "Create Token" to open the creation dialog</li>
            <li>Fill in token details (name, symbol, description, image)</li>
            <li>Backend prepares transaction with fresh blockhash (~500ms)</li>
            <li>Sign the transaction in your wallet within 30 seconds</li>
            <li>Backend adds mint signature and submits to Solana (~1000ms)</li>
            <li>Token created! Total time: ~2-3 seconds</li>
          </ol>
        </Card>

        {/* Create Button */}
        <div className="flex justify-center">
          <CreateTokenDialog
            trigger={
              <Button size="lg" className="px-8">
                Create Token
              </Button>
            }
          />
        </div>

        {/* Technical Details */}
        <Card className="p-6 space-y-4">
          <h2 className="text-xl font-semibold">Technical Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h3 className="font-semibold mb-2">Performance</h3>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Prepare: ~500ms</li>
                <li>• User Sign: ~1000ms</li>
                <li>• Submit: ~1000ms</li>
                <li>• Total: ~2.5 seconds</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Rate Limits</h3>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Prepare: 5 requests/hour per IP</li>
                <li>• Submit: 10 tokens/day per wallet</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Security</h3>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Atomic keypair allocation</li>
                <li>• Race-condition safe (FOR UPDATE SKIP LOCKED)</li>
                <li>• 30s signing timeout</li>
                <li>• Auto-retry on blockhash expiration</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Integration</h3>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Auto-detected by unified stream</li>
                <li>• Metadata extracted from transaction</li>
                <li>• Added to swap whitelist</li>
                <li>• Persisted to database</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Warning */}
        <Card className="p-4 border-yellow-500/50 bg-yellow-500/10">
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            <strong>Note:</strong> This is a test page. Replace with custom implementation later.
            Make sure you have mint keypairs imported to the database before testing.
          </p>
        </Card>
      </div>
    </div>
  );
}
