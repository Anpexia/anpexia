import { useState, useEffect, useCallback } from 'react';
import { Building2, Clock, Mail, Shield, Wifi } from 'lucide-react';
import api from '../services/api';

type Tab = 'clinica' | 'convenios' | 'horarios' | 'whatsapp' | 'email';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'clinica', label: 'Clinica', icon: Building2 },
  { key: 'convenios', label: 'Convenios', icon: Shield },
  { key: 'horarios', label: 'Horarios', icon: Clock },
  { key: 'whatsapp', label: 'WhatsApp', icon: Wifi },
  { key: 'email', label: 'Email', icon: Mail },
];

const DIAS = [
  { key: 'seg', label: 'Segunda' },
  { key: 'ter', label: 'Terca' },
  { key: 'qua', label: 'Quarta' },
  { key: 'qui', label: 'Quinta' },
  { key: 'sex', label: 'Sexta' },
  { key: 'sab', label: 'Sabado' },
  { key: 'dom', label: 'Domingo' },
];

const DEFAULT_HORARIOS: Record<string, { ativo: boolean; inicio: string; fim: string }> = {
  seg: { ativo: true, inicio: '08:00', fim: '18:00' },
  ter: { ativo: true, inicio: '08:00', fim: '18:00' },
  qua: { ativo: true, inicio: '08:00', fim: '18:00' },
  qui: { ativo: true, inicio: '08:00', fim: '18:00' },
  sex: { ativo: true, inicio: '08:00', fim: '18:00' },
  sab: { ativo: false, inicio: '08:00', fim: '12:00' },
  dom: { ativo: false, inicio: '', fim: '' },
};

export function ConfiguracoesPage() {
  const [tab, setTab] = useState<Tab>('clinica');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Clinica
  const [clinica, setClinica] = useState({ name: '', phone: '', email: '', address: '', cnpj: '', logo: '' });

  // Horarios
  const [horarios, setHorarios] = useState<Record<string, { ativo: boolean; inicio: string; fim: string }>>(DEFAULT_HORARIOS);
  const [duracaoPadrao, setDuracaoPadrao] = useState(30);

  // Email
  const [emailConfig, setEmailConfig] = useState({
    emailEnabled: false,
    emailFrom: '',
    emailWelcome: true,
    emailConfirmacao: true,
    emailLembrete: true,
    emailCancelamento: true,
  });
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);

  // Convenios
  const [convenios, setConvenios] = useState<any[]>([]);
  const [newConvenio, setNewConvenio] = useState('');

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/settings');
      const d = data.data;
      if (d.tenant) {
        setClinica({
          name: d.tenant.name || '',
          phone: d.tenant.phone || '',
          email: d.tenant.email || '',
          address: d.tenant.address || '',
          cnpj: d.settings?.cnpj || '',
          logo: d.tenant.logo || '',
        });
      }
      if (d.settings) {
        if (d.settings.horarios) setHorarios({ ...DEFAULT_HORARIOS, ...d.settings.horarios });
        if (d.settings.duracaoConsultaPadrao) setDuracaoPadrao(d.settings.duracaoConsultaPadrao);
        setEmailConfig({
          emailEnabled: d.settings.emailEnabled ?? false,
          emailFrom: d.settings.emailFrom || '',
          emailWelcome: d.settings.emailWelcome ?? true,
          emailConfirmacao: d.settings.emailConfirmacao ?? true,
          emailLembrete: d.settings.emailLembrete ?? true,
          emailCancelamento: d.settings.emailCancelamento ?? true,
        });
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
    setLoading(false);
  }, []);

  const loadConvenios = useCallback(async () => {
    try {
      const { data } = await api.get('/convenios');
      setConvenios(data.data || []);
    } catch {}
  }, []);

  useEffect(() => { loadSettings(); loadConvenios(); }, [loadSettings, loadConvenios]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const saveClinica = async () => {
    setSaving(true);
    try {
      await api.put('/settings/clinica', clinica);
      flash('Dados da clinica salvos!');
    } catch { flash('Erro ao salvar'); }
    setSaving(false);
  };

  const saveHorarios = async () => {
    setSaving(true);
    try {
      await api.put('/settings/horarios', { horarios, duracaoConsultaPadrao: duracaoPadrao });
      flash('Horarios salvos!');
    } catch { flash('Erro ao salvar'); }
    setSaving(false);
  };

  const saveEmail = async () => {
    setSaving(true);
    try {
      await api.put('/settings/email', emailConfig);
      flash('Configuracoes de email salvas!');
    } catch { flash('Erro ao salvar'); }
    setSaving(false);
  };

  const sendTestEmail = async () => {
    if (!testEmailTo) return;
    setTestingEmail(true);
    try {
      await api.post('/settings/email/test', { to: testEmailTo });
      flash('Email de teste enviado!');
    } catch { flash('Erro ao enviar email de teste'); }
    setTestingEmail(false);
  };

  const addConvenio = async () => {
    if (!newConvenio.trim()) return;
    try {
      await api.post('/convenios', { nome: newConvenio.trim() });
      setNewConvenio('');
      loadConvenios();
    } catch { flash('Erro ao adicionar convenio'); }
  };

  const toggleConvenio = async (id: string, ativo: boolean) => {
    try {
      await api.put(`/convenios/${id}`, { ativo: !ativo });
      loadConvenios();
    } catch {}
  };

  const deleteConvenio = async (id: string) => {
    try {
      await api.delete(`/convenios/${id}`);
      loadConvenios();
    } catch { flash('Erro ao excluir'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Configuracoes</h1>

      {msg && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-green-50 text-green-700 text-sm border border-green-200">
          {msg}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* CLINICA TAB */}
      {tab === 'clinica' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Dados da Clinica</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input value={clinica.name} onChange={e => setClinica({...clinica, name: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
              <input value={clinica.cnpj} onChange={e => setClinica({...clinica, cnpj: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="00.000.000/0000-00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input value={clinica.phone} onChange={e => setClinica({...clinica, phone: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input value={clinica.email} onChange={e => setClinica({...clinica, email: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Endereco</label>
              <input value={clinica.address} onChange={e => setClinica({...clinica, address: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={saveClinica} disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* CONVENIOS TAB */}
      {tab === 'convenios' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Convenios Aceitos</h2>
          <div className="flex gap-2 mb-4">
            <input
              value={newConvenio}
              onChange={e => setNewConvenio(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addConvenio()}
              placeholder="Nome do convenio..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <button onClick={addConvenio} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              Adicionar
            </button>
          </div>
          <div className="space-y-2">
            {convenios.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg">
                <span className={`text-sm font-medium ${c.ativo ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{c.nome}</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleConvenio(c.id, c.ativo)}
                    className={`text-xs px-3 py-1 rounded-full font-medium ${c.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}
                  >
                    {c.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                  <button onClick={() => deleteConvenio(c.id)} className="text-red-500 hover:text-red-700 text-xs">
                    Excluir
                  </button>
                </div>
              </div>
            ))}
            {convenios.length === 0 && <p className="text-sm text-gray-500 text-center py-4">Nenhum convenio cadastrado</p>}
          </div>
        </div>
      )}

      {/* HORARIOS TAB */}
      {tab === 'horarios' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Horarios de Funcionamento</h2>
          <div className="space-y-3">
            {DIAS.map(dia => {
              const h = horarios[dia.key] || { ativo: false, inicio: '', fim: '' };
              return (
                <div key={dia.key} className="flex items-center gap-4">
                  <label className="flex items-center gap-2 w-28">
                    <input
                      type="checkbox"
                      checked={h.ativo}
                      onChange={e => setHorarios({...horarios, [dia.key]: {...h, ativo: e.target.checked}})}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm font-medium text-gray-700">{dia.label}</span>
                  </label>
                  {h.ativo && (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={h.inicio}
                        onChange={e => setHorarios({...horarios, [dia.key]: {...h, inicio: e.target.value}})}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                      />
                      <span className="text-gray-500">ate</span>
                      <input
                        type="time"
                        value={h.fim}
                        onChange={e => setHorarios({...horarios, [dia.key]: {...h, fim: e.target.value}})}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="pt-4 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-1">Duracao padrao da consulta (minutos)</label>
            <input
              type="number"
              min={5}
              max={120}
              value={duracaoPadrao}
              onChange={e => setDuracaoPadrao(Number(e.target.value))}
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={saveHorarios} disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {/* WHATSAPP TAB */}
      {tab === 'whatsapp' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">WhatsApp</h2>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              A configuracao do WhatsApp e gerenciada pela equipe Anpexia. Entre em contato caso precise vincular ou alterar sua instancia.
            </p>
          </div>
        </div>
      )}

      {/* EMAIL TAB */}
      {tab === 'email' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-800">Configuracoes de Email</h2>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={emailConfig.emailEnabled}
                onChange={e => setEmailConfig({...emailConfig, emailEnabled: e.target.checked})}
                className="rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">Ativar envio de emails</span>
            </label>
          </div>

          {emailConfig.emailEnabled && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email remetente</label>
                <input
                  value={emailConfig.emailFrom}
                  onChange={e => setEmailConfig({...emailConfig, emailFrom: e.target.value})}
                  placeholder="clinica@seudominio.com"
                  className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Templates ativos</h3>
                <div className="space-y-2">
                  {[
                    { key: 'emailWelcome' as const, label: 'Boas-vindas (novo paciente)' },
                    { key: 'emailConfirmacao' as const, label: 'Confirmacao de consulta' },
                    { key: 'emailLembrete' as const, label: 'Lembrete de consulta (48h)' },
                    { key: 'emailCancelamento' as const, label: 'Cancelamento de consulta' },
                  ].map(t => (
                    <label key={t.key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={emailConfig[t.key]}
                        onChange={e => setEmailConfig({...emailConfig, [t.key]: e.target.checked})}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">{t.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Enviar email de teste</h3>
                <div className="flex gap-2">
                  <input
                    value={testEmailTo}
                    onChange={e => setTestEmailTo(e.target.value)}
                    placeholder="email@exemplo.com"
                    className="flex-1 max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={sendTestEmail}
                    disabled={testingEmail || !testEmailTo}
                    className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50"
                  >
                    {testingEmail ? 'Enviando...' : 'Enviar teste'}
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end pt-2">
            <button onClick={saveEmail} disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
