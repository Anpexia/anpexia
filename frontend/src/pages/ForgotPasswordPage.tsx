import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Erro ao enviar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#EFF6FF] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/anpexia-logo.svg" alt="Anpexia" className="h-10 mx-auto mb-4" />
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-[#BFDBFE] p-6 space-y-4">
          <h1 className="text-lg font-bold text-slate-800">Esqueceu sua senha?</h1>
          <p className="text-sm text-slate-600">Informe seu e-mail cadastrado e enviaremos um link para redefinir sua senha.</p>

          {sent ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
                Se este e-mail estiver cadastrado, voce recebera um link para redefinir a senha. Verifique sua caixa de entrada e spam.
              </div>
              <button onClick={() => navigate('/login')} className="w-full btn-pill btn-primary justify-center">
                Voltar ao login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-[#BFDBFE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  placeholder="seu@email.com"
                  required
                />
              </div>

              <button type="submit" disabled={submitting} className="w-full btn-pill btn-primary justify-center">
                {submitting ? 'Enviando...' : 'Enviar link de recuperacao'}
              </button>

              <button type="button" onClick={() => navigate('/login')} className="w-full text-sm text-slate-500 hover:text-slate-700">
                Voltar ao login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
