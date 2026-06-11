import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://airafin:airafin@localhost:5432/airafin';

const client = postgres(connectionString, { max: 5 });

export const db = drizzle(client, { schema });
