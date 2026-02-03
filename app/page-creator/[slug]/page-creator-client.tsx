'use client';

import { useState, useEffect } from 'react';

// Import all customizable panels
import { TokenNamePanel } from '@/components/panels/TokenNamePanel';
import { BuySellPanel } from '@/components/panels/BuySellPanel';
import { StatsPanel } from '@/components/panels/StatsPanel';
import { BondingCurvePanel } from '@/components/panels/BondingCurvePanel';
import { TopHoldersPanel } from '@/components/panels/TopHoldersPanel';
import { MetaPanel } from '@/components/panels/MetaPanel';
import { PositionPanel } from '@/components/panels/PositionPanel';
import { CommentsPanel } from '@/components/panels/CommentsPanel';
import { CommunityPanel } from '@/components/panels/CommunityPanel';
import { VideoPanel } from '@/components/panels/VideoPanel';

// Import tokenTest data hooks and providers
import { TokenChartProvider } from '@/contexts/TokenChartProvider';
import { TokenPageMsgHandler } from '@/components/Token/TokenPageMsgHandler';
import { TokenChart } from '@/components/TokenChart/TokenChart';
import type { PageWithAuthor } from '@/lib/types';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { TokenCustomizationModal, PendingImageFile, CropGeneratorFn } from '@/components/Token/TokenCustomizationModal';

interface PageLayout {
  panels: {
    id: string;
    type: string;
    position: { row: number; col: number; width: number; height: number };
    customization?: {
      backgroundColor?: string;
      textColor?: string;
      backgroundImage?: string;
      backgroundSize?: string;
      overlayColor?: string;
      overlayOpacity?: number;
    };
  }[];
}

interface BuilderLayout {
  elements?: any[];
  canvasBackgroundColor?: string;
  canvasBackgroundImage?: string;
  backgroundSize?: string;
}

interface PageCreatorClientProps {
  slug: string;
  initialPage: (PageWithAuthor & { discussion_count?: number }) | null;
  initialLayout: BuilderLayout | null;
}

export function PageCreatorClient({
  slug,
  initialPage,
  initialLayout,
}: PageCreatorClientProps) {
  const [page] = useState(initialPage);
  const [layout, setLayout] = useState<PageLayout | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [selectedPanel, setSelectedPanel] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedBackground, setSelectedBackground] = useState(false);
  const [canvasBackgroundColor, setCanvasBackgroundColor] = useState('#0c0c0e');
  const [canvasBackgroundImage, setCanvasBackgroundImage] = useState('');
  const [canvasBackgroundSize, setCanvasBackgroundSize] = useState<'cover' | 'contain' | 'repeat'>('cover');
  const [canvasBackgroundPosition, setCanvasBackgroundPosition] = useState('center center');
  const [isCustomizationModalOpen, setIsCustomizationModalOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingImageFile[]>([]);
  const [cropGenerators, setCropGenerators] = useState<Map<string, CropGeneratorFn>>(new Map());

  const handleCropGeneratorChange = (target: string, generator: CropGeneratorFn | null) => {
    setCropGenerators(prev => {
      const next = new Map(prev);
      if (generator) {
        next.set(target, generator);
      } else {
        next.delete(target);
      }
      return next;
    });
  };

  // Convert initial layout on mount
  useEffect(() => {
    if (initialPage) {
      // For now, show controls to all users for testing
      setIsCreator(true);
    }

    if (initialLayout) {
      // Set background properties
      setCanvasBackgroundColor(initialLayout.canvasBackgroundColor || '#0c0c0e');
      setCanvasBackgroundImage(initialLayout.canvasBackgroundImage || '');
      setCanvasBackgroundSize((initialLayout.backgroundSize as any) || 'cover');

      // Convert website-builder format to page layout format
      if (initialLayout.elements && Array.isArray(initialLayout.elements)) {
        const convertedLayout = convertWebsiteBuilderLayout(initialLayout);
        // Ensure MetaPanel is always included
        const hasMetaPanel = convertedLayout.panels.some((p: any) => p.type === 'MetaPanel');
        if (!hasMetaPanel) {
          const topHoldersIndex = convertedLayout.panels.findIndex((p: any) => p.type === 'TopHoldersPanel');
          const insertRow = topHoldersIndex >= 0
            ? convertedLayout.panels[topHoldersIndex].position.row
            : 4;
          const metaPanel = {
            id: 'meta',
            type: 'MetaPanel',
            position: { row: insertRow, col: 0, width: 12, height: 1 },
            customization: {},
          };
          if (topHoldersIndex >= 0) {
            convertedLayout.panels.splice(topHoldersIndex, 0, metaPanel);
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
  }, [initialPage, initialLayout]);

  const convertWebsiteBuilderLayout = (builderLayout: BuilderLayout): PageLayout => {
    const panelTypeMap: Record<string, string> = {
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
      'communitypanel': 'CommunityPanel',
      'Communitypanel': 'CommunityPanel',
      'communityPanel': 'CommunityPanel',
    };

    const splitConcatenatedWords = (word: string): string[] => {
      const commonWords = [
        'token', 'name', 'buy', 'sell', 'chart', 'stats', 'bonding', 'curve',
        'meta', 'top', 'holders', 'position', 'comments', 'community', 'video', 'trades', 'chat'
      ];

      const words: string[] = [];
      let remaining = word.toLowerCase();

      while (remaining.length > 0) {
        let found = false;
        for (const commonWord of commonWords.sort((a, b) => b.length - a.length)) {
          if (remaining.startsWith(commonWord)) {
            words.push(commonWord);
            remaining = remaining.slice(commonWord.length);
            found = true;
            break;
          }
        }
        if (!found) {
          words.push(remaining[0]);
          remaining = remaining.slice(1);
        }
      }

      return words;
    };

    const convertPanelType = (type: string): string => {
      const normalized = type.toLowerCase().trim();

      if (panelTypeMap[normalized]) {
        return panelTypeMap[normalized];
      }

      let withoutSuffix = normalized.replace(/-panel$/, '').replace(/panel$/, '');
      let words = withoutSuffix.split('-');

      if (words.length === 1 && withoutSuffix.length > 6) {
        const splitWords = splitConcatenatedWords(withoutSuffix);
        if (splitWords.length > 1) {
          words = splitWords;
        }
      }

      const pascalCase = words
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
      return pascalCase + 'Panel';
    };

    return {
      panels: (builderLayout.elements || [])
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
        .filter((panel: any) => panel.type !== 'TradesPanel' && panel.type !== 'ChatPanel'),
    };
  };

  const getDefaultLayout = (): PageLayout => {
    return {
      panels: [
        // === LEFT COLUMN (8 cols) ===
        // Row 0: Token name panel
        { id: 'token-name', type: 'TokenNamePanel', position: { row: 0, col: 0, width: 8, height: 1 }, customization: {} },
        // Row 1-3: Chart (spans 3 rows)
        { id: 'chart', type: 'ChartPanel', position: { row: 1, col: 0, width: 8, height: 3 }, customization: {} },
        // Row 4: Stats panel
        { id: 'stats', type: 'StatsPanel', position: { row: 4, col: 0, width: 8, height: 1 }, customization: {} },
        // Row 5: Meta panel
        { id: 'meta', type: 'MetaPanel', position: { row: 5, col: 0, width: 8, height: 1 }, customization: {} },
        // Row 6: Threads panel
        { id: 'threads', type: 'ThreadsPanel', position: { row: 6, col: 0, width: 8, height: 1 }, customization: {} },
        // Row 7-8: Comments panel (spans 2 rows)
        { id: 'comments', type: 'CommentsPanel', position: { row: 7, col: 0, width: 8, height: 2 }, customization: {} },
        // === RIGHT COLUMN (4 cols) ===
        // Row 0-2: Buy/Sell panel (spans 3 rows)
        { id: 'buy-sell', type: 'BuySellPanel', position: { row: 0, col: 8, width: 4, height: 3 }, customization: {} },
        // Row 3: Bonding curve panel
        { id: 'bonding-curve', type: 'BondingCurvePanel', position: { row: 3, col: 8, width: 4, height: 1 }, customization: {} },
        // Row 4-8: Top holders panel (spans 5 rows)
        { id: 'holders', type: 'TopHoldersPanel', position: { row: 4, col: 8, width: 4, height: 5 }, customization: {} },
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

  const handleSaveLayout = async () => {
    if (!page || !layout) return;

    setIsSaving(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        toast.error('Please sign in to save the layout');
        setIsSaving(false);
        return;
      }

      const convertPanelTypeToKebab = (type: string): string => {
        const withoutPanel = type.replace(/Panel$/, '');
        const withHyphens = withoutPanel.replace(/([A-Z])/g, '-$1').toLowerCase();
        return withHyphens.replace(/^-/, '') + '-panel';
      };

      const websiteBuilderLayout = {
        elements: layout.panels.map((panel) => ({
          id: panel.id,
          type: convertPanelTypeToKebab(panel.type),
          content: '',
          styles: {
            backgroundColor: panel.customization?.backgroundColor,
            color: panel.customization?.textColor,
            backgroundImage: panel.customization?.backgroundImage,
            backgroundSize: panel.customization?.backgroundSize,
            overlayColor: panel.customization?.overlayColor,
            overlayOpacity: panel.customization?.overlayOpacity,
          },
          position: {
            x: panel.position.col,
            y: panel.position.row,
            colSpan: panel.position.width,
          },
        })),
        canvasBackgroundColor: canvasBackgroundColor || '#0c0c0e',
        canvasBackgroundImage: canvasBackgroundImage || '',
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

  const renderPanel = (panel: any) => {
    const props = {
      ...panel.customization,
      page,
      pageId: page?.id,
    };

    switch (panel.type) {
      case 'TokenNamePanel': {
        const pageName = page?.title || 'Page Title';
        const pageDescription = page?.description || '';
        const username = page?.author?.username || 'Unknown';
        const timeAgo = page?.created_at ? (() => {
          const createdAt = new Date(page.created_at);
          const now = new Date();
          const diffMs = now.getTime() - createdAt.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMs / 3600000);
          const diffDays = Math.floor(diffMs / 86400000);

          if (diffMins < 60) return `${diffMins}m ago`;
          if (diffHours < 24) return `${diffHours}h ago`;
          return `${diffDays}d ago`;
        })() : 'Unknown';

        return (
          <TokenNamePanel
            name={pageName}
            subtitle={pageDescription}
            address={slug}
            username={username}
            timeAgo={timeAgo}
            {...props}
          />
        );
      }
      case 'BuySellPanel':
        return <BuySellPanel {...props} />;
      case 'ChartPanel':
        return (
          <div
            className="flex flex-col h-[300px] lg:h-[500px] w-full rounded-lg overflow-hidden relative"
            style={{ padding: props.backgroundColor || props.backgroundImage ? '0.5rem' : '0' }}
          >
            <div className="absolute inset-0 rounded-lg" style={{ zIndex: 0 }}>
              {props.overlayColor && props.overlayOpacity !== undefined && props.overlayOpacity > 0 && (
                <div
                  className="absolute inset-0 rounded-lg"
                  style={{
                    backgroundColor: props.overlayColor,
                    opacity: props.overlayOpacity,
                    zIndex: 2,
                    pointerEvents: 'none',
                  }}
                />
              )}
              <div
                className="absolute inset-0 rounded-lg"
                style={{
                  backgroundColor: props.backgroundImage ? 'transparent' : (props.backgroundColor || '#24262B'),
                  backgroundImage: props.backgroundImage ? `url(${props.backgroundImage})` : undefined,
                  backgroundSize: props.backgroundSize === 'cover' ? 'cover' : props.backgroundSize === 'contain' ? 'contain' : props.backgroundSize === 'repeat' ? 'auto' : 'cover',
                  backgroundRepeat: props.backgroundSize === 'repeat' ? 'repeat' : 'no-repeat',
                  backgroundPosition: 'center',
                  zIndex: 1,
                }}
              />
            </div>
            <div className="relative" style={{ zIndex: 2 }}>
              <TokenChartProvider>
                <TokenChart renderingId="page-creator" />
              </TokenChartProvider>
            </div>
          </div>
        );
      case 'StatsPanel':
        return <StatsPanel {...props} />;
      case 'BondingCurvePanel':
        return <BondingCurvePanel {...props} />;
      case 'MetaPanel':
        return (
          <MetaPanel
            token={{ metadata: { description: page?.description || '' } }}
            {...props}
          />
        );
      case 'TopHoldersPanel':
        return <TopHoldersPanel {...props} />;
      case 'PositionPanel':
        return <PositionPanel {...props} />;
      case 'CommentsPanel':
        return <CommentsPanel pageId={page?.id} {...props} />;
      case 'CommunityPanel':
        return <CommunityPanel {...props} />;
      case 'VideoPanel':
        return <VideoPanel {...props} />;
      default:
        return (
          <div className="p-4 border border-red-500 rounded bg-red-500/10">
            <p className="text-red-500 font-bold">Unknown panel type: {panel.type}</p>
            <p className="text-sm text-red-400 mt-2">Panel ID: {panel.id}</p>
          </div>
        );
    }
  };

  if (!page) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Page not found</p>
      </div>
    );
  }

  if (!layout) {
    return null;
  }

  return (
    <div className="min-h-screen">
      {/* Page Content */}
      <div className="flex-1 flex gap-4 p-4">
        <div
          className="flex-1 relative"
          style={{
            backgroundColor: canvasBackgroundColor,
            backgroundImage: canvasBackgroundImage ? `url(${canvasBackgroundImage})` : undefined,
            backgroundSize: canvasBackgroundSize === 'cover' ? 'cover' : canvasBackgroundSize === 'contain' ? 'contain' : 'auto',
            backgroundRepeat: canvasBackgroundSize === 'repeat' ? 'repeat' : 'no-repeat',
            backgroundPosition: 'center',
            minHeight: '100vh',
            padding: '1rem',
            borderRadius: '8px',
            border: selectedBackground ? '1px dashed #f97316' : '1px solid transparent',
            cursor: 'pointer',
          }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target === e.currentTarget) {
              setSelectedBackground(true);
              setSelectedPanel(null);
              setIsCustomizationModalOpen(true);
            }
          }}
        >
          {/* Floating action bar */}
          {isCreator && (
            <div
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-background/95 border border-border shadow-lg w-[calc(100%-24px)] sm:w-auto max-w-md sm:max-w-none"
              style={{ backdropFilter: 'blur(8px)' }}
            >
              <span className="text-xs sm:text-sm text-muted-foreground text-center w-full sm:w-auto">Click any panel or background to customize</span>
            </div>
          )}
          <TokenPageMsgHandler />
          <div
            className="grid grid-cols-12 max-w-[1400px] mx-auto relative gap-4"
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (!target.closest('[data-panel]') && target.classList.contains('grid')) {
                setSelectedBackground(true);
                setSelectedPanel(null);
                setIsCustomizationModalOpen(true);
              }
            }}
          >
            {layout.panels
              .filter((panel) => panel.type !== 'TradesPanel' && panel.type !== 'ChatPanel')
              .map((panel) => (
                <div
                  key={panel.id}
                  data-panel={panel.id}
                  className={`
                    col-span-${panel.position.width}
                    row-span-${panel.position.height}
                    min-h-[200px]
                    cursor-pointer transition-all relative z-10
                  `}
                  style={{
                    gridColumn: `span ${panel.position.width}`,
                    gridRow: `span ${panel.position.height}`,
                    border: selectedPanel === panel.id ? '1px dashed #f97316' : '1px solid transparent',
                    borderRadius: '0.75rem',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPanel(panel.id);
                    setSelectedBackground(false);
                    setIsCustomizationModalOpen(true);
                  }}
                >
                  {renderPanel(panel)}
                </div>
              ))}
          </div>
        </div>

        {/* Customization Modal */}
        <TokenCustomizationModal
          isOpen={isCustomizationModalOpen}
          onClose={() => setIsCustomizationModalOpen(false)}
          selectedPanel={selectedPanel}
          selectedPanelData={selectedPanelData || null}
          selectedBackground={selectedBackground}
          canvasBackgroundColor={canvasBackgroundColor}
          canvasBackgroundImage={canvasBackgroundImage}
          canvasBackgroundSize={canvasBackgroundSize}
          canvasBackgroundPosition={canvasBackgroundPosition}
          onCanvasBackgroundColorChange={setCanvasBackgroundColor}
          onCanvasBackgroundImageChange={setCanvasBackgroundImage}
          onCanvasBackgroundSizeChange={setCanvasBackgroundSize}
          onCanvasBackgroundPositionChange={setCanvasBackgroundPosition}
          onPanelUpdate={(panelId, customization) => updatePanel(panelId, { customization })}
          onSave={handleSaveLayout}
          isSaving={isSaving}
          pendingFiles={pendingFiles}
          onPendingFilesChange={setPendingFiles}
          cropGenerators={cropGenerators}
          onCropGeneratorChange={handleCropGeneratorChange}
        />
      </div>
    </div>
  );
}
