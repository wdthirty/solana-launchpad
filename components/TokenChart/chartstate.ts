import { TV_CSS_VERSION } from './constants';

const TV_CHART_STATE = 'TRADING_VIEW_STATE';
const TV_CHART_VERSION_KEY = 'TRADING_VIEW_VERSION';

export const saveChartState = (state: object) => {
  window.localStorage.setItem(TV_CHART_STATE, JSON.stringify(state));
  window.localStorage.setItem(TV_CHART_VERSION_KEY, TV_CSS_VERSION);
};

export const loadChartState = () => {
  // Clear cached state if CSS version changed
  const savedVersion = window.localStorage.getItem(TV_CHART_VERSION_KEY);
  if (savedVersion !== TV_CSS_VERSION) {
    window.localStorage.removeItem(TV_CHART_STATE);
    window.localStorage.setItem(TV_CHART_VERSION_KEY, TV_CSS_VERSION);
    return undefined;
  }

  const rawChartData = window.localStorage.getItem(TV_CHART_STATE);
  return rawChartData ? JSON.parse(rawChartData) : undefined;
};
