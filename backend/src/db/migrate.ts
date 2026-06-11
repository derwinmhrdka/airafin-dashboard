import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://airafin:airafin@localhost:5432/airafin';

const migrationClient = postgres(connectionString, { max: 1 });
const db = drizzle(migrationClient);

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

await migrate(db, { migrationsFolder });
await migrationClient.end();

console.log('Migrations applied successfully.');
