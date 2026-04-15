import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { PasswordStrength } from '../components/PasswordStrength';

export function CriarSenhaPage() {
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

  if (loadingValidate) return <div className="min-h-screen flex items-center justify-center text-slate-500">Validando convite...</div>;

  if (validationError) {
    return (
      <div className="min-h-screen bg-[#EFF6FF] flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-8 max-w-sm text-center">
          <h1 className="text-xl font-bold text-red-700 mb-2">Convite inválido</h1>
          <p className="text-slate-600 text-sm">{validationError}</p>
          <button onClick={() => navigate('/login')} className="mt-4 btn-pill btn-primary">Ir para login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EFF6FF] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/anpexia-logo.svg" alt="Anpexia" className="h-10 mx-auto mb-4" />
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-[#BFDBFE] p-6 space-y-4">
          <h1 className="text-lg font-bold text-slate-800">Olá {invite?.name}!</h1>
          <p className="text-sm text-slate-600">Defina sua senha para acessar o sistema ({invite?.email}).</p>

          {success ? (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
              Senha definida com sucesso! Redirecionando para o login...
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nova senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-[#BFDBFE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  required
                />
                <PasswordStrength password={password} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Confirmar senha</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-3 py-2 border border-[#BFDBFE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  required
                />
              </div>

              <button type="submit" disabled={submitting} className="w-full btn-pill btn-primary justify-center">
                {submitting ? 'Definindo...' : 'Definir senha'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
