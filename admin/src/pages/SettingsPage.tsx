import { useEffect, useState } from 'react';
import { Shield, Smartphone, Mail, X, Trash2 } from 'lucide-react';
import api from '../services/api';

interface TrustedDevice {
  id: string;
  deviceName?: string | null;
  createdAt: string;
}

export default function SettingsPage() {
  const [twoFAEnabled, setTwoFAEnabled] = useState<boolean>(false);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [showGoogle, setShowGoogle] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const loadDevices = async () => {
    try {
      const { data } = await api.get('/auth/2fa/devices');
      setDevices(data.data.items || data.data.devices || data.data || []);
    } catch {
      setDevices([]);
    }
  };

  useEffect(() => {
    const stored = sessionStorage.getItem('adminUser');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        setTwoFAEnabled(!!u.twoFactorEnabled);
      } catch {}
    }
    loadDevices();
  }, []);

  const removeDevice = async (id: string) => {
    if (!confirm('Remover este dispositivo confiável?')) return;
    try {
      await api.delete(`/auth/2fa/devices/${id}`);
      loadDevices();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erro ao remover dispositivo');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Configurações</h2>

      {/* 1. Segurança - 2FA */}
      <section className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={20} className="text-[#1E3A5F]" />
          <h3 className="text-lg font-semibold text-gray-900">Segurança — Autenticação 2FA</h3>
        </div>

        <div className="flex items-center justify-between py-3 border-b border-gray-100">
          <div>
            <p className="font-medium text-gray-900">Autenticação em duas etapas</p>
            <span
              className={`inline-flex mt-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                twoFAEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {twoFAEnabled ? 'Ativada' : 'Desativada — proteja sua conta ativando o 2FA'}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowGoogle(true)}
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <Smartphone size={16} /> Google Auth
            </button>
            <button
              onClick={() => setShowEmail(true)}
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              <Mail size={16} /> E-mail
            </button>
          </div>
        </div>

        <div className="pt-4">
          <p className="text-sm font-medium text-gray-900 mb-2">
            Dispositivos confiáveis ({devices.length})
          </p>
          {devices.length === 0 ? (
            <p className="text-sm text-gray-500 italic">Nenhum dispositivo confiável registrado.</p>
          ) : (
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-sm text-gray-900">{d.deviceName || 'Dispositivo'}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(d.createdAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <button
                    onClick={() => removeDevice(d.id)}
                    className="p-1.5 rounded hover:bg-red-50 text-red-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 2. Planos e Preços */}
      <section className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Planos e Preços</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { name: 'Starter', price: 'R$ 1.200' },
            { name: 'Pro', price: 'R$ 2.000' },
            { name: 'Business', price: 'R$ 3.000' },
          ].map((p) => (
            <div key={p.name} className="border border-gray-200 rounded-lg p-5 text-center">
              <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">{p.name}</p>
              <p className="mt-2">
                <span className="text-3xl font-bold" style={{ color: '#1E3A5F' }}>
                  {p.price}
                </span>
                <span className="text-sm text-gray-500">/mês</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Email */}
      <section className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Configurações de Email</h3>
        <InfoRow label="Provedor" value="Resend" />
        <InfoRow label="Remetente" value="noreply@anpexia.com.br" />
        <InfoRow
          label="Status"
          value={
            <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
              Operacional
            </span>
          }
        />
      </section>

      {/* 4. Sistema */}
      <section className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Sistema</h3>
        <InfoRow label="Versão" value="1.0.0" />
        <InfoRow label="Banco" value="Neon PostgreSQL (sa-east-1)" />
        <InfoRow label="Hospedagem" value="Railway" />
        <InfoRow label="WhatsApp API" value="Evolution API" />
        <InfoRow label="IA Chatbot" value="Claude Sonnet (Anthropic)" />
      </section>

      {showGoogle && <GoogleAuthModal onClose={() => setShowGoogle(false)} onEnabled={() => { setTwoFAEnabled(true); setShowGoogle(false); }} />}
      {showEmail && <EmailAuthModal onClose={() => setShowEmail(false)} onEnabled={() => { setTwoFAEnabled(true); setShowEmail(false); }} />}
    </div>
  );
}

function InfoRow({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-3 ${last ? '' : 'border-b border-gray-100'}`}>
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value}</span>
    </div>
  );
}

function GoogleAuthModal({ onClose, onEnabled }: { onClose: () => void; onEnabled: () => void }) {
  const [qr, setQr] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.post('/auth/2fa/setup');
        setQr(data.data.qrCode || data.data.qr || '');
        setSecret(data.data.secret || '');
      } catch (err: any) {
        setError(err.response?.data?.error?.message || 'Erro ao iniciar 2FA');
      }
    })();
  }, []);

  const enable = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/2fa/enable', { code });
      onEnabled();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Código inválido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-lg font-semibold">Ativar Google Authenticator</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <form onSubmit={enable} className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-600">Escaneie o QR code com seu app autenticador e digite o código gerado:</p>
          {qr && <img src={qr} alt="QR 2FA" className="mx-auto border rounded" />}
          {secret && <p className="text-xs text-center font-mono text-gray-500 break-all">{secret}</p>}
          <input
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Código de 6 dígitos"
            className="w-full border rounded-lg px-3 py-2 text-sm text-center tracking-widest"
            maxLength={6}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300">Cancelar</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm rounded-lg bg-[#1E3A5F] text-white disabled:opacity-60">
              {loading ? 'Ativando...' : 'Ativar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmailAuthModal({ onClose, onEnabled }: { onClose: () => void; onEnabled: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const enable = async () => {
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/2fa/enable', { method: 'email' });
      onEnabled();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Erro ao ativar 2FA por email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-lg font-semibold">Ativar 2FA por E-mail</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            Ao fazer login, enviaremos um código de verificação para o seu e-mail.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300">Cancelar</button>
            <button onClick={enable} disabled={loading} className="px-4 py-2 text-sm rounded-lg bg-[#1E3A5F] text-white disabled:opacity-60">
              {loading ? 'Ativando...' : 'Ativar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
