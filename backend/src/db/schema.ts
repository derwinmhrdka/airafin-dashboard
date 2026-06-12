import {
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
});

export const incomes = pgTable(
  'incomes',
  {
    id: serial('id').primaryKey(),
    source: text('source').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    period: text('period').notNull(),
  },
  (table) => [uniqueIndex('incomes_source_period_idx').on(table.source, table.period)],
);

export const budgets = pgTable(
  'budgets',
  {
    id: serial('id').primaryKey(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    allocatedAmount: numeric('allocated_amount', { precision: 14, scale: 2 }).notNull(),
    pic: text('pic').notNull().default(''),
    period: text('period').notNull(),
  },
  (table) => [uniqueIndex('budgets_category_period_idx').on(table.categoryId, table.period)],
);

export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => categories.id),
  detail: text('detail').notNull(),
  cost: numeric('cost', { precision: 14, scale: 2 }).notNull(),
  period: text('period').notNull(),
  pic: text('pic').notNull(),
  status: text('status').notNull(),
});

export type Category = typeof categories.$inferSelect;
export type Income = typeof incomes.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;

export type NewTransaction = typeof transactions.$inferInsert;
export type NewIncome = typeof incomes.$inferInsert;
export type NewBudget = typeof budgets.$inferInsert;
