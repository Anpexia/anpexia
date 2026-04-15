import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { getDeviceId, getDeviceName } from '../utils/device';

interface Pending {
  userId: string;
  email: string;
  twoFactorEnabled: boolean;
}

export function Verify2FAPage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<'email' | 'totp'>('email');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendMsg, setResendMsg] = useState('');

  useEffect(() => {
    const raw = sessionStorage.getItem('pending2FA');
    if (!raw) { navigate('/login'); return; }
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
      sessionStorage.setItem('accessToken', data.data.accessToken);
      sessionStorage.setItem('user', JSON.stringify(data.data.user));
      sessionStorage.removeItem('pending2FA');
      navigate('/dashboard');
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
    <div className="min-h-screen bg-[#EFF6FF] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/anpexia-logo.svg" alt="Anpexia" className="h-10 mx-auto mb-4" />
          <p className="text-slate-500 mt-2">Verificação em duas etapas</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-xl shadow-sm border border-[#BFDBFE] p-6 space-y-4">
          <p className="text-sm text-slate-700">
            {method === 'email'
              ? <>Enviamos um código de 6 dígitos para <strong>{pending.email}</strong>.</>
              : 'Digite o código do seu aplicativo autenticador (6 dígitos).'}
          </p>

          {pending.twoFactorEnabled && (
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setMethod('totp')}
                className={`px-3 py-1.5 rounded-full border ${method === 'totp' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-300'}`}
              >App autenticador</button>
              <button
                type="button"
                onClick={() => setMethod('email')}
                className={`px-3 py-1.5 rounded-full border ${method === 'email' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-300'}`}
              >Email</button>
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
          {resendMsg && <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">{resendMsg}</div>}

          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-full px-3 py-3 border border-[#BFDBFE] rounded-lg text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            placeholder="000000"
            required
          />

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={rememberDevice} onChange={(e) => setRememberDevice(e.target.checked)} />
            Confiar neste dispositivo
          </label>

          <button type="submit" disabled={loading || code.length !== 6} className="w-full btn-pill btn-primary justify-center">
            {loading ? 'Verificando...' : 'Verificar'}
          </button>

          {method === 'email' && (
            <button type="button" onClick={resend} className="w-full text-sm text-blue-600 hover:underline">
              Reenviar código
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
