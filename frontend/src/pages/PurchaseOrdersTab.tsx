import { useState, useEffect, useCallback } from 'react';
import { X, Eye, Check, Ban } from 'lucide-react';
import { format } from 'date-fns';
import api from '../services/api';

interface PurchaseOrderItem {
  productName: string;
  quantity: number;
  unit: string;
}

interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplier: { id: string; name: string; contactName: string | null };
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'SENT' | 'COMPLETED' | 'CANCELLED';
  items: PurchaseOrderItem[];
  sentAt: string | null;
  approvedAt: string | null;
  sentVia: 'EMAIL' | 'WHATSAPP' | null;
  message: string | null;
  createdAt: string;
}

type StatusFilter = 'ALL' | 'PENDING_APPROVAL' | 'APPROVED' | 'SENT' | 'COMPLETED' | 'CANCELLED';

const statusLabels: Record<string, string> = {
  PENDING_APPROVAL: 'Pendente',
  APPROVED: 'Aprovado',
  SENT: 'Enviado',
  COMPLETED: 'Concluido',
  CANCELLED: 'Cancelado',
};

const statusBadgeCls: Record<string, string> = {
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  SENT: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-red-100 text-red-700',
};

const filterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'PENDING_APPROVAL', label: 'Pendentes' },
  { value: 'APPROVED', label: 'Aprovados' },
  { value: 'SENT', label: 'Enviados' },
  { value: 'COMPLETED', label: 'Concluidos' },
  { value: 'CANCELLED', label: 'Cancelados' },
];

export function PurchaseOrdersTab() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [detailOrder, setDetailOrder] = useState<PurchaseOrder | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchOrders = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== 'ALL') params.status = statusFilter;
      const { data } = await api.get('/suppliers/purchase-orders', { params });
      setOrders(data.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchOrders();
  }, [fetchOrders]);

  const handleApprove = async (orderId: string) => {
    setActionLoading(orderId);
    try {
      await api.put(`/suppliers/purchase-orders/${orderId}/approve`);
      setToast({ message: 'Pedido aprovado e enviado ao fornecedor!', type: 'success' });
      fetchOrders();
    } catch {
      setToast({ message: 'Erro ao aprovar pedido.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (orderId: string) => {
    setActionLoading(orderId);
    try {
      await api.put(`/suppliers/purchase-orders/${orderId}/cancel`);
      setToast({ message: 'Pedido cancelado.', type: 'success' });
      fetchOrders();
    } catch {
      setToast({ message: 'Erro ao cancelar pedido.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const sentViaLabel = (v: string | null) => {
    if (v === 'EMAIL') return 'Email';
    if (v === 'WHATSAPP') return 'WhatsApp';
    return '-';
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Pedidos de Compra</h2>
          <p className="text-slate-500 mt-1">Acompanhe e gerencie pedidos para fornecedores</p>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === opt.value
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100">
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Data</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Fornecedor</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden md:table-cell">Produtos</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Status</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden lg:table-cell">Enviado via</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">Carregando...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">Nenhum pedido de compra encontrado.</td></tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="border-b border-slate-100 hover:bg-blue-50/50 even:bg-slate-50/50">
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {format(new Date(o.createdAt), 'dd/MM/yyyy HH:mm')}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-slate-800">{o.supplier.name}</span>
                    {o.supplier.contactName && <span className="block text-xs text-slate-400">{o.supplier.contactName}</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 hidden md:table-cell">
                    {o.items.map((i) => i.productName).join(', ')}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeCls[o.status]}`}>
                      {statusLabels[o.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 hidden lg:table-cell">
                    {sentViaLabel(o.sentVia)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setDetailOrder(o)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700" title="Detalhes">
                        <Eye size={16} />
                      </button>
                      {o.status === 'PENDING_APPROVAL' && (
                        <button
                          onClick={() => handleApprove(o.id)}
                          disabled={actionLoading === o.id}
                          className="p-1.5 rounded hover:bg-green-50 text-slate-500 hover:text-green-600 disabled:opacity-50"
                          title="Aprovar e Enviar"
                        >
                          <Check size={16} />
                        </button>
                      )}
                      {(o.status === 'PENDING_APPROVAL' || o.status === 'APPROVED') && (
                        <button
                          onClick={() => handleCancel(o.id)}
                          disabled={actionLoading === o.id}
                          className="p-1.5 rounded hover:bg-red-50 text-slate-500 hover:text-red-600 disabled:opacity-50"
                          title="Cancelar"
                        >
                          <Ban size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {detailOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Detalhes do Pedido</h3>
              <button onClick={() => setDetailOrder(null)} className="text-slate-400 hover:text-slate-500"><X size={20} /></button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500">Fornecedor</p>
                  <p className="text-sm font-medium text-slate-800">{detailOrder.supplier.name}</p>
                  {detailOrder.supplier.contactName && <p className="text-xs text-slate-400">{detailOrder.supplier.contactName}</p>}
                </div>
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeCls[detailOrder.status]}`}>
                    {statusLabels[detailOrder.status]}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Criado em</p>
                  <p className="text-sm text-slate-800">{format(new Date(detailOrder.createdAt), 'dd/MM/yyyy HH:mm')}</p>
                </div>
                {detailOrder.approvedAt && (
                  <div>
                    <p className="text-xs text-slate-500">Aprovado em</p>
                    <p className="text-sm text-slate-800">{format(new Date(detailOrder.approvedAt), 'dd/MM/yyyy HH:mm')}</p>
                  </div>
                )}
                {detailOrder.sentAt && (
                  <div>
                    <p className="text-xs text-slate-500">Enviado em</p>
                    <p className="text-sm text-slate-800">{format(new Date(detailOrder.sentAt), 'dd/MM/yyyy HH:mm')}</p>
                  </div>
                )}
                {detailOrder.sentVia && (
                  <div>
                    <p className="text-xs text-slate-500">Enviado via</p>
                    <p className="text-sm text-slate-800">{sentViaLabel(detailOrder.sentVia)}</p>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-sm font-medium text-slate-700 mb-2">Itens do pedido</h4>
                <div className="space-y-2">
                  {detailOrder.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-800">{item.productName}</span>
                      <span className="text-sm text-slate-500">{item.quantity} {item.unit}</span>
                    </div>
                  ))}
                </div>
              </div>

              {detailOrder.message && (
                <div className="border-t border-slate-200 pt-4">
                  <h4 className="text-sm font-medium text-slate-700 mb-2">Mensagem</h4>
                  <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{detailOrder.message}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                {detailOrder.status === 'PENDING_APPROVAL' && (
                  <button
                    onClick={() => { handleApprove(detailOrder.id); setDetailOrder(null); }}
                    className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                  >
                    Aprovar e Enviar
                  </button>
                )}
                {(detailOrder.status === 'PENDING_APPROVAL' || detailOrder.status === 'APPROVED') && (
                  <button
                    onClick={() => { handleCancel(detailOrder.id); setDetailOrder(null); }}
                    className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                  >
                    Cancelar Pedido
                  </button>
                )}
                <button onClick={() => setDetailOrder(null)} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Fechar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
