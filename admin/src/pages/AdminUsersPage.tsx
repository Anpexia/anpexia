import { useEffect, useState, useCallback } from 'react';
import { Plus, X, Pencil, Trash2, Search } from 'lucide-react';
import api from '../services/api';

type Role = 'ADMIN' | 'GERENTE' | 'VENDEDOR';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

const ROLES: Role[] = ['ADMIN', 'GERENTE', 'VENDEDOR'];

const ROLE_STYLES: Record<Role, string> = {
  ADMIN: 'bg-[#1E3A5F] text-white',
  GERENTE: 'bg-purple-600 text-white',
  VENDEDOR: 'bg-green-600 text-white',
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return '-';
  }
}

export default function AdminUsersPage() {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (search.trim()) params.search = search.trim();
      if (roleFilter) params.role = roleFilter;
      const { data } = await api.get('/admin/usuarios', { params });
      setItems(data.data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (u: AdminUser) => { setEditing(u); setModalOpen(true); };

  const handleDelete = async (u: AdminUser) => {
    if (!confirm(`Remover o usuário ${u.name}?`)) return;
    try {
      await api.delete(`/admin/usuarios/${u.id}`);
      load();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erro ao remover usuário');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Usuários do Admin</h2>
        <button
          onClick={openCreate}
          className="bg-[#1E3A5F] hover:bg-[#152A47] text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium"
        >
          <Plus size={18} /> Novo Usuário
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm mb-4 p-4 flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou email..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todas as roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Role</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Criado em</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">Carregando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">Nenhum usuário cadastrado.</td></tr>
            ) : items.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                <td className="px-4 py-3 text-gray-700">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_STYLES[u.role]}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                    {u.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openEdit(u)} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="Editar">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => handleDelete(u)} className="p-1.5 hover:bg-red-50 rounded text-red-600" title="Remover">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <UserModal
          user={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function UserModal({ user, onClose, onSaved }: { user: AdminUser | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!user;
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [role, setRole] = useState<Role>(user?.role || 'VENDEDOR');
  const [isActive, setIsActive] = useState<boolean>(user?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await api.patch(`/admin/usuarios/${user!.id}`, { name, role, isActive });
      } else {
        await api.post('/admin/usuarios', { name, email, role });
      }
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{isEdit ? 'Editar Usuário' : 'Novo Usuário'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              disabled={isEdit}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {isEdit && (
            <div className="flex items-center gap-2">
              <input
                id="isActive"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <label htmlFor="isActive" className="text-sm text-gray-700">Ativo</label>
            </div>
          )}
          {!isEdit && (
            <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded p-2">
              O usuário receberá um email com link para definir sua senha.
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-[#1E3A5F] text-white hover:bg-[#152A47] disabled:opacity-60">
              {saving ? 'Salvando...' : isEdit ? 'Salvar' : 'Enviar convite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
