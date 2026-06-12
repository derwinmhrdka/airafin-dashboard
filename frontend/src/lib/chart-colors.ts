/** SVG fill colors aligned with category badges. */
export const CATEGORY_CHART_FILL: Record<string, string> = {
  Emergency: '#991b1b',
  Daily: '#f59e0b',
  Primary: '#0ea5e9',
  Transport: '#71717a',
  Savings: '#10b981',
  'Personal Savings': '#14b8a6',
  Maintenance: '#f97316',
  Family: '#8b5cf6',
  Entertain: '#ec4899',
};

export function categoryChartFill(name: string): string {
  return CATEGORY_CHART_FILL[name] ?? '#a1a1aa';
}

export const CHART_PLAN = '#3b82f6';
export const CHART_SPENT = '#ef4444';
export const CHART_SISA = '#22c55e';
export const CHART_OVER = '#dc2626';
