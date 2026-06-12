import { env } from '$env/dynamic/public';
import type { Category, DashboardSummary, PlanData, ReimbursementItem, Transaction } from './types';

function apiBase(): string {
  return env.PUBLIC_API_URL ?? '';
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && init.body !== '' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export function getSummary(period: string): Promise<DashboardSummary> {
  return fetchJson(`/api/dashboard/summary?period=${encodeURIComponent(period)}`);
}

export function getReimbursements(
  period: string,
): Promise<{ period: string; reimbursements: ReimbursementItem[] }> {
  return fetchJson(`/api/dashboard/reimbursements?period=${encodeURIComponent(period)}`);
}

export function markReimbursementPaid(id: number): Promise<{
  transaction: Transaction;
  sheetsSync?: { status: 'synced' | 'skipped' | 'failed'; error?: string };
}> {
  return fetchJson(`/api/transactions/${id}/reimburse`, { method: 'PATCH' });
}

export function getCategories(): Promise<{ categories: Category[] }> {
  return fetchJson('/api/categories');
}

export function createCategory(name: string): Promise<{ category: Category }> {
  return fetchJson('/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export interface TransactionFilters {
  limit?: number;
  offset?: number;
  categoryId?: string;
  pic?: string;
  search?: string;
}

export function getTransactions(
  period: string,
  opts?: TransactionFilters,
): Promise<{ transactions: Transaction[]; total: number; monthTotal: number; hasMore: boolean }> {
  const params = new URLSearchParams({ period });
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  if (opts?.offset != null) params.set('offset', String(opts.offset));
  if (opts?.categoryId) params.set('categoryId', opts.categoryId);
  if (opts?.pic) params.set('pic', opts.pic);
  if (opts?.search?.trim()) params.set('search', opts.search.trim());
  return fetchJson(`/api/transactions?${params}`);
}

export function getPlan(period: string): Promise<PlanData> {
  return fetchJson(`/api/plan?period=${encodeURIComponent(period)}`);
}

export function createTransaction(body: {
  date: string;
  categoryId: number;
  subCategory?: string;
  detail: string;
  cost: number;
  period: string;
  pic: string;
}): Promise<{
  transaction: Transaction;
  sheetsSync?: { status: 'synced' | 'skipped' | 'failed'; error?: string };
}> {
  return fetchJson('/api/transactions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateTransaction(
  id: number,
  body: {
    date: string;
    categoryId: number;
    subCategory?: string;
    detail: string;
    cost: number;
    pic: string;
  },
): Promise<{
  transaction: Transaction;
  sheetsSync?: { status: 'synced' | 'skipped' | 'failed'; error?: string };
}> {
  return fetchJson(`/api/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteTransaction(id: number): Promise<{
  ok: boolean;
  sheetsSync?: { status: 'synced' | 'skipped' | 'failed'; error?: string };
}> {
  return fetchJson(`/api/transactions/${id}`, {
    method: 'DELETE',
  });
}

export function updateTransactionStatus(
  id: number,
  status: string,
): Promise<{ transaction: Transaction }> {
  return fetchJson(`/api/transactions/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export interface SyncResult {
  ok: boolean;
  period: string;
  direction: 'db-to-sheet' | 'sheet-to-db';
  deleted?: number;
  written?: number;
  skipped?: number;
  error?: string;
  skipReasons?: string[];
}

export function syncDbToSheet(period: string): Promise<SyncResult> {
  return fetchJson('/api/sync/db-to-sheet', {
    method: 'POST',
    body: JSON.stringify({ period }),
  });
}

export function syncSheetToDb(period: string): Promise<SyncResult> {
  return fetchJson('/api/sync/sheet-to-db', {
    method: 'POST',
    body: JSON.stringify({ period }),
  });
}

export function savePlan(body: {
  period: string;
  incomes?: { source: string; amount: number }[];
  budgets?: { categoryId: number; allocatedAmount: number; pic?: string }[];
  subcategories?: { categoryId: number; name: string; pic?: string }[];
}): Promise<{ ok: boolean }> {
  return fetchJson('/api/budgets', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
