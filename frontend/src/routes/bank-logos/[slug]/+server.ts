import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const GET: RequestHandler = async ({ params }) => {
  const slug = params.slug?.replace(/\.svg$/i, '') ?? '';
  if (!SLUG.test(slug)) error(404, 'Not found');

  const file = path.join(process.cwd(), 'node_modules', 'idn-finlogos', 'dist', 'icons', `${slug}.svg`);
  try {
    const svg = await readFile(file);
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    error(404, 'Not found');
  }
};
