'use client';

interface TerminalProps {
  mint: string;
}

export default function Terminal({ mint }: TerminalProps) {
  return (
    <div className="border border-neutral-700 rounded-lg p-4">
      <p className="text-muted-foreground">Terminal (Swap Widget) - Mint: {mint}</p>
    </div>
  );
}

