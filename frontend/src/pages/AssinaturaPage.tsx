import { useState, useEffect, useRef, useCallback } from 'react';
import { PenLine, Save, Trash2, Upload, CheckCircle, Image } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';

export function AssinaturaPage() {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => {
    if (user) {
      api.get(`/doctors/${user.id}/signature`).then(({ data }) => {
        if (data.data?.signatureImage) {
          const src = `data:image/png;base64,${data.data.signatureImage}`;
          loadSignatureToCanvas(data.data.signatureImage);
          setPreviewSrc(src);
          setHasSignature(true);
        }
      }).catch(() => {});
    }
  }, [user]);

  const loadSignatureToCanvas = (base64: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new window.Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = `data:image/png;base64,${base64}`;
  };

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }, []);

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setPreviewSrc(null);
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !user) return;
    setSaving(true);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      await api.post(`/doctors/${user.id}/signature`, { signatureImage: base64 });
      setHasSignature(true);
      setPreviewSrc(dataUrl);
      showToast('Assinatura salva com sucesso!');
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Erro ao salvar assinatura');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const img = new window.Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const x = (canvas.width - img.width * scale) / 2;
        const y = (canvas.height - img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const btnPrimary: React.CSSProperties = { backgroundColor: '#1E3A5F', color: '#fff', borderRadius: 999, padding: '9px 24px' };
  const btnSecondary: React.CSSProperties = { backgroundColor: '#EFF6FF', color: '#1E3A5F', border: '1px solid #BFDBFE', borderRadius: 999, padding: '9px 24px' };
  const btnDestructive: React.CSSProperties = { backgroundColor: '#FEE2E2', color: '#991B1B', borderRadius: 999, padding: '9px 24px' };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <CheckCircle size={16} /> {toast}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-slate-800">Assinatura Digital</h1>
        <p className="text-sm text-slate-500 mt-1">Desenhe ou envie uma imagem da sua assinatura. Ela sera usada em atestados e prescricoes.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <PenLine size={24} className="text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-800">Desenhar assinatura</h2>
        </div>

        <div className="border-2 border-dashed border-slate-300 rounded-lg p-2 bg-white mb-4">
          <canvas
            ref={canvasRef}
            width={600}
            height={200}
            className="w-full cursor-crosshair touch-none"
            style={{ maxHeight: '200px' }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 text-sm font-medium disabled:opacity-50" style={btnPrimary}>
            <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Assinatura'}
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-sm font-medium" style={btnSecondary}>
            <Upload size={16} /> Enviar Imagem
          </button>
          <button onClick={clearCanvas} className="flex items-center gap-2 text-sm font-medium" style={btnDestructive}>
            <Trash2 size={16} /> Limpar
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
        </div>

        {hasSignature && (
          <div className="flex items-center gap-1 text-sm text-emerald-600 mt-3">
            <CheckCircle size={16} /> Assinatura salva
          </div>
        )}
      </div>

      {/* Preview */}
      {previewSrc && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Image size={24} className="text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-800">Preview da assinatura salva</h2>
          </div>
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 inline-block">
            <img src={previewSrc} alt="Assinatura" style={{ maxHeight: '120px' }} />
          </div>
        </div>
      )}
    </div>
  );
}
