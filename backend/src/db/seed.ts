import 'dotenv/config';
import { db } from './index.js';
import { categories } from './schema.js';

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

await db
  .insert(categories)
  .values(MASTER_CATEGORIES.map((name) => ({ name })))
  .onConflictDoNothing();

console.log('Categories seeded.');

process.exit(0);
