import 'dotenv/config';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { budgetRoutes } from './routes/budgets.js';
import { categoryRoutes } from './routes/categories.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { transactionRoutes } from './routes/transactions.js';

const app = Fastify({
  logger: true,
  bodyLimit: 1048576,
});

await app.register(cors, {
  origin: true,
});

await app.register(categoryRoutes);
await app.register(transactionRoutes);
await app.register(dashboardRoutes);
await app.register(budgetRoutes);

app.get('/health', async () => ({ status: 'ok' }));

const port = Number.parseInt(process.env.PORT ?? '3081', 10);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
