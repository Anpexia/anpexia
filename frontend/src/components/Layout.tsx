import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Package, MessageSquare, Calendar, LogOut, Menu, X, BookOpen, DollarSign, UsersRound, PenLine, UserCircle, Shield } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../hooks/useAuth';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/clientes', label: 'Clientes', icon: Users },
  { path: '/estoque', label: 'Estoque', icon: Package },
  { path: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { path: '/mensagens', label: 'Mensagens', icon: MessageSquare },
  { path: '/agendamentos', label: 'Agendamentos', icon: Calendar },
  { path: '/scripts', label: 'Scripts', icon: BookOpen },
  { path: '/convenios', label: 'Convenios', icon: Shield },
  { path: '/assinatura', label: 'Assinatura', icon: PenLine },
  { path: '/equipe', label: 'Equipe', icon: UsersRound },
  { path: '/perfil', label: 'Meu Perfil', icon: UserCircle },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex">
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
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
