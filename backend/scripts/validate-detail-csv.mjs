import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const csvPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/import/detail.csv');
const content = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') inQuotes = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n' || (ch === '\r' && next === '\n')) {
      row.push(cell);
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
      if (ch === '\r') i += 1;
      continue;
    }
    if (ch !== '\r') cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
  }
  return rows;
}

function parseAmount(raw) {
  const cleaned = raw.replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  let normalized = cleaned;
  if (normalized.includes(',') && normalized.includes('.')) {
    const lastDot = normalized.lastIndexOf('.');
    const frac = normalized.slice(lastDot + 1);
    if (frac.length <= 2) {
      normalized = normalized.slice(0, lastDot).replace(/,/g, '');
      if (frac && frac !== '00') normalized += `.${frac}`;
    } else normalized = normalized.replace(/[,.]/g, '');
  } else if (normalized.includes('.')) {
    const parts = normalized.split('.');
    if (parts.length > 2 || (parts[1]?.length === 3 && parts.length === 2)) {
      normalized = normalized.replace(/\./g, '');
    }
  } else normalized = normalized.replace(/,/g, '');
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? Math.round(n) : null;
}

const cats = new Set([
  'Transport',
  'Savings',
  'Primary',
  'Personal Savings',
  'Maintenance',
  'Family',
  'Entertain',
  'Emergency',
  'Daily',
]);

const rows = parseCsv(content);
const periods = new Map();
let ok = 0;
const skipReasons = {};

for (let i = 0; i < rows.length; i += 1) {
  const c = rows[i];
  if ((c[0] ?? '').trim().toLowerCase() === 'date') continue;

  const cost = parseAmount(c[3] ?? '');
  const cat = (c[1] ?? '').trim();
  const periode = (c[4] ?? '').trim();

  if (!cost || cost <= 0) {
    skipReasons['empty/invalid cost'] = (skipReasons['empty/invalid cost'] ?? 0) + 1;
    continue;
  }
  if (!cat || !cats.has(cat)) {
    const key = `unknown category: ${cat || '(empty)'}`;
    skipReasons[key] = (skipReasons[key] ?? 0) + 1;
    continue;
  }
  ok += 1;
  periods.set(periode, (periods.get(periode) ?? 0) + 1);
}

console.log('File:', csvPath);
console.log('Total rows (incl. header):', rows.length);
console.log('Importable:', ok);
console.log('Skipped:', rows.length - 1 - ok);
console.log('Periods:', Object.fromEntries([...periods.entries()].sort()));
console.log('Skip breakdown:', skipReasons);
console.log('Sample parse:', parseAmount('1,500,000.00'), parseAmount('150,000.00'));
