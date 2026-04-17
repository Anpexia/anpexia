import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { getDeviceId, getDeviceName } from '../utils/device';

interface Pending {
  userId: string;
  email: string;
  twoFactorEnabled: boolean;
}

const ADMIN_ALLOWED_ROLES = ['SUPER_ADMIN', 'ADMIN', 'GERENTE', 'VENDEDOR', 'OWNER'];

// An admin-panel user is any user whose role is in the list above, OR any user
// with tenantId === null (admin users created via /usuarios have no tenant).
function isAdminPanelUser(user: { role: string; tenantId?: string | null; tenant?: { id: string } | null }): boolean {
  if (ADMIN_ALLOWED_ROLES.includes(user.role)) return true;
  const hasTenant = !!(user.tenantId || user.tenant?.id);
  return !hasTenant;
}

export default function Verify2FAPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<'email' | 'totp'>('email');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendMsg, setResendMsg] = useState('');

  useEffect(() => {
    const raw = sessionStorage.getItem('admin_pending2FA');
    if (!raw) {
      navigate('/login');
      return;
    }
    const p = JSON.parse(raw) as Pending;
    setPending(p);
    setMethod(p.twoFactorEnabled ? 'totp' : 'email');
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/2fa/verify', {
        userId: pending.userId,
        code,
        method,
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
        rememberDevice,
      });
      const user = data.data.user;
      if (!isAdminPanelUser(user)) {
        setError('Acesso restrito a administradores');
        setLoading(false);
        return;
      }
      sessionStorage.setItem('adminToken', data.data.accessToken);
      sessionStorage.setItem('adminUser', JSON.stringify(user));
      sessionStorage.removeItem('admin_pending2FA');
      sessionStorage.removeItem('admin_pending_userId');
      navigate('/overview');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Código inválido');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!pending) return;
    setResendMsg('');
    try {
      await api.post('/auth/2fa/resend', { userId: pending.userId });
      setResendMsg('Código reenviado! Verifique seu email.');
    } catch {
      setResendMsg('Erro ao reenviar código.');
    }
  };

  if (!pending) return null;

  return (
    <div className="min-h-screen bg-[#152C49] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/anpexia-logo-white.svg" alt="Anpexia" className="h-10 mx-auto mb-3" />
          <span className="text-xs bg-[#2563EB] text-white px-2 py-0.5 rounded mt-2 inline-block">Admin</span>
          <p className="text-white/60 mt-3">Verificação em duas etapas</p>
        </div>

        <form onSubmit={submit} className="bg-[#1E3A5F] rounded-xl border border-white/10 p-6 space-y-4">
          <p className="text-sm text-white/80">
            {method === 'email'
              ? <>Enviamos um código de 6 dígitos para <strong>{pending.email}</strong>.</>
              : 'Digite o código do seu aplicativo autenticador (6 dígitos).'}
          </p>

          {pending.twoFactorEnabled && (
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setMethod('totp')}
                className={`px-3 py-1.5 rounded-full border ${method === 'totp' ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-white/10 border-white/20 text-white/80'}`}
              >App autenticador</button>
              <button
                type="button"
                onClick={() => setMethod('email')}
                className={`px-3 py-1.5 rounded-full border ${method === 'email' ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-white/10 border-white/20 text-white/80'}`}
              >Email</button>
            </div>
          )}

          {error && <div className="bg-red-900/50 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-lg">{error}</div>}
          {resendMsg && <div className="bg-green-900/40 border border-green-800 text-green-300 text-sm px-4 py-3 rounded-lg">{resendMsg}</div>}

          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-full px-3 py-3 bg-white/10 border border-white/20 rounded-lg text-center text-2xl tracking-widest text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB] placeholder-white/30"
            placeholder="000000"
            required
          />

          <label className="flex items-center gap-2 text-sm text-white/80">
            <input type="checkbox" checked={rememberDevice} onChange={(e) => setRememberDevice(e.target.checked)} />
            Confiar neste dispositivo
          </label>

          <button type="submit" disabled={loading || code.length !== 6} className="w-full btn-pill justify-center" style={{ backgroundColor: '#2563EB', color: '#fff', borderRadius: 999 }}>
            {loading ? 'Verificando...' : 'Verificar'}
          </button>

          {method === 'email' && (
            <button type="button" onClick={resend} className="w-full text-sm text-blue-300 hover:underline">
              Reenviar código por email
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
