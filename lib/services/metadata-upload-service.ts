/**
 * Metadata Upload Service
 * Creates and uploads Metaplex-compliant metadata JSON files to Pinata IPFS
 */

import { PinataSDK } from 'pinata';

/**
 * Metaplex Token Metadata Standard
 * https://docs.metaplex.com/programs/token-metadata/token-standard
 */
export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  createdOn?: string;
  // Project-specific fields
  tokenType?: 'meme' | 'project';
  category?: string;
  industry?: string;
  stage?: string;
  // Optional fields
  external_url?: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
  properties?: {
    files?: Array<{
      uri: string;
      type: string;
    }>;
    category?: string;
    creators?: Array<{
      address: string;
      share: number;
    }>;
  };
}

export class MetadataUploadService {
  /**
   * Upload metadata JSON to Pinata IPFS
   */
  static async uploadMetadata(metadata: TokenMetadata): Promise<string> {
    // Check if Pinata is configured
    const pinataJwt = process.env.PINATA_JWT;
    const pinataGateway = process.env.PINATA_GATEWAY;

    if (!pinataJwt) {
      throw new Error('Pinata JWT not configured - required for metadata upload');
    }

    try {
      // Initialize Pinata SDK
      const pinata = new PinataSDK({
        pinataJwt,
        pinataGateway,
      });

      // Upload JSON to Pinata IPFS using the public upload method
      const upload = await pinata.upload.public.json(metadata);

      // Use the public IPFS gateway for metadata URI (for cross-platform compatibility)
      const ipfsUrl = `https://ipfs.io/ipfs/${upload.cid}`;

      return ipfsUrl;
    } catch (error: any) {
      console.error('Error uploading metadata to Pinata:', error);
      throw new Error(`Failed to upload metadata to IPFS: ${error.message}`);
    }
  }

  /**
   * Create metadata JSON object from token params
   */
  static createMetadata(params: {
    name: string;
    symbol: string;
    description: string;
    imageUrl: string;
    creator?: string;
    website?: string;
    twitter?: string;
    telegram?: string;
    // Project-specific fields
    tokenType?: 'meme' | 'project';
    category?: string;
    industry?: string;
    stage?: string;
  }): TokenMetadata {
    const metadata: TokenMetadata = {
      name: params.name,
      symbol: params.symbol,
      description: params.description,
      image: params.imageUrl,
      website: params.website || '',
      twitter: params.twitter || '',
      telegram: params.telegram || '',
      createdOn: 'https://www.launchpad.fun/',
    };

    // Add project-specific fields if this is a project token
    if (params.tokenType === 'project') {
      metadata.tokenType = 'project';
      metadata.category = params.category || '';
      metadata.industry = params.industry || '';
      metadata.stage = params.stage || '';
    }

    // Add creator if provided
    if (params.creator) {
      metadata.properties = {
        creators: [
          {
            address: params.creator,
            share: 100,
          },
        ],
      };
    }

    return metadata;
  }

  /**
   * Create and upload metadata in one step
   */
  static async createAndUploadMetadata(params: {
    name: string;
    symbol: string;
    description: string;
    imageUrl: string;
    creator?: string;
    website?: string;
    twitter?: string;
    telegram?: string;
    createdOn?: string;
    // Project-specific fields
    tokenType?: 'meme' | 'project';
    category?: string;
    industry?: string;
    stage?: string;
  }): Promise<string> {
    const metadata = this.createMetadata(params);
    return await this.uploadMetadata(metadata);
  }
}
