import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QRScannerProps {
  onScan: (result: string) => void;
  onError?: (error: string) => void;
}

const CAMERA_OK_KEY = 'neoke_camera_ok';
let instanceCounter = 0;

export default function QRScanner({ onScan, onError }: QRScannerProps) {
  const liveId = useRef(`qr-live-${++instanceCounter}`);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startedRef = useRef(false);
  const scannedRef = useRef(false);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);

  // If camera was previously granted, show optimistic "Camera starting…"
  const hadCamera = localStorage.getItem(CAMERA_OK_KEY) === '1';

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const scanner = new Html5Qrcode(liveId.current);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
        (decodedText) => {
          if (scannedRef.current) return;
          scannedRef.current = true;
          onScan(decodedText);
        },
        () => {} // frame-level scan failure — normal, ignore
      )
      .then(() => {
        setIsStarting(false);
        // Remember that camera permission was granted
        localStorage.setItem(CAMERA_OK_KEY, '1');
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
          setCameraError(
            'Camera access is needed for QR scanning. Enable it in browser settings, or use "Take Photo" below.'
          );
          // Clear stored flag since permission was revoked
          localStorage.removeItem(CAMERA_OK_KEY);
        } else if (msg.toLowerCase().includes('no cameras') || msg.toLowerCase().includes('not found')) {
          setCameraError('No camera detected. Paste the URI manually.');
        } else {
          setCameraError('Camera unavailable. Use "Take Photo" or paste the URI manually.');
          onError?.(msg);
        }
        setIsStarting(false);
      });

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
      scannerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-3">
      {/* Live viewfinder */}
      {!cameraError && (
        <div className="relative w-full">
          {isStarting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-2xl z-10 gap-3 min-h-[260px]">
              <div className="w-8 h-8 border-2 border-[#5843de]/30 border-t-[#5843de] rounded-full animate-spin" />
              <p className="text-white/70 text-xs">
                {hadCamera ? 'Starting camera…' : 'Requesting camera access…'}
              </p>
            </div>
          )}
          <div
            id={liveId.current}
            className="w-full rounded-2xl overflow-hidden bg-black"
          />
          {/* Corner guides */}
          {!isStarting && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-52 h-52">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white rounded-br-lg" />
                {/* Scan line */}
                <div className="absolute left-2 right-2 h-px bg-blue-400/80 top-1/2 animate-pulse" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {cameraError && (
        <div className="flex flex-col items-center gap-3 p-5 bg-black/5 rounded-2xl text-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden className="text-[#868496]">
            <path
              d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.7" />
          </svg>
          <p className="text-sm text-[#868496] leading-relaxed">{cameraError}</p>
        </div>
      )}
    </div>
  );
}
