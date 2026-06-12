import type { FastifyInstance } from 'fastify';
import { syncDbToSheet, syncSheetToDb } from '../lib/period-sync.js';

interface SyncBody {
  period?: string;
}

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: SyncBody }>('/api/sync/db-to-sheet', async (request, reply) => {
    const period = request.body?.period?.trim();
    if (!period) {
      return reply.code(400).send({ error: 'period is required' });
    }

    const result = await syncDbToSheet(period);
    if (!result.ok) {
      return reply.code(result.error === 'Google Sheets is not configured' ? 503 : 500).send(result);
    }

    return result;
  });

  app.post<{ Body: SyncBody }>('/api/sync/sheet-to-db', async (request, reply) => {
    const period = request.body?.period?.trim();
    if (!period) {
      return reply.code(400).send({ error: 'period is required' });
    }

    const result = await syncSheetToDb(period);
    if (!result.ok) {
      return reply.code(result.error === 'Google Sheets is not configured' ? 503 : 500).send(result);
    }

    return result;
  });
}
