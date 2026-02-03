'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';

// Import shared component
import { TokenPageContent } from '@/components/Token/TokenPageContent';

// Import providers
import { DataStreamProvider } from '@/contexts/DataStreamProvider';
import { TokenChartProvider } from '@/contexts/TokenChartProvider';

import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { PageWithAuthor } from '@/lib/types';

// Import the layout type from TokenPageContent
import type { TokenPageLayout } from '@/components/Token/TokenPageContent';

type PageLayout = TokenPageLayout;

function PageCreatorContent() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [page, setPage] = useState<PageWithAuthor | null>(null);
  const [layout, setLayout] = useState<PageLayout | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreator, setIsCreator] = useState(false);
  const [selectedPanel, setSelectedPanel] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedBackground, setSelectedBackground] = useState(false);
  const [canvasBackgroundColor, setCanvasBackgroundColor] = useState('#0c0c0e');
  const [canvasBackgroundImage, setCanvasBackgroundImage] = useState('');
  const [canvasBackgroundSize, setCanvasBackgroundSize] = useState<'cover' | 'contain' | 'repeat'>('cover');
  const [isUploadingBackgroundImage, setIsUploadingBackgroundImage] = useState(false);
  const [isUploadingPanelImage, setIsUploadingPanelImage] = useState(false);
  const [selectedBackgroundImageFile, setSelectedBackgroundImageFile] = useState<File | null>(null);
  const [backgroundImagePreview, setBackgroundImagePreview] = useState<string | null>(null);
  const [selectedPanelImageFiles, setSelectedPanelImageFiles] = useState<Record<string, File>>({});
  const [panelImagePreviews, setPanelImagePreviews] = useState<Record<string, string>>({});
  const backgroundImageInputRef = useRef<HTMLInputElement>(null);
  const panelImageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Clean up preview URLs on unmount
  useEffect(() => {
    return () => {
      if (backgroundImagePreview) {
        URL.revokeObjectURL(backgroundImagePreview);
      }
      Object.values(panelImagePreviews).forEach(preview => {
        if (preview) {
          URL.revokeObjectURL(preview);
        }
      });
    };
  }, [backgroundImagePreview, panelImagePreviews]);

  // Load page data and layout
  useEffect(() => {
    const loadPage = async () => {
      if (!slug) return;

      setIsLoading(true);
      try {
        // Fetch page data
        const pageResponse = await fetch(`/api/pages/slug/${slug}`);
        if (pageResponse.ok) {
          const pageData = await pageResponse.json();
          setPage(pageData);

          // Check if current user is the creator
          // TODO: Implement proper wallet check
          // For now, show controls to all users for testing
          setIsCreator(true);

          // Fetch custom layout from database
          const layoutResponse = await fetch(`/api/pages/${pageData.id}/layout`);
          if (layoutResponse.ok) {
            const layoutData = await layoutResponse.json();
            if (layoutData.layout) {
              // Set background properties (always set, even if empty/null to clear previous values)
              setCanvasBackgroundColor(layoutData.layout.canvasBackgroundColor || '#0c0c0e');
              setCanvasBackgroundImage(layoutData.layout.canvasBackgroundImage || '');
              setCanvasBackgroundSize(layoutData.layout.backgroundSize || 'cover');

              // Convert website-builder format to page layout format
              if (layoutData.layout.elements && Array.isArray(layoutData.layout.elements)) {
                const convertedLayout = convertWebsiteBuilderLayout(layoutData.layout);
                // Ensure MetaPanel is always included
                const hasMetaPanel = convertedLayout.panels.some((p: any) => p.type === 'MetaPanel');
                if (!hasMetaPanel) {
                  // Find the row after bonding curve panel (row 3) or before TopHoldersPanel
                  const topHoldersIndex = convertedLayout.panels.findIndex((p: any) => p.type === 'TopHoldersPanel');
                  const insertRow = topHoldersIndex >= 0 
                    ? convertedLayout.panels[topHoldersIndex].position.row 
                    : 4;
                  // Insert MetaPanel before TopHoldersPanel
                  const metaPanel = {
                    id: 'meta',
                    type: 'MetaPanel',
                    position: { row: insertRow, col: 0, width: 12, height: 1 },
                    customization: {},
                  };
                  if (topHoldersIndex >= 0) {
                    convertedLayout.panels.splice(topHoldersIndex, 0, metaPanel);
                    // Adjust row numbers for panels after MetaPanel
                    convertedLayout.panels.forEach((p: any) => {
                      if (p.position.row >= insertRow && p.id !== 'meta') {
                        p.position.row += 1;
                      }
                    });
                  } else {
                    convertedLayout.panels.push(metaPanel);
                  }
                }
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
        } else {
          console.error('Page not found');
        }
      } catch (error) {
        console.error('Error fetching page:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (slug) {
      loadPage();
    }
  }, [slug]);

  const convertWebsiteBuilderLayout = (builderLayout: any): PageLayout => {
    // Convert website-builder format to page layout format
    // Mapping table to ensure correct panel type conversion
    const panelTypeMap: Record<string, string> = {
      // Standard kebab-case formats
      'token-name-panel': 'TokenNamePanel',
      'buy-sell-panel': 'BuySellPanel',
      'chart-panel': 'ChartPanel',
      'stats-panel': 'StatsPanel',
      'bonding-curve-panel': 'BondingCurvePanel',
      'meta-panel': 'MetaPanel',
      'top-holders-panel': 'TopHoldersPanel',
      'position-panel': 'PositionPanel',
      'comments-panel': 'CommentsPanel',
      'community-panel': 'CommunityPanel',
      'video-panel': 'VideoPanel',
      'threads-panel': 'ThreadsPanel',
      // Handle case variations and missing hyphens
      'tokenname-panel': 'TokenNamePanel',
      'tokennamepanel': 'TokenNamePanel',
      'TokennamePanel': 'TokenNamePanel',
      'buysell-panel': 'BuySellPanel',
      'buysellpanel': 'BuySellPanel',
      'BuysellPanel': 'BuySellPanel',
      'bondingcurve-panel': 'BondingCurvePanel',
      'bondingcurvepanel': 'BondingCurvePanel',
      'BondingcurvePanel': 'BondingCurvePanel',
      'topholders-panel': 'TopHoldersPanel',
      'topholderspanel': 'TopHoldersPanel',
      'TopholdersPanel': 'TopHoldersPanel',
      // Community panel variations
      'communitypanel': 'CommunityPanel',
      'Communitypanel': 'CommunityPanel',
      'communityPanel': 'CommunityPanel',
      // Threads panel variations
      'threadspanel': 'ThreadsPanel',
      'Threadspanel': 'ThreadsPanel',
      'threadsPanel': 'ThreadsPanel',
      'THREADSPanel': 'ThreadsPanel',
      'THREADS-PANEL': 'ThreadsPanel',
    };

    // Helper function to split concatenated words (e.g., "buysell" -> ["buy", "sell"])
    const splitConcatenatedWords = (word: string): string[] => {
      // Common word patterns for panel types
      const commonWords = [
        'token', 'name', 'buy', 'sell', 'chart', 'stats', 'bonding', 'curve',
        'meta', 'top', 'holders', 'position', 'comments', 'community', 'video', 'trades', 'chat', 'threads'
      ];
      
      // Try to find word boundaries by matching against common words
      const words: string[] = [];
      let remaining = word.toLowerCase();
      
      while (remaining.length > 0) {
        let found = false;
        // Try to match longest words first
        for (const commonWord of commonWords.sort((a, b) => b.length - a.length)) {
          if (remaining.startsWith(commonWord)) {
            words.push(commonWord);
            remaining = remaining.slice(commonWord.length);
            found = true;
            break;
          }
        }
        if (!found) {
          // If no match found, take the first character and continue
          words.push(remaining[0]);
          remaining = remaining.slice(1);
        }
      }
      
      return words;
    };

    const convertPanelType = (type: string): string => {
      // Normalize the type (lowercase, remove extra spaces)
      const normalized = type.toLowerCase().trim();

      // Check mapping table first
      if (panelTypeMap[normalized]) {
        return panelTypeMap[normalized];
      }

      // Fallback: Remove -panel suffix and convert to PascalCase
      // e.g., "token-name-panel" -> "TokenNamePanel"
      // e.g., "buy-sell-panel" -> "BuySellPanel"
      let withoutSuffix = normalized.replace(/-panel$/, '').replace(/panel$/, '');
      
      // Split by hyphens first
      let words = withoutSuffix.split('-');
      
      // If we only have one word and it's likely concatenated (no hyphens), try to split it
      if (words.length === 1 && withoutSuffix.length > 6) {
        // Try to split concatenated words (e.g., "buysell" -> ["buy", "sell"])
        const splitWords = splitConcatenatedWords(withoutSuffix);
        if (splitWords.length > 1) {
          words = splitWords;
        }
      }

      // Standard conversion: capitalize each word and join
      const pascalCase = words
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
      const result = pascalCase + 'Panel';

      return result;
    };

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
            overlayColor: el.styles?.overlayColor,
            overlayOpacity: el.styles?.overlayOpacity,
          },
        }))
        .filter((panel: any) => panel.type !== 'TradesPanel' && panel.type !== 'ChatPanel'), // Filter out TradesPanel and ChatPanel
    };
  };

  const getDefaultLayout = (): PageLayout => {
    return {
      panels: [
        // === LEFT COLUMN (8 cols) ===
        // Row 0: Token name panel
        {
          id: 'token-name',
          type: 'TokenNamePanel',
          position: { row: 0, col: 0, width: 8, height: 1 },
          customization: {},
        },
        // Row 1-3: Chart (spans 3 rows)
        {
          id: 'chart',
          type: 'ChartPanel',
          position: { row: 1, col: 0, width: 8, height: 3 },
          customization: {},
        },
        // Row 4: Stats panel
        {
          id: 'stats',
          type: 'StatsPanel',
          position: { row: 4, col: 0, width: 8, height: 1 },
          customization: {},
        },
        // Row 5: Meta panel
        {
          id: 'meta',
          type: 'MetaPanel',
          position: { row: 5, col: 0, width: 8, height: 1 },
          customization: {},
        },
        // Row 6: Threads panel
        {
          id: 'threads',
          type: 'ThreadsPanel',
          position: { row: 6, col: 0, width: 8, height: 1 },
          customization: {},
        },
        // Row 7-8: Comments panel (spans 2 rows)
        {
          id: 'comments',
          type: 'CommentsPanel',
          position: { row: 7, col: 0, width: 8, height: 2 },
          customization: {},
        },
        // === RIGHT COLUMN (4 cols) ===
        // Row 0-2: Buy/Sell panel (spans 3 rows)
        {
          id: 'buy-sell',
          type: 'BuySellPanel',
          position: { row: 0, col: 8, width: 4, height: 3 },
          customization: {},
        },
        // Row 3: Bonding curve panel
        {
          id: 'bonding-curve',
          type: 'BondingCurvePanel',
          position: { row: 3, col: 8, width: 4, height: 1 },
          customization: {},
        },
        // Row 4-8: Top holders panel (spans 5 rows)
        {
          id: 'holders',
          type: 'TopHoldersPanel',
          position: { row: 4, col: 8, width: 4, height: 5 },
          customization: {},
        },
      ],
    };
  };

  const updatePanel = (panelId: string, updates: Partial<PageLayout['panels'][0]>) => {
    if (!layout) return;
    
    setLayout({
      ...layout,
      panels: layout.panels.map((panel) =>
        panel.id === panelId ? { ...panel, ...updates } : panel
      ),
    });
  };

  // Handle background image selection (store file, create preview, don't upload yet)
  const handleBackgroundImageSelect = (file: File) => {
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type', {
        description: 'Please upload a JPEG, PNG, GIF, or WebP image.',
        duration: 5000,
      });
      return;
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error('File too large', {
        description: 'Please upload an image smaller than 10MB.',
        duration: 5000,
      });
      return;
    }

    // Clean up previous preview if exists
    if (backgroundImagePreview) {
      URL.revokeObjectURL(backgroundImagePreview);
    }

    // Store file and create preview
    setSelectedBackgroundImageFile(file);
    const previewUrl = URL.createObjectURL(file);
    setBackgroundImagePreview(previewUrl);
    toast.success('Image selected. Click "Save Layout" to upload.');
  };

  // Handle file input change
  const handleBackgroundImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleBackgroundImageSelect(file);
    }
    // Reset input so the same file can be selected again
    if (backgroundImageInputRef.current) {
      backgroundImageInputRef.current.value = '';
    }
  };

  // Upload background image (called when saving layout)
  const uploadBackgroundImage = async (file: File): Promise<string> => {
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

    // Upload to API
    const response = await fetch('/api/upload/page-layout-image', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to upload image');
    }

    return data.url;
  };

  // Handle panel background image selection (store file, create preview, don't upload yet)
  const handlePanelImageSelect = (file: File, panelId: string) => {
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type', {
        description: 'Please upload a JPEG, PNG, GIF, or WebP image.',
        duration: 5000,
      });
      return;
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error('File too large', {
        description: 'Please upload an image smaller than 10MB.',
        duration: 5000,
      });
      return;
    }

    // Clean up previous preview if exists
    if (panelImagePreviews[panelId]) {
      URL.revokeObjectURL(panelImagePreviews[panelId]);
    }

    // Store file and create preview
    const previewUrl = URL.createObjectURL(file);
    setSelectedPanelImageFiles(prev => ({ ...prev, [panelId]: file }));
    setPanelImagePreviews(prev => ({ ...prev, [panelId]: previewUrl }));
    toast.success('Image selected. Click "Save Layout" to upload.');
  };

  // Handle panel image file input change
  const handlePanelImageFileChange = (e: React.ChangeEvent<HTMLInputElement>, panelId: string) => {
    const file = e.target.files?.[0];
    if (file) {
      handlePanelImageSelect(file, panelId);
    }
    // Reset input so the same file can be selected again
    const inputRef = panelImageInputRefs.current[panelId];
    if (inputRef) {
      inputRef.value = '';
    }
  };

  // Upload panel image (called when saving layout)
  const uploadPanelImage = async (file: File): Promise<string> => {
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

    // Upload to API
    const response = await fetch('/api/upload/page-layout-image', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to upload image');
    }

    return data.url;
  };

  const handleSaveLayout = async () => {
      if (!page || !layout) return;

      setIsSaving(true);
      try {
        // Upload background image if a file is selected
        let finalBackgroundImage = canvasBackgroundImage;
        if (selectedBackgroundImageFile) {
          setIsUploadingBackgroundImage(true);
          try {
            toast.info('Uploading background image...');
            finalBackgroundImage = await uploadBackgroundImage(selectedBackgroundImageFile);
            setCanvasBackgroundImage(finalBackgroundImage);
            // Clean up preview
            if (backgroundImagePreview) {
              URL.revokeObjectURL(backgroundImagePreview);
              setBackgroundImagePreview(null);
            }
            setSelectedBackgroundImageFile(null);
            toast.success('Background image uploaded!');
          } catch (error: any) {
            console.error('Error uploading background image:', error);
            toast.error('Failed to upload background image', {
              description: error.message || 'Please try again.',
              duration: 5000,
            });
            setIsSaving(false);
            setIsUploadingBackgroundImage(false);
            return;
          } finally {
            setIsUploadingBackgroundImage(false);
          }
        }

        // Upload panel images if files are selected
        const uploadedPanelImages: Record<string, string> = {};
        if (Object.keys(selectedPanelImageFiles).length > 0) {
          setIsUploadingPanelImage(true);
          try {
            toast.info('Uploading panel images...');
            const uploadPromises = Object.entries(selectedPanelImageFiles).map(async ([panelId, file]) => {
              const imageUrl = await uploadPanelImage(file);
              uploadedPanelImages[panelId] = imageUrl;
              // Update the panel in the layout state
              if (layout) {
                setLayout(prevLayout => {
                  if (!prevLayout) return prevLayout;
                  return {
                    ...prevLayout,
                    panels: prevLayout.panels.map(panel =>
                      panel.id === panelId
                        ? {
                            ...panel,
                            customization: {
                              ...panel.customization,
                              backgroundImage: imageUrl,
                            },
                          }
                        : panel
                    ),
                  };
                });
              }
              // Clean up preview
              if (panelImagePreviews[panelId]) {
                URL.revokeObjectURL(panelImagePreviews[panelId]);
              }
              return { panelId, imageUrl };
            });
            
            await Promise.all(uploadPromises);
            setSelectedPanelImageFiles({});
            setPanelImagePreviews({});
            toast.success('Panel images uploaded!');
          } catch (error: any) {
            console.error('Error uploading panel images:', error);
            toast.error('Failed to upload panel images', {
              description: error.message || 'Please try again.',
              duration: 5000,
            });
            setIsSaving(false);
            setIsUploadingPanelImage(false);
            return;
          } finally {
            setIsUploadingPanelImage(false);
          }
        }
      // Get authentication token from Supabase session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        toast.error('Please sign in to save the layout');
        setIsSaving(false);
        return;
      }

      // Convert page layout format back to website-builder format for saving
      const convertPanelTypeToKebab = (type: string): string => {
        // Convert "TokenNamePanel" -> "token-name-panel"
        // Convert "BuySellPanel" -> "buy-sell-panel"
        const withoutPanel = type.replace(/Panel$/, '');
        // Insert hyphens before capital letters (except the first one)
        const withHyphens = withoutPanel.replace(/([A-Z])/g, '-$1').toLowerCase();
        // Remove leading hyphen if present
        return withHyphens.replace(/^-/, '') + '-panel';
      };

      // Build the layout with uploaded image URLs
      // Use uploadedPanelImages map to override any panel background images that were just uploaded
      const websiteBuilderLayout = {
        elements: layout.panels.map((panel) => {
          // Use uploaded image URL if available, otherwise use existing customization
          const backgroundImage = uploadedPanelImages[panel.id] || panel.customization?.backgroundImage;
          return {
            id: panel.id,
            type: convertPanelTypeToKebab(panel.type),
            content: '',
            styles: {
              backgroundColor: panel.customization?.backgroundColor,
              color: panel.customization?.textColor,
              backgroundImage: backgroundImage,
              backgroundSize: panel.customization?.backgroundSize,
              overlayColor: panel.customization?.overlayColor,
              overlayOpacity: panel.customization?.overlayOpacity,
            },
            position: {
              x: panel.position.col,
              y: panel.position.row,
              colSpan: panel.position.width,
            },
          };
        }),
        canvasBackgroundColor: canvasBackgroundColor || '#0c0c0e',
        canvasBackgroundImage: finalBackgroundImage || '',
        backgroundSize: canvasBackgroundSize || 'cover',
      };

      const response = await fetch(`/api/pages/${page.id}/layout`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ layout: websiteBuilderLayout }),
      });

      if (response.ok) {
        toast.success('Layout saved successfully!');
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save layout');
      }
    } catch (error: any) {
      console.error('Error saving layout:', error);
      toast.error(error.message || 'Failed to save layout');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedPanelData = layout?.panels.find((p) => p.id === selectedPanel);
  

  if (isLoading) {
    return (
      <div className="min-h-screen">
        {/* Page content skeleton - matches TokenPageContent two-column layout */}
        <div className="flex-1 flex gap-4 py-4">
          <div className="flex-1">
            <div className="flex items-start max-w-[1200px] mx-auto relative gap-4">
              {/* Left Column */}
              <div className="flex-1 flex flex-col gap-4">
                {/* Token name panel */}
                <div className="h-24 w-full bg-muted rounded-xl animate-pulse" />
                {/* Chart panel */}
                <div className="h-80 w-full bg-muted rounded-xl animate-pulse" />
                {/* Stats panel */}
                <div className="h-28 w-full bg-muted rounded-xl animate-pulse" />
                {/* Meta panel */}
                <div className="h-32 w-full bg-muted rounded-xl animate-pulse" />
                {/* Threads panel */}
                <div className="h-48 w-full bg-muted rounded-xl animate-pulse" />
                {/* Comments panel */}
                <div className="h-64 w-full bg-muted rounded-xl animate-pulse" />
              </div>

              {/* Right Column */}
              <div className="w-[33.333%] flex-shrink-0">
                <div className="sticky top-20 flex flex-col gap-4">
                  {/* Buy/Sell panel */}
                  <div className="h-96 w-full bg-muted rounded-xl animate-pulse" />
                  {/* Bonding curve panel */}
                  <div className="h-32 w-full bg-muted rounded-xl animate-pulse" />
                  {/* Top holders panel */}
                  <div className="h-64 w-full bg-muted rounded-xl animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating action bar skeleton */}
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-background/95 border border-border shadow-lg"
          style={{ backdropFilter: 'blur(8px)' }}
        >
          <div className="h-4 w-64 bg-muted rounded animate-pulse" />
          <div className="h-8 w-16 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Page Content */}
      <div className="flex-1 flex gap-4 py-4">
        <div className="flex-1 relative">
          {/* Use shared TokenPageContent component with modal customization */}
          <TokenPageContent
            page={page}
            pageSlug={slug}
            canvasBackgroundColor={canvasBackgroundColor}
            canvasBackgroundImage={backgroundImagePreview || canvasBackgroundImage}
            canvasBackgroundSize={canvasBackgroundSize}
            isCreator={isCreator}
            isCustomizing={isCreator}
            selectedPanel={selectedPanel}
            selectedBackground={selectedBackground}
            onPanelSelect={setSelectedPanel}
            onBackgroundSelect={setSelectedBackground}
            onSaveLayout={handleSaveLayout}
            isSaving={isSaving}
            externalLayout={layout ? {
              ...layout,
              panels: layout.panels.map(panel => {
                const panelId = panel.id;
                const previewUrl = panelImagePreviews[panelId];
                if (previewUrl) {
                  return {
                    ...panel,
                    customization: {
                      ...panel.customization,
                      backgroundImage: previewUrl,
                    },
                  };
                }
                return panel;
              }),
            } : null}
            onLayoutChange={(newLayout) => {
              setLayout(newLayout);
            }}
            onCanvasBackgroundColorChange={setCanvasBackgroundColor}
            onCanvasBackgroundImageChange={setCanvasBackgroundImage}
            onCanvasBackgroundSizeChange={setCanvasBackgroundSize}
            onExitCustomization={() => router.push('/page-creator')}
          />
        </div>
      </div>
    </div>
  );
}

export default function PageCreatorSlugPage() {
  return (
    <DataStreamProvider>
      <TokenChartProvider>
        <PageCreatorContent />
      </TokenChartProvider>
    </DataStreamProvider>
  );
}
