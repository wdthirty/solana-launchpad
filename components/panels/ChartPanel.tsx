'use client';

import React, { useEffect, useRef, memo } from 'react';
import { Calendar, Search, Magnet, Lock, Trash2 } from 'lucide-react';
import { parseBackgroundPosition } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface ChartPanelProps {
  tokenSymbol?: string;
  marketCap?: string;
  change24h?: string;
  ath?: string;
  athProgress?: number;
  isAtAth?: boolean;
  timeframe?: string;
  currentPrice?: string;
  volume?: string;
  backgroundColor?: string;
  textColor?: string;
  upColor?: string;
  downColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  textBackgroundColor?: string;
  isLoading?: boolean;
}

// Glow keyframes for ATH
const glowKeyframes = `
@keyframes athGlow {
  0%, 100% { box-shadow: 0 0 8px 2px #00eb2f; }
  50% { box-shadow: 0 0 3px 1px #00eb2f40; }
}
`;

export const ChartPanel = memo(function ChartPanel({
  tokenSymbol = 'TOKEN',
  marketCap = '$5.7K',
  change24h = '-$2.7K (-31.80%) 24hr',
  ath = '$58.9K',
  athProgress = 10,
  isAtAth = false,
  timeframe = '15m',
  currentPrice = '5.7K',
  volume = '1.4',
  backgroundColor,
  textColor,
  upColor,
  downColor,
  backgroundImage,
  backgroundSize,
  backgroundPosition,
  textBackgroundColor,
  isLoading = false
}: ChartPanelProps) {
  const bgPos = parseBackgroundPosition(backgroundPosition);
  const tradingViewContainer = useRef<HTMLDivElement>(null);
  // Helper for text background style - apply when any custom background exists (image or color)
  const hasCustomBackground = backgroundImage || (backgroundColor && backgroundColor !== '#111114');
  const textBgStyle = hasCustomBackground ? {
    backgroundColor: `${textBackgroundColor || '#0c0c0e'}cc`,
  } : undefined;

  useEffect(() => {
    const container = tradingViewContainer.current;
    if (!container) return;

    // Clear existing content
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = `
      {
        "autosize": true,
        "symbol": "BINANCE:BTCUSDT",
        "interval": "15",
        "theme": "dark",
        "style": "1",
        "locale": "en",
        "toolbar_bg": "#1A1B1F",
        "enable_publishing": false,
        "allow_symbol_change": true,
        "hide_top_toolbar": false,
        "hide_legend": false,
        "save_image": false,
        "calendar": false,
        "support_host": "https://www.tradingview.com",
        "height": 400,
        "container_id": "tradingview_container",
        "hide_side_toolbar": true,
        "details": false,
        "hotlist": false,
        "watchlist": [],
        "timezone": "Etc/UTC",
        "hide_volume": false,
        "withdateranges": false,
        "compareSymbols": [],
        "studies": [],
        "overrides": {
          "paneProperties.background": "${backgroundColor || '#1A1B1F'}",
          "paneProperties.backgroundType": "solid",
          "mainSeriesProperties.candleStyle.upColor": "${upColor || '#34C759'}",
          "mainSeriesProperties.candleStyle.downColor": "${downColor || '#FF3B30'}",
          "mainSeriesProperties.candleStyle.wickUpColor": "${upColor || '#34C759'}",
          "mainSeriesProperties.candleStyle.wickDownColor": "${downColor || '#FF3B30'}"
        }
      }`;
    
    container.appendChild(script);

    // Cleanup function
    return () => {
      if (container) {
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      }
    };
  }, [backgroundColor, upColor, downColor]);
  return (
    <div className="rounded-2xl overflow-hidden p-5" style={{
      backgroundColor: backgroundColor || 'transparent',
      backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
      backgroundSize: backgroundSize === 'repeat' ? 'auto' : (backgroundSize === 'cover' ? bgPos.size : (backgroundSize || 'cover')),
      backgroundPosition: backgroundSize === 'repeat' ? 'top left' : bgPos.position,
      backgroundRepeat: backgroundSize === 'repeat' ? 'repeat' : 'no-repeat',
    }}>
      {/* Top Section: Market Cap Overview */}
      <div className="pb-4 border-b" style={{ borderColor: '#1A1B1F' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div
              className={`${hasCustomBackground ? 'backdrop-blur-sm px-2 py-1 rounded w-fit' : ''}`}
              style={textBgStyle}
            >
              <div className="text-xs mb-1" style={{ color: '#8b949e' }}>
                Market Cap
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold" style={{ color: textColor || '#ffffff' }}>
                  {marketCap}
                </div>
              )}
            </div>
            {isLoading ? (
              <Skeleton className="h-4 w-32 mt-1" />
            ) : (
              <div className="text-sm" style={{ color: '#FF3B30' }}>{change24h}</div>
            )}
          </div>
          <div className="text-right">
            <style>{glowKeyframes}</style>
            <div
              className={`text-xs mb-2 ${hasCustomBackground ? 'backdrop-blur-sm px-2 py-1 rounded w-fit ml-auto' : ''}`}
              style={{ color: isAtAth ? '#ea580c' : (textColor || '#ffffff'), ...textBgStyle }}
            >
              {isLoading ? (
                <Skeleton className="h-4 w-20 ml-auto" />
              ) : (
                <>ATH <span className="font-extrabold">{ath}</span></>
              )}
            </div>
            <div className="w-32 h-3 rounded-full overflow-hidden relative" style={{ backgroundColor: '#1a1a1f' }}>
              {isLoading ? (
                <div className="h-full w-full animate-pulse rounded-full" style={{ backgroundColor: '#3a3a3f' }} />
              ) : (
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    backgroundColor: '#00eb2f',
                    width: `${athProgress}%`
                  }}
                />
              )}
              {isAtAth && !isLoading && (
                <div
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{ animation: 'athGlow 1s ease-in-out infinite' }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chart Area Container */}
      <div className="flex">
        {/* Left Sidebar: Chart Tools */}
        <div className="p-2 border-r" style={{ borderColor: '#1A1B1F', backgroundColor: '#1A1B1F' }}>
          <div className="flex flex-col gap-1">
            {/* Timeframe Controls */}
            <div className="flex flex-col gap-1 mb-2">
              <div className="text-xs py-1 px-2 rounded text-center" style={{ backgroundColor: '#24262B', color: textColor || '#34C759', fontWeight: 'bold' }}>15m</div>
              <div className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 cursor-pointer">
                <div style={{ backgroundColor: '#34C759', width: '16px', height: '12px', borderRadius: '2px' }} />
              </div>
              <div className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 cursor-pointer">
                <div style={{ backgroundColor: '#ffffff', width: '12px', height: '2px', borderRadius: '1px' }} />
              </div>
              <div className="text-xs py-1 px-2 rounded text-center" style={{ backgroundColor: '#24262B', color: textColor || '#34C759', fontWeight: 'bold' }}>Price</div>
              <div className="text-xs py-1 px-2 rounded text-center" style={{ backgroundColor: '#24262B', color: textColor || '#34C759', fontWeight: 'bold' }}>USD</div>
            </div>

            {/* Drawing Tools */}
            <div className="flex flex-col gap-1 mt-4">
              {[
                { icon: 'crosshair', active: true },
                { icon: 'ruler', active: false },
                { icon: 'lines', active: false },
                { icon: 'butterfly', active: false },
                { icon: 'dotted', active: false },
                { icon: 'pencil', active: false },
                { icon: 'text', active: false },
                { icon: 'smile', active: false },
                { icon: 'ruler2', active: false },
              ].map((tool, i) => (
                <div key={i} className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 cursor-pointer" style={{ 
                  backgroundColor: tool.active ? '#24262B' : 'transparent'
                }}>
                  <div style={{ color: tool.active ? '#34C759' : '#8b949e', width: '16px', height: '16px', border: '1px solid', borderRadius: '4px' }} />
                </div>
              ))}
            </div>

            {/* Bottom Tools */}
            <div className="flex flex-col gap-1 mt-4">
              <div className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 cursor-pointer">
                <Search size={14} style={{ color: '#8b949e' }} />
              </div>
              <div className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 cursor-pointer">
                <Magnet size={14} style={{ color: '#8b949e' }} />
              </div>
              <div className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 cursor-pointer">
                <Lock size={14} style={{ color: '#8b949e' }} />
              </div>
              <div className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700 cursor-pointer">
                <Trash2 size={14} style={{ color: '#8b949e' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Main Chart Area */}
        <div className="flex-1 pt-4 pl-4">
          {/* Chart Header */}
          <div className="mb-4">
            <div className="text-sm mb-1" style={{ color: textColor || '#ffffff' }}>
              {tokenSymbol}/SOL Market Cap (USD)
            </div>
            <div className="flex items-center gap-2 text-xs mb-2">
              <span style={{ color: '#8b949e' }}>• 15 • Pump</span>
              <div className="flex-1" />
              <span style={{ color: '#34C759' }}>O {currentPrice} H {currentPrice} L {currentPrice} C {currentPrice} 4 (+0.08%)</span>
              <span style={{ color: textColor || '#8b949e', marginLeft: '8px' }}>Volume {volume}</span>
            </div>
          </div>

          {/* Chart Container */}
          <div className="relative rounded-xl" style={{ height: '400px', backgroundColor: '#1A1B1F', position: 'relative', overflow: 'hidden' }}>
            <div
              ref={tradingViewContainer}
              className="tradingview-widget-container"
              style={{ height: "100%", width: "100%" }}
            >
              <div className="tradingview-widget-container__widget" style={{ height: "calc(100% - 32px)", width: "100%" }}></div>
            </div>
          </div>

          {/* Bottom Controls */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span style={{ color: '#8b949e' }}>1D</span>
                <span style={{ color: '#8b949e' }}>5D</span>
                <span style={{ color: '#8b949e' }}>1M</span>
                <Calendar size={14} style={{ color: '#8b949e' }} />
              </div>
              <div className="flex items-center gap-2">
                <span style={{ color: '#8b949e' }}>16:03:18 UTC</span>
                <span style={{ color: '#8b949e' }}>% log auto</span>
              </div>
            </div>

            {/* Bottom Data Bar */}
            <div className="flex items-center gap-6 p-3 rounded" style={{ backgroundColor: '#24262B' }}>
              <div>
                <div
                  className={`text-xs mb-1 ${hasCustomBackground ? 'backdrop-blur-sm px-1.5 py-0.5 rounded w-fit' : ''}`}
                  style={{ color: '#8b949e', ...textBgStyle }}
                >
                  Price
                </div>
                {isLoading ? (
                  <Skeleton className="h-5 w-12" />
                ) : (
                  <div
                    className={`text-base font-bold ${hasCustomBackground ? 'backdrop-blur-sm px-1.5 py-0.5 rounded w-fit' : ''}`}
                    style={{ color: textColor || '#ffffff', ...textBgStyle }}
                  >
                    $0
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: '#8b949e' }}>Vol 24h</div>
                {isLoading ? (
                  <Skeleton className="h-5 w-14" />
                ) : (
                  <div className="text-base font-bold" style={{ color: textColor || '#ffffff' }}>$28.6K</div>
                )}
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: '#8b949e' }}>5m</div>
                {isLoading ? (
                  <Skeleton className="h-5 w-14" />
                ) : (
                  <div className="text-base font-bold" style={{ color: '#34C759' }}>+0.00%</div>
                )}
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: '#8b949e' }}>1h</div>
                {isLoading ? (
                  <Skeleton className="h-5 w-14" />
                ) : (
                  <div className="text-base font-bold" style={{ color: '#34C759' }}>+0.00%</div>
                )}
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: '#8b949e' }}>6h</div>
                {isLoading ? (
                  <Skeleton className="h-5 w-14" />
                ) : (
                  <div className="text-base font-bold" style={{ color: '#34C759' }}>+0.00%</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
