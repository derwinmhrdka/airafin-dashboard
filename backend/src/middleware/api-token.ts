import type { FastifyReply, FastifyRequest } from 'fastify';

const TOKEN_HEADER = 'x-api-token';

export async function requireApiToken(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const secret = process.env.API_SECRET_TOKEN;

  if (!secret) {
    reply.code(503).send({ error: 'API token not configured on server' });
    return;
  }

  const token = request.headers[TOKEN_HEADER];
  if (!token || token !== secret) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
}
