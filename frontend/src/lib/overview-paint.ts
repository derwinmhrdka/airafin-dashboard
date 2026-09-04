import type { DashboardSummary } from '$lib/types';

let paint: { period: string; summary: DashboardSummary } | null = null;

export function peekOverviewPaint(period: string): DashboardSummary | null {
  if (paint?.period === period) return paint.summary;
  return null;
}

export function rememberOverviewPaint(period: string, summary: DashboardSummary): void {
  paint = { period, summary };
}
