import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Package, MessageSquare, AlertTriangle, UserPlus, Clock, ArrowRight, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format } from 'date-fns';
import api from '../services/api';

interface TodayAppointment {
  id: string;
  name: string;
  phone: string;
  date: string;
  status: string;
  customer: { id: string; name: string; phone: string } | null;
}

interface DashboardData {
  customers: { total: number; newThisWeek: number; newThisMonth: number };
  inventory: { totalProducts: number; lowStock: number; expiringSoon: number };
  messages: { sentToday: number; sentThisWeek: number };
  scheduling: { todayAppointments: TodayAppointment[]; totalThisMonth: number };
}

interface AlertProduct {
  id: string;
  name: string;
  quantity: number;
  min_quantity: number;
  expires_at: string | null;
  supplier: string | null;
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  accent?: boolean;
  alert?: boolean;
  onClick?: () => void;
}

const cardAccentColors: Record<string, string> = {
  blue: 'border-t-blue-500',
  green: 'border-t-emerald-500',
  purple: 'border-t-violet-500',
  orange: 'border-t-orange-500',
  red: 'border-t-red-500',
};

function StatCard({ title, value, subtitle, icon: Icon, accent, alert, onClick, color }: StatCardProps & { color?: string }) {
  const topColor = color ? cardAccentColors[color] || '' : '';
  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 shadow-sm p-6 transition-all ${topColor ? 'border-t-2 ' + topColor : ''} ${onClick ? 'cursor-pointer hover:shadow-md' : ''} ${alert ? 'border-t-2 border-t-red-500' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${alert ? 'text-red-600' : accent ? 'text-indigo-600' : 'text-slate-800'}`}>{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-2.5 rounded-lg ${alert ? 'bg-red-50' : 'bg-slate-50'}`}>
          <Icon size={20} className={alert ? 'text-red-500' : 'text-slate-500'} />
        </div>
      </div>
      {onClick && (
        <div className="flex items-center gap-1 mt-3 text-xs text-indigo-600 font-medium">
          Ver detalhes <ArrowRight size={12} />
        </div>
      )}
    </div>
  );
}

const apptStatusMap: Record<string, { label: string; cls: string; icon: string }> = {
  scheduled: { label: 'Agendado', cls: 'bg-blue-100 text-blue-700', icon: '🔵' },
  confirmed: { label: 'Confirmado', cls: 'bg-green-100 text-green-700', icon: '✅' },
  completed: { label: 'Concluido', cls: 'bg-slate-100 text-slate-600', icon: '✅' },
  cancelled: { label: 'Cancelado', cls: 'bg-red-100 text-red-700', icon: '❌' },
  no_show: { label: 'Faltou', cls: 'bg-amber-100 text-amber-700', icon: '👻' },
};

export function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lowStockProducts, setLowStockProducts] = useState<AlertProduct[]>([]);
  const [expiringProducts, setExpiringProducts] = useState<AlertProduct[]>([]);

  useEffect(() => {
    Promise.all([
      api.get('/dashboard').catch(() => ({ data: { data: null } })),
      api.get('/inventory/alerts/low-stock').catch(() => ({ data: { data: [] } })),
      api.get('/inventory/alerts/expiring').catch(() => ({ data: { data: [] } })),
    ]).then(([dash, low, exp]) => {
      setData(dash.data.data);
      setLowStockProducts(low.data.data);
      setExpiringProducts(exp.data.data);
    }).finally(() => setLoading(false));
  }, []);

  const d = data || {
    customers: { total: 0, newThisWeek: 0, newThisMonth: 0 },
    inventory: { totalProducts: 0, lowStock: 0, expiringSoon: 0 },
    messages: { sentToday: 0, sentThisWeek: 0 },
    scheduling: { todayAppointments: [], totalThisMonth: 0 },
  };

  const overviewChartData = [
    { name: 'Clientes', value: d.customers.total, color: '#4F46E5' },
    { name: 'Produtos', value: d.inventory.totalProducts, color: '#10B981' },
    { name: 'Msg hoje', value: d.messages.sentToday, color: '#8B5CF6' },
    { name: 'Msg semana', value: d.messages.sentThisWeek, color: '#93C5FD' },
  ];

  const alertChartData = [
    { name: 'Estoque baixo', value: d.inventory.lowStock, color: '#f59e0b' },
    { name: 'Vencendo', value: d.inventory.expiringSoon, color: '#ef4444' },
    { name: 'Normal', value: Math.max(0, d.inventory.totalProducts - d.inventory.lowStock - d.inventory.expiringSoon), color: '#40c057' },
  ].filter(i => i.value > 0);

  const totalAlerts = d.inventory.lowStock + d.inventory.expiringSoon;
  const todayAppts = d.scheduling?.todayAppointments || [];

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
        <p className="text-slate-500 mt-1">Visao geral do seu negocio</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <StatCard
              title="Total de clientes"
              value={d.customers.total}
              subtitle={`${d.customers.newThisWeek} novos esta semana`}
              icon={Users}
              color="blue"
              onClick={() => navigate('/clientes')}
            />
            <StatCard
              title="Produtos em estoque"
              value={d.inventory.totalProducts}
              icon={Package}
              color="green"
              onClick={() => navigate('/estoque')}
            />
            <StatCard
              title="Mensagens hoje"
              value={d.messages.sentToday}
              subtitle={`${d.messages.sentThisWeek} esta semana`}
              icon={MessageSquare}
              accent
              color="purple"
              onClick={() => navigate('/mensagens')}
            />
            <StatCard
              title="Consultas hoje"
              value={todayAppts.length}
              subtitle={`${d.scheduling?.totalThisMonth || 0} este mes`}
              icon={Calendar}
              accent
              color="blue"
              onClick={() => navigate('/agendamentos')}
            />
            <StatCard
              title="Alertas"
              value={totalAlerts}
              subtitle={`${d.inventory.lowStock} estoque baixo / ${d.inventory.expiringSoon} vencendo`}
              icon={AlertTriangle}
              alert={totalAlerts > 0}
              color="orange"
              onClick={() => navigate('/estoque?filter=alerts')}
            />
          </div>

          {/* Today's Patients Card + Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Today's Patients */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Calendar size={18} className="text-indigo-600" />
                  <h3 className="font-semibold text-slate-800">Pacientes de hoje</h3>
                </div>
                {todayAppts.length > 0 && (
                  <button onClick={() => navigate('/agendamentos')} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                    Ver agenda <ArrowRight size={12} />
                  </button>
                )}
              </div>
              {todayAppts.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">Nenhuma consulta agendada para hoje.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {todayAppts.map((a) => {
                    const st = apptStatusMap[a.status] || { label: a.status, cls: 'bg-gray-100 text-gray-600', icon: '⬜' };
                    return (
                      <div key={a.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-blue-50/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-indigo-600">{format(new Date(a.date), 'HH:mm')}</span>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{a.customer?.name || a.name}</p>
                            <p className="text-xs text-slate-500">{a.phone}</p>
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${st.cls}`}>{st.icon} {st.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Overview Bar Chart */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-semibold text-slate-800 mb-4">Visao geral</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overviewChartData}>
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748B' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {overviewChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Inventory Status Pie Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-semibold text-slate-800 mb-4">Status do estoque</h3>
              {d.inventory.totalProducts === 0 ? (
                <p className="text-sm text-slate-500 text-center py-12">Nenhum produto cadastrado.</p>
              ) : (
                <div className="h-48 flex items-center">
                  <ResponsiveContainer width="50%" height="100%">
                    <PieChart>
                      <Pie data={alertChartData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                        {alertChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {alertChartData.map((item) => (
                      <div key={item.name} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-sm text-slate-600">{item.name}: <span className="font-medium">{item.value}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Customers Summary */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <UserPlus size={18} className="text-slate-500" />
                <h3 className="font-semibold text-slate-800">Resumo de clientes</h3>
              </div>
              {d.customers.total === 0 ? (
                <p className="text-sm text-slate-500">Nenhum cliente cadastrado ainda.</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Total</span>
                    <span className="font-semibold text-slate-800">{d.customers.total}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Novos esta semana</span>
                    <span className="font-semibold text-emerald-600">+{d.customers.newThisWeek}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Novos este mes</span>
                    <span className="font-semibold text-emerald-600">+{d.customers.newThisMonth}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Alert Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Low Stock Alert */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-amber-500" />
                  <h3 className="font-semibold text-slate-800">Estoque baixo</h3>
                </div>
                {lowStockProducts.length > 0 && (
                  <button onClick={() => navigate('/estoque')} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                    Ver todos <ArrowRight size={12} />
                  </button>
                )}
              </div>
              {lowStockProducts.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum produto com estoque baixo.</p>
              ) : (
                <div className="space-y-2">
                  {lowStockProducts.slice(0, 5).map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-2.5 bg-amber-50 rounded-lg">
                      <span className="text-sm font-medium text-slate-800">{p.name}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-red-600 font-semibold">{p.quantity} un</span>
                        <span className="text-slate-400">min: {p.min_quantity}</span>
                      </div>
                    </div>
                  ))}
                  {lowStockProducts.length > 5 && (
                    <p className="text-xs text-slate-400 text-center">+{lowStockProducts.length - 5} outros</p>
                  )}
                </div>
              )}
            </div>

            {/* Expiring Products */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Clock size={18} className="text-red-500" />
                  <h3 className="font-semibold text-slate-800">Vencendo em 30 dias</h3>
                </div>
                {expiringProducts.length > 0 && (
                  <button onClick={() => navigate('/estoque')} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                    Ver todos <ArrowRight size={12} />
                  </button>
                )}
              </div>
              {expiringProducts.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum produto perto do vencimento.</p>
              ) : (
                <div className="space-y-2">
                  {expiringProducts.slice(0, 5).map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-2.5 bg-red-50 rounded-lg">
                      <span className="text-sm font-medium text-slate-800">{p.name}</span>
                      <span className="text-xs text-red-600 font-medium">
                        {p.expires_at ? new Date(p.expires_at).toLocaleDateString('pt-BR') : '-'}
                      </span>
                    </div>
                  ))}
                  {expiringProducts.length > 5 && (
                    <p className="text-xs text-slate-400 text-center">+{expiringProducts.length - 5} outros</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
