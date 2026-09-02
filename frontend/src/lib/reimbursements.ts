import type { PlanChecklistItem, ReimbursementItem } from '$lib/types';

export interface ReimbursementPairTotal {
  planPic: string;
  paidBy: string;
  total: number;
}

export interface ReimbursementNetTotal {
  planPic: string;
  paidBy: string;
  total: number;
  personA: string;
  personB: string;
}

export function reimbursementPairKey(planPic: string, paidBy: string): string {
  return `${planPic}\0${paidBy}`;
}

export function reimbursementPeoplePairKey(personA: string, personB: string): string {
  return personA < personB ? `${personA}\0${personB}` : `${personB}\0${personA}`;
}

export function computeReimbursementTotals(
  reimbursements: readonly ReimbursementItem[],
): ReimbursementPairTotal[] {
  const byPair = new Map<string, number>();
  for (const item of reimbursements) {
    const key = reimbursementPairKey(item.planPic, item.pic);
    const cost = Number.parseFloat(item.cost) || 0;
    byPair.set(key, (byPair.get(key) ?? 0) + cost);
  }
  return [...byPair.entries()]
    .map(([key, total]) => {
      const [planPic, paidBy] = key.split('\0');
      return { planPic, paidBy, total };
    })
    .sort((a, b) => b.total - a.total);
}

export function computeReimbursementNetTotals(
  reimbursements: readonly ReimbursementItem[],
): ReimbursementNetTotal[] {
  const byPair = new Map<string, number>();
  for (const item of reimbursements) {
    const key = reimbursementPairKey(item.planPic, item.pic);
    const cost = Number.parseFloat(item.cost) || 0;
    byPair.set(key, (byPair.get(key) ?? 0) + cost);
  }

  const peoplePairs = new Set<string>();
  for (const key of byPair.keys()) {
    const [a, b] = key.split('\0');
    peoplePairs.add(reimbursementPeoplePairKey(a, b));
  }

  const nets: ReimbursementNetTotal[] = [];
  for (const pairKey of peoplePairs) {
    const [personA, personB] = pairKey.split('\0');
    const forward = byPair.get(reimbursementPairKey(personA, personB)) ?? 0;
    const backward = byPair.get(reimbursementPairKey(personB, personA)) ?? 0;
    const diff = forward - backward;
    if (diff > 0) {
      nets.push({ planPic: personA, paidBy: personB, total: diff, personA, personB });
    } else if (diff < 0) {
      nets.push({ planPic: personB, paidBy: personA, total: -diff, personA, personB });
    }
  }

  return nets.sort((a, b) => b.total - a.total);
}

export interface TransferPairGroup {
  key: string;
  senderPic: string;
  receiverPic: string;
  checklistItems: PlanChecklistItem[];
  reimbursements: ReimbursementItem[];
  reimbursementTotal: number;
  rows: TransferRow[];
}

export type TransferRow =
  | { kind: 'checklist'; item: PlanChecklistItem }
  | { kind: 'reimbursement'; item: ReimbursementItem };

function parseSortDate(dateStr: string): number {
  const t = Date.parse(dateStr);
  return Number.isFinite(t) ? t : 0;
}

/** Pending first (by date), done checklist rows at bottom (by id). */
export function sortChecklistItems(items: readonly PlanChecklistItem[]): PlanChecklistItem[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.id - b.id;
  });
}

export function sortReimbursementsByDate(items: readonly ReimbursementItem[]): ReimbursementItem[] {
  return [...items].sort((a, b) => {
    const da = parseSortDate(a.date);
    const db = parseSortDate(b.date);
    if (da !== db) return da - db;
    return a.id - b.id;
  });
}

function rowSortKey(row: TransferRow): [done: number, date: number, id: number] {
  if (row.kind === 'reimbursement') {
    return [0, parseSortDate(row.item.date), row.item.id];
  }
  if (row.item.done) {
    return [1, row.item.id, row.item.id];
  }
  // Pending plan items: fixed tier before dated Detail rows, stable order by id.
  return [0, 0, row.item.id];
}

export function sortTransferRows(
  checklistItems: readonly PlanChecklistItem[],
  reimbursements: readonly ReimbursementItem[],
): TransferRow[] {
  const rows: TransferRow[] = [
    ...checklistItems.map((item) => ({ kind: 'checklist' as const, item })),
    ...reimbursements.map((item) => ({ kind: 'reimbursement' as const, item })),
  ];
  return rows.sort((a, b) => {
    const ka = rowSortKey(a);
    const kb = rowSortKey(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    return ka[2] - kb[2];
  });
}

function pairPendingSortKey(group: TransferPairGroup): number {
  let min = Number.MAX_SAFE_INTEGER;
  for (const row of group.rows) {
    if (row.kind === 'checklist' && row.item.done) continue;
    const [, date, id] = rowSortKey(row);
    const key = date === 0 ? id : date;
    min = Math.min(min, key);
  }
  return min;
}

export function groupTransferItems(input: {
  checklistItems: readonly PlanChecklistItem[];
  reimbursements: readonly ReimbursementItem[];
}): { balancing: PlanChecklistItem[]; pairs: TransferPairGroup[] } {
  const balancing = sortChecklistItems(input.checklistItems.filter((i) => i.isBalancing));
  const checklistRest = input.checklistItems.filter((i) => !i.isBalancing);

  const pairMap = new Map<string, TransferPairGroup>();

  function ensurePair(senderPic: string, receiverPic: string): TransferPairGroup {
    const key = reimbursementPairKey(senderPic, receiverPic);
    const existing = pairMap.get(key);
    if (existing) return existing;
    const group: TransferPairGroup = {
      key,
      senderPic,
      receiverPic,
      checklistItems: [],
      reimbursements: [],
      reimbursementTotal: 0,
      rows: [],
    };
    pairMap.set(key, group);
    return group;
  }

  for (const item of checklistRest) {
    ensurePair(item.senderPic, item.receiverPic).checklistItems.push(item);
  }

  for (const item of input.reimbursements) {
    const group = ensurePair(item.planPic, item.pic);
    group.reimbursements.push(item);
    group.reimbursementTotal += Number.parseFloat(item.cost) || 0;
  }

  for (const group of pairMap.values()) {
    group.checklistItems = sortChecklistItems(group.checklistItems);
    group.reimbursements = sortReimbursementsByDate(group.reimbursements);
    group.rows = sortTransferRows(group.checklistItems, group.reimbursements);
  }

  const pairs = [...pairMap.values()].sort(
    (a, b) => pairPendingSortKey(a) - pairPendingSortKey(b) || a.key.localeCompare(b.key),
  );

  return { balancing, pairs };
}
