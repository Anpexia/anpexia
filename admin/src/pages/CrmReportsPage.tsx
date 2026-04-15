import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { Download } from 'lucide-react';
import api from '../services/api';

const STAGE_LABELS: Record<string, string> = {
  NEW: 'Novo', CONTACTED: 'Contatado', QUALIFIED: 'Qualificado',
  PROPOSAL_SENT: 'Proposta', NEGOTIATION: 'Negociação', WON: 'Fechado', LOST: 'Perdido',
};

const STAGE_ORDER = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'];
const COLORS = ['#64748b', '#2563eb', '#4f46e5', '#0891b2', '#d97706', '#16a34a', '#dc2626'];
const PIE_COLORS = ['#2563eb', '#4f46e5', '#0891b2', '#d97706', '#16a34a', '#dc2626', '#64748b', '#9333ea'];

function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

export default function CrmReportsPage() {
  const [stats, setStats] = useState<any>({});
  const [leads, setLeads] = useState<any[]>([]);

  useEffect(() => {
    api.get('/admin/leads/stats').then((r) => setStats(r.data.data || {}));
    api.get('/admin/leads', { params: { limit: 500 } }).then((r) => setLeads(r.data.data || []));
  }, []);

  const funnelData = STAGE_ORDER.map((s) => ({
    stage: STAGE_LABELS[s],
    count: stats.byStage?.[s]?.count || 0,
    value: stats.byStage?.[s]?.sum || 0,
  }));

  const weekData = Object.keys(stats.byWeek || {}).sort().map((k) => ({ week: k, count: stats.byWeek[k] }));
  const sourceData = Object.entries(stats.bySource || {}).map(([k, v]) => ({ name: k, value: v as number }));
  const respRows = Object.entries(stats.byResponsible || {}).map(([r, v]: any) => ({ responsible: r, ...v }));

  const exportCSV = () => {
    const header = ['Nome', 'Empresa', 'Email', 'Telefone', 'Estágio', 'Valor', 'Origem', 'Responsável', 'Criado em'];
    const rows = leads.map((l) => [
      l.name, l.companyName || l.company || '', l.email || '', l.phone || '',
      STAGE_LABELS[l.stage] || l.stage, l.estimatedValue || '', l.source || '', l.responsible || '',
      new Date(l.createdAt).toLocaleString('pt-BR'),
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `leads_${Date.now()}.csv`; a.click();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Relatórios CRM</h2>
          <p className="text-gray-600 mt-1">Performance, funil e origens de leads</p>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 border border-gray-300 px-3 py-2 rounded-lg text-sm">
          <Download size={16} /> Exportar CSV
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Card label="Total" value={stats.total ?? 0} />
        <Card label="Conversão" value={`${stats.conversionRate ?? 0}%`} />
        <Card label="Em negociação" value={fmtBRL(stats.negotiationValue ?? 0)} />
        <Card label="Ticket médio" value={fmtBRL(stats.avgTicket ?? 0)} />
        <Card label="Tempo médio" value={`${stats.avgCloseDays ?? 0}d`} />
        <Card label="Fechados" value={stats.byStage?.WON?.count ?? 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">Funil de vendas</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={funnelData} layout="vertical" margin={{ left: 80 }}>
              <XAxis type="number" />
              <YAxis type="category" dataKey="stage" />
              <Tooltip />
              <Bar dataKey="count" fill="#1E3A5F" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">Leads por semana (últimos 3 meses)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={weekData}>
              <XAxis dataKey="week" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">Origem dos leads</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={sourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                {sourceData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">Performance por responsável</h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-600 text-left"><tr><th className="py-2">Responsável</th><th>Total</th><th>Fechados</th><th>Receita</th></tr></thead>
            <tbody>
              {respRows.map((r: any) => (
                <tr key={r.responsible} className="border-t border-gray-100"><td className="py-2">{r.responsible}</td><td>{r.total}</td><td>{r.won}</td><td>{fmtBRL(r.sum)}</td></tr>
              ))}
              {respRows.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-gray-400">Sem dados</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
