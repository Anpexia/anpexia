import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { LayoutDashboard, Users, Package, MessageSquare, Calendar, LogOut, Menu, X, BookOpen, DollarSign, UsersRound, PenLine, UserCircle, Settings } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../hooks/useAuth';
import { useInactivityLogout } from '../hooks/useInactivityLogout';

const allNavItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/clientes', label: 'Clientes', icon: Users },
  { path: '/estoque', label: 'Estoque', icon: Package },
  { path: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { path: '/mensagens', label: 'Mensagens', icon: MessageSquare },
  { path: '/agendamentos', label: 'Agendamentos', icon: Calendar },
  { path: '/scripts', label: 'Scripts', icon: BookOpen },
  { path: '/assinatura', label: 'Assinatura', icon: PenLine },
  { path: '/equipe', label: 'Equipe', icon: UsersRound },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
  { path: '/perfil', label: 'Meu Perfil', icon: UserCircle },
];

const roleAllowedPaths: Record<string, string[]> = {
  SUPER_ADMIN: allNavItems.map(i => i.path),
  OWNER: allNavItems.map(i => i.path),
  MANAGER: allNavItems.map(i => i.path),
  DOCTOR: ['/dashboard', '/clientes', '/mensagens', '/agendamentos', '/scripts', '/assinatura', '/equipe', '/perfil'],
  RECEPTIONIST: ['/dashboard', '/clientes', '/mensagens', '/agendamentos', '/scripts', '/perfil'],
  FINANCIAL: ['/dashboard', '/financeiro', '/perfil'],
  EMPLOYEE: ['/dashboard', '/clientes', '/agendamentos', '/perfil'],
};

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { showWarning, dismissWarning } = useInactivityLogout();

  // 2FA banner state
  const [twoFAEnabled, setTwoFAEnabled] = useState<boolean | null>(
    typeof user?.twoFactorEnabled === 'boolean' ? user.twoFactorEnabled : null,
  );
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(
    typeof window !== 'undefined' && localStorage.getItem('anpexia_2fa_banner_dismissed') === 'true',
  );

  useEffect(() => {
    if (!user) return;
    if (typeof user.twoFactorEnabled === 'boolean') {
      setTwoFAEnabled(user.twoFactorEnabled);
      return;
    }
    api.get('/auth/me')
      .then(({ data }) => setTwoFAEnabled(!!data?.data?.twoFactorEnabled))
      .catch(() => setTwoFAEnabled(null));
  }, [user]);

  const showTwoFABanner = !!user && twoFAEnabled === false && !bannerDismissed;

  const dismissTwoFABanner = () => {
    localStorage.setItem('anpexia_2fa_banner_dismissed', 'true');
    setBannerDismissed(true);
  };

  const goActivate2FA = () => {
    navigate('/configuracoes?tab=seguranca');
  };

  const navItems = allNavItems.filter(item => {
    const allowed = roleAllowedPaths[user?.role || 'EMPLOYEE'] || roleAllowedPaths.EMPLOYEE;
    return allowed.includes(item.path);
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex">
      {showWarning && (
        <button
          onClick={dismissWarning}
          className="fixed top-0 left-0 right-0 z-[60] bg-yellow-400 text-yellow-900 text-sm font-medium px-4 py-2 text-center cursor-pointer hover:bg-yellow-300"
        >
          Sua sessão expirará em 5 minutos por inatividade. Clique aqui para continuar.
        </button>
      )}
      {/* Mobile header */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-14"
        style={{ backgroundColor: '#1E3A5F' }}
      >
        <img src="/anpexia-logo.svg" alt="Anpexia" className="h-7" style={{ filter: 'brightness(0) invert(1)' }} />
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-lg text-white">
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'flex flex-col z-50 transition-transform duration-200',
          'fixed inset-y-0 left-0 w-64 h-screen overflow-y-auto',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
        style={{ backgroundColor: '#1E3A5F' }}
      >
        {/* Logo */}
        <div className="h-14 md:h-16 flex items-center px-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <img src="/anpexia-logo.svg" alt="Anpexia" className="h-7" style={{ filter: 'brightness(0) invert(1)' }} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-1"
              style={({ isActive }) => ({
                backgroundColor: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: isActive ? '#FFFFFF' : '#BFDBFE',
                borderLeft: isActive ? '3px solid #FFFFFF' : '3px solid transparent',
              })}
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User info + Logout */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {user && (
            <div className="px-3 pt-3 pb-1 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                {user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <span className="text-sm font-medium text-white truncate">
                {user.role === 'DOCTOR' ? `Dr. ${user.name}` : user.name}
              </span>
            </div>
          )}
          <div className="p-3 pt-1">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full"
              style={{ color: '#BFDBFE' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#FFFFFF'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#BFDBFE'; }}
            >
              <LogOut size={20} />
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="md:ml-64 flex-1 h-screen overflow-y-auto pt-14 md:pt-0" style={{ backgroundColor: '#F8FAFC' }}>
        {showTwoFABanner && (
          <div
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 md:px-8 py-3"
            style={{ backgroundColor: '#1E3A5F', color: '#FFFFFF' }}
          >
            <span className="text-sm">
              Aumente a segurança da sua conta ativando a autenticação em dois fatores.
            </span>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={goActivate2FA}
                className="text-sm font-medium px-3 py-1.5 rounded-md"
                style={{ backgroundColor: '#FFFFFF', color: '#1E3A5F' }}
              >
                Ativar agora
              </button>
              <button
                onClick={dismissTwoFABanner}
                className="text-sm px-3 py-1.5 rounded-md border border-white/30 text-white hover:bg-white/10"
              >
                Agora não
              </button>
            </div>
          </div>
        )}
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
