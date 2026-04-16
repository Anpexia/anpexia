import { useEffect, useState } from 'react';
import { Calendar, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export default function LembretesPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const { data: statusData } = await api.get('/google/status');
        const isConnected = statusData.data.connected;
        setConnected(isConnected);
        if (isConnected) {
          const { data: eventsData } = await api.get('/google/events');
          setEvents(eventsData.data || []);
        }
      } catch {
        setConnected(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const formatDateTime = (event: CalendarEvent) => {
    const dt = event.start?.dateTime || event.start?.date;
    if (!dt) return '-';
    try {
      return new Date(dt).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dt;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Lembretes — Google Agenda</h2>
          <p className="text-sm text-gray-500 mt-1">Proximos eventos sincronizados do CRM</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <p className="text-gray-500">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Lembretes — Google Agenda</h2>
          <p className="text-sm text-gray-500 mt-1">Proximos eventos sincronizados do CRM</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <AlertCircle size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Google Calendar nao conectado</h3>
          <p className="text-sm text-gray-500 mb-6">
            Conecte sua conta Google para visualizar os lembretes sincronizados do CRM.
          </p>
          <button
            onClick={() => navigate('/configuracoes')}
            className="px-4 py-2 text-sm rounded-lg bg-[#1E3A5F] text-white hover:bg-[#152C49] inline-flex items-center gap-2"
          >
            <Calendar size={16} />
            Conectar agora
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Lembretes — Google Agenda</h2>
        <p className="text-sm text-gray-500 mt-1">Proximos eventos sincronizados do CRM</p>
      </div>

      {events.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center">
          <Calendar size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500">Nenhum lembrete agendado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <div key={event.id} className="bg-white rounded-lg shadow-sm p-4 flex items-start gap-4">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Calendar size={20} className="text-[#1E3A5F]" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-gray-900 truncate">{event.summary || 'Evento sem titulo'}</h4>
                <p className="text-sm text-gray-500 mt-0.5">{formatDateTime(event)}</p>
                {event.description && (
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">{event.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
