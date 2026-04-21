import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Building2, ArrowLeft } from 'lucide-react';

interface TenantOption {
  id: string;
  name: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Proprietario',
  MANAGER: 'Gerente',
  DOCTOR: 'Medico',
  RECEPTIONIST: 'Recepcionista',
  FINANCIAL: 'Financeiro',
  EMPLOYEE: 'Funcionario',
};

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [showTenantSelector, setShowTenantSelector] = useState(false);
  const { login, loading, error } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await login(email, password);
      if (result.needsTenantSelection) {
        setTenants(result.tenants);
        setShowTenantSelector(true);
        return;
      }
      if (result.needs2FA) {
        navigate('/verificar-2fa');
      } else {
        navigate('/dashboard');
      }
    } catch {
      // error state is handled by useAuth
    }
  };

  const handleTenantSelect = async (tenantId: string) => {
    try {
      const result = await login(email, password, tenantId);
      if (result.needs2FA) {
        navigate('/verificar-2fa');
      } else {
        navigate('/dashboard');
      }
    } catch {
      // error state is handled by useAuth
    }
  };

  const handleBack = () => {
    setShowTenantSelector(false);
    setTenants([]);
  };

  return (
    <div className="min-h-screen bg-[#EFF6FF] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/anpexia-logo.svg" alt="Anpexia" className="h-10 mx-auto mb-4" />
          <p className="text-slate-500 mt-2">
            {showTenantSelector ? 'Selecione a clinica' : 'Entre na sua conta'}
          </p>
        </div>

        {showTenantSelector ? (
          <div className="bg-white rounded-xl shadow-sm border border-[#BFDBFE] p-6 space-y-4">
            <p className="text-sm text-slate-600 text-center">
              Seu e-mail esta cadastrado em mais de uma clinica. Escolha onde deseja entrar:
            </p>

            <div className="space-y-3">
              {tenants.map((tenant) => (
                <button
                  key={tenant.id}
                  onClick={() => handleTenantSelect(tenant.id)}
                  disabled={loading}
                  className="w-full flex items-center gap-3 p-4 border border-[#BFDBFE] rounded-lg hover:bg-blue-50 hover:border-[#2563EB] transition-colors text-left disabled:opacity-50"
                >
                  <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Building2 size={20} className="text-[#2563EB]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{tenant.name}</p>
                    <p className="text-xs text-slate-500">{ROLE_LABELS[tenant.role] || tenant.role}</p>
                  </div>
                </button>
              ))}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              onClick={handleBack}
              className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-700 mt-2"
            >
              <ArrowLeft size={16} />
              Voltar ao login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-[#BFDBFE] p-6 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-[#BFDBFE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                placeholder="seu@email.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-[#BFDBFE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-pill btn-primary justify-center"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
