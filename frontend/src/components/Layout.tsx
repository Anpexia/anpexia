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
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 z-40 flex items-center justify-between px-4 h-14">
        <h1 className="text-lg font-bold text-slate-800 tracking-tight">Anpexia</h1>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        'bg-white border-r border-slate-200 flex flex-col z-50 transition-transform duration-200',
        'fixed md:static inset-y-0 left-0 w-64',
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}>
        {/* Logo */}
        <div className="h-14 md:h-16 flex items-center px-6 border-b border-slate-200">
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Anpexia</h1>
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
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                )
              }
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User info + Logout */}
        <div className="p-3 border-t border-slate-200">
          {user && (
            <Link to="/perfil" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 px-3 py-2 mb-2 rounded-lg hover:bg-slate-50 transition-colors group">
              <UserCircle size={20} className="text-slate-400 group-hover:text-indigo-500" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{user.name}</p>
                <p className="text-xs text-slate-500 truncate">{user.tenant?.name || 'Admin'}</p>
              </div>
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors w-full"
          >
            <LogOut size={20} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pt-14 md:pt-0 bg-slate-50">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
