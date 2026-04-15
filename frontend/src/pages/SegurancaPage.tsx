import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, Smartphone, Trash2 } from 'lucide-react';
import api from '../services/api';

interface Device {
  id: string;
  deviceId: string;
  deviceName: string | null;
  createdAt: string;
}

export function SegurancaPage() {
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  // Setup flow
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [enableCode, setEnableCode] = useState('');
  const [enabling, setEnabling] = useState(false);

  // Disable
  const [disablePwd, setDisablePwd] = useState('');
  const [disabling, setDisabling] = useState(false);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  const reload = async () => {
    try {
      const { data: me } = await api.get('/auth/me');
      setTwoFAEnabled(!!me.data.twoFactorEnabled);
      const { data: dev } = await api.get('/auth/2fa/devices');
      setDevices(dev.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const startSetup = async () => {
    const { data } = await api.post('/auth/2fa/setup');
    setSetupData(data.data);
  };

  const confirmEnable = async () => {
    setEnabling(true);
    try {
      await api.post('/auth/2fa/enable', { code: enableCode });
      showToast('2FA ativado!');
      setSetupData(null);
      setEnableCode('');
      void reload();
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao ativar 2FA');
    } finally {
      setEnabling(false);
    }
  };

  const disable2FA = async () => {
    setDisabling(true);
    try {
      await api.post('/auth/2fa/disable', { password: disablePwd });
      setDisablePwd('');
      showToast('2FA desativado');
      void reload();
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao desativar');
    } finally {
      setDisabling(false);
    }
  };

  const removeDevice = async (id: string) => {
    await api.delete(`/auth/2fa/devices/${id}`);
    void reload();
  };

  const removeAllDevices = async () => {
    if (!confirm('Remover todos os dispositivos confiáveis? Você precisará verificar cada um novamente.')) return;
    await api.delete('/auth/2fa/devices');
    void reload();
  };

  if (loading) return <div className="text-slate-500">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-800">Segurança</h1>

      {toast && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm px-4 py-3 rounded-lg">{toast}</div>
      )}

      {/* 2FA */}
      <section className="bg-white rounded-xl shadow-sm border border-[#BFDBFE] p-6">
        <div className="flex items-center gap-3 mb-4">
          {twoFAEnabled ? <ShieldCheck className="text-green-600" size={24} /> : <ShieldOff className="text-slate-400" size={24} />}
          <div>
            <h2 className="font-semibold">Autenticação em duas etapas (2FA)</h2>
            <p className="text-xs text-slate-500">Status: <span className={twoFAEnabled ? 'text-green-600' : 'text-slate-500'}>{twoFAEnabled ? 'Ativa' : 'Desativada'}</span></p>
          </div>
        </div>

        {!twoFAEnabled && !setupData && (
          <button onClick={startSetup} className="btn-pill btn-primary">Ativar 2FA</button>
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
              className="w-48 px-3 py-2 border border-[#BFDBFE] rounded-lg text-center tracking-widest"
            />
            <div className="flex gap-2">
              <button onClick={confirmEnable} disabled={enabling || enableCode.length !== 6} className="btn-pill btn-primary">
                {enabling ? 'Ativando...' : 'Confirmar'}
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
                className="flex-1 px-3 py-2 border border-[#BFDBFE] rounded-lg"
              />
              <button onClick={disable2FA} disabled={disabling || !disablePwd} className="btn-pill btn-danger">
                {disabling ? '...' : 'Desativar 2FA'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Devices */}
      <section className="bg-white rounded-xl shadow-sm border border-[#BFDBFE] p-6">
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
    </div>
  );
}
