import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Building2, BarChart3, LogOut, CreditCard, Plus, X, Eye, ToggleLeft, ToggleRight, UserPlus, Users, Zap, FileSearch, UserCog, Settings as SettingsIcon, Calendar } from 'lucide-react';
import clsx from 'clsx';
import api from './services/api';
import CrmPage from './pages/CrmPage';
import LeadDetailPage from './pages/LeadDetailPage';
import AutomationPage from './pages/AutomationPage';
import CrmReportsPage from './pages/CrmReportsPage';
import AuditLogPage from './pages/AuditLogPage';
import AdminUsersPage from './pages/AdminUsersPage';
import SettingsPage from './pages/SettingsPage';
import LembretesPage from './pages/LembretesPage';

// ============ AUTH ============

function useAdminAuth() {
  const [user, setUser] = useState<any>(() => {
    const stored = sessionStorage.getItem('adminUser');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isAuthenticated = !!sessionStorage.getItem('adminToken');

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'GERENTE', 'VENDEDOR'];
      if (!allowedRoles.includes(data.data.user.role)) {
        throw new Error('Acesso restrito a administradores');
      }
      sessionStorage.setItem('adminToken', data.data.accessToken);
      sessionStorage.setItem('adminUser', JSON.stringify(data.data.user));
      setUser(data.data.user);
      return data.data.user;
    } catch (err: any) {
      const msg = err.message === 'Acesso restrito a administradores'
        ? err.message
        : err.response?.data?.error?.message || 'Erro ao fazer login';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('adminUser');
    setUser(null);
  };

  return { user, loading, error, isAuthenticated, login, logout };
}

// ============ LOGIN PAGE ============

function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error, isAuthenticated } = useAdminAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) navigate('/overview');
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/overview');
    } catch {}
  };

  return (
    <div className="min-h-screen bg-[#152C49] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/anpexia-logo-white.svg" alt="Anpexia" className="h-10 mx-auto mb-3" />
          <span className="text-xs bg-[#2563EB] text-white px-2 py-0.5 rounded mt-2 inline-block">Admin</span>
          <p className="text-white/60 mt-3">Painel administrativo</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-[#1E3A5F] rounded-xl border border-white/10 p-6 space-y-4">
          {error && (
            <div className="bg-red-900/50 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-lg">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB] placeholder-white/40" placeholder="admin@anpexia.com.br" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Senha</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB] placeholder-white/40" required />
          </div>
          <button type="submit" disabled={loading} className="w-full btn-pill justify-center" style={{ backgroundColor: '#2563EB', color: '#fff', borderRadius: 999 }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ============ OVERVIEW ============

function OverviewPage() {
  const [stats, setStats] = useState({ total: 0, active: 0, mrr: 'R$ 0', users: 0 });

  useEffect(() => {
    api.get('/tenants?limit=100').then(({ data }) => {
      const tenants = data.data;
      const active = tenants.filter((t: any) => t.isActive).length;
      const planPrices: Record<string, number> = { STARTER: 1200, PRO: 2000, BUSINESS: 3000 };
      const mrr = tenants.filter((t: any) => t.isActive).reduce((sum: number, t: any) => sum + (planPrices[t.plan] || 0), 0);
      const users = tenants.reduce((sum: number, t: any) => sum + (t._count?.users || 0), 0);
      setStats({
        total: tenants.length,
        active,
        mrr: `R$ ${mrr.toLocaleString('pt-BR')}`,
        users,
      });
    }).catch(() => {});
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-8">Visao geral</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total de empresas', value: stats.total },
          { label: 'Empresas ativas', value: stats.active },
          { label: 'MRR', value: stats.mrr },
          { label: 'Total de usuarios', value: stats.users },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-6">
            <p className="text-sm text-gray-600">{s.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ TENANTS PAGE ============

function TenantsPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showUserForm, setShowUserForm] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ name: '', segment: 'OUTROS' as string, phone: '', email: '', plan: 'STARTER' as string });
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'OWNER' as string });

  const fetchTenants = useCallback(async () => {
    try {
      const { data } = await api.get('/tenants?limit=100');
      setTenants(data.data);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/tenants', formData);
      setShowForm(false);
      setFormData({ name: '', segment: 'OUTROS', phone: '', email: '', plan: 'STARTER' });
      fetchTenants();
    } catch {} finally {
      setSaving(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/auth/register', { ...userForm, tenantId: showUserForm });
      setShowUserForm(null);
      setUserForm({ name: '', email: '', password: '', role: 'OWNER' });
      fetchTenants();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erro ao criar usuario');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await api.patch(`/tenants/${id}/toggle`);
      fetchTenants();
    } catch {}
  };

  const viewDetail = async (id: string) => {
    try {
      const { data } = await api.get(`/tenants/${id}`);
      setShowDetail(data.data);
    } catch {}
  };

  const planLabel: Record<string, string> = { STARTER: 'Starter', PRO: 'Pro', BUSINESS: 'Business' };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Empresas</h2>
          <p className="text-gray-600 mt-1">Gerencie todas as empresas clientes</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-pill btn-primary">
          <Plus size={18} />
          Nova empresa
        </button>
      </div>

      {/* Modal Nova Empresa */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Nova empresa</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da empresa *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Segmento</label>
                <select value={formData.segment} onChange={(e) => setFormData({ ...formData, segment: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="OUTROS">Outros</option>
                  <option value="CLINICA_OFTALMOLOGICA">Clínica Oftalmológica</option>
                  <option value="CLINICA_GERAL">Clínica Geral</option>
                  <option value="SALAO_BELEZA">Salão de Beleza</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                  <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plano</label>
                <select value={formData.plan} onChange={(e) => setFormData({ ...formData, plan: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="STARTER">Starter — R$1.200/mes</option>
                  <option value="PRO">Pro — R$2.000/mes</option>
                  <option value="BUSINESS">Business — R$3.000/mes</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 btn-pill btn-secondary justify-center">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 btn-pill btn-primary justify-center">{saving ? 'Criando...' : 'Criar empresa'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Novo Usuario */}
      {showUserForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Criar usuario para empresa</h3>
              <button onClick={() => setShowUserForm(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input type="text" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
                <input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
                <input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required minLength={6} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Papel</label>
                <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="OWNER">Dono</option>
                  <option value="MANAGER">Gerente</option>
                  <option value="EMPLOYEE">Funcionario</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowUserForm(null)} className="flex-1 btn-pill btn-secondary justify-center">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 btn-pill btn-primary justify-center">{saving ? 'Criando...' : 'Criar usuario'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalhes */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">{showDetail.name}</h3>
              <button onClick={() => setShowDetail(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-500">Segmento:</span> <select value={showDetail.segment || 'OUTROS'} onChange={async (e) => { try { await api.put(`/tenants/${showDetail.id}`, { segment: e.target.value }); setShowDetail({ ...showDetail, segment: e.target.value }); } catch {} }} className="ml-1 text-sm border border-gray-300 rounded px-1 py-0.5"><option value="OUTROS">Outros</option><option value="CLINICA_OFTALMOLOGICA">Oftalmológica</option><option value="CLINICA_GERAL">Clínica Geral</option><option value="SALAO_BELEZA">Salão de Beleza</option></select></div>
                <div><span className="text-gray-500">Plano:</span> <span className="ml-1">{planLabel[showDetail.plan]}</span></div>
                <div><span className="text-gray-500">Telefone:</span> <span className="ml-1">{showDetail.phone || '-'}</span></div>
                <div><span className="text-gray-500">E-mail:</span> <span className="ml-1">{showDetail.email || '-'}</span></div>
                <div><span className="text-gray-500">Status:</span> <span className={`ml-1 ${showDetail.isActive ? 'text-green-600' : 'text-red-600'}`}>{showDetail.isActive ? 'Ativo' : 'Inativo'}</span></div>
                <div><span className="text-gray-500">Slug:</span> <span className="ml-1 font-mono text-xs">{showDetail.slug}</span></div>
              </div>

              <div>
                <h4 className="font-medium text-gray-800 mb-2">Usuarios ({showDetail.users?.length || 0})</h4>
                {showDetail.users?.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum usuario. Crie um para o cliente poder acessar.</p>
                ) : (
                  <div className="space-y-2">
                    {showDetail.users?.map((u: any) => (
                      <div key={u.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                        <span>{u.name} ({u.email})</span>
                        <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">{u.role}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-medium text-gray-800 mb-2">Modulos ativos</h4>
                <div className="flex flex-wrap gap-2">
                  {showDetail.modules?.filter((m: any) => m.isActive).map((m: any) => (
                    <span key={m.module} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{m.module}</span>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-800 mb-2">Estatisticas</h4>
                <div className="grid grid-cols-3 gap-3 text-sm text-center">
                  <div className="p-3 bg-gray-50 rounded"><span className="block text-lg font-bold">{showDetail._count?.customers || 0}</span>Clientes</div>
                  <div className="p-3 bg-gray-50 rounded"><span className="block text-lg font-bold">{showDetail._count?.products || 0}</span>Produtos</div>
                  <div className="p-3 bg-gray-50 rounded"><span className="block text-lg font-bold">{showDetail._count?.messagesSent || 0}</span>Mensagens</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Empresa</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Segmento</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Plano</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Usuarios</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Clientes</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">Carregando...</td></tr>
            ) : tenants.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">Nenhuma empresa cadastrada ainda.</td></tr>
            ) : (
              tenants.map((t) => (
                <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{t.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{t.segment || '-'}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      t.plan === 'BUSINESS' ? 'bg-purple-100 text-purple-700' :
                      t.plan === 'PRO' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>{planLabel[t.plan]}</span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${t.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {t.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{t._count?.users || 0}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{t._count?.customers || 0}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => viewDetail(t.id)} className="text-gray-400 hover:text-gray-600" title="Ver detalhes"><Eye size={16} /></button>
                      <button onClick={() => setShowUserForm(t.id)} className="text-blue-400 hover:text-blue-600" title="Criar usuario"><UserPlus size={16} /></button>
                      <button onClick={() => handleToggle(t.id)} className="text-gray-400 hover:text-gray-600" title={t.isActive ? 'Desativar' : 'Ativar'}>
                        {t.isActive ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ BILLING ============

function BillingPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-8">Financeiro</h2>
      <p className="text-gray-600">Controle de pagamentos e assinaturas dos clientes.</p>
    </div>
  );
}

// ============ LAYOUT ============

const navItems: Array<{
  to: string;
  label: string;
  icon: any;
  matchPaths?: string[];
  children?: Array<{ to: string; label: string }>;
}> = [
  { to: '/overview', label: 'Visao geral', icon: BarChart3 },
  { to: '/empresas', label: 'Empresas', icon: Building2 },
  {
    to: '/crm',
    label: 'Leads / CRM',
    icon: Users,
    matchPaths: ['/crm', '/crm/automacoes', '/crm/relatorios', '/leads'],
    children: [
      { to: '/crm/automacoes', label: 'Automação' },
      { to: '/crm/relatorios', label: 'Relatórios' },
    ],
  },
  { to: '/financeiro', label: 'Financeiro', icon: CreditCard },
  { to: '/audit-log', label: 'Audit Log', icon: FileSearch },
  { to: '/lembretes', label: 'Lembretes', icon: Calendar },
  { to: '/usuarios', label: 'Usuários', icon: UserCog },
  { to: '/configuracoes', label: 'Configurações', icon: SettingsIcon },
];

function AdminLayout() {
  const { logout } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-[#1E3A5F] text-white flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-white/10">
          <img src="/anpexia-logo-white.svg" alt="Anpexia" className="h-7" />
          <span className="ml-3 text-xs bg-[#2563EB] px-2 py-0.5 rounded">Admin</span>
        </div>
        <nav className="flex-1 py-4 px-3">
          {navItems.map((item) => {
            const isParentActive = item.matchPaths
              ? item.matchPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))
              : pathname === item.to || pathname.startsWith(item.to + '/');
            return (
              <div key={item.to}>
                <NavLink
                  to={item.to}
                  end={!item.matchPaths}
                  className={() =>
                    clsx(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-1',
                      isParentActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
                    )
                  }
                >
                  <item.icon size={20} />
                  {item.label}
                </NavLink>
                {item.children && isParentActive && (
                  <div className="ml-9 mb-1 flex flex-col gap-0.5">
                    {item.children.map((child) => {
                      const childActive = pathname === child.to || pathname.startsWith(child.to + '/');
                      return (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className={clsx(
                            'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                            childActive ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white',
                          )}
                        >
                          {child.label}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10">
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors w-full">
            <LogOut size={20} />
            Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-[#F8FAFC]">
        <div className="max-w-7xl mx-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

// ============ APP ============

function ProtectedAdmin({ children }: { children: React.ReactNode }) {
  const token = sessionStorage.getItem('adminToken');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AdminLoginPage />} />
      <Route path="/" element={<ProtectedAdmin><AdminLayout /></ProtectedAdmin>}>
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="empresas" element={<TenantsPage />} />
        <Route path="crm" element={<CrmPage />} />
        <Route path="crm/automacoes" element={<AutomationPage />} />
        <Route path="crm/relatorios" element={<CrmReportsPage />} />
        <Route path="crm/:id" element={<LeadDetailPage />} />
        <Route path="leads" element={<Navigate to="/crm" replace />} />
        <Route path="leads/:id" element={<LeadDetailPage />} />
        <Route path="automacao" element={<Navigate to="/crm/automacoes" replace />} />
        <Route path="financeiro" element={<BillingPage />} />
        <Route path="audit-log" element={<AuditLogPage />} />
        <Route path="lembretes" element={<LembretesPage />} />
        <Route path="usuarios" element={<AdminUsersPage />} />
        <Route path="configuracoes" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
