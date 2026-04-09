import { useState, useEffect, useCallback } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Plus, Trash2, Edit2, X } from 'lucide-react';
import api from '../services/api';

// --- Types ---

interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
}

interface Category {
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE';
}

interface Transaction {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  category: string;
  description: string;
  amount: number;
  date: string;
  paymentMethod: string;
  status: string;
  notes: string | null;
  customerId: string | null;
  customer?: { id: string; name: string } | null;
  createdAt: string;
}

type ActiveTab = 'dashboard' | 'transactions' | 'categories';

const paymentMethodLabels: Record<string, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  CARTAO_CREDITO: 'Cartão Crédito',
  CARTAO_DEBITO: 'Cartão Débito',
  CONVENIO: 'Convênio',
  TRANSFERENCIA: 'Transferência',
};

const statusMap: Record<string, { label: string; cls: string }> = {
  PAGO: { label: 'Pago', cls: 'bg-green-100 text-green-700' },
  PENDENTE: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-700' },
  CANCELADO: { label: 'Cancelado', cls: 'bg-slate-100 text-slate-500' },
};

const typeMap: Record<string, { label: string; cls: string }> = {
  INCOME: { label: 'Receita', cls: 'bg-green-100 text-green-700' },
  EXPENSE: { label: 'Despesa', cls: 'bg-red-100 text-red-700' },
};

const months = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const emptyTxForm = {
  type: 'INCOME' as 'INCOME' | 'EXPENSE',
  category: '',
  description: '',
  amount: '',
  date: new Date().toISOString().split('T')[0],
  paymentMethod: 'PIX',
  status: 'PENDENTE',
  notes: '',
  customerId: '',
};

export function FinancialPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  // --- Dashboard state ---
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [summary, setSummary] = useState<FinancialSummary>({ totalIncome: 0, totalExpenses: 0, netProfit: 0 });
  const [loadingSummary, setLoadingSummary] = useState(true);

  // --- Transactions state ---
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [txModal, setTxModal] = useState<'closed' | 'create' | 'edit'>('closed');
  const [txForm, setTxForm] = useState(emptyTxForm);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [savingTx, setSavingTx] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // --- Categories state ---
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCat, setLoadingCat] = useState(true);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<'INCOME' | 'EXPENSE'>('INCOME');
  const [savingCat, setSavingCat] = useState(false);

  // --- Fetchers ---

  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const { data } = await api.get('/financial/summary', { params: { month, year } });
      const payload = data?.data || data || {};
      setSummary({
        totalIncome: Number(payload.totalIncome) || 0,
        totalExpenses: Number(payload.totalExpenses ?? payload.totalExpense) || 0,
        netProfit: Number(payload.netProfit) || 0,
      });
    } catch {
      setSummary({ totalIncome: 0, totalExpenses: 0, netProfit: 0 });
    } finally {
      setLoadingSummary(false);
    }
  }, [month, year]);

  const fetchTransactions = useCallback(async () => {
    setLoadingTx(true);
    try {
      const params: Record<string, string> = {};
      if (filterType) params.type = filterType;
      if (filterStatus) params.status = filterStatus;
      if (filterStartDate) params.startDate = filterStartDate;
      if (filterEndDate) params.endDate = filterEndDate;
      const { data } = await api.get('/financial/transactions', { params });
      setTransactions(data.data || data);
    } catch {
      setTransactions([]);
    } finally {
      setLoadingTx(false);
    }
  }, [filterType, filterStatus, filterStartDate, filterEndDate]);

  const fetchCategories = useCallback(async () => {
    setLoadingCat(true);
    try {
      const { data } = await api.get('/financial/categories');
      setCategories(data.data || data);
    } catch {
      setCategories([]);
    } finally {
      setLoadingCat(false);
    }
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);
  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  // --- Handlers ---

  const handleSaveTx = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTx(true);
    try {
      const payload = {
        type: txForm.type,
        category: txForm.category || 'Outros',
        description: txForm.description,
        amount: parseFloat(txForm.amount) || 0,
        date: txForm.date,
        paymentMethod: txForm.paymentMethod,
        status: txForm.status,
        notes: txForm.notes || undefined,
        customerId: txForm.customerId || undefined,
      };
      if (txModal === 'edit' && editingTxId) {
        await api.put(`/financial/transactions/${editingTxId}`, payload);
      } else {
        await api.post('/financial/transactions', payload);
      }
      setTxModal('closed');
      setTxForm(emptyTxForm);
      setEditingTxId(null);
      fetchTransactions();
      fetchSummary();
    } catch {} finally {
      setSavingTx(false);
    }
  };

  const handleDeleteTx = async (id: string) => {
    try {
      await api.delete(`/financial/transactions/${id}`);
      setDeleteConfirm(null);
      fetchTransactions();
      fetchSummary();
    } catch {}
  };

  const openEditTx = (tx: Transaction) => {
    setTxForm({
      type: tx.type,
      category: tx.category || '',
      description: tx.description,
      amount: String(tx.amount),
      date: tx.date ? tx.date.split('T')[0] : '',
      paymentMethod: tx.paymentMethod,
      status: tx.status,
      notes: tx.notes || '',
      customerId: tx.customerId || '',
    });
    setEditingTxId(tx.id);
    setTxModal('edit');
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setSavingCat(true);
    try {
      await api.post('/financial/categories', { name: newCatName.trim(), type: newCatType });
      setNewCatName('');
      fetchCategories();
    } catch {} finally {
      setSavingCat(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await api.delete(`/financial/categories/${id}`);
      fetchCategories();
    } catch {}
  };

  // --- Chart helpers ---
  const maxChart = Math.max(summary.totalIncome, summary.totalExpenses, 1);

  // --- Year options ---
  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  // Categories filtered by type for transaction form
  const formCategories = categories.filter(c => c.type === txForm.type);

  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'transactions', label: 'Lançamentos' },
    { key: 'categories', label: 'Categorias' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Financeiro</h1>
          <p className="text-sm text-slate-500 mt-1">Controle de receitas, despesas e categorias</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-4">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-[#2563EB] text-[#1E3A5F]'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ==================== TAB: DASHBOARD ==================== */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Month/Year selector */}
          <div className="flex items-center gap-3">
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            >
              {months.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Summary Cards */}
          {loadingSummary ? (
            <div className="text-sm text-slate-400">Carregando...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Total Receitas */}
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Total Receitas</p>
                    <p className="text-xl font-bold text-green-600">{formatBRL(summary.totalIncome)}</p>
                  </div>
                </div>
              </div>

              {/* Total Despesas */}
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Total Despesas</p>
                    <p className="text-xl font-bold text-red-600">{formatBRL(summary.totalExpenses)}</p>
                  </div>
                </div>
              </div>

              {/* Lucro Liquido */}
              <div className="bg-white rounded-lg border border-slate-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Lucro Líquido</p>
                    <p className={`text-xl font-bold ${summary.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {formatBRL(summary.netProfit)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Simple Bar Chart */}
          {!loadingSummary && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Receitas vs Despesas</h3>
              <div className="flex items-end gap-8 justify-center h-48">
                {/* Income bar */}
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">{formatBRL(summary.totalIncome)}</span>
                  <div
                    className="w-20 bg-green-400 rounded-t-lg transition-all duration-500"
                    style={{ height: `${(summary.totalIncome / maxChart) * 160}px`, minHeight: '4px' }}
                  />
                  <span className="text-xs text-slate-500">Receitas</span>
                </div>
                {/* Expense bar */}
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs font-medium text-slate-600">{formatBRL(summary.totalExpenses)}</span>
                  <div
                    className="w-20 bg-red-400 rounded-t-lg transition-all duration-500"
                    style={{ height: `${(summary.totalExpenses / maxChart) * 160}px`, minHeight: '4px' }}
                  />
                  <span className="text-xs text-slate-500">Despesas</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB: LANCAMENTOS ==================== */}
      {activeTab === 'transactions' && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              >
                <option value="">Todos os tipos</option>
                <option value="INCOME">Receita</option>
                <option value="EXPENSE">Despesa</option>
              </select>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              >
                <option value="">Todos os status</option>
                <option value="PAGO">Pago</option>
                <option value="PENDENTE">Pendente</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
              <input
                type="date"
                value={filterStartDate}
                onChange={e => setFilterStartDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                placeholder="Data início"
              />
              <input
                type="date"
                value={filterEndDate}
                onChange={e => setFilterEndDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                placeholder="Data fim"
              />
              <div className="ml-auto">
                <button
                  onClick={() => { setTxForm(emptyTxForm); setEditingTxId(null); setTxModal('create'); }}
                  className="flex items-center gap-2 bg-[#1E3A5F] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2A4D7A] transition-colors"
                >
                  <Plus className="w-4 h-4" /> Novo Lançamento
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {loadingTx ? (
              <div className="p-6 text-sm text-slate-400">Carregando...</div>
            ) : transactions.length === 0 ? (
              <div className="p-6 text-sm text-slate-400 text-center">Nenhum lançamento encontrado</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Data</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Tipo</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Categoria</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Descrição</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600">Valor</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Método</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                      <th className="text-right px-4 py-3 font-medium text-slate-600">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.map(tx => {
                      const tInfo = typeMap[tx.type] || { label: tx.type, cls: 'bg-slate-100 text-slate-600' };
                      const sInfo = statusMap[tx.status] || { label: tx.status, cls: 'bg-slate-100 text-slate-600' };
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-700">
                            {tx.date ? new Date(tx.date).toLocaleDateString('pt-BR') : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tInfo.cls}`}>{tInfo.label}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{tx.category || '-'}</td>
                          <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate">{tx.description}</td>
                          <td className={`px-4 py-3 text-right font-medium ${tx.type === 'INCOME' ? 'text-green-600' : 'text-red-600'}`}>
                            {formatBRL(tx.amount)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{paymentMethodLabels[tx.paymentMethod] || tx.paymentMethod}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sInfo.cls}`}>{sInfo.label}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openEditTx(tx)}
                                className="p-1.5 text-slate-400 hover:text-[#1E3A5F] transition-colors"
                                title="Editar"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              {deleteConfirm === tx.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleDeleteTx(tx.id)}
                                    className="text-xs text-red-600 font-medium hover:underline"
                                  >
                                    Confirmar
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="text-xs text-slate-400 hover:underline"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirm(tx.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== TAB: CATEGORIAS ==================== */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          {/* New category form */}
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <form onSubmit={handleAddCategory} className="flex items-center gap-3">
              <input
                type="text"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="Nome da categoria"
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                required
              />
              <select
                value={newCatType}
                onChange={e => setNewCatType(e.target.value as 'INCOME' | 'EXPENSE')}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              >
                <option value="INCOME">Receita</option>
                <option value="EXPENSE">Despesa</option>
              </select>
              <button
                type="submit"
                disabled={savingCat}
                className="flex items-center gap-2 bg-[#1E3A5F] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2A4D7A] transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> {savingCat ? 'Salvando...' : 'Adicionar'}
              </button>
            </form>
          </div>

          {/* Categories list */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {loadingCat ? (
              <div className="p-6 text-sm text-slate-400">Carregando...</div>
            ) : categories.length === 0 ? (
              <div className="p-6 text-sm text-slate-400 text-center">Nenhuma categoria cadastrada</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {categories.map(cat => {
                  const cInfo = typeMap[cat.type] || { label: cat.type, cls: 'bg-slate-100 text-slate-600' };
                  return (
                    <div key={cat.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-700 font-medium">{cat.name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cInfo.cls}`}>{cInfo.label}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== MODAL: TRANSACTION ==================== */}
      {txModal !== 'closed' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">
                {txModal === 'edit' ? 'Editar Lançamento' : 'Novo Lançamento'}
              </h2>
              <button
                onClick={() => { setTxModal('closed'); setTxForm(emptyTxForm); setEditingTxId(null); }}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveTx} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
                  <select
                    value={txForm.type}
                    onChange={e => setTxForm({ ...txForm, type: e.target.value as 'INCOME' | 'EXPENSE', category: '' })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    <option value="INCOME">Receita</option>
                    <option value="EXPENSE">Despesa</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Categoria</label>
                  <select
                    value={txForm.category}
                    onChange={e => setTxForm({ ...txForm, category: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    <option value="">Sem categoria</option>
                    {formCategories.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Descrição</label>
                <input
                  type="text"
                  value={txForm.description}
                  onChange={e => setTxForm({ ...txForm, description: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={txForm.amount}
                    onChange={e => setTxForm({ ...txForm, amount: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Data</label>
                  <input
                    type="date"
                    value={txForm.date}
                    onChange={e => setTxForm({ ...txForm, date: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Método de Pagamento</label>
                  <select
                    value={txForm.paymentMethod}
                    onChange={e => setTxForm({ ...txForm, paymentMethod: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    {Object.entries(paymentMethodLabels).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                  <select
                    value={txForm.status}
                    onChange={e => setTxForm({ ...txForm, status: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    <option value="PENDENTE">Pendente</option>
                    <option value="PAGO">Pago</option>
                    <option value="CANCELADO">Cancelado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Observações</label>
                <textarea
                  value={txForm.notes}
                  onChange={e => setTxForm({ ...txForm, notes: e.target.value })}
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ID do Cliente (opcional)</label>
                <input
                  type="text"
                  value={txForm.customerId}
                  onChange={e => setTxForm({ ...txForm, customerId: e.target.value })}
                  placeholder="ID do cliente vinculado"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setTxModal('closed'); setTxForm(emptyTxForm); setEditingTxId(null); }}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingTx}
                  className="bg-[#1E3A5F] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2A4D7A] transition-colors disabled:opacity-50"
                >
                  {savingTx ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
