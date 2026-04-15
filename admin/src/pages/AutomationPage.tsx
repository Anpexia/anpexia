import { useEffect, useState } from 'react';
import { Plus, Zap, Trash2, X } from 'lucide-react';
import api from '../services/api';

const TRIGGERS = [
  { key: 'LEAD_CREATED', label: 'Lead criado' },
  { key: 'STAGE_CHANGED', label: 'Estágio alterado' },
  { key: 'LEAD_IDLE', label: 'Lead inativo' },
  { key: 'DEAL_WON', label: 'Negócio fechado' },
];

const ACTIONS = [
  { key: 'CREATE_TASK', label: 'Criar tarefa' },
  { key: 'SEND_NOTIFICATION', label: 'Enviar notificação' },
];

const STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'];

export default function AutomationPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/admin/automations');
      setItems(r.data.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggle = async (id: string) => { await api.patch(`/admin/automations/${id}/toggle`); load(); };
  const del = async (id: string) => { if (!confirm('Excluir automação?')) return; await api.delete(`/admin/automations/${id}`); load(); };

  const save = async () => {
    const body: any = { ...editing };
    if (body.id) {
      const id = body.id; delete body.id; delete body.createdAt; delete body.updatedAt;
      await api.patch(`/admin/automations/${id}`, body);
    } else {
      await api.post('/admin/automations', body);
    }
    setEditing(null);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Automações</h2>
          <p className="text-gray-600 mt-1">Regras que disparam ações automáticas no CRM</p>
        </div>
        <button onClick={() => setEditing({ name: '', trigger: 'LEAD_CREATED', triggerConfig: {}, action: 'CREATE_TASK', actionConfig: { type: 'FOLLOWUP', daysOffset: 1 }, active: true })} className="flex items-center gap-2 bg-[#1E3A5F] text-white px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={18} /> Nova automação
        </button>
      </div>

      {loading ? <div className="text-gray-500">Carregando...</div> : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-yellow-50 flex items-center justify-center">
                <Zap size={20} className="text-yellow-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">{a.name}</h3>
                <p className="text-xs text-gray-500">
                  {TRIGGERS.find((t) => t.key === a.trigger)?.label || a.trigger}
                  {a.triggerConfig?.toStage ? ` → ${a.triggerConfig.toStage}` : ''}
                  {a.triggerConfig?.idleDays ? ` (${a.triggerConfig.idleDays} dias)` : ''}
                  {' • '}
                  {ACTIONS.find((x) => x.key === a.action)?.label || a.action}
                  {a.actionConfig?.type ? ` [${a.actionConfig.type}]` : ''}
                  {a.actionConfig?.daysOffset != null ? ` +${a.actionConfig.daysOffset}d` : ''}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={a.active} onChange={() => toggle(a.id)} />
                <span>{a.active ? 'Ativa' : 'Inativa'}</span>
              </label>
              <button onClick={() => setEditing(a)} className="text-sm text-[#1E3A5F]">Editar</button>
              <button onClick={() => del(a.id)} className="text-red-500"><Trash2 size={16} /></button>
            </div>
          ))}
          {items.length === 0 && <p className="text-gray-400 text-center py-8">Nenhuma automação</p>}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6">
            <div className="flex justify-between mb-4"><h3 className="font-semibold">{editing.id ? 'Editar' : 'Nova'} automação</h3><button onClick={() => setEditing(null)}><X size={20} /></button></div>
            <div className="space-y-3">
              <input placeholder="Nome" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              <div>
                <label className="text-xs text-gray-600">Trigger</label>
                <select value={editing.trigger} onChange={(e) => setEditing({ ...editing, trigger: e.target.value, triggerConfig: {} })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                  {TRIGGERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              {editing.trigger === 'STAGE_CHANGED' && (
                <select value={editing.triggerConfig?.toStage || ''} onChange={(e) => setEditing({ ...editing, triggerConfig: { toStage: e.target.value } })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                  <option value="">Para qualquer estágio</option>
                  {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              {editing.trigger === 'LEAD_IDLE' && (
                <input type="number" placeholder="Dias inativo" value={editing.triggerConfig?.idleDays || ''} onChange={(e) => setEditing({ ...editing, triggerConfig: { idleDays: Number(e.target.value) } })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              )}
              <div>
                <label className="text-xs text-gray-600">Ação</label>
                <select value={editing.action} onChange={(e) => setEditing({ ...editing, action: e.target.value, actionConfig: {} })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                  {ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
              </div>
              {editing.action === 'CREATE_TASK' && (
                <>
                  <select value={editing.actionConfig?.type || 'FOLLOWUP'} onChange={(e) => setEditing({ ...editing, actionConfig: { ...editing.actionConfig, type: e.target.value } })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                    {['CALL', 'FOLLOWUP', 'PROPOSAL', 'MEETING', 'OTHER'].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="number" placeholder="Dias de offset" value={editing.actionConfig?.daysOffset ?? 1} onChange={(e) => setEditing({ ...editing, actionConfig: { ...editing.actionConfig, daysOffset: Number(e.target.value) } })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </>
              )}
              {editing.action === 'SEND_NOTIFICATION' && (
                <input placeholder="Mensagem" value={editing.actionConfig?.message || ''} onChange={(e) => setEditing({ ...editing, actionConfig: { message: e.target.value } })} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setEditing(null)} className="flex-1 border border-gray-300 py-2 rounded text-sm">Cancelar</button>
                <button onClick={save} className="flex-1 bg-[#1E3A5F] text-white py-2 rounded text-sm">Salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
