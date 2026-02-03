'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/contexts/FrameworkKitWalletContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, X } from 'lucide-react';
import dynamic from 'next/dynamic';

// Import critical panels directly (above the fold)
import { TokenNamePanel } from '@/components/panels/TokenNamePanel';
import { BuySellPanel } from '@/components/panels/BuySellPanel';
import { StatsPanel } from '@/components/panels/StatsPanel';
import { BondingCurvePanel } from '@/components/panels/BondingCurvePanel';
import { MetaPanel } from '@/components/panels/MetaPanel';
import { AthBar } from '@/components/ui/AthBar';
// PositionPanel temporarily removed - will be added back once fully integrated
// import { PositionPanel } from '@/components/panels/PositionPanel';

// Lazy load heavy/below-fold components
const TopHoldersPanel = dynamic(() => import('@/components/panels/TopHoldersPanel').then(mod => ({ default: mod.TopHoldersPanel })), {
  loading: () => <div className="animate-pulse bg-[#0a0a0c] rounded-2xl h-[200px]" />,
  ssr: false,
});
const RoadmapPanel = dynamic(() => import('@/components/panels/RoadmapPanel').then(mod => ({ default: mod.RoadmapPanel })), {
  loading: () => <div className="animate-pulse bg-[#0a0a0c] rounded-2xl h-[200px]" />,
  ssr: false,
});
const VestingInfoPanel = dynamic(() => import('@/components/panels/VestingInfoPanel').then(mod => ({ default: mod.VestingInfoPanel })), {
  loading: () => <div className="animate-pulse bg-[#0a0a0c] rounded-2xl h-[200px]" />,
  ssr: false,
});
const ThreadsPanel = dynamic(() => import('@/components/panels/ThreadsPanel').then(mod => ({ default: mod.ThreadsPanel })), {
  loading: () => (
    <div className="bg-[#0a0a0c] rounded-2xl p-3 sm:p-5 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 sm:w-5 sm:h-5 bg-muted rounded" />
          <div className="h-4 sm:h-5 w-36 sm:w-44 bg-muted rounded" />
        </div>
        <div className="h-9 sm:h-10 w-20 sm:w-24 bg-primary/30 rounded-md" />
      </div>
      <div>
        <div className="h-4 sm:h-5 w-3/4 bg-muted rounded mb-1" />
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-4 sm:w-5 sm:h-5 bg-muted rounded-full" />
          <div className="h-3 sm:h-4 w-20 bg-muted rounded" />
        </div>
        <div className="space-y-1.5 mb-4">
          <div className="h-3 sm:h-4 w-full bg-muted rounded" />
          <div className="h-3 sm:h-4 w-3/4 bg-muted rounded" />
        </div>
        <div className="h-9 sm:h-10 w-full bg-primary/30 rounded-md" />
      </div>
    </div>
  ),
  ssr: false,
});
const CommentsPanel = dynamic(() => import('@/components/panels/CommentsPanel').then(mod => ({ default: mod.CommentsPanel })), {
  loading: () => (
    <div className="bg-[#0a0a0c] rounded-2xl animate-pulse">
      <div className="p-3 sm:p-5 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="h-5 sm:h-6 w-20 sm:w-24 bg-muted rounded" />
          <div className="h-5 sm:h-6 w-14 sm:w-16 bg-muted rounded" />
        </div>
      </div>
      <div className="px-3 pb-3 sm:px-5">
        <div className="flex gap-3">
          <div className="w-8 h-8 bg-muted rounded-full shrink-0" />
          <div className="flex-1">
            <div className="h-20 w-full bg-muted rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  ),
  ssr: false,
});
const CommunityPanel = dynamic(() => import('@/components/panels/CommunityPanel').then(mod => ({ default: mod.CommunityPanel })), {
  loading: () => <div className="animate-pulse bg-[#0a0a0c] rounded-2xl h-[200px]" />,
  ssr: false,
});
const VideoPanel = dynamic(() => import('@/components/panels/VideoPanel').then(mod => ({ default: mod.VideoPanel })), {
  loading: () => <div className="animate-pulse bg-[#0a0a0c] rounded-2xl h-[200px]" />,
  ssr: false,
});

// Lazy load the heavy TradingView chart
const TokenChart = dynamic(() => import('@/components/TokenChart/TokenChart').then(mod => ({ default: mod.TokenChart })), {
  loading: () => (
    <div className="bg-background rounded-2xl h-full w-full flex items-center justify-center">
      <div className="w-12 h-12 border-[3px] border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  ),
  ssr: false,
});

// Import tokenTest data hooks and providers
import { useQueryClient } from '@tanstack/react-query';
import { useDataStream } from '@/contexts/DataStreamProvider';
import { useCurrentToken } from '@/contexts/CurrentTokenContext';
import { TokenPageMsgHandler } from '@/components/Token/TokenPageMsgHandler';
import { useTokenInfo, useHolders } from '@/hooks/queries';
import { ApeQueries, QueryData } from '@/components/Explore/queries';
import { formatReadableNumber, formatReadablePercentChange, ReadableNumberFormat } from '@/lib/format/number';
import { ShareModal } from '@/components/ShareModal';
import { TokenCustomizationModal, PendingImageFile, positionDataToCSS, CropGeneratorFn } from '@/components/Token/TokenCustomizationModal';
import { RoadmapEditModal } from '@/components/Token/RoadmapEditModal';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { usePreloadImage } from '@/components/ui/OptimizedBackground';
import { useImagePreloader, extractLayoutImageUrls } from '@/hooks/use-image-preloader';
import { useMobile } from '@/hooks/useMobile';
import { GracePeriodBanner } from '@/components/tokens/GracePeriodBanner';
import { FeeTier } from '@/lib/config/dbc-configs';
import { isGracePeriodActive } from '@/lib/utils/grace-period';
import { useAblyChannel } from '@/hooks/use-ably-channel';
import { MIN_TOKEN_HOLDING } from '@/hooks/use-token-holding';
import { useTokenLike } from '@/hooks/use-token-like';

export interface TokenPageLayout {
  panels: {
    id: string;
    type: string;
    position: { row: number; col: number; width: number; height: number };
    customization?: {
      backgroundColor?: string;
      textColor?: string;
      backgroundImage?: string;
      backgroundSize?: string;
      backgroundPosition?: string;
      overlayColor?: string;
      overlayOpacity?: number;
    };
  }[];
  style?: {
    backgroundColor?: string;
    backgroundImage?: string;
    backgroundSize?: string;
    backgroundPosition?: string;
    textColor?: string;
    accentColor?: string;
  };
}

interface TokenPageContentProps {
  // Token mode: provide address
  address?: string;
  // Page mode: provide page data or slug
  page?: any; // PageWithAuthor type
  pageSlug?: string;
  // Customization props (optional, for page creator mode)
  canvasBackgroundColor?: string;
  canvasBackgroundImage?: string;
  canvasBackgroundSize?: 'cover' | 'contain' | 'repeat';
  isCreator?: boolean;
  isCustomizing?: boolean; // Enable modal customization mode
  selectedPanel?: string | null;
  selectedBackground?: boolean;
  onPanelSelect?: (panelId: string | null) => void;
  onBackgroundSelect?: (selected: boolean) => void;
  onExitCustomization?: () => void; // Callback when Exit button is clicked
  onSaveLayout?: () => void;
  isSaving?: boolean;
  // Optional: pass layout directly (for page creator mode)
  externalLayout?: TokenPageLayout | null;
  // Callback to notify parent of layout changes (for page creator mode)
  onLayoutChange?: (layout: TokenPageLayout) => void;
  // Callbacks for canvas background changes (for modal integration)
  onCanvasBackgroundColorChange?: (color: string) => void;
  onCanvasBackgroundImageChange?: (url: string) => void;
  onCanvasBackgroundSizeChange?: (size: 'cover' | 'contain' | 'repeat') => void;
}

export function TokenPageContent({
  address,
  page,
  pageSlug,
  canvasBackgroundColor,
  canvasBackgroundImage,
  canvasBackgroundSize = 'cover',
  isCreator,
  isCustomizing: isCustomizingProp,
  selectedPanel,
  selectedBackground,
  onPanelSelect,
  onBackgroundSelect,
  onExitCustomization,
  onSaveLayout,
  isSaving = false,
  externalLayout,
  onLayoutChange,
  onCanvasBackgroundColorChange,
  onCanvasBackgroundImageChange,
  onCanvasBackgroundSizeChange,
}: TokenPageContentProps) {
  const router = useRouter();
  const { publicKey } = useWallet();
  const isMobile = useMobile(); // Returns true for screens < 1024px (lg breakpoint)

  // Determine mode: page mode if page or pageSlug is provided, otherwise token mode
  const isPageMode = !!(page || pageSlug);
  const effectiveAddress = isPageMode ? pageSlug : address;

  const [token, setToken] = useState<any>(null);
  const [layout, setLayout] = useState<TokenPageLayout | null>(null);
  const [tokenNotFound, setTokenNotFound] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isRoadmapEditModalOpen, setIsRoadmapEditModalOpen] = useState(false);
  const [pageId, setPageId] = useState<string | null>(null);
  const [internalPageSlug, setInternalPageSlug] = useState<string | null>(pageSlug || null);
  const [internalPage, setInternalPage] = useState<any>(page || null);
  
  // Internal creator state (only used when isCreator prop is not provided)
  const [internalIsCreator, setInternalIsCreator] = useState(false);

  // Inline customization mode state
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isCustomizationModalOpen, setIsCustomizationModalOpen] = useState(false);
  const [internalSelectedPanel, setInternalSelectedPanel] = useState<string | null>(null);
  const [internalSelectedBackground, setInternalSelectedBackground] = useState(false);
  const [internalIsSaving, setInternalIsSaving] = useState(false);
  const [editCanvasBgColor, setEditCanvasBgColor] = useState<string>('');
  const [editCanvasBgImage, setEditCanvasBgImage] = useState<string>('');
  const [editCanvasBgSize, setEditCanvasBgSize] = useState<'cover' | 'contain' | 'repeat'>('cover');
  const [editCanvasBgPosition, setEditCanvasBgPosition] = useState<string>('center center');
  const [pendingFiles, setPendingFiles] = useState<PendingImageFile[]>([]);
  const [originalLayout, setOriginalLayout] = useState<TokenPageLayout | null>(null);
  const [cropGenerators, setCropGenerators] = useState<Map<string, CropGeneratorFn>>(new Map());

  // Key to trigger communities panel refresh when user buys 10k+ tokens
  const [communitiesRefreshKey, setCommunitiesRefreshKey] = useState(0);

  // Use prop if provided, otherwise use internal state
  const effectiveIsCreator = isCreator !== undefined ? isCreator : internalIsCreator;
  const effectiveIsCustomizing = isCustomizingProp !== undefined ? isCustomizingProp : isCustomizing;

  // Use internal or external selection state
  const effectiveSelectedPanel = selectedPanel !== undefined ? selectedPanel : internalSelectedPanel;
  const effectiveSelectedBackground = selectedBackground !== undefined ? selectedBackground : internalSelectedBackground;
  const effectiveIsSaving = isSaving !== undefined ? isSaving : internalIsSaving;

  // Get token data using hooks
  const queryClient = useQueryClient();
  const { data: tokenInfo } = useTokenInfo();
  const { data: poolId } = useTokenInfo((data: any) => data?.id);
  const { data: baseAsset } = useTokenInfo((data: any) => data?.baseAsset);
  const { data: isInactive } = useTokenInfo((data: any) => data?.isInactive);
  const { data: holdersData } = useHolders();
  const { subscribeTxns, unsubscribeTxns, subscribePools, unsubscribePools } = useDataStream();
  const { setTokenSymbol } = useCurrentToken();

  // Token like functionality
  const { likeCount, hasLiked, toggleLike } = useTokenLike(effectiveAddress);

  // Handle like button click with toast feedback
  const handleLikeToggle = useCallback(async () => {
    try {
      await toggleLike();
      toast.success(hasLiked ? 'Unliked 👎' : 'Liked!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update like');
    }
  }, [toggleLike, hasLiked]);

  // Update document title and nav context with token symbol
  useEffect(() => {
    if (isPageMode) return; // Don't update title in page mode
    const symbol = baseAsset?.symbol || token?.symbol;
    if (symbol) {
      document.title = `${symbol} | Launchpad`;
      setTokenSymbol(symbol);
    }
    return () => {
      document.title = 'Launchpad'; // Reset on unmount
      setTokenSymbol(null); // Clear nav context on unmount
    };
  }, [baseAsset?.symbol, token?.symbol, isPageMode, setTokenSymbol]);

  // Subscribe to token txns
  useEffect(() => {
    if (!address) return;
    subscribeTxns([address]);
    return () => unsubscribeTxns([address]);
  }, [address, subscribeTxns, unsubscribeTxns]);

  // Subscribe to pools
  useEffect(() => {
    if (!poolId) return;
    subscribePools([poolId]);
    return () => unsubscribePools([poolId]);
  }, [poolId, subscribePools, unsubscribePools]);

  // Handle real-time token updates (including ATH) from Ably
  // Consolidated handler that updates both local state AND React Query cache
  const handleTokenUpdate = useCallback((message: any) => {
    const event = message.data;

    // Only process updates for the current token
    if (!address || event.address !== address) {
      return;
    }

    // Update local token state with new data
    setToken((prev: any) => {
      if (!prev) return prev;

      // Backend sends snake_case (ath_market_cap), spread directly
      return {
        ...prev,
        ...event.updates,
      };
    });

    // Also update React Query cache for components using useTokenInfo
    queryClient.setQueriesData(
      {
        type: 'active',
        queryKey: ApeQueries.tokenInfo({ id: address }).queryKey,
        exact: true,
      },
      (prev?: QueryData<typeof ApeQueries.tokenInfo>) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...event.updates,
        };
      }
    );
  }, [address, queryClient]);

  // Subscribe to token updates via Ably for real-time ATH updates
  // Enable for both token mode and page mode to ensure ATH bar updates
  useAblyChannel({
    channelName: 'tokens:updates',
    eventName: 'TOKEN_UPDATED',
    onMessage: handleTokenUpdate,
    enabled: !!address,
  });

  // Transform holders data for TopHoldersPanel
  const transformedHolders = useMemo(() => {
    if (!holdersData?.holders || !baseAsset?.totalSupply) {
      return undefined;
    }

    // Get creator wallet for comparison
    const creatorWallet = baseAsset?.dev || token?.creator_wallet;

    return holdersData.holders
      .map((holder: { address: string; amount: number; tags?: Array<{ id: string; name?: string }> }) => {
        const percentage = baseAsset.totalSupply
          ? (holder.amount / baseAsset.totalSupply) * 100
          : 0;

        // Shorten address for display
        const shortenedAddress = holder.address
          ? `${holder.address.slice(0, 4)}...${holder.address.slice(-4)}`
          : 'Unknown';

        // Check if it's a liquidity pool
        const KNOWN_LIQUIDITY_POOLS = [
          'FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM', // Meteora liquidity pool
        ];
        const isLiquidity = holder.tags?.some((tag: { id: string; name?: string }) =>
          tag.id === 'LP' || tag.name?.toLowerCase().includes('liquidity')
        ) || KNOWN_LIQUIDITY_POOLS.includes(holder.address);

        // Check if holder is the token creator
        const isCreator = !!(creatorWallet && holder.address && creatorWallet.toLowerCase() === holder.address.toLowerCase());

        return {
          name: shortenedAddress,
          percentage,
          isLiquidity,
          isCreator,
          address: holder.address, // Keep full address for reference
        };
      })
      .sort((a: { percentage: number }, b: { percentage: number }) => b.percentage - a.percentage) // Sort by percentage descending
      .slice(0, 10); // Get top 10 holders
  }, [holdersData, baseAsset, token?.creator_wallet]);

  // Sync external layout changes (from page-creator mode)
  useEffect(() => {
    if (externalLayout !== undefined) {
      // Use external layout (from page creator)
      if (externalLayout !== null) {
        // Ensure style object exists
        const layoutWithStyle = {
          ...externalLayout,
          style: externalLayout.style || {},
        };
        
        // Normalize any ThreadsPanel type variations to ensure consistency
        layoutWithStyle.panels = layoutWithStyle.panels.map((p: any) => {
          if (p.type?.toLowerCase() === 'threadspanel' || p.type === 'THREADSPanel') {
            return { ...p, type: 'ThreadsPanel' };
          }
          return p;
        });

        // Remove duplicate panels first
        layoutWithStyle.panels = removeDuplicatePanels(layoutWithStyle.panels);

        // Ensure ThreadsPanel is always included (only if not already present)
        const hasThreadsPanel = layoutWithStyle.panels.some((p: any) => p.type === 'ThreadsPanel');
        let finalLayout = layoutWithStyle;

        if (!hasThreadsPanel) {
          // Find MetaPanel and insert ThreadsPanel after it
          const metaPanelIndex = layoutWithStyle.panels.findIndex((p: any) => p.type === 'MetaPanel');
          const topHoldersIndex = layoutWithStyle.panels.findIndex((p: any) => p.type === 'TopHoldersPanel');
          const insertRow = metaPanelIndex >= 0 
            ? layoutWithStyle.panels[metaPanelIndex].position.row + 1
            : (topHoldersIndex >= 0 
              ? layoutWithStyle.panels[topHoldersIndex].position.row 
              : 5);
          // Insert ThreadsPanel after MetaPanel
          const threadsPanel = {
            id: 'threads',
            type: 'ThreadsPanel',
            position: { row: insertRow, col: 0, width: 12, height: 1 },
          };
          
          finalLayout = {
            ...layoutWithStyle,
            panels: [...layoutWithStyle.panels],
          };
          
          if (topHoldersIndex >= 0) {
            finalLayout.panels.splice(topHoldersIndex, 0, threadsPanel);
            // Adjust row numbers for panels after ThreadsPanel
            finalLayout.panels.forEach((p: any) => {
              if (p.position.row >= insertRow && p.id !== 'threads') {
                p.position.row += 1;
              }
            });
          } else {
            finalLayout.panels.push(threadsPanel);
          }
        }
        
        setLayout(finalLayout);
      } else {
        setLayout(null);
      }
    }
  }, [externalLayout]);

  // Fetch page data and layout (if in page mode)
  useEffect(() => {
    if (!isPageMode) return;
    if (externalLayout !== undefined) {
      // Using external layout, skip fetching
      return;
    }

    const fetchPageData = async () => {
      try {
        let pageData = page;
        
        // Fetch page if not provided
        if (!pageData && pageSlug) {
          const response = await fetch(`/api/pages/slug/${pageSlug}`);
          if (response.ok) {
            pageData = await response.json();
            setInternalPage(pageData);
          }
        } else if (pageData) {
          setInternalPage(pageData);
        }

        // Fetch layout
        if (pageData?.id) {
          const layoutResponse = await fetch(`/api/pages/${pageData.id}/layout`);
          if (layoutResponse.ok) {
            const layoutData = await layoutResponse.json();
            if (layoutData.layout) {
              // Convert website-builder format to page layout format
              const convertedLayout = convertWebsiteBuilderLayout(layoutData.layout);
              if (layoutData.layout.style) {
                convertedLayout.style = layoutData.layout.style;
              }
              // Extract canvas background properties
              if (layoutData.layout.canvasBackgroundColor !== undefined ||
                  layoutData.layout.canvasBackgroundImage !== undefined ||
                  layoutData.layout.backgroundSize !== undefined ||
                  layoutData.layout.backgroundPosition !== undefined) {
                convertedLayout.style = {
                  ...convertedLayout.style,
                  backgroundColor: layoutData.layout.canvasBackgroundColor,
                  backgroundImage: layoutData.layout.canvasBackgroundImage,
                  backgroundSize: layoutData.layout.backgroundSize,
                  backgroundPosition: layoutData.layout.backgroundPosition,
                };
              }
              // Normalize ThreadsPanel types
              convertedLayout.panels = convertedLayout.panels.map((p: any) => {
                if (p.type?.toLowerCase() === 'threadspanel' || p.type === 'THREADSPanel') {
                  return { ...p, type: 'ThreadsPanel' };
                }
                return p;
              });
              setLayout(convertedLayout);
            } else {
              setLayout(getDefaultLayout());
            }
          } else {
            setLayout(getDefaultLayout());
          }
        } else {
          setLayout(getDefaultLayout());
        }
      } catch (error) {
        console.error('Error fetching page:', error);
        setLayout(getDefaultLayout());
      }
    };

    fetchPageData();
  }, [isPageMode, page, pageSlug, externalLayout]);

  // Fetch token data (only if not using external layout and not in page mode)
  useEffect(() => {
    if (externalLayout !== undefined) {
      // Using external layout, skip token fetching
      return;
    }
    if (isPageMode) {
      // In page mode, skip token fetching
      return;
    }
    if (!address) return;

    // Helper to process layout data
    const processLayout = (layoutData: any): TokenPageLayout => {
      if (!layoutData?.elements) {
        return getDefaultLayout();
      }

      // Convert website-builder format to token page format
      const convertedLayout = convertWebsiteBuilderLayout(layoutData);

      // Define the standard two-column layout positions
      // Left column (cols 0-7, width 8): Token name, chart, meta, threads, comments
      // Right column (cols 8-11, width 4): Buy/sell, position, bonding curve, top holders
      const standardPositions: Record<string, { row: number; col: number; width: number; height: number }> = {
        'TokenNamePanel': { row: 0, col: 0, width: 8, height: 1 },
        'ChartPanel': { row: 1, col: 0, width: 8, height: 3 },
        'MetaPanel': { row: 4, col: 0, width: 8, height: 1 },
        'ThreadsPanel': { row: 5, col: 0, width: 8, height: 1 },
        'CommentsPanel': { row: 6, col: 0, width: 8, height: 2 },
        'BuySellPanel': { row: 0, col: 8, width: 4, height: 3 },
        // PositionPanel temporarily removed
        'BondingCurvePanel': { row: 3, col: 8, width: 4, height: 1 },
        'TopHoldersPanel': { row: 4, col: 8, width: 4, height: 5 },
      };

      // Override positions with standard layout while preserving customizations
      convertedLayout.panels = convertedLayout.panels.map((panel: any) => {
        const standardPos = standardPositions[panel.type];
        if (standardPos) {
          return {
            ...panel,
            position: standardPos,
          };
        }
        return panel;
      });
      // Initialize style object if it doesn't exist
      if (!convertedLayout.style) {
        convertedLayout.style = {};
      }
      // Apply page style if available
      if (layoutData.style) {
        convertedLayout.style = {
          ...convertedLayout.style,
          ...layoutData.style,
        };
      }
      // Extract canvas background properties from saved layout
      const hasBackgroundProps =
        layoutData.canvasBackgroundColor !== undefined ||
        layoutData.canvasBackgroundImage !== undefined ||
        layoutData.backgroundSize !== undefined ||
        layoutData.backgroundPosition !== undefined;

      if (hasBackgroundProps) {
        const normalizedBackgroundSize = layoutData.backgroundSize !== undefined
          ? (typeof layoutData.backgroundSize === 'string'
              ? layoutData.backgroundSize.toLowerCase().trim()
              : layoutData.backgroundSize)
          : convertedLayout.style?.backgroundSize;

        convertedLayout.style = {
          ...convertedLayout.style,
          backgroundColor: layoutData.canvasBackgroundColor ?? convertedLayout.style?.backgroundColor,
          backgroundImage: layoutData.canvasBackgroundImage ?? convertedLayout.style?.backgroundImage,
          backgroundSize: normalizedBackgroundSize,
          backgroundPosition: layoutData.backgroundPosition ?? convertedLayout.style?.backgroundPosition,
        };
      }

      // Remove duplicate panels
      convertedLayout.panels = removeDuplicatePanels(convertedLayout.panels);

      // Ensure MetaPanel is always included
      if (!convertedLayout.panels.some((p: any) => p.type === 'MetaPanel')) {
        const topHoldersIndex = convertedLayout.panels.findIndex((p: any) => p.type === 'TopHoldersPanel');
        const insertRow = topHoldersIndex >= 0 ? convertedLayout.panels[topHoldersIndex].position.row : 4;
        const metaPanel = { id: 'meta', type: 'MetaPanel', position: { row: insertRow, col: 0, width: 12, height: 1 } };
        if (topHoldersIndex >= 0) {
          convertedLayout.panels.splice(topHoldersIndex, 0, metaPanel);
          convertedLayout.panels.forEach((p: any) => {
            if (p.position.row >= insertRow && p.id !== 'meta') p.position.row += 1;
          });
        } else {
          convertedLayout.panels.push(metaPanel);
        }
      }

      // Normalize ThreadsPanel types
      convertedLayout.panels = convertedLayout.panels.map((p: any) => {
        if (p.type?.toLowerCase() === 'threadspanel' || p.type === 'THREADSPanel') {
          return { ...p, type: 'ThreadsPanel' };
        }
        return p;
      });

      // Remove duplicates again after normalization
      convertedLayout.panels = removeDuplicatePanels(convertedLayout.panels);

      // Ensure ThreadsPanel is always included
      if (!convertedLayout.panels.some((p: any) => p.type === 'ThreadsPanel')) {
        const metaPanelIndex = convertedLayout.panels.findIndex((p: any) => p.type === 'MetaPanel');
        const topHoldersIndex = convertedLayout.panels.findIndex((p: any) => p.type === 'TopHoldersPanel');
        const insertRow = metaPanelIndex >= 0
          ? convertedLayout.panels[metaPanelIndex].position.row + 1
          : (topHoldersIndex >= 0 ? convertedLayout.panels[topHoldersIndex].position.row : 5);
        const threadsPanel = { id: 'threads', type: 'ThreadsPanel', position: { row: insertRow, col: 0, width: 12, height: 1 } };
        if (topHoldersIndex >= 0) {
          convertedLayout.panels.splice(topHoldersIndex, 0, threadsPanel);
          convertedLayout.panels.forEach((p: any) => {
            if (p.position.row >= insertRow && p.id !== 'threads') p.position.row += 1;
          });
        } else {
          convertedLayout.panels.push(threadsPanel);
        }
      }

      // Normalize backgroundSize in final layout
      return {
        ...convertedLayout,
        style: convertedLayout.style ? {
          ...convertedLayout.style,
          backgroundSize: convertedLayout.style.backgroundSize
            ? (typeof convertedLayout.style.backgroundSize === 'string'
                ? convertedLayout.style.backgroundSize.toLowerCase().trim()
                : convertedLayout.style.backgroundSize)
            : undefined,
        } : undefined,
      };
    };

    // Fetch token data (single API call includes layout + pageSlug)
    const fetchTokenData = async () => {
      try {
        const response = await fetch(`/api/tokens/${address}`);
        if (response.ok) {
          const data = await response.json();
          setToken(data);
          setTokenNotFound(false);

          // Use layout and pageSlug from combined API response
          if (data.page_id) {
            setPageId(data.page_id);
          }
          if (data.pageSlug) {
            setInternalPageSlug(data.pageSlug);
          }

          // Process layout from API response
          const finalLayout = data.layout ? processLayout(data.layout) : getDefaultLayout();
          setLayout(finalLayout);
          if (onLayoutChange) {
            onLayoutChange(finalLayout);
          }
        } else if (response.status === 404) {
          setTokenNotFound(true);
        }
      } catch (error) {
        console.error('Error fetching token:', error);
        setLayout(getDefaultLayout());
      }
    };

    if (address && externalLayout === undefined && !isPageMode) {
      fetchTokenData();
    }
  }, [address, externalLayout, onLayoutChange, isPageMode]);

  // Check if current user is the creator or an editor (only if isCreator prop is not provided)
  useEffect(() => {
    if (isCreator !== undefined) {
      // Creator status is controlled by prop, skip internal check
      return;
    }

    if (!token || !publicKey) {
      setInternalIsCreator(false);
      return;
    }

    const creatorWallet = token?.creator_wallet || token?.creator?.wallet_address || baseAsset?.dev;
    const currentWallet = publicKey.toString();
    const isCreatorMatch = !!(creatorWallet && currentWallet === creatorWallet);

    // Check if wallet is in editor_wallets array
    const editorWallets = token?.editor_wallets || [];
    const isEditorMatch = editorWallets.includes(currentWallet);

    setInternalIsCreator(isCreatorMatch || isEditorMatch);
  }, [token, publicKey, baseAsset, isCreator]);

  // Initialize edit state from layout when entering customization mode
  // Only run when effectiveIsCustomizing changes to true, NOT when layout changes
  useEffect(() => {
    if (effectiveIsCustomizing && layout && !originalLayout) {
      setEditCanvasBgColor(layout.style?.backgroundColor || '');
      setEditCanvasBgImage(layout.style?.backgroundImage || '');
      setEditCanvasBgSize((layout.style?.backgroundSize as 'cover' | 'contain' | 'repeat') || 'cover');
      setEditCanvasBgPosition(layout.style?.backgroundPosition || 'center center');
      // Store original layout for change detection (only once when entering customization)
      setOriginalLayout(JSON.parse(JSON.stringify(layout)));
    }
    // Clear originalLayout when exiting customization
    if (!effectiveIsCustomizing && originalLayout) {
      setOriginalLayout(null);
    }
  }, [effectiveIsCustomizing, layout, originalLayout]);

  // Handler to enter customization mode
  const handleEnterCustomization = useCallback(() => {
    setIsCustomizing(true);
    setInternalSelectedPanel(null);
    setInternalSelectedBackground(false);
  }, []);

  // Handler to exit customization mode
  const handleExitCustomization = useCallback(() => {
    // Clean up any pending blob URLs
    pendingFiles.forEach(f => {
      if (f.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(f.previewUrl);
      }
    });
    setPendingFiles([]);
    setIsCustomizing(false);
    setInternalSelectedPanel(null);
    setInternalSelectedBackground(false);
    // Clear original layout so it gets refreshed next time
    setOriginalLayout(null);
  }, [pendingFiles]);

  // Handler to update panel customization
  const handlePanelUpdate = useCallback((panelId: string, customization: any) => {
    setLayout((prevLayout) => {
      if (!prevLayout) return prevLayout;
      return {
        ...prevLayout,
        panels: prevLayout.panels.map((panel) =>
          panel.id === panelId ? { ...panel, customization } : panel
        ),
      };
    });
  }, []);

  // Handler to update crop generators
  const handleCropGeneratorChange = useCallback((target: string, generator: CropGeneratorFn | null) => {
    setCropGenerators((prev) => {
      const next = new Map(prev);
      if (generator) {
        next.set(target, generator);
      } else {
        next.delete(target);
      }
      return next;
    });
  }, []);

  // Handler for successful token swaps - refresh communities panel if user bought 10k+ tokens
  const handleSwapSuccess = useCallback((tokenAmount: number, isBuy: boolean) => {
    // Only trigger refresh for buys of 10k+ tokens
    if (isBuy && tokenAmount >= MIN_TOKEN_HOLDING) {
      setCommunitiesRefreshKey((prev) => prev + 1);
    }
  }, []);

  // Helper to upload a file (File or Blob) and return the uploaded URL
  const uploadFile = async (file: File | Blob, accessToken: string, filename?: string): Promise<string> => {
    const formData = new FormData();
    // If it's a Blob (not File), convert it to File with a name
    if (file instanceof Blob && !(file instanceof File)) {
      const fileWithName = new File([file], filename || `cropped-${Date.now()}.jpg`, { type: file.type || 'image/jpeg' });
      formData.append('file', fileWithName);
    } else {
      formData.append('file', file);
    }

    const response = await fetch('/api/upload/background', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to upload image');
    }

    const data = await response.json();
    return data.url;
  };

  // Helper to delete a background image
  const deleteBackgroundImage = async (imageUrl: string, accessToken: string): Promise<void> => {
    // Only delete images from our upload service (not external URLs)
    if (!imageUrl || !imageUrl.includes('pinata') && !imageUrl.includes('ipfs')) {
      return;
    }

    try {
      // Extract the CID or filename from the URL
      // Pinata URLs are typically: https://gateway.pinata.cloud/ipfs/CID
      const cidMatch = imageUrl.match(/ipfs\/([^/?]+)/);
      if (cidMatch) {
        await fetch('/api/upload/background', {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ cid: cidMatch[1] }),
        });
      }
    } catch (error) {
      // Silently fail - deletion is best effort
      console.warn('Failed to delete old image:', error);
    }
  };

  // Handler to save token layout
  const handleSaveTokenLayout = useCallback(async () => {
    if (!address || !layout) return;

    // Check if any changes were made
    const originalBgColor = originalLayout?.style?.backgroundColor || '';
    const originalBgImage = originalLayout?.style?.backgroundImage || '';
    const originalBgSize = originalLayout?.style?.backgroundSize || 'cover';
    const originalBgPosition = originalLayout?.style?.backgroundPosition || 'center center';

    const hasCanvasChanges =
      editCanvasBgColor !== originalBgColor ||
      editCanvasBgImage !== originalBgImage ||
      editCanvasBgSize !== originalBgSize ||
      editCanvasBgPosition !== originalBgPosition;

    const hasPendingFiles = pendingFiles.length > 0;

    // Check if any panel customizations changed (including backgroundPosition)
    const hasPanelChanges = originalLayout ? layout.panels.some((panel, index) => {
      const originalPanel = originalLayout.panels[index];
      if (!originalPanel) return true;

      // Compare customization objects, including backgroundPosition
      const currentCustomization = panel.customization || {};
      const originalCustomization = originalPanel.customization || {};

      return (
        currentCustomization.backgroundColor !== originalCustomization.backgroundColor ||
        currentCustomization.textColor !== originalCustomization.textColor ||
        currentCustomization.backgroundImage !== originalCustomization.backgroundImage ||
        currentCustomization.backgroundSize !== originalCustomization.backgroundSize ||
        currentCustomization.backgroundPosition !== originalCustomization.backgroundPosition ||
        currentCustomization.overlayColor !== originalCustomization.overlayColor ||
        currentCustomization.overlayOpacity !== originalCustomization.overlayOpacity
      );
    }) : false;

    // Check if there are crop generators (meaning position/zoom was adjusted)
    const hasCropChanges = cropGenerators.size > 0;

    if (!hasCanvasChanges && !hasPendingFiles && !hasPanelChanges && !hasCropChanges) {
      // No changes detected
      toast.info('No changes to save');
      return;
    }

    setInternalIsSaving(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        toast.error('Please sign in to save the layout');
        setInternalIsSaving(false);
        return;
      }

      let finalCanvasBgImage = editCanvasBgImage;
      let updatedLayout = { ...layout };

      // Step 1: Generate and upload cropped images for any targets with crop generators
      const totalCrops = cropGenerators.size;
      if (totalCrops > 0) {
        let processedCrops = 0;
        const cropToastId = toast.loading(`Processing images (0/${totalCrops})...`);

        for (const [target, generator] of cropGenerators) {
          try {
            const croppedBlob = await generator();
            if (croppedBlob) {
              // Get the original image URL for deletion later
              let originalImageUrl: string | undefined;
              if (target === 'canvas') {
                originalImageUrl = originalLayout?.style?.backgroundImage;
              } else {
                const originalPanel = originalLayout?.panels.find(p => p.id === target);
                originalImageUrl = originalPanel?.customization?.backgroundImage;
              }

              // Upload the cropped image
              processedCrops++;
              toast.loading(`Uploading image ${processedCrops}/${totalCrops}...`, { id: cropToastId });
              const uploadedUrl = await uploadFile(croppedBlob, session.access_token, `cropped-${target}-${Date.now()}.jpg`);

              if (target === 'canvas') {
                // Delete the old canvas background image
                if (originalImageUrl && originalImageUrl !== editCanvasBgImage) {
                  await deleteBackgroundImage(originalImageUrl, session.access_token);
                }
                finalCanvasBgImage = uploadedUrl;
                setEditCanvasBgImage(uploadedUrl);
              } else {
                // Delete the old panel background image
                if (originalImageUrl) {
                  await deleteBackgroundImage(originalImageUrl, session.access_token);
                }
                // Update panel background image
                updatedLayout = {
                  ...updatedLayout,
                  panels: updatedLayout.panels.map((panel) =>
                    panel.id === target
                      ? {
                          ...panel,
                          customization: {
                            ...panel.customization,
                            backgroundImage: uploadedUrl,
                            // Clear backgroundPosition since image is already cropped
                            backgroundPosition: undefined,
                          },
                        }
                      : panel
                  ),
                };
              }
            }
          } catch (cropError: any) {
            console.error('Failed to process cropped image:', cropError);
            toast.error(`Failed to process image: ${cropError.message}`, { id: cropToastId });
            setInternalIsSaving(false);
            return;
          }
        }

        toast.success(`Processed ${totalCrops} image${totalCrops > 1 ? 's' : ''}`, { id: cropToastId });
        // Clear crop generators after processing
        setCropGenerators(new Map());
      }

      // Step 2: Upload any pending files (newly selected images without cropping)
      const totalPending = pendingFiles.filter(p => !cropGenerators.has(p.target)).length;
      let pendingToastId: string | number | undefined;
      if (totalPending > 0) {
        pendingToastId = toast.loading(`Uploading ${totalPending} image${totalPending > 1 ? 's' : ''}...`);

        for (const pending of pendingFiles) {
          // Skip if this target was already handled by crop generators
          if (cropGenerators.has(pending.target)) {
            URL.revokeObjectURL(pending.previewUrl);
            continue;
          }

          try {
            const uploadedUrl = await uploadFile(pending.file, session.access_token);

            if (pending.target === 'canvas') {
              // Delete old canvas background if different
              const originalImageUrl = originalLayout?.style?.backgroundImage;
              if (originalImageUrl) {
                await deleteBackgroundImage(originalImageUrl, session.access_token);
              }
              finalCanvasBgImage = uploadedUrl;
              setEditCanvasBgImage(uploadedUrl);
            } else {
              // Delete old panel background
              const originalPanel = originalLayout?.panels.find(p => p.id === pending.target);
              if (originalPanel?.customization?.backgroundImage) {
                await deleteBackgroundImage(originalPanel.customization.backgroundImage, session.access_token);
              }
              // Update panel background image
              updatedLayout = {
                ...updatedLayout,
                panels: updatedLayout.panels.map((panel) =>
                  panel.id === pending.target
                    ? {
                        ...panel,
                        customization: {
                          ...panel.customization,
                          backgroundImage: uploadedUrl,
                        },
                      }
                    : panel
                ),
              };
            }

            // Clean up blob URL
            URL.revokeObjectURL(pending.previewUrl);
          } catch (uploadError: any) {
            console.error('Failed to upload image:', uploadError);
            toast.error(`Failed to upload image: ${uploadError.message}`, { id: pendingToastId });
            setInternalIsSaving(false);
            return;
          }
        }

        if (pendingToastId) {
          toast.success('Images uploaded', { id: pendingToastId });
        }
        // Clear pending files after successful uploads
        setPendingFiles([]);
        setLayout(updatedLayout);
      }

      // Convert layout to website-builder format for API
      const convertPanelTypeToKebab = (type: string): string => {
        const withoutPanel = type.replace(/Panel$/, '');
        const withHyphens = withoutPanel.replace(/([A-Z])/g, '-$1').toLowerCase();
        return withHyphens.replace(/^-/, '') + '-panel';
      };

      // For cropped images, we don't need to save backgroundPosition since the image is already cropped
      const websiteBuilderLayout = {
        elements: updatedLayout.panels.map((panel) => ({
          id: panel.id,
          type: convertPanelTypeToKebab(panel.type),
          content: '',
          styles: {
            backgroundColor: panel.customization?.backgroundColor,
            color: panel.customization?.textColor,
            backgroundImage: panel.customization?.backgroundImage,
            backgroundSize: panel.customization?.backgroundSize,
            // Only include backgroundPosition if not a cropped image (no crop generator was used)
            backgroundPosition: panel.customization?.backgroundPosition,
            overlayColor: panel.customization?.overlayColor,
            overlayOpacity: panel.customization?.overlayOpacity,
          },
          position: {
            x: panel.position.col,
            y: panel.position.row,
            colSpan: panel.position.width,
          },
        })),
        canvasBackgroundColor: editCanvasBgColor || '',
        canvasBackgroundImage: finalCanvasBgImage || '',
        backgroundSize: editCanvasBgSize || 'cover',
        // Clear canvas backgroundPosition if we uploaded a cropped image
        backgroundPosition: cropGenerators.has('canvas') ? 'center center' : (editCanvasBgPosition || 'center center'),
      };

      const response = await fetch(`/api/tokens/${address}/layout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ layout: websiteBuilderLayout }),
      });

      if (response.ok) {
        toast.success('Layout saved successfully!');

        // Reset canvas position if we uploaded a cropped image
        const newCanvasBgPosition = cropGenerators.has('canvas') ? 'center center' : editCanvasBgPosition;
        if (cropGenerators.has('canvas')) {
          setEditCanvasBgPosition('center center');
        }

        // Update the layout with all changes including panel customizations
        const newLayout = {
          ...updatedLayout,
          style: {
            ...updatedLayout.style,
            backgroundColor: editCanvasBgColor,
            backgroundImage: finalCanvasBgImage,
            backgroundSize: editCanvasBgSize,
            backgroundPosition: newCanvasBgPosition,
          },
        };
        setLayout(newLayout);
        // Update originalLayout to match the saved state so re-entering customization works correctly
        setOriginalLayout(JSON.parse(JSON.stringify(newLayout)));
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save layout');
      }
    } catch (error: any) {
      console.error('Error saving layout:', error);
      toast.error(error.message || 'Failed to save layout');
    } finally {
      setInternalIsSaving(false);
    }
  }, [address, layout, originalLayout, editCanvasBgColor, editCanvasBgImage, editCanvasBgSize, editCanvasBgPosition, pendingFiles, cropGenerators]);

  /**
   * Remove duplicate panels from an array
   * Duplicates are identified by: same ID, or same type at same position
   */
  const removeDuplicatePanels = useCallback((panels: any[]): any[] => {
    const seen = new Set<string>();
    return panels.filter((panel) => {
      const key = `${panel.id}-${panel.type}-${panel.position.row}-${panel.position.col}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, []);

  /**
   * Convert kebab-case panel type to PascalCase
   */
  const convertPanelType = useCallback((type: string): string => {
    const normalizedType = type.trim();

    // If already in correct PascalCase format (ends with "Panel" and has no hyphens), normalize case and return
    if (normalizedType.endsWith('Panel') && !normalizedType.includes('-')) {
      const withoutPanel = normalizedType.slice(0, -5);
      const words = withoutPanel.split(/(?=[A-Z])/).filter(w => w.length > 0);
      if (words.length > 0) {
        return words
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join('') + 'Panel';
      }
      return normalizedType;
    }

    // Handle partially converted types like "Token-namePanel" or "Buy-sellPanel"
    const withoutPanel = normalizedType.replace(/Panel$/i, '');
    return withoutPanel
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('') + 'Panel';
  }, []);

  const convertWebsiteBuilderLayout = useCallback((builderLayout: any): TokenPageLayout => {
    // Simple conversion - the website builder elements should map directly
    return {
      panels: builderLayout.elements
        .map((el: any, index: number) => ({
          id: el.id || `panel-${index}`,
          type: convertPanelType(el.type),
          position: {
            row: el.position?.y || 0,
            col: el.position?.x || 0,
            width: el.position?.colSpan || 12,
            height: 2,
          },
          customization: {
            backgroundColor: el.styles?.backgroundColor,
            textColor: el.styles?.color,
            backgroundImage: el.styles?.backgroundImage,
            backgroundSize: el.styles?.backgroundSize,
            backgroundPosition: el.styles?.backgroundPosition,
            overlayColor: el.styles?.overlayColor,
            overlayOpacity: el.styles?.overlayOpacity,
          },
        }))
        .filter((panel: any) => panel.type !== 'TradesPanel' && panel.type !== 'ChatPanel' && panel.type !== 'StatsPanel'),
    };
  }, [convertPanelType]);

  const getDefaultLayout = useCallback((): TokenPageLayout => {
    return {
      panels: [
        // === LEFT COLUMN (8 cols) ===
        // Row 0: Token name panel
        {
          id: 'token-name',
          type: 'TokenNamePanel',
          position: { row: 0, col: 0, width: 8, height: 1 },
        },
        // Row 1-3: Chart (spans 3 rows)
        {
          id: 'chart',
          type: 'ChartPanel',
          position: { row: 1, col: 0, width: 8, height: 3 },
        },
        // Row 4: Meta panel (social links, description)
        {
          id: 'meta',
          type: 'MetaPanel',
          position: { row: 4, col: 0, width: 8, height: 1 },
        },
        // Row 5: Vesting info panel (only shown for project tokens with vesting)
        {
          id: 'vesting-info',
          type: 'VestingInfoPanel',
          position: { row: 5, col: 0, width: 8, height: 1 },
        },
        // Row 6: Threads/Videos panel
        {
          id: 'threads',
          type: 'ThreadsPanel',
          position: { row: 6, col: 0, width: 8, height: 1 },
        },
        // Row 7-8: Comments panel (spans 2 rows)
        {
          id: 'comments',
          type: 'CommentsPanel',
          position: { row: 7, col: 0, width: 8, height: 2 },
        },
        // === RIGHT COLUMN (4 cols) - stacked vertically ===
        // Row 0-2: Buy/Sell panel (spans 3 rows)
        {
          id: 'buy-sell',
          type: 'BuySellPanel',
          position: { row: 0, col: 8, width: 4, height: 3 },
        },
        // Row 3: Bonding curve panel
        {
          id: 'bonding-curve',
          type: 'BondingCurvePanel',
          position: { row: 3, col: 8, width: 4, height: 1 },
        },
        // Row 4: Roadmap panel (only shown for project tokens with roadmap)
        {
          id: 'roadmap',
          type: 'RoadmapPanel',
          position: { row: 4, col: 8, width: 4, height: 1 },
        },
        // Row 5-9: Top holders panel (spans remaining rows on right side)
        {
          id: 'holders',
          type: 'TopHoldersPanel',
          position: { row: 5, col: 8, width: 4, height: 5 },
        },
      ],
    };
  }, []);

  // Compute background image early for preloading (must be before early returns)
  const preloadBackgroundImage = effectiveIsCustomizing
    ? editCanvasBgImage
    : (canvasBackgroundImage || layout?.style?.backgroundImage || undefined);

  // Preload the main page background image for faster loading
  // This hook must be called unconditionally before any early returns
  usePreloadImage(preloadBackgroundImage);

  // Extract all background image URLs from layout for batch preloading
  const allImageUrls = useMemo(() => {
    if (effectiveIsCustomizing) return []; // Skip preloading during customization
    return extractLayoutImageUrls(layout);
  }, [layout, effectiveIsCustomizing]);

  // Preload all background images in parallel - page shows skeleton until all are ready
  const { isLoading: imagesLoading } = useImagePreloader(allImageUrls);

  // Compute background properties early (before skeleton) so skeleton can use them too
  // This prevents visual shift when transitioning from skeleton to actual content
  const pageBackgroundColor = effectiveIsCustomizing
    ? (editCanvasBgColor || undefined)
    : (canvasBackgroundColor || layout?.style?.backgroundColor);
  const pageBackgroundImage = effectiveIsCustomizing
    ? editCanvasBgImage
    : (canvasBackgroundImage || layout?.style?.backgroundImage || undefined);
  const rawBackgroundSize = effectiveIsCustomizing
    ? editCanvasBgSize
    : (externalLayout !== undefined
        ? (canvasBackgroundSize || layout?.style?.backgroundSize || 'cover')
        : (layout?.style?.backgroundSize || canvasBackgroundSize || 'cover'));
  const pageBackgroundSize = typeof rawBackgroundSize === 'string' ? rawBackgroundSize.toLowerCase() : rawBackgroundSize;
  const pageBackgroundPositionRaw = effectiveIsCustomizing
    ? editCanvasBgPosition
    : (layout?.style?.backgroundPosition || 'center center');
  const pageBackgroundPositionData = positionDataToCSS(pageBackgroundPositionRaw);

  const renderPanel = (panel: any) => {
    // During customization, DON'T show live backgroundPosition updates on the panel
    // The sidebar preview is the source of truth - panel only updates after save
    const { backgroundPosition: savedPos, ...restCustomization } = panel.customization || {};

    const props = {
      ...restCustomization,
      // Only pass backgroundPosition when NOT customizing (after save/refresh)
      backgroundPosition: effectiveIsCustomizing ? undefined : savedPos,
      // Pass token data to panels (for token mode)
      token,
      address: effectiveAddress,
      // Pass page data to panels (for page mode)
      page: internalPage,
      pageId: internalPage?.id,
    };

    switch (panel.type) {
      case 'TokenNamePanel': {
        // For page mode, use page data
        if (isPageMode && internalPage) {
          const pageName = internalPage?.title || 'Page Title';
          const pageDescription = internalPage?.description || '';
          const username = internalPage?.author?.username || 'Unknown';
          const authorAvatar = internalPage?.author?.avatar;
          const authorVerified = internalPage?.author?.verified;
          const timeAgo = internalPage?.created_at ? (() => {
            const createdAt = new Date(internalPage.created_at);
            const now = new Date();
            const diffMs = now.getTime() - createdAt.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 60) {
              return `${diffMins}m ago`;
            } else if (diffHours < 24) {
              return `${diffHours}h ago`;
            } else {
              return `${diffDays}d ago`;
            }
          })() : 'Unknown';

          return (
            <TokenNamePanel
              name={pageName}
              subtitle={pageDescription}
              address={effectiveAddress || ''}
              username={username}
              creatorAvatar={authorAvatar}
              creatorVerified={authorVerified}
              timeAgo={timeAgo}
              likeCount={likeCount}
              hasLiked={hasLiked}
              onLike={handleLikeToggle}
              {...props}
            />
          );
        }

        // For token mode, use token data
        // Get data from tokenInfo/baseAsset (preferred) or fallback to token from existing API
        const tokenName = baseAsset?.name || token?.name || 'Loading...';
        const tokenSymbol = baseAsset?.symbol || token?.symbol || '';
        const tokenAddress = address || baseAsset?.id || '';
        const isVerified = baseAsset?.isVerified || false;
        const creatorWallet = baseAsset?.dev || token?.creator_wallet || '';
        const username = token?.creator?.username || creatorWallet?.slice(0, 6) || 'Unknown';
        
        // Calculate timeAgo from firstPool creation time
        let timeAgo = 'Unknown';
        if (baseAsset?.firstPool?.createdAt) {
          const createdAt = new Date(baseAsset.firstPool.createdAt);
          const now = new Date();
          const diffMs = now.getTime() - createdAt.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMs / 3600000);
          const diffDays = Math.floor(diffMs / 86400000);
          
          if (diffMins < 60) {
            timeAgo = `${diffMins}m ago`;
          } else if (diffHours < 24) {
            timeAgo = `${diffHours}h ago`;
          } else {
            timeAgo = `${diffDays}d ago`;
          }
        } else if (token?.created_at) {
          const createdAt = new Date(token.created_at);
          const now = new Date();
          const diffMs = now.getTime() - createdAt.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMs / 3600000);
          const diffDays = Math.floor(diffMs / 86400000);
          
          if (diffMins < 60) {
            timeAgo = `${diffMins}m ago`;
          } else if (diffHours < 24) {
            timeAgo = `${diffHours}h ago`;
          } else {
            timeAgo = `${diffDays}d ago`;
          }
        }
        
        // Format address for display (shorten if long)
        const displayAddress = tokenAddress.length > 12
          ? `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-6)}`
          : tokenAddress;

        // Get token image from baseAsset or token metadata
        const tokenImage = baseAsset?.icon || token?.metadata?.logo;
        const metaplexUri = token?.metadata?.metaplex_uri;

        // Get creator avatar and verified status
        const creatorAvatar = token?.creator?.avatar;
        const creatorVerified = token?.creator?.verified;

        return (
          <TokenNamePanel
            name={tokenName}
            subtitle={tokenSymbol}
            address={displayAddress}
            fullAddress={tokenAddress}
            username={username}
            creatorWallet={creatorWallet}
            creatorAvatar={creatorAvatar}
            creatorVerified={creatorVerified}
            official={isVerified}
            timeAgo={timeAgo}
            tokenImage={tokenImage}
            metaplexUri={metaplexUri}
            graceModeEnabled={token?.grace_mode_enabled}
            isDexPaid={token?.is_dex_paid}
            likeCount={likeCount}
            hasLiked={hasLiked}
            onLike={handleLikeToggle}
            onShare={() => setIsShareModalOpen(true)}
            onEditPage={effectiveIsCreator ? handleEnterCustomization : undefined}
            showEditButton={effectiveIsCreator && !effectiveIsCustomizing}
            {...props}
          />
        );
      }
      case 'BuySellPanel': {
        // Get token data for swap
        const tokenSymbol = baseAsset?.symbol || token?.symbol || 'TOKEN';
        const tokenDecimals = baseAsset?.decimals || token?.decimals || 6;
        const tokenIcon = baseAsset?.icon || token?.metadata?.logo;

        return (
          <BuySellPanel
            tokenSymbol={tokenSymbol}
            tokenDecimals={tokenDecimals}
            tokenIcon={tokenIcon}
            onSwapSuccess={handleSwapSuccess}
            {...props}
          />
        );
      }
      case 'ChartPanel': {
        // Mobile: minimal styling, full width edge-to-edge chart, taller height
        // Desktop: keep existing styling with background customization
        const marketCap = baseAsset?.mcap;
        const currentPrice = baseAsset?.usdPrice;
        const athMarketCap = token?.ath_market_cap;
        // Use our backend market_cap for ATH bar (more precise, updated via Ably)
        const backendMarketCap = token?.market_cap;

        return (
          <div className="w-full">
            {/* Mobile: Market cap/price header outside edge-to-edge container to respect page padding */}
            {isMobile && (
              <div className="flex items-center justify-between gap-2 mb-3 px-1">
                <div
                  className={`flex flex-col ${preloadBackgroundImage ? 'bg-black/50 px-2 py-1.5 rounded-lg backdrop-blur-sm' : ''}`}
                >
                  <span className="text-xs text-muted-foreground mb-1">Market Cap</span>
                  <div className="text-2xl font-bold text-white">
                    {marketCap !== undefined && marketCap !== null
                      ? `$${formatReadableNumber(marketCap, { format: ReadableNumberFormat.COMPACT })}`
                      : '—'}
                  </div>
                </div>
                <div
                  className={`text-right flex flex-col gap-1.5 ${preloadBackgroundImage ? 'bg-black/50 px-2 py-1.5 rounded-lg backdrop-blur-sm' : ''}`}
                >
                  {/* ATH Progress Bar - above price on mobile (matching desktop) */}
                  {athMarketCap != null && athMarketCap > 0 && backendMarketCap != null && (
                    <div className="flex justify-end">
                      <AthBar marketCap={backendMarketCap} athMarketCap={athMarketCap} />
                    </div>
                  )}
                  <div className="text-sm text-white">
                    <span className="text-muted-foreground">Price </span>
                    {currentPrice !== undefined && currentPrice !== null
                      ? `$${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`
                      : '—'}
                  </div>
                </div>
              </div>
            )}

            {/* Chart container - edge-to-edge on small mobile (<640px), styled container on tablet/desktop */}
            {/* -mx-3 and width calc only apply on small screens, sm:mx-0 and sm:w-full reset for tablet+ */}
            <div
              className="w-[calc(100%+24px)] -mx-3 sm:w-full sm:mx-0 overflow-hidden relative p-0 sm:p-4 lg:p-5 sm:rounded-2xl"
              style={{
                // Desktop (1024px+): apply custom background color/image handling
                backgroundColor: !isMobile ? (props.backgroundImage ? 'transparent' : (props.backgroundColor || undefined)) : undefined,
              }}
            >
              {/* Background container - only show on desktop */}
              {!isMobile && (
                <div
                  className="absolute inset-0 rounded-2xl pointer-events-none"
                  style={{
                    zIndex: 0,
                  }}
                >
                  {/* Overlay - child above background */}
                  {props.overlayColor && props.overlayOpacity !== undefined && props.overlayOpacity > 0 && (
                    <div
                      className="absolute inset-0 rounded-2xl"
                      style={{
                        backgroundColor: props.overlayColor,
                        opacity: props.overlayOpacity,
                        zIndex: 2,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                  {/* Background image/color - child below overlay */}
                  {props.backgroundImage && (
                    <div
                      className="absolute inset-0 rounded-2xl"
                      style={{
                        backgroundImage: `url(${props.backgroundImage})`,
                        backgroundSize: props.backgroundSize === 'cover' ? 'cover' : props.backgroundSize === 'contain' ? 'contain' : props.backgroundSize === 'repeat' ? 'auto' : 'cover',
                        backgroundRepeat: props.backgroundSize === 'repeat' ? 'repeat' : 'no-repeat',
                        backgroundPosition: 'center',
                        zIndex: 1,
                      }}
                    />
                  )}
                </div>
              )}
              {/* Chart container - taller on mobile (500px), standard on tablet/desktop */}
              <div className="relative h-[500px] sm:h-[350px] lg:h-[500px] flex flex-col" style={{ zIndex: 2 }}>
                <TokenChart
                  key={isMobile ? 'mobile' : 'desktop'}
                  backgroundColor={isMobile ? undefined : props.backgroundColor}
                  backgroundImage={isMobile ? undefined : props.backgroundImage}
                  textBackgroundColor={props.textBackgroundColor}
                  hideHeader={isMobile}
                  athMarketCap={athMarketCap}
                  backendMarketCap={backendMarketCap}
                />
              </div>
            </div>
          </div>
        );
      }
      case 'StatsPanel': {
        // Calculate stats from token data
        const vol24h = baseAsset?.stats24h
          ? (baseAsset.stats24h.buyVolume ?? 0) + (baseAsset.stats24h.sellVolume ?? 0)
          : undefined;
        const price = baseAsset?.usdPrice;
        const change5m = baseAsset?.stats5m?.priceChange
          ? baseAsset.stats5m.priceChange / 100
          : undefined;
        const change1h = baseAsset?.stats1h?.priceChange
          ? baseAsset.stats1h.priceChange / 100
          : undefined;
        const change6h = baseAsset?.stats6h?.priceChange
          ? baseAsset.stats6h.priceChange / 100
          : undefined;

        return (
          <StatsPanel
            vol24h={vol24h !== undefined ? `$${formatReadableNumber(vol24h, { format: ReadableNumberFormat.COMPACT })}` : undefined}
            price={price !== undefined ? `$${formatReadableNumber(price)}` : undefined}
            change5m={change5m !== undefined ? formatReadablePercentChange(change5m, { decimals: 2 }) : undefined}
            change1h={change1h !== undefined ? formatReadablePercentChange(change1h, { decimals: 2 }) : undefined}
            change6h={change6h !== undefined ? formatReadablePercentChange(change6h, { decimals: 2 }) : undefined}
            {...props}
          />
        );
      }
      case 'BondingCurvePanel': {
        // If token is inactive (Jupiter returned no pools), show N/A
        if (isInactive) {
          return (
            <BondingCurvePanel
              isUnavailable={true}
              {...props}
            />
          );
        }

        // Get bonding curve data - prefer bonding_curve_progress (from Ably/local) over bondingCurve (from Jupiter)
        // bonding_curve_progress is patched by TokenPageMsgHandler from real-time updates
        const bondingCurveProgress = (tokenInfo as any)?.bonding_curve_progress;
        const bondingCurve = bondingCurveProgress ?? tokenInfo?.bondingCurve;
        const isMigrated = (tokenInfo as any)?.is_migrated || token?.is_migrated || false;
        const liquidity = baseAsset?.liquidity;

        // If bonding curve is undefined (still loading), show 0% progress to avoid flash of 100%
        const progress = bondingCurve !== undefined ? bondingCurve : 0;

        // Calculate SOL in curve (approximate from liquidity, or use a default calculation)
        // If token has graduated (bondingCurve >= 100), show 0 or null
        let solInCurve: number | undefined = undefined;
        if (bondingCurve !== undefined && bondingCurve < 100) {
          // Approximate: liquidity in SOL (assuming liquidity is in USD, convert using SOL price ~$150)
          // Or use a simpler calculation based on bonding curve progress
          // For now, we'll use a placeholder calculation
          if (liquidity !== undefined) {
            // Rough estimate: SOL in curve is related to liquidity
            // This is a simplified calculation - actual bonding curve math is more complex
            solInCurve = liquidity / 150; // Approximate SOL price
          } else {
            // Fallback: estimate based on bonding curve progress
            // Assuming max curve is around 1000 SOL (this varies by launchpad)
            solInCurve = (progress / 100) * 1000;
          }
        }

        // If token is migrated or bonding curve >= 100, show completed state
        if (isMigrated || (bondingCurve !== undefined && bondingCurve >= 100)) {
          return (
            <BondingCurvePanel
              progress={100}
              solInCurve={undefined}
              isMigrated={isMigrated}
              {...props}
            />
          );
        }

        return (
          <BondingCurvePanel
            progress={progress}
            solInCurve={solInCurve}
            isMigrated={isMigrated}
            {...props}
          />
        );
      }
      case 'AthProgressPanel': {
        // Deprecated - ATH bar is now shown in ChartPanel
        return null;
      }
      case 'MetaPanel':
        return (
          <MetaPanel 
            token={isPageMode ? {
              metadata: {
                description: internalPage?.description || '',
              }
            } : token}
            baseAsset={baseAsset}
            {...props} 
          />
        );
      case 'ThreadsPanel':
      case 'THREADSPanel': // Handle case variations
        return (
          <ThreadsPanel
            tokenAddress={effectiveAddress ?? undefined}
            creatorWallet={baseAsset?.dev || token?.creator_wallet}
            tokenSymbol={baseAsset?.symbol || token?.symbol}
            tokenLogo={baseAsset?.icon || token?.metadata?.logo}
            accessRefreshKey={communitiesRefreshKey}
            {...props}
          />
        );
      case 'TopHoldersPanel':
        return (
          <TopHoldersPanel
            tokenAddress={address}
            holders={transformedHolders}
            token={token}
            baseAsset={baseAsset}
            isUnavailable={isInactive}
            {...props}
          />
        );
      case 'PositionPanel':
        // Temporarily removed - will be added back once fully integrated
        return null;
      case 'ChatPanel':
        // Chat panel removed
        return null;
      case 'TradesPanel':
        // Trades are now integrated into CommentsPanel, so return null or redirect
        return null;
      case 'CommentsPanel':
        return <CommentsPanel 
          address={isPageMode ? undefined : address} 
          pageId={isPageMode ? internalPage?.id : undefined}
          token={token} 
          showRealTransactions={!isPageMode} 
          {...props} 
        />;
      case 'CommunityPanel':
        return <CommunityPanel {...props} />;
      case 'VideoPanel':
        return <VideoPanel {...props} />;
      case 'RoadmapPanel':
        // Only render for project tokens; hide if no roadmap unless user is creator
        if (token?.token_type !== 'project') return null;
        return (
          <RoadmapPanel
            token={token}
            showEditButton={effectiveIsCreator && !effectiveIsCustomizing}
            onEditRoadmap={() => setIsRoadmapEditModalOpen(true)}
            isCreator={effectiveIsCreator}
            {...props}
          />
        );
      case 'VestingInfoPanel':
        // Only render for project tokens with vesting config
        if (!token?.vesting_config?.enabled) return null;
        return <VestingInfoPanel token={token} {...props} />;
      default:
        // Normalize panel type and try again (handle case variations like "THREADSPanel")
        const normalizedType = convertPanelType(panel.type);
        if (normalizedType !== panel.type) {
          return renderPanel({ ...panel, type: normalizedType });
        }
        return <div>Unknown panel type: {panel.type}</div>;
    }
  };

  // Show skeleton while loading layout or preloading background images
  if ((!layout || imagesLoading) && !tokenNotFound) {
    return (
      <div
        className="min-h-screen p-3 pt-4 sm:p-4 sm:pt-6 lg:pt-8 bg-background relative"
        style={{ backgroundColor: pageBackgroundColor || undefined }}
      >
        {/* Canvas background image layer - fixed to viewport so it doesn't shift when content loads */}
        {pageBackgroundImage && (
          <div
            className="fixed inset-0 pointer-events-none overflow-hidden"
            style={{ zIndex: 0 }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${pageBackgroundImage})`,
                ...(pageBackgroundSize === 'repeat' ? {
                  backgroundSize: 'auto',
                  backgroundRepeat: 'repeat',
                  backgroundPosition: 'top left',
                } : pageBackgroundSize === 'cover' ? {
                  backgroundSize: 'cover',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: pageBackgroundPositionData.position,
                } : {
                  backgroundSize: pageBackgroundSize === 'contain' ? 'contain' : 'auto',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: pageBackgroundPositionData.position,
                }),
                filter: 'blur(2px)',
                transform: 'scale(1.02)',
              }}
            />
          </div>
        )}
        {/* Skeleton content wrapper - relative with z-index to appear above background */}
        <div className="relative" style={{ zIndex: 1 }}>
        {/* Mobile Skeleton Layout */}
        <div className="flex flex-col gap-3 sm:gap-4 lg:hidden max-w-5xl mx-auto">
          {/* Token Name Panel skeleton - matches TokenNamePanel.tsx */}
          <div className="bg-[#0a0a0c] rounded-2xl animate-pulse">
            <div className="p-4 sm:p-4 flex items-center gap-3 sm:gap-4">
              <div className="size-20 sm:size-20 shrink-0 bg-muted rounded-lg" />
              <div className="flex flex-col gap-1 sm:gap-1.5 flex-1 min-w-0">
                {/* Name + symbol row */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="h-5 sm:h-6 w-24 sm:w-32 bg-muted rounded" />
                  <div className="h-4 sm:h-5 w-12 sm:w-14 bg-muted rounded" />
                </div>
                {/* Creator + time row */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="size-3.5 sm:size-4 bg-muted rounded-full" />
                  <div className="h-4 sm:h-5 w-16 sm:w-20 bg-muted rounded" />
                  <div className="h-3 sm:h-4 w-10 sm:w-12 bg-muted rounded" />
                </div>
                {/* Address + badges row */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="h-6 sm:h-7 w-20 sm:w-24 bg-muted rounded-full" />
                  <div className="h-6 sm:h-7 w-14 sm:w-16 bg-muted rounded-full" />
                </div>
              </div>
            </div>
          </div>

          {/* Chart Panel skeleton - edge-to-edge on mobile */}
          <div className="w-full">
            {/* Market cap/price header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex flex-col gap-1">
                <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                <div className="h-8 w-20 bg-muted rounded animate-pulse" />
              </div>
              <div className="flex flex-col gap-1.5 items-end">
                {/* ATH bar */}
                <div className="flex items-center gap-2">
                  <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-24 bg-[#1a1a1f] rounded-full animate-pulse" />
                </div>
                {/* Price */}
                <div className="h-4 w-28 bg-muted rounded animate-pulse" />
              </div>
            </div>
            {/* Chart container - edge-to-edge */}
            <div
              className="-mx-3 bg-background"
              style={{ width: 'calc(100% + 24px)' }}
            >
              <div className="h-[500px] flex items-center justify-center">
                <div className="w-12 h-12 border-[3px] border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            </div>
          </div>

          {/* Meta Panel skeleton - matches MetaPanel.tsx */}
          <div className="bg-[#0a0a0c] rounded-2xl animate-pulse">
            <div className="p-3 sm:p-5 flex flex-col gap-2 sm:gap-3">
              {/* Social links row */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="h-7 sm:h-9 w-20 sm:w-24 bg-muted rounded-md" />
                <div className="h-7 sm:h-9 w-18 sm:w-20 bg-muted rounded-md" />
              </div>
              {/* Description */}
              <div className="space-y-1.5 sm:space-y-2">
                <div className="h-4 sm:h-5 w-full bg-muted rounded" />
                <div className="h-4 sm:h-5 w-2/3 bg-muted rounded" />
              </div>
            </div>
          </div>

          {/* Threads Panel skeleton - matches ThreadsPanel.tsx */}
          <div className="bg-[#0a0a0c] rounded-2xl p-3 sm:p-5 overflow-hidden animate-pulse">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 sm:w-5 sm:h-5 bg-muted rounded" />
                <div className="h-4 sm:h-5 w-36 sm:w-44 bg-muted rounded" />
              </div>
              <div className="h-9 sm:h-10 w-20 sm:w-24 bg-primary/30 rounded-full" />
            </div>
            {/* Card skeleton - matches announcement card structure */}
            <div>
              <div className="h-4 sm:h-5 w-3/4 bg-muted rounded mb-1" />
              <div className="flex items-center gap-2 text-xs sm:text-sm mb-2">
                <div className="w-4 h-4 sm:w-5 sm:h-5 bg-muted rounded-full" />
                <div className="h-3 sm:h-4 w-20 bg-muted rounded" />
                <div className="h-3 sm:h-4 w-16 bg-muted rounded" />
              </div>
              <div className="space-y-1.5 mb-4">
                <div className="h-3 sm:h-4 w-full bg-muted rounded" />
                <div className="h-3 sm:h-4 w-3/4 bg-muted rounded" />
              </div>
              <div className="h-9 sm:h-10 w-full bg-primary/30 rounded-full" />
            </div>
          </div>

          {/* Comments Panel skeleton - matches CommentsPanel.tsx */}
          <div className="bg-[#0a0a0c] rounded-2xl animate-pulse">
            {/* Header with tabs */}
            <div className="p-3 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="h-5 sm:h-6 w-20 sm:w-24 bg-muted rounded" />
                <div className="h-5 sm:h-6 w-14 sm:w-16 bg-muted rounded" />
              </div>
              <div className="h-7 sm:h-8 w-16 sm:w-20 bg-muted rounded" />
            </div>
            {/* Comment input area */}
            <div className="px-3 pb-3 sm:px-5">
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-muted rounded-full shrink-0" />
                <div className="flex-1">
                  <div className="h-20 w-full bg-muted rounded-lg mb-2" />
                  <div className="flex justify-end">
                    <div className="h-9 w-16 bg-primary/30 rounded-full" />
                  </div>
                </div>
              </div>
            </div>
            {/* Comments list */}
            <div className="px-3 pb-5 sm:px-5 space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="flex gap-2 sm:gap-3">
                  {/* Vote section */}
                  <div className="flex flex-col items-center gap-1 w-5">
                    <div className="w-3.5 h-3.5 bg-muted rounded" />
                    <div className="w-4 h-4 bg-muted rounded" />
                    <div className="w-3.5 h-3.5 bg-muted rounded" />
                  </div>
                  {/* Comment content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 bg-muted rounded-full" />
                      <div className="h-4 sm:h-5 w-20 bg-muted rounded" />
                      <div className="h-3 sm:h-4 w-12 bg-muted rounded" />
                    </div>
                    <div className="h-4 sm:h-5 w-full bg-muted rounded mb-3" />
                    <div className="h-4 w-12 bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Desktop Skeleton Layout - matches actual grid layout */}
        <div className="hidden lg:block max-w-5xl mx-auto">
          <div className="grid grid-cols-8 gap-3">
            {/* Token Name Panel skeleton - span 8 cols */}
            <div className="col-span-8 bg-[#0a0a0c] rounded-2xl animate-pulse">
              <div className="p-5 flex items-center gap-4">
                <div className="size-28 shrink-0 bg-muted rounded-lg" />
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  {/* Name + symbol row */}
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-36 bg-muted rounded" />
                    <div className="h-5 w-16 bg-muted rounded" />
                  </div>
                  {/* Creator + time row */}
                  <div className="flex items-center gap-2">
                    <div className="size-4 bg-muted rounded-full" />
                    <div className="h-5 w-24 bg-muted rounded" />
                    <div className="h-4 w-14 bg-muted rounded" />
                  </div>
                  {/* Address + badges row */}
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-28 bg-muted rounded-full" />
                    <div className="h-7 w-18 bg-muted rounded-full" />
                  </div>
                </div>
              </div>
            </div>

            {/* Chart Panel skeleton - span 8 cols */}
            <div className="col-span-8 bg-[#0a0a0c] rounded-2xl">
              <div className="p-4 lg:p-5 h-[500px] flex flex-col">
                {/* Header: Market Cap and ATH/Price */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex flex-col gap-1">
                    <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                    <div className="h-9 w-24 bg-muted rounded animate-pulse" />
                  </div>
                  <div className="flex flex-col gap-1.5 items-end">
                    {/* ATH bar */}
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                      <div className="h-3 w-24 bg-[#1a1a1f] rounded-full animate-pulse" />
                    </div>
                    {/* Price */}
                    <div className="h-5 w-36 bg-muted rounded animate-pulse" />
                  </div>
                </div>
                {/* Chart area */}
                <div className="flex-1 bg-background rounded-2xl flex items-center justify-center">
                  <div className="w-12 h-12 border-[3px] border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              </div>
            </div>

            {/* Meta Panel skeleton - span 8 cols */}
            <div className="col-span-8 bg-[#0a0a0c] rounded-2xl animate-pulse">
              <div className="p-5 flex flex-col gap-3">
                {/* Social links row */}
                <div className="flex items-center gap-2">
                  <div className="h-9 w-28 bg-muted rounded-md" />
                  <div className="h-9 w-24 bg-muted rounded-md" />
                </div>
                {/* Description */}
                <div className="space-y-2">
                  <div className="h-5 w-full bg-muted rounded" />
                  <div className="h-5 w-3/4 bg-muted rounded" />
                </div>
              </div>
            </div>

            {/* Threads Panel skeleton - span 8 cols */}
            <div className="col-span-8 bg-[#0a0a0c] rounded-2xl p-5 overflow-hidden animate-pulse">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-muted rounded" />
                  <div className="h-5 w-48 bg-muted rounded" />
                </div>
                <div className="h-9 w-24 bg-primary/30 rounded-full" />
              </div>
              {/* Card skeleton - matches announcement card structure */}
              <div>
                <div className="h-5 w-3/4 bg-muted rounded mb-1" />
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 bg-muted rounded-full" />
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-4 w-20 bg-muted rounded" />
                </div>
                <div className="space-y-1.5 mb-4">
                  <div className="h-4 w-full bg-muted rounded" />
                  <div className="h-4 w-2/3 bg-muted rounded" />
                </div>
                <div className="h-9 w-full bg-primary/30 rounded-full" />
              </div>
            </div>

            {/* Comments Panel skeleton - span 8 cols */}
            <div className="col-span-8 bg-[#0a0a0c] rounded-2xl animate-pulse">
              {/* Header with tabs */}
              <div className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="h-6 w-24 bg-muted rounded" />
                  <div className="h-6 w-16 bg-muted rounded" />
                </div>
                <div className="h-8 w-20 bg-muted rounded" />
              </div>
              {/* Comment input area */}
              <div className="px-5">
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-muted rounded-full shrink-0" />
                  <div className="flex-1">
                    <div className="h-20 w-full bg-muted rounded-lg mb-2" />
                    <div className="flex justify-end">
                      <div className="h-9 w-16 bg-primary/30 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
              {/* Comments list */}
              <div className="px-5 pb-5 pt-4 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3">
                    {/* Vote section */}
                    <div className="flex flex-col items-center gap-1 w-5">
                      <div className="w-3.5 h-3.5 bg-muted rounded" />
                      <div className="w-4 h-4 bg-muted rounded" />
                      <div className="w-3.5 h-3.5 bg-muted rounded" />
                    </div>
                    {/* Comment content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 bg-muted rounded-full" />
                        <div className="h-5 w-24 bg-muted rounded" />
                        <div className="h-4 w-14 bg-muted rounded" />
                      </div>
                      <div className="h-5 w-full bg-muted rounded mb-3" />
                      <div className="h-4 w-14 bg-muted rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    );
  }

  // Show "Token Not Found" if token not found in our platform database (404 from API)
  // This means the token was not created through our launchpad
  if (tokenNotFound) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold mb-2">Token Not Found</h1>
          <p className="text-muted-foreground mb-6">
            This token was not created on our platform. We only display tokens that were launched through our launchpad.
          </p>
          <Button
            onClick={() => router.push('/')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  // pageTextColor is computed here since it's not needed for skeleton
  const pageTextColor = layout?.style?.textColor;

  // Get selected panel data for sidebar
  const selectedPanelData = layout?.panels.find((p) => p.id === effectiveSelectedPanel) || null;

  // Determine if we're in an editing mode (either external or inline)
  const isInEditMode = effectiveIsCustomizing || (effectiveIsCreator && externalLayout !== undefined);

  return (
    <div className={`flex ${effectiveIsCustomizing ? 'h-screen overflow-hidden' : ''}`}>
      {/* Floating action bar for customize mode - rendered outside scrollable container */}
      {effectiveIsCustomizing && (
        <div
          className="fixed top-[88px] left-1/2 -translate-x-1/2 z-40 flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-full bg-background/95 border border-primary shadow-lg w-[calc(100%-24px)] sm:w-auto max-w-md sm:max-w-none"
          style={{ backdropFilter: 'blur(8px)' }}
        >
          <span className="text-xs sm:text-sm text-muted-foreground">Click any panel or background to customize</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (onExitCustomization) {
                onExitCustomization();
              } else {
                handleExitCustomization();
              }
            }}
            className="gap-1.5"
          >
            <X className="size-3.5" />
            Exit
          </Button>
        </div>
      )}

      {/* Token Page Content */}
      <div
        className={`min-h-screen p-3 pt-4 sm:p-4 sm:pt-6 lg:pt-8 relative bg-background ${effectiveIsCustomizing ? 'flex-1 overflow-y-auto' : 'w-full'}`}
        style={{
          backgroundColor: pageBackgroundColor || undefined,
          color: pageTextColor,
          borderRadius: isInEditMode ? '1rem' : undefined,
          border: isInEditMode ? (effectiveSelectedBackground ? '2px dashed #00eb2f' : '1px solid transparent') : 'none',
          cursor: isInEditMode ? 'pointer' : undefined,
        }}>
        {/* Canvas background image layer - fixed to viewport so it doesn't shift when content loads */}
        {pageBackgroundImage && (
          <div
            className="fixed inset-0 pointer-events-none overflow-hidden"
            style={{ zIndex: 0 }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${pageBackgroundImage})`,
                ...(pageBackgroundSize === 'repeat' ? {
                  backgroundSize: 'auto',
                  backgroundRepeat: 'repeat',
                  backgroundPosition: 'top left',
                } : pageBackgroundSize === 'cover' ? {
                  backgroundSize: 'cover',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: pageBackgroundPositionData.position,
                } : {
                  backgroundSize: pageBackgroundSize === 'contain' ? 'contain' : 'auto',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: pageBackgroundPositionData.position,
                }),
                filter: 'blur(2px)',
                transform: 'scale(1.02)',
              }}
            />
          </div>
        )}
        <div
        className="relative"
        style={{
          zIndex: 1,
        }}
        onClick={(e) => {
          if (isInEditMode) {
            const target = e.target as HTMLElement;
            // Check if click is NOT on a panel or interactive element
            const isOnPanel = target.closest('[data-panel]');
            const isInteractive = target.closest('a, button, input, select, textarea, [role="button"]');
            if (!isOnPanel && !isInteractive) {
              if (effectiveIsCustomizing) {
                setInternalSelectedBackground(true);
                setInternalSelectedPanel(null);
                setIsCustomizationModalOpen(true);
                // Also notify parent if callbacks are provided
                if (onBackgroundSelect) {
                  onBackgroundSelect(true);
                }
                if (onPanelSelect) {
                  onPanelSelect(null);
                }
              } else if (onBackgroundSelect) {
                onBackgroundSelect(true);
                if (onPanelSelect) {
                  onPanelSelect(null);
                }
              }
            }
          }
        }}
      >

        {/* Grace Period Banner - show when token has grace period active */}
        {!effectiveIsCustomizing && token?.grace_mode_enabled && token?.launch_timestamp && token?.fee_tier_bp !== null && isGracePeriodActive(new Date(token.launch_timestamp).getTime()) && (
          <GracePeriodBanner
            launchTimestamp={token.launch_timestamp}
            feeTier={token.fee_tier_bp as FeeTier}
          />
        )}

        {/* Inactive Token Banner - show when Jupiter returns no pools (inactive for 7+ days) */}
        {!effectiveIsCustomizing && isInactive && (
          <div
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-full bg-background/95 border border-primary shadow-lg w-[calc(100%-24px)] sm:w-auto max-w-md sm:max-w-none"
            style={{ backdropFilter: 'blur(8px)' }}
          >
            <span className="text-xs sm:text-sm text-muted-foreground">
              This token has been inactive for more than 7 days. Bring it back to life by trading!
            </span>
          </div>
        )}

        <TokenPageMsgHandler />

        {/* Mobile Layout: Single column with optimized order */}
        {/* When customizing, add top padding so users can tap the background above panels */}
        <div className={`flex flex-col gap-3 sm:gap-4 lg:hidden max-w-5xl mx-auto ${effectiveIsCustomizing ? 'pt-24' : ''}`}>
          {/* Mobile: TokenNamePanel first */}
          {layout?.panels
            .filter((panel) => panel.type === 'TokenNamePanel')
            .map((panel) => (
              <div
                key={panel.id}
                data-panel={panel.id}
                className={isInEditMode ? 'cursor-pointer transition-all relative z-10' : ''}
                style={{
                  border: isInEditMode ? (effectiveSelectedPanel === panel.id ? '2px dashed #00eb2f' : '1px solid transparent') : 'none',
                  borderRadius: isInEditMode ? '0.75rem' : undefined,
                }}
                onClick={(e) => {
                  if (isInEditMode) {
                    const target = e.target as HTMLElement;
                    const isInteractive = target.closest('a, button, input, select, textarea, [role="button"]');
                    if (!isInteractive) {
                      e.stopPropagation();
                      if (effectiveIsCustomizing) {
                        setInternalSelectedPanel(panel.id);
                        setInternalSelectedBackground(false);
                        setIsCustomizationModalOpen(true);
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      } else {
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      }
                    }
                  }
                }}
              >
                {renderPanel(panel)}
              </div>
            ))}

          {/* Mobile: BuySellPanel - only show inline in edit mode, otherwise use floating button + drawer */}
          {isInEditMode && layout?.panels
            .filter((panel) => panel.type === 'BuySellPanel')
            .map((panel) => (
              <div
                key={panel.id}
                data-panel={panel.id}
                className={isInEditMode ? 'cursor-pointer transition-all relative z-10' : ''}
                style={{
                  border: isInEditMode ? (effectiveSelectedPanel === panel.id ? '2px dashed #00eb2f' : '1px solid transparent') : 'none',
                  borderRadius: isInEditMode ? '0.75rem' : undefined,
                }}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  const isInteractive = target.closest('a, button, input, select, textarea, [role="button"]');
                  if (!isInteractive) {
                    e.stopPropagation();
                    if (effectiveIsCustomizing) {
                      setInternalSelectedPanel(panel.id);
                      setInternalSelectedBackground(false);
                      setIsCustomizationModalOpen(true);
                      if (onPanelSelect) onPanelSelect(panel.id);
                      if (onBackgroundSelect) onBackgroundSelect(false);
                    } else {
                      if (onPanelSelect) onPanelSelect(panel.id);
                      if (onBackgroundSelect) onBackgroundSelect(false);
                    }
                  }
                }}
              >
                {renderPanel(panel)}
              </div>
            ))}

          {/* Mobile: ChartPanel third - only render chart on mobile to prevent duplicate TradingView widgets */}
          {isMobile && layout?.panels
            .filter((panel) => panel.type === 'ChartPanel')
            .map((panel) => (
              <div
                key={panel.id}
                data-panel={panel.id}
                className={isInEditMode ? 'cursor-pointer transition-all relative z-10' : ''}
                style={{
                  border: isInEditMode ? (effectiveSelectedPanel === panel.id ? '2px dashed #00eb2f' : '1px solid transparent') : 'none',
                  borderRadius: isInEditMode ? '0.75rem' : undefined,
                }}
                onClick={(e) => {
                  if (isInEditMode) {
                    const target = e.target as HTMLElement;
                    const isInteractive = target.closest('a, button, input, select, textarea, [role="button"]');
                    if (!isInteractive) {
                      e.stopPropagation();
                      if (effectiveIsCustomizing) {
                        setInternalSelectedPanel(panel.id);
                        setInternalSelectedBackground(false);
                        setIsCustomizationModalOpen(true);
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      } else {
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      }
                    }
                  }
                }}
              >
                {renderPanel(panel)}
              </div>
            ))}

          {/* Mobile: BondingCurvePanel - only show in edit mode */}
          {isInEditMode && layout?.panels
            .filter((panel) => panel.type === 'BondingCurvePanel')
            .map((panel) => (
              <div
                key={panel.id}
                data-panel={panel.id}
                className={isInEditMode ? 'cursor-pointer transition-all relative z-10' : ''}
                style={{
                  border: isInEditMode ? (effectiveSelectedPanel === panel.id ? '2px dashed #00eb2f' : '1px solid transparent') : 'none',
                  borderRadius: isInEditMode ? '0.75rem' : undefined,
                }}
                onClick={(e) => {
                  if (isInEditMode) {
                    const target = e.target as HTMLElement;
                    const isInteractive = target.closest('a, button, input, select, textarea, [role="button"]');
                    if (!isInteractive) {
                      e.stopPropagation();
                      if (effectiveIsCustomizing) {
                        setInternalSelectedPanel(panel.id);
                        setInternalSelectedBackground(false);
                        setIsCustomizationModalOpen(true);
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      } else {
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      }
                    }
                  }
                }}
              >
                {renderPanel(panel)}
              </div>
            ))}

          {/* Mobile: MetaPanel sixth */}
          {layout?.panels
            .filter((panel) => panel.type === 'MetaPanel')
            .map((panel) => (
              <div
                key={panel.id}
                data-panel={panel.id}
                className={isInEditMode ? 'cursor-pointer transition-all relative z-10' : ''}
                style={{
                  border: isInEditMode ? (effectiveSelectedPanel === panel.id ? '2px dashed #00eb2f' : '1px solid transparent') : 'none',
                  borderRadius: isInEditMode ? '0.75rem' : undefined,
                }}
                onClick={(e) => {
                  if (isInEditMode) {
                    const target = e.target as HTMLElement;
                    const isInteractive = target.closest('a, button, input, select, textarea, [role="button"]');
                    if (!isInteractive) {
                      e.stopPropagation();
                      if (effectiveIsCustomizing) {
                        setInternalSelectedPanel(panel.id);
                        setInternalSelectedBackground(false);
                        setIsCustomizationModalOpen(true);
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      } else {
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      }
                    }
                  }
                }}
              >
                {renderPanel(panel)}
              </div>
            ))}

          {/* Mobile: RoadmapPanel (for project tokens) - only render if project token with roadmap or creator */}
          {token?.token_type === 'project' && (token?.roadmap?.length || effectiveIsCreator) && layout?.panels
            .filter((panel) => panel.type === 'RoadmapPanel')
            .map((panel) => (
              <div
                key={panel.id}
                data-panel={panel.id}
                className={isInEditMode ? 'cursor-pointer transition-all relative z-10' : ''}
                style={{
                  border: isInEditMode ? (effectiveSelectedPanel === panel.id ? '2px dashed #00eb2f' : '1px solid transparent') : 'none',
                  borderRadius: isInEditMode ? '0.75rem' : undefined,
                }}
                onClick={(e) => {
                  if (isInEditMode) {
                    const target = e.target as HTMLElement;
                    const isInteractive = target.closest('a, button, input, select, textarea, [role="button"]');
                    if (!isInteractive) {
                      e.stopPropagation();
                      if (effectiveIsCustomizing) {
                        setInternalSelectedPanel(panel.id);
                        setInternalSelectedBackground(false);
                        setIsCustomizationModalOpen(true);
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      } else {
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      }
                    }
                  }
                }}
              >
                {renderPanel(panel)}
              </div>
            ))}

          {/* Mobile: VestingInfoPanel (for project tokens with vesting) - only render if vesting enabled */}
          {token?.vesting_config?.enabled && layout?.panels
            .filter((panel) => panel.type === 'VestingInfoPanel')
            .map((panel) => (
              <div
                key={panel.id}
                data-panel={panel.id}
                className={isInEditMode ? 'cursor-pointer transition-all relative z-10' : ''}
                style={{
                  border: isInEditMode ? (effectiveSelectedPanel === panel.id ? '2px dashed #00eb2f' : '1px solid transparent') : 'none',
                  borderRadius: isInEditMode ? '0.75rem' : undefined,
                }}
                onClick={(e) => {
                  if (isInEditMode) {
                    const target = e.target as HTMLElement;
                    const isInteractive = target.closest('a, button, input, select, textarea, [role="button"]');
                    if (!isInteractive) {
                      e.stopPropagation();
                      if (effectiveIsCustomizing) {
                        setInternalSelectedPanel(panel.id);
                        setInternalSelectedBackground(false);
                        setIsCustomizationModalOpen(true);
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      } else {
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      }
                    }
                  }
                }}
              >
                {renderPanel(panel)}
              </div>
            ))}

          {/* Mobile: ThreadsPanel seventh */}
          {layout?.panels
            .filter((panel) => panel.type === 'ThreadsPanel' || panel.type === 'THREADSPanel')
            .map((panel) => (
              <div
                key={panel.id}
                data-panel={panel.id}
                className={isInEditMode ? 'cursor-pointer transition-all relative z-10' : ''}
                style={{
                  border: isInEditMode ? (effectiveSelectedPanel === panel.id ? '2px dashed #00eb2f' : '1px solid transparent') : 'none',
                  borderRadius: isInEditMode ? '0.75rem' : undefined,
                }}
                onClick={(e) => {
                  if (isInEditMode) {
                    const target = e.target as HTMLElement;
                    const isInteractive = target.closest('a, button, input, select, textarea, [role="button"]');
                    if (!isInteractive) {
                      e.stopPropagation();
                      if (effectiveIsCustomizing) {
                        setInternalSelectedPanel(panel.id);
                        setInternalSelectedBackground(false);
                        setIsCustomizationModalOpen(true);
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      } else {
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      }
                    }
                  }
                }}
              >
                {renderPanel(panel)}
              </div>
            ))}

          {/* Mobile: TopHoldersPanel - only show in edit mode */}
          {isInEditMode && layout?.panels
            .filter((panel) => panel.type === 'TopHoldersPanel')
            .map((panel) => (
              <div
                key={panel.id}
                data-panel={panel.id}
                className={isInEditMode ? 'cursor-pointer transition-all relative z-10' : ''}
                style={{
                  border: isInEditMode ? (effectiveSelectedPanel === panel.id ? '2px dashed #00eb2f' : '1px solid transparent') : 'none',
                  borderRadius: isInEditMode ? '0.75rem' : undefined,
                }}
                onClick={(e) => {
                  if (isInEditMode) {
                    const target = e.target as HTMLElement;
                    const isInteractive = target.closest('a, button, input, select, textarea, [role="button"]');
                    if (!isInteractive) {
                      e.stopPropagation();
                      if (effectiveIsCustomizing) {
                        setInternalSelectedPanel(panel.id);
                        setInternalSelectedBackground(false);
                        setIsCustomizationModalOpen(true);
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      } else {
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      }
                    }
                  }
                }}
              >
                {renderPanel(panel)}
              </div>
            ))}

          {/* Mobile: CommentsPanel last */}
          {layout?.panels
            .filter((panel) => panel.type === 'CommentsPanel')
            .map((panel) => (
              <div
                key={panel.id}
                data-panel={panel.id}
                className={isInEditMode ? 'cursor-pointer transition-all relative z-10' : ''}
                style={{
                  border: isInEditMode ? (effectiveSelectedPanel === panel.id ? '2px dashed #00eb2f' : '1px solid transparent') : 'none',
                  borderRadius: isInEditMode ? '0.75rem' : undefined,
                }}
                onClick={(e) => {
                  if (isInEditMode) {
                    const target = e.target as HTMLElement;
                    const isInteractive = target.closest('a, button, input, select, textarea, [role="button"]');
                    if (!isInteractive) {
                      e.stopPropagation();
                      if (effectiveIsCustomizing) {
                        setInternalSelectedPanel(panel.id);
                        setInternalSelectedBackground(false);
                        setIsCustomizationModalOpen(true);
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      } else {
                        if (onPanelSelect) onPanelSelect(panel.id);
                        if (onBackgroundSelect) onBackgroundSelect(false);
                      }
                    }
                  }
                }}
              >
                {renderPanel(panel)}
              </div>
            ))}
        </div>

        {/* Desktop Layout: Single column */}
        <div
          className="hidden lg:block max-w-5xl mx-auto relative"
        >
          <div
            className="grid grid-cols-8 gap-3"
          >
            {/* Render all panels in row order */}
            {layout?.panels
              .filter((panel) => {
                // Skip trade/chat/position panels
                if (panel.type === 'TradesPanel' || panel.type === 'ChatPanel' || panel.type === 'PositionPanel') return false;
                // Skip right column panels (BuySellPanel, BondingCurvePanel, TopHoldersPanel, RoadmapPanel)
                if (panel.type === 'BuySellPanel' || panel.type === 'BondingCurvePanel' || panel.type === 'TopHoldersPanel' || panel.type === 'RoadmapPanel') return false;
                // Skip ChartPanel on mobile (it's rendered in mobile layout instead)
                if (panel.type === 'ChartPanel' && isMobile) return false;
                // Skip VestingInfoPanel if vesting not enabled (prevents empty grid gap)
                if (panel.type === 'VestingInfoPanel' && !token?.vesting_config?.enabled) return false;
                return true;
              })
              .sort((a, b) => a.position.row - b.position.row)
              .map((panel) => (
                <div
                  key={panel.id}
                  data-panel={panel.id}
                  className={`
                    ${isInEditMode ? 'cursor-pointer transition-all relative z-10' : ''}
                  `}
                  style={{
                    gridColumn: `span ${panel.position.width}`,
                    border: isInEditMode ? (effectiveSelectedPanel === panel.id ? '2px dashed #00eb2f' : '1px solid transparent') : 'none',
                    borderRadius: isInEditMode ? '0.75rem' : undefined,
                  }}
                  onClick={(e) => {
                    if (isInEditMode) {
                      const target = e.target as HTMLElement;
                      const isInteractive = target.closest('a, button, input, select, textarea, [role="button"]');
                      if (!isInteractive) {
                        e.stopPropagation();
                        if (effectiveIsCustomizing) {
                          setInternalSelectedPanel(panel.id);
                          setInternalSelectedBackground(false);
                          setIsCustomizationModalOpen(true);
                          // Also notify parent if callbacks are provided
                          if (onPanelSelect) {
                            onPanelSelect(panel.id);
                          }
                          if (onBackgroundSelect) {
                            onBackgroundSelect(false);
                          }
                        } else {
                          if (onPanelSelect) {
                            onPanelSelect(panel.id);
                          }
                          if (onBackgroundSelect) {
                            onBackgroundSelect(false);
                          }
                        }
                      }
                    }
                  }}
                >
                  {renderPanel(panel)}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Customization Modal - shown when a panel or background is selected */}
      {effectiveIsCustomizing && (
        <TokenCustomizationModal
          isOpen={isCustomizationModalOpen}
          onClose={() => setIsCustomizationModalOpen(false)}
          selectedPanel={effectiveSelectedPanel}
          selectedPanelData={selectedPanelData}
          selectedBackground={effectiveSelectedBackground}
          canvasBackgroundColor={editCanvasBgColor}
          canvasBackgroundImage={editCanvasBgImage}
          canvasBackgroundSize={editCanvasBgSize}
          canvasBackgroundPosition={editCanvasBgPosition}
          onCanvasBackgroundColorChange={setEditCanvasBgColor}
          onCanvasBackgroundImageChange={setEditCanvasBgImage}
          onCanvasBackgroundSizeChange={setEditCanvasBgSize}
          onCanvasBackgroundPositionChange={setEditCanvasBgPosition}
          onPanelUpdate={handlePanelUpdate}
          onSave={handleSaveTokenLayout}
          isSaving={effectiveIsSaving}
          pendingFiles={pendingFiles}
          onPendingFilesChange={setPendingFiles}
          cropGenerators={cropGenerators}
          onCropGeneratorChange={handleCropGeneratorChange}
        />
      )}

      {/* Share Modal */}
      <ShareModal
        open={isShareModalOpen}
        onOpenChange={setIsShareModalOpen}
        tokenAddress={address || ''}
        tokenName={baseAsset?.name || token?.name}
        tokenSymbol={baseAsset?.symbol || token?.symbol}
        tokenDescription={token?.metadata?.description || token?.metadata?.tagline}
        tokenImage={token?.metadata?.logo || baseAsset?.icon}
        launchpad={baseAsset?.launchpad || 'Pump.Fun'}
      />

      {/* Roadmap Edit Modal */}
      <RoadmapEditModal
        open={isRoadmapEditModalOpen}
        onOpenChange={setIsRoadmapEditModalOpen}
        tokenAddress={address || ''}
        initialRoadmap={token?.roadmap || []}
        onRoadmapUpdated={(roadmap) => {
          setToken((prev: any) => prev ? { ...prev, roadmap } : prev);
        }}
      />

        </div>
    </div>
  );
}

