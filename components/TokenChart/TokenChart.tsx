import { CSSProperties, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocalStorage } from 'react-use';

import { createDataFeed } from './datafeed';
import { formatChartPrice, getPrecisionTickSizeText } from './formatter';
import { CHART_BG_COLOR, TV_CSS_VERSION } from './constants';
import { ChartConfig, DEFAULT_CHART_CONFIG } from './config';
import { FAVORITE_INTERVALS } from './intervals';
import { loadChartState, saveChartState } from './chartstate';

import {
  ChartingLibraryWidgetConstructor,
  ChartingLibraryWidgetOptions,
  IChartingLibraryWidget,
  IChartWidgetApi,
  ResolutionString,
} from '../AdvancedTradingView/charting_library';
import { useMobile } from '@/hooks/useMobile';
import { cn } from '@/lib/utils';
import { RefreshMarks } from './RefreshMarks';
import { useTokenChart } from '@/contexts/TokenChartProvider';
import { useTokenInfo } from '@/hooks/queries';
import { formatReadableNumber, ReadableNumberFormat } from '@/lib/format/number';
import { AthBar } from '@/components/ui/AthBar';

type TradingView = {
  widget: ChartingLibraryWidgetConstructor;
};

declare global {
  interface Window {
    TradingView: TradingView;
  }
}

export interface TVOptions {
  enableVolumeStudy?: boolean;
  useUserBrowserTime?: boolean;
  showSeriesOHLC?: boolean;
  showVolume?: boolean;
  showPriceSource?: boolean;
  showBarChange?: boolean;
  isMobile?: boolean;
}

export const DEFAULT_OPTIONS: Required<TVOptions> = {
  enableVolumeStudy: true,
  useUserBrowserTime: true,
  showSeriesOHLC: true,
  showVolume: true,
  showPriceSource: true,
  showBarChange: true,
  isMobile: false,
};

type ChartProps = {
  renderingId?: string;
  style?: CSSProperties;
  positions?: [];
  opt?: TVOptions;
  backgroundColor?: string;
  backgroundImage?: string;
  textBackgroundColor?: string;
  hideHeader?: boolean;
  athMarketCap?: number | null;
  backendMarketCap?: number | null; // Our backend market_cap for ATH bar (more precise than Jupiter)
};

const TRADING_VIEW_DOMAIN = 'https://static.jup.ag';
const TV_SCRIPT_ID = 'tradingview-widget-loading-script';

// Cache the promise so we only load once and can start loading immediately
let tvLibraryPromise: Promise<TradingView> | null = null;

function loadTvLibrary(): Promise<TradingView> {
  // Return cached promise if already loading/loaded
  if (tvLibraryPromise) {
    return tvLibraryPromise;
  }

  tvLibraryPromise = new Promise((resolve) => {
    if (window.TradingView) {
      return resolve(window.TradingView);
    }

    // Check if the script already exists
    const existingScript = document.getElementById(TV_SCRIPT_ID);

    if (existingScript) {
      // Script exists but may not be loaded yet
      if (window.TradingView) {
        resolve(window.TradingView);
      } else {
        existingScript.addEventListener('load', () => resolve(window.TradingView));
      }
    } else {
      // Script doesn't exist, create and append it
      const script = document.createElement('script');
      script.id = TV_SCRIPT_ID;
      script.src = `${TRADING_VIEW_DOMAIN}/tv/charting_library/charting_library.js`;
      script.type = 'text/javascript';
      script.async = true; // Load asynchronously
      script.onload = () => resolve(window.TradingView);

      document.head.appendChild(script);
    }
  });

  return tvLibraryPromise;
}

// Start loading TradingView library immediately when this module is imported
if (typeof window !== 'undefined') {
  loadTvLibrary();
}

const ENABLED_FEATURES: ChartingLibraryWidgetOptions['enabled_features'] = [
  'header_in_fullscreen_mode', // Enable tools in fullscreen mode
  'seconds_resolution', // Enable seconds resolution
  'two_character_bar_marks_labels', // Enable marks to be displayed with two characters.
  'save_shortcut',
  'create_volume_indicator_by_default', // create by default, if opt.enableVolumeStudy = false, will remove at onChartReady()
  'axis_pressed_mouse_move_scale',
];

const DISABLED_FEATURES: ChartingLibraryWidgetOptions['disabled_features'] = [
  'header_symbol_search',
  'header_compare',
  'countdown',
  'popup_hints',
  'header_saveload', // remove "save" header button
  'symbol_search_hot_key',
  'timeframes_toolbar', // hide bottom timeframe, timezone bar
  'header_undo_redo',
  'display_market_status',
  'header_fullscreen_button',
  'header_screenshot',
  'header_settings',
  'header_indicators', // remove indicators button
  'header_chart_type', // remove candle type selector
  'left_toolbar', // completely hide left sidebar
];


export const TokenChart: React.FC<ChartProps> = memo(({ renderingId, style, opt, backgroundColor, backgroundImage, textBackgroundColor, hideHeader, athMarketCap, backendMarketCap }) => {
  const isMobile = useMobile();
  const [chartConfig, setChartConfig] = useLocalStorage<ChartConfig>(
    'chart_config',
    DEFAULT_CHART_CONFIG
  );

  const {
    resolutionRef,
    chartTypeRef,
    showDevTradesRef,
    showUserTradesRef,
    baseAssetRef,
    resolutionToMostRecentBarRef,
    onNewMarksRef,
    onNewSwapTxsRef,
    userAddressRef,
  } = useTokenChart();

  useLayoutEffect(() => {
    if (!chartConfig) {
      return;
    }
    resolutionRef.current = chartConfig.lastInterval;
    chartTypeRef.current = chartConfig.chartType;
    showDevTradesRef.current = chartConfig.showDevTrades;
    showUserTradesRef.current = chartConfig.showUserTrades;
    chartStyleRef.current = chartConfig.chartStyle ?? 'line';
  }, [chartConfig, resolutionRef, chartTypeRef, showDevTradesRef, showUserTradesRef]);

  const options: Required<TVOptions> = useMemo(
    () => ({
      ...DEFAULT_OPTIONS,
      ...opt,
      isMobile,
    }),
    [opt, isMobile]
  );

  const widgetRef = useRef<IChartingLibraryWidget | null>(null);
  const htmlId = useMemo(() => `${renderingId || 'main'}-tradingview-chart`, [renderingId]);
  const priceMcapTogglerRef = useRef<HTMLElement | null>(null);
  const devTradesTogglerRef = useRef<HTMLElement | null>(null);
  const userTradesTogglerRef = useRef<HTMLElement | null>(null);
  const chartStyleRef = useRef<'line' | 'candles'>(chartConfig?.chartStyle ?? 'line');
  const chartStyleTogglerRef = useRef<HTMLElement | null>(null);
  const resetCacheFnRef = useRef<Record<string, () => void>>({});
  const isMarksLoadingRef = useRef<boolean>(false);

  const [isLoaded, setIsLoaded] = useState(false);
  const [isDataReady, setIsDataReady] = useState(false);

  const { data: tokenInfo } = useTokenInfo((data) => data?.baseAsset);
  const symbol = useMemo(() => {
    return tokenInfo ? `${tokenInfo.symbol.toUpperCase()}/USD` : undefined;
  }, [tokenInfo]);

  // Set up widget on first mount
  useEffect(() => {
    if (!symbol) {
      // Symbol is undefined while tokenInfo is loading - this is expected
      return;
    }

    const initializeWidget = async () => {
      try {
        // First, ensure TradingView script is loaded
        const tv = await loadTvLibrary();

        const disabledFeatures = [...DISABLED_FEATURES];
        // On mobile: allow vertical page scrolling but keep touch interactions for chart
        if (isMobile) {
          disabledFeatures.push('horz_touch_drag_scroll'); // prevent horizontal drag from interfering with page
        }

        // Load saved chart state (cleared when TV_CSS_VERSION changes)
        // Skip on mobile to avoid scaling issues
        const chartData = isMobile ? undefined : loadChartState();

        // Wait for container to have correct dimensions on mobile
        // Wallet webviews sometimes report wrong dimensions initially
        if (isMobile) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Get container dimensions for mobile to avoid wallet webview scaling issues
        const container = document.getElementById(htmlId);
        // Use visualViewport for accurate dimensions in wallet webviews (more reliable than innerWidth)
        const viewportWidth = window.visualViewport?.width || window.innerWidth;
        const containerWidth = Math.max(container?.clientWidth || 0, viewportWidth - 32); // 32px for padding
        const containerHeight = Math.max(container?.clientHeight || 0, 400);

        // Now that the script is loaded, we can safely create the widget
        const widget = new tv.widget({
          symbol,
          interval: (chartConfig?.lastInterval ?? '1') as ResolutionString, // 1 minute
          locale: 'en',
          container: htmlId,
          theme: 'dark',
          autosize: !isMobile, // Disable autosize on mobile to prevent wallet webview scaling issues
          preset: isMobile ? 'mobile' : undefined, // Use mobile preset for proper scaling
          // Use explicit pixel dimensions on mobile
          ...(isMobile ? { width: containerWidth, height: containerHeight } : {}),
          auto_save_delay: 1,
          custom_css_url: `${window.location.origin}/css/tradingview-theme.css?v=${TV_CSS_VERSION}`,
          // overrides for scales/crosshair (must be separate from settings_overrides)
          overrides: {
            'scalesProperties.crosshairLabelBgColorDark': '#0a0a0c',
            'scalesProperties.crosshairLabelBgColorLight': '#0a0a0c',
            'paneProperties.crossHairProperties.color': '#27272a',
          },
          // settings_overrides take priority over saved chart state
          // Use minimal overrides on mobile to prevent scaling issues
          settings_overrides: isMobile ? {
            // Mobile settings
            'chartEventsSourceProperties.breaks.visible': false,
            'mainSeriesProperties.highLowAvgPrice.highLowPriceLabelsVisible': false,
            'mainSeriesProperties.highLowAvgPrice.highLowPriceLinesVisible': false,
            // Background
            'paneProperties.backgroundType': 'solid',
            'paneProperties.background': CHART_BG_COLOR,
            // Hide grid lines (set to transparent)
            'paneProperties.vertGridProperties.color': 'transparent',
            'paneProperties.horzGridProperties.color': 'transparent',
            // Hide separator/border lines between panes
            'paneProperties.separatorColor': CHART_BG_COLOR,
            // Hide axis border line (match background color)
            'scalesProperties.lineColor': CHART_BG_COLOR,
            // Crosshair label styling (dark background matching page)
            'paneProperties.crossHairProperties.color': '#71717a',
            'scalesProperties.crosshairLabelBgColorDark': CHART_BG_COLOR,
            'scalesProperties.crosshairLabelBgColorLight': CHART_BG_COLOR,
            // Hide price line (dotted horizontal line at current price)
            'mainSeriesProperties.showPriceLine': false,
            // Area chart style (3 = area) with gradient fill - default, can be toggled to candles
            'mainSeriesProperties.style': 3,
            'mainSeriesProperties.areaStyle.color1': 'rgba(0, 235, 47, 0.3)',
            'mainSeriesProperties.areaStyle.color2': 'rgba(0, 235, 47, 0.0)',
            'mainSeriesProperties.areaStyle.linecolor': '#00eb2f',
            'mainSeriesProperties.areaStyle.linewidth': 2,
            'mainSeriesProperties.areaStyle.priceSource': 'close',
            'mainSeriesProperties.areaStyle.transparency': 0,
            // Candle colors (for when user toggles to candles view)
            'mainSeriesProperties.candleStyle.upColor': '#34C759',
            'mainSeriesProperties.candleStyle.downColor': '#FF3B30',
            'mainSeriesProperties.candleStyle.borderUpColor': '#34C759',
            'mainSeriesProperties.candleStyle.borderDownColor': '#FF3B30',
            'mainSeriesProperties.candleStyle.wickUpColor': '#34C759',
            'mainSeriesProperties.candleStyle.wickDownColor': '#FF3B30',
          } : {
            // Full desktop settings
            'chartEventsSourceProperties.breaks.visible': false,
            'paneProperties.legendProperties.showSeriesTitle': true,
            'paneProperties.backgroundType': 'solid',
            'paneProperties.background': CHART_BG_COLOR,
            'scalesProperties.fontSize': 12,
            // Hide grid lines (set to transparent)
            'paneProperties.vertGridProperties.color': 'transparent',
            'paneProperties.horzGridProperties.color': 'transparent',
            // Hide separator/border lines between panes
            'paneProperties.separatorColor': CHART_BG_COLOR,
            // Hide axis border line (match background color)
            'scalesProperties.lineColor': CHART_BG_COLOR,
            // Crosshair label styling (dark background matching page)
            'paneProperties.crossHairProperties.color': '#71717a',
            'scalesProperties.crosshairLabelBgColorDark': CHART_BG_COLOR,
            'scalesProperties.crosshairLabelBgColorLight': CHART_BG_COLOR,
            // Hide price line (dotted horizontal line at current price)
            'mainSeriesProperties.showPriceLine': false,
            'mainSeriesProperties.highLowAvgPrice.highLowPriceLabelsVisible': false,
            'mainSeriesProperties.highLowAvgPrice.highLowPriceLinesVisible': false,
            'mainSeriesProperties.statusViewStyle.symbolTextSource': 'description',
            // Area chart style (3 = area) with gradient fill - default, can be toggled to candles
            'mainSeriesProperties.style': 3,
            'mainSeriesProperties.areaStyle.color1': 'rgba(0, 235, 47, 0.3)',
            'mainSeriesProperties.areaStyle.color2': 'rgba(0, 235, 47, 0.0)',
            'mainSeriesProperties.areaStyle.linecolor': '#00eb2f',
            'mainSeriesProperties.areaStyle.linewidth': 2,
            'mainSeriesProperties.areaStyle.priceSource': 'close',
            'mainSeriesProperties.areaStyle.transparency': 0,
            // Candle colors (for when user toggles to candles view)
            'mainSeriesProperties.candleStyle.upColor': '#34C759',
            'mainSeriesProperties.candleStyle.downColor': '#FF3B30',
            'mainSeriesProperties.candleStyle.borderUpColor': '#34C759',
            'mainSeriesProperties.candleStyle.borderDownColor': '#FF3B30',
            'mainSeriesProperties.candleStyle.wickUpColor': '#34C759',
            'mainSeriesProperties.candleStyle.wickDownColor': '#FF3B30',
            'volume.volume.color.0': '#FF3B30',
            'volume.volume.color.1': '#34C759',
          },
          // Width/height set conditionally above for mobile, use 100% for desktop
          ...(!isMobile ? { width: '100%' as any, height: '100%' as any } : {}),
          datafeed: createDataFeed(
            baseAssetRef,
            resolutionToMostRecentBarRef,
            onNewSwapTxsRef,
            chartTypeRef,
            userAddressRef,
            onNewMarksRef,
            showDevTradesRef,
            showUserTradesRef,
            isMarksLoadingRef,
            resetCacheFnRef
          ),
          library_path: `${TRADING_VIEW_DOMAIN}/tv/charting_library/bundles`,
          disabled_features: disabledFeatures,
          enabled_features: ENABLED_FEATURES,
          custom_formatters: {
            priceFormatterFactory: () => {
              return {
                format: (price: number) => {
                  const value = getPrecisionTickSizeText({
                    value: price,
                    maxSuffix: 6,
                  });
                  // formatnumber here to show the comma in the price, eg BTC: 95,000
                  return price > 1_000 ? formatChartPrice(price, 2) : value;
                },
              };
            },
          } as any,
          // Intentionally set as any to prevent overriding dateFormatter and timeFormatter
          favorites: {
            intervals: FAVORITE_INTERVALS,
          },
          saved_data: chartData,
        });
        widgetRef.current = widget;

        if (!widget) return;

        try {
          const headerReadyPromise = widget.headerReady?.();
          if (headerReadyPromise) {
            headerReadyPromise.then(() => {
              // Delete toggle button if previously created
              priceMcapTogglerRef.current?.remove();
              priceMcapTogglerRef.current = widget.createButton();
              priceMcapTogglerRef.current?.addEventListener('click', () => {
                if (!resolutionRef.current) {
                  return;
                }
                setChartConfig({
                  lastInterval: resolutionRef.current ?? DEFAULT_CHART_CONFIG.lastInterval,
                  chartType: chartTypeRef.current === 'mcap' ? 'price' : 'mcap',
                  showDevTrades: showDevTradesRef.current,
                  showUserTrades: showUserTradesRef.current,
                  chartStyle: chartStyleRef.current,
                });
              });

              devTradesTogglerRef.current?.remove();
              devTradesTogglerRef.current = widget.createButton();
              devTradesTogglerRef.current?.addEventListener('click', () => {
                const activeChart = widget.activeChart();
                if (isMarksLoadingRef.current || !activeChart) {
                  return;
                }
                const showDevTrades = !showDevTradesRef.current;
                setChartConfig({
                  lastInterval: resolutionRef.current ?? DEFAULT_CHART_CONFIG.lastInterval,
                  chartType: chartTypeRef.current,
                  showUserTrades: showUserTradesRef.current,
                  showDevTrades,
                  chartStyle: chartStyleRef.current,
                });
                if (showDevTrades) {
                  activeChart.refreshMarks();
                  return;
                }
                activeChart.clearMarks();
                activeChart.refreshMarks();
              });

              userTradesTogglerRef.current = widget.createButton();
              userTradesTogglerRef.current?.addEventListener('click', () => {
                const activeChart = widget.activeChart();
                if (isMarksLoadingRef.current || !activeChart) {
                  return;
                }
                const showUserTrades = !showUserTradesRef.current;
                setChartConfig({
                  lastInterval: resolutionRef.current ?? DEFAULT_CHART_CONFIG.lastInterval,
                  chartType: chartTypeRef.current,
                  showDevTrades: showDevTradesRef.current,
                  showUserTrades,
                  chartStyle: chartStyleRef.current,
                });
                if (showUserTrades) {
                  activeChart.refreshMarks();
                  return;
                }
                activeChart.clearMarks();
                activeChart.refreshMarks();
              });

              // Chart style toggle (line/candles)
              chartStyleTogglerRef.current?.remove();
              chartStyleTogglerRef.current = widget.createButton();
              chartStyleTogglerRef.current?.addEventListener('click', () => {
                const activeChart = widget.activeChart();
                if (!activeChart) {
                  return;
                }
                const newStyle = chartStyleRef.current === 'candles' ? 'line' : 'candles';
                setChartConfig({
                  lastInterval: resolutionRef.current ?? DEFAULT_CHART_CONFIG.lastInterval,
                  chartType: chartTypeRef.current,
                  showDevTrades: showDevTradesRef.current,
                  showUserTrades: showUserTradesRef.current,
                  chartStyle: newStyle,
                });
                // Apply chart style: 3 = area (with gradient), 1 = candles
                activeChart.setChartType(newStyle === 'line' ? 3 : 1);
              });

              if (chartConfig) {
                updateButtonTitles(chartConfig);
              }
            });
          }
        } catch (e) {
          console.warn('TradingView widget headerReady error:', e);
        }

        widget.onChartReady(() => {
          const activeChart = widget.activeChart();
          if (!activeChart) {
            console.error('window.onChartReady: missing activechart, breaking!');
            return;
          }

          const studies = activeChart.getAllStudies();
          const foundVolumeStudy = studies.find((item) => item.name === 'Volume');

          // Force price chart auto scaling
          const panes = activeChart.getPanes();
          const priceScale = panes[0]?.getMainSourcePriceScale();
          if (priceScale) {
            priceScale.setAutoScale(true);
          }

          // Remove volume on mobile OR ensure volume is created if enabled AND on desktop
          if (opt?.enableVolumeStudy && !isMobile) {
            if (!foundVolumeStudy) {
              activeChart.createStudy('Volume');
            }
          } else if (foundVolumeStudy) {
            activeChart.removeEntity(foundVolumeStudy.id);
          }

          // Save the chart state to local storage
          widget.subscribe('onAutoSaveNeeded', () => {
            widget.save(saveChartState);
          });

          // Handle chart loading sequence
          activeChart.dataReady(() => {
            setIsDataReady(true);
          });

          // Save the last interval user chose
          activeChart.onIntervalChanged().subscribe(null, (interval) => {
            setChartConfig({
              chartType: chartTypeRef.current,
              showDevTrades: showDevTradesRef.current,
              showUserTrades: showUserTradesRef.current,
              lastInterval: interval,
              chartStyle: chartStyleRef.current,
            });
          });

          // Apply initial chart style from saved config
          const savedChartStyle = chartConfig?.chartStyle ?? 'line';
          activeChart.setChartType(savedChartStyle === 'line' ? 3 : 1);

          if (options.useUserBrowserTime) {
            const timezoneApi = activeChart.getTimezoneApi();
            const userTz = new Date().getTimezoneOffset() * 60 * 1000 * -1; // This is how TV handles timezone offset, don't ask why, don't know why
            const detectedTimezone = timezoneApi
              .availableTimezones()
              .find((item) => item.offset === userTz);
            timezoneApi.setTimezone(detectedTimezone?.id || 'Etc/UTC');
          }

          setIsLoaded(true);
        });

        return () => {
          widget.remove();
          widgetRef.current = null;
        };
      } catch (error) {
        console.error('Failed to initialize TradingView widget:', error);
        return;
      }
    };
    initializeWidget();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  function updateButtonTitles(config: ChartConfig) {
    if (!priceMcapTogglerRef.current) {
      return;
    }

    // Price/mcap toggle
    if (config.chartType === 'mcap') {
      priceMcapTogglerRef.current.innerHTML = 'Price / <span style="color:#00eb2f">Mcap</span>';
    } else {
      priceMcapTogglerRef.current.innerHTML = '<span style="color:#00eb2f">Price</span> / Mcap';
    }

    // Show dev trades toggle
    if (devTradesTogglerRef.current) {
      if (config.showDevTrades) {
        devTradesTogglerRef.current.textContent = 'Hide Dev Trades';
      } else {
        devTradesTogglerRef.current.textContent = 'Show Dev Trades';
      }
    }

    // Show user trades toggle
    if (userTradesTogglerRef.current) {
      if (config.showUserTrades) {
        userTradesTogglerRef.current.textContent = 'Hide My Trades';
      } else {
        userTradesTogglerRef.current.textContent = 'Show My Trades';
      }
    }

    // Chart style toggle (line/candles)
    if (chartStyleTogglerRef.current) {
      if (config.chartStyle === 'candles') {
        chartStyleTogglerRef.current.innerHTML = 'Line / <span style="color:#00eb2f">Candles</span>';
      } else {
        chartStyleTogglerRef.current.innerHTML = '<span style="color:#00eb2f">Line</span> / Candles';
      }
    }
  }

  // Reset chart data when config changes
  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) {
      return;
    }

    let activeChart: IChartWidgetApi | undefined;
    try {
      activeChart = widget.activeChart();
    } catch (err) {
      console.error('failed to get active chart, breaking');
      return;
    }

    const ready = isLoaded && isDataReady;
    if (!activeChart || !ready || !symbol || !chartConfig) {
      return;
    }

    const baseAssetId = baseAssetRef.current?.id;
    if (!baseAssetId) {
      console.error('failed to reset data, missing asset id');
      return;
    }

    updateButtonTitles(chartConfig);
    const key = baseAssetRef.current?.id;
    if (!key) {
      console.error('failed to get token id, breaking');
      return;
    }
    // invalidate cache if it exists to request for new data
    // see https://www.tradingview.com/charting-library-docs/latest/connecting_data/datafeed-api/required-methods/#subscribebars
    const onResetCacheNeededCallback = resetCacheFnRef.current[key];
    if (!onResetCacheNeededCallback) {
      return;
    }

    onResetCacheNeededCallback();
    activeChart.resetData();
  }, [chartConfig, isLoaded, isDataReady, symbol, baseAssetRef]);

  // Get market cap and current price
  const { data: baseAsset } = useTokenInfo((data) => data?.baseAsset);
  const marketCap = baseAsset?.mcap;
  const currentPrice = baseAsset?.usdPrice;

  // Helper for text background style - apply when any custom background exists (image or color)
  const hasCustomBackground = backgroundImage || (backgroundColor && backgroundColor !== '#111114');
  const textBgStyle = hasCustomBackground ? { backgroundColor: `${textBackgroundColor || '#0c0c0e'}cc` } : undefined;

  return (
    <>
      <RefreshMarks isLoaded={isLoaded} widgetRef={widgetRef} />

      {/* Market Cap Header - hidden when hideHeader prop is true */}
      {!hideHeader && (
        <div className="flex items-center justify-between mb-3 px-1">
          <div
            className={`flex flex-col ${hasCustomBackground ? 'backdrop-blur-sm px-2 py-1 rounded' : ''}`}
            style={textBgStyle}
          >
            <span className="typo-body text-muted-foreground mb-1">
              Market Cap
            </span>
            <div className="text-3xl font-bold text-white">
              {marketCap !== undefined && marketCap !== null ? `$${formatReadableNumber(marketCap, { format: ReadableNumberFormat.COMPACT })}` : '—'}
            </div>
          </div>
          <div
            className={`flex flex-col gap-1.5 items-end ${hasCustomBackground ? 'backdrop-blur-sm px-2 py-1.5 rounded' : ''}`}
            style={textBgStyle}
          >
            {/* ATH Progress Bar - above price (backend data only) */}
            {athMarketCap != null && athMarketCap > 0 && backendMarketCap != null && (
              <AthBar marketCap={backendMarketCap} athMarketCap={athMarketCap} />
            )}
            <div className="typo-body text-white text-right leading-none">
              <span className="text-muted-foreground">Price </span>
              {currentPrice !== undefined && currentPrice !== null ? `$${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}` : '—'}
            </div>
          </div>
        </div>
      )}

      <div
        className={cn('relative flex-1 w-full overflow-hidden transition-all rounded-xl')}
        style={{ minHeight: 200, ...style }}
      >
        {/* Loading overlay with spinner */}
        <div
          className={cn(
            `pointer-events-none absolute left-0 top-0 h-full w-full transition-all z-10 rounded-xl`,
            isLoaded && isDataReady ? 'opacity-0' : 'opacity-100',
            `flex items-center justify-center bg-background`
          )}
        >
          {(!isLoaded || !isDataReady) && (
            <div className="w-12 h-12 border-[3px] border-primary/30 border-t-primary rounded-full animate-spin" />
          )}
        </div>

        <div
          id={htmlId}
          className={cn('h-full w-full', isLoaded ? `opacity-100` : `opacity-0`)}
          style={{ minHeight: 200, ...style }}
        />
      </div>
    </>
  );
});

TokenChart.displayName = 'TokenChart';
