'use client';

/**
 * Create Token Page
 *
 * Full page for creating new tokens with Meteora DBC.
 * Implements reverse partial signing with 30s timeout:
 * 1. User fills form
 * 2. Backend prepares unsigned transaction
 * 3. User signs within 30s (wallet popup)
 * 4. Backend adds mint signature and submits
 */

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useConnection } from '@solana/wallet-adapter-react';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { useAuth } from '@/contexts/AuthContext';
import { useWhitelist } from '@/hooks/use-whitelist';
import { Transaction } from '@solana/web3.js';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Shield, Upload, X, ExternalLink, Info, Plus, Trash2, Check, ChevronRight, ChevronLeft, Lock, ArrowRight } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TOKEN_PAGE_STYLES, type TokenPageStyle } from '@/lib/utils/page-style';
import { FeeTier, FEE_TIERS, formatFeeTier } from '@/lib/config/dbc-configs';

// Roadmap milestone type
interface RoadmapMilestone {
  id: string;
  title: string;
  targetDate: string;
  status: 'planned' | 'in_progress' | 'completed';
  description: string;
}

// Vesting configuration type
interface VestingConfig {
  enabled: boolean;
  vestingPercentage: number; // % of total supply to vest
  vestingDuration: number; // Duration value
  vestingDurationUnit: 'days' | 'weeks' | 'months'; // Duration unit
  unlockSchedule: 'daily' | 'weekly' | 'bi-weekly' | 'monthly';
  cliffEnabled: boolean;
  cliffDuration: number; // Cliff duration value
  cliffDurationUnit: 'days' | 'weeks' | 'months';
  cliffPercentage: number; // % released at cliff
}

interface FormData {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  initialBuy?: number;
  initialBuyDisplay?: string;
  pageStyle?: string;
  selectedPageId?: string;
  feeTier: FeeTier;
  graceMode: boolean;
  // Project-specific fields
  category?: string;
  industry?: string;
  stage?: string;
  roadmap: RoadmapMilestone[];
  vesting: VestingConfig;
  // Project launch settings
  graduationThreshold?: number;
  graduationThresholdDisplay?: string;
}

// Create mode type
type CreateMode = 'memes' | 'projects';

// Wizard steps for Projects mode
type ProjectWizardStep = 'token-project' | 'roadmap' | 'vesting' | 'review';

const PROJECT_WIZARD_STEPS: { id: ProjectWizardStep; title: string; description: string }[] = [
  { id: 'token-project', title: 'Token & Project', description: 'Token details & project info' },
  { id: 'roadmap', title: 'Roadmap', description: 'Project milestones' },
  { id: 'vesting', title: 'Vesting', description: 'Token vesting schedule' },
  { id: 'review', title: 'Review', description: 'Confirm and create' },
];

// Unlock schedule options
const UNLOCK_SCHEDULES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'bi-weekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
] as const;

// Duration unit options
const DURATION_UNITS = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
] as const;

// Helper to convert duration to days
const toDays = (value: number, unit: 'days' | 'weeks' | 'months') => {
  return value * (unit === 'days' ? 1 : unit === 'weeks' ? 7 : 30);
};

// Default vesting config
const DEFAULT_VESTING_CONFIG: VestingConfig = {
  enabled: false,
  vestingPercentage: 10,
  vestingDuration: 6,
  vestingDurationUnit: 'months',
  unlockSchedule: 'monthly',
  cliffEnabled: false,
  cliffDuration: 1,
  cliffDurationUnit: 'months',
  cliffPercentage: 10,
};

// Project categories (sorted by popularity)
const PROJECT_CATEGORIES = [
  { value: 'ai', label: 'AI' },
  { value: 'defi', label: 'DeFi' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'rwa', label: 'Real World Assets' },
  { value: 'social', label: 'Social' },
  { value: 'nft', label: 'NFT' },
  { value: 'dao', label: 'DAO' },
  { value: 'other', label: 'Other' },
] as const;

// Project industries (sorted by popularity)
const PROJECT_INDUSTRIES = [
  { value: 'technology', label: 'Technology' },
  { value: 'finance', label: 'Finance' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'media', label: 'Media' },
  { value: 'ecommerce', label: 'E-Commerce' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'energy', label: 'Energy' },
  { value: 'real-estate', label: 'Real Estate' },
  { value: 'supply-chain', label: 'Supply Chain' },
  { value: 'education', label: 'Education' },
  { value: 'other', label: 'Other' },
] as const;

// Project stages
const PROJECT_STAGES = [
  { value: 'ideation', label: 'Ideation' },
  { value: 'prototype', label: 'Prototype' },
  { value: 'mvp', label: 'MVP' },
  { value: 'beta', label: 'Beta' },
  { value: 'live', label: 'Live' },
  { value: 'scaling', label: 'Scaling' },
] as const;

// Milestone status options
const MILESTONE_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
] as const;

function CreateTokenPageContent() {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [loading, setLoading] = useState(false);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isNameAvailable, setIsNameAvailable] = useState<boolean | null>(null);
  const checkNameTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [twitterError, setTwitterError] = useState<string | null>(null);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [symbolError, setSymbolError] = useState<string | null>(null);

  // Reserved names/symbols that cannot be used (case-insensitive exact match)
  const RESERVED_NAMES: string[] = [];
  const RESERVED_SYMBOLS: string[] = [];
  // Names/symbols that should appear as "already taken" (our platform tokens)
  const TAKEN_NAMES: string[] = [];
  const TAKEN_SYMBOLS: string[] = [];
  const [formData, setFormData] = useState<FormData>({
    name: '',
    symbol: '',
    description: '',
    imageUrl: '',
    website: '',
    twitter: '',
    telegram: '',
    initialBuy: undefined,
    initialBuyDisplay: '',
    pageStyle: 'default',
    selectedPageId: undefined,
    feeTier: FeeTier.FEE_1, // Default to 1%
    graceMode: false, // Default to grace mode disabled
    roadmap: [],
    vesting: { ...DEFAULT_VESTING_CONFIG },
    graduationThreshold: 85, // Default graduation threshold in SOL
    graduationThresholdDisplay: '85',
  });

  // Create mode and wizard step state
  const [createMode, setCreateMode] = useState<CreateMode>('memes');
  const [currentStep, setCurrentStep] = useState<ProjectWizardStep>('token-project');

  // Vesting chart hover state
  const [vestingHover, setVestingHover] = useState<{ x: number; y: number; snappedX: number; snappedY: number; time: string; percent: number } | null>(null);
  const vestingChartRef = useRef<HTMLDivElement>(null);

  // Check if token name exists
  const checkTokenName = async (name: string, symbol?: string, showLoading = true): Promise<boolean> => {
    const trimmedName = name.trim();
    const trimmedSymbol = symbol?.trim() || '';
    
    if (!trimmedName || trimmedName.length === 0) {
      setNameError(null);
      setIsNameAvailable(null);
      return false;
    }

    // Only check availability if name is more than 3 characters
    if (trimmedName.length <= 3) {
      setNameError(null);
      setIsNameAvailable(null);
      return false;
    }

    // If symbol is empty, we can't check the combination yet
    // Only check if both name and symbol are provided
    if (!trimmedSymbol || trimmedSymbol.length === 0) {
      setNameError(null);
      setIsNameAvailable(null);
      return false;
    }

    if (showLoading) {
      setIsCheckingName(true);
    }
    setNameError(null);
    setIsNameAvailable(null);

    try {
      const response = await fetch('/api/tokens/check-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          symbol: trimmedSymbol || undefined,
        }),
      });

      // Handle rate limiting
      if (response.status === 429) {
        setNameError('Too many checks. Please wait a moment before trying again.');
        setIsNameAvailable(null);
        return false;
      }

      const data = await response.json();

      if (data.exists) {
        setNameError(data.message || 'This token name and symbol combination is already taken');
        setIsNameAvailable(false);
        return true;
      }

      setNameError(null);
      setIsNameAvailable(true);
      return false;
    } catch (error) {
      console.error('Error checking token name/symbol:', error);
      // Don't block submission if check fails, but show warning
      setNameError('Could not verify token name/symbol availability');
      setIsNameAvailable(null);
      return false;
    } finally {
      if (showLoading) {
        setIsCheckingName(false);
      }
    }
  };

  // Debounced name and symbol check
  const debouncedCheckName = (name: string, symbol?: string) => {
    const trimmedName = name.trim();
    const trimmedSymbol = symbol?.trim() || '';
    
    // Only check if name is more than 3 characters and symbol is provided
    if (trimmedName.length <= 3 || !trimmedSymbol || trimmedSymbol.length === 0) {
      return;
    }

    // Clear existing timeout
    if (checkNameTimeoutRef.current) {
      clearTimeout(checkNameTimeoutRef.current);
    }

    // Set new timeout
    checkNameTimeoutRef.current = setTimeout(() => {
      checkTokenName(trimmedName, trimmedSymbol);
    }, 500); // Wait 500ms after user stops typing
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (checkNameTimeoutRef.current) {
        clearTimeout(checkNameTimeoutRef.current);
      }
    };
  }, []);

  // Handle image selection (just validate and create preview, don't upload yet)
  const handleImageSelect = (file: File) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type', {
        description: 'Please upload a JPEG, PNG, GIF, or WebP image.',
        duration: 5000,
      });
      return;
    }

    // Validate file size (3MB max)
    const maxSize = 3 * 1024 * 1024; // 3MB
    if (file.size > maxSize) {
      toast.error('File too large', {
        description: 'Please upload an image smaller than 3MB.',
        duration: 5000,
      });
      return;
    }

    // Store the file and create a preview URL
    setSelectedImageFile(file);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    
    // Clear the uploaded URL since we haven't uploaded yet
    setFormData(prev => ({ ...prev, imageUrl: '' }));
  };

  // Upload image to Pinata (called when user clicks "Create Token")
  const uploadImage = async (file: File): Promise<string> => {
    setIsUploadingImage(true);

    try {
      // Get Supabase session
      const { supabase } = await import('@/lib/supabase');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('Session error:', sessionError);
        throw new Error('Authentication error. Please try connecting your wallet again.');
      }

      if (!session || !session.access_token) {
        throw new Error('Please authenticate to upload images. Connect your wallet and sign in.');
      }

      // Create form data
      const formData = new FormData();
      formData.append('file', file);

      // Upload to API with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      let response: Response;
      try {
        response = await fetch('/api/upload/image', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: formData,
          signal: controller.signal,
        });
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        // Handle network errors with helpful messages
        if (fetchError.name === 'AbortError') {
          throw new Error('Upload timed out. Please check your internet connection and try again.');
        }
        if (fetchError.message === 'Failed to fetch') {
          throw new Error('Network error. Please check your internet connection, disable any ad blockers, and try again.');
        }
        throw fetchError;
      }
      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        console.error('❌ Upload failed:', data);
        throw new Error(data.error || 'Failed to upload image');
      }

      // Use the verified URL from the API response
      // The API verifies which gateway works and returns the best URL
      const finalUrl = data.url || data.ipfsUrl || data.pinataUrl;

      // Verify URL is valid
      if (!finalUrl || !finalUrl.startsWith('http')) {
        console.error('❌ Invalid URL returned:', finalUrl);
        throw new Error('Invalid image URL returned from upload service');
      }

      return finalUrl;
    } catch (error: any) {
      console.error('❌ Error in uploadImage:', error);
      throw error;
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageSelect(file);
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle remove image
  const handleRemoveImage = () => {
    // Clean up object URL if it exists
    if (imagePreview && imagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview);
    }
    setSelectedImageFile(null);
    setImagePreview(null);
    setFormData(prev => ({ ...prev, imageUrl: '' }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!loading && !isUploadingImage) {
      setIsDraggingImage(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingImage(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingImage(false);
    if (loading || isUploadingImage) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleImageSelect(file);
    }
  };

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  // Helper to release allocated mint keypair
  const releaseKeypair = async (mintPubkey: string, accessToken?: string) => {
    try {
      // Get token if not provided
      let token = accessToken;
      if (!token) {
        const { supabase } = await import('@/lib/supabase');
        const { data: { session } } = await supabase.auth.getSession();
        token = session?.access_token;
      }

      await fetch('/api/token/release', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ mintPubkey }),
      });
    } catch (error) {
      // Don't throw - this is a cleanup operation
      console.error('Failed to release keypair (non-critical):', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!publicKey || !signTransaction) {
      toast.error('Please connect your wallet');
      return;
    }

    // Track if component is still mounted
    let isMounted = true;

    // Validate that an image is selected
    if (!selectedImageFile && !formData.imageUrl) {
      toast.error('Please select an image');
      return;
    }

    if(formData.name === '') {
      toast.error('Please enter a token name');
      return;
    }

    if(formData.symbol === '') {
      toast.error('Please enter a token symbol');
      return;
    }

    // Validate token name length
    const trimmedName = formData.name.trim();
    const trimmedSymbol = formData.symbol.trim();
    
    if (trimmedName.length < 3) {
      toast.error('Token name too short', {
        description: 'Token name must be at least 3 characters long.',
        duration: 5000,
      });
      setNameError('Token name must be at least 3 characters long');
      return;
    }

    if (!trimmedSymbol || trimmedSymbol.length === 0) {
      toast.error('Token symbol required', {
        description: 'Please enter a token symbol.',
        duration: 5000,
      });
      return;
    }

    // Validate name and symbol errors
    if (nameError) {
      toast.error('Invalid token name', {
        description: nameError,
        duration: 5000,
      });
      return;
    }

    if (symbolError) {
      toast.error('Invalid token symbol', {
        description: symbolError,
        duration: 5000,
      });
      return;
    }

    // Validate social links
    if (twitterError) {
      toast.error('Invalid X/Twitter link', {
        description: twitterError,
        duration: 5000,
      });
      return;
    }

    if (telegramError) {
      toast.error('Invalid Telegram link', {
        description: telegramError,
        duration: 5000,
      });
      return;
    }

    if (websiteError) {
      toast.error('Invalid website URL', {
        description: websiteError,
        duration: 5000,
      });
      return;
    }

    // Validate project-specific fields
    if (createMode === 'projects') {
      // Required project fields
      if (!formData.twitter?.trim()) {
        toast.error('Twitter/X is required', {
          description: 'Please enter your project\'s Twitter/X handle.',
          duration: 5000,
        });
        return;
      }
      if (!formData.website?.trim()) {
        toast.error('Website is required', {
          description: 'Please enter your project\'s website URL.',
          duration: 5000,
        });
        return;
      }
      if (!formData.category) {
        toast.error('Category is required', {
          description: 'Please select a project category.',
          duration: 5000,
        });
        return;
      }
      if (!formData.industry) {
        toast.error('Industry is required', {
          description: 'Please select a project industry.',
          duration: 5000,
        });
        return;
      }
      if (!formData.stage) {
        toast.error('Project stage is required', {
          description: 'Please select your project stage.',
          duration: 5000,
        });
        return;
      }
      if (!formData.graduationThreshold || formData.graduationThreshold <= 0) {
        toast.error('Graduation threshold is required', {
          description: 'Please enter a valid graduation threshold in SOL.',
          duration: 5000,
        });
        return;
      }
      if (formData.graduationThreshold < 10) {
        toast.error('Graduation threshold too low', {
          description: 'Minimum graduation threshold is 10 SOL.',
          duration: 5000,
        });
        return;
      }

      // Validate roadmap milestones if any exist
      if (formData.roadmap.length > 0) {
        for (let i = 0; i < formData.roadmap.length; i++) {
          const milestone = formData.roadmap[i];
          const milestoneNum = i + 1;
          if (!milestone.title.trim()) {
            toast.error(`Milestone ${milestoneNum}: Title is required`, { duration: 5000 });
            return;
          }
          if (!milestone.targetDate) {
            toast.error(`Milestone ${milestoneNum}: Target date is required`, { duration: 5000 });
            return;
          }
          if (!milestone.description.trim()) {
            toast.error(`Milestone ${milestoneNum}: Description is required`, { duration: 5000 });
            return;
          }
        }
      }

      // Validate vesting if enabled
      if (formData.vesting.enabled) {
        if (formData.vesting.vestingDuration <= 0) {
          toast.error('Vesting duration must be greater than 0', { duration: 5000 });
          return;
        }
        if (formData.vesting.vestingPercentage <= 0) {
          toast.error('Vesting percentage must be greater than 0', { duration: 5000 });
          return;
        }
        if (formData.vesting.cliffEnabled) {
          const toDays = (value: number, unit: string) => {
            if (unit === 'days') return value;
            if (unit === 'weeks') return value * 7;
            return value * 30; // months
          };
          const vestingInDays = toDays(formData.vesting.vestingDuration, formData.vesting.vestingDurationUnit);
          const cliffInDays = toDays(formData.vesting.cliffDuration, formData.vesting.cliffDurationUnit);
          if (cliffInDays > vestingInDays) {
            toast.error('Cliff duration cannot exceed vesting duration', { duration: 5000 });
            return;
          }
        }
      }
    }

    // Check if token name and symbol combination is already taken (don't show loading on submit)
    const nameTaken = await checkTokenName(trimmedName, trimmedSymbol, false);
    if (nameTaken) {
      toast.error('Token name and symbol combination already exists', {
        description: 'Please choose a different token name or symbol.',
        duration: 5000,
      });
      return;
    }

    setLoading(true);

    // Track allocated mint keypair for cleanup if transaction fails/is rejected
    let allocatedMintPubkey: string | null = null;

    try {
      // Get auth session for API calls
      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please connect your wallet first');
        setLoading(false);
        return;
      }

      // Step 0: Upload image if a file is selected (but not yet uploaded)
      let imageUrl = formData.imageUrl;
      if (selectedImageFile && !formData.imageUrl) {
        toast.info('Uploading image...');
        try {
          imageUrl = await uploadImage(selectedImageFile);

          // Update form data with the uploaded URL
          setFormData(prev => ({ ...prev, imageUrl }));

          // Clean up the object URL and replace with the uploaded URL
          if (imagePreview && imagePreview.startsWith('blob:')) {
            URL.revokeObjectURL(imagePreview);
          }
          setImagePreview(imageUrl);
        } catch (error: any) {
          console.error('❌ Error uploading image:', error);
          console.error('   Error message:', error.message);
          console.error('   Error stack:', error.stack);
          toast.error('Failed to upload image', {
            description: error.message || 'Please try again.',
            duration: 5000,
          });
          setLoading(false);
          return;
        }
      }

      // Step 1: Prepare transaction (backend builds and partially signs)
      // Normalize URLs - add https:// if missing
      const normalizeUrl = (url: string | undefined) => {
        if (!url) return '';
        if (url.match(/^https?:\/\//i)) return url;
        return `https://${url}`;
      };

      let mintAddress: string;

      if (createMode === 'projects') {
        // === PROJECT TOKEN FLOW (Two-step: Config then Pool) ===
        const projectPreparePayload = {
          name: formData.name,
          symbol: formData.symbol,
          description: formData.description,
          imageUrl: imageUrl,
          initialBuy: formData.initialBuy,
          website: normalizeUrl(formData.website),
          twitter: normalizeUrl(formData.twitter),
          telegram: formData.telegram ? normalizeUrl(formData.telegram) : '',
          category: formData.category,
          industry: formData.industry,
          stage: formData.stage,
          roadmap: formData.roadmap,
          vesting: formData.vesting,
          graduationThreshold: formData.graduationThreshold,
          feeTierBps: formData.feeTier === FeeTier.FEE_1 ? 100 : formData.feeTier === FeeTier.FEE_2 ? 200 : 500,
          graceMode: formData.graceMode,
        };

        // Step 1: Prepare (get config or pool transaction)
        const prepareResponse = await fetch('/api/project/prepare', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(projectPreparePayload),
        });

        if (!prepareResponse.ok) {
          const error = await prepareResponse.json();
          throw new Error(error.message || 'Failed to prepare project token creation');
        }

        const { data: prepareData } = await prepareResponse.json();
        const { step, configPubkey, mintPubkey, metadataUri, name, symbol, initialBuy } = prepareData;

        // Store mintPubkey for potential cleanup if user rejects
        allocatedMintPubkey = mintPubkey;

        let poolData: { transactions: { name: string; serializedTx: string }[] };

        if (step === 'config') {
          // Need to create config first
          toast.info('Please sign the config transaction in your wallet');

          const configTx = Transaction.from(Buffer.from(prepareData.configTx, 'base64'));

          let signedConfigTx: Transaction;
          try {
            signedConfigTx = await Promise.race([
              signTransaction(configTx),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('SIGNING_TIMEOUT')), 30000)
              ),
            ]);
          } catch (signError: any) {
            const errorMessage = signError?.message || signError?.toString() || '';
            const errorName = signError?.name || '';
            const errorCode = signError?.code;

            const isRejected =
              errorMessage.includes('User rejected') ||
              errorMessage.includes('rejected') ||
              errorMessage.includes('User cancelled') ||
              errorMessage.includes('cancelled') ||
              (errorName.includes('WalletSignTransactionError') && errorMessage.includes('rejected')) ||
              errorCode === 4001 ||
              errorCode === 4000;

            if (isRejected) {
              if (allocatedMintPubkey) {
                await releaseKeypair(allocatedMintPubkey, session.access_token);
              }
              toast.error('Transaction cancelled', {
                description: 'You cancelled the transaction in your wallet.',
                duration: 3000,
              });
              setLoading(false);
              return;
            }
            throw signError;
          }

          // Submit config transaction
          toast.info('Configuring project...');

          const configSubmitResponse = await fetch('/api/project/submit', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              transactions: [{
                name: 'createConfigTx',
                serializedTx: signedConfigTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
              }],
              configPubkey,
              step: 'config',
            }),
          });

          if (!configSubmitResponse.ok) {
            const error = await configSubmitResponse.json();
            throw new Error(error.message || 'Failed to create config');
          }

          // Config confirmed, now get pool transaction
          const preparePoolResponse = await fetch('/api/project/prepare-pool', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              configPubkey,
              mintPubkey,
              metadataUri,
              name,
              symbol,
              initialBuy,
            }),
          });

          if (!preparePoolResponse.ok) {
            const error = await preparePoolResponse.json();
            throw new Error(error.message || 'Failed to prepare pool transaction');
          }

          poolData = (await preparePoolResponse.json()).data;
        } else {
          // Config already exists, prepare-pool endpoint was called implicitly
          // Need to call prepare-pool to get transactions
          const preparePoolResponse = await fetch('/api/project/prepare-pool', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              configPubkey,
              mintPubkey,
              metadataUri,
              name,
              symbol,
              initialBuy,
            }),
          });

          if (!preparePoolResponse.ok) {
            const error = await preparePoolResponse.json();
            throw new Error(error.message || 'Failed to prepare pool transaction');
          }

          poolData = (await preparePoolResponse.json()).data;
        }

        // Sign pool transaction(s)
        toast.info(`Please sign ${poolData.transactions.length} transaction${poolData.transactions.length > 1 ? 's' : ''} in your wallet`);

        const signedPoolTransactions: { name: string; serializedTx: string }[] = [];

        for (const txData of poolData.transactions) {
          const transaction = Transaction.from(Buffer.from(txData.serializedTx, 'base64'));

          let signedTx: Transaction;
          try {
            signedTx = await Promise.race([
              signTransaction(transaction),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('SIGNING_TIMEOUT')), 30000)
              ),
            ]);
          } catch (signError: any) {
            const errorMessage = signError?.message || signError?.toString() || '';
            const errorName = signError?.name || '';
            const errorCode = signError?.code;

            const isRejected =
              errorMessage.includes('User rejected') ||
              errorMessage.includes('rejected') ||
              errorMessage.includes('User cancelled') ||
              errorMessage.includes('cancelled') ||
              (errorName.includes('WalletSignTransactionError') && errorMessage.includes('rejected')) ||
              errorCode === 4001 ||
              errorCode === 4000;

            if (isRejected) {
              if (allocatedMintPubkey) {
                await releaseKeypair(allocatedMintPubkey, session.access_token);
              }
              toast.error('Transaction cancelled', {
                description: 'You cancelled the transaction in your wallet.',
                duration: 3000,
              });
              setLoading(false);
              return;
            }
            throw signError;
          }

          signedPoolTransactions.push({
            name: txData.name,
            serializedTx: signedTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
          });
        }

        // Submit pool transaction(s)
        toast.info('Creating token...');

        const submitResponse = await fetch('/api/project/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            transactions: signedPoolTransactions,
            mintPubkey,
            configPubkey,
            step: 'pool',
          }),
        });

        if (!submitResponse.ok) {
          const error = await submitResponse.json();
          if (error.error === 'BLOCKHASH_EXPIRED' || error.error === 'KEYPAIR_EXPIRED' || error.error === 'EXPIRED') {
            toast.error(error.message, {
              description: 'Please try again',
              duration: 5000,
            });
            return;
          }
          throw new Error(error.message || 'Failed to submit project token creation');
        }

        const { data: submitData } = await submitResponse.json();
        mintAddress = submitData.mintAddress;

      } else {
        // === MEME TOKEN FLOW ===
        const preparePayload = {
          name: formData.name,
          symbol: formData.symbol,
          description: formData.description,
          imageUrl: imageUrl,
          initialBuy: formData.initialBuy,
          creator: publicKey.toBase58(),
          pageStyle: formData.pageStyle,
          selectedPageId: formData.selectedPageId,
          feeTier: formData.feeTier,
          graceMode: formData.graceMode,
          website: formData.website ? normalizeUrl(formData.website) : '',
          twitter: formData.twitter ? normalizeUrl(formData.twitter) : '',
          telegram: formData.telegram ? normalizeUrl(formData.telegram) : '',
        };

        const prepareResponse = await fetch('/api/token/prepare', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(preparePayload),
        });

        if (!prepareResponse.ok) {
          const error = await prepareResponse.json();
          throw new Error(error.message || 'Failed to prepare token creation');
        }

        const { data: prepareData } = await prepareResponse.json();
        const { serializedTx, mintPubkey } = prepareData;

        // Store mintPubkey for potential cleanup if user rejects
        allocatedMintPubkey = mintPubkey;

        // Step 2: User signs transaction (with 30s timeout)
        toast.info('Please sign the transaction in your wallet');

        const transaction = Transaction.from(Buffer.from(serializedTx, 'base64'));

        // Race between user signing and 30s timeout
        let signedTx: Transaction;
        try {
          signedTx = await Promise.race([
            signTransaction(transaction),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('SIGNING_TIMEOUT')), 30000)
            ),
          ]);
        } catch (signError: any) {
          // Handle user rejection or other signing errors
          const errorMessage = signError?.message || signError?.toString() || '';
          const errorName = signError?.name || '';
          const errorCode = signError?.code;

          // Check various forms of user rejection
          const isRejected =
            errorMessage.includes('User rejected') ||
            errorMessage.includes('rejected') ||
            errorMessage.includes('User cancelled') ||
            errorMessage.includes('cancelled') ||
            (errorName.includes('WalletSignTransactionError') && errorMessage.includes('rejected')) ||
            errorCode === 4001 || // Wallet error code for user rejection
            errorCode === 4000; // Alternative wallet error code

          if (isRejected) {
            // Release the allocated keypair back to the pool
            if (allocatedMintPubkey) {
              await releaseKeypair(allocatedMintPubkey, session.access_token);
            }

            toast.error('Transaction cancelled', {
              description: 'You cancelled the transaction in your wallet.',
              duration: 3000,
            });
            setLoading(false); // Make sure to reset loading state
            return; // Exit early, don't show generic error
          }
          throw signError; // Re-throw other errors
        }

        // Serialize signed transaction
        const signedTxBase64 = signedTx.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        }).toString('base64');

        // Step 3: Submit to backend for final signing and submission
        const submitResponse = await fetch('/api/token/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            signedTx: signedTxBase64,
            mintPubkey,
            userWallet: publicKey.toBase58(),
            pageStyle: formData.pageStyle,
            selectedPageId: formData.selectedPageId,
          }),
        });

        if (!submitResponse.ok) {
          const error = await submitResponse.json();

          // Handle blockhash expiration with retry prompt
          if (error.error === 'BLOCKHASH_EXPIRED' || error.error === 'KEYPAIR_EXPIRED') {
            toast.error(error.message, {
              description: 'Please try again',
              duration: 5000,
            });
            return;
          }

          throw new Error(error.message || 'Failed to submit token creation');
        }

        const { data: submitData } = await submitResponse.json();
        mintAddress = submitData.mintAddress;
      }

      // Success!
      const tokenName = formData.name;
      const tokenSymbol = formData.symbol;
      const toastId = toast(`${tokenName} (${tokenSymbol}) created!`, {
        duration: 10000,
        description: (
          <div style={{ textAlign: 'center', width: '100%' }}>
            <button
              onClick={() => {
                toast.dismiss(toastId);
                router.push(`/token/${mintAddress}`);
              }}
              className="mt-1 text-sm cursor-pointer text-primary hover:underline"
            >
              Go to token page <ExternalLink className="inline w-3 h-3 ml-1" />
            </button>
          </div>
        ),
      });

      // Reset form
      // Clean up object URL if it exists
      if (imagePreview && imagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview);
      }
      setSelectedImageFile(null);
      setImagePreview(null);
      setFormData({
        name: '',
        symbol: '',
        description: '',
        imageUrl: '',
        website: '',
        twitter: '',
        telegram: '',
        initialBuy: undefined,
        initialBuyDisplay: '',
        pageStyle: 'default',
        selectedPageId: undefined,
        feeTier: FeeTier.FEE_1,
        graceMode: false,
        roadmap: [],
        vesting: { ...DEFAULT_VESTING_CONFIG },
      });
      setCurrentStep('token-project');
    } catch (error: any) {
      // Check if still mounted before showing errors
      if (!isMounted) return;
      console.error('❌ Token creation error:', error);

      // Check for various rejection/cancellation messages
      const errorMessage = error?.message || error?.toString() || '';
      const errorName = error?.name || '';
      const errorCode = error?.code;

      const isRejected =
        errorMessage.includes('User rejected') ||
        errorMessage.includes('rejected') ||
        errorMessage.includes('User cancelled') ||
        errorMessage.includes('cancelled') ||
        errorName.includes('WalletSignTransactionError') && errorMessage.includes('rejected') ||
        errorCode === 4001 || // Wallet error code for user rejection
        errorCode === 4000; // Alternative wallet error code

      if (error.message === 'SIGNING_TIMEOUT') {
        // Release the keypair since the signing timed out
        if (allocatedMintPubkey) {
          await releaseKeypair(allocatedMintPubkey);
        }

        toast.error('Signing timeout', {
          description: 'Please sign within 30 seconds. Try again.',
          duration: 5000,
        });
      } else if (isRejected) {
        // User rejection is already handled above, but catch any that slip through
        // Release the keypair if not already released
        if (allocatedMintPubkey) {
          await releaseKeypair(allocatedMintPubkey);
        }

        toast.error('Transaction cancelled', {
          description: 'You cancelled the transaction in your wallet.',
          duration: 3000,
        });
      } else {
        // For other errors that happened before transaction submission, release the keypair
        // (If transaction was already submitted, the backend will handle marking it as used)
        if (allocatedMintPubkey && !errorMessage.includes('already been processed')) {
          await releaseKeypair(allocatedMintPubkey);
        }

        toast.error('Failed to create token', {
          description: errorMessage || 'An unexpected error occurred. Please try again.',
          duration: 5000,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Milestone helper functions
  const addMilestone = () => {
    const newMilestone: RoadmapMilestone = {
      id: crypto.randomUUID(),
      title: '',
      targetDate: '',
      status: 'planned',
      description: '',
    };
    setFormData({ ...formData, roadmap: [...formData.roadmap, newMilestone] });
  };

  const updateMilestone = (id: string, field: keyof RoadmapMilestone, value: string) => {
    setFormData({
      ...formData,
      roadmap: formData.roadmap.map((m) =>
        m.id === id ? { ...m, [field]: value } : m
      ),
    });
  };

  const removeMilestone = (id: string) => {
    setFormData({
      ...formData,
      roadmap: formData.roadmap.filter((m) => m.id !== id),
    });
  };

  // Check if Step 1 is valid (for Projects wizard)
  const isStep1Valid = () => {
    return (
      formData.name.trim().length >= 3 &&
      formData.symbol.trim().length > 0 &&
      !nameError &&
      !symbolError &&
      !twitterError &&
      !telegramError &&
      !websiteError &&
      (imagePreview !== null || formData.imageUrl !== '')
    );
  };

  // Check if Step 2 is valid
  const isStep2Valid = () => {
    return (
      !!formData.category &&
      !!formData.industry &&
      !!formData.stage
    );
  };

  // Check if a specific step is completed (has valid data)
  const isStepCompleted = (stepId: ProjectWizardStep) => {
    switch (stepId) {
      case 'token-project':
        return isStep1Valid() && isStep2Valid();
      case 'roadmap':
        // Only show completed if user has added at least one milestone with a title
        return formData.roadmap.some(m => m.title.trim().length > 0);
      case 'vesting':
        // Vesting is only complete if enabled with valid configuration
        return formData.vesting.enabled && formData.vesting.vestingDuration > 0;
      case 'review':
        return false; // Review is never "completed" - it's the final action
      default:
        return false;
    }
  };

  // Get validation errors for Step 1 (Token & Project)
  const getTokenProjectErrors = (): string[] => {
    const errors: string[] = [];

    // Token info validations
    if (formData.name.trim().length < 3) errors.push('Token name must be at least 3 characters');
    if (!formData.symbol.trim()) errors.push('Token symbol is required');
    if (nameError) errors.push(nameError);
    if (symbolError) errors.push(symbolError);
    if (!imagePreview && !formData.imageUrl) errors.push('Token image is required');
    if (twitterError) errors.push(twitterError);
    if (telegramError) errors.push(telegramError);
    if (websiteError) errors.push(websiteError);

    // Project info validations (only in projects mode)
    if (createMode === 'projects') {
      if (!formData.twitter?.trim()) errors.push('Twitter/X is required for projects');
      if (!formData.website?.trim()) errors.push('Website is required for projects');
      if (!formData.category) errors.push('Category is required');
      if (!formData.industry) errors.push('Industry is required');
      if (!formData.stage) errors.push('Project stage is required');
    }

    return errors;
  };

  // Handle Next button click with validation
  const handleNextFromTokenProject = () => {
    const errors = getTokenProjectErrors();
    if (errors.length > 0) {
      errors.forEach(error => toast.error(error));
      return;
    }
    setCurrentStep('roadmap');
  };

  const handleNextFromRoadmap = () => {
    // Roadmap is optional, but if milestones exist, they must be filled in
    if (formData.roadmap.length > 0) {
      const errors: string[] = [];
      formData.roadmap.forEach((milestone, index) => {
        const milestoneNum = index + 1;
        if (!milestone.title.trim()) errors.push(`Milestone ${milestoneNum}: Title is required`);
        if (!milestone.targetDate) errors.push(`Milestone ${milestoneNum}: Target date is required`);
        if (!milestone.description.trim()) errors.push(`Milestone ${milestoneNum}: Description is required`);
      });

      if (errors.length > 0) {
        errors.forEach(error => toast.error(error));
        return;
      }
    }
    setCurrentStep('vesting');
  };

  const handleNextFromVesting = () => {
    // Vesting is optional, but if enabled, validate configuration
    if (formData.vesting.enabled) {
      const errors: string[] = [];
      if (formData.vesting.vestingDuration <= 0) errors.push('Vesting duration must be greater than 0');
      if (formData.vesting.vestingPercentage <= 0) errors.push('Vesting percentage must be greater than 0');

      if (formData.vesting.cliffEnabled) {
        const vestingInDays = toDays(formData.vesting.vestingDuration, formData.vesting.vestingDurationUnit);
        const cliffInDays = toDays(formData.vesting.cliffDuration, formData.vesting.cliffDurationUnit);
        if (cliffInDays > vestingInDays) {
          errors.push('Cliff duration cannot exceed vesting duration');
        }
      }

      if (errors.length > 0) {
        errors.forEach(error => toast.error(error));
        return;
      }
    }
    setCurrentStep('review');
  };

  return (
    <div className="min-h-screen">
        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          <div className={`mx-auto space-y-6 ${createMode === 'projects' ? 'max-w-3xl' : 'max-w-2xl'}`}>
            {/* Header */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="typo-title">Create New Token</h1>
                <div className="flex bg-muted rounded-lg p-1.5 border border-orange-500">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateMode('memes');
                      setCurrentStep('token-project');
                    }}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      createMode === 'memes'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Memes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateMode('projects');
                      setCurrentStep('token-project');
                    }}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      createMode === 'projects'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Projects
                  </button>
                </div>
              </div>
              <p className="typo-body text-muted-foreground">
                {createMode === 'memes'
                  ? 'Launch a new meme token in seconds!'
                  : 'Launch a project token with advanced features'
                }
              </p>
              {createMode === 'projects' && (
                <p className="typo-caption text-muted-foreground/70">
                  Don't leave your big project launch to chance. Launch it right, once and for all — with full control to protect against snipers, bots, and bad actors.
                </p>
              )}
            </div>

            {/* Memes Form */}
            {createMode === 'memes' && (
            <form onSubmit={handleSubmit} className="space-y-6 p-6 rounded-lg border border-border/50 bg-[#111114]">
              {/* Token Name and Symbol on same row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="name" className="typo-body">Token Name <span className="text-red-500">*</span></Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p>The display name for your token</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="name"
                    placeholder="Name"
                    value={formData.name}
                    onChange={(e) => {
                      const newName = e.target.value;
                      setFormData({ ...formData, name: newName });

                      // Validate length and reserved names
                      const trimmedName = newName.trim();
                      const trimmedSymbol = formData.symbol.trim();
                      if (trimmedName.length > 0 && trimmedName.length < 3) {
                        setNameError('Token name must be at least 3 characters long');
                        setIsNameAvailable(null);
                      } else if (RESERVED_NAMES.includes(trimmedName.toLowerCase())) {
                        setNameError('This is a reserved name and cannot be used');
                        setIsNameAvailable(false);
                      } else if (TAKEN_NAMES.includes(trimmedName.toLowerCase())) {
                        setNameError(`Token name "${trimmedName}" is already taken`);
                        setIsNameAvailable(false);
                      } else {
                        setNameError(null);
                        setIsNameAvailable(null);
                        // Only check availability if name is more than 3 characters
                        // Skip if symbol has a local error (reserved/taken)
                        const hasLocalSymbolError = RESERVED_SYMBOLS.includes(trimmedSymbol.toLowerCase()) ||
                          TAKEN_SYMBOLS.includes(trimmedSymbol.toLowerCase());
                        if (trimmedName.length > 3 && !hasLocalSymbolError) {
                          debouncedCheckName(newName, trimmedSymbol);
                        }
                      }
                    }}
                    onBlur={(e) => {
                      const trimmedName = e.target.value.trim();
                      const trimmedSymbol = formData.symbol.trim();
                      // Validate length and reserved names
                      if (trimmedName.length > 0 && trimmedName.length < 3) {
                        setNameError('Token name must be at least 3 characters long');
                        setIsNameAvailable(null);
                      } else if (RESERVED_NAMES.includes(trimmedName.toLowerCase())) {
                        setNameError('This is a reserved name and cannot be used');
                        setIsNameAvailable(false);
                      } else if (TAKEN_NAMES.includes(trimmedName.toLowerCase())) {
                        setNameError(`Token name "${trimmedName}" is already taken`);
                        setIsNameAvailable(false);
                      } else if (trimmedName.length > 3) {
                        // Skip API check if symbol has a local error (reserved/taken)
                        const hasLocalSymbolError = RESERVED_SYMBOLS.includes(trimmedSymbol.toLowerCase()) ||
                          TAKEN_SYMBOLS.includes(trimmedSymbol.toLowerCase());
                        if (!hasLocalSymbolError) {
                          // Clear any pending timeout and check immediately
                          if (checkNameTimeoutRef.current) {
                            clearTimeout(checkNameTimeoutRef.current);
                          }
                          checkTokenName(trimmedName, trimmedSymbol);
                        }
                      }
                    }}
                    minLength={3}
                    maxLength={32}
                    required
                    disabled={loading}
                    className={nameError ? 'border-red-500' : ''}
                  />
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="symbol" className="typo-body">Symbol <span className="text-red-500">*</span></Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p>The ticker symbol (e.g., BTC, ETH)</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="symbol"
                    placeholder="Symbol"
                    value={formData.symbol}
                    onChange={(e) => {
                      const newSymbol = e.target.value;
                      setFormData({
                        ...formData,
                        symbol: newSymbol,
                      });
                      // Check for reserved symbols
                      const trimmedSymbol = newSymbol.trim();
                      if (RESERVED_SYMBOLS.includes(trimmedSymbol.toLowerCase())) {
                        setSymbolError('This is a reserved symbol and cannot be used');
                      } else if (TAKEN_SYMBOLS.includes(trimmedSymbol.toLowerCase())) {
                        setSymbolError(`Symbol "${trimmedSymbol}" is already taken`);
                      } else {
                        setSymbolError(null);
                        // Re-check name and symbol combination when symbol changes
                        // But skip if name has a local error (reserved/taken)
                        const trimmedName = formData.name.trim();
                        const hasLocalNameError = RESERVED_NAMES.includes(trimmedName.toLowerCase()) ||
                          TAKEN_NAMES.includes(trimmedName.toLowerCase());
                        if (trimmedName.length > 3 && trimmedSymbol.length > 0 && !hasLocalNameError) {
                          // Clear any pending timeout and check immediately
                          if (checkNameTimeoutRef.current) {
                            clearTimeout(checkNameTimeoutRef.current);
                          }
                          debouncedCheckName(trimmedName, trimmedSymbol);
                        }
                      }
                    }}
                    onBlur={(e) => {
                      const trimmedSymbol = e.target.value.trim();
                      if (RESERVED_SYMBOLS.includes(trimmedSymbol.toLowerCase())) {
                        setSymbolError('This is a reserved symbol and cannot be used');
                      } else if (TAKEN_SYMBOLS.includes(trimmedSymbol.toLowerCase())) {
                        setSymbolError(`Symbol "${trimmedSymbol}" is already taken`);
                      } else {
                        setSymbolError(null);
                        // Skip API check if name has a local error (reserved/taken)
                        const trimmedName = formData.name.trim();
                        const hasLocalNameError = RESERVED_NAMES.includes(trimmedName.toLowerCase()) ||
                          TAKEN_NAMES.includes(trimmedName.toLowerCase());
                        if (trimmedName.length > 3 && trimmedSymbol.length > 0 && !hasLocalNameError) {
                          // Clear any pending timeout and check immediately
                          if (checkNameTimeoutRef.current) {
                            clearTimeout(checkNameTimeoutRef.current);
                          }
                          checkTokenName(trimmedName, trimmedSymbol);
                        }
                      }
                    }}
                    maxLength={10}
                    required
                    disabled={loading}
                    className={symbolError ? 'border-red-500' : ''}
                  />
                </div>
              </div>

              {/* Name/Symbol validation messages - displayed together on same line when both have errors */}
              {(nameError || symbolError) && (
                <p className="typo-caption text-red-500 -mt-4 text-center">
                  {nameError && symbolError
                    ? 'This name and symbol are reserved and cannot be used'
                    : nameError || symbolError}
                </p>
              )}
              {formData.name.trim().length > 0 && formData.name.trim().length < 3 && !nameError && isNameAvailable === null && (
                <p className="typo-caption text-muted-foreground -mt-4">Token name must be at least 3 characters long</p>
              )}

              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="description" className="typo-body">Description</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p>A brief description of your token in a sentence or two</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Textarea
                  id="description"
                  placeholder="Describe your token..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  maxLength={1000}
                  rows={4}
                  disabled={loading}
                />
              </div>

              {/* X/Twitter first */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="twitter" className="typo-body">X/Twitter</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p>Link to your X/Twitter profile or community page</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="twitter"
                  type="text"
                  placeholder="https://x.com/..."
                  value={formData.twitter}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({ ...formData, twitter: value });
                    // Allow with or without https://
                    if (value && !value.match(/^(https?:\/\/)?(x\.com|twitter\.com)\//i)) {
                      setTwitterError('Must be a valid X/Twitter URL (x.com/... or twitter.com/...)');
                    } else {
                      setTwitterError(null);
                    }
                  }}
                  disabled={loading}
                  className={twitterError ? 'border-red-500' : ''}
                />
                {twitterError && (
                  <p className="typo-caption text-red-500">{twitterError}</p>
                )}
              </div>

              {/* Website and Telegram on same row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="website" className="typo-body">Website</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p>Your token's official website</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="website"
                    type="text"
                    placeholder="https://example.com"
                    value={formData.website}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFormData({ ...formData, website: value });
                      // Validate: allow empty, or valid domain (with or without https://)
                      // Must have at least sld.tld format (e.g., example.com)
                      if (value && !value.match(/^(https?:\/\/)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+/i)) {
                        setWebsiteError('Must be a valid website (e.g., example.com)');
                      } else {
                        setWebsiteError(null);
                      }
                    }}
                    disabled={loading}
                    className={websiteError ? 'border-red-500' : ''}
                  />
                  {websiteError && (
                    <p className="typo-caption text-red-500">{websiteError}</p>
                  )}
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="telegram" className="typo-body">Telegram</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p>Link to your Telegram channel or group</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="telegram"
                    type="text"
                    placeholder="https://t.me/..."
                    value={formData.telegram}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFormData({ ...formData, telegram: value });
                      // Allow with or without https://
                      if (value && !value.match(/^(https?:\/\/)?(t\.me|telegram\.me)\//i)) {
                        setTelegramError('Must be a valid Telegram URL (t.me/...)');
                      } else {
                        setTelegramError(null);
                      }
                    }}
                    disabled={loading}
                    className={telegramError ? 'border-red-500' : ''}
                  />
                  {telegramError && (
                    <p className="typo-caption text-red-500">{telegramError}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="imageUrl" className="typo-body">Token Image <span className="text-red-500">*</span></Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p>A clear, recognizable image for your token</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Image Preview */}
                {imagePreview && (
                  <div className="flex justify-center">
                    <div className="relative w-48 h-48">
                      <div className="w-full h-full rounded-lg border border-border bg-[#111114] overflow-hidden">
                        <img
                          src={imagePreview}
                          alt="Token preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"
                        disabled={loading || isUploadingImage}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Upload Area */}
                {!imagePreview && (
                  <div
                    className={`border border-dashed rounded-lg p-6 text-center transition-colors ${
                      isDraggingImage ? 'border-primary bg-primary/10' : 'border-border hover:border-primary'
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                      id="imageUpload"
                      disabled={loading || isUploadingImage}
                    />
                    <label
                      htmlFor="imageUpload"
                      className="cursor-pointer flex flex-col items-center gap-2"
                    >
                      {isUploadingImage ? (
                        <>
                          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                          <p className="typo-caption text-muted-foreground">Uploading...</p>
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                            <Upload className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="typo-body">
                              {isDraggingImage ? 'Drop image here' : 'Drag & drop or click to upload'}
                            </p>
                            <p className="typo-caption text-muted-foreground mt-1">
                              PNG, JPG, GIF, or WebP (max 3MB)
                            </p>
                          </div>
                        </>
                      )}
                    </label>
                  </div>
                )}
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="initialBuy" className="typo-body">Initial Buy (SOL)</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p>SOL amount to buy your own token at launch (purchased in the same transaction)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
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
                  <div className="flex items-center gap-2">
                    <Label className="typo-body">Creator Fee</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p>Percentage of trading fees you earn as the creator. Claim rewards from your profile.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Badge className="font-mono typo-caption !font-semibold">
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
                <div className="relative w-full h-4 typo-caption text-muted-foreground">
                  <span className="absolute left-0">0.25%</span>
                  <span className="absolute left-[20%] -translate-x-1/2">1%</span>
                  <span className="absolute left-[40%] -translate-x-1/2">2%</span>
                  <span className="absolute left-[60%] -translate-x-1/2">3%</span>
                  <span className="absolute left-[80%] -translate-x-1/2">4%</span>
                  <span className="absolute right-0">5%</span>
                </div>
              </div>

              {/* Grace Mode Toggle */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="graceMode" className="typo-body">Grace Period (Sniper Penalty)</Label>
                      <Shield className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="typo-caption text-muted-foreground">
                      Deter snipers with high fees for 20 seconds, starts at 50% decreasing to {formatFeeTier(formData.feeTier)}
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
                  <div className="rounded-lg bg-[#111114] p-3 space-y-1">
                    <p className="typo-body">Grace Period Active:</p>
                    <ul className="list-disc list-inside space-y-0.5 typo-caption text-muted-foreground">
                      <li>Starts at 50% fee</li>
                      <li>Decreases exponentially over 20 seconds</li>
                      <li>Ends at {formatFeeTier(formData.feeTier)} fee</li>
                      <li>Fees apply to all buyers during this period*</li>
                      <li>Regular fees resume thereafter</li>
                    </ul>
                  </div>
                )}

                {/* Safe Mode - Coming Soon */}
                <div className="flex items-center justify-between opacity-50">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="safeMode" className="typo-body">Safe Mode (Bundle Deterrent)</Label>
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">Coming Soon</span>
                    </div>
                    <p className="typo-caption text-muted-foreground">
                      Deter bundled transactions to encourage fair token distribution
                    </p>
                  </div>
                  <Switch
                    id="safeMode"
                    checked={false}
                    disabled={true}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label className="typo-body">Token Page Style</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p>Custom page displayed when users view your token on the platform</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Predefined Styles */}
                <div>
                  <p className="typo-caption text-muted-foreground mb-2">Predefined Styles</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {TOKEN_PAGE_STYLES.filter(style => style.id === 'default').map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, pageStyle: style.id, selectedPageId: undefined })}
                        disabled={loading}
                        className={`
                          relative p-4 rounded-lg border transition-all
                          ${formData.pageStyle === style.id && !formData.selectedPageId
                            ? 'border-primary'
                            : 'border-border hover:border-primary'
                          }
                          ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                        style={{
                          backgroundColor: style.backgroundColor,
                        }}
                      >
                        <div className="space-y-2">
                          <div
                            className="h-16 rounded-md"
                            style={{
                              backgroundColor: style.panelBackgroundColor,
                              border: `1px solid ${style.accentColor}40`,
                            }}
                          >
                            <div
                              className="h-full flex items-center justify-center typo-caption"
                              style={{ color: style.textColor }}
                            >
                              Panel
                            </div>
                          </div>
                          <div className="typo-caption text-center" style={{ color: style.textColor }}>
                            {style.name}
                          </div>
                        </div>
                        {formData.pageStyle === style.id && !formData.selectedPageId && (
                          <div className="absolute top-2 right-2">
                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                              <svg
                                className="w-3 h-3 text-primary-foreground"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path d="M5 13l4 4L19 7"></path>
                              </svg>
                            </div>
                          </div>
                        )}
                      </button>
                    ))}

                    {/* Coming Soon Panel */}
                    <div className="relative p-4 rounded-lg border border-dashed border-border/50 bg-muted/20 opacity-50 cursor-not-allowed">
                      <div className="space-y-2">
                        <div className="h-16 rounded-md bg-muted/30 border border-border/30 flex items-center justify-center">
                          <span className="typo-caption text-muted-foreground">Coming Soon</span>
                        </div>
                        <div className="typo-caption text-center text-muted-foreground">
                          More Styles
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="typo-caption text-muted-foreground mt-2">
                    You can fully customize your token page after creation from the token page itself.
                  </p>
                </div>

              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => router.push('/')}
                  disabled={loading}
                  className="flex-1 typo-button"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1 typo-button bg-primary hover:bg-primary/80 text-primary-foreground"
                >
                  {loading ? 'Creating...' : 'Create Token'}
                </Button>
              </div>

              <p className="typo-caption text-muted-foreground text-center">
                Note: You cannot change the token's metadata after the token is created.
              </p>

              {loading && (
                <p className="typo-caption text-muted-foreground text-center">
                  Please sign the transaction in your wallet within 30 seconds...
                </p>
              )}

              {!publicKey && (
                <p className="typo-caption text-muted-foreground text-center">
                  Please connect your wallet to create a token.
                </p>
              )}
            </form>
            )}

            {/* Projects Form - Multi-step Wizard */}
            {createMode === 'projects' && (
            <div className="space-y-6">
              {/* Step Progress Indicator */}
              <div className="flex items-center justify-between p-3 sm:p-4 rounded-lg border border-border/50 bg-[#111114]">
                {PROJECT_WIZARD_STEPS.map((step, index) => {
                  const isActive = step.id === currentStep;
                  const isCompleted = isStepCompleted(step.id);
                  const isLast = index === PROJECT_WIZARD_STEPS.length - 1;
                  // Show green only when completed AND not currently active
                  const showGreen = isCompleted && !isActive;
                  return (
                    <div key={step.id} className="contents">
                      {/* Step Button */}
                      <button
                        type="button"
                        onClick={() => setCurrentStep(step.id)}
                        className="flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0"
                      >
                        {/* Circle */}
                        <div className={`size-7 sm:size-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors border-2 bg-transparent shrink-0 ${
                          isActive
                            ? 'border-primary text-primary'
                            : showGreen
                              ? 'border-green-500 text-green-500'
                              : 'border-muted-foreground/50 text-muted-foreground'
                        }`}>
                          {showGreen ? <Check className="size-3.5 sm:size-4" /> : index + 1}
                        </div>
                        {/* Text - hidden on mobile, visible on sm+ */}
                        <span className={`hidden sm:inline text-sm font-medium whitespace-nowrap ${
                          isActive
                            ? 'text-foreground'
                            : showGreen
                              ? 'text-green-500'
                              : 'text-muted-foreground'
                        }`}>
                          {step.title}
                        </span>
                      </button>
                      {/* Line between steps - equal width */}
                      {!isLast && (
                        <div className={`flex-1 h-0.5 mx-2 sm:mx-4 ${
                          showGreen ? 'bg-green-500' : 'bg-muted'
                        }`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Step 1: Token & Project */}
              {currentStep === 'token-project' && (
              <div className="space-y-5 sm:space-y-6 p-4 sm:p-6 rounded-lg border border-border/50 bg-[#111114]">
                {/* Project Token Information Section */}
                <div className="space-y-1">
                  <h2 className="typo-subtitle">Project Token Information</h2>
                  <p className="typo-caption text-muted-foreground">Basic details about your project token</p>
                </div>

                {/* Token Name and Symbol */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="project-name" className="typo-body">Token Name <span className="text-red-500">*</span></Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p>The display name for your token</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="project-name"
                      placeholder="Name"
                      value={formData.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setFormData({ ...formData, name: newName });
                        const trimmedName = newName.trim();
                        const trimmedSymbol = formData.symbol.trim();
                        if (trimmedName.length > 0 && trimmedName.length < 3) {
                          setNameError('Token name must be at least 3 characters long');
                          setIsNameAvailable(null);
                        } else if (RESERVED_NAMES.includes(trimmedName.toLowerCase())) {
                          setNameError('This is a reserved name and cannot be used');
                          setIsNameAvailable(false);
                        } else if (TAKEN_NAMES.includes(trimmedName.toLowerCase())) {
                          setNameError(`Token name "${trimmedName}" is already taken`);
                          setIsNameAvailable(false);
                        } else {
                          setNameError(null);
                          setIsNameAvailable(null);
                          // Skip API check if symbol has a local error (reserved/taken)
                          const hasLocalSymbolError = RESERVED_SYMBOLS.includes(trimmedSymbol.toLowerCase()) ||
                            TAKEN_SYMBOLS.includes(trimmedSymbol.toLowerCase());
                          if (trimmedName.length > 3 && !hasLocalSymbolError) {
                            debouncedCheckName(newName, trimmedSymbol);
                          }
                        }
                      }}
                      minLength={3}
                      maxLength={32}
                      required
                      disabled={loading}
                      className={nameError ? 'border-red-500' : ''}
                    />
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="project-symbol" className="typo-body">Symbol <span className="text-red-500">*</span></Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p>The ticker symbol (e.g., BTC, ETH)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      id="project-symbol"
                      placeholder="Symbol"
                      value={formData.symbol}
                      onChange={(e) => {
                        const newSymbol = e.target.value;
                        setFormData({ ...formData, symbol: newSymbol });
                        const trimmedSymbol = newSymbol.trim();
                        if (RESERVED_SYMBOLS.includes(trimmedSymbol.toLowerCase())) {
                          setSymbolError('This is a reserved symbol and cannot be used');
                        } else if (TAKEN_SYMBOLS.includes(trimmedSymbol.toLowerCase())) {
                          setSymbolError(`Symbol "${trimmedSymbol}" is already taken`);
                        } else {
                          setSymbolError(null);
                          // Skip API check if name has a local error (reserved/taken)
                          const trimmedName = formData.name.trim();
                          const hasLocalNameError = RESERVED_NAMES.includes(trimmedName.toLowerCase()) ||
                            TAKEN_NAMES.includes(trimmedName.toLowerCase());
                          if (trimmedName.length > 3 && trimmedSymbol.length > 0 && !hasLocalNameError) {
                            debouncedCheckName(trimmedName, trimmedSymbol);
                          }
                        }
                      }}
                      maxLength={10}
                      required
                      disabled={loading}
                      className={symbolError ? 'border-red-500' : ''}
                    />
                  </div>
                </div>

                {/* Validation messages - displayed together on same line when both have errors */}
                {(nameError || symbolError) && (
                  <p className="typo-caption text-red-500 text-center">
                    {nameError && symbolError
                      ? 'This name and symbol are reserved and cannot be used'
                      : nameError || symbolError}
                  </p>
                )}

                {/* Description */}
                <div className="space-y-2.5">
                  <Label htmlFor="project-description" className="typo-body">Description</Label>
                  <Textarea
                    id="project-description"
                    placeholder="Describe your project..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    maxLength={1000}
                    rows={3}
                    disabled={loading}
                  />
                </div>

                {/* Token Image */}
                <div className="space-y-2.5">
                  <Label className="typo-body">Token Image <span className="text-red-500">*</span></Label>
                  {imagePreview ? (
                    <div className="flex justify-center">
                      <div className="relative w-32 h-32">
                        <div className="w-full h-full rounded-lg border border-border bg-[#111114] overflow-hidden">
                          <img src={imagePreview} alt="Token preview" className="w-full h-full object-cover" />
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"
                          disabled={loading || isUploadingImage}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`border border-dashed rounded-lg p-4 text-center transition-colors ${
                        isDraggingImage ? 'border-primary bg-primary/10' : 'border-border hover:border-primary'
                      }`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                        onChange={handleFileChange}
                        className="hidden"
                        id="project-imageUpload"
                        disabled={loading || isUploadingImage}
                      />
                      <label htmlFor="project-imageUpload" className="cursor-pointer flex flex-col items-center gap-2">
                        {isUploadingImage ? (
                          <>
                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                            <p className="typo-caption text-muted-foreground">Uploading...</p>
                          </>
                        ) : (
                          <>
                            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                              <Upload className="w-4 h-4 text-primary" />
                            </div>
                            <p className="typo-caption">{isDraggingImage ? 'Drop image here' : 'Drag & drop or click to upload'}</p>
                            <p className="typo-caption text-muted-foreground">PNG, JPG, GIF, or WebP (max 3MB)</p>
                          </>
                        )}
                      </label>
                    </div>
                  )}
                </div>

                {/* Category, Industry and Stage */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2.5">
                      <Label className="typo-body">Category <span className="text-red-500">*</span></Label>
                      <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                        <SelectTrigger className="w-full cursor-pointer">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent className="bg-background border-border/50">
                          {PROJECT_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value} className="cursor-pointer focus:bg-muted">
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2.5">
                      <Label className="typo-body">Industry <span className="text-red-500">*</span></Label>
                      <Select value={formData.industry} onValueChange={(value) => setFormData({ ...formData, industry: value })}>
                        <SelectTrigger className="w-full cursor-pointer">
                          <SelectValue placeholder="Select industry" />
                        </SelectTrigger>
                        <SelectContent className="bg-background border-border/50">
                          {PROJECT_INDUSTRIES.map((ind) => (
                            <SelectItem key={ind.value} value={ind.value} className="cursor-pointer focus:bg-muted">
                              {ind.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2.5">
                      <Label className="typo-body">Stage <span className="text-red-500">*</span></Label>
                      <Select value={formData.stage} onValueChange={(value) => setFormData({ ...formData, stage: value })}>
                        <SelectTrigger className="w-full cursor-pointer">
                          <SelectValue placeholder="Select stage" />
                        </SelectTrigger>
                        <SelectContent className="bg-background border-border/50">
                          {PROJECT_STAGES.map((stage) => (
                            <SelectItem key={stage.value} value={stage.value} className="cursor-pointer focus:bg-muted">
                              {stage.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Socials */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                    <div className="space-y-2.5">
                      <Label htmlFor="project-twitter" className="typo-body">X/Twitter <span className="text-red-500">*</span></Label>
                      <Input
                        id="project-twitter"
                        placeholder="https://x.com/..."
                        value={formData.twitter}
                        onChange={(e) => {
                          const value = e.target.value;
                          setFormData({ ...formData, twitter: value });
                          if (value && !value.match(/^(https?:\/\/)?(x\.com|twitter\.com)\//i)) {
                            setTwitterError('Must be a valid X/Twitter URL');
                          } else {
                            setTwitterError(null);
                          }
                        }}
                        disabled={loading}
                        className={twitterError ? 'border-red-500' : ''}
                      />
                      {twitterError && <p className="typo-caption text-red-500">{twitterError}</p>}
                    </div>

                    <div className="space-y-2.5">
                      <Label htmlFor="project-website" className="typo-body">Website <span className="text-red-500">*</span></Label>
                      <Input
                        id="project-website"
                        placeholder="https://example.com"
                        value={formData.website}
                        onChange={(e) => {
                          const value = e.target.value;
                          setFormData({ ...formData, website: value });
                          if (value && !value.match(/^(https?:\/\/)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+/i)) {
                            setWebsiteError('Must be a valid website');
                          } else {
                            setWebsiteError(null);
                          }
                        }}
                        disabled={loading}
                        className={websiteError ? 'border-red-500' : ''}
                      />
                      {websiteError && <p className="typo-caption text-red-500">{websiteError}</p>}
                    </div>

                    <div className="space-y-2.5">
                      <Label htmlFor="project-telegram" className="typo-body">Telegram</Label>
                      <Input
                        id="project-telegram"
                        placeholder="https://t.me/..."
                        value={formData.telegram}
                        onChange={(e) => {
                          const value = e.target.value;
                          setFormData({ ...formData, telegram: value });
                          if (value && !value.match(/^(https?:\/\/)?(t\.me|telegram\.me)\//i)) {
                            setTelegramError('Must be a valid Telegram URL');
                          } else {
                            setTelegramError(null);
                          }
                        }}
                        disabled={loading}
                        className={telegramError ? 'border-red-500' : ''}
                      />
                      {telegramError && <p className="typo-caption text-red-500">{telegramError}</p>}
                    </div>
                  </div>

                {/* Navigation */}
                <div className="flex gap-2 sm:gap-3 pt-4">
                  <Button type="button" variant="ghost" onClick={() => router.push('/')} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleNextFromTokenProject}
                    className="flex-1 bg-primary hover:bg-primary/80"
                  >
                    <span className="sm:hidden">Next</span>
                    <span className="hidden sm:inline">Next: Roadmap</span>
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
              )}

              {/* Step 2: Roadmap */}
              {currentStep === 'roadmap' && (
              <div className="space-y-5 sm:space-y-6 p-4 sm:p-6 rounded-lg border border-border/50 bg-[#111114]">
                <div className="space-y-1">
                  <h2 className="typo-subtitle">Roadmap</h2>
                  <p className="typo-caption text-muted-foreground">Add milestones for your project (optional)</p>
                </div>

                {/* Milestones */}
                <div className="space-y-3 sm:space-y-4">
                  {formData.roadmap.map((milestone, index) => (
                    <div key={milestone.id} className="p-3 sm:p-4 rounded-lg border border-border/50 bg-background space-y-3 sm:space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Milestone {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeMilestone(milestone.id)}
                          className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="typo-caption">Title <span className="text-red-500">*</span></Label>
                          <Input
                            placeholder="e.g., Token Launch"
                            value={milestone.title}
                            onChange={(e) => updateMilestone(milestone.id, 'title', e.target.value)}
                            maxLength={100}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="typo-caption">Target Date <span className="text-red-500">*</span></Label>
                          <Input
                            placeholder="e.g., Q1 2025, March 2025"
                            value={milestone.targetDate}
                            onChange={(e) => updateMilestone(milestone.id, 'targetDate', e.target.value)}
                            maxLength={50}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="typo-caption">Status</Label>
                        <Select
                          value={milestone.status}
                          onValueChange={(value) => updateMilestone(milestone.id, 'status', value)}
                        >
                          <SelectTrigger className="w-full cursor-pointer">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-background border-border/50">
                            {MILESTONE_STATUSES.map((status) => (
                              <SelectItem key={status.value} value={status.value} className="cursor-pointer focus:bg-muted">
                                {status.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="typo-caption">Description</Label>
                        <Textarea
                          placeholder="What will be achieved?"
                          value={milestone.description}
                          onChange={(e) => updateMilestone(milestone.id, 'description', e.target.value)}
                          maxLength={500}
                          rows={2}
                        />
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={addMilestone}
                    className="w-full h-12 !border !border-primary !bg-transparent"
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Milestone
                  </Button>
                </div>

                {/* Navigation */}
                <div className="flex gap-2 sm:gap-3 pt-4">
                  <Button type="button" variant="ghost" onClick={() => setCurrentStep('token-project')} className="flex-1">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                  <Button
                    type="button"
                    onClick={handleNextFromRoadmap}
                    className="flex-1 bg-primary hover:bg-primary/80"
                  >
                    <span className="sm:hidden">Next</span>
                    <span className="hidden sm:inline">Next: Vesting</span>
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
              )}

              {/* Step 3: Vesting */}
              {currentStep === 'vesting' && (
              <div className="space-y-5 sm:space-y-6 p-4 sm:p-6 rounded-lg border border-border/50 bg-[#111114]">
                <div className="space-y-1">
                  <h2 className="typo-subtitle">Vesting Schedule</h2>
                  <p className="typo-caption text-muted-foreground">Configure token vesting for your project (optional)</p>
                </div>

                {/* Enable Vesting Toggle */}
                <div className="flex items-center justify-between p-3 sm:p-4 rounded-lg bg-background border border-border/50">
                  <div className="space-y-0.5">
                    <Label className="typo-body">Enable Vesting</Label>
                    <p className="typo-caption text-muted-foreground">
                      Lock a portion of tokens that unlock over time
                    </p>
                  </div>
                  <Switch
                    checked={formData.vesting.enabled}
                    onCheckedChange={(checked) => setFormData({
                      ...formData,
                      vesting: { ...formData.vesting, enabled: checked }
                    })}
                    disabled={loading}
                  />
                </div>

                {/* Vesting Configuration - Only show if enabled */}
                {formData.vesting.enabled && (
                <div className="space-y-5 sm:space-y-6">
                  {/* Vesting Amount */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Label className="typo-body">Vesting Amount <span className="text-red-500">*</span></Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p>Percentage of total token supply to vest</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-3">
                      <Slider
                        min={1}
                        max={100}
                        step={1}
                        value={[formData.vesting.vestingPercentage]}
                        onValueChange={([value]) => setFormData({
                          ...formData,
                          vesting: { ...formData.vesting, vestingPercentage: value }
                        })}
                        disabled={loading}
                        className="flex-1"
                      />
                      <Badge className="font-mono typo-caption !font-semibold min-w-[4rem] justify-center">
                        {formData.vesting.vestingPercentage}%
                      </Badge>
                    </div>
                  </div>

                  {/* Vesting Duration */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Label className="typo-body">Vesting Duration <span className="text-red-500">*</span></Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p>Total time over which tokens will vest</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex gap-3">
                      <Input
                        type="number"
                        min={1}
                        value={formData.vesting.vestingDuration}
                        onChange={(e) => setFormData({
                          ...formData,
                          vesting: { ...formData.vesting, vestingDuration: parseInt(e.target.value) || 0 }
                        })}
                        disabled={loading}
                        className="flex-1"
                      />
                      <Select
                        value={formData.vesting.vestingDurationUnit}
                        onValueChange={(value: 'days' | 'weeks' | 'months') => setFormData({
                          ...formData,
                          vesting: { ...formData.vesting, vestingDurationUnit: value }
                        })}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background border-border/50">
                          {DURATION_UNITS.map((unit) => (
                            <SelectItem key={unit.value} value={unit.value} className="cursor-pointer focus:bg-muted">
                              {unit.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Unlock Schedule */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Label className="typo-body">Unlock Schedule <span className="text-red-500">*</span></Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p>How often tokens are released</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Select
                      value={formData.vesting.unlockSchedule}
                      onValueChange={(value: 'daily' | 'weekly' | 'bi-weekly' | 'monthly') => setFormData({
                        ...formData,
                        vesting: { ...formData.vesting, unlockSchedule: value }
                      })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border-border/50">
                        {UNLOCK_SCHEDULES.map((schedule) => (
                          <SelectItem key={schedule.value} value={schedule.value} className="cursor-pointer focus:bg-muted">
                            {schedule.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Cliff Configuration */}
                  <div className="space-y-3 sm:space-y-4 p-3 sm:p-4 rounded-lg bg-background border border-border/50">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Label className="typo-body">Cliff Period</Label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p>Initial period before any tokens unlock. Optionally release a portion at cliff.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <p className="typo-caption text-muted-foreground">
                          Time before first tokens unlock
                        </p>
                      </div>
                      <Switch
                        checked={formData.vesting.cliffEnabled}
                        onCheckedChange={(checked) => setFormData({
                          ...formData,
                          vesting: { ...formData.vesting, cliffEnabled: checked }
                        })}
                        disabled={loading}
                      />
                    </div>

                    {formData.vesting.cliffEnabled && (
                    <div className="space-y-3 sm:space-y-4 pt-3 sm:pt-4 border-t border-border/50">
                      {/* Cliff Duration */}
                      <div className="space-y-2">
                        <Label className="typo-caption">Cliff Duration</Label>
                        <div className="flex gap-3">
                          <Input
                            type="number"
                            min={1}
                            value={formData.vesting.cliffDuration}
                            onChange={(e) => {
                              const value = parseInt(e.target.value) || 0;
                              // Validate cliff doesn't exceed vesting duration
                              const vestingInDays = toDays(formData.vesting.vestingDuration, formData.vesting.vestingDurationUnit);
                              const cliffInDays = toDays(value, formData.vesting.cliffDurationUnit);
                              const clampedValue = cliffInDays > vestingInDays
                                ? Math.floor(vestingInDays / (formData.vesting.cliffDurationUnit === 'days' ? 1 : formData.vesting.cliffDurationUnit === 'weeks' ? 7 : 30))
                                : value;
                              setFormData({
                                ...formData,
                                vesting: { ...formData.vesting, cliffDuration: Math.max(1, clampedValue) }
                              });
                            }}
                            disabled={loading}
                            className="flex-1"
                          />
                          <Select
                            value={formData.vesting.cliffDurationUnit}
                            onValueChange={(value: 'days' | 'weeks' | 'months') => {
                              // Validate cliff doesn't exceed vesting duration with new unit
                              const vestingInDays = toDays(formData.vesting.vestingDuration, formData.vesting.vestingDurationUnit);
                              const cliffInDays = toDays(formData.vesting.cliffDuration, value);
                              const clampedDuration = cliffInDays > vestingInDays
                                ? Math.floor(vestingInDays / (value === 'days' ? 1 : value === 'weeks' ? 7 : 30))
                                : formData.vesting.cliffDuration;
                              setFormData({
                                ...formData,
                                vesting: { ...formData.vesting, cliffDurationUnit: value, cliffDuration: Math.max(1, clampedDuration) }
                              });
                            }}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-background border-border/50">
                              {DURATION_UNITS.map((unit) => (
                                <SelectItem key={unit.value} value={unit.value} className="cursor-pointer focus:bg-muted">
                                  {unit.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="typo-caption text-muted-foreground">
                          Max: {formData.vesting.vestingDuration} {formData.vesting.vestingDurationUnit}
                        </p>
                      </div>

                      {/* Cliff Unlock Amount */}
                      <div className="space-y-2">
                        <Label className="typo-caption">Cliff Unlock Amount</Label>
                        <div className="flex items-center gap-3">
                          <Slider
                            min={0}
                            max={100}
                            step={1}
                            value={[formData.vesting.cliffPercentage]}
                            onValueChange={([value]) => setFormData({
                              ...formData,
                              vesting: { ...formData.vesting, cliffPercentage: value }
                            })}
                            disabled={loading}
                            className="flex-1"
                          />
                          <Badge variant="outline" className="font-mono typo-caption min-w-[4rem] justify-center">
                            {formData.vesting.cliffPercentage}%
                          </Badge>
                        </div>
                        <p className="typo-caption text-muted-foreground">
                          Percentage of vested tokens released immediately at cliff
                        </p>
                      </div>
                    </div>
                    )}
                  </div>

                  {/* Vesting Schedule Visualization */}
                  <div className="space-y-3">
                    <Label className="typo-body">Unlock Schedule Preview</Label>
                    <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-700">
                      <div className="relative h-40">
                        {/* Y-axis labels */}
                        <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-xs text-zinc-400">
                          <span>100%</span>
                          <span>50%</span>
                          <span>0%</span>
                        </div>
                        {/* Graph area */}
                        <div
                          ref={vestingChartRef}
                          className="ml-12 h-full pb-6 relative cursor-crosshair"
                          onMouseMove={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const y = e.clientY - rect.top;
                            const chartHeight = rect.height - 24; // subtract pb-6
                            const xRatio = Math.max(0, Math.min(1, x / rect.width));

                            // Calculate vesting parameters
                            const durationInDays = formData.vesting.vestingDuration *
                              (formData.vesting.vestingDurationUnit === 'days' ? 1 :
                               formData.vesting.vestingDurationUnit === 'weeks' ? 7 : 30);
                            const periodInDays =
                              formData.vesting.unlockSchedule === 'daily' ? 1 :
                              formData.vesting.unlockSchedule === 'weekly' ? 7 :
                              formData.vesting.unlockSchedule === 'bi-weekly' ? 14 : 30;
                            const totalPeriods = Math.max(1, Math.ceil(durationInDays / periodInDays));

                            const cliffDurationInDays = formData.vesting.cliffEnabled
                              ? formData.vesting.cliffDuration * (formData.vesting.cliffDurationUnit === 'days' ? 1 : formData.vesting.cliffDurationUnit === 'weeks' ? 7 : 30)
                              : 0;
                            const cliffRatio = cliffDurationInDays / durationInDays;
                            const cliffUnlock = formData.vesting.cliffEnabled ? formData.vesting.cliffPercentage : 0;
                            const currentDayInVesting = xRatio * durationInDays;

                            // Calculate which step we're on and snap to it
                            let unlockedPercent = 0;
                            let snappedXRatio = 0;

                            if (currentDayInVesting < cliffDurationInDays) {
                              // Before cliff - snap to start
                              unlockedPercent = 0;
                              snappedXRatio = 0;
                            } else if (formData.vesting.cliffEnabled && currentDayInVesting < cliffDurationInDays + 0.01 * durationInDays) {
                              // At cliff
                              unlockedPercent = cliffUnlock;
                              snappedXRatio = cliffRatio;
                            } else {
                              // After cliff - calculate step
                              const remainingUnlock = 100 - cliffUnlock;
                              const remainingDays = durationInDays - cliffDurationInDays;
                              const stepsAfterCliff = Math.max(1, Math.ceil(totalPeriods * (1 - cliffRatio)));
                              const effectiveDay = currentDayInVesting - cliffDurationInDays;
                              const stepDuration = remainingDays / stepsAfterCliff;
                              const currentStep = Math.min(stepsAfterCliff, Math.floor(effectiveDay / stepDuration) + 1);

                              unlockedPercent = cliffUnlock + (currentStep / stepsAfterCliff) * remainingUnlock;
                              snappedXRatio = cliffRatio + (currentStep / stepsAfterCliff) * (1 - cliffRatio);
                            }

                            // Calculate snapped positions in pixels
                            const snappedX = snappedXRatio * rect.width;
                            const snappedY = (1 - unlockedPercent / 100) * chartHeight;

                            // Calculate time string for the snapped position
                            const snappedTimeValue = snappedXRatio * formData.vesting.vestingDuration;
                            const timeStr = snappedTimeValue === 0
                              ? 'Now'
                              : snappedTimeValue < 1
                                ? `${Math.round(snappedTimeValue * (formData.vesting.vestingDurationUnit === 'days' ? 24 : formData.vesting.vestingDurationUnit === 'weeks' ? 7 : 30))} ${formData.vesting.vestingDurationUnit === 'days' ? 'hours' : 'days'}`
                                : `${snappedTimeValue.toFixed(1)} ${formData.vesting.vestingDurationUnit}`;

                            setVestingHover({ x, y, snappedX, snappedY, time: timeStr, percent: Math.round(unlockedPercent) });
                          }}
                          onMouseLeave={() => setVestingHover(null)}
                        >
                          <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                            {/* Grid lines */}
                            <line x1="0" y1="25" x2="300" y2="25" stroke="#52525b" strokeOpacity="0.5" />
                            <line x1="0" y1="50" x2="300" y2="50" stroke="#52525b" strokeOpacity="0.5" />
                            <line x1="0" y1="75" x2="300" y2="75" stroke="#52525b" strokeOpacity="0.5" />

                            {/* Stepped vesting curve */}
                            {(() => {
                              // Calculate number of unlock periods based on schedule
                              const getPeriodsCount = () => {
                                const durationInDays = formData.vesting.vestingDuration *
                                  (formData.vesting.vestingDurationUnit === 'days' ? 1 :
                                   formData.vesting.vestingDurationUnit === 'weeks' ? 7 : 30);
                                const periodInDays =
                                  formData.vesting.unlockSchedule === 'daily' ? 1 :
                                  formData.vesting.unlockSchedule === 'weekly' ? 7 :
                                  formData.vesting.unlockSchedule === 'bi-weekly' ? 14 : 30;
                                return Math.max(1, Math.ceil(durationInDays / periodInDays));
                              };

                              const periods = getPeriodsCount();
                              const graphWidth = 300;

                              // Calculate cliff position
                              const cliffRatio = formData.vesting.cliffEnabled
                                ? (formData.vesting.cliffDuration *
                                    (formData.vesting.cliffDurationUnit === 'days' ? 1 :
                                     formData.vesting.cliffDurationUnit === 'weeks' ? 7 : 30)) /
                                  (formData.vesting.vestingDuration *
                                    (formData.vesting.vestingDurationUnit === 'days' ? 1 :
                                     formData.vesting.vestingDurationUnit === 'weeks' ? 7 : 30))
                                : 0;
                              const cliffX = cliffRatio * graphWidth;
                              const cliffUnlock = formData.vesting.cliffEnabled ? formData.vesting.cliffPercentage : 0;

                              // Build stepped path
                              let path = 'M 0 100'; // Start at bottom left (0% unlocked)

                              if (formData.vesting.cliffEnabled && cliffX > 0) {
                                // Flat line until cliff
                                path += ` L ${cliffX} 100`;
                                // Jump up at cliff
                                if (cliffUnlock > 0) {
                                  path += ` L ${cliffX} ${100 - cliffUnlock}`;
                                }
                              }

                              // Calculate remaining unlock after cliff
                              const remainingUnlock = 100 - cliffUnlock;
                              const startX = formData.vesting.cliffEnabled ? cliffX : 0;
                              const startY = 100 - cliffUnlock;
                              const remainingWidth = graphWidth - startX;

                              // Create steps for remaining vesting
                              const stepsAfterCliff = Math.max(1, Math.ceil(periods * (1 - cliffRatio)));
                              const stepWidth = remainingWidth / stepsAfterCliff;
                              const stepHeight = remainingUnlock / stepsAfterCliff;

                              for (let i = 0; i < stepsAfterCliff; i++) {
                                const x2 = startX + ((i + 1) * stepWidth);
                                const y = startY - ((i + 1) * stepHeight);
                                // Horizontal line to next step
                                path += ` L ${x2} ${startY - (i * stepHeight)}`;
                                // Vertical jump up
                                path += ` L ${x2} ${y}`;
                              }

                              return (
                                <>
                                  {/* Filled area under curve */}
                                  <path
                                    d={`${path} L ${graphWidth} 100 Z`}
                                    fill="url(#vestingGradient)"
                                  />
                                  {/* Line */}
                                  <path
                                    d={path}
                                    fill="none"
                                    stroke="#f97316"
                                    strokeWidth="3"
                                    vectorEffect="non-scaling-stroke"
                                  />
                                </>
                              );
                            })()}

                            {/* Gradient definition */}
                            <defs>
                              <linearGradient id="vestingGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#f97316" stopOpacity="0.7" />
                                <stop offset="100%" stopColor="#f97316" stopOpacity="0.1" />
                              </linearGradient>
                            </defs>
                          </svg>

                          {/* Cliff marker (positioned outside SVG to avoid distortion) */}
                          {formData.vesting.cliffEnabled && (() => {
                            const durationInDays = formData.vesting.vestingDuration *
                              (formData.vesting.vestingDurationUnit === 'days' ? 1 :
                               formData.vesting.vestingDurationUnit === 'weeks' ? 7 : 30);
                            const cliffDurationInDays = formData.vesting.cliffDuration *
                              (formData.vesting.cliffDurationUnit === 'days' ? 1 :
                               formData.vesting.cliffDurationUnit === 'weeks' ? 7 : 30);
                            const cliffRatio = cliffDurationInDays / durationInDays;
                            const cliffUnlock = formData.vesting.cliffPercentage;
                            const chartHeight = vestingChartRef.current ? vestingChartRef.current.offsetHeight - 24 : 100;

                            if (cliffRatio <= 0 || cliffRatio > 1) return null;

                            return (
                              <div
                                className="absolute bg-orange-500 rounded-full border-2 border-white pointer-events-none shadow-lg"
                                style={{
                                  left: `calc(${cliffRatio * 100}% - 6px)`,
                                  top: (1 - cliffUnlock / 100) * chartHeight - 6,
                                  width: 12,
                                  height: 12
                                }}
                              />
                            );
                          })()}

                          {/* Hover tooltip */}
                          {vestingHover && (
                            <>
                              {/* Vertical line at snapped position */}
                              <div
                                className="absolute top-0 w-px bg-orange-500/50 pointer-events-none"
                                style={{ left: vestingHover.snappedX, height: 'calc(100% - 24px)' }}
                              />
                              {/* Horizontal line at snapped position */}
                              <div
                                className="absolute left-0 h-px bg-orange-500/50 pointer-events-none"
                                style={{ top: vestingHover.snappedY, width: vestingHover.snappedX }}
                              />
                              {/* Dot marker at snapped position */}
                              <div
                                className="absolute bg-orange-500 rounded-full border-2 border-white pointer-events-none shadow-lg"
                                style={{
                                  left: vestingHover.snappedX - 6,
                                  top: vestingHover.snappedY - 6,
                                  width: 12,
                                  height: 12
                                }}
                              />
                              {/* Tooltip */}
                              <div
                                className="absolute bg-zinc-800 border border-zinc-600 rounded px-2.5 py-1.5 text-xs pointer-events-none z-10 shadow-lg"
                                style={{
                                  left: vestingHover.snappedX > 150 ? vestingHover.snappedX - 100 : vestingHover.snappedX + 15,
                                  top: Math.max(0, vestingHover.snappedY - 20)
                                }}
                              >
                                <div className="text-zinc-400">Time: <span className="text-white font-medium">{vestingHover.time}</span></div>
                                <div className="text-zinc-400">Unlocked: <span className="text-orange-500 font-medium">{vestingHover.percent}%</span></div>
                              </div>
                            </>
                          )}

                          {/* X-axis labels */}
                          <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-zinc-400">
                            <span>Now</span>
                            {formData.vesting.cliffEnabled && (
                              <span className="text-orange-500 font-medium">Cliff</span>
                            )}
                            <span>{formData.vesting.vestingDuration} {formData.vesting.vestingDurationUnit}</span>
                          </div>
                        </div>
                      </div>
                      <p className="typo-caption text-muted-foreground mt-2 text-center">
                        {formData.vesting.vestingPercentage}% of tokens vesting {formData.vesting.unlockSchedule.replace('-', ' ')} over {formData.vesting.vestingDuration} {formData.vesting.vestingDurationUnit}
                        {formData.vesting.cliffEnabled && ` with ${formData.vesting.cliffDuration} ${formData.vesting.cliffDurationUnit} cliff`}
                      </p>
                    </div>
                  </div>
                </div>
                )}

                {/* Navigation */}
                <div className="flex gap-2 sm:gap-3 pt-4">
                  <Button type="button" variant="ghost" onClick={() => setCurrentStep('roadmap')} className="flex-1">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                  <Button
                    type="button"
                    onClick={handleNextFromVesting}
                    className="flex-1 bg-primary hover:bg-primary/80"
                  >
                    <span className="sm:hidden">Next</span>
                    <span className="hidden sm:inline">Next: Review</span>
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
              )}

              {/* Step 5: Review & Launch */}
              {currentStep === 'review' && (
              <div className="space-y-5 sm:space-y-6 p-4 sm:p-6 rounded-lg border border-border/50 bg-[#111114]">
                <div className="space-y-1">
                  <h2 className="typo-subtitle">Review & Launch</h2>
                  <p className="typo-caption text-muted-foreground">Review your project details before launching</p>
                </div>

                {/* Token Summary */}
                <div className="space-y-3 sm:space-y-4">
                  <div className="p-3 sm:p-4 rounded-lg bg-background border border-border/50">
                    <h3 className="text-sm font-medium mb-2 sm:mb-3">Token Information</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span className="text-muted-foreground">Name:</span>
                      <span>{formData.name}</span>
                      <span className="text-muted-foreground">Symbol:</span>
                      <span>{formData.symbol}</span>
                      {formData.description && (
                        <>
                          <span className="text-muted-foreground">Description:</span>
                          <span className="truncate">{formData.description}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="p-3 sm:p-4 rounded-lg bg-background border border-border/50">
                    <h3 className="text-sm font-medium mb-2 sm:mb-3">Project Details</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span className="text-muted-foreground">Category:</span>
                      <span>{PROJECT_CATEGORIES.find(c => c.value === formData.category)?.label}</span>
                      <span className="text-muted-foreground">Industry:</span>
                      <span>{PROJECT_INDUSTRIES.find(i => i.value === formData.industry)?.label}</span>
                      <span className="text-muted-foreground">Stage:</span>
                      <span>{PROJECT_STAGES.find(s => s.value === formData.stage)?.label}</span>
                    </div>
                  </div>

                  {formData.roadmap.length > 0 && (
                    <div className="p-3 sm:p-4 rounded-lg bg-background border border-border/50">
                      <h3 className="text-sm font-medium mb-2 sm:mb-3">Roadmap ({formData.roadmap.length} milestones)</h3>
                      <ul className="space-y-2 text-sm">
                        {formData.roadmap.map((m, i) => (
                          <li key={m.id} className="flex items-center gap-2">
                            <span className="text-muted-foreground">{i + 1}.</span>
                            <span>{m.title}</span>
                            <span className="text-muted-foreground">- {m.targetDate}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Vesting Summary */}
                  <div className="p-3 sm:p-4 rounded-lg bg-background border border-border/50">
                    <h3 className="text-sm font-medium mb-2 sm:mb-3">Vesting</h3>
                    {formData.vesting.enabled ? (
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <span className="text-muted-foreground">Amount:</span>
                        <span>{formData.vesting.vestingPercentage}% of supply</span>
                        <span className="text-muted-foreground">Duration:</span>
                        <span>{formData.vesting.vestingDuration} {formData.vesting.vestingDurationUnit}</span>
                        <span className="text-muted-foreground">Unlock Schedule:</span>
                        <span className="capitalize">{formData.vesting.unlockSchedule.replace('-', ' ')}</span>
                        {formData.vesting.cliffEnabled && (
                          <>
                            <span className="text-muted-foreground">Cliff:</span>
                            <span>{formData.vesting.cliffDuration} {formData.vesting.cliffDurationUnit} ({formData.vesting.cliffPercentage}% unlock)</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No vesting configured</p>
                    )}
                  </div>
                </div>

                {/* Launch Settings */}
                <div className="space-y-3 sm:space-y-4 pt-3 sm:pt-4 border-t border-border/50">
                  <h3 className="text-sm font-medium">Launch Settings</h3>

                  {/* Graduation Threshold */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Label className="typo-body">Graduation Threshold (SOL)</Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p>Amount of SOL required in the bonding curve pool for your token to graduate to a full AMM. Higher thresholds mean more liquidity at graduation.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="85"
                      value={formData.graduationThresholdDisplay || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || /^\d*\.?\d*$/.test(value)) {
                          setFormData({
                            ...formData,
                            graduationThresholdDisplay: value,
                            graduationThreshold: value === '' ? undefined : parseFloat(value) || undefined,
                          });
                        }
                      }}
                      disabled={loading}
                    />
                    <p className="typo-caption text-muted-foreground">
                      Recommended: 85 SOL (standard) or higher for more liquidity
                    </p>
                  </div>

                  {/* Initial Buy */}
                  <div className="space-y-2.5">
                    <Label className="typo-body">Initial Buy (SOL)</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.0"
                      value={formData.initialBuyDisplay || ''}
                      onChange={(e) => {
                        const value = e.target.value;
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

                  {/* Fee Tier */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="typo-body">Creator Fee</Label>
                      <Badge className="font-mono typo-caption !font-semibold">
                        {formatFeeTier(formData.feeTier)}
                      </Badge>
                    </div>
                    <Slider
                      min={0}
                      max={FEE_TIERS.length - 1}
                      step={1}
                      value={[FEE_TIERS.indexOf(formData.feeTier)]}
                      onValueChange={([index]) => setFormData({ ...formData, feeTier: FEE_TIERS[index] })}
                      disabled={loading}
                    />
                  </div>

                  {/* Grace Mode */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Label className="typo-body">Grace Period (Sniper Penalty)</Label>
                        <Shield className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="typo-caption text-muted-foreground">
                        Deter snipers with high fees for 20 seconds
                      </p>
                    </div>
                    <Switch
                      checked={formData.graceMode}
                      onCheckedChange={(checked) => setFormData({ ...formData, graceMode: checked })}
                      disabled={loading}
                    />
                  </div>
                </div>

                {/* Navigation */}
                <div className="flex gap-2 sm:gap-3 pt-4">
                  <Button type="button" variant="ghost" onClick={() => setCurrentStep('vesting')} className="flex-1">
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    className="flex-1 bg-primary hover:bg-primary/80"
                  >
                    {loading ? 'Creating...' : (
                      <>
                        <span className="sm:hidden">Launch</span>
                        <span className="hidden sm:inline">Create Project Token</span>
                      </>
                    )}
                  </Button>
                </div>

                {loading && (
                  <p className="typo-caption text-muted-foreground text-center">
                    Please sign the transaction in your wallet within 30 seconds...
                  </p>
                )}

                {!publicKey && (
                  <p className="typo-caption text-muted-foreground text-center">
                    Please connect your wallet to create a token.
                  </p>
                )}
              </div>
              )}
            </div>
            )}
          </div>
        </div>

    </div>
  );
}

// Whitelist gate component
function WhitelistGate({ children }: { children: React.ReactNode }) {
  const { publicKey } = useWallet();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const walletAddress = user?.user_metadata?.custom_claims?.address || publicKey?.toString();
  const { isWhitelisted, isLoading: whitelistLoading } = useWhitelist(walletAddress);

  // Show loading while checking auth or whitelist
  if (authLoading || whitelistLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Not authenticated - prompt to connect wallet
  if (!isAuthenticated && !publicKey) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Connect Your Wallet</h1>
            <p className="text-muted-foreground">
              Please connect your wallet to access the token creation page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Not whitelisted - show access denied
  if (!isWhitelisted) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Whitelist Required</h1>
            <p className="text-muted-foreground mb-6">
              Token creation is only available to whitelisted creators. Apply for whitelist access to launch your project on the platform.
            </p>
          </div>
          <div className="space-y-3">
            <Link
              href="/apply"
              className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full font-semibold transition-all cursor-pointer"
            >
              Apply for Whitelist
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center gap-2 w-full px-6 py-3 bg-muted hover:bg-muted/80 text-foreground rounded-full font-semibold transition-all cursor-pointer"
            >
              Learn How It Works
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            Connected: {walletAddress?.slice(0, 4)}...{walletAddress?.slice(-4)}
          </p>
        </div>
      </div>
    );
  }

  // Whitelisted - show the content
  return <>{children}</>;
}

export default function CreateTokenPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    }>
      <WhitelistGate>
        <CreateTokenPageContent />
      </WhitelistGate>
    </Suspense>
  );
}

