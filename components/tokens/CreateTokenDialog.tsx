'use client';

/**
 * Create Token Dialog
 *
 * Modal dialog for creating new tokens with Meteora DBC.
 * Implements reverse partial signing with 30s timeout:
 * 1. User fills form
 * 2. Backend prepares unsigned transaction
 * 3. User signs within 30s (wallet popup)
 * 4. Backend adds mint signature and submits
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConnection } from '@solana/wallet-adapter-react';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { Transaction } from '@solana/web3.js';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { FeeTier, FEE_TIERS, formatFeeTier } from '@/lib/config/dbc-configs';
import { Shield, ExternalLink } from 'lucide-react';

interface CreateTokenDialogProps {
  trigger?: React.ReactNode;
}

interface FormData {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  initialBuy?: number;
  initialBuyDisplay?: string;
  feeTier: FeeTier;
  graceMode: boolean;
}

export function CreateTokenDialog({ trigger }: CreateTokenDialogProps) {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    symbol: '',
    description: '',
    imageUrl: '',
    initialBuy: undefined,
    initialBuyDisplay: '',
    feeTier: FeeTier.FEE_1, // Default to 1%
    graceMode: false, // Default to grace mode disabled
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!publicKey || !signTransaction) {
      toast.error('Please connect your wallet');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Prepare transaction (backend builds and partially signs)
      const requestBody = {
        name: formData.name,
        symbol: formData.symbol,
        description: formData.description,
        imageUrl: formData.imageUrl,
        initialBuy: formData.initialBuy,
        creator: publicKey.toBase58(),
        feeTier: formData.feeTier,
        graceMode: formData.graceMode,
      };

      const prepareResponse = await fetch('/api/token/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!prepareResponse.ok) {
        const error = await prepareResponse.json();
        throw new Error(error.error || error.message || 'Failed to prepare token creation');
      }

      const { data: prepareData } = await prepareResponse.json();
      const { serializedTx, mintPubkey } = prepareData;

      // Step 2: User signs transaction (with 30s timeout)
      toast.info('Please sign the transaction in your wallet');

      const transaction = Transaction.from(Buffer.from(serializedTx, 'base64'));

      // Race between user signing and 30s timeout
      const signedTx = await Promise.race([
        signTransaction(transaction),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('SIGNING_TIMEOUT')), 30000)
        ),
      ]);

      // Serialize signed transaction
      const signedTxBase64 = signedTx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      }).toString('base64');

      // Step 3: Submit to backend for final signing and submission
      const submitResponse = await fetch('/api/token/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedTx: signedTxBase64,
          mintPubkey,
          userWallet: publicKey.toBase58(),
        }),
      });

      if (!submitResponse.ok) {
        const error = await submitResponse.json();

        // Handle blockhash expiration with retry prompt
        if (error.error === 'BLOCKHASH_EXPIRED' || error.error === 'KEYPAIR_EXPIRED') {
          toast.error(error.message, {
            description: 'Click "Create Token" to try again',
            duration: 5000,
          });
          return;
        }

        throw new Error(error.message || 'Failed to submit token creation');
      }

      const { data: submitData } = await submitResponse.json();
      const { mintAddress } = submitData;

      // Success!
      const tokenName = formData.name;
      const tokenSymbol = formData.symbol;
      toast(`${tokenName} (${tokenSymbol}) created!`, {
        duration: 10000,
        description: (
          <div style={{ textAlign: 'center', width: '100%' }}>
            <button
              onClick={() => router.push(`/token/${mintAddress}`)}
              className="mt-1 text-sm cursor-pointer text-primary hover:underline"
            >
              Go to token page <ExternalLink className="inline w-3 h-3 ml-1" />
            </button>
          </div>
        ),
      });

      // Reset form and close dialog
      setFormData({
        name: '',
        symbol: '',
        description: '',
        imageUrl: '',
        initialBuy: undefined,
        initialBuyDisplay: '',
        feeTier: FeeTier.FEE_1,
        graceMode: false,
      });
      setOpen(false);
    } catch (error: any) {
      if (error.message === 'SIGNING_TIMEOUT') {
        toast.error('Signing timeout', {
          description: 'Please sign within 30 seconds. Try again.',
          duration: 5000,
        });
      } else if (error.message?.includes('User rejected')) {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Failed to create token', {
          description: error.message,
          duration: 5000,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button>Create Token</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Token</DialogTitle>
          <DialogDescription>
            Launch a new token on Meteora DBC. You&apos;ll need to sign the transaction
            within 30 seconds.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Token Name</Label>
            <Input
              id="name"
              placeholder="My Awesome Token"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              maxLength={32}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="symbol">Symbol</Label>
            <Input
              id="symbol"
              placeholder="MAT"
              value={formData.symbol}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  symbol: e.target.value.toUpperCase(),
                })
              }
              maxLength={10}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe your token..."
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              maxLength={1000}
              rows={3}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="imageUrl">Image URL</Label>
            <Input
              id="imageUrl"
              type="url"
              placeholder="https://example.com/image.png"
              value={formData.imageUrl}
              onChange={(e) =>
                setFormData({ ...formData, imageUrl: e.target.value })
              }
              required
              disabled={loading}
            />
            {/* Image Preview */}
            {formData.imageUrl && (
              <div className="flex justify-center pt-2">
                <div className="relative w-32 h-32 rounded-lg border border-border bg-muted overflow-hidden">
                  <img
                    src={formData.imageUrl}
                    alt="Token preview"
                    className="absolute inset-0 w-full h-full object-contain"
                    onError={(e) => {
                      // Hide image if it fails to load
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="initialBuy">Initial Buy (SOL) - Optional</Label>
            <Input
              id="initialBuy"
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={formData.initialBuyDisplay || ''}
              onChange={(e) => {
                const value = e.target.value;
                // Allow empty string, numbers, and decimal point
                if (value === '' || /^\d*\.?\d*$/.test(value)) {
                  setFormData({
                    ...formData,
                    initialBuyDisplay: value,
                    initialBuy: value === '' ? undefined : parseFloat(value) || undefined,
                  });
                }
              }}
              disabled={loading}
            />
          </div>

          {/* Fee Tier Slider */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <Label>Creator Fee</Label>
              <Badge variant="secondary" className="font-mono">
                {formatFeeTier(formData.feeTier)}
              </Badge>
            </div>
            <Slider
              min={0}
              max={FEE_TIERS.length - 1}
              step={1}
              value={[FEE_TIERS.indexOf(formData.feeTier)]}
              onValueChange={([index]) => {
                const selectedFeeTier = FEE_TIERS[index];
                setFormData({ ...formData, feeTier: selectedFeeTier });
              }}
              disabled={loading}
              className="py-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0.25%</span>
              <span>1%</span>
              <span>2%</span>
              <span>3%</span>
              <span>4%</span>
              <span>5%</span>
            </div>
          </div>

          {/* Grace Mode Toggle */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="graceMode">Grace Period</Label>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Deter snipers with 50% fee for 20s, decreasing to {formatFeeTier(formData.feeTier)}
                </p>
              </div>
              <Switch
                id="graceMode"
                checked={formData.graceMode}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, graceMode: checked })
                }
                disabled={loading}
              />
            </div>
            {formData.graceMode && (
              <div className="rounded-lg bg-muted p-3 text-xs space-y-1">
                <p className="font-semibold">Grace Period Active:</p>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                  <li>Starts at 50% fee</li>
                  <li>Decreases exponentially over 20 seconds</li>
                  <li>Ends at {formatFeeTier(formData.feeTier)} fee</li>
                  <li>Deters bots and snipers</li>
                </ul>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !publicKey} className="flex-1">
              {loading ? 'Creating...' : 'Create Token'}
            </Button>
          </div>

          {loading && (
            <p className="text-sm text-muted-foreground text-center">
              Please sign the transaction in your wallet within 30 seconds...
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
