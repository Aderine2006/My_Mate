import React, { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, ResponsiveContainer } from 'recharts';
import { Plus, Edit2, Trash2, Save, TrendingUp, TrendingDown, DollarSign, Target, AlertTriangle, CheckCircle, ArrowUpRight, ArrowDownRight, Lightbulb, PiggyBank, Wallet, BarChart3 as BarChartIcon, Download } from 'lucide-react';
import { saveToFirestore, loadFromFirestore } from '../firestore-helpers';

// ============ TypeScript Interfaces ============

interface Income {
    id: number;
    source: string;
    amount: number;
    month: string; // YYYY-MM
    date: string;
    notes: string;
    createdAt: string;
}

interface Expense {
    id: number;
    category: ExpenseCategory;
    amount: number;
    month: string; // YYYY-MM
    date: string;
    notes: string;
    createdAt: string;
}

interface BudgetLimit {
    id: number;
    category: ExpenseCategory;
    limit: number;
    month: string; // YYYY-MM
}

interface SavingsGoal {
    id: number;
    title: string;
    targetAmount: number;
    currentAmount: number;
    targetDate: string;
    createdAt: string;
}

type ExpenseCategory = 'Food' | 'Rent' | 'Transport' | 'Gym' | 'Subscriptions' | 'Misc';
type BudgetTab = 'summary' | 'income' | 'expenses' | 'budgets' | 'goals' | 'analytics' | 'insights';

const EXPENSE_CATEGORIES: ExpenseCategory[] = ['Food', 'Rent', 'Transport', 'Gym', 'Subscriptions', 'Misc'];

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
    Food: '#f59e0b',
    Rent: '#6366f1',
    Transport: '#10b981',
    Gym: '#ef4444',
    Subscriptions: '#8b5cf6',
    Misc: '#64748b',
};

const CHART_COLORS = ['#f59e0b', '#6366f1', '#10b981', '#ef4444', '#8b5cf6', '#64748b'];

interface BudgetPlannerProps {
    user: { id: string; email: string; name: string } | null;
    theme: 'light' | 'dark';
}

const BudgetPlanner: React.FC<BudgetPlannerProps> = ({ user, theme }) => {
    const [activeSubTab, setActiveSubTab] = useState<BudgetTab>('summary');
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    // Data state
    const [incomes, setIncomes] = useState<Income[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [budgetLimits, setBudgetLimits] = useState<BudgetLimit[]>([]);
    const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Form state
    const [showIncomeForm, setShowIncomeForm] = useState(false);
    const [editingIncomeId, setEditingIncomeId] = useState<number | null>(null);
    const [incomeForm, setIncomeForm] = useState({ source: '', amount: '', date: '', notes: '' });

    const [showExpenseForm, setShowExpenseForm] = useState(false);
    const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
    const [expenseForm, setExpenseForm] = useState({ category: 'Food' as ExpenseCategory, amount: '', date: '', notes: '' });

    const [showBudgetForm, setShowBudgetForm] = useState(false);
    const [budgetForm, setBudgetForm] = useState({ category: 'Food' as ExpenseCategory, limit: '' });

    const [showGoalForm, setShowGoalForm] = useState(false);
    const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
    const [goalForm, setGoalForm] = useState({ title: '', targetAmount: '', currentAmount: '', targetDate: '' });

    // ============ Data Loading / Saving ============

    const loadBudgetData = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const [inc, exp, limits, goals] = await Promise.all([
                loadFromFirestore(user.id, 'budgetIncomes'),
                loadFromFirestore(user.id, 'budgetExpenses'),
                loadFromFirestore(user.id, 'budgetLimits'),
                loadFromFirestore(user.id, 'budgetGoals'),
            ]);
            if (inc) setIncomes(inc);
            if (exp) setExpenses(exp);
            if (limits) setBudgetLimits(limits);
            if (goals) setSavingsGoals(goals);
        } catch (error) {
            console.error('Error loading budget data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadBudgetData();
    }, [loadBudgetData]);

    const saveBudgetData = async (key: 'budgetIncomes' | 'budgetExpenses' | 'budgetLimits' | 'budgetGoals', data: any) => {
        if (!user) return;
        try {
            await saveToFirestore(user.id, key, data);
        } catch (error) {
            console.error(`Error saving ${key}:`, error);
        }
    };

    // ============ Computed Values ============

    const monthIncomes = incomes.filter(i => i.month === selectedMonth);
    const monthExpenses = expenses.filter(e => e.month === selectedMonth);
    const monthLimits = budgetLimits.filter(b => b.month === selectedMonth);

    const totalIncome = monthIncomes.reduce((sum, i) => sum + i.amount, 0);
    const totalExpenses = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
    const balance = totalIncome - totalExpenses;
    const savingsPercent = totalIncome > 0 ? Math.round((balance / totalIncome) * 100) : 0;

    const getCategoryTotal = (cat: ExpenseCategory) => monthExpenses.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0);
    const getCategoryLimit = (cat: ExpenseCategory) => monthLimits.find(b => b.category === cat)?.limit || 0;

    // ============ Income Handlers ============

    const handleAddIncome = () => {
        if (!incomeForm.source || !incomeForm.amount || !incomeForm.date) return;
        const month = incomeForm.date.substring(0, 7);
        const newIncome: Income = {
            id: Date.now(),
            source: incomeForm.source,
            amount: parseFloat(incomeForm.amount),
            month,
            date: incomeForm.date,
            notes: incomeForm.notes,
            createdAt: new Date().toISOString(),
        };
        const updated = [...incomes, newIncome];
        setIncomes(updated);
        saveBudgetData('budgetIncomes', updated);
        resetIncomeForm();
    };

    const handleUpdateIncome = () => {
        if (!incomeForm.source || !incomeForm.amount || !incomeForm.date) return;
        const month = incomeForm.date.substring(0, 7);
        const updated = incomes.map(i =>
            i.id === editingIncomeId
                ? { ...i, source: incomeForm.source, amount: parseFloat(incomeForm.amount), month, date: incomeForm.date, notes: incomeForm.notes }
                : i
        );
        setIncomes(updated);
        saveBudgetData('budgetIncomes', updated);
        resetIncomeForm();
    };

    const handleDeleteIncome = (id: number) => {
        const updated = incomes.filter(i => i.id !== id);
        setIncomes(updated);
        saveBudgetData('budgetIncomes', updated);
    };

    const resetIncomeForm = () => {
        setIncomeForm({ source: '', amount: '', date: '', notes: '' });
        setShowIncomeForm(false);
        setEditingIncomeId(null);
    };

    // ============ Expense Handlers ============

    const handleAddExpense = () => {
        if (!expenseForm.amount || !expenseForm.date) return;
        const month = expenseForm.date.substring(0, 7);
        const newExpense: Expense = {
            id: Date.now(),
            category: expenseForm.category,
            amount: parseFloat(expenseForm.amount),
            month,
            date: expenseForm.date,
            notes: expenseForm.notes,
            createdAt: new Date().toISOString(),
        };
        const updated = [...expenses, newExpense];
        setExpenses(updated);
        saveBudgetData('budgetExpenses', updated);
        resetExpenseForm();
    };

    const handleUpdateExpense = () => {
        if (!expenseForm.amount || !expenseForm.date) return;
        const month = expenseForm.date.substring(0, 7);
        const updated = expenses.map(e =>
            e.id === editingExpenseId
                ? { ...e, category: expenseForm.category, amount: parseFloat(expenseForm.amount), month, date: expenseForm.date, notes: expenseForm.notes }
                : e
        );
        setExpenses(updated);
        saveBudgetData('budgetExpenses', updated);
        resetExpenseForm();
    };

    const handleDeleteExpense = (id: number) => {
        const updated = expenses.filter(e => e.id !== id);
        setExpenses(updated);
        saveBudgetData('budgetExpenses', updated);
    };

    const resetExpenseForm = () => {
        setExpenseForm({ category: 'Food', amount: '', date: '', notes: '' });
        setShowExpenseForm(false);
        setEditingExpenseId(null);
    };

    // ============ Budget Limit Handlers ============

    const handleSetBudgetLimit = () => {
        if (!budgetForm.limit) return;
        const existing = monthLimits.find(b => b.category === budgetForm.category);
        let updated: BudgetLimit[];
        if (existing) {
            updated = budgetLimits.map(b =>
                b.id === existing.id ? { ...b, limit: parseFloat(budgetForm.limit) } : b
            );
        } else {
            updated = [...budgetLimits, {
                id: Date.now(),
                category: budgetForm.category,
                limit: parseFloat(budgetForm.limit),
                month: selectedMonth,
            }];
        }
        setBudgetLimits(updated);
        saveBudgetData('budgetLimits', updated);
        setBudgetForm({ category: 'Food', limit: '' });
        setShowBudgetForm(false);
    };

    const handleDeleteBudgetLimit = (id: number) => {
        const updated = budgetLimits.filter(b => b.id !== id);
        setBudgetLimits(updated);
        saveBudgetData('budgetLimits', updated);
    };

    // ============ Savings Goal Handlers ============

    const handleAddGoal = () => {
        if (!goalForm.title || !goalForm.targetAmount || !goalForm.targetDate) return;
        const newGoal: SavingsGoal = {
            id: Date.now(),
            title: goalForm.title,
            targetAmount: parseFloat(goalForm.targetAmount),
            currentAmount: parseFloat(goalForm.currentAmount) || 0,
            targetDate: goalForm.targetDate,
            createdAt: new Date().toISOString(),
        };
        const updated = [...savingsGoals, newGoal];
        setSavingsGoals(updated);
        saveBudgetData('budgetGoals', updated);
        resetGoalForm();
    };

    const handleUpdateGoal = () => {
        if (!goalForm.title || !goalForm.targetAmount || !goalForm.targetDate) return;
        const updated = savingsGoals.map(g =>
            g.id === editingGoalId
                ? { ...g, title: goalForm.title, targetAmount: parseFloat(goalForm.targetAmount), currentAmount: parseFloat(goalForm.currentAmount) || 0, targetDate: goalForm.targetDate }
                : g
        );
        setSavingsGoals(updated);
        saveBudgetData('budgetGoals', updated);
        resetGoalForm();
    };

    const handleDeleteGoal = (id: number) => {
        const updated = savingsGoals.filter(g => g.id !== id);
        setSavingsGoals(updated);
        saveBudgetData('budgetGoals', updated);
    };

    const resetGoalForm = () => {
        setGoalForm({ title: '', targetAmount: '', currentAmount: '', targetDate: '' });
        setShowGoalForm(false);
        setEditingGoalId(null);
    };

    // ============ Export Handler ============

    const handleExportCSV = () => {
        if (!user) return;

        // Prepare data for export
        const rows = [
            ['Type', 'Source/Category', 'Amount', 'Date', 'Notes'],
            ...monthIncomes.map(inc => ['Income', inc.source, inc.amount, inc.date, inc.notes]),
            ...monthExpenses.map(exp => ['Expense', exp.category, exp.amount, exp.date, exp.notes])
        ];

        const csvContent = "data:text/csv;charset=utf-8,"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `budget-summary-${selectedMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ============ Smart Insights ============

    const generateInsights = (): string[] => {
        const insights: string[] = [];

        if (totalExpenses > 0 && totalIncome > 0) {
            // Category breakdown insights
            EXPENSE_CATEGORIES.forEach(cat => {
                const catTotal = getCategoryTotal(cat);
                if (catTotal > 0) {
                    const pct = Math.round((catTotal / totalExpenses) * 100);
                    if (pct >= 30) insights.push(`⚠️ You spent ${pct}% of your expenses on ${cat} this month`);
                }
            });

            // Budget overspend
            monthLimits.forEach(limit => {
                const spent = getCategoryTotal(limit.category);
                if (spent > limit.limit) {
                    insights.push(`🚨 You're ₹${(spent - limit.limit).toLocaleString('en-IN')} over budget in ${limit.category}`);
                } else if (spent > limit.limit * 0.8) {
                    insights.push(`⏳ ${limit.category} spending is at ${Math.round((spent / limit.limit) * 100)}% of your budget`);
                }
            });

            // Savings rate
            if (savingsPercent >= 30) {
                insights.push(`🎉 Great savings rate of ${savingsPercent}% this month!`);
            } else if (savingsPercent >= 10) {
                insights.push(`💰 Your savings rate is ${savingsPercent}%. Try to reach 30%!`);
            } else if (savingsPercent > 0) {
                insights.push(`📉 Low savings rate of ${savingsPercent}%. Consider reducing discretionary spending.`);
            } else if (savingsPercent < 0) {
                insights.push(`🚨 You're spending more than you earn! Deficit: ₹${Math.abs(balance).toLocaleString('en-IN')}`);
            }
        }

        // Previous month comparison
        const prevMonth = getPreviousMonth(selectedMonth);
        const prevExpenses = expenses.filter(e => e.month === prevMonth);
        const prevTotal = prevExpenses.reduce((sum, e) => sum + e.amount, 0);
        if (prevTotal > 0 && totalExpenses > 0) {
            const change = Math.round(((totalExpenses - prevTotal) / prevTotal) * 100);
            if (change > 10) insights.push(`📈 Spending increased by ${change}% compared to last month`);
            else if (change < -10) insights.push(`📉 Spending decreased by ${Math.abs(change)}% compared to last month — great job!`);
            else insights.push(`➡️ Spending is similar to last month (${change > 0 ? '+' : ''}${change}%)`);
        }

        // Consistent spending detection
        const last3Months = [selectedMonth, getPreviousMonth(selectedMonth), getPreviousMonth(getPreviousMonth(selectedMonth))];
        EXPENSE_CATEGORIES.forEach(cat => {
            const monthlyAmounts = last3Months.map(m => expenses.filter(e => e.month === m && e.category === cat).reduce((s, e) => s + e.amount, 0));
            if (monthlyAmounts.every(a => a > 0)) {
                const avg = monthlyAmounts.reduce((s, a) => s + a, 0) / 3;
                const variance = monthlyAmounts.reduce((s, a) => s + Math.pow(a - avg, 2), 0) / 3;
                const stdDev = Math.sqrt(variance);
                if (stdDev / avg < 0.15) {
                    insights.push(`📊 ${cat} spending is consistent at ~₹${Math.round(avg).toLocaleString('en-IN')}/month`);
                }
            }
        });

        // Goals progress
        savingsGoals.forEach(goal => {
            const pct = Math.round((goal.currentAmount / goal.targetAmount) * 100);
            if (pct >= 90) insights.push(`🎯 "${goal.title}" is almost complete! (${pct}%)`);
            else if (pct >= 50) insights.push(`💪 "${goal.title}" is halfway there (${pct}%)`);
        });

        if (insights.length === 0) insights.push(`📝 Add income and expenses to see personalized insights!`);

        return insights;
    };

    const getPreviousMonth = (month: string): string => {
        const [y, m] = month.split('-').map(Number);
        const d = new Date(y, m - 2, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    // ============ Chart Data ============

    const pieData = EXPENSE_CATEGORIES.map(cat => ({
        name: cat,
        value: getCategoryTotal(cat),
    })).filter(d => d.value > 0);

    const getBarData = () => {
        const months: string[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
        return months.map(m => ({
            month: new Date(m + '-01').toLocaleDateString('en-US', { month: 'short' }),
            Income: incomes.filter(i => i.month === m).reduce((s, i) => s + i.amount, 0),
            Expenses: expenses.filter(e => e.month === m).reduce((s, e) => s + e.amount, 0),
        }));
    };

    const getLineData = () => {
        const months: string[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
        return months.map(m => {
            const inc = incomes.filter(i => i.month === m).reduce((s, i) => s + i.amount, 0);
            const exp = expenses.filter(e => e.month === m).reduce((s, e) => s + e.amount, 0);
            return {
                month: new Date(m + '-01').toLocaleDateString('en-US', { month: 'short' }),
                Income: inc,
                Expenses: exp,
                Savings: inc - exp,
            };
        });
    };

    // ============ Month Navigation ============

    const getMonthLabel = (m: string) => {
        const [y, mo] = m.split('-');
        return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    const navigateMonth = (dir: number) => {
        const [y, m] = selectedMonth.split('-').map(Number);
        const d = new Date(y, m - 1 + dir, 1);
        setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    };

    // ============ Shared Styles ============
    const cardClass = 'bg-white dark:bg-gray-800  shadow-md border border-gray-200 dark:border-gray-700 p-6';
    const inputClass = 'w-full px-4 py-2 border border-gray-300 dark:border-gray-600  focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500';
    const btnPrimary = 'px-4 py-2 bg-indigo-600 text-white  hover:bg-indigo-700 transition-colors font-medium';
    const btnDanger = 'p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20  transition-colors';

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent  animate-spin" />
            </div>
        );
    }

    // ============ Sub-Tab Definitions ============
    const subTabs: { id: BudgetTab; label: string; icon: React.ReactNode }[] = [
        { id: 'summary', label: 'Summary', icon: <Wallet size={16} /> },
        { id: 'income', label: 'Income', icon: <ArrowUpRight size={16} /> },
        { id: 'expenses', label: 'Expenses', icon: <ArrowDownRight size={16} /> },
        { id: 'budgets', label: 'Budgets', icon: <DollarSign size={16} /> },
        { id: 'goals', label: 'Goals', icon: <Target size={16} /> },
        { id: 'analytics', label: 'Analytics', icon: <BarChartIcon size={16} /> },
        { id: 'insights', label: 'Insights', icon: <Lightbulb size={16} /> },
    ];

    return (
        <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100 mb-2">Budget Planner</h2>
                    <p className="text-gray-500 dark:text-gray-400">Track your income, expenses, and savings goals</p>
                </div>
                <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700  hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm text-sm font-medium"
                >
                    <Download size={18} />
                    Download Summary (CSV)
                </button>
            </div>

            {/* Month Selector */}
            <div className="flex items-center gap-4 mb-6">
                <button onClick={() => navigateMonth(-1)} className="px-3 py-1 bg-gray-200 dark:bg-gray-700  hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors">&larr;</button>
                <span className="text-lg font-semibold text-gray-800 dark:text-gray-100 min-w-[180px] text-center">{getMonthLabel(selectedMonth)}</span>
                <button onClick={() => navigateMonth(1)} className="px-3 py-1 bg-gray-200 dark:bg-gray-700  hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors">&rarr;</button>
            </div>

            {/* Sub-Tab Navigation */}
            <div className="flex flex-wrap gap-2 mb-6 bg-gray-100 dark:bg-gray-800 p-1 ">
                {subTabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveSubTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2  text-sm font-medium transition-all ${activeSubTab === tab.id
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ========== SUMMARY TAB ========== */}
            {activeSubTab === 'summary' && (
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30  shadow p-5 border border-green-200 dark:border-green-800">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Total Income</span>
                                <TrendingUp className="text-green-500" size={20} />
                            </div>
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">₹{totalIncome.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/30 dark:to-rose-900/30  shadow p-5 border border-red-200 dark:border-red-800">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Total Expenses</span>
                                <TrendingDown className="text-red-500" size={20} />
                            </div>
                            <p className="text-2xl font-bold text-red-600 dark:text-red-400">₹{totalExpenses.toLocaleString('en-IN')}</p>
                        </div>
                        <div className={`bg-gradient-to-br ${balance >= 0 ? 'from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-blue-200 dark:border-blue-800' : 'from-orange-50 to-red-50 dark:from-orange-900/30 dark:to-red-900/30 border-orange-200 dark:border-orange-800'}  shadow p-5 border`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Remaining</span>
                                <Wallet className={balance >= 0 ? 'text-blue-500' : 'text-orange-500'} size={20} />
                            </div>
                            <p className={`text-2xl font-bold ${balance >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`}>₹{balance.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/30 dark:to-violet-900/30  shadow p-5 border border-purple-200 dark:border-purple-800">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Savings %</span>
                                <PiggyBank className="text-purple-500" size={20} />
                            </div>
                            <p className={`text-2xl font-bold ${savingsPercent >= 20 ? 'text-purple-600 dark:text-purple-400' : 'text-orange-600 dark:text-orange-400'}`}>{savingsPercent}%</p>
                        </div>
                    </div>

                    {/* Category Spending Overview */}
                    <div className={cardClass}>
                        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">Category Spending</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {EXPENSE_CATEGORIES.map(cat => {
                                const spent = getCategoryTotal(cat);
                                const limit = getCategoryLimit(cat);
                                const pct = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0;
                                const isOver = limit > 0 && spent > limit;
                                return (
                                    <div key={cat} className={`p-4  border ${isOver ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 " style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                                                <span className="font-medium text-gray-700 dark:text-gray-200">{cat}</span>
                                            </div>
                                            {isOver && <AlertTriangle className="text-red-500" size={16} />}
                                        </div>
                                        <p className="text-xl font-bold text-gray-800 dark:text-gray-100">₹{spent.toLocaleString('en-IN')}</p>
                                        {limit > 0 && (
                                            <>
                                                <div className="w-full bg-gray-200 dark:bg-gray-600  h-2 mt-2">
                                                    <div className={`h-2  transition-all ${isOver ? 'bg-red-500' : pct > 80 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                                </div>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">₹{spent.toLocaleString('en-IN')} / ₹{limit.toLocaleString('en-IN')} ({pct}%)</p>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ========== INCOME TAB ========== */}
            {activeSubTab === 'income' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Income Sources</h3>
                        <button onClick={() => { resetIncomeForm(); setShowIncomeForm(true); }} className={btnPrimary}>
                            <span className="flex items-center gap-2"><Plus size={16} /> Add Income</span>
                        </button>
                    </div>

                    {showIncomeForm && (
                        <div className={cardClass}>
                            <h4 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">{editingIncomeId ? 'Edit Income' : 'New Income'}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Source</label>
                                    <input type="text" value={incomeForm.source} onChange={e => setIncomeForm({ ...incomeForm, source: e.target.value })} className={inputClass} placeholder="e.g., Salary, Freelance" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (₹)</label>
                                    <input type="number" value={incomeForm.amount} onChange={e => setIncomeForm({ ...incomeForm, amount: e.target.value })} className={inputClass} placeholder="0" min="0" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                                    <input type="date" value={incomeForm.date} onChange={e => setIncomeForm({ ...incomeForm, date: e.target.value })} className={inputClass} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                                    <input type="text" value={incomeForm.notes} onChange={e => setIncomeForm({ ...incomeForm, notes: e.target.value })} className={inputClass} placeholder="Optional" />
                                </div>
                            </div>
                            <div className="flex gap-3 mt-4">
                                <button onClick={editingIncomeId ? handleUpdateIncome : handleAddIncome} className={btnPrimary}>
                                    <span className="flex items-center gap-2"><Save size={16} /> {editingIncomeId ? 'Update' : 'Save'}</span>
                                </button>
                                <button onClick={resetIncomeForm} className="px-4 py-2 border border-gray-300 dark:border-gray-600  hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors">Cancel</button>
                            </div>
                        </div>
                    )}

                    {monthIncomes.length === 0 ? (
                        <div className={`${cardClass} text-center py-12`}>
                            <TrendingUp className="mx-auto text-gray-300 dark:text-gray-600 mb-3" size={48} />
                            <p className="text-gray-500 dark:text-gray-400">No income entries for {getMonthLabel(selectedMonth)}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {monthIncomes.sort((a, b) => b.date.localeCompare(a.date)).map(inc => (
                                <div key={inc.id} className={`${cardClass} flex items-center justify-between`}>
                                    <div>
                                        <p className="font-semibold text-gray-800 dark:text-gray-100">{inc.source}</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">{new Date(inc.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} {inc.notes && `• ${inc.notes}`}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg font-bold text-green-600 dark:text-green-400">+₹{inc.amount.toLocaleString('en-IN')}</span>
                                        <button onClick={() => { setEditingIncomeId(inc.id); setIncomeForm({ source: inc.source, amount: String(inc.amount), date: inc.date, notes: inc.notes }); setShowIncomeForm(true); }} className="p-2 text-gray-400 hover:text-indigo-500 transition-colors"><Edit2 size={16} /></button>
                                        <button onClick={() => handleDeleteIncome(inc.id)} className={btnDanger}><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ========== EXPENSES TAB ========== */}
            {activeSubTab === 'expenses' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Expenses</h3>
                        <button onClick={() => { resetExpenseForm(); setShowExpenseForm(true); }} className={btnPrimary}>
                            <span className="flex items-center gap-2"><Plus size={16} /> Add Expense</span>
                        </button>
                    </div>

                    {showExpenseForm && (
                        <div className={cardClass}>
                            <h4 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">{editingExpenseId ? 'Edit Expense' : 'New Expense'}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                                    <select value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value as ExpenseCategory })} className={inputClass}>
                                        {EXPENSE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (₹)</label>
                                    <input type="number" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} className={inputClass} placeholder="0" min="0" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                                    <input type="date" value={expenseForm.date} onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })} className={inputClass} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                                    <input type="text" value={expenseForm.notes} onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })} className={inputClass} placeholder="Optional" />
                                </div>
                            </div>
                            <div className="flex gap-3 mt-4">
                                <button onClick={editingExpenseId ? handleUpdateExpense : handleAddExpense} className={btnPrimary}>
                                    <span className="flex items-center gap-2"><Save size={16} /> {editingExpenseId ? 'Update' : 'Save'}</span>
                                </button>
                                <button onClick={resetExpenseForm} className="px-4 py-2 border border-gray-300 dark:border-gray-600  hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors">Cancel</button>
                            </div>
                        </div>
                    )}

                    {monthExpenses.length === 0 ? (
                        <div className={`${cardClass} text-center py-12`}>
                            <TrendingDown className="mx-auto text-gray-300 dark:text-gray-600 mb-3" size={48} />
                            <p className="text-gray-500 dark:text-gray-400">No expenses for {getMonthLabel(selectedMonth)}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {monthExpenses.sort((a, b) => b.date.localeCompare(a.date)).map(exp => (
                                <div key={exp.id} className={`${cardClass} flex items-center justify-between`}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3  flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[exp.category] }} />
                                        <div>
                                            <p className="font-semibold text-gray-800 dark:text-gray-100">{exp.category}</p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">{new Date(exp.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} {exp.notes && `• ${exp.notes}`}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg font-bold text-red-600 dark:text-red-400">-₹{exp.amount.toLocaleString('en-IN')}</span>
                                        <button onClick={() => { setEditingExpenseId(exp.id); setExpenseForm({ category: exp.category, amount: String(exp.amount), date: exp.date, notes: exp.notes }); setShowExpenseForm(true); }} className="p-2 text-gray-400 hover:text-indigo-500 transition-colors"><Edit2 size={16} /></button>
                                        <button onClick={() => handleDeleteExpense(exp.id)} className={btnDanger}><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ========== BUDGETS TAB ========== */}
            {activeSubTab === 'budgets' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Budget Limits — {getMonthLabel(selectedMonth)}</h3>
                        <button onClick={() => setShowBudgetForm(true)} className={btnPrimary}>
                            <span className="flex items-center gap-2"><Plus size={16} /> Set Limit</span>
                        </button>
                    </div>

                    {showBudgetForm && (
                        <div className={cardClass}>
                            <h4 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">Set Budget Limit</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                                    <select value={budgetForm.category} onChange={e => setBudgetForm({ ...budgetForm, category: e.target.value as ExpenseCategory })} className={inputClass}>
                                        {EXPENSE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monthly Limit (₹)</label>
                                    <input type="number" value={budgetForm.limit} onChange={e => setBudgetForm({ ...budgetForm, limit: e.target.value })} className={inputClass} placeholder="0" min="0" />
                                </div>
                            </div>
                            <div className="flex gap-3 mt-4">
                                <button onClick={handleSetBudgetLimit} className={btnPrimary}>
                                    <span className="flex items-center gap-2"><Save size={16} /> Save</span>
                                </button>
                                <button onClick={() => setShowBudgetForm(false)} className="px-4 py-2 border border-gray-300 dark:border-gray-600  hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors">Cancel</button>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {EXPENSE_CATEGORIES.map(cat => {
                            const limit = getCategoryLimit(cat);
                            const spent = getCategoryTotal(cat);
                            const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
                            const isOver = limit > 0 && spent > limit;
                            const remaining = limit - spent;

                            return (
                                <div key={cat} className={`${cardClass} ${isOver ? 'ring-2 ring-red-400 dark:ring-red-600' : ''}`}>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 " style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                                            <span className="font-bold text-gray-800 dark:text-gray-100">{cat}</span>
                                        </div>
                                        {limit > 0 && (
                                            <button onClick={() => handleDeleteBudgetLimit(monthLimits.find(b => b.category === cat)?.id || 0)} className={btnDanger}><Trash2 size={14} /></button>
                                        )}
                                    </div>
                                    <div className="flex items-end justify-between mb-2">
                                        <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">₹{spent.toLocaleString('en-IN')}</p>
                                        {limit > 0 && <span className="text-sm text-gray-500 dark:text-gray-400">/ ₹{limit.toLocaleString('en-IN')}</span>}
                                    </div>
                                    {limit > 0 ? (
                                        <>
                                            <div className="w-full bg-gray-200 dark:bg-gray-600  h-3 mb-2">
                                                <div className={`h-3  transition-all duration-500 ${isOver ? 'bg-red-500' : pct > 80 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className={isOver ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-500 dark:text-gray-400'}>{pct}% used</span>
                                                <span className={remaining >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400 font-semibold'}>
                                                    {remaining >= 0 ? `₹${remaining.toLocaleString('en-IN')} left` : `₹${Math.abs(remaining).toLocaleString('en-IN')} over!`}
                                                </span>
                                            </div>
                                            {isOver && (
                                                <div className="flex items-center gap-2 mt-3 p-2 bg-red-50 dark:bg-red-900/30 ">
                                                    <AlertTriangle className="text-red-500 flex-shrink-0" size={16} />
                                                    <span className="text-sm text-red-700 dark:text-red-300">Over budget by ₹{Math.abs(remaining).toLocaleString('en-IN')}</span>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <p className="text-sm text-gray-400 dark:text-gray-500 italic">No limit set</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ========== GOALS TAB ========== */}
            {activeSubTab === 'goals' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Savings Goals</h3>
                        <button onClick={() => { resetGoalForm(); setShowGoalForm(true); }} className={btnPrimary}>
                            <span className="flex items-center gap-2"><Plus size={16} /> Add Goal</span>
                        </button>
                    </div>

                    {showGoalForm && (
                        <div className={cardClass}>
                            <h4 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">{editingGoalId ? 'Edit Goal' : 'New Goal'}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Goal Title</label>
                                    <input type="text" value={goalForm.title} onChange={e => setGoalForm({ ...goalForm, title: e.target.value })} className={inputClass} placeholder="e.g., Emergency Fund" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Amount (₹)</label>
                                    <input type="number" value={goalForm.targetAmount} onChange={e => setGoalForm({ ...goalForm, targetAmount: e.target.value })} className={inputClass} placeholder="0" min="0" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Saved So Far (₹)</label>
                                    <input type="number" value={goalForm.currentAmount} onChange={e => setGoalForm({ ...goalForm, currentAmount: e.target.value })} className={inputClass} placeholder="0" min="0" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Date</label>
                                    <input type="date" value={goalForm.targetDate} onChange={e => setGoalForm({ ...goalForm, targetDate: e.target.value })} className={inputClass} />
                                </div>
                            </div>
                            <div className="flex gap-3 mt-4">
                                <button onClick={editingGoalId ? handleUpdateGoal : handleAddGoal} className={btnPrimary}>
                                    <span className="flex items-center gap-2"><Save size={16} /> {editingGoalId ? 'Update' : 'Save'}</span>
                                </button>
                                <button onClick={resetGoalForm} className="px-4 py-2 border border-gray-300 dark:border-gray-600  hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors">Cancel</button>
                            </div>
                        </div>
                    )}

                    {savingsGoals.length === 0 ? (
                        <div className={`${cardClass} text-center py-12`}>
                            <PiggyBank className="mx-auto text-gray-300 dark:text-gray-600 mb-3" size={48} />
                            <p className="text-gray-500 dark:text-gray-400">No savings goals yet. Start saving!</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {savingsGoals.map(goal => {
                                const pct = Math.min(Math.round((goal.currentAmount / goal.targetAmount) * 100), 100);
                                const daysLeft = Math.max(0, Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                                return (
                                    <div key={goal.id} className={cardClass}>
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="font-bold text-gray-800 dark:text-gray-100">{goal.title}</h4>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => { setEditingGoalId(goal.id); setGoalForm({ title: goal.title, targetAmount: String(goal.targetAmount), currentAmount: String(goal.currentAmount), targetDate: goal.targetDate }); setShowGoalForm(true); }} className="p-2 text-gray-400 hover:text-indigo-500 transition-colors"><Edit2 size={16} /></button>
                                                <button onClick={() => handleDeleteGoal(goal.id)} className={btnDanger}><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                        <div className="flex items-end justify-between mb-3">
                                            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">₹{goal.currentAmount.toLocaleString('en-IN')}</p>
                                            <span className="text-sm text-gray-500 dark:text-gray-400">/ ₹{goal.targetAmount.toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 dark:bg-gray-600  h-4 mb-2">
                                            <div className={`h-4  transition-all duration-700 ${pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-indigo-500' : 'bg-yellow-500'}`} style={{ width: `${pct}%` }}>
                                                <span className="text-xs text-white font-medium pl-2">{pct}%</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500 dark:text-gray-400">{pct >= 100 ? <span className="text-green-500 font-semibold flex items-center gap-1"><CheckCircle size={14} /> Achieved!</span> : `${daysLeft} days left`}</span>
                                            <span className="text-gray-500 dark:text-gray-400">₹{(goal.targetAmount - goal.currentAmount).toLocaleString('en-IN')} remaining</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ========== ANALYTICS TAB ========== */}
            {activeSubTab === 'analytics' && (
                <div className="space-y-6">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Analytics</h3>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Pie Chart — Category Breakdown */}
                        <div className={cardClass}>
                            <h4 className="font-bold text-gray-800 dark:text-gray-100 mb-4">Expense Breakdown — {getMonthLabel(selectedMonth)}</h4>
                            {pieData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" label={({ name, percent }: any) => `${name || ''} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                                            {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip formatter={(value: any) => `₹${Number(value ?? 0).toLocaleString('en-IN')}`} contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#fff', border: 'none', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-[300px] flex items-center justify-center text-gray-400 dark:text-gray-500">No expense data for this month</div>
                            )}
                        </div>

                        {/* Bar Chart — Monthly Comparison */}
                        <div className={cardClass}>
                            <h4 className="font-bold text-gray-800 dark:text-gray-100 mb-4">Monthly Comparison (Last 6 Months)</h4>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={getBarData()}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
                                    <XAxis dataKey="month" tick={{ fill: theme === 'dark' ? '#9ca3af' : '#6b7280' }} />
                                    <YAxis tick={{ fill: theme === 'dark' ? '#9ca3af' : '#6b7280' }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                                    <Tooltip formatter={(value: any) => `₹${Number(value ?? 0).toLocaleString('en-IN')}`} contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#fff', border: 'none', borderRadius: '8px' }} />
                                    <Legend />
                                    <Bar dataKey="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Line Chart — Trends */}
                    <div className={cardClass}>
                        <h4 className="font-bold text-gray-800 dark:text-gray-100 mb-4">Income vs Expense Trend</h4>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={getLineData()}>
                                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
                                <XAxis dataKey="month" tick={{ fill: theme === 'dark' ? '#9ca3af' : '#6b7280' }} />
                                <YAxis tick={{ fill: theme === 'dark' ? '#9ca3af' : '#6b7280' }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                                <Tooltip formatter={(value: any) => `₹${Number(value ?? 0).toLocaleString('en-IN')}`} contentStyle={{ backgroundColor: theme === 'dark' ? '#1f2937' : '#fff', border: 'none', borderRadius: '8px' }} />
                                <Legend />
                                <Line type="monotone" dataKey="Income" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                                <Line type="monotone" dataKey="Expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                                <Line type="monotone" dataKey="Savings" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} strokeDasharray="5 5" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* ========== INSIGHTS TAB ========== */}
            {activeSubTab === 'insights' && (
                <div className="space-y-4">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Smart Insights</h3>
                    <div className="space-y-3">
                        {generateInsights().map((insight, i) => (
                            <div key={i} className={`${cardClass} flex items-start gap-3`}>
                                <Lightbulb className="text-yellow-500 flex-shrink-0 mt-0.5" size={20} />
                                <p className="text-gray-700 dark:text-gray-200">{insight}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default BudgetPlanner;
