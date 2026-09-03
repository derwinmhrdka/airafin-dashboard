import type { FastifyInstance } from 'fastify';
import { emailIsAdmin } from '../lib/auth-emails.js';
import {
  addProjectMember,
  copyPlanTemplate,
  createProject,
  deleteProject,
  getProjectById,
  listProjectMembers,
  listProjects,
  listProjectsForEmail,
  removeProjectMember,
  updateProject,
} from '../lib/project.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Active workspace from X-Project-Id (set by app onRequest). */
    projectId?: number;
  }
}

function userEmailFromRequest(request: { headers: Record<string, unknown> }): string {
  const raw = request.headers['x-user-email'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { all?: string } }>('/api/projects', async (request, reply) => {
    const email = userEmailFromRequest(request);
    const wantAll = request.query.all === '1' || request.query.all === 'true';

    if (wantAll) {
      const isAdmin = email ? await emailIsAdmin(email) : false;
      if (!isAdmin) {
        return reply.code(403).send({ error: 'Admin only' });
      }
      const rows = await listProjects();
      return {
        projects: rows.map((p) => ({
          id: p.id,
          name: p.name,
          photo: p.photo,
          createdAt: p.createdAt,
        })),
      };
    }

    const rows = await listProjectsForEmail(email);
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
          ownerEmail: userEmailFromRequest(request) || null,
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

  app.get<{ Params: { id: string } }>('/api/projects/:id/members', async (request, reply) => {
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return reply.code(400).send({ error: 'Invalid id' });
    }
    const project = await getProjectById(id);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    const members = await listProjectMembers(id);
    return { members };
  });

  app.post<{ Params: { id: string }; Body: { email?: string } }>(
    '/api/projects/:id/members',
    async (request, reply) => {
      const id = Number.parseInt(request.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return reply.code(400).send({ error: 'Invalid id' });
      }
      try {
        const result = await addProjectMember(id, request.body?.email ?? '');
        return reply.code(result.created ? 201 : 200).send(result);
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : 'Failed to add' });
      }
    },
  );

  app.delete<{ Params: { id: string; email: string } }>(
    '/api/projects/:id/members/:email',
    async (request, reply) => {
      const id = Number.parseInt(request.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return reply.code(400).send({ error: 'Invalid id' });
      }
      const email = decodeURIComponent(request.params.email);
      const removed = await removeProjectMember(id, email);
      if (!removed) return reply.code(404).send({ error: 'Member not found' });
      return { ok: true };
    },
  );

  app.post<{
    Params: { id: string };
    Body: { fromProjectId?: number; period?: string };
  }>('/api/projects/:id/copy-template', async (request, reply) => {
    const toProjectId = Number.parseInt(request.params.id, 10);
    const fromProjectId = Number(request.body?.fromProjectId);
    const period = request.body?.period?.trim() ?? '';
    if (!Number.isFinite(toProjectId) || toProjectId <= 0) {
      return reply.code(400).send({ error: 'Invalid id' });
    }
    if (!Number.isFinite(fromProjectId) || fromProjectId <= 0) {
      return reply.code(400).send({ error: 'fromProjectId is required' });
    }
    try {
      const result = await copyPlanTemplate({ fromProjectId, toProjectId, period });
      return { ok: true, period, ...result };
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'Copy failed' });
    }
  });
}
