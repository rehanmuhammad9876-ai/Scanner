'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Scanner from '@/components/Scanner';
import InstallPWA from '@/components/InstallPWA';
import GoogleSheetConnect from '@/components/GoogleSheetConnect';
import {
  sendScan,
  sendScanToSupabase,
  type ScanPayload
} from '@/lib/sheet';
type DeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed';
type StoreUser = {
  storeId: string;
  storeName: string;
  storeCode: string;
  userId: string;
  fullName: string;
  role: 'spv' | 'assistant_spv' | 'staff';
};
type ScanItem = ScanPayload & {
  id: string;
  status: 'sending' | 'sent' | 'failed';
  sheetStatus?: DeliveryStatus;
  supabaseStatus?: DeliveryStatus;
  error?: string;
  sheetError?: string;
  supabaseError?: string;
};
const KEY = 'price_label_scan_items';
function nowStamp() { return new Date().toISOString(); }
function displayTime(timestamp: string) { return new Date(timestamp).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' }); }
function beep() { try { const Ctx = window.AudioContext; const ctx = new Ctx(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = 880; gain.gain.value = 0.07; osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .09); } catch {} }
export default function Home() {
 const [shelf, setShelf] = useState('');const [storeUser, setStoreUser] = useState<StoreUser | null>(null);
const [authLoading, setAuthLoading] = useState(true);

const [storeCode, setStoreCode] = useState('');
const [fullName, setFullName] = useState('');
const [pin, setPin] = useState('');
const [loginLoading, setLoginLoading] = useState(false);
const [loginError, setLoginError] = useState(''); const [barcode, setBarcode] = useState(''); const [shelfLocked, setShelfLocked] = useState(false); const [scanner, setScanner] = useState<'shelf'|'barcode'|null>(null); const [items, setItems] = useState<ScanItem[]>([]); const [toast, setToast] = useState(''); const [manualShelf, setManualShelf] = useState(false); const [manualBarcode, setManualBarcode] = useState(false); const barcodeRef = useRef<HTMLInputElement>(null); const shelfRef = useRef<HTMLInputElement>(null); const debounceRef = useRef(0);
 useEffect(() => { try { const stored = localStorage.getItem(KEY); if (stored) setItems(JSON.parse(stored) as ScanItem[]); } catch {} }, []);
  useEffect(() => {
  let active = true;

  async function checkSession() {
    try {
      const response = await fetch('/api/auth/store/me', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      });

      const data = await response.json();

      if (!active) return;

      if (data.authenticated && data.user) {
        setStoreUser(data.user);
      }
    } catch {
      console.error('Gagal memeriksa sesi login');
    } finally {
      if (active) setAuthLoading(false);
    }
  }

  void checkSession();

  return () => {
    active = false;
  };
}, []);
 useEffect(() => { localStorage.setItem(KEY, JSON.stringify(items)); }, [items]);
 const pending = useMemo(() => items.filter((item: ScanItem) => item.status !== 'sent').length, [items]);
 const notify = useCallback((text: string) => { setToast(text); window.setTimeout(() => setToast(''), 2200); }, []);
  
const syncItem = useCallback(async (item: ScanItem) => {
  const sheetStatus =
    item.sheetStatus ?? (item.status === 'sent' ? 'sent' : 'pending');

  const supabaseStatus =
    item.supabaseStatus ?? (item.status === 'sent' ? 'sent' : 'pending');

  const sendToSheet = sheetStatus !== 'sent';
  const sendToSupabase = supabaseStatus !== 'sent';

  setItems((prev: ScanItem[]) =>
    prev.map((x: ScanItem) =>
      x.id === item.id
        ? {
            ...x,
            status: 'sending',
            sheetStatus: sendToSheet ? 'sending' : 'sent',
            supabaseStatus: sendToSupabase ? 'sending' : 'sent',
            error: undefined,
          }
        : x
    )
  );

  const [sheetResult, supabaseResult] = await Promise.all([
    sendToSheet ? sendScan({ ...item, id: item.id }) : Promise.resolve(null),
    sendToSupabase
      ? sendScanToSupabase({ ...item, id: item.id })
      : Promise.resolve(null),
  ]);

  setItems((prev: ScanItem[]) =>
    prev.map((x: ScanItem) => {
      if (x.id !== item.id) return x;

      const finalSheet =
        sheetResult ? (sheetResult.ok ? 'sent' : 'failed') : sheetStatus;

      const finalSupabase =
        supabaseResult
          ? (supabaseResult.ok ? 'sent' : 'failed')
          : supabaseStatus;

      const allSent =
        finalSheet === 'sent' && finalSupabase === 'sent';

      const errors = [
        sheetResult && !sheetResult.ok
          ? `Google Sheet: ${sheetResult.message}`
          : '',
        supabaseResult && !supabaseResult.ok
          ? `Supabase: ${supabaseResult.message}`
          : '',
      ].filter(Boolean);

      return {
        ...x,
        sheetStatus: finalSheet,
        supabaseStatus: finalSupabase,
        status: allSent ? 'sent' : 'failed',
        error: errors.join(' | ') || undefined,
      };
    })
  );
}, []);

 const addScan = useCallback(async (code: string, format: string) => { const clean = code.trim(); if (!clean) return; if (scanner === 'shelf') { setShelf(clean.toUpperCase()); setShelfLocked(true); setScanner(null); notify(`Shelf aktif: ${clean}`); window.setTimeout(() => barcodeRef.current?.focus(), 100); return; }
 if (!shelfLocked || !shelf) { setScanner(null); notify('Scan atau isi Shelf terlebih dahulu'); shelfRef.current?.focus(); return; }
 setScanner(null);
setBarcode('');

const timestamp = nowStamp();

const item: ScanItem = {
  id: `${timestamp}-${Math.random().toString(16).slice(2)}`,
  shelf,
  barcode: clean,
  format,
  timestamp,
  status: 'sending', 
  sheetStatus: 'pending', 
  supabaseStatus: 'pending', 
};
 setItems((prev: ScanItem[]) => [item, ...prev]); beep(); if ('vibrate' in navigator) navigator.vibrate(70); notify('Scan berhasil'); window.setTimeout(() => barcodeRef.current?.focus(), 120); await syncItem(item);
 }, [scanner, shelf, shelfLocked, notify, syncItem]);
 const submitManual = async (kind: 'shelf'|'barcode') => { if (kind === 'shelf') { const value = shelf.trim(); if (!value) return; setShelf(value.toUpperCase()); setShelfLocked(true); setManualShelf(false); setToast('Shelf aktif'); setTimeout(() => barcodeRef.current?.focus(), 100); } else { if (!barcode.trim()) return; await addScan(barcode.trim(), 'MANUAL'); setManualBarcode(false); } };
 const retry = (item: ScanItem) => void syncItem(item);
 const scanFromCamera = useCallback((code: string, format: string) => { if (Date.now() - debounceRef.current < 800) return; debounceRef.current = Date.now(); void addScan(code, format); }, [addScan]);
 useEffect(() => { const onOnline = () => { items.filter((item: ScanItem) => item.status !== 'sent').forEach((item: ScanItem) => { void syncItem(item); }); }; window.addEventListener('online', onOnline); return () => window.removeEventListener('online', onOnline); }, [items, syncItem]);
 const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoginError('');

  if (!storeCode.trim() || !fullName.trim() || !pin.trim()) {
    setLoginError('Semua kolom wajib diisi');
    return;
  }

  setLoginLoading(true);

  try {
    const response = await fetch('/api/auth/store/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        storeCode,
        fullName,
        pin,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      setLoginError(data.error || 'Login gagal');
      return;
    }

    setStoreUser(data.user);
    setPin('');
    notify('Login berhasil');
  } catch {
    setLoginError('Koneksi gagal. Silakan coba kembali.');
  } finally {
    setLoginLoading(false);
  }
};
  if (authLoading) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="font-black text-xl text-indigo-950">
          PRICE LABEL SCANNER
        </div>
        <p className="text-slate-500 mt-2">Memeriksa sesi login...</p>
      </div>
    </main>
  );
}

if (!storeUser) {
  return (
    <main className="min-h-screen max-w-[480px] mx-auto bg-slate-50 flex items-center justify-center p-5">
      <form
        onSubmit={handleLogin}
        className="w-full bg-white rounded-2xl shadow-lg border p-6 space-y-4"
      >
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black text-indigo-950">
            PRICE LABEL
          </h1>
          <p className="text-sm text-slate-500">SCANNER</p>
          <p className="mt-4 font-bold text-lg">Login Pengguna</p>
        </div>

        <div>
          <label className="font-bold text-sm">Kode Toko</label>
          <input
            value={storeCode}
            onChange={(e) => setStoreCode(e.target.value)}
            placeholder="Masukkan kode toko"
            className="w-full border-2 rounded-xl p-3 mt-1"
            required
          />
        </div>

        <div>
          <label className="font-bold text-sm">Nama Pengguna</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Masukkan nama"
            className="w-full border-2 rounded-xl p-3 mt-1"
            required
          />
        </div>

        <div>
          <label className="font-bold text-sm">PIN</label>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Masukkan PIN"
            className="w-full border-2 rounded-xl p-3 mt-1"
            required
          />
        </div>

        {loginError && (
          <p className="text-sm text-red-600 font-bold">{loginError}</p>
        )}

        <button
          type="submit"
          disabled={loginLoading}
          className="w-full rounded-xl bg-indigo-950 text-white p-3 font-bold disabled:opacity-50"
        >
          {loginLoading ? 'Memeriksa...' : 'MASUK'}
        </button>
      </form>
    </main>
  );
}
 return <main className="min-h-screen max-w-[480px] mx-auto bg-slate-50 pb-8"><header className="bg-indigo-950 text-white px-4 py-4 sticky top-0 z-20 shadow"><div className="flex items-center justify-between"><div><div className="font-black text-xl tracking-wide">PRICE LABEL</div><div className="text-xs text-indigo-200">SCANNER</div></div><InstallPWA/></div><div className="mt-3 text-sm font-bold text-teal-300">Sync: {pending} tertunda</div><nav className="mt-3 flex gap-2 text-xs"><a className="rounded-lg bg-white/15 px-3 py-2" href="/">Price Label</a><a className="rounded-lg bg-white/15 px-3 py-2" href="/barcode-short">Barcode Pendek</a><a className="rounded-lg bg-white/15 px-3 py-2" href="/stock-take">Stock Take</a><a className="rounded-lg bg-white/15 px-3 py-2" href="/setting">Setting</a></nav></header>
 <section className="p-4 space-y-4"><GoogleSheetConnect /><div className="rounded-2xl bg-indigo-900 text-white p-4"><div className="text-xs text-indigo-200">SHELF AKTIF</div><div className="text-3xl font-black break-all">{shelfLocked ? shelf : '— Belum dipilih —'}</div>{shelfLocked && <button onClick={() => {setShelf('');setShelfLocked(false);shelfRef.current?.focus();}} className="mt-3 rounded-lg bg-white text-indigo-950 px-4 py-2 font-bold">Ganti Shelf</button>}</div>
 <div className="rounded-2xl bg-white border p-4 space-y-3"><label className="block font-bold text-lg">Shelf</label><input ref={shelfRef} disabled={shelfLocked} value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="Contoh AG01-03" className="w-full rounded-xl border-2 p-3 text-lg disabled:bg-slate-100"/><div className="grid grid-cols-2 gap-2"><button onClick={() => setScanner('shelf')} disabled={shelfLocked} className="rounded-xl bg-teal-600 text-white font-bold p-3 disabled:opacity-40">📷 Scan Kamera</button><button onClick={() => setManualShelf(true)} disabled={shelfLocked} className="rounded-xl border-2 p-3 font-bold disabled:opacity-40">✓ Enter Manual</button></div></div>
 <div className="rounded-2xl bg-white border p-4 space-y-3"><label className="block font-bold text-lg">Barcode</label><input ref={barcodeRef} value={barcode} onChange={(e) => setBarcode(e.target.value)} onKeyDown={(e) => {if(e.key==='Enter') void submitManual('barcode');}} placeholder="Scan atau ketik barcode" className="w-full rounded-xl border-2 p-3 text-lg"/><div className="grid grid-cols-2 gap-2"><button onClick={() => setScanner('barcode')} className="rounded-xl bg-teal-600 text-white font-bold p-3">📷 Scan Kamera</button><button onClick={() => setManualBarcode(true)} className="rounded-xl border-2 p-3 font-bold">✓ Enter Manual</button></div></div>
 <div className="rounded-2xl bg-white border p-4"><div className="flex justify-between items-center mb-3"><h2 className="font-black text-xl">DATA SCAN</h2><span className="rounded-full bg-indigo-100 text-indigo-900 px-3 py-1 font-bold">{items.length} total</span></div>{items.length>0 && <button onClick={() => { if(confirm('Hapus semua data scan lokal?')) setItems([]); }} className="mb-3 w-full rounded-lg bg-red-100 text-red-700 p-2 font-bold">Hapus Semua</button>}<div className="space-y-2">{items.map((item: ScanItem) => <article key={item.id} className="animate-[pop_.2s_ease-out] rounded-xl border p-3"><div className="flex justify-between gap-2"><div className="min-w-0"><div className="text-xs text-slate-500">SHELF</div><div className="font-black text-indigo-900 text-xl break-all">{item.shelf}</div><div className="text-xs text-slate-500 mt-1">BARCODE</div><div className="font-bold text-lg break-all">{item.barcode}</div><div className="text-xs text-slate-500 mt-1">{displayTime(item.timestamp)} · {item.format}</div></div><button onClick={() => setItems((prev: ScanItem[]) => prev.filter((x: ScanItem) => x.id !== item.id))} className="self-start rounded-lg bg-red-100 text-red-700 font-black px-3 py-2">X</button></div>
    <div className="mt-3 space-y-2 text-sm">
  <div className="flex justify-between">
    <span>Google Sheet</span>
    <strong>
      {(item.sheetStatus ?? (item.status === 'sent' ? 'sent' : 'pending')) === 'sent'
        ? 'Terkirim ✅'
        : (item.sheetStatus === 'sending' ? 'Mengirim...' : 'Belum terkirim ❌')}
    </strong>
  </div>

  <div className="flex justify-between">
    <span>Supabase</span>
    <strong>
      {(item.supabaseStatus ?? (item.status === 'sent' ? 'sent' : 'pending')) === 'sent'
        ? 'Tersimpan ✅'
        : (item.supabaseStatus === 'sending' ? 'Mengirim...' : 'Belum tersimpan ❌')}
    </strong>
  </div>

  {item.status !== 'sent' && (
    <button
      onClick={() => retry(item)}
      className="w-full rounded-lg bg-slate-100 px-3 py-2 font-bold"
    >
      Kirim Ulang
    </button>
  )}
</div>
   {item.error && <div className="text-xs text-red-600 mt-1">{item.error}</div>}</article>)}</div>{items.length===0&&<div className="py-8 text-center text-slate-400">Belum ada scan</div>}</div></section>
 {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 rounded-xl bg-slate-900 text-white px-5 py-3 shadow-lg">{toast}</div>}
 {scanner && <Scanner onScan={scanFromCamera} onClose={() => setScanner(null)} />}
 {manualShelf && <div className="fixed inset-0 z-50 bg-black/60 flex items-end"><div className="bg-white w-full max-w-[480px] mx-auto p-5 rounded-t-2xl"><h2 className="font-black text-xl mb-3">Shelf Manual</h2><input autoFocus value={shelf} onChange={(e) => setShelf(e.target.value)} className="border-2 rounded-xl p-3 w-full" placeholder="AG01-03"/><div className="grid grid-cols-2 gap-2 mt-3"><button onClick={() => setManualShelf(false)} className="p-3 rounded-xl border">Batal</button><button onClick={() => void submitManual('shelf')} className="p-3 rounded-xl bg-indigo-900 text-white font-bold">Aktifkan Shelf</button></div></div></div>}
 {manualBarcode && <div className="fixed inset-0 z-50 bg-black/60 flex items-end"><div className="bg-white w-full max-w-[480px] mx-auto p-5 rounded-t-2xl"><h2 className="font-black text-xl mb-3">Barcode Manual</h2><input autoFocus value={barcode} onChange={(e) => setBarcode(e.target.value)} onKeyDown={(e) => {if(e.key==='Enter') void submitManual('barcode');}} className="border-2 rounded-xl p-3 w-full" placeholder="Masukkan barcode"/><div className="grid grid-cols-2 gap-2 mt-3"><button onClick={() => setManualBarcode(false)} className="p-3 rounded-xl border">Batal</button><button onClick={() => void submitManual('barcode')} className="p-3 rounded-xl bg-teal-600 text-white font-bold">Simpan Scan</button></div></div></div>}
 </main>;
}
