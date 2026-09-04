import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/** Household / workspace. Financial rows are scoped by project. */
export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  /** Optional photo path (`/api/uploads/...`), legacy data URL, or absolute URL. */
  photo: text('photo'),
  createdAt: text('created_at').notNull(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
});

export const pockets = pgTable('pockets', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color').notNull().default('#71717a'),
});

export const incomes = pgTable(
  'incomes',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    period: text('period').notNull(),
  },
  (table) => [
    uniqueIndex('incomes_project_source_period_idx').on(
      table.projectId,
      table.source,
      table.period,
    ),
  ],
);

export const budgets = pgTable(
  'budgets',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    allocatedAmount: numeric('allocated_amount', { precision: 14, scale: 2 }).notNull(),
    pic: text('pic').notNull().default(''),
    pocket: text('pocket').notNull().default(''),
    period: text('period').notNull(),
  },
  (table) => [
    uniqueIndex('budgets_project_category_period_idx').on(
      table.projectId,
      table.categoryId,
      table.period,
    ),
  ],
);

export const budgetSubcategories = pgTable(
  'budget_subcategories',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    period: text('period').notNull(),
    name: text('name').notNull(),
    allocatedAmount: numeric('allocated_amount', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    pic: text('pic').notNull().default(''),
    pocket: text('pocket').notNull().default(''),
  },
  (table) => [
    uniqueIndex('budget_subcategories_project_cat_period_name_idx').on(
      table.projectId,
      table.categoryId,
      table.period,
      table.name,
    ),
  ],
);

export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => categories.id),
  subCategory: text('sub_category').notNull().default(''),
  detail: text('detail').notNull(),
  cost: numeric('cost', { precision: 14, scale: 2 }).notNull(),
  period: text('period').notNull(),
  pic: text('pic').notNull(),
  status: text('status').notNull(),
  /** Original payer PIC before transfer settlement (enables undo). */
  reimbursedFromPic: text('reimbursed_from_pic'),
});

/** PIC-to-PIC transfer checklist when a plan is created. */
export const planChecklist = pgTable('plan_checklist', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  period: text('period').notNull(),
  categoryId: integer('category_id').references(() => categories.id),
  subcategoryName: text('subcategory_name').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  senderPic: text('sender_pic').notNull(),
  receiverPic: text('receiver_pic').notNull(),
  pocket: text('pocket').notNull().default(''),
  done: boolean('done').notNull().default(false),
  isBalancing: boolean('is_balancing').notNull().default(false),
});

/** Google accounts allowed to sign in, mapped to a PIC. */
export const authEmails = pgTable('auth_emails', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  pic: text('pic').notNull(),
  /** App admin (in addition to AUTH_EMAIL env root). */
  isAdmin: boolean('is_admin').notNull().default(false),
});

/** Which Google users can open a project. */
export const projectMembers = pgTable(
  'project_members',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
  },
  (table) => [uniqueIndex('project_members_project_email_idx').on(table.projectId, table.email)],
);

/** Named PICs that can be assigned to users and plan/detail rows. */
export const pics = pgTable('pics', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
});

/** In-app notifications per PIC (pay due / paid received). */
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    toPic: text('to_pic').notNull(),
    fromPic: text('from_pic').notNull(),
    type: text('type').notNull(),
    /** Checklist subcategory or reimbursement detail — used in notification copy. */
    itemLabel: text('item_label').notNull().default(''),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    period: text('period').notNull(),
    refKey: text('ref_key').notNull(),
    readAt: text('read_at'),
    resolvedAt: text('resolved_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('notifications_project_ref_key_idx').on(table.projectId, table.refKey),
  ],
);

export type Project = typeof projects.$inferSelect;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Pocket = typeof pockets.$inferSelect;
export type Income = typeof incomes.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type BudgetSubcategory = typeof budgetSubcategories.$inferSelect;
export type PlanChecklistItem = typeof planChecklist.$inferSelect;
export type AuthEmail = typeof authEmails.$inferSelect;
export type PicRow = typeof pics.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;

/** Key/value app config (e.g. auto-generated VAPID keys — no .env required). */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** Browser Web Push subscriptions keyed by PIC. */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: serial('id').primaryKey(),
    pic: text('pic').notNull(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('push_subscriptions_endpoint_idx').on(table.endpoint),
    index('push_subscriptions_pic_idx').on(table.pic),
  ],
);

export type AppSetting = typeof appSettings.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

/** Broadcast info popup managed by admins. */
export const infoUpdates = pgTable('info_updates', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  active: boolean('active').notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const infoUpdatePages = pgTable('info_update_pages', {
  id: serial('id').primaryKey(),
  infoUpdateId: integer('info_update_id')
    .notNull()
    .references(() => infoUpdates.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  body: text('body').notNull().default(''),
  /** `/api/uploads/...` path, legacy data URL, or http(s) URL. */
  photo: text('photo'),
});

export const infoUpdateSkips = pgTable(
  'info_update_skips',
  {
    id: serial('id').primaryKey(),
    infoUpdateId: integer('info_update_id')
      .notNull()
      .references(() => infoUpdates.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    skippedAt: text('skipped_at').notNull(),
  },
  (table) => [
    uniqueIndex('info_update_skips_update_email_idx').on(table.infoUpdateId, table.email),
  ],
);

export type InfoUpdate = typeof infoUpdates.$inferSelect;
export type InfoUpdatePage = typeof infoUpdatePages.$inferSelect;
export type InfoUpdateSkip = typeof infoUpdateSkips.$inferSelect;

export type NewTransaction = typeof transactions.$inferInsert;
export type NewIncome = typeof incomes.$inferInsert;
export type NewBudget = typeof budgets.$inferInsert;
