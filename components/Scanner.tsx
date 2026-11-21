'use client';
import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
export default function Scanner({ onScan, onClose }: { onScan: (code: string, format: string) => void; onClose: () => void; }) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(2);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  const applyZoom = async (z: number) => {
    setZoom(z);
    const video = document.querySelector('#reader video') as HTMLVideoElement;
    const track = video?.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : undefined;
    const caps = track?.getCapabilities() as any;
    if (track && caps?.zoom) {
      try { await track.applyConstraints({ advanced: [{ zoom: Math.min(Math.max(z, caps.zoom.min || 1), caps.zoom.max || 3) } as any] }); } catch {}
    }
  };
  useEffect(() => {
    let active = true;
    const scanner = new Html5Qrcode('reader');
    scannerRef.current = scanner;
    const config = {
      fps: 30,
      qrbox: { width: 320, height: 140 },
      aspectRatio: 1.5,
      disableFlip: false,
      videoConstraints: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    } as any;
    scanner.start({ facingMode: 'environment' }, config, (decodedText) => {
      if (!active) return;
      if (navigator.vibrate) navigator.vibrate(60);
      scanner.stop().catch(() => {}).finally(() => { onScanRef.current(decodedText.trim(), 'CODE'); });
    }, () => {}).then(() => setTimeout(() => applyZoom(2), 500)).catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Kamera tidak dapat dibuka'); });
    return () => { active = false; scannerRef.current?.stop().catch(() => {}); scannerRef.current?.clear().catch(() => {}); };
  }, []);
  const toggleTorch = async () => {
    const video = document.querySelector('#reader video') as HTMLVideoElement;
    const track = video?.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : undefined;
    const caps = track?.getCapabilities() as any;
    if (!track || !caps?.torch) { setError('Flash tidak didukung'); return; }
    try { await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] }); setTorchOn(!torchOn); } catch {}
  };
  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
      <div className="flex justify-between items-center p-4"><b>SCAN BARCODE</b><button className="rounded-xl bg-white/15 px-4 py-2" onClick={async () => { await scannerRef.current?.stop().catch(() => {}); onClose(); }}>✕</button></div>
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black"><div id="reader" className="w-full h-full [&>video]:!w-full [&>video]:!h-full [&>video]:object-cover" /></div>
      <div className="pb-3 flex justify-center"><div className="flex bg-white/15 rounded-full p-1 gap-1">{[1, 2, 3].map((z) => (<button key={z} onClick={() => applyZoom(z)} className={`w-11 h-11 rounded-full font-bold ${zoom === z ? 'bg-white text-black' : 'text-white'}`}>{z}x</button>))}<button onClick={toggleTorch} className={`w-11 h-11 rounded-full ${torchOn ? 'bg-yellow-400 text-black' : 'text-white'}`}>💡</button></div></div>
      <p className="text-center text-sm pb-4 text-white/70">Arahkan kamera ke barcode</p>
      {error && <div className="mx-4 mb-4 bg-red-700 rounded-xl p-3 text-sm">{error}</div>}
    </div>
  );
      }
