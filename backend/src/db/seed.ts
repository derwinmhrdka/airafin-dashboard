import 'dotenv/config';
import { db } from './index.js';
import { categories, pics, pockets } from './schema.js';

const MASTER_CATEGORIES = [
  'Transport',
  'Savings',
  'Primary',
  'Personal Savings',
  'Maintenance',
  'Family',
  'Entertain',
  'Emergency',
  'Daily',
] as const;

const DEFAULT_POCKETS = ['BCA', 'MANDIRI', 'SUPA', 'DANA', 'OVO', 'CASH', 'BIBIT'] as const;
const DEFAULT_PICS = ['Derwin', 'Anggita'] as const;

await db
  .insert(categories)
  .values(MASTER_CATEGORIES.map((name) => ({ name })))
  .onConflictDoNothing();

await db
  .insert(pockets)
  .values(DEFAULT_POCKETS.map((name) => ({ name })))
  .onConflictDoNothing();

await db
  .insert(pics)
  .values(DEFAULT_PICS.map((name) => ({ name })))
  .onConflictDoNothing();

console.log('Categories, pockets, and PICs seeded.');

process.exit(0);
