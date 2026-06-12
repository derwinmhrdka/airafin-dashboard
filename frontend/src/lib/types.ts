export interface Category {
  id: number;
  name: string;
}

export interface CategorySummary {
  categoryId: number;
  categoryName: string;
  allocated: number;
  spent: number;
  sisa: number;
}

export interface DashboardSummary {
  period: string;
  totalIncome: number;
  totalBudgetAllocated: number;
  totalSpent: number;
  totalSisa: number;
  categories: CategorySummary[];
}

export interface Transaction {
  id: number;
  date: string;
  categoryId: number;
  categoryName: string;
  detail: string;
  cost: string;
  period: string;
  pic: string;
  status: string;
}

export interface ReimbursementItem extends Transaction {
  planPic: string;
}

export interface PlanIncome {
  id: number;
  source: string;
  amount: string;
  period: string;
}

export interface PlanBudget {
  id: number;
  categoryId: number;
  categoryName: string;
  allocatedAmount: string;
  pic: string;
  period: string;
}

export interface PlanData {
  period: string;
  incomes: PlanIncome[];
  budgets: PlanBudget[];
}
