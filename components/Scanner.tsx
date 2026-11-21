'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function Scanner({
  onScan,
  onClose,
}: {
  onScan: (code: string, format: string) => void;
  onClose: () => void;
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const streamRef = useRef<MediaStream | null>(null);

  const [error, setError] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(2); // Default 2x kaya punya temen lu, paling pas

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  // Fungsi zoom 1x / 2x / 3x - ini yang bikin barcode di barang langsung kena
  const applyZoom = async (z: number) => {
    setZoom(z);
    const video = document.querySelector('#reader video') as HTMLVideoElement;
    const track = video?.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : undefined;
    const caps = track?.getCapabilities() as any;
    if (track && caps?.zoom) {
      try {
        const min = caps.zoom.min || 1;
        const max = caps.zoom.max || 3;
        await track.applyConstraints({ advanced: [{ zoom: Math.min(Math.max(z, min), max) } as any] });
      } catch {}
    }
  };

  useEffect(() => {
    let active = true;
    const id = 'reader';

    const start = async () => {
      const scanner = new Html5Qrcode(id);
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: 'environment' },
          {
            // INI SETTINGAN PUNYA TEMEN LU, YANG BIKIN SECEPET ITU
            fps: 30, // 30x cek per detik, kena dikit langsung masuk
            qrbox: { width: 320, height: 140 }, // Kotak lebar pendek, pas bentuk barcode
            aspectRatio: 1.5,
            disableFlip: false,
            // Paksa pake Detector bawaan HP dulu, ini yang paling ngebut
            experimentalFeatures: {
              useBarCodeDetectorIfSupported: true,
            },
            videoConstraints: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 },
              advanced: [{ focusMode: 'continuous' } as any],
            } as any,
          },
          (decodedText) => {
            if (!active) return;
            // Getar + bunyi
            if (navigator.vibrate) navigator.vibrate(60);
            // Langsung stop & kirim, jangan nunggu
            scanner.stop().catch(() => {}).finally(() => {
              onScanRef.current(decodedText.trim(), 'CODE');
            });
          },
          () => {} // abaikan gagal scan per-frame, biar gak ngelag
        );

        // Auto set zoom ke 2x kaya di video temen lu
        setTimeout(() => applyZoom(2), 500);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Kamera tidak dapat dibuka');
      }
    };

    start();

    return () => {
      active = false;
      scannerRef.current?.stop().catch(() => {});
      scannerRef.current?.clear().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTorch = async () => {
    const video = document.querySelector('#reader video') as HTMLVideoElement;
    const track = video?.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : undefined;
    const caps = track?.getCapabilities() as any;
    if (!track || !caps?.torch) { setError('Flash tidak didukung'); return; }
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] });
      setTorchOn(!torchOn);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
      <div className="flex justify-between items-center p-4">
        <b>SCAN BARCODE</b>
        <button className="rounded-xl bg-white/15 px-4 py-2" onClick={async () => { await scannerRef.current?.stop().catch(() => {}); onClose(); }}>✕</button>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
        {/* Ini tempat scanner html5-qrcode nempel */}
        <div id="reader" className="w-full h-full [&>video]:!w-full [&>video]:!h-full [&>video]:object-cover" />
      </div>

      {/* TOMBOL 1x 2x 3x PERSIS PUNYA TEMEN LU */}
      <div className="pb-3 flex justify-center items-center gap-2">
        <div className="flex bg-white/15 rounded-full p-1 gap-1">
          {[1, 2, 3].map((z) => (
            <button key={z} onClick={() => applyZoom(z)} className={`w-11 h-11 rounded-full font-bold ${zoom === z ? 'bg-white text-black' : 'text-white'}`}>{z}x</button>
          ))}
          <button onClick={toggleTorch} className={`w-11 h-11 rounded-full ${torchOn ? 'bg-yellow-400 text-black' : 'text-white'}`}>💡</button>
        </div>
      </div>
      <p className="text-center text-sm pb-4 text-white/70">Arahkan kamera ke barcode</p>
      {error && <div className="mx-4 mb-4 bg-red-700 rounded-xl p-3 text-sm">{error}</div>}
    </div>
  );
}
