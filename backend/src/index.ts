import 'dotenv/config';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { refreshPicCache } from './lib/pic.js';
import { getProjectById, parseProjectIdHeader } from './lib/project.js';
import { budgetRoutes } from './routes/budgets.js';
import { categoryRoutes } from './routes/categories.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { notificationRoutes } from './routes/notifications.js';
import { projectRoutes } from './routes/projects.js';
import { settingsRoutes } from './routes/settings.js';
import { syncRoutes } from './routes/sync.js';
import { transactionRoutes } from './routes/transactions.js';

const app = Fastify({
  logger: true,
  bodyLimit: 2 * 1048576, // 2MB for project photo data URLs
});

await app.register(cors, {
  origin: true,
});

function needsProjectId(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  if (!path.startsWith('/api/')) return false;

  const optional =
    path.startsWith('/api/projects') ||
    path.startsWith('/api/auth/') ||
    path.startsWith('/api/settings/') ||
    path.startsWith('/api/categories');

  if (optional) return false;
  return true;
}

app.addHook('onRequest', async (request, reply) => {
  if (!needsProjectId(request.url)) return;

  const projectId = parseProjectIdHeader(request.headers['x-project-id']);
  if (!projectId) {
    return reply.code(400).send({ error: 'X-Project-Id header is required' });
  }
  const project = await getProjectById(projectId);
  if (!project) {
    return reply.code(404).send({ error: 'Project not found' });
  }
  request.projectId = projectId;
});

await app.register(projectRoutes);
await app.register(categoryRoutes);
await app.register(transactionRoutes);
await app.register(dashboardRoutes);
await app.register(budgetRoutes);
await app.register(syncRoutes);
await app.register(settingsRoutes);
await app.register(notificationRoutes);

await refreshPicCache();

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error, url: request.url }, 'Unhandled route error');
  reply.code(500).send({
    error: 'Internal Server Error',
    message: error instanceof Error ? error.message : 'Unknown error',
  });
});

app.get('/health', async () => ({ status: 'ok' }));

const port = Number.parseInt(process.env.PORT ?? '3081', 10);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
