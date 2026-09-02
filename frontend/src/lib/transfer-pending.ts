import { reimbursementPairKey, reimbursementPeoplePairKey } from '$lib/reimbursements';
import type { PlanChecklistItem, ReimbursementItem } from '$lib/types';

export type TransferSource = 'plan' | 'detail';

export interface TransferPendingLine {
  source: TransferSource;
  senderPic: string;
  receiverPic: string;
  amount: number;
  pocket: string | null;
  checklistId?: number;
  reimbursementId?: number;
  title: string;
  date?: string;
  categoryName?: string;
  subCategory?: string;
}

export interface DirectedPairRow {
  key: string;
  senderPic: string;
  receiverPic: string;
  total: number;
  lines: TransferPendingLine[];
}

export interface PocketNetRow {
  key: string;
  pocket: string;
  senderPic: string;
  receiverPic: string;
  total: number;
  lines: TransferPendingLine[];
}

export interface TransferNetRow {
  key: string;
  senderPic: string;
  receiverPic: string;
  total: number;
  personA: string;
  personB: string;
  lines: TransferPendingLine[];
}

export function collectPendingLines(input: {
  checklistItems: readonly PlanChecklistItem[];
  reimbursements: readonly ReimbursementItem[];
}): TransferPendingLine[] {
  const lines: TransferPendingLine[] = [];

  for (const item of input.checklistItems) {
    if (item.done) continue;
    lines.push({
      source: 'plan',
      senderPic: item.senderPic,
      receiverPic: item.receiverPic,
      amount: Number.parseFloat(item.amount) || 0,
      pocket: item.pocket?.trim().toUpperCase() || 'BCA',
      checklistId: item.id,
      title: item.subcategoryName,
    });
  }

  for (const item of input.reimbursements) {
    lines.push({
      source: 'detail',
      senderPic: item.planPic,
      receiverPic: item.pic,
      amount: Number.parseFloat(item.cost) || 0,
      pocket: null,
      reimbursementId: item.id,
      title: item.detail,
      date: item.date,
      categoryName: item.categoryName,
      subCategory: item.subCategory,
    });
  }

  return lines;
}

function groupDirected(lines: readonly TransferPendingLine[]): DirectedPairRow[] {
  const map = new Map<string, DirectedPairRow>();
  for (const line of lines) {
    const key = reimbursementPairKey(line.senderPic, line.receiverPic);
    const existing = map.get(key);
    if (existing) {
      existing.total += line.amount;
      existing.lines.push(line);
    } else {
      map.set(key, {
        key,
        senderPic: line.senderPic,
        receiverPic: line.receiverPic,
        total: line.amount,
        lines: [line],
      });
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

export function computeDirectedPairRows(lines: readonly TransferPendingLine[]): DirectedPairRow[] {
  return groupDirected(lines);
}

function netFromLines(lines: readonly TransferPendingLine[]): TransferNetRow[] {
  const directed = groupDirected(lines);
  const byPair = new Map(directed.map((row) => [row.key, row.total]));

  const peoplePairs = new Set<string>();
  for (const key of byPair.keys()) {
    const [a, b] = key.split('\0');
    peoplePairs.add(reimbursementPeoplePairKey(a, b));
  }

  const nets: TransferNetRow[] = [];
  for (const pairKey of peoplePairs) {
    const [personA, personB] = pairKey.split('\0');
    const forwardKey = reimbursementPairKey(personA, personB);
    const backwardKey = reimbursementPairKey(personB, personA);
    const forward = byPair.get(forwardKey) ?? 0;
    const backward = byPair.get(backwardKey) ?? 0;
    const diff = forward - backward;
    if (diff === 0) continue;

    const senderPic = diff > 0 ? personA : personB;
    const receiverPic = diff > 0 ? personB : personA;
    const forwardRow = directed.find((r) => r.key === forwardKey);
    const backwardRow = directed.find((r) => r.key === backwardKey);
    const contributing = [...(forwardRow?.lines ?? []), ...(backwardRow?.lines ?? [])];

    nets.push({
      key: reimbursementPeoplePairKey(personA, personB),
      senderPic,
      receiverPic,
      total: Math.abs(diff),
      personA,
      personB,
      lines: contributing,
    });
  }

  return nets.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

export function computeTransferNetRows(lines: readonly TransferPendingLine[]): TransferNetRow[] {
  return netFromLines(lines);
}

export function computePocketNetRows(lines: readonly TransferPendingLine[]): PocketNetRow[] {
  const pockets = new Set<string>();
  for (const line of lines) {
    if (line.pocket) pockets.add(line.pocket);
  }

  const rows: PocketNetRow[] = [];
  for (const pocket of [...pockets].sort()) {
    const pocketLines = lines.filter((l) => l.pocket === pocket);
    for (const net of netFromLines(pocketLines)) {
      rows.push({
        key: `${pocket}|${net.senderPic}|${net.receiverPic}`,
        pocket,
        senderPic: net.senderPic,
        receiverPic: net.receiverPic,
        total: net.total,
        lines: net.lines.filter((l) => l.pocket === pocket),
      });
    }
  }
  return rows;
}

export function linesForDirectedPair(
  lines: readonly TransferPendingLine[],
  senderPic: string,
  receiverPic: string,
): TransferPendingLine[] {
  return lines.filter((l) => l.senderPic === senderPic && l.receiverPic === receiverPic);
}

export function linesForNetPair(
  lines: readonly TransferPendingLine[],
  personA: string,
  personB: string,
): TransferPendingLine[] {
  return lines.filter(
    (l) =>
      (l.senderPic === personA && l.receiverPic === personB) ||
      (l.senderPic === personB && l.receiverPic === personA),
  );
}

export function linesForPocketNet(
  lines: readonly TransferPendingLine[],
  pocket: string,
  senderPic: string,
  receiverPic: string,
): TransferPendingLine[] {
  return lines.filter(
    (l) =>
      l.pocket === pocket &&
      ((l.senderPic === senderPic && l.receiverPic === receiverPic) ||
        (l.senderPic === receiverPic && l.receiverPic === senderPic)),
  );
}
