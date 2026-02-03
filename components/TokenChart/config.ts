import { ResolutionString } from '@/components/AdvancedTradingView/charting_library';

import { GetChartRequest } from '@/components/Explore/types';

export type ChartStyle = 'line' | 'candles';

export type ChartConfig = {
  lastInterval: ResolutionString;
  chartType: GetChartRequest['type'];
  showDevTrades: boolean;
  showUserTrades: boolean;
  chartStyle: ChartStyle;
};

export const DEFAULT_CHART_CONFIG: ChartConfig = {
  lastInterval: '1' as ResolutionString,
  chartType: 'mcap',
  showDevTrades: true,
  showUserTrades: true,
  chartStyle: 'line',
};
