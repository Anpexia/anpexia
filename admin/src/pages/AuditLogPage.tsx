import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';

interface AuditItem {
  id: string;
  createdAt: string;
  userId: string | null;
  userEmail: string | null;
  userRole: string | null;
  tenantId: string | null;
  tenant?: { id: string; name: string } | null;
  action: string;
  entity: string;
  entityId: string | null;
  ipAddress: string | null;
  ip: string | null;
  metadata?: any;
  changes?: any;
}

interface TenantOpt { id: string; name: string; }

const ACTION_OPTIONS: { label: string; value: string }[] = [
  { label: 'Todas', value: '' },
  { label: 'Login', value: 'LOGIN' },
  { label: 'Logout', value: 'LOGOUT' },
  { label: 'Criar', value: 'CREATE' },
  { label: 'Editar', value: 'UPDATE' },
  { label: 'Deletar', value: 'DELETE' },
  { label: 'Visualizar', value: 'VIEW' },
  { label: 'Imprimir', value: 'PRINT' },
];

const ENTITY_OPTIONS: { label: string; value: string }[] = [
  { label: 'Todas', value: '' },
  { label: 'Usuário', value: 'USER' },
  { label: 'Paciente', value: 'PATIENT' },
  { label: 'Agendamento', value: 'APPOINTMENT' },
  { label: 'Financeiro', value: 'FINANCIAL' },
  { label: 'Estoque', value: 'STOCK' },
  { label: 'Atestado', value: 'CERTIFICATE' },
  { label: 'Prescrição', value: 'PRESCRIPTION' },
];

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Login',
  LOGOUT: 'Logout',
  CREATE: 'Criar',
  UPDATE: 'Editar',
  DELETE: 'Deletar',
  VIEW: 'Visualizar',
  PRINT: 'Imprimir',
};

const ENTITY_LABELS: Record<string, string> = {
  USER: 'Usuário',
  PATIENT: 'Paciente',
  APPOINTMENT: 'Agendamento',
  FINANCIAL: 'Financeiro',
  STOCK: 'Estoque',
  CERTIFICATE: 'Atestado',
  PRESCRIPTION: 'Prescrição',
};

function actionBadge(action: string): { label: string; cls: string } {
  const key = action?.toUpperCase() || '';
  const map: Record<string, string> = {
    LOGIN: 'bg-blue-100 text-blue-800',
    LOGOUT: 'bg-gray-100 text-gray-700',
    CREATE: 'bg-green-100 text-green-800',
    UPDATE: 'bg-yellow-100 text-yellow-800',
    DELETE: 'bg-red-100 text-red-800',
    VIEW: 'bg-purple-100 text-purple-700',
    PRINT: 'bg-orange-100 text-orange-800',
  };
  // handle normalized forms like "customer.create" or "LOGIN_SUCCESS"
  let resolved = '';
  if (map[key]) resolved = key;
  else if (key.includes('LOGIN')) resolved = 'LOGIN';
  else if (key.includes('LOGOUT')) resolved = 'LOGOUT';
  else if (key.includes('CREATE')) resolved = 'CREATE';
  else if (key.includes('UPDATE') || key.includes('EDIT')) resolved = 'UPDATE';
  else if (key.includes('DELETE')) resolved = 'DELETE';
  else if (key.includes('VIEW')) resolved = 'VIEW';
  else if (key.includes('PRINT')) resolved = 'PRINT';

  return {
    label: resolved ? ACTION_LABELS[resolved] : action,
    cls: resolved ? map[resolved] : 'bg-slate-100 text-slate-700',
  };
}

function entityLabel(entity: string): string {
  const key = entity?.toUpperCase();
  return ENTITY_LABELS[key] || entity;
}

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState<TenantOpt[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Filters
  const [tenantId, setTenantId] = useState('');
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const debounceRef = useRef<number | null>(null);

  const buildParams = (p: number) => {
    const params: Record<string, string> = { page: String(p), limit: '50' };
    if (tenantId) params.tenantId = tenantId;
    if (action) params.action = action;
    if (entity) params.entity = entity;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return params;
  };

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/audit-log', { params: buildParams(p) });
      const payload = data.data || data;
      setItems(payload.items || payload.data || []);
      setPages(payload.pages || payload.totalPages || 1);
      setTotal(payload.total || 0);
      setPage(payload.page || p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/admin/audit-log/tenants');
        setTenants((data.data || data)?.items || []);
      } catch { /* ignore */ }
    })();
  }, []);

  // Debounced refetch on filter changes
  const filtersKey = useMemo(() => `${tenantId}|${action}|${entity}|${startDate}|${endDate}`, [tenantId, action, entity, startDate, endDate]);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => { void load(1); }, 200);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
    // eslint-disable-next-line
  }, [filtersKey]);

  const exportCsv = async () => {
    const params = buildParams(1);
    delete (params as any).page;
    delete (params as any).limit;
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

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Audit Log</h1>
          <p className="text-sm text-slate-500">Registro de todas as ações do sistema ({total} registros)</p>
        </div>
        <button onClick={exportCsv} className="bg-[#2563EB] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          Exportar CSV
        </button>
      </div>

      <div className="bg-white rounded-xl border p-4 mb-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Clínica</label>
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="border rounded px-2 py-1.5 w-full">
            <option value="">Todas</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Ação</label>
          <select value={action} onChange={(e) => setAction(e.target.value)} className="border rounded px-2 py-1.5 w-full">
            {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Entidade</label>
          <select value={entity} onChange={(e) => setEntity(e.target.value)} className="border rounded px-2 py-1.5 w-full">
            {ENTITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">De</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded px-2 py-1.5 w-full" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Até</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded px-2 py-1.5 w-full" />
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 w-8"></th>
              <th className="px-3 py-2">Data/Hora</th>
              <th className="px-3 py-2">Clínica</th>
              <th className="px-3 py-2">Usuário</th>
              <th className="px-3 py-2">Ação</th>
              <th className="px-3 py-2">Entidade</th>
              <th className="px-3 py-2">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-slate-400">Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-slate-400">Nenhum registro</td></tr>
            ) : (
              items.map((i) => {
                const badge = actionBadge(i.action);
                const isOpen = !!expanded[i.id];
                const hasDetails = !!i.entityId || (i.metadata && Object.keys(i.metadata || {}).length > 0);
                return (
                  <>
                    <tr key={i.id} className="border-t hover:bg-slate-50 cursor-pointer" onClick={() => toggle(i.id)}>
                      <td className="px-3 py-2 text-slate-400">
                        <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{new Date(i.createdAt).toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-2">{i.tenant?.name || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-800">{i.userEmail?.split('@')[0] || i.userId || '—'}</div>
                        <div className="text-xs text-slate-500">{i.userEmail || ''}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-3 py-2">{entityLabel(i.entity)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{i.ipAddress || i.ip || '—'}</td>
                    </tr>
                    {isOpen && hasDetails && (
                      <tr key={`${i.id}-details`} className="bg-slate-50 border-t">
                        <td></td>
                        <td colSpan={6} className="px-3 py-3 text-xs">
                          {i.entityId && (
                            <div className="mb-2"><span className="font-semibold text-slate-600">Entity ID:</span> <span className="font-mono">{i.entityId}</span></div>
                          )}
                          {i.metadata && Object.keys(i.metadata).length > 0 && (
                            <div>
                              <div className="font-semibold text-slate-600 mb-1">Metadata:</div>
                              <pre className="bg-white border rounded p-2 overflow-auto text-xs">{JSON.stringify(i.metadata, null, 2)}</pre>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
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
