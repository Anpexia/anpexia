import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { User, Pen, Save, Trash2, Lock, CheckCircle, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

type TabKey = 'perfil' | 'senha' | 'assinatura' | 'seguranca';

interface Device {
  id: string;
  deviceId: string;
  deviceName: string | null;
  createdAt: string;
}

export function ProfilePage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabKey) || 'perfil';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    const t = searchParams.get('tab') as TabKey | null;
    if (t && t !== activeTab) setActiveTab(t);
  }, [searchParams]);

  const switchTab = (t: TabKey) => {
    setActiveTab(t);
    const next = new URLSearchParams(searchParams);
    next.set('tab', t);
    setSearchParams(next, { replace: true });
  };

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  // Professional fields
  const [especialidade, setEspecialidade] = useState('');
  const [rqe, setRqe] = useState('');
  const [tipoRegistro, setTipoRegistro] = useState('');
  const [numeroRegistro, setNumeroRegistro] = useState('');
  const [duracaoConsulta, setDuracaoConsulta] = useState('');
  const [bio, setBio] = useState('');

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Signature
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [, setSignatureLoaded] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Security (2FA + devices)
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [secLoading, setSecLoading] = useState(true);
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [enableCode, setEnableCode] = useState('');
  const [enabling, setEnabling] = useState(false);
  const [disablePwd, setDisablePwd] = useState('');
  const [disabling, setDisabling] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone('');
      api.get('/team/me/profile').then(({ data }) => {
        const p = data.data;
        if (p) {
          if (p.phone) setPhone(p.phone);
          if (p.especialidade) setEspecialidade(p.especialidade);
          if (p.rqe) setRqe(p.rqe);
          if (p.tipoRegistro) setTipoRegistro(p.tipoRegistro);
          if (p.numeroRegistro) setNumeroRegistro(p.numeroRegistro);
          if (p.duracaoConsulta) setDuracaoConsulta(String(p.duracaoConsulta));
          if (p.bio) setBio(p.bio);
        }
      }).catch(() => {});
      api.get(`/doctors/${user.id}/signature`).then(({ data }) => {
        if (data.data?.signatureImage) {
          loadSignatureToCanvas(data.data.signatureImage);
          setHasSignature(true);
        }
        setSignatureLoaded(true);
      }).catch(() => setSignatureLoaded(true));
    }
  }, [user]);

  const loadSecurity = async () => {
    setSecLoading(true);
    try {
      const { data: me } = await api.get('/auth/me');
      setTwoFAEnabled(!!me.data?.twoFactorEnabled);
      const { data: dev } = await api.get('/auth/2fa/devices');
      setDevices(dev.data || []);
    } catch {
      // ignore
    } finally {
      setSecLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'seguranca') void loadSecurity();
  }, [activeTab]);

  const loadSignatureToCanvas = (base64: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = `data:image/png;base64,${base64}`;
  };

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }, []);

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      if (name && name !== user?.name) payload.name = name;
      if (phone) payload.phone = phone;
      if (especialidade) payload.especialidade = especialidade;
      if (rqe) payload.rqe = rqe;
      if (tipoRegistro) payload.tipoRegistro = tipoRegistro;
      if (numeroRegistro) payload.numeroRegistro = numeroRegistro;
      if (duracaoConsulta) payload.duracaoConsulta = parseInt(duracaoConsulta, 10) || undefined;
      if (bio) payload.bio = bio;

      await api.put('/team/me/profile', payload);
      const stored = sessionStorage.getItem('user');
      if (stored) {
        const u = JSON.parse(stored);
        if (payload.name) u.name = payload.name;
        sessionStorage.setItem('user', JSON.stringify(u));
      }
      showToast('Perfil atualizado!');
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { showToast('Senhas nao conferem'); return; }
    if (newPassword.length < 6) { showToast('Senha deve ter pelo menos 6 caracteres'); return; }
    setChangingPassword(true);
    try {
      await api.post('/team/me/change-password', { currentPassword, newPassword });
      showToast('Senha alterada com sucesso!');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao alterar senha');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSaveSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas) { showToast('Erro: canvas nao encontrado'); return; }
    if (!user) { showToast('Erro: sessao expirada, faca login novamente'); return; }
    setSavingSignature(true);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      await api.post(`/doctors/${user.id}/signature`, { signatureImage: base64 });
      setHasSignature(true);
      showToast('Assinatura salva!');
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao salvar assinatura');
    } finally {
      setSavingSignature(false);
    }
  };

  const startSetup = async () => {
    try {
      const { data } = await api.post('/auth/2fa/setup');
      setSetupData(data.data);
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao iniciar 2FA');
    }
  };

  const confirmEnable = async () => {
    setEnabling(true);
    try {
      await api.post('/auth/2fa/enable', { code: enableCode });
      showToast('2FA ativado!');
      setSetupData(null);
      setEnableCode('');
      void loadSecurity();
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao ativar 2FA');
    } finally {
      setEnabling(false);
    }
  };

  const disable2FA = async () => {
    if (!confirm('Desativar a autenticação em dois fatores?')) return;
    setDisabling(true);
    try {
      await api.post('/auth/2fa/disable', { password: disablePwd });
      setDisablePwd('');
      showToast('2FA desativado');
      void loadSecurity();
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao desativar');
    } finally {
      setDisabling(false);
    }
  };

  const removeDevice = async (id: string) => {
    try {
      await api.delete(`/auth/2fa/devices/${id}`);
      void loadSecurity();
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao remover');
    }
  };

  const removeAllDevices = async () => {
    if (!confirm('Remover todos os dispositivos confiáveis?')) return;
    try {
      for (const d of devices) {
        await api.delete(`/auth/2fa/devices/${d.id}`);
      }
      void loadSecurity();
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao remover dispositivos');
    }
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]';

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'perfil', label: 'Perfil' },
    { key: 'senha', label: 'Senha' },
    { key: 'assinatura', label: 'Assinatura' },
    { key: 'seguranca', label: 'Segurança' },
  ];

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <CheckCircle size={16} /> {toast}
        </div>
      )}

      <h1 className="text-2xl font-bold text-slate-800">Meu Perfil</h1>

      <div className="border-b border-slate-200 flex gap-1 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === t.key ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'perfil' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-[#EFF6FF] rounded-full flex items-center justify-center">
              <User size={24} className="text-[#1E3A5F]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">{user?.name}</h2>
              <p className="text-sm text-slate-500">{user?.email}</p>
              <span className="text-xs bg-[#EFF6FF] text-[#1E3A5F] px-2 py-0.5 rounded-full">{user?.role}</span>
            </div>
          </div>

          <div className="space-y-4 max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nome</label>
              <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Telefone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="5571999999999" />
            </div>
            <div className="grid grid-cols-[7fr_3fr] gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Especialidade</label>
                <input value={especialidade} onChange={e => setEspecialidade(e.target.value)} className={inputCls} placeholder="Ex: Oftalmologia" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">RQE</label>
                <input type="number" value={rqe} onChange={e => setRqe(e.target.value)} className={inputCls} placeholder="Número" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de registro</label>
                <select value={tipoRegistro} onChange={e => setTipoRegistro(e.target.value)} className={inputCls}>
                  <option value="">Selecione</option>
                  <option value="CRM">CRM</option>
                  <option value="CRO">CRO</option>
                  <option value="CRF">CRF</option>
                  <option value="COREN">COREN</option>
                  <option value="CRP">CRP</option>
                  <option value="CRN">CRN</option>
                  <option value="CREFITO">CREFITO</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Numero do registro</label>
                <input value={numeroRegistro} onChange={e => setNumeroRegistro(e.target.value)} className={inputCls} placeholder="12345/BA" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Duracao da consulta (min)</label>
                <input type="number" value={duracaoConsulta} onChange={e => setDuracaoConsulta(e.target.value)} className={inputCls} placeholder="30" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Bio / Apresentacao</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} className={inputCls + ' h-16 resize-none'} placeholder="Breve apresentacao profissional..." />
            </div>
            <button onClick={handleSaveProfile} disabled={saving} className="flex items-center justify-center gap-2 btn-pill btn-primary">
              <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Perfil'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'senha' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-xl">
          <div className="flex items-center gap-3 mb-6">
            <Lock size={24} className="text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-800">Alterar Senha</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Senha atual</label>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nova senha</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirmar nova senha</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputCls} />
            </div>
            <button onClick={handleChangePassword} disabled={changingPassword || !currentPassword || !newPassword}
              className="flex items-center justify-center gap-2 btn-pill btn-primary">
              <Lock size={16} /> {changingPassword ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'assinatura' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Pen size={24} className="text-slate-600" />
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Assinatura Digital</h2>
              <p className="text-sm text-slate-500">Desenhe sua assinatura abaixo. Ela sera usada em atestados e prescricoes.</p>
            </div>
          </div>

          <div className="border-2 border-dashed border-slate-300 rounded-lg p-2 bg-white mb-4">
            <canvas
              ref={canvasRef}
              width={600}
              height={200}
              className="w-full cursor-crosshair touch-none"
              style={{ maxHeight: '200px' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
            />
          </div>

          <div className="flex gap-3 flex-wrap">
            <button onClick={clearCanvas} className="btn-pill btn-destructive flex items-center gap-2">
              <Trash2 size={16} /> Limpar
            </button>
            <button onClick={handleSaveSignature} disabled={savingSignature}
              className="btn-pill btn-primary flex items-center gap-2">
              <Save size={16} /> {savingSignature ? 'Salvando...' : 'Salvar Assinatura'}
            </button>
            {hasSignature && (
              <span className="flex items-center gap-1 text-sm text-emerald-600">
                <CheckCircle size={16} /> Assinatura salva
              </span>
            )}
          </div>
        </div>
      )}

      {activeTab === 'seguranca' && (
        <div className="space-y-6 max-w-2xl">
          {secLoading ? (
            <div className="text-slate-500">Carregando...</div>
          ) : (
            <>
              <section className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  {twoFAEnabled
                    ? <ShieldCheck className="text-green-600" size={24} />
                    : <ShieldOff className="text-slate-400" size={24} />}
                  <div className="flex-1">
                    <h2 className="font-semibold text-slate-800">Autenticação em duas etapas (2FA)</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${twoFAEnabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                        {twoFAEnabled ? '2FA Ativo' : '2FA Inativo'}
                      </span>
                    </p>
                  </div>
                </div>

                {!twoFAEnabled && !setupData && (
                  <button onClick={startSetup} className="btn-pill btn-primary">
                    Ativar autenticação em dois fatores
                  </button>
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
                      className="w-48 px-3 py-2 border border-slate-300 rounded-lg text-center tracking-widest"
                    />
                    <div className="flex gap-2">
                      <button onClick={confirmEnable} disabled={enabling || enableCode.length !== 6} className="btn-pill btn-primary">
                        {enabling ? 'Ativando...' : 'Confirmar e ativar'}
                      </button>
                      <button onClick={() => setSetupData(null)} className="btn-pill btn-secondary">Cancelar</button>
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
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg"
                      />
                      <button onClick={disable2FA} disabled={disabling || !disablePwd} className="btn-pill btn-destructive">
                        {disabling ? '...' : 'Desativar 2FA'}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-slate-800">Dispositivos confiáveis</h2>
                    <p className="text-xs text-slate-500">Dispositivos que não precisam de verificação em cada login.</p>
                  </div>
                  {devices.length > 0 && (
                    <button onClick={removeAllDevices} className="text-xs text-red-600 hover:underline">
                      Remover todos os dispositivos
                    </button>
                  )}
                </div>

                {devices.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum dispositivo confiável registrado.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {devices.map((d) => (
                      <li key={d.id} className="py-3 flex items-center gap-3">
                        <Smartphone size={18} className="text-slate-400" />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-800">{d.deviceName || 'Dispositivo desconhecido'}</div>
                          <div className="text-xs text-slate-500">Adicionado em {new Date(d.createdAt).toLocaleString('pt-BR')}</div>
                        </div>
                        <button onClick={() => removeDevice(d.id)} className="text-red-600 hover:bg-red-50 px-3 py-1 rounded text-sm">
                          Remover
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
