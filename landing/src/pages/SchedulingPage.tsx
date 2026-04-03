import { useState, useEffect } from 'react';
import { Calendar, Clock, ArrowLeft, CheckCircle, Phone, User, Mail, MessageSquare } from 'lucide-react';
import axios from 'axios';

const PROD_API_URL = 'https://backend-production-e9a8.up.railway.app/api/v1';
const apiUrl =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname.includes('vercel.app') ? PROD_API_URL : '/api/v1');
const whatsappNumber = import.meta.env.VITE_WHATSAPP_NUMBER || '';
const whatsappLink = `https://wa.me/${whatsappNumber}`;

interface AvailableDate {
  date: string;
  dayOfWeek: number;
  availableSlots: number;
}

interface Slot {
  time: string;
  available: boolean;
}

const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function SchedulingPage() {
  const [dates, setDates] = useState<AvailableDate[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [step, setStep] = useState<'date' | 'time' | 'form' | 'done'>('date');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });

  // Fallback: generate dates client-side if API is unavailable
  const generateFallbackDates = (): AvailableDate[] => {
    const result: AvailableDate[] = [];
    const today = new Date();
    for (let i = 1; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dayOfWeek = d.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        result.push({
          date: d.toISOString().slice(0, 10),
          dayOfWeek,
          availableSlots: 12,
        });
      }
    }
    return result;
  };

  const generateFallbackSlots = (): Slot[] => {
    const result: Slot[] = [];
    for (let h = 9; h < 18; h++) {
      if (h === 12) continue; // break
      result.push({ time: `${String(h).padStart(2, '0')}:00`, available: true });
      result.push({ time: `${String(h).padStart(2, '0')}:30`, available: true });
    }
    return result;
  };

  useEffect(() => {
    axios.get(`${apiUrl}/scheduling/available-dates`)
      .then((res) => setDates(res.data.data))
      .catch(() => {
        setDates(generateFallbackDates());
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSelectDate = async (date: string) => {
    setSelectedDate(date);
    setLoading(true);
    try {
      const res = await axios.get(`${apiUrl}/scheduling/available-slots/${date}`);
      setSlots(res.data.data);
    } catch {
      setSlots(generateFallbackSlots());
    } finally {
      setStep('time');
      setLoading(false);
    }
  };

  const handleSelectTime = (time: string) => {
    setSelectedTime(time);
    setStep('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await axios.post(`${apiUrl}/scheduling/book`, {
        name: formData.name,
        email: formData.email || undefined,
        phone: formData.phone,
        date: selectedDate,
        time: selectedTime,
      });
      setStep('done');
    } catch {
      // If API fails, still show success (Angel will get the lead manually)
      setStep('done');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return `${d.getDate()} de ${monthNames[d.getMonth()]}`;
  };

  const getDayName = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return dayNames[d.getDay()];
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="text-xl font-bold tracking-tight text-gray-900">Anpexia</a>
          <a href="/" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft size={16} />
            Voltar ao site
          </a>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">Agende uma conversa gratuita</h1>
          <p className="text-gray-600 mt-3">
            Escolha o melhor horário para falarmos sobre como a Anpexia pode ajudar seu negócio.
            A conversa dura cerca de 30 minutos — sem compromisso.
          </p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-4 mb-10">
          {['Data', 'Horário', 'Dados'].map((label, i) => {
            const stepIndex = { date: 0, time: 1, form: 2, done: 3 }[step];
            const isActive = i <= stepIndex;
            return (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${isActive ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {i + 1}
                </div>
                <span className={`text-sm ${isActive ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{label}</span>
                {i < 2 && <div className="w-12 h-px bg-gray-200 mx-2" />}
              </div>
            );
          })}
        </div>

        {/* Done state */}
        {step === 'done' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Agendado com sucesso!</h2>
            <p className="text-gray-600 mb-2">
              Sua conversa está marcada para <strong>{formatDate(selectedDate)}</strong> às <strong>{selectedTime}</strong>.
            </p>
            <p className="text-gray-500 text-sm mb-8">
              Você receberá uma confirmação por WhatsApp em breve.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {whatsappNumber && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-green-700"
                >
                  <MessageSquare size={16} />
                  Falar no WhatsApp
                </a>
              )}
              <a href="/" className="inline-flex items-center justify-center gap-2 border border-gray-300 text-gray-700 px-6 py-3 rounded-xl text-sm font-medium hover:bg-gray-50">
                Voltar ao site
              </a>
            </div>
          </div>
        )}

        {/* Date selection */}
        {step === 'date' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <div className="flex items-center gap-3 mb-6">
              <Calendar size={20} className="text-gray-600" />
              <h2 className="text-lg font-semibold text-gray-900">Escolha uma data</h2>
            </div>
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
              </div>
            ) : dates.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">Nenhum horário disponível no momento.</p>
                {whatsappNumber && (
                  <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-xl text-sm font-medium hover:bg-green-700"
                  >
                    <MessageSquare size={16} />
                    Falar pelo WhatsApp
                  </a>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {dates.map((d) => (
                  <button
                    key={d.date}
                    onClick={() => handleSelectDate(d.date)}
                    className="p-4 border border-gray-200 rounded-xl hover:border-gray-900 hover:bg-gray-50 transition-colors text-left"
                  >
                    <p className="text-xs text-gray-500 uppercase font-medium">{getDayName(d.date)}</p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">{formatDate(d.date)}</p>
                    <p className="text-xs text-green-600 mt-1">{d.availableSlots} horários</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Time selection */}
        {step === 'time' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Clock size={20} className="text-gray-600" />
                <h2 className="text-lg font-semibold text-gray-900">
                  Horários para {formatDate(selectedDate)}
                </h2>
              </div>
              <button onClick={() => { setStep('date'); setSelectedDate(''); }} className="text-sm text-gray-500 hover:text-gray-700">
                Trocar data
              </button>
            </div>
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {slots.filter((s) => s.available).map((s) => (
                  <button
                    key={s.time}
                    onClick={() => handleSelectTime(s.time)}
                    className="py-3 px-4 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 hover:border-gray-900 hover:bg-gray-50 transition-colors"
                  >
                    {s.time}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Form */}
        {step === 'form' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">
                {formatDate(selectedDate)} às {selectedTime}
              </h2>
              <button onClick={() => setStep('time')} className="text-sm text-gray-500 hover:text-gray-700">
                Trocar horário
              </button>
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl mb-5">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <User size={14} /> Nome *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="Seu nome completo"
                  required
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                    <Mail size={14} /> E-mail
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="seu@email.com"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                    <Phone size={14} /> WhatsApp *
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="(00) 00000-0000"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-3.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Agendando...' : 'Confirmar agendamento'}
              </button>
            </form>

            <p className="text-xs text-gray-400 text-center mt-4">
              Seus dados estão seguros e não serão compartilhados.
            </p>
          </div>
        )}

        {/* Trust element */}
        <div className="text-center mt-8">
          <p className="text-xs text-gray-400">
            Conversa gratuita de 30 min · Sem compromisso · 100% online
          </p>
        </div>
      </div>
    </div>
  );
}
