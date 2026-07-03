export interface Category {
  id: number;
  name: string;
}

export interface PocketSetting {
  id: number;
  name: string;
  color: string;
}

export interface SubcategorySummary {
  name: string;
  pic: string;
  allocated: number;
  spent: number;
  sisa: number;
}

export interface CategorySummary {
  categoryId: number;
  categoryName: string;
  allocated: number;
  spent: number;
  sisa: number;
  subcategories: SubcategorySummary[];
}

export interface DashboardSummary {
  period: string;
  totalIncome: number;
  totalBudgetAllocated: number;
  totalSpent: number;
  totalSisa: number;
  picPocketTotals: {
    pic: string;
    pockets: { pocket: string; color: string; total: number; spent: number; sisa: number }[];
    total: number;
    spent: number;
    sisa: number;
  }[];
  categories: CategorySummary[];
}

export interface Transaction {
  id: number;
  date: string;
  categoryId: number;
  categoryName: string;
  subCategory: string;
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
  pocket: string;
  period: string;
}

export interface PlanSubcategory {
  id: number;
  categoryId: number;
  name: string;
  allocatedAmount: string;
  pic: string;
  pocket: string;
  period: string;
}

export interface PlanData {
  period: string;
  incomes: PlanIncome[];
  budgets: PlanBudget[];
  subcategories: PlanSubcategory[];
}
