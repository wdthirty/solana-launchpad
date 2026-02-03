/**
 * Page Style Utilities
 * 
 * Functions for generating layouts from page styles
 */

export interface TokenPageStyle {
  id: string;
  name: string;
  backgroundColor: string;
  panelBackgroundColor: string;
  textColor: string;
  accentColor: string;
}

export const TOKEN_PAGE_STYLES: TokenPageStyle[] = [
  {
    id: 'default',
    name: 'Default',
    backgroundColor: '#0a0a0c',
    panelBackgroundColor: '#111114',
    textColor: '#f8fafc',
    accentColor: '#FE9226',
  },
  {
    id: 'dark-blue',
    name: 'Dark Blue',
    backgroundColor: '#0a1628',
    panelBackgroundColor: '#1a2332',
    textColor: '#e2e8f0',
    accentColor: '#3b82f6',
  },
  {
    id: 'dark-purple',
    name: 'Dark Purple',
    backgroundColor: '#1a0b2e',
    panelBackgroundColor: '#2d1b3d',
    textColor: '#f3e8ff',
    accentColor: '#a855f7',
  },
  {
    id: 'dark-green',
    name: 'Dark Green',
    backgroundColor: '#0a1f0a',
    panelBackgroundColor: '#1a2e1a',
    textColor: '#dcfce7',
    accentColor: '#22c55e',
  },
  {
    id: 'dark-red',
    name: 'Dark Red',
    backgroundColor: '#1f0a0a',
    panelBackgroundColor: '#2e1a1a',
    textColor: '#fee2e2',
    accentColor: '#ef4444',
  },
  {
    id: 'dark-cyan',
    name: 'Dark Cyan',
    backgroundColor: '#0a1f1f',
    panelBackgroundColor: '#1a2e2e',
    textColor: '#cffafe',
    accentColor: '#06b6d4',
  },
  {
    id: 'dark-pink',
    name: 'Dark Pink',
    backgroundColor: '#1f0a1a',
    panelBackgroundColor: '#2e1a2a',
    textColor: '#fce7f3',
    accentColor: '#ec4899',
  },
  {
    id: 'dark-orange',
    name: 'Dark Orange',
    backgroundColor: '#1f150a',
    panelBackgroundColor: '#2e221a',
    textColor: '#fed7aa',
    accentColor: '#f97316',
  },
];

/**
 * Get page style by ID
 */
export function getPageStyleById(styleId: string): TokenPageStyle | undefined {
  return TOKEN_PAGE_STYLES.find(style => style.id === styleId);
}

/**
 * Generate layout from page style
 * Creates a layout structure that can be saved to token_layouts table
 * This matches the default layout used in TokenPageContent.tsx
 */
export function generateLayoutFromPageStyle(styleId: string) {
  const style = getPageStyleById(styleId);
  if (!style) {
    return null;
  }

  return {
    panels: [
      // === LEFT COLUMN (8 cols) ===
      // Row 0: Token name panel
      {
        id: 'token-name',
        type: 'TokenNamePanel',
        position: { row: 0, col: 0, width: 8, height: 1 },
        customization: {
          backgroundColor: style.panelBackgroundColor,
          textColor: style.textColor,
        },
      },
      // Row 1-3: Chart (spans 3 rows)
      {
        id: 'chart',
        type: 'ChartPanel',
        position: { row: 1, col: 0, width: 8, height: 3 },
        customization: {
          backgroundColor: style.panelBackgroundColor,
          textColor: style.textColor,
        },
      },
      // Row 4: Stats panel (market cap, price changes)
      {
        id: 'stats',
        type: 'StatsPanel',
        position: { row: 4, col: 0, width: 8, height: 1 },
        customization: {
          backgroundColor: style.panelBackgroundColor,
          textColor: style.textColor,
        },
      },
      // Row 5: Meta panel (social links, description)
      {
        id: 'meta',
        type: 'MetaPanel',
        position: { row: 5, col: 0, width: 8, height: 1 },
        customization: {
          backgroundColor: style.panelBackgroundColor,
          textColor: style.textColor,
        },
      },
      // Row 6: Threads/Videos panel
      {
        id: 'threads',
        type: 'ThreadsPanel',
        position: { row: 6, col: 0, width: 8, height: 1 },
        customization: {
          backgroundColor: style.panelBackgroundColor,
          textColor: style.textColor,
        },
      },
      // Row 7-8: Comments panel (spans 2 rows)
      {
        id: 'comments',
        type: 'CommentsPanel',
        position: { row: 7, col: 0, width: 8, height: 2 },
        customization: {
          backgroundColor: style.panelBackgroundColor,
          textColor: style.textColor,
        },
      },
      // === RIGHT COLUMN (4 cols) - stacked vertically ===
      // Row 0-2: Buy/Sell panel (spans 3 rows)
      {
        id: 'buy-sell',
        type: 'BuySellPanel',
        position: { row: 0, col: 8, width: 4, height: 3 },
        customization: {
          backgroundColor: style.panelBackgroundColor,
          textColor: style.textColor,
        },
      },
      // Row 3: Bonding curve panel
      {
        id: 'bonding-curve',
        type: 'BondingCurvePanel',
        position: { row: 3, col: 8, width: 4, height: 1 },
        customization: {
          backgroundColor: style.panelBackgroundColor,
          textColor: style.textColor,
        },
      },
      // Row 4-8: Top holders panel (spans remaining rows on right side)
      {
        id: 'holders',
        type: 'TopHoldersPanel',
        position: { row: 4, col: 8, width: 4, height: 5 },
        customization: {
          backgroundColor: style.panelBackgroundColor,
          textColor: style.textColor,
        },
      },
    ],
    style: {
      backgroundColor: style.backgroundColor,
      textColor: style.textColor,
      accentColor: style.accentColor,
    },
  };
}

