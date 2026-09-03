import type { FastifyInstance } from 'fastify';
import {
  createProject,
  deleteProject,
  getProjectById,
  listProjects,
  updateProject,
} from '../lib/project.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Active workspace from X-Project-Id (set by app onRequest). */
    projectId?: number;
  }
}

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects', async () => {
    const rows = await listProjects();
    return {
      projects: rows.map((p) => ({
        id: p.id,
        name: p.name,
        photo: p.photo,
        createdAt: p.createdAt,
      })),
    };
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.code(400).send({ error: 'Invalid id' });
    }
    const project = await getProjectById(id);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return { project };
  });

  app.post<{ Body: { name?: string; photo?: string | null } }>(
    '/api/projects',
    async (request, reply) => {
      try {
        const project = await createProject({
          name: request.body?.name ?? '',
          photo: request.body?.photo,
        });
        return reply.code(201).send({ project });
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to create' });
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: { name?: string; photo?: string | null } }>(
    '/api/projects/:id',
    async (request, reply) => {
      const id = Number.parseInt(request.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return reply.code(400).send({ error: 'Invalid id' });
      }
      try {
        const project = await updateProject(id, {
          name: request.body?.name,
          photo: request.body?.photo,
        });
        if (!project) return reply.code(404).send({ error: 'Project not found' });
        return { project };
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to update' });
      }
    },
  );

  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.code(400).send({ error: 'Invalid id' });
    }
    const result = await deleteProject(id);
    if ('error' in result) {
      return reply.code(result.status).send({ error: result.error });
    }
    return { ok: true };
  });
}
