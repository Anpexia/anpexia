import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Clock, Mail, Shield, Wifi, FileCode, Plus, Edit2, Trash2, Download, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

type Tab = 'clinica' | 'convenios' | 'horarios' | 'whatsapp' | 'email' | 'tuss' | 'seguranca';

interface TrustedDevice {
  id: string;
  deviceId: string;
  deviceName: string | null;
  createdAt: string;
}

const PROCEDURE_TYPES = ['CONSULTA', 'EXAME', 'CIRURGIA', 'TERAPIA', 'OUTROS'] as const;
type ProcedureType = typeof PROCEDURE_TYPES[number];

interface TussProcedureItem {
  id: string;
  code: string;
  description: string;
  type: ProcedureType;
  value: number;
  convenioId: string | null;
  convenio?: { id: string; nome: string } | null;
}

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
  const { user } = useAuth();
  const canManageTuss = user?.role === 'OWNER' || user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'clinica', label: 'Clinica', icon: Building2 },
    { key: 'convenios', label: 'Convenios', icon: Shield },
    ...(canManageTuss ? [{ key: 'tuss' as Tab, label: 'Procedimentos TUSS', icon: FileCode }] : []),
    { key: 'horarios', label: 'Horarios', icon: Clock },
    { key: 'whatsapp', label: 'WhatsApp', icon: Wifi },
    { key: 'email', label: 'Email', icon: Mail },
    { key: 'seguranca', label: 'Segurança', icon: ShieldCheck },
  ];

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'clinica';
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    const qt = searchParams.get('tab') as Tab | null;
    if (qt && qt !== tab) setTab(qt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const changeTab = (t: Tab) => {
    setTab(t);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', t);
      return next;
    }, { replace: true });
  };

  // 2FA + devices
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [secLoaded, setSecLoaded] = useState(false);
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [enableCode, setEnableCode] = useState('');
  const [enabling, setEnabling] = useState(false);
  const [disablePwd, setDisablePwd] = useState('');
  const [disabling, setDisabling] = useState(false);

  const loadSeguranca = useCallback(async () => {
    try {
      const { data: me } = await api.get('/auth/me');
      setTwoFAEnabled(!!me.data.twoFactorEnabled);
      const { data: dev } = await api.get('/auth/2fa/devices');
      setDevices(dev.data || []);
    } finally {
      setSecLoaded(true);
    }
  }, []);

  useEffect(() => { if (tab === 'seguranca') void loadSeguranca(); }, [tab, loadSeguranca]);

  const startSetup = async () => {
    const { data } = await api.post('/auth/2fa/setup');
    setSetupData(data.data);
  };
  const confirmEnable = async () => {
    setEnabling(true);
    try {
      await api.post('/auth/2fa/enable', { code: enableCode });
      setMsg('2FA ativado!');
      setSetupData(null);
      setEnableCode('');
      void loadSeguranca();
    } catch (err: any) {
      setMsg(err.response?.data?.error?.message || 'Erro ao ativar 2FA');
    } finally {
      setEnabling(false);
    }
  };
  const disable2FA = async () => {
    setDisabling(true);
    try {
      await api.post('/auth/2fa/disable', { password: disablePwd });
      setDisablePwd('');
      setMsg('2FA desativado');
      void loadSeguranca();
    } catch (err: any) {
      setMsg(err.response?.data?.error?.message || 'Erro ao desativar');
    } finally {
      setDisabling(false);
    }
  };
  const removeDevice = async (id: string) => {
    await api.delete(`/auth/2fa/devices/${id}`);
    void loadSeguranca();
  };
  const removeAllDevices = async () => {
    if (!confirm('Remover todos os dispositivos confiáveis? Você precisará verificar cada um novamente.')) return;
    await Promise.all(devices.map((d) => api.delete(`/auth/2fa/devices/${d.id}`)));
    void loadSeguranca();
  };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // TUSS state
  const [tussList, setTussList] = useState<TussProcedureItem[]>([]);
  const [tussFilterType, setTussFilterType] = useState<string>('');
  const [tussFilterConvenio, setTussFilterConvenio] = useState<string>('');
  const [tussModalOpen, setTussModalOpen] = useState(false);
  const [tussEditing, setTussEditing] = useState<TussProcedureItem | null>(null);
  const [tussForm, setTussForm] = useState<{ code: string; description: string; type: ProcedureType; value: string; convenioId: string }>({
    code: '', description: '', type: 'CONSULTA', value: '', convenioId: '',
  });
  // Gerar lote TISS
  const [loteConvenio, setLoteConvenio] = useState('');
  const [loteInicio, setLoteInicio] = useState('');
  const [loteFim, setLoteFim] = useState('');
  const [generatingXml, setGeneratingXml] = useState(false);

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

  const loadTuss = useCallback(async () => {
    if (!canManageTuss) return;
    try {
      const params: any = {};
      if (tussFilterType) params.type = tussFilterType;
      if (tussFilterConvenio) params.convenioId = tussFilterConvenio;
      const { data } = await api.get('/tuss/procedures', { params });
      setTussList(data.data || []);
    } catch {}
  }, [canManageTuss, tussFilterType, tussFilterConvenio]);

  useEffect(() => { loadSettings(); loadConvenios(); }, [loadSettings, loadConvenios]);
  useEffect(() => { if (tab === 'tuss') loadTuss(); }, [tab, loadTuss]);

  const openTussCreate = () => {
    setTussEditing(null);
    setTussForm({ code: '', description: '', type: 'CONSULTA', value: '', convenioId: '' });
    setTussModalOpen(true);
  };

  const openTussEdit = (p: TussProcedureItem) => {
    setTussEditing(p);
    setTussForm({
      code: p.code,
      description: p.description,
      type: p.type,
      value: String(p.value),
      convenioId: p.convenioId || '',
    });
    setTussModalOpen(true);
  };

  const saveTuss = async () => {
    const payload = {
      code: tussForm.code.trim(),
      description: tussForm.description.trim(),
      type: tussForm.type,
      value: Number(tussForm.value),
      convenioId: tussForm.convenioId || null,
    };
    if (!payload.code || !payload.description || isNaN(payload.value)) {
      flash('Preencha todos os campos obrigatorios');
      return;
    }
    try {
      if (tussEditing) {
        await api.put(`/tuss/procedures/${tussEditing.id}`, payload);
        flash('Procedimento atualizado!');
      } else {
        await api.post('/tuss/procedures', payload);
        flash('Procedimento criado!');
      }
      setTussModalOpen(false);
      loadTuss();
    } catch (err: any) {
      flash(err.response?.data?.error?.message || 'Erro ao salvar');
    }
  };

  const deleteTuss = async (id: string) => {
    if (!confirm('Excluir este procedimento?')) return;
    try {
      await api.delete(`/tuss/procedures/${id}`);
      flash('Procedimento excluido!');
      loadTuss();
    } catch (err: any) {
      flash(err.response?.data?.error?.message || 'Erro ao excluir');
    }
  };

  const generateTissXml = async () => {
    if (!loteConvenio || !loteInicio || !loteFim) {
      flash('Selecione convenio e periodo');
      return;
    }
    setGeneratingXml(true);
    try {
      const res = await api.post(
        '/tuss/generate-xml',
        { convenioId: loteConvenio, dataInicio: loteInicio, dataFim: loteFim },
        { responseType: 'blob' },
      );
      const blob = new Blob([res.data], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tiss_${loteInicio}_${loteFim}.xml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      flash('Lote TISS gerado!');
    } catch (err: any) {
      flash(err.response?.data?.error?.message || 'Erro ao gerar XML');
    } finally {
      setGeneratingXml(false);
    }
  };

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
            onClick={() => changeTab(t.key)}
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

      {/* TUSS TAB */}
      {tab === 'tuss' && canManageTuss && (
        <div className="space-y-6">
          {/* Procedures list */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-gray-800">Procedimentos TUSS</h2>
              <button
                onClick={openTussCreate}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                <Plus size={16} /> Adicionar Procedimento
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <select
                value={tussFilterType}
                onChange={(e) => setTussFilterType(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todos os tipos</option>
                {PROCEDURE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <select
                value={tussFilterConvenio}
                onChange={(e) => setTussFilterConvenio(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Todos os convenios</option>
                {convenios.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Codigo</th>
                    <th className="px-3 py-2 font-medium">Descricao</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Valor</th>
                    <th className="px-3 py-2 font-medium">Convenio</th>
                    <th className="px-3 py-2 font-medium text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tussList.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">Nenhum procedimento cadastrado</td></tr>
                  )}
                  {tussList.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                      <td className="px-3 py-2 text-gray-800">{p.description}</td>
                      <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">{p.type}</span></td>
                      <td className="px-3 py-2 text-gray-700">R$ {Number(p.value).toFixed(2)}</td>
                      <td className="px-3 py-2 text-gray-600">{p.convenio?.nome || '-'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openTussEdit(p)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Editar"><Edit2 size={14} /></button>
                          <button onClick={() => deleteTuss(p.id)} className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Excluir"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gerar Lote TISS */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Gerar Lote TISS</h2>
            <p className="text-sm text-gray-500 mb-4">Gera o XML no padrao TISS 4.01.00 da ANS com as consultas realizadas no periodo.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Convenio *</label>
                <select
                  value={loteConvenio}
                  onChange={(e) => setLoteConvenio(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Selecione...</option>
                  {convenios.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data inicio *</label>
                <input type="date" value={loteInicio} onChange={(e) => setLoteInicio(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data fim *</label>
                <input type="date" value={loteFim} onChange={(e) => setLoteFim(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={generateTissXml}
                disabled={generatingXml}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                <Download size={16} /> {generatingXml ? 'Gerando...' : 'Gerar XML'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TUSS MODAL */}
      {tussModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">{tussEditing ? 'Editar' : 'Novo'} Procedimento TUSS</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Codigo TUSS *</label>
                <input value={tussForm.code} onChange={(e) => setTussForm({ ...tussForm, code: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descricao *</label>
                <input value={tussForm.description} onChange={(e) => setTussForm({ ...tussForm, description: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
                  <select value={tussForm.type} onChange={(e) => setTussForm({ ...tussForm, type: e.target.value as ProcedureType })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    {PROCEDURE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
                  <input type="number" step="0.01" value={tussForm.value} onChange={(e) => setTussForm({ ...tussForm, value: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Convenio (opcional)</label>
                <select value={tussForm.convenioId} onChange={(e) => setTussForm({ ...tussForm, convenioId: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Nenhum (particular)</option>
                  {convenios.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setTussModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancelar</button>
              <button onClick={saveTuss} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Salvar</button>
            </div>
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

      {/* SEGURANCA TAB */}
      {tab === 'seguranca' && (
        <div className="space-y-6 max-w-2xl">
          {!secLoaded ? (
            <div className="text-slate-500">Carregando...</div>
          ) : (
            <>
              <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  {twoFAEnabled ? <ShieldCheck className="text-green-600" size={24} /> : <ShieldOff className="text-slate-400" size={24} />}
                  <div>
                    <h2 className="font-semibold">Autenticação em duas etapas (2FA)</h2>
                    <p className="text-xs text-slate-500">Status: <span className={twoFAEnabled ? 'text-green-600' : 'text-slate-500'}>{twoFAEnabled ? 'Ativa' : 'Desativada'}</span></p>
                  </div>
                </div>

                {!twoFAEnabled && !setupData && (
                  <button onClick={startSetup} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Ativar 2FA</button>
                )}

                {setupData && (
                  <div className="space-y-3 mt-2">
                    <p className="text-sm text-slate-600">Escaneie o QR Code no seu app autenticador (Google Authenticator, Authy, 1Password) e digite o código gerado.</p>
                    <img src={setupData.qrCodeDataUrl} alt="QR Code 2FA" className="w-48 h-48 border rounded" />
                    <p className="text-xs text-slate-500">Ou digite manualmente: <code className="bg-slate-100 px-2 py-0.5 rounded">{setupData.secret}</code></p>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={enableCode}
                      onChange={(e) => setEnableCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="Código de 6 dígitos"
                      className="w-48 px-3 py-2 border border-gray-300 rounded-lg text-center tracking-widest"
                    />
                    <div className="flex gap-2">
                      <button onClick={confirmEnable} disabled={enabling || enableCode.length !== 6} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                        {enabling ? 'Ativando...' : 'Confirmar'}
                      </button>
                      <button onClick={() => setSetupData(null)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300">Cancelar</button>
                    </div>
                  </div>
                )}

                {twoFAEnabled && (
                  <div className="space-y-2 mt-2">
                    <label className="block text-sm text-slate-700">Digite sua senha para desativar:</label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={disablePwd}
                        onChange={(e) => setDisablePwd(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <button onClick={disable2FA} disabled={disabling || !disablePwd} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                        {disabling ? '...' : 'Desativar 2FA'}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold">Dispositivos confiáveis</h2>
                    <p className="text-xs text-slate-500">Dispositivos que não precisam de verificação em cada login.</p>
                  </div>
                  {devices.length > 0 && (
                    <button onClick={removeAllDevices} className="text-xs text-red-600 hover:underline">Remover todos</button>
                  )}
                </div>

                {devices.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum dispositivo confiável registrado.</p>
                ) : (
                  <ul className="divide-y">
                    {devices.map((d) => (
                      <li key={d.id} className="py-3 flex items-center gap-3">
                        <Smartphone size={18} className="text-slate-400" />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{d.deviceName || 'Dispositivo desconhecido'}</div>
                          <div className="text-xs text-slate-500">Adicionado em {new Date(d.createdAt).toLocaleString('pt-BR')}</div>
                        </div>
                        <button onClick={() => removeDevice(d.id)} className="text-red-600 hover:bg-red-50 p-2 rounded">
                          <Trash2 size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
