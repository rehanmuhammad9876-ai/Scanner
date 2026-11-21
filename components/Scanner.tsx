'use client';

import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';

export default function Scanner({
  onScan,
  onClose,
}: {
  onScan: (code: string, format: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const onScanRef = useRef(onScan);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [error, setError] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const beep = () => {
    try {
      // Getar biar kerasa udah ke-scan
      if (navigator.vibrate) navigator.vibrate(80);
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1200;
      osc.type = 'square';
      gain.gain.value = 0.15;
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
      setTimeout(() => ctx.close(), 150);
    } catch {}
  };

  const handleResult = (code: string, format: string) => {
    const now = Date.now();
    // Biar bisa scan barang yang sama lagi setelah 1.2 detik, tapi gak dobel-dobel dalam 1 detik
    if (code === lastRef.current.code && now - lastRef.current.time < 1200) return;
    lastRef.current = { code, time: now };

    beep();
    setScanned(true);
    // Kasih jeda dikit biar user liat centang hijau, baru tutup
    setTimeout(() => {
      controlsRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onScanRef.current(code, format);
    }, 150);
  };

  useEffect(() => {
    let active = true;
    let rafId = 0;

    const start = async () => {
      const video = videoRef.current;
      if (!video) return;

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // Ini kuncinya buat barcode di barang: fokus terus-terusan
          advanced: [
            { focusMode: 'continuous' } as any,
            { exposureMode: 'continuous' } as any,
            { whiteBalanceMode: 'continuous' } as any,
          ],
        },
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();

        // 1. COBA PAKE DETECTOR BAWAAN HP DULU (PALING NGEBUT)
        const Detector = (window as any).BarcodeDetector;
        if (Detector) {
          const detector = new Detector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar', 'qr_code'],
          });

          const loop = async () => {
            if (!active) return;
            try {
              const codes = await detector.detect(video);
              if (codes.length > 0) {
                handleResult(String(codes[0].rawValue).trim(), codes[0].format);
                return; // udah dapet, berhenti loop
              }
            } catch {}
            rafId = requestAnimationFrame(loop);
          };
          rafId = requestAnimationFrame(loop);
          return;
        }

        // 2. KALO HP GAK SUPPORT, BARU PAKE ZXING
        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
          BarcodeFormat.CODABAR,
          BarcodeFormat.QR_CODE,
        ]);
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromStream(stream, video, (result) => {
          if (!active || !result) return;
          handleResult(result.getText().trim(), result.getBarcodeFormat().toString());
        });
        controlsRef.current = controls;
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'Kamera tidak dapat dibuka');
      }
    };

    start();

    return () => {
      active = false;
      cancelAnimationFrame(rafId);
      controlsRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTorch = async () => {
    const video = videoRef.current;
    const track = video?.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0] : undefined;
    const capabilities = track?.getCapabilities() as any;
    if (!track || !capabilities?.torch) {
      setError('Flash tidak didukung kamera ini');
      return;
    }
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] });
      setTorchOn(!torchOn);
      setError('');
    } catch {
      setError('Flash tidak dapat diaktifkan');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
      <div className="flex justify-between items-center p-4">
        <b>SCAN BARCODE</b>
        <button className="rounded-xl bg-white/15 px-4 py-2" onClick={onClose}>
          Tutup ✕
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline autoPlay />

        {/* Kotak scan lebih gede + lebih gampang kena barcode di barang */}
        <div className={`relative z-10 w-[92vw] max-w-md aspect-[16/9] border-4 rounded-2xl transition-colors ${scanned ? 'border-green-400 bg-green-400/20' : 'border-teal-400'} shadow-[0_0_0_999px_rgba(0,0,0,.35)]`}>
          {/* Garis laser jalan terus biar keliatan lagi nge-scan */}
          {!scanned && <div className="absolute left-0 right-0 h-[3px] bg-red-500 shadow-[0_0_12px_red] animate-[scan_1.2s_ease-in-out_infinite]" style={{ top: '50%' }} />}
          {scanned && <div className="absolute inset-0 flex items-center justify-center text-5xl">✅</div>}
        </div>

        <div className="absolute bottom-8 z-10 text-center text-sm bg-black/60 px-4 py-2 rounded-xl">
          {scanned ? 'Berhasil! Menyimpan...' : 'Tempel 7-10cm, miringkan dikit biar gak silau'}
        </div>

        {error && <div className="absolute top-4 z-20 bg-red-700 rounded-xl p-3 text-sm max-w-[90%] break-words">{error}</div>}
      </div>

      <style>{`@keyframes scan { 0%{transform:translateY(-60px);opacity:0} 20%{opacity:1} 80%{opacity:1} 100%{transform:translateY(60px);opacity:0} }`}</style>

      <div className="p-5 flex justify-center gap-3">
        <button onClick={toggleTorch} className="rounded-xl bg-slate-800 px-5 py-3">
          {torchOn ? '🔦 Flash ON' : '🔦 Flash'}
        </button>
      </div>
    </div>
  );
}
