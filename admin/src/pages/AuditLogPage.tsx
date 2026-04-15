import { useEffect, useState } from 'react';
import api from '../services/api';

interface AuditItem {
  id: string;
  createdAt: string;
  userId: string | null;
  userEmail: string | null;
  userRole: string | null;
  tenantId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ipAddress: string | null;
  ip: string | null;
}

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters
  const [userId, setUserId] = useState('');
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = async (p = page) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(p), limit: '50' };
      if (userId) params.userId = userId;
      if (action) params.action = action;
      if (entity) params.entity = entity;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const { data } = await api.get('/admin/audit-log', { params });
      setItems(data.data.items);
      setPages(data.data.pages);
      setTotal(data.data.total);
      setPage(data.data.page);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(1); }, []); // eslint-disable-line

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    void load(1);
  };

  const exportCsv = async () => {
    const params: Record<string, string> = {};
    if (userId) params.userId = userId;
    if (action) params.action = action;
    if (entity) params.entity = entity;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const qs = new URLSearchParams(params).toString();
    const token = sessionStorage.getItem('adminToken');
    const base = (api.defaults.baseURL || '').replace(/\/$/, '');
    const url = `${base}/admin/audit-log/export?${qs}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Audit Log</h1>
          <p className="text-sm text-slate-500">Registro de ações para conformidade LGPD. Total: {total}</p>
        </div>
        <button onClick={exportCsv} className="bg-[#2563EB] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          Exportar CSV
        </button>
      </div>

      <form onSubmit={applyFilters} className="bg-white rounded-xl border p-4 mb-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
        <input placeholder="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} className="border rounded px-2 py-1.5" />
        <input placeholder="Ação" value={action} onChange={(e) => setAction(e.target.value)} className="border rounded px-2 py-1.5" />
        <input placeholder="Entidade" value={entity} onChange={(e) => setEntity(e.target.value)} className="border rounded px-2 py-1.5" />
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded px-2 py-1.5" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded px-2 py-1.5" />
        <button type="submit" className="bg-slate-700 text-white rounded px-3 py-1.5">Aplicar</button>
      </form>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Data/Hora</th>
              <th className="px-3 py-2">Usuário</th>
              <th className="px-3 py-2">Ação</th>
              <th className="px-3 py-2">Entidade</th>
              <th className="px-3 py-2">Entity ID</th>
              <th className="px-3 py-2">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-slate-400">Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-slate-400">Nenhum registro</td></tr>
            ) : (
              items.map((i) => (
                <tr key={i.id} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(i.createdAt).toLocaleString('pt-BR')}</td>
                  <td className="px-3 py-2">{i.userEmail || i.userId || '—'} <span className="text-xs text-slate-400">{i.userRole}</span></td>
                  <td className="px-3 py-2 font-mono text-xs">{i.action}</td>
                  <td className="px-3 py-2">{i.entity}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{i.entityId || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{i.ipAddress || i.ip || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm">
        <div className="text-slate-500">Página {page} de {pages}</div>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => load(page - 1)} className="px-3 py-1.5 border rounded disabled:opacity-40">Anterior</button>
          <button disabled={page >= pages} onClick={() => load(page + 1)} className="px-3 py-1.5 border rounded disabled:opacity-40">Próxima</button>
        </div>
      </div>
    </div>
  );
}
