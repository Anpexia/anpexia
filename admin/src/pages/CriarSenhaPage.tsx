import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';

function PasswordStrength({ password }: { password: string }) {
  const hasLen = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);

  let level: 0 | 1 | 2 | 3 = 0;
  let label = 'Muito fraca';
  let color = '#4b5563';

  if (!password) {
    level = 0;
  } else if (!hasLen) {
    level = 1; label = 'Fraca'; color = '#ef4444';
  } else if (hasLen && hasUpper && hasDigit) {
    level = 3; label = 'Forte'; color = '#16a34a';
  } else {
    level = 2; label = 'Média'; color = '#f59e0b';
  }

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[1, 2, 3].map((seg) => (
          <div
            key={seg}
            className="h-1.5 flex-1 rounded-full"
            style={{ backgroundColor: seg <= level ? color : '#374151' }}
          />
        ))}
      </div>
      {password && (
        <div className="text-xs mt-1" style={{ color }}>
          Senha: <span className="font-medium">{label}</span>
        </div>
      )}
      <ul className="text-xs text-white/50 mt-1 space-y-0.5">
        <li style={{ color: hasLen ? '#16a34a' : undefined }}>• Pelo menos 8 caracteres</li>
        <li style={{ color: hasUpper ? '#16a34a' : undefined }}>• Pelo menos 1 letra maiúscula</li>
        <li style={{ color: hasDigit ? '#16a34a' : undefined }}>• Pelo menos 1 número</li>
      </ul>
    </div>
  );
}

export default function CriarSenhaPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [loadingValidate, setLoadingValidate] = useState(true);
  const [invite, setInvite] = useState<{ name: string; email: string } | null>(null);
  const [validationError, setValidationError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) { setValidationError('Token ausente'); setLoadingValidate(false); return; }
    api.get(`/auth/validate-invite?token=${encodeURIComponent(token)}`)
      .then(({ data }) => setInvite(data.data))
      .catch((err) => setValidationError(err.response?.data?.error?.message || 'Convite inválido ou expirado'))
      .finally(() => setLoadingValidate(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('As senhas não coincidem'); return; }
    setSubmitting(true);
    try {
      await api.post('/auth/define-password', { token, password, confirmPassword: confirm });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Erro ao definir senha');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingValidate) {
    return <div className="min-h-screen bg-[#152C49] flex items-center justify-center text-white/50">Validando convite...</div>;
  }

  if (validationError) {
    return (
      <div className="min-h-screen bg-[#152C49] flex items-center justify-center px-4">
        <div className="bg-[#1E3A5F] rounded-xl border border-red-800 p-8 max-w-sm text-center">
          <h1 className="text-xl font-bold text-red-400 mb-2">Convite inválido</h1>
          <p className="text-white/60 text-sm">{validationError}</p>
          <button onClick={() => navigate('/login')} className="mt-4 px-6 py-2 bg-[#2563EB] text-white rounded-full text-sm font-medium hover:bg-[#1d4ed8]">
            Ir para login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#152C49] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/anpexia-logo-white.svg" alt="Anpexia" className="h-10 mx-auto mb-3" />
          <span className="text-xs bg-[#2563EB] text-white px-2 py-0.5 rounded mt-2 inline-block">Admin</span>
        </div>
        <div className="bg-[#1E3A5F] rounded-xl border border-white/10 p-6 space-y-4">
          <h1 className="text-lg font-bold text-white">Olá, {invite?.name}!</h1>
          <p className="text-sm text-white/70">Defina sua senha de acesso ao painel admin ({invite?.email}).</p>

          {success ? (
            <div className="bg-green-900/40 border border-green-800 text-green-300 text-sm px-4 py-3 rounded-lg">
              Senha definida com sucesso! Redirecionando para o login...
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error && <div className="bg-red-900/50 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-lg">{error}</div>}

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Nova senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-3 bg-white/10 border border-white/20 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB] placeholder-white/30"
                  required
                />
                <PasswordStrength password={password} />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Confirmar senha</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-3 py-3 bg-white/10 border border-white/20 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#2563EB] placeholder-white/30"
                  required
                />
              </div>

              <button type="submit" disabled={submitting} className="w-full py-3 bg-[#2563EB] text-white rounded-full text-sm font-medium hover:bg-[#1d4ed8] disabled:opacity-50">
                {submitting ? 'Definindo...' : 'Definir senha e acessar'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
