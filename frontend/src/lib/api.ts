import { env } from '$env/dynamic/public';
import { notifyNotificationsChanged } from './notifications-events';
import type {
  AppNotification,
  AuthEmailSetting,
  Category,
  DashboardSummary,
  PicSetting,
  PlanChecklistItem,
  PlanData,
  PocketSetting,
  Project,
  ReimbursementItem,
  Transaction,
  InfoUpdate,
  InfoUpdatePage,
} from './types';

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

export function markReimbursementUnpaid(id: number): Promise<{
  transaction: Transaction;
  sheetsSync?: { status: 'synced' | 'skipped' | 'failed'; error?: string };
}> {
  return fetchJson(`/api/transactions/${id}/unreimburse`, { method: 'PATCH' });
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

export function getPockets(): Promise<{ pockets: PocketSetting[] }> {
  return fetchJson('/api/settings/pockets');
}

export function createPocket(
  name: string,
  color?: string,
): Promise<{ pocket: PocketSetting | null; created: boolean }> {
  return fetchJson('/api/settings/pockets', {
    method: 'POST',
    body: JSON.stringify({ name, color }),
  });
}

export function updatePocketColor(id: number, color: string): Promise<{ pocket: PocketSetting }> {
  return fetchJson(`/api/settings/pockets/${id}/color`, {
    method: 'PATCH',
    body: JSON.stringify({ color }),
  });
}

export function deletePocket(id: number): Promise<{ ok: boolean }> {
  return fetchJson(`/api/settings/pockets/${id}`, { method: 'DELETE' });
}

export function getPics(): Promise<{ pics: PicSetting[] }> {
  return fetchJson('/api/settings/pics');
}

export function createPic(name: string): Promise<{ pic: PicSetting; created: boolean }> {
  return fetchJson('/api/settings/pics', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function deletePic(id: number): Promise<{ ok: boolean }> {
  return fetchJson(`/api/settings/pics/${id}`, { method: 'DELETE' });
}

export function getAuthEmails(): Promise<{ emails: AuthEmailSetting[] }> {
  return fetchJson('/api/settings/auth-emails');
}

export function createAuthEmail(
  email: string,
  pic: string,
): Promise<{ email: AuthEmailSetting; created: boolean }> {
  return fetchJson('/api/settings/auth-emails', {
    method: 'POST',
    body: JSON.stringify({ email, pic }),
  });
}

export function updateAuthEmailPic(
  id: number,
  pic: string,
): Promise<{ email: AuthEmailSetting }> {
  return fetchJson(`/api/settings/auth-emails/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ pic }),
  });
}

export function setAuthEmailAdmin(
  id: number,
  isAdmin: boolean,
): Promise<{ email: AuthEmailSetting }> {
  return fetchJson(`/api/settings/auth-emails/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ isAdmin }),
  });
}

export function deleteAuthEmail(id: number): Promise<{ ok: boolean }> {
  return fetchJson(`/api/settings/auth-emails/${id}`, { method: 'DELETE' });
}

export async function syncNotifications(period: string): Promise<{
  ok: boolean;
  period: string;
  payDue: number;
  paidReceivedCreated: number;
  resolved: number;
}> {
  const result = await fetchJson<{
    ok: boolean;
    period: string;
    payDue: number;
    paidReceivedCreated: number;
    resolved: number;
  }>('/api/notifications/sync', {
    method: 'POST',
    body: JSON.stringify({ period }),
  });
  notifyNotificationsChanged(period);
  return result;
}

export function getNotifications(
  pic: string,
  period?: string,
): Promise<{ pic: string; unreadCount: number; notifications: AppNotification[] }> {
  const q = new URLSearchParams({ pic });
  if (period) q.set('period', period);
  // Avoid stale badge/list in installed PWA (browser may cache GET).
  return fetchJson(`/api/notifications?${q}`, { cache: 'no-store' });
}

export function getProjects(opts?: { all?: boolean }): Promise<{ projects: Project[] }> {
  const q = opts?.all ? '?all=1' : '';
  return fetchJson(`/api/projects${q}`);
}

export function createProject(input: {
  name: string;
  photo?: string | null;
}): Promise<{ project: Project }> {
  return fetchJson('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProject(
  id: number,
  input: { name?: string; photo?: string | null },
): Promise<{ project: Project }> {
  return fetchJson(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteProject(id: number, password: string): Promise<{ ok: boolean }> {
  return fetchJson(`/api/projects/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
}

export async function selectSessionProject(projectId: number | null): Promise<{ ok: boolean; projectId: number | null }> {
  const res = await fetch('/auth/project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(projectId == null ? { clear: true } : { projectId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function getProjectMembers(
  projectId: number,
): Promise<{ members: { id: number; projectId: number; email: string }[] }> {
  return fetchJson(`/api/projects/${projectId}/members`);
}

export function addProjectMember(
  projectId: number,
  email: string,
): Promise<{ member: { id: number; projectId: number; email: string }; created: boolean }> {
  return fetchJson(`/api/projects/${projectId}/members`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function removeProjectMember(projectId: number, email: string): Promise<{ ok: boolean }> {
  return fetchJson(`/api/projects/${projectId}/members/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  });
}

export function copyProjectTemplate(
  toProjectId: number,
  input: { fromProjectId: number; period: string },
): Promise<{
  ok: boolean;
  period: string;
  copied: { incomes: number; budgets: number; subcategories: number; checklist: number };
}> {
  return fetchJson(`/api/projects/${toProjectId}/copy-template`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listInfoUpdates(): Promise<{ updates: InfoUpdate[] }> {
  return fetchJson('/api/info-updates');
}

export function getInfoUpdate(id: number): Promise<{ update: InfoUpdate }> {
  return fetchJson(`/api/info-updates/${id}`);
}

export function createInfoUpdate(input: {
  title: string;
  active?: boolean;
  pages?: InfoUpdatePage[];
}): Promise<{ update: InfoUpdate }> {
  return fetchJson('/api/info-updates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateInfoUpdate(
  id: number,
  input: { title?: string; active?: boolean; pages?: InfoUpdatePage[] },
): Promise<{ update: InfoUpdate }> {
  return fetchJson(`/api/info-updates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteInfoUpdate(id: number): Promise<{ ok: boolean }> {
  return fetchJson(`/api/info-updates/${id}`, { method: 'DELETE' });
}

export function getPendingInfoUpdate(): Promise<{ update: InfoUpdate | null }> {
  return fetchJson('/api/info-updates/pending', { cache: 'no-store' });
}

export function skipInfoUpdate(id: number): Promise<{ ok: boolean }> {
  return fetchJson(`/api/info-updates/${id}/skip`, { method: 'POST', body: '{}' });
}

export function markNotificationRead(id: number): Promise<{ notification: AppNotification }> {
  return fetchJson(`/api/notifications/${id}/read`, { method: 'PATCH' });
}

export function markAllNotificationsRead(pic: string): Promise<{ ok: boolean }> {
  return fetchJson('/api/notifications/read-all', {
    method: 'POST',
    body: JSON.stringify({ pic }),
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
  budgets?: { categoryId: number; allocatedAmount: number; pic?: string; pocket?: string }[];
  subcategories?: {
    categoryId: number;
    name: string;
    allocatedAmount?: number;
    pic?: string;
    pocket?: string;
  }[];
}): Promise<{ ok: boolean; period?: string }> {
  return fetchJson('/api/budgets', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function transferBudget(body: {
  period: string;
  amount: number;
  from: { categoryId: number; subcategoryName?: string };
  to: { categoryId: number; subcategoryName?: string };
}): Promise<{ ok: boolean; period: string; amount: number }> {
  return fetchJson('/api/budgets/transfer', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface CloseMonthBucket {
  categoryId: number;
  categoryName: string;
  subcategoryName: string;
  amount: number;
  kind: 'surplus' | 'deficit';
  pic: string;
}

export interface CloseMonthResult {
  ok: boolean;
  fromPeriod: string;
  toPeriod: string;
  carried: CloseMonthBucket[];
  totals: { surplus: number; deficit: number; incomeAdded: number };
}

export function closeMonth(period: string): Promise<CloseMonthResult> {
  return fetchJson('/api/budgets/close-month', {
    method: 'POST',
    body: JSON.stringify({ period }),
  });
}

export function createChecklistItem(body: {
  period: string;
  categoryId?: number | null;
  subcategoryName: string;
  amount: number;
  senderPic: string;
  receiverPic: string;
  pocket?: string;
}): Promise<{ item: PlanChecklistItem }> {
  return fetchJson('/api/plan/checklist', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateChecklistItem(
  id: number,
  done: boolean,
): Promise<{ item: PlanChecklistItem }> {
  return fetchJson(`/api/plan/checklist/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ done }),
  });
}

export function deleteChecklistItem(id: number): Promise<{ ok: boolean }> {
  return fetchJson(`/api/plan/checklist/${id}`, { method: 'DELETE' });
}
