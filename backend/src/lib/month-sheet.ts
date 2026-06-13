import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  budgetSubcategories,
  budgets,
  categories,
  incomes,
  transactions,
} from '../db/schema.js';
import { ensureMonthSheetTab, isSheetsSyncEnabled, writeMonthSheetGrid } from './google-sheets.js';
import { toNumber, roundMoney } from './money.js';
import { VALID_PIC, type Pic } from './pic.js';
import { monthFromPeriod, parsePeriod } from './period.js';

export interface CreateMonthSheetResult {
  ok: boolean;
  period: string;
  sheetName: string;
  created?: boolean;
  rowsWritten?: number;
  error?: string;
}

function formatSheetAmount(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function incomeOwner(source: string): Pic | null {
  const s = source.toLowerCase();
  if (s.includes('derwin')) return 'Derwin';
  if (s.includes('anggita')) return 'Anggita';
  return null;
}

interface PlanRow {
  category: string;
  allocated: number;
  sisa: number;
}

interface IncomeRow {
  source: string;
  amount: number;
}

interface InvestRow {
  title: string;
  amount: number;
}

interface BalancingRow {
  pic: string;
  total: number;
  dif: number;
  notes: string;
}

interface TxRow {
  categoryName: string;
  detail: string;
  cost: number;
  pic: string;
  status: string;
}

async function loadMonthSheetData(period: string) {
  const [incomeRows, budgetRows, subRows, txRows] = await Promise.all([
    db.select().from(incomes).where(eq(incomes.period, period)),
    db
      .select({
        categoryId: budgets.categoryId,
        categoryName: categories.name,
        allocatedAmount: budgets.allocatedAmount,
      })
      .from(budgets)
      .innerJoin(categories, eq(budgets.categoryId, categories.id))
      .where(eq(budgets.period, period)),
    db
      .select({
        categoryId: budgetSubcategories.categoryId,
        categoryName: categories.name,
        name: budgetSubcategories.name,
        allocatedAmount: budgetSubcategories.allocatedAmount,
      })
      .from(budgetSubcategories)
      .innerJoin(categories, eq(budgetSubcategories.categoryId, categories.id))
      .where(eq(budgetSubcategories.period, period)),
    db
      .select({
        categoryName: categories.name,
        detail: transactions.detail,
        cost: transactions.cost,
        pic: transactions.pic,
        status: transactions.status,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(eq(transactions.period, period)),
  ]);

  const spentByCategory = new Map<number, number>();
  for (const tx of await db
    .select({ categoryId: transactions.categoryId, cost: transactions.cost })
    .from(transactions)
    .where(eq(transactions.period, period))) {
    spentByCategory.set(
      tx.categoryId,
      (spentByCategory.get(tx.categoryId) ?? 0) + toNumber(tx.cost),
    );
  }

  const planRows: PlanRow[] = budgetRows
    .filter((b) => toNumber(b.allocatedAmount) > 0)
    .map((b) => {
      const allocated = roundMoney(toNumber(b.allocatedAmount));
      const spent = roundMoney(spentByCategory.get(b.categoryId) ?? 0);
      return {
        category: b.categoryName,
        allocated,
        sisa: roundMoney(allocated - spent),
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category));

  const incomeList: IncomeRow[] = incomeRows.map((row) => ({
    source: row.source,
    amount: roundMoney(toNumber(row.amount)),
  }));
  const totalIncome = roundMoney(incomeList.reduce((sum, row) => sum + row.amount, 0));
  if (incomeList.length > 0) {
    incomeList.push({ source: 'Total', amount: totalIncome });
  }

  const investList: InvestRow[] = subRows
    .filter(
      (sub) =>
        sub.categoryName.toLowerCase() === 'savings' ||
        sub.name.toLowerCase().includes('reksadana'),
    )
    .map((sub) => ({
      title: sub.name,
      amount: roundMoney(toNumber(sub.allocatedAmount)),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const investTotal = roundMoney(investList.reduce((sum, row) => sum + row.amount, 0));
  if (investList.length > 0) {
    investList.push({ title: 'Total', amount: investTotal });
  }

  const incomeByPic = new Map<Pic, number>();
  for (const pic of VALID_PIC) incomeByPic.set(pic, 0);
  for (const row of incomeRows) {
    const owner = incomeOwner(row.source);
    if (owner) {
      incomeByPic.set(owner, (incomeByPic.get(owner) ?? 0) + roundMoney(toNumber(row.amount)));
    }
  }

  const spentByPic = new Map<Pic, number>();
  for (const pic of VALID_PIC) spentByPic.set(pic, 0);
  for (const tx of txRows) {
    const pic = tx.pic?.trim();
    if (pic === 'Derwin' || pic === 'Anggita') {
      spentByPic.set(pic, (spentByPic.get(pic) ?? 0) + roundMoney(toNumber(tx.cost)));
    }
  }

  const balancingRows: BalancingRow[] = VALID_PIC.map((pic) => {
    const picIncome = incomeByPic.get(pic) ?? 0;
    const picSpent = spentByPic.get(pic) ?? 0;
    return {
      pic,
      total: picSpent,
      dif: roundMoney(picIncome - picSpent),
      notes: '',
    };
  });

  const [first, second] = balancingRows;
  if (first && second) {
    if (first.dif > 0 && second.dif < 0) {
      first.notes = `${first.pic} must be transfer to ${second.pic}`;
    } else if (second.dif > 0 && first.dif < 0) {
      second.notes = `${second.pic} must be transfer to ${first.pic}`;
    }
  }

  const transactionsOut: TxRow[] = txRows
    .map((tx) => ({
      categoryName: tx.categoryName,
      detail: tx.detail,
      cost: roundMoney(toNumber(tx.cost)),
      pic: tx.pic?.trim() || 'Derwin',
      status: tx.status?.trim() || 'Done',
    }))
    .sort((a, b) => {
      const cat = a.categoryName.localeCompare(b.categoryName);
      if (cat !== 0) return cat;
      return a.pic.localeCompare(b.pic);
    });

  return { planRows, incomeList, investList, balancingRows, transactionsOut };
}

function buildMonthSheetGrid(data: {
  planRows: PlanRow[];
  incomeList: IncomeRow[];
  investList: InvestRow[];
  balancingRows: BalancingRow[];
  transactionsOut: TxRow[];
}): (string | number)[][] {
  const rows: (string | number)[][] = [];

  rows.push([
    'PLAN',
    '',
    'DETAIL',
    '',
    'SISA',
    '',
    'INCOME',
    '',
    '',
    'INVEST & SAVINGS',
    '',
    '',
    'BALANCING',
    '',
    '',
    '',
  ]);
  rows.push([
    '',
    '',
    '',
    '',
    '',
    '',
    'Source',
    'Amount',
    '',
    'Title',
    'Amount',
    '',
    'PIC',
    'Total Amount',
    'Dif',
    'Notes',
  ]);

  const summaryCount = Math.max(
    data.planRows.length,
    data.incomeList.length,
    data.investList.length,
    data.balancingRows.length,
    1,
  );

  for (let i = 0; i < summaryCount; i += 1) {
    const plan = data.planRows[i];
    const income = data.incomeList[i];
    const invest = data.investList[i];
    const balance = data.balancingRows[i];

    rows.push([
      plan?.category ?? '',
      plan ? formatSheetAmount(plan.allocated) : '',
      '',
      '',
      plan ? formatSheetAmount(plan.sisa) : '',
      '',
      income?.source ?? '',
      income ? formatSheetAmount(income.amount) : '',
      '',
      invest?.title ?? '',
      invest ? formatSheetAmount(invest.amount) : '',
      '',
      balance?.pic ?? '',
      balance ? formatSheetAmount(balance.total) : '',
      balance ? formatSheetAmount(balance.dif) : '',
      balance?.notes ?? '',
    ]);
  }

  rows.push(Array(16).fill(''));
  rows.push([
    'Category',
    'Detail',
    'Cost',
    'PIC',
    'Status',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ]);

  for (const tx of data.transactionsOut) {
    rows.push([
      tx.categoryName,
      tx.detail,
      formatSheetAmount(tx.cost),
      tx.pic,
      tx.status,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
  }

  return rows;
}

export function periodToMonthSheetName(period: string, now = new Date()): string | null {
  const parts = parsePeriod(period.trim());
  if (!parts || parts.year !== now.getFullYear()) return null;
  return monthFromPeriod(period).toUpperCase();
}

export async function createMonthSheet(period: string): Promise<CreateMonthSheetResult> {
  const trimmed = period.trim();
  const sheetName = periodToMonthSheetName(trimmed);

  if (!sheetName) {
    const currentYear = new Date().getFullYear();
    return {
      ok: false,
      period: trimmed,
      sheetName: '',
      error: `Monthly sheets are only created for ${currentYear} (sheet name is the month in caps, e.g. JULY).`,
    };
  }

  if (!isSheetsSyncEnabled()) {
    return {
      ok: false,
      period: trimmed,
      sheetName,
      error: 'Google Sheets is not configured',
    };
  }

  try {
    const sheetData = await loadMonthSheetData(trimmed);
    const grid = buildMonthSheetGrid(sheetData);
    const { created } = await ensureMonthSheetTab(sheetName);
    await writeMonthSheetGrid(sheetName, grid);

    return {
      ok: true,
      period: trimmed,
      sheetName,
      created,
      rowsWritten: grid.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create month sheet';
    return { ok: false, period: trimmed, sheetName, error: message };
  }
}
