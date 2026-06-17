import 'dotenv/config';
import { db } from './index.js';
import { categories, pockets } from './schema.js';

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

await db
  .insert(categories)
  .values(MASTER_CATEGORIES.map((name) => ({ name })))
  .onConflictDoNothing();

await db
  .insert(pockets)
  .values(DEFAULT_POCKETS.map((name) => ({ name })))
  .onConflictDoNothing();

console.log('Categories and pockets seeded.');

process.exit(0);
