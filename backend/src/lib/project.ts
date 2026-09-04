import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  budgetSubcategories,
  budgets,
  incomes,
  planChecklist,
  projectMembers,
  projects,
} from '../db/schema.js';
import { authEmailExists } from './auth-emails.js';
import { deleteManagedPhoto, persistPhotoInput, pruneReplacedPhotos } from './photo-storage.js';

const MAX_NAME = 64;

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeProjectName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export async function listProjects() {
  return db.select().from(projects).orderBy(asc(projects.id));
}

export async function listProjectsForEmail(email: string, _isAdmin?: boolean) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      photo: projects.photo,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
    .where(eq(projectMembers.email, normalized))
    .orderBy(asc(projects.id));
  return rows;
}

export async function isProjectMember(projectId: number, email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const [row] = await db
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.email, normalized)))
    .limit(1);
  return Boolean(row);
}

export async function getProjectById(id: number) {
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return row ?? null;
}

export async function createProject(input: {
  name: string;
  photo?: string | null;
  ownerEmail?: string | null;
}) {
  const name = normalizeProjectName(input.name);
  if (!name) throw new Error('name is required');
  if (name.length > MAX_NAME) throw new Error('Project name is too long');

  const photo = await persistPhotoInput(input.photo, 'projects');
  const [created] = await db
    .insert(projects)
    .values({ name, photo, createdAt: nowIso() })
    .returning();

  if (created && input.ownerEmail?.trim()) {
    await addProjectMember(created.id, input.ownerEmail);
  }

  return created;
}

export async function updateProject(
  id: number,
  input: { name?: string; photo?: string | null },
) {
  const existing = await getProjectById(id);
  if (!existing) return null;

  const patch: { name?: string; photo?: string | null } = {};
  if (input.name !== undefined) {
    const name = normalizeProjectName(input.name);
    if (!name) throw new Error('name is required');
    if (name.length > MAX_NAME) throw new Error('Project name is too long');
    patch.name = name;
  }
  let nextPhoto: string | null | undefined;
  if (input.photo !== undefined) {
    nextPhoto = await persistPhotoInput(input.photo, 'projects');
    patch.photo = nextPhoto;
  }

  const [updated] = await db
    .update(projects)
    .set(patch)
    .where(eq(projects.id, id))
    .returning();

  if (nextPhoto !== undefined) {
    await pruneReplacedPhotos([existing.photo], [nextPhoto]);
  }
  return updated ?? null;
}

export async function deleteProject(id: number): Promise<{ ok: true } | { error: string; status: number }> {
  const existing = await getProjectById(id);
  if (!existing) return { error: 'Project not found', status: 404 };

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(projects);
  if ((count ?? 0) <= 1) {
    return { error: 'Keep at least one project', status: 409 };
  }

  await db.delete(projects).where(eq(projects.id, id));
  await deleteManagedPhoto(existing.photo);
  return { ok: true };
}

export async function listProjectMembers(projectId: number) {
  return db
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(projectMembers.email));
}

export async function addProjectMember(projectId: number, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes('@')) throw new Error('Valid email is required');
  if (!(await authEmailExists(email))) {
    throw new Error('User must be registered first (Admin → Users)');
  }
  const project = await getProjectById(projectId);
  if (!project) throw new Error('Project not found');

  const [existing] = await db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.email, email)))
    .limit(1);
  if (existing) return { member: existing, created: false as const };

  const [created] = await db
    .insert(projectMembers)
    .values({ projectId, email })
    .returning();
  return { member: created, created: true as const };
}

export async function removeProjectMember(projectId: number, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const deleted = await db
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.email, email)))
    .returning();
  return deleted[0] ?? null;
}

/**
 * Copy plan template (incomes + budgets + subcategories + checklist) for a period
 * from one project into another (replaces target period plan rows).
 */
export async function copyPlanTemplate(input: {
  fromProjectId: number;
  toProjectId: number;
  period: string;
}): Promise<{ copied: { incomes: number; budgets: number; subcategories: number; checklist: number } }> {
  const period = input.period.trim();
  if (!period) throw new Error('period is required');
  if (input.fromProjectId === input.toProjectId) {
    throw new Error('Choose a different source project');
  }

  const from = await getProjectById(input.fromProjectId);
  const to = await getProjectById(input.toProjectId);
  if (!from || !to) throw new Error('Project not found');

  const incomeRows = await db
    .select()
    .from(incomes)
    .where(and(eq(incomes.projectId, input.fromProjectId), eq(incomes.period, period)));
  const budgetRows = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.projectId, input.fromProjectId), eq(budgets.period, period)));
  const subRows = await db
    .select()
    .from(budgetSubcategories)
    .where(
      and(
        eq(budgetSubcategories.projectId, input.fromProjectId),
        eq(budgetSubcategories.period, period),
      ),
    );
  const checklistRows = await db
    .select()
    .from(planChecklist)
    .where(
      and(eq(planChecklist.projectId, input.fromProjectId), eq(planChecklist.period, period)),
    );

  await db
    .delete(incomes)
    .where(and(eq(incomes.projectId, input.toProjectId), eq(incomes.period, period)));
  await db
    .delete(budgets)
    .where(and(eq(budgets.projectId, input.toProjectId), eq(budgets.period, period)));
  await db
    .delete(budgetSubcategories)
    .where(
      and(
        eq(budgetSubcategories.projectId, input.toProjectId),
        eq(budgetSubcategories.period, period),
      ),
    );
  await db
    .delete(planChecklist)
    .where(
      and(eq(planChecklist.projectId, input.toProjectId), eq(planChecklist.period, period)),
    );

  if (incomeRows.length > 0) {
    await db.insert(incomes).values(
      incomeRows.map((r) => ({
        projectId: input.toProjectId,
        source: r.source,
        amount: r.amount,
        period: r.period,
      })),
    );
  }
  if (budgetRows.length > 0) {
    await db.insert(budgets).values(
      budgetRows.map((r) => ({
        projectId: input.toProjectId,
        categoryId: r.categoryId,
        allocatedAmount: r.allocatedAmount,
        pic: r.pic,
        pocket: r.pocket,
        period: r.period,
      })),
    );
  }
  if (subRows.length > 0) {
    await db.insert(budgetSubcategories).values(
      subRows.map((r) => ({
        projectId: input.toProjectId,
        categoryId: r.categoryId,
        period: r.period,
        name: r.name,
        allocatedAmount: r.allocatedAmount,
        pic: r.pic,
        pocket: r.pocket,
      })),
    );
  }
  if (checklistRows.length > 0) {
    await db.insert(planChecklist).values(
      checklistRows.map((r) => ({
        projectId: input.toProjectId,
        period: r.period,
        categoryId: r.categoryId,
        subcategoryName: r.subcategoryName,
        amount: r.amount,
        senderPic: r.senderPic,
        receiverPic: r.receiverPic,
        pocket: r.pocket,
        done: false,
        isBalancing: r.isBalancing,
      })),
    );
  }

  return {
    copied: {
      incomes: incomeRows.length,
      budgets: budgetRows.length,
      subcategories: subRows.length,
      checklist: checklistRows.length,
    },
  };
}

export function parseProjectIdHeader(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}
