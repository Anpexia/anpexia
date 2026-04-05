import { useState, useEffect, useRef, useCallback } from 'react';
import { User, Pen, Save, Trash2, Lock, CheckCircle } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

export function ProfilePage() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  // Professional fields
  const [especialidade, setEspecialidade] = useState('');
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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone('');
      // fetch full profile
      api.get('/team/me/profile').then(({ data }) => {
        const p = data.data;
        if (p) {
          if (p.phone) setPhone(p.phone);
          if (p.especialidade) setEspecialidade(p.especialidade);
          if (p.tipoRegistro) setTipoRegistro(p.tipoRegistro);
          if (p.numeroRegistro) setNumeroRegistro(p.numeroRegistro);
          if (p.duracaoConsulta) setDuracaoConsulta(String(p.duracaoConsulta));
          if (p.bio) setBio(p.bio);
        }
      }).catch(() => {});
      // fetch signature
      api.get(`/doctors/${user.id}/signature`).then(({ data }) => {
        if (data.data?.signatureImage) {
          loadSignatureToCanvas(data.data.signatureImage);
          setHasSignature(true);
        }
        setSignatureLoaded(true);
      }).catch(() => setSignatureLoaded(true));
    }
  }, [user]);

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

  // Canvas drawing
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
      if (tipoRegistro) payload.tipoRegistro = tipoRegistro;
      if (numeroRegistro) payload.numeroRegistro = numeroRegistro;
      if (duracaoConsulta) payload.duracaoConsulta = parseInt(duracaoConsulta, 10) || undefined;
      if (bio) payload.bio = bio;

      await api.put('/team/me/profile', payload);
      // Update sessionStorage
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
      // Convert canvas to base64 (without data:image/png;base64, prefix)
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

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]';

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <CheckCircle size={16} /> {toast}
        </div>
      )}

      <h1 className="text-2xl font-bold text-slate-800">Meu Perfil</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Info */}
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

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nome</label>
              <input value={name} onChange={e => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Telefone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="5571999999999" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Especialidade</label>
              <input value={especialidade} onChange={e => setEspecialidade(e.target.value)} className={inputCls} placeholder="Ex: Oftalmologia" />
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
            <button onClick={handleSaveProfile} disabled={saving} className="w-full flex items-center justify-center gap-2 btn-pill btn-primary">
              <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Perfil'}
            </button>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
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
              className="w-full flex items-center justify-center gap-2 btn-pill btn-primary">
              <Lock size={16} /> {changingPassword ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </div>
        </div>
      </div>

      {/* Digital Signature */}
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

        <div className="flex gap-3">
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
    </div>
  );
}
