import { CHART_OVER, CHART_PLAN, CHART_SISA, CHART_SPENT } from '$lib/chart-colors';
import type { PieSlice } from '$lib/components/PieChart.svelte';

export function planVsExpenseSlices(plan: number, spent: number): PieSlice[] {
  if (plan <= 0 && spent <= 0) return [];

  if (plan > 0 && spent <= plan) {
    return [
      { label: 'Spent', value: spent, color: CHART_SPENT },
      { label: 'SISA', value: plan - spent, color: CHART_SISA },
    ];
  }

  if (plan > 0 && spent > plan) {
    return [
      { label: 'Plan', value: plan, color: CHART_PLAN },
      { label: 'Over budget', value: spent - plan, color: CHART_OVER },
    ];
  }

  return [{ label: 'Spent', value: spent, color: CHART_SPENT }];
}
