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
      <div className="md:hidden fixed top-0 left-0 right-0 bg-[#1E3A5F] z-40 flex items-center justify-between px-4 h-14">
        <img src="/anpexia-logo-white.svg" alt="Anpexia" className="h-7" />
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-lg hover:bg-white/10 text-white">
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        'bg-[#1E3A5F] flex flex-col z-50 transition-transform duration-200',
        'fixed md:static inset-y-0 left-0 w-64',
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}>
        {/* Logo */}
        <div className="h-14 md:h-16 flex items-center px-6 border-b border-white/10">
          <img src="/anpexia-logo-white.svg" alt="Anpexia" className="h-7" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-1',
                  isActive
                    ? 'bg-white/15 text-white border-l-3 border-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white',
                )
              }
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User info + Logout */}
        <div className="p-3 border-t border-white/10">
          {user && (
            <Link to="/perfil" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 mb-2 rounded-lg hover:bg-white/10 transition-colors group">
              <UserCircle size={20} className="text-white/60 group-hover:text-white" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{user.name}</p>
                <p className="text-xs text-white/50 truncate">{user.tenant?.name || 'Admin'}</p>
              </div>
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors w-full"
          >
            <LogOut size={20} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pt-14 md:pt-0 bg-[#F8FAFC]">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
