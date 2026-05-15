import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, AlertTriangle, X, Pencil, Trash2, ArrowUpCircle, ArrowDownCircle, Eye, Clock, Barcode, Link2Off, Zap, Keyboard, Sparkles, Loader2, Truck } from 'lucide-react';
import { format } from 'date-fns';
import api from '../services/api';
import { SuppliersTab } from './SuppliersTab';
import { PurchaseOrdersTab } from './PurchaseOrdersTab';
import { ProcedureTemplatesTab } from './ProcedureTemplatesTab';

interface Product {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  minQuantity: number;
  unit: string;
  costPrice: number | null;
  salePrice: number | null;
  supplier: string | null;
  batch: string | null;
  expiresAt: string | null;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  isActive: boolean;
  movements?: Movement[];
  createdAt: string;
  supplierProducts?: { id: string; isPrimary: boolean; supplier: { id: string; name: string } }[];
}

interface Movement {
  id: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  reason: string | null;
  createdAt: string;
}

interface Category {
  id: string;
  name: string;
  _count?: { products: number };
}

interface AlertProduct {
  id: string;
  name: string;
  quantity: number;
  min_quantity: number;
  expires_at: string | null;
  supplier: string | null;
}

interface ExpiringProduct {
  id: string;
  name: string;
  quantity: number;
  expiresAt: string | null;
  isExpired: boolean;
}

interface SupplierOption {
  id: string;
  name: string;
  contactName: string | null;
}

interface ProductSupplierLink {
  id: string;
  supplierId: string;
  productId: string;
  isPrimary: boolean;
  costPrice: number | null;
  gtin: string | null;
  supplier: { id: string; name: string };
}

interface LinkedSupplierEntry {
  supplierId: string;
  name: string;
  costPrice: string;
  gtin: string;
}

const emptySupplierForm = {
  name: '', contactName: '', email: '', phone: '', whatsapp: '',
  notificationMethod: 'WHATSAPP' as 'EMAIL' | 'WHATSAPP' | 'BOTH',
  autoDispatch: false,
};

type ModalMode = 'closed' | 'create' | 'edit' | 'detail' | 'movement';

const emptyForm = {
  name: '', sku: '', quantity: 0, minQuantity: 5,
  costPrice: '', salePrice: '', supplier: '', unit: 'un',
  batch: '', expiresAt: '', categoryId: '',
};

export function InventoryPage() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<AlertProduct[]>([]);
  const [expiringProducts, setExpiringProducts] = useState<ExpiringProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>('closed');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showAlertPanel, setShowAlertPanel] = useState<'low' | 'expiring' | null>(
    searchParams.get('filter') === 'alerts' ? 'low' : null
  );

  // Movement form
  const [movType, setMovType] = useState<'IN' | 'OUT' | 'ADJUSTMENT'>('IN');
  const [movQty, setMovQty] = useState(1);
  const [movReason, setMovReason] = useState('');

  // Scanner state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scannedCode, setScannedCode] = useState('');
  const [scanSource, setScanSource] = useState<'local' | 'cosmos' | null>(null);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [manualEntryMode, setManualEntryMode] = useState(false);
  const [scanDuplicateProduct, setScanDuplicateProduct] = useState<Product | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const scannerRef = useRef<any>(null);
  const scanProcessingRef = useRef(false);
  const votingBufferRef = useRef<string[]>([]);
  const scanBufferRef = useRef('');
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const productsRef = useRef<Product[]>([]);

  // Tab state
  const [activeTab, setActiveTab] = useState<'products' | 'suppliers' | 'orders' | 'templates'>('products');

  // Supplier linking state
  const [allSuppliers, setAllSuppliers] = useState<SupplierOption[]>([]);
  const [productSuppliers, setProductSuppliers] = useState<ProductSupplierLink[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);

  // Supplier step popup (before product creation)
  const [supplierStepOpen, setSupplierStepOpen] = useState(false);
  const [supplierStepMode, setSupplierStepMode] = useState<'select' | 'create'>('select');
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [savingSupplier, setSavingSupplier] = useState(false);

  // Linked suppliers for product create/edit (local state before saving)
  const [linkedSuppliers, setLinkedSuppliers] = useState<LinkedSupplierEntry[]>([]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Hide page content when scanner is open to prevent camera reading on-screen barcodes
  useEffect(() => {
    const main = document.querySelector('main') || document.getElementById('root');
    if (!main) return;
    if (cameraOpen) {
      main.style.background = '#000';
      document.body.style.background = '#000';
    } else {
      main.style.background = '';
      document.body.style.background = '';
    }
    return () => { main.style.background = ''; document.body.style.background = ''; };
  }, [cameraOpen]);

  // USB barcode scanner listener: detects rapid keystrokes (<100ms gap) ending with Enter
  useEffect(() => {
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
      if (isInput || modalMode !== 'closed' || cameraOpen) return;

      const now = Date.now();

      if (e.key === 'Enter' && scanBufferRef.current.length >= 3) {
        e.preventDefault();
        const code = scanBufferRef.current;
        scanBufferRef.current = '';
        processScannedCode(code);
        return;
      }

      if (e.key.length === 1) {
        if (now - lastKeyTime > 100) {
          scanBufferRef.current = '';
        }
        scanBufferRef.current += e.key;
        lastKeyTime = now;

        if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
        scanTimerRef.current = setTimeout(() => { scanBufferRef.current = ''; }, 200);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalMode, cameraOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // EAN/UPC check digit validation
  const isValidEanCheckDigit = (code: string): boolean => {
    if (!/^\d+$/.test(code)) return false;
    // Works for EAN-13, EAN-8, UPC-A (12 digits)
    if (![8, 12, 13].includes(code.length)) return false;
    const digits = code.split('').map(Number);
    const checkDigit = digits.pop()!;
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      sum += digits[i] * (i % 2 === 0 ? 1 : 3);
    }
    return (10 - (sum % 10)) % 10 === checkDigit;
  };

  // Validate barcode: must be numeric, valid EAN/UPC check digit
  const isValidBarcode = (code: string): boolean => {
    const cleaned = code.trim();
    if (cleaned.length < 8) return false;
    if (!/^\d+$/.test(cleaned)) return false;
    // Validate check digit for standard barcode lengths
    if ([8, 12, 13].includes(cleaned.length) && !isValidEanCheckDigit(cleaned)) return false;
    return true;
  };

  // Lookup product by scanned code via barcode endpoint (local DB + Cosmos API)
  const processScannedCode = async (code: string) => {
    if (scanProcessingRef.current) return;
    scanProcessingRef.current = true;

    await stopScanner();
    setCameraOpen(false);

    setScannedCode(code);
    setScanSource(null);
    setBarcodeLoading(true);

    try {
      const { data } = await api.get(`/inventory/barcode/${encodeURIComponent(code)}`);
      const result = data.data;

      if (result.found && result.source === 'local') {
        // CASE 1: Product exists locally → show choice dialog
        setScanSource('local');
        setScanDuplicateProduct(result.product);
      } else if (!result.found && result.source === 'cosmos' && result.product) {
        // CASE 2: Found in Cosmos → supplier step then pre-fill create modal
        setScanSource('cosmos');
        setFormData({
          ...emptyForm,
          sku: code,
          name: result.product.description || '',
          supplier: result.product.brand || '',
          costPrice: result.product.avgPrice ? String(result.product.avgPrice) : '',
        });
        setLinkedSuppliers([]);
        const cosmosBrand = (result.product.brand || '').trim();
        let fetchedSuppliers: any[] = [];
        try { const { data: s } = await api.get('/suppliers', { params: { active: 'true' } }); fetchedSuppliers = s.data; setAllSuppliers(fetchedSuppliers); } catch { setAllSuppliers([]); }
        if (cosmosBrand) {
          const match = fetchedSuppliers.find((s: any) => s.name.toLowerCase() === cosmosBrand.toLowerCase());
          if (match) {
            setSupplierStepMode('select');
            setSupplierSearch(cosmosBrand);
            setSupplierForm(emptySupplierForm);
          } else {
            setSupplierStepMode('create');
            setSupplierForm({ ...emptySupplierForm, name: cosmosBrand });
            setSupplierSearch('');
          }
        } else {
          setSupplierForm(emptySupplierForm);
          setSupplierStepMode('select');
          setSupplierSearch('');
        }
        setSupplierStepOpen(true);
      } else {
        // CASE 3: Not found anywhere → supplier step then empty create modal with SKU
        setScanSource(null);
        setFormData({ ...emptyForm, sku: code });
        setLinkedSuppliers([]);
        setSupplierForm(emptySupplierForm);
        setSupplierStepMode('select');
        setSupplierSearch('');
        try { const { data: s } = await api.get('/suppliers', { params: { active: 'true' } }); setAllSuppliers(s.data); } catch { setAllSuppliers([]); }
        setSupplierStepOpen(true);
      }
    } catch {
      setScanSource(null);
      setFormData({ ...emptyForm, sku: code });
      setModalMode('create');
    }

    setBarcodeLoading(false);
    scanProcessingRef.current = false;
  };

  const openCameraScanner = () => {
    // Close any open modals first
    setModalMode('closed');
    setSelectedProduct(null);
    setDeleteConfirm(null);
    setShowAlertPanel(null);

    setCameraOpen(true);
    setScannedCode('');
    setManualEntryMode(false);
    setManualCode('');
    setTorchOn(false);
    votingBufferRef.current = [];
    videoTrackRef.current = null;

    // Start 60s timeout for manual entry fallback
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = setTimeout(() => {
      setManualEntryMode(true);
    }, 60000);

    setTimeout(async () => {
      try {
        const Quagga = (await import('@ericblade/quagga2')).default;
        scannerRef.current = Quagga;

        // Check camera availability before initializing Quagga
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setToast({ message: 'Seu navegador nao suporta acesso a camera. Use Chrome ou Firefox.', type: 'error' });
          setCameraOpen(false);
          return;
        }

        Quagga.init({
          inputStream: {
            type: 'LiveStream',
            target: document.querySelector('#scanner-region') as Element,
            constraints: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            // Tight capture area — only center strip, ignores screen edges/text
            area: { top: '40%', right: '10%', bottom: '40%', left: '10%' },
          },
          locator: { patchSize: 'large', halfSample: true },
          numOfWorkers: navigator.hardwareConcurrency || 4,
          frequency: 20,
          decoder: {
            readers: [
              'ean_reader',
              'ean_8_reader',
              'upc_reader',
              'upc_e_reader',
              'code_128_reader',
              'code_39_reader',
            ],
          },
          locate: true,
        }, (err: any) => {
          if (err) {
            console.error('Quagga init error:', err);
            const errMsg = String(err?.message || err || '');
            if (errMsg.includes('NotAllowedError') || errMsg.includes('Permission')) {
              setToast({ message: 'Permissao de camera negada. Libere o acesso nas configuracoes do navegador.', type: 'error' });
            } else if (errMsg.includes('NotFoundError') || errMsg.includes('DevicesNotFound')) {
              setToast({ message: 'Nenhuma camera encontrada. Conecte uma webcam ou use um celular.', type: 'error' });
            } else if (errMsg.includes('NotReadableError') || errMsg.includes('TrackStartError')) {
              setToast({ message: 'Camera em uso por outro aplicativo. Feche outros apps e tente novamente.', type: 'error' });
            } else {
              setToast({ message: `Erro ao acessar camera: ${errMsg || 'verifique as permissoes'}`, type: 'error' });
            }
            setCameraOpen(false);
            return;
          }

          Quagga.start();

          // Store video track for torch control
          const video = document.querySelector('#scanner-region video') as HTMLVideoElement;
          if (video?.srcObject) {
            const tracks = (video.srcObject as MediaStream).getVideoTracks();
            if (tracks.length > 0) videoTrackRef.current = tracks[0];
          }

          Quagga.onDetected((result: any) => {
            const code = result?.codeResult?.code;
            if (!code || !isValidBarcode(code)) {
              // Invalid read breaks the streak
              votingBufferRef.current = [];
              return;
            }

            // Require 3 consecutive identical reads
            const buffer = votingBufferRef.current;
            if (buffer.length > 0 && buffer[buffer.length - 1] !== code) {
              // Different code — reset streak
              votingBufferRef.current = [code];
              return;
            }
            buffer.push(code);

            if (buffer.length >= 3) {
              votingBufferRef.current = [];
              processScannedCode(code);
            }
          });
        });
      } catch (err: any) {
        console.error('Camera error:', err);
        const errMsg = String(err?.message || err || '');
        if (errMsg.includes('NotAllowedError') || errMsg.includes('Permission')) {
          setToast({ message: 'Permissao de camera negada. Libere o acesso nas configuracoes do navegador.', type: 'error' });
        } else if (errMsg.includes('NotFoundError') || errMsg.includes('DevicesNotFound')) {
          setToast({ message: 'Nenhuma camera encontrada. Conecte uma webcam ou use um celular.', type: 'error' });
        } else {
          setToast({ message: `Erro ao acessar camera: ${errMsg || 'verifique as permissoes'}`, type: 'error' });
        }
        setCameraOpen(false);
      }
    }, 150);
  };

  const stopScanner = async () => {
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    if (scannerRef.current) {
      try {
        scannerRef.current.stop();
        scannerRef.current.offDetected();
      } catch {}
      scannerRef.current = null;
    }
    videoTrackRef.current = null;
  };

  const toggleTorch = async () => {
    const track = videoTrackRef.current;
    if (!track) return;
    try {
      const newState = !torchOn;
      // @ts-ignore
      await track.applyConstraints({ advanced: [{ torch: newState }] });
      setTorchOn(newState);
    } catch {}
  };

  const closeCameraModal = async () => {
    await stopScanner();
    setCameraOpen(false);
    setManualEntryMode(false);
  };

  const fetchProducts = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      const { data } = await api.get('/inventory/products', { params });
      setProducts(data.data);
      productsRef.current = data.data;
    } catch {} finally { setLoading(false); }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(fetchProducts, 300);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  useEffect(() => {
    Promise.all([
      api.get('/inventory/alerts/low-stock').catch(() => ({ data: { data: [] } })),
      api.get('/inventory/alerts/expiring').catch(() => ({ data: { data: [] } })),
      api.get('/inventory/categories').catch(() => ({ data: { data: [] } })),
    ]).then(([low, exp, cats]) => {
      setLowStockProducts(low.data.data);
      setExpiringProducts(exp.data.data);
      setCategories(cats.data.data);
    });
  }, []);

  const openCreate = async () => {
    setFormData(emptyForm);
    setLinkedSuppliers([]);
    setSupplierForm(emptySupplierForm);
    setSupplierStepMode('create');
    setSupplierSearch('');
    setShowSupplierDropdown(false);
    try {
      const { data } = await api.get('/suppliers', { params: { active: 'true' } });
      setAllSuppliers(data.data);
    } catch { setAllSuppliers([]); }
    setSupplierStepOpen(true);
  };

  const openEdit = async (p: Product) => {
    setFormData({
      name: p.name, sku: p.sku || '', quantity: p.quantity, minQuantity: p.minQuantity,
      costPrice: p.costPrice?.toString() || '', salePrice: p.salePrice?.toString() || '',
      supplier: p.supplier || '', unit: p.unit, batch: p.batch || '',
      expiresAt: p.expiresAt ? p.expiresAt.split('T')[0] : '', categoryId: p.categoryId || '',
    });
    setSelectedProduct(p);
    setModalMode('edit');
    setSupplierSearch('');
    setShowSupplierDropdown(false);
    try {
      const [suppRes, linkRes] = await Promise.all([
        api.get('/suppliers', { params: { active: 'true' } }).catch(() => ({ data: { data: [] } })),
        api.get(`/inventory/products/${p.id}/suppliers`).catch(() => ({ data: { data: [] } })),
      ]);
      setAllSuppliers(suppRes.data.data);
      setProductSuppliers(linkRes.data.data);
      setLinkedSuppliers(linkRes.data.data.map((ps: ProductSupplierLink) => ({
        supplierId: ps.supplierId,
        name: ps.supplier.name,
        costPrice: ps.costPrice?.toString() || '',
        gtin: ps.gtin || '',
      })));
    } catch {
      setAllSuppliers([]);
      setProductSuppliers([]);
      setLinkedSuppliers([]);
    }
  };

  const openDetail = async (p: Product) => {
    try {
      const { data } = await api.get(`/inventory/products/${p.id}`);
      setSelectedProduct(data.data);
    } catch { setSelectedProduct(p); }
    setModalMode('detail');
  };

  const openMovement = (p: Product) => {
    setSelectedProduct(p);
    setMovType('IN');
    setMovQty(1);
    setMovReason('');
    setModalMode('movement');
  };

  // Supplier step: select existing supplier and proceed to product form
  const handleSelectSupplierAndProceed = (s: SupplierOption) => {
    setLinkedSuppliers([{ supplierId: s.id, name: s.name, costPrice: '', gtin: '' }]);
    setSupplierStepOpen(false);
    setModalMode('create');
  };

  // Supplier step: create new supplier then proceed
  const handleCreateSupplierAndProceed = async () => {
    if (!supplierForm.name.trim()) return;
    setSavingSupplier(true);
    try {
      const { data } = await api.post('/suppliers', supplierForm);
      const newSupplier = data.data;
      setAllSuppliers((prev) => [newSupplier, ...prev]);
      setLinkedSuppliers([{ supplierId: newSupplier.id, name: newSupplier.name, costPrice: '', gtin: '' }]);
      setSupplierStepOpen(false);
      setModalMode('create');
    } catch {} finally { setSavingSupplier(false); }
  };

  // Supplier step: skip and go directly to product form
  const handleSkipSupplierStep = () => {
    setLinkedSuppliers([]);
    setSupplierStepOpen(false);
    setModalMode('create');
  };

  // Add a supplier to the linked list in product form
  const handleAddLinkedSupplier = (s: SupplierOption) => {
    if (linkedSuppliers.some((ls) => ls.supplierId === s.id)) return;
    setLinkedSuppliers((prev) => [...prev, { supplierId: s.id, name: s.name, costPrice: '', gtin: '' }]);
    setSupplierSearch('');
    setShowSupplierDropdown(false);
  };

  const handleRemoveLinkedSupplier = (supplierId: string) => {
    setLinkedSuppliers((prev) => prev.filter((ls) => ls.supplierId !== supplierId));
  };

  const handleUpdateLinkedSupplier = (supplierId: string, field: 'costPrice' | 'gtin', value: string) => {
    setLinkedSuppliers((prev) => prev.map((ls) => ls.supplierId === supplierId ? { ...ls, [field]: value } : ls));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...formData,
        quantity: Number(formData.quantity),
        minQuantity: Number(formData.minQuantity),
        costPrice: formData.costPrice ? Number(formData.costPrice) : undefined,
        salePrice: formData.salePrice ? Number(formData.salePrice) : undefined,
        expiresAt: formData.expiresAt || undefined,
        categoryId: formData.categoryId || undefined,
        batch: formData.batch || undefined,
      };
      if (modalMode === 'create') {
        const { data: created } = await api.post('/inventory/products', payload);
        const newProductId = created.data?.id;
        if (newProductId && linkedSuppliers.length > 0) {
          for (let i = 0; i < linkedSuppliers.length; i++) {
            const ls = linkedSuppliers[i];
            try {
              await api.post(`/suppliers/${ls.supplierId}/products`, {
                productId: newProductId,
                isPrimary: i === 0,
                costPrice: ls.costPrice ? Number(ls.costPrice) : undefined,
                gtin: ls.gtin || undefined,
              });
            } catch {}
          }
        }
        if (scannedCode) {
          setToast({ message: `Produto "${formData.name}" criado com sucesso!`, type: 'success' });
          setScannedCode('');
        }
      } else {
        await api.put(`/inventory/products/${selectedProduct!.id}`, payload);
        // Sync linked suppliers for edit mode
        if (selectedProduct) {
          const existingIds = productSuppliers.map((ps) => ps.supplierId);
          const newIds = linkedSuppliers.map((ls) => ls.supplierId);
          // Unlink removed suppliers
          for (const ps of productSuppliers) {
            if (!newIds.includes(ps.supplierId)) {
              try { await api.delete(`/suppliers/${ps.supplierId}/products/${selectedProduct.id}`); } catch {}
            }
          }
          // Link new suppliers and update existing
          for (let i = 0; i < linkedSuppliers.length; i++) {
            const ls = linkedSuppliers[i];
            if (existingIds.includes(ls.supplierId)) {
              try { await api.patch(`/suppliers/${ls.supplierId}/products/${selectedProduct.id}`, { costPrice: ls.costPrice ? Number(ls.costPrice) : null, gtin: ls.gtin || null }); } catch {}
            } else {
              try { await api.post(`/suppliers/${ls.supplierId}/products`, { productId: selectedProduct.id, isPrimary: i === 0 && productSuppliers.length === 0, costPrice: ls.costPrice ? Number(ls.costPrice) : undefined, gtin: ls.gtin || undefined }); } catch {}
            }
          }
        }
      }
      setModalMode('closed');
      fetchProducts();
    } catch {
      if (scannedCode) setToast({ message: 'Erro ao criar produto.', type: 'error' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/inventory/products/${id}`);
      setDeleteConfirm(null);
      fetchProducts();
    } catch {}
  };

  const handleMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/inventory/products/${selectedProduct!.id}/movements`, {
        type: movType,
        quantity: movQty,
        reason: movReason || undefined,
      });
      if (scannedCode) {
        const label = movType === 'IN' ? 'Entrada' : movType === 'OUT' ? 'Saida' : 'Ajuste';
        setToast({ message: `${label} de ${movQty}x ${selectedProduct!.name} registrada!`, type: 'success' });
        setScannedCode('');
      }
      setModalMode('closed');
      fetchProducts();
    } catch {
      if (scannedCode) setToast({ message: 'Erro ao registrar movimentacao.', type: 'error' });
    } finally { setSaving(false); }
  };



  const margin = (cost: number | null, sale: number | null) => {
    if (!cost || !sale || cost === 0) return '-';
    return `${(((sale - cost) / cost) * 100).toFixed(0)}%`;
  };

  const fmt = (v: number | null) => v != null ? `R$ ${v.toFixed(2)}` : '-';

  const isExpiringSoon = (d: string | null) => {
    if (!d) return false;
    const diff = (new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff <= 30 && diff >= 0;
  };

  const isExpired = (d: string | null) => {
    if (!d) return false;
    return new Date(d).getTime() < Date.now();
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]';

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6">
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'products' ? 'border-b-2 border-[#1E3A5F] text-[#1E3A5F]' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Produtos
        </button>
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'suppliers' ? 'border-b-2 border-[#1E3A5F] text-[#1E3A5F]' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Fornecedores
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'orders' ? 'border-b-2 border-[#1E3A5F] text-[#1E3A5F]' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Pedidos de Compra
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'templates' ? 'border-b-2 border-[#1E3A5F] text-[#1E3A5F]' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Templates
        </button>
      </div>

      {activeTab === 'suppliers' && <SuppliersTab />}
      {activeTab === 'orders' && <PurchaseOrdersTab />}
      {activeTab === 'templates' && <ProcedureTemplatesTab />}

      {activeTab === 'products' && (<>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Estoque</h2>
          <p className="text-slate-500 mt-1">Controle seus produtos e movimentacoes</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openCameraScanner} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">
            <Barcode size={18} />
            Escanear
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-[#1E3A5F] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[#2A4D7A] transition-colors shadow-sm">
            <Plus size={18} />
            Novo produto
          </button>
        </div>
      </div>

      {/* Alerts */}
      <div className="flex flex-wrap gap-4 mb-6">
        <button onClick={() => setShowAlertPanel(showAlertPanel === 'low' ? null : 'low')} className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 hover:bg-amber-100 transition-colors">
          <AlertTriangle size={16} />
          <span>{lowStockProducts.length} produtos com estoque baixo</span>
        </button>
        {expiringProducts.filter(p => p.isExpired).length > 0 && (
          <button onClick={() => setShowAlertPanel(showAlertPanel === 'expiring' ? null : 'expiring')} className="flex items-center gap-2 px-4 py-2 bg-red-100 border border-red-300 rounded-lg text-sm text-red-800 hover:bg-red-200 transition-colors">
            <AlertTriangle size={16} />
            <span>{expiringProducts.filter(p => p.isExpired).length} produtos vencidos</span>
          </button>
        )}
        {expiringProducts.filter(p => !p.isExpired).length > 0 && (
          <button onClick={() => setShowAlertPanel(showAlertPanel === 'expiring' ? null : 'expiring')} className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 hover:bg-amber-100 transition-colors">
            <Clock size={16} />
            <span>{expiringProducts.filter(p => !p.isExpired).length} produtos vencem em 30 dias</span>
          </button>
        )}
      </div>

      {/* Alert Detail Panels */}
      {showAlertPanel === 'low' && lowStockProducts.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h4 className="font-medium text-amber-900 mb-3">Produtos com estoque baixo</h4>
          <div className="space-y-2">
            {lowStockProducts.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-white rounded-lg px-4 py-2 border border-amber-100">
                <span className="text-sm font-medium text-slate-800">{p.name}</span>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-red-600 font-medium">Qtd: {p.quantity}</span>
                  <span className="text-slate-500">Min: {p.min_quantity}</span>
                  {p.supplier && <span className="text-slate-400">Fornecedor: {p.supplier}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAlertPanel === 'expiring' && expiringProducts.length > 0 && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
          <h4 className="font-medium text-red-900 mb-3">Produtos vencidos e perto do vencimento</h4>
          <div className="space-y-2">
            {expiringProducts.map((p) => (
              <div key={p.id} className={`flex items-center justify-between bg-white rounded-lg px-4 py-2 border ${p.isExpired ? 'border-red-300' : 'border-amber-200'}`}>
                <span className="text-sm font-medium text-slate-800">{p.name}</span>
                <div className="flex items-center gap-4 text-sm">
                  <span className={p.isExpired ? 'text-red-600 font-semibold' : 'text-amber-600 font-medium'}>
                    {p.isExpired ? 'Vencido' : 'Vence'}: {p.expiresAt ? format(new Date(p.expiresAt), 'dd/MM/yyyy') : '-'}
                  </span>
                  <span className="text-slate-500">Qtd: {p.quantity}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, SKU ou fornecedor..." className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100">
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Produto</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden md:table-cell">SKU</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Qtd</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden lg:table-cell">Custo</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden lg:table-cell">Venda</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden lg:table-cell">Margem</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden xl:table-cell">Validade</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3 hidden xl:table-cell">Fornecedor</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-6 py-3">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-6 py-12 text-center text-sm text-slate-500">Carregando...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={9} className="px-6 py-12 text-center text-sm text-slate-500">Nenhum produto cadastrado ainda.</td></tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-blue-50/50 even:bg-slate-50/50 cursor-pointer" onClick={() => openDetail(p)}>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-slate-800">{p.name}</span>
                    {p.category && <span className="block text-xs text-slate-400">{p.category.name}</span>}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 hidden md:table-cell">{p.sku || '-'}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={p.minQuantity > 0 && p.quantity <= p.minQuantity ? 'text-red-600 font-semibold' : 'text-slate-500'}>{p.quantity} {p.unit}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 hidden lg:table-cell">{fmt(p.costPrice)}</td>
                  <td className="px-6 py-4 text-sm text-slate-500 hidden lg:table-cell">{fmt(p.salePrice)}</td>
                  <td className="px-6 py-4 text-sm text-slate-500 hidden lg:table-cell">{margin(p.costPrice, p.salePrice)}</td>
                  <td className="px-6 py-4 text-sm hidden xl:table-cell">
                    {p.expiresAt ? (
                      <span className={isExpired(p.expiresAt) ? 'text-red-600 font-semibold' : isExpiringSoon(p.expiresAt) ? 'text-amber-600 font-medium' : 'text-slate-500'}>
                        {format(new Date(p.expiresAt), 'dd/MM/yyyy')}
                        {isExpired(p.expiresAt) && ' (vencido)'}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 hidden xl:table-cell">
                    {p.supplierProducts && p.supplierProducts.length > 0 ? (
                      <span>
                        {(p.supplierProducts.find(sp => sp.isPrimary) || p.supplierProducts[0]).supplier.name}
                        {p.supplierProducts.length > 1 && (
                          <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">+{p.supplierProducts.length - 1}</span>
                        )}
                      </span>
                    ) : p.supplier || '-'}
                  </td>
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openMovement(p)} className="p-1.5 rounded hover:bg-green-50 text-slate-500 hover:text-green-600" title="Movimentacao"><ArrowUpCircle size={16} /></button>
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700" title="Editar"><Pencil size={16} /></button>
                      <button onClick={() => setDeleteConfirm(p.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-500 hover:text-red-600" title="Excluir"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-slate-800 mb-2">Excluir produto?</h3>
            <p className="text-sm text-slate-500 mb-6">Esta acao nao pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {(modalMode === 'create' || modalMode === 'edit') && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 pb-4 shrink-0">
              <h3 className="font-semibold text-slate-800">{modalMode === 'create' ? 'Novo produto' : 'Editar produto'}</h3>
              <button onClick={() => { setModalMode('closed'); setScannedCode(''); }} className="text-slate-400 hover:text-slate-500"><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
              <div className="px-6 pb-4 space-y-4 overflow-y-auto flex-1">
            {modalMode === 'create' && scannedCode && scanSource === 'cosmos' && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
                <Sparkles size={14} className="text-emerald-500" />
                <span className="text-xs text-emerald-700">Produto encontrado na base Cosmos Bluesoft — codigo <span className="font-mono font-semibold">{scannedCode}</span>. Dados preenchidos automaticamente, edite se necessario.</span>
              </div>
            )}
            {modalMode === 'create' && scannedCode && !scanSource && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                <Barcode size={14} className="text-amber-500" />
                <span className="text-xs text-amber-700">Codigo <span className="font-mono font-semibold">{scannedCode}</span> nao encontrado. Preencha manualmente.</span>
              </div>
            )}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputCls} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">SKU</label>
                  <input type="text" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
                  <select value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })} className={inputCls}>
                    <option value="">Sem categoria</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unidade</label>
                  <select value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} className={inputCls}>
                    <option value="un">Unidade (un)</option>
                    <option value="cx">Caixa (cx)</option>
                    <option value="kg">Quilograma (kg)</option>
                    <option value="L">Litro (L)</option>
                    <option value="ml">Mililitro (ml)</option>
                    <option value="m">Metro (m)</option>
                    <option value="par">Par</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantidade</label>
                  <input type="number" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })} className={inputCls} min={0} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Qtd minima</label>
                  <input type="number" value={formData.minQuantity} onChange={(e) => setFormData({ ...formData, minQuantity: Number(e.target.value) })} className={inputCls} min={0} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Lote</label>
                  <input type="text" value={formData.batch} onChange={(e) => setFormData({ ...formData, batch: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Preco de venda</label>
                  <input type="number" step="0.01" value={formData.salePrice} onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Validade</label>
                  <input type="date" value={formData.expiresAt} onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })} className={inputCls} />
                </div>
              </div>

              {/* Fornecedores vinculados */}
              <div className="border-t border-slate-200 pt-4">
                <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2"><Truck size={16} /> Fornecedores vinculados</h4>
                {linkedSuppliers.length > 0 && (
                  <div className="space-y-3 mb-3">
                    {linkedSuppliers.map((ls) => (
                      <div key={ls.supplierId} className="p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-800">{ls.name}</span>
                          <button type="button" onClick={() => handleRemoveLinkedSupplier(ls.supplierId)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500" title="Remover"><Link2Off size={14} /></button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs text-slate-500 mb-0.5">Preco de custo</label>
                            <input type="number" step="0.01" value={ls.costPrice} onChange={(e) => handleUpdateLinkedSupplier(ls.supplierId, 'costPrice', e.target.value)} className={inputCls + ' text-xs'} placeholder="R$ 0,00" />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-0.5">GTIN (opcional)</label>
                            <input type="text" value={ls.gtin} onChange={(e) => handleUpdateLinkedSupplier(ls.supplierId, 'gtin', e.target.value)} className={inputCls + ' text-xs'} placeholder="Codigo GTIN" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {linkedSuppliers.length === 0 && (
                  <p className="text-sm text-slate-400 mb-3">Nenhum fornecedor vinculado.</p>
                )}
                <div className="relative">
                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={(e) => { setSupplierSearch(e.target.value); setShowSupplierDropdown(true); }}
                    onFocus={() => setShowSupplierDropdown(true)}
                    placeholder="Buscar fornecedor para adicionar..."
                    className={inputCls}
                  />
                  {showSupplierDropdown && supplierSearch.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {allSuppliers
                        .filter((s) => !linkedSuppliers.some((ls) => ls.supplierId === s.id) && (s.name.toLowerCase().includes(supplierSearch.toLowerCase()) || (s.contactName && s.contactName.toLowerCase().includes(supplierSearch.toLowerCase()))))
                        .map((s) => (
                          <button key={s.id} type="button" onClick={() => handleAddLinkedSupplier(s)} className="w-full text-left px-3 py-2 text-sm hover:bg-[#EFF6FF] hover:text-[#1E3A5F]">
                            {s.name}
                            {s.contactName && <span className="text-xs text-slate-400 ml-2">({s.contactName})</span>}
                          </button>
                        ))
                      }
                      {allSuppliers.filter((s) => !linkedSuppliers.some((ls) => ls.supplierId === s.id) && s.name.toLowerCase().includes(supplierSearch.toLowerCase())).length === 0 && (
                        <div className="p-3 text-sm text-slate-400">Nenhum fornecedor encontrado.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              </div>
              <div className="shrink-0 flex gap-3 p-6 pt-4 border-t border-slate-200 shadow-[0_-2px_4px_rgba(0,0,0,0.08)]">
                <button type="button" onClick={() => setModalMode('closed')} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supplier Step Popup */}
      {supplierStepOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-md p-6 my-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Truck size={18} /> Configurar fornecedor</h3>
              <button onClick={() => { setSupplierStepOpen(false); setScannedCode(''); }} className="text-slate-400 hover:text-slate-500"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Selecione um fornecedor existente ou cadastre um novo antes de adicionar o produto.</p>

            {supplierStepMode === 'select' ? (
              <>
                <div className="relative mb-3">
                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={(e) => setSupplierSearch(e.target.value)}
                    placeholder="Buscar fornecedor..."
                    className={inputCls}
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg mb-4">
                  {allSuppliers
                    .filter((s) => !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase()) || (s.contactName && s.contactName.toLowerCase().includes(supplierSearch.toLowerCase())))
                    .map((s) => (
                      <button key={s.id} type="button" onClick={() => handleSelectSupplierAndProceed(s)} className="w-full text-left px-3 py-2.5 text-sm hover:bg-[#EFF6FF] hover:text-[#1E3A5F] border-b border-slate-100 last:border-0">
                        <span className="font-medium">{s.name}</span>
                        {s.contactName && <span className="text-xs text-slate-400 ml-2">({s.contactName})</span>}
                      </button>
                    ))
                  }
                  {allSuppliers.filter((s) => !supplierSearch || s.name.toLowerCase().includes(supplierSearch.toLowerCase())).length === 0 && (
                    <div className="p-3 text-sm text-slate-400 text-center">Nenhum fornecedor encontrado.</div>
                  )}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={handleSkipSupplierStep} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Pular</button>
                  <button type="button" onClick={() => { setSupplierStepMode('create'); setSupplierForm(emptySupplierForm); }} className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] flex items-center justify-center gap-1.5"><Plus size={14} /> Novo fornecedor</button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nome do fornecedor *</label>
                    <input type="text" value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} className={inputCls} required autoFocus />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nome do contato</label>
                    <input type="text" value={supplierForm.contactName} onChange={(e) => setSupplierForm({ ...supplierForm, contactName: e.target.value })} className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                      <input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Telefone</label>
                      <input type="tel" value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">WhatsApp</label>
                    <input type="tel" value={supplierForm.whatsapp} onChange={(e) => setSupplierForm({ ...supplierForm, whatsapp: e.target.value })} className={inputCls} placeholder="5511999999999" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Metodo de notificacao</label>
                    <select value={supplierForm.notificationMethod} onChange={(e) => setSupplierForm({ ...supplierForm, notificationMethod: e.target.value as any })} className={inputCls}>
                      <option value="EMAIL">E-mail</option>
                      <option value="WHATSAPP">WhatsApp</option>
                      <option value="BOTH">Ambos</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={supplierForm.autoDispatch} onChange={(e) => setSupplierForm({ ...supplierForm, autoDispatch: e.target.checked })} className="rounded border-slate-300 text-[#1E3A5F] focus:ring-[#2563EB]" />
                    <span className="text-sm text-slate-700">Enviar cotacao automatica quando estoque baixo ou vencido</span>
                  </label>
                </div>
                <div className="flex gap-3 mt-4">
                  <button type="button" onClick={() => setSupplierStepMode('select')} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Selecionar existente</button>
                  <button type="button" onClick={handleCreateSupplierAndProceed} disabled={savingSupplier || !supplierForm.name.trim()} className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50">{savingSupplier ? 'Salvando...' : 'Criar e continuar'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Scan Duplicate Choice Dialog */}
      {scanDuplicateProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setScanDuplicateProduct(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Produto ja cadastrado</h2>
            <p className="text-sm text-slate-600 mb-1">
              <strong>{scanDuplicateProduct.name}</strong>
            </p>
            <p className="text-sm text-slate-500 mb-5">
              Estoque atual: {scanDuplicateProduct.quantity} {scanDuplicateProduct.unit}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setSelectedProduct(scanDuplicateProduct);
                  setMovType('IN');
                  setMovQty(1);
                  setMovReason('');
                  setModalMode('movement');
                  setScanDuplicateProduct(null);
                }}
                className="w-full px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
              >
                Atualizar quantidade
              </button>
              <button
                onClick={() => {
                  openEdit(scanDuplicateProduct);
                  setScanDuplicateProduct(null);
                }}
                className="w-full px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
              >
                Editar produto
              </button>
              <button
                onClick={() => setScanDuplicateProduct(null)}
                className="w-full px-4 py-2.5 text-slate-500 text-sm hover:text-slate-700"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Movement Modal */}
      {modalMode === 'movement' && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Movimentacao — {selectedProduct.name}</h3>
              <button onClick={() => setModalMode('closed')} className="text-slate-400 hover:text-slate-500"><X size={20} /></button>
            </div>
            {scannedCode && (
              <div className="mb-3 p-2.5 bg-slate-50 rounded-lg flex items-center gap-2">
                <Barcode size={14} className="text-slate-400" />
                <span className="text-xs text-slate-500">Codigo escaneado:</span>
                <span className="text-xs font-mono font-semibold text-slate-700">{scannedCode}</span>
              </div>
            )}
            <p className="text-sm text-slate-500 mb-4">Estoque atual: <span className="font-semibold text-slate-800">{selectedProduct.quantity} {selectedProduct.unit}</span></p>
            <form onSubmit={handleMovement} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setMovType('IN')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors ${movType === 'IN' ? 'bg-green-50 border-green-300 text-green-700' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>
                    <ArrowDownCircle size={16} /> Entrada
                  </button>
                  <button type="button" onClick={() => setMovType('OUT')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors ${movType === 'OUT' ? 'bg-red-50 border-red-300 text-red-700' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>
                    <ArrowUpCircle size={16} /> Saida
                  </button>
                  <button type="button" onClick={() => setMovType('ADJUSTMENT')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors ${movType === 'ADJUSTMENT' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>
                    Ajuste
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quantidade</label>
                <input type="number" value={movQty} onChange={(e) => setMovQty(Number(e.target.value))} className={inputCls} min={1} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Motivo</label>
                <input type="text" value={movReason} onChange={(e) => setMovReason(e.target.value)} className={inputCls} placeholder="Ex: Compra fornecedor, Venda, Ajuste inventario" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModalMode('closed')} className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-[#1E3A5F] text-white rounded-lg text-sm font-medium hover:bg-[#2A4D7A] disabled:opacity-50">{saving ? 'Registrando...' : 'Registrar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {modalMode === 'detail' && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-2xl p-6 my-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-semibold text-slate-800 text-lg">{selectedProduct.name}</h3>
                {selectedProduct.category && <span className="text-xs text-slate-500">{selectedProduct.category.name}</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => openMovement(selectedProduct)} className="p-2 rounded-lg hover:bg-green-50 text-green-600" title="Movimentacao"><ArrowUpCircle size={18} /></button>
                <button onClick={() => openEdit(selectedProduct)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="Editar"><Pencil size={18} /></button>
                <button onClick={() => setModalMode('closed')} className="text-slate-400 hover:text-slate-500"><X size={20} /></button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">Quantidade</p>
                <p className={`text-lg font-bold ${selectedProduct.minQuantity > 0 && selectedProduct.quantity <= selectedProduct.minQuantity ? 'text-red-600' : 'text-slate-800'}`}>{selectedProduct.quantity} {selectedProduct.unit}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">Minimo</p>
                <p className="text-lg font-bold text-slate-800">{selectedProduct.minQuantity}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">Custo</p>
                <p className="text-lg font-bold text-slate-800">{fmt(selectedProduct.costPrice)}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">Venda</p>
                <p className="text-lg font-bold text-slate-800">{fmt(selectedProduct.salePrice)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
              {selectedProduct.sku && <div><span className="text-slate-500">SKU:</span> <span className="text-slate-800">{selectedProduct.sku}</span></div>}
              {selectedProduct.supplier && <div><span className="text-slate-500">Fornecedor:</span> <span className="text-slate-800">{selectedProduct.supplier}</span></div>}
              {selectedProduct.batch && <div><span className="text-slate-500">Lote:</span> <span className="text-slate-800">{selectedProduct.batch}</span></div>}
              {selectedProduct.expiresAt && (
                <div>
                  <span className="text-slate-500">Validade:</span>{' '}
                  <span className={isExpired(selectedProduct.expiresAt) ? 'text-red-600 font-semibold' : isExpiringSoon(selectedProduct.expiresAt) ? 'text-amber-600 font-medium' : 'text-slate-800'}>
                    {format(new Date(selectedProduct.expiresAt), 'dd/MM/yyyy')}
                    {isExpired(selectedProduct.expiresAt) && ' (vencido)'}
                    {isExpiringSoon(selectedProduct.expiresAt) && !isExpired(selectedProduct.expiresAt) && ' (vence em breve)'}
                  </span>
                </div>
              )}
              <div><span className="text-slate-500">Margem:</span> <span className="text-slate-800">{margin(selectedProduct.costPrice, selectedProduct.salePrice)}</span></div>
            </div>

            {/* Movement History */}
            <h4 className="font-medium text-slate-700 mb-3">Historico de movimentacoes</h4>
            {!selectedProduct.movements || selectedProduct.movements.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Nenhuma movimentacao registrada.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {selectedProduct.movements.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      {m.type === 'IN' && <ArrowDownCircle size={16} className="text-green-600" />}
                      {m.type === 'OUT' && <ArrowUpCircle size={16} className="text-red-600" />}
                      {m.type === 'ADJUSTMENT' && <Eye size={16} className="text-blue-600" />}
                      <div>
                        <span className={`text-sm font-medium ${m.type === 'IN' ? 'text-green-700' : m.type === 'OUT' ? 'text-red-700' : 'text-blue-700'}`}>
                          {m.type === 'IN' ? `+${m.quantity}` : m.type === 'OUT' ? `-${m.quantity}` : `${m.quantity}`} {selectedProduct.unit}
                        </span>
                        {m.reason && <span className="text-xs text-slate-500 ml-2">{m.reason}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-slate-400">{format(new Date(m.createdAt), 'dd/MM HH:mm')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Barcode lookup loading overlay */}
      {barcodeLoading && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl px-8 py-6 flex flex-col items-center gap-3">
            <Loader2 size={32} className="text-[#1E3A5F] animate-spin" />
            <span className="text-sm font-medium text-slate-700">Buscando produto na base...</span>
          </div>
        </div>
      )}

      {/* Scanner Camera Modal — fully opaque bg to prevent camera reading screen text */}
      {cameraOpen && (
        <div className="fixed inset-0 bg-black flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Barcode size={20} />
                Escanear codigo de barras
              </h3>
              <button onClick={closeCameraModal} className="p-1.5 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="relative bg-black">
              <div id="scanner-region" className="w-full" />
              <style>{`
                @keyframes scanLineH { 0%,100% { left: 5%; } 50% { left: 85%; } }
                #scanner-region video { width: 100% !important; border-radius: 0 !important; object-fit: cover !important; }
                #scanner-region canvas.drawingBuffer { display: none !important; }
                #scanner-region { border: none !important; position: relative; }
              `}</style>
              {/* Viewfinder overlay — matches Quagga capture area (40/10/40/10) */}
              <div className="absolute pointer-events-none" style={{ top: '40%', left: '10%', right: '10%', bottom: '40%' }}>
                {/* Corner highlights */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-3 border-l-3 border-emerald-400 rounded-tl-md" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-3 border-r-3 border-emerald-400 rounded-tr-md" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-3 border-l-3 border-emerald-400 rounded-bl-md" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-3 border-r-3 border-emerald-400 rounded-br-md" />
                {/* Faint border */}
                <div className="absolute inset-0 border border-emerald-400/30 rounded-md" />
                {/* Horizontal scan line */}
                <div className="absolute top-1/2 -translate-y-1/2 h-0.5 w-4 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]" style={{ animation: 'scanLineH 2s ease-in-out infinite' }} />
              </div>
              {/* Torch button */}
              <button
                onClick={toggleTorch}
                className={`absolute top-3 right-3 p-2 rounded-full transition-colors ${torchOn ? 'bg-yellow-400 text-black' : 'bg-black/50 text-white'}`}
              >
                <Zap size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-center text-sm text-slate-500">
                Aponte a camera para o codigo de barras do produto
              </p>
              {/* Manual entry fallback after 60s */}
              {manualEntryMode && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700 mb-2 flex items-center gap-1.5">
                    <Keyboard size={14} />
                    Nao conseguiu escanear? Digite o codigo manualmente:
                  </p>
                  <form onSubmit={(e) => { e.preventDefault(); if (manualCode.trim().length >= 3) { processScannedCode(manualCode.trim()); } }} className="flex gap-2">
                    <input
                      type="text"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      placeholder="Digite o codigo de barras"
                      className="flex-1 px-3 py-2 border border-amber-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                      autoFocus
                    />
                    <button type="submit" className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600">
                      OK
                    </button>
                  </form>
                </div>
              )}
              <div className="flex gap-2">
                {!manualEntryMode && (
                  <button onClick={() => setManualEntryMode(true)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors flex items-center justify-center gap-1.5">
                    <Keyboard size={14} />
                    Digitar codigo
                  </button>
                )}
                <button onClick={closeCameraModal} className={`${manualEntryMode ? 'flex-1' : 'flex-1'} py-2.5 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300 transition-colors`}>
                  Cancelar
                </button>
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
      </>)}
    </div>
  );
}
