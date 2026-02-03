import React from 'react';
import Image from 'next/image';

interface SolanaLogoProps {
  className?: string;
  width?: number;
  height?: number;
}

/**
 * Solana Logo Icon Component
 * Uses the official Solana logo
 */
export const SolanaLogo: React.FC<SolanaLogoProps> = ({
  className = '',
  width = 16,
  height = 16
}) => {
  return (
    <span className="inline-flex items-center justify-center">
      <Image
        src="https://ipfs.io/ipfs/bafkreifn2verhnir6r3lj6rmu4tdtmcpoyfl7epvm7y2nvpwsubbha6ora"
        alt="Solana"
        width={width}
        height={height}
        className={className}
        style={{ objectFit: 'contain', display: 'block' }}
      />
    </span>
  );
};
