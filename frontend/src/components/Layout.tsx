import { useState } from 'react';
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import { LayoutDashboard, Users, Package, MessageSquare, Calendar, LogOut, Menu, X, BookOpen, DollarSign, UsersRound, UserCircle } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../hooks/useAuth';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/estoque', label: 'Estoque', icon: Package },
  { to: '/mensagens', label: 'Mensagens', icon: MessageSquare },
  { to: '/agendamentos', label: 'Agendamentos', icon: Calendar },
  { to: '/scripts', label: 'Scripts', icon: BookOpen },
  { to: '/financeiro', label: 'Financeiro', icon: DollarSign },
  { to: '/equipe', label: 'Equipe', icon: UsersRound },
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
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-lg text-white" style={{ cursor: 'pointer' }}>
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
          'fixed md:static inset-y-0 left-0 w-64',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
        style={{ backgroundColor: '#1E3A5F' }}
      >
        {/* Logo */}
        <div className="h-14 md:h-16 flex items-center px-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <img src="/anpexia-logo.svg" alt="Anpexia" className="h-7" style={{ filter: 'brightness(0) invert(1)' }} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
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
        <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {user && (
            <Link
              to="/perfil"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2 mb-2 rounded-lg transition-colors"
              style={{ color: '#BFDBFE' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <UserCircle size={20} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: '#FFFFFF' }}>{user.name}</p>
                <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>{user.tenant?.name || 'Admin'}</p>
              </div>
            </Link>
          )}
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
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pt-14 md:pt-0" style={{ backgroundColor: '#F8FAFC' }}>
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
