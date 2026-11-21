
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BrowserMultiFormatReader,
  DecodeHintType,
  BarcodeFormat,
} from '@zxing/browser';

export default function Scanner({
  onScan,
  onClose,
}: {
  onScan: (code: string, format: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastRef = useRef<string>('');
  const onScanRef = useRef(onScan);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  const [error, setError] = useState('');
  const [torchOn, setTorchOn] = useState(false);

  // Simpan callback terbaru tanpa membuka ulang kamera
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let active = true;

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

    const video = videoRef.current;

    if (!video) return;

    setError('');

    reader
      .decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        video,
        (result, err, controls) => {
          if (!active) {
            controls.stop();
            return;
          }

          controlsRef.current = controls;

          if (!result) return;

          const code = result.getText().trim();

          if (!code || code === lastRef.current) return;

          lastRef.current = code;

          // Tutup kamera otomatis ketika barcode berhasil dibaca
          controls.stop();
          controlsRef.current = null;

          onScanRef.current(
            code,
            result.getBarcodeFormat().toString()
          );
        }
      )
      .catch((e: unknown) => {
        if (!active) return;

        setError(
          e instanceof Error
            ? e.message
            : 'Kamera tidak dapat dibuka'
        );
      });

    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

  const toggleTorch = async () => {
    const video = videoRef.current;

    const track =
      video?.srcObject instanceof MediaStream
        ? video.srcObject.getVideoTracks()[0]
        : undefined;

    const capabilities = track?.getCapabilities() as
      | MediaTrackCapabilities & { torch?: boolean }
      | undefined;

    if (!track || !capabilities?.torch) {
      setError('Flash tidak didukung kamera ini');
      return;
    }

    try {
      await track.applyConstraints({
        advanced: [{ torch: !torchOn } as MediaTrackConstraintSet],
      });

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

        <button
          className="rounded-xl bg-white/15 px-4 py-2"
          onClick={onClose}
        >
          Tutup ✕
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          autoPlay
        />

        <div className="relative z-10 w-[88vw] max-w-sm aspect-[4/3] border-4 border-teal-400 rounded-2xl shadow-[0_0_0_999px_rgba(0,0,0,.35)]" />

        <div className="absolute bottom-8 z-10 text-center text-sm bg-black/60 px-4 py-2 rounded-xl">
          Dekatkan barcode, pastikan garis barcode terlihat jelas dan fokus
        </div>

        {error && (
          <div className="absolute top-4 z-20 bg-red-700 rounded-xl p-3 text-sm max-w-[90%] break-words">
            {error}
          </div>
        )}
      </div>

      <div className="p-5 flex justify-center gap-3">
        <button
          onClick={toggleTorch}
          className="rounded-xl bg-slate-800 px-5 py-3"
        >
          {torchOn ? '🔦 Flash ON' : '🔦 Flash'}
        </button>
      </div>
    </div>
  );
}
