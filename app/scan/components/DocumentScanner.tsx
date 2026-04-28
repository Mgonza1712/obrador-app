'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';
import { Button } from '@/components/ui/button';
import { Camera, X, RotateCcw, Check } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'starting' | 'live' | 'processing' | 'review' | 'error';

interface CornerSet {
  tl: { x: number; y: number };
  tr: { x: number; y: number };
  bl: { x: number; y: number };
  br: { x: number; y: number };
}

export interface DocumentScannerProps {
  onCapture: (processedDataUrl: string) => void;
  onCancel: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DETECT_W = 640; // detection canvas width (performance)
const DETECTION_MS = 100; // run detection every 100ms (~10fps)
const STABLE_FRAMES = 15; // ~1.5s at 10fps
const CORNER_THRESHOLD = 18; // px — max allowed corner movement to count as "stable"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cornersMaxDist(a: CornerSet, b: CornerSet): number {
  const pts: Array<keyof CornerSet> = ['tl', 'tr', 'bl', 'br'];
  return Math.max(...pts.map((k) => Math.hypot(a[k].x - b[k].x, a[k].y - b[k].y)));
}

function drawCornerOverlay(
  ctx: CanvasRenderingContext2D,
  c: CornerSet,
  progress: number,
) {
  const color = progress > 0.4 ? '#22c55e' : '#f59e0b';
  const fill = progress > 0.4 ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.08)';
  ctx.beginPath();
  ctx.moveTo(c.tl.x, c.tl.y);
  ctx.lineTo(c.tr.x, c.tr.y);
  ctx.lineTo(c.br.x, c.br.y);
  ctx.lineTo(c.bl.x, c.bl.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Corner accent squares
  const PX = 12;
  ctx.fillStyle = color;
  for (const p of [c.tl, c.tr, c.bl, c.br]) {
    ctx.fillRect(p.x - PX / 2, p.y - PX / 2, PX, PX);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DocumentScanner({ onCapture, onCancel }: DocumentScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const stableCountRef = useRef(0);
  const prevCornersRef = useRef<CornerSet | null>(null);
  const lastDetectTimeRef = useRef(0);
  const didCaptureRef = useRef(false);
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [mode, setMode] = useState<Mode>('starting');
  const [cvReady, setCvReady] = useState(false);
  const [docDetected, setDocDetected] = useState(false);
  const [stableProgress, setStableProgress] = useState(0);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // ── OpenCV readiness check ─────────────────────────────────────────────────
  const pollCvReady = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.cv && w.cv.Mat) {
      setCvReady(true);
    } else {
      setTimeout(pollCvReady, 250);
    }
  }, []);

  const handleOpenCvLoad = useCallback(() => {
    // jscanify/client is the browser-only build (no canvas/jsdom Node deps)
    import('jscanify/client').then(({ default: Jscanify }) => {
      scannerRef.current = new Jscanify();
      pollCvReady();
    }).catch(() => { /* smart detection unavailable */ });
  }, [pollCvReady]);

  // ── Camera ─────────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null);
    didCaptureRef.current = false;
    stableCountRef.current = 0;
    prevCornersRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 4096 },
          height: { ideal: 3072 },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.onloadedmetadata = () => video.play().then(() => setMode('live'));
      }
    } catch {
      setCameraError('No se pudo acceder a la cámara. Verifica los permisos.');
      setMode('error');
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  // ── Capture + extraction ───────────────────────────────────────────────────
  const runCapture = useCallback(() => {
    if (didCaptureRef.current) return;
    didCaptureRef.current = true;

    const video = videoRef.current;
    if (!video) return;

    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setMode('processing');

    // Grab full-resolution frame
    const vw = video.videoWidth || 1920;
    const vh = video.videoHeight || 1080;
    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = vw;
    rawCanvas.height = vh;
    rawCanvas.getContext('2d')!.drawImage(video, 0, 0);

    if (scannerRef.current && cvReady) {
      try {
        // A4-proportioned output at ~2x the detection resolution
        const outW = Math.min(vw, 2480);
        const outH = Math.round(outW * (297 / 210)); // A4 portrait
        const result: HTMLCanvasElement | null = scannerRef.current.extractPaper(rawCanvas, outW, outH);
        if (result && result.width > 50) {
          setReviewUrl(result.toDataURL('image/jpeg', 0.92));
          setMode('review');
          return;
        }
      } catch { /* fall through */ }
    }

    // Fallback: send raw frame
    setReviewUrl(rawCanvas.toDataURL('image/jpeg', 0.92));
    setMode('review');
  }, [cvReady]);

  // ── Detection loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'live') return;

    if (!tempCanvasRef.current) {
      tempCanvasRef.current = document.createElement('canvas');
    }
    const tempCanvas = tempCanvasRef.current;

    const tick = (timestamp: number) => {
      const video = videoRef.current;
      const overlay = overlayRef.current;

      if (!video || !overlay || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Always sync overlay size to element display size
      const ow = overlay.offsetWidth;
      const oh = overlay.offsetHeight;
      if (ow > 0 && oh > 0 && (overlay.width !== ow || overlay.height !== oh)) {
        overlay.width = ow;
        overlay.height = oh;
      }

      // Throttle detection — clear overlay between ticks so it doesn't linger
      const overlayCtx = overlay.getContext('2d')!;

      if (!cvReady || !scannerRef.current) {
        overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (timestamp - lastDetectTimeRef.current < DETECTION_MS) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastDetectTimeRef.current = timestamp;

      // Draw scaled frame for detection
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) { rafRef.current = requestAnimationFrame(tick); return; }

      const DETECT_H = Math.round((vh / vw) * DETECT_W);
      tempCanvas.width = DETECT_W;
      tempCanvas.height = DETECT_H;
      tempCanvas.getContext('2d')!.drawImage(video, 0, 0, DETECT_W, DETECT_H);

      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const img = (window as any).cv.imread(tempCanvas);
        const contour = scannerRef.current.findPaperContour(img);
        img.delete();

        if (contour) {
          const raw = scannerRef.current.getCornerPoints(contour);
          contour.delete();

          if (raw.topLeftCorner && raw.topRightCorner && raw.bottomLeftCorner && raw.bottomRightCorner) {
            const sx = ow / DETECT_W;
            const sy = oh / DETECT_H;
            const corners: CornerSet = {
              tl: { x: raw.topLeftCorner.x * sx, y: raw.topLeftCorner.y * sy },
              tr: { x: raw.topRightCorner.x * sx, y: raw.topRightCorner.y * sy },
              bl: { x: raw.bottomLeftCorner.x * sx, y: raw.bottomLeftCorner.y * sy },
              br: { x: raw.bottomRightCorner.x * sx, y: raw.bottomRightCorner.y * sy },
            };

            const prev = prevCornersRef.current;
            const isStable = prev !== null && cornersMaxDist(corners, prev) < CORNER_THRESHOLD;
            stableCountRef.current = isStable
              ? stableCountRef.current + 1
              : Math.max(0, stableCountRef.current - 2);
            prevCornersRef.current = corners;

            const progress = Math.min(stableCountRef.current / STABLE_FRAMES, 1);
            drawCornerOverlay(overlayCtx, corners, progress);

            setDocDetected(true);
            setStableProgress(progress);

            if (stableCountRef.current >= STABLE_FRAMES) {
              runCapture();
              return;
            }
          } else {
            prevCornersRef.current = null;
            stableCountRef.current = 0;
            setDocDetected(false);
            setStableProgress(0);
          }
        } else {
          prevCornersRef.current = null;
          stableCountRef.current = 0;
          setDocDetected(false);
          setStableProgress(0);
        }
      } catch {
        overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [mode, cvReady, runCapture]);

  // ── Retake ─────────────────────────────────────────────────────────────────
  const handleRetake = useCallback(() => {
    stableCountRef.current = 0;
    prevCornersRef.current = null;
    setDocDetected(false);
    setStableProgress(0);
    setReviewUrl(null);
    setBrightness(100);
    setMode('starting');
    startCamera();
  }, [startCamera]);

  // ── Confirm ────────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!reviewUrl) return;
    if (brightness === 100) {
      onCapture(reviewUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.filter = `brightness(${brightness}%)`;
      ctx.drawImage(img, 0, 0);
      onCapture(c.toDataURL('image/jpeg', 0.90));
    };
    img.src = reviewUrl;
  }, [reviewUrl, brightness, onCapture]);

  // ── Review screen ──────────────────────────────────────────────────────────
  if (mode === 'review' && reviewUrl) {
    return (
      <>
        <Script src="/opencv.js" strategy="lazyOnload" onLoad={handleOpenCvLoad} />
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex-1 relative flex items-center justify-center overflow-hidden p-2">
            <img
              src={reviewUrl}
              alt="Captura del documento"
              style={{ filter: `brightness(${brightness}%)` }}
              className="max-h-full max-w-full object-contain rounded"
            />
          </div>
          <div className="bg-background px-4 pt-4 pb-6 space-y-3 border-t">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-14 shrink-0">Brillo</span>
              <input
                type="range"
                min={60}
                max={180}
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-xs text-muted-foreground w-8 text-right">{brightness}%</span>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleRetake}>
                <RotateCcw className="h-4 w-4 mr-2" /> Repetir
              </Button>
              <Button className="flex-1" onClick={handleConfirm}>
                <Check className="h-4 w-4 mr-2" /> Confirmar
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Error screen ───────────────────────────────────────────────────────────
  if (mode === 'error') {
    return (
      <>
        <Script src="/opencv.js" strategy="lazyOnload" onLoad={handleOpenCvLoad} />
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
          <div className="text-center text-white px-6 space-y-4">
            <p className="text-sm">{cameraError}</p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" size="sm" onClick={handleRetake}>
                <RotateCcw className="h-4 w-4 mr-2" /> Reintentar
              </Button>
              <Button variant="ghost" size="sm" className="text-white" onClick={onCancel}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Camera live view (starting | live | processing) ────────────────────────
  return (
    <>
      <Script src="/opencv.js" strategy="lazyOnload" onLoad={handleOpenCvLoad} />

      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="relative flex-1 overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />

          {/* Real-time detection overlay */}
          <canvas
            ref={overlayRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />

          {/* Static A4 guide — shown when OpenCV not yet ready or no document detected */}
          {mode === 'live' && !docDetected && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="border-2 border-white/50 rounded"
                style={{ width: '85%', aspectRatio: '0.707' }}
              >
                {(
                  [
                    'top-0 left-0 border-t-4 border-l-4 rounded-tl',
                    'top-0 right-0 border-t-4 border-r-4 rounded-tr',
                    'bottom-0 left-0 border-b-4 border-l-4 rounded-bl',
                    'bottom-0 right-0 border-b-4 border-r-4 rounded-br',
                  ] as const
                ).map((cls, i) => (
                  <div key={i} className={`absolute w-6 h-6 border-white ${cls}`} />
                ))}
              </div>
            </div>
          )}

          {/* Status pill */}
          {mode === 'live' && (
            <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
              <div
                className={`px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm transition-colors ${
                  cvReady && docDetected && stableProgress > 0.4
                    ? 'bg-green-500/80 text-white'
                    : cvReady && docDetected
                    ? 'bg-amber-500/80 text-white'
                    : cvReady
                    ? 'bg-black/50 text-white/60'
                    : 'bg-black/40 text-white/40'
                }`}
              >
                {!cvReady
                  ? 'Cargando detección automática…'
                  : docDetected && stableProgress > 0.4
                  ? `Capturando… ${Math.round(stableProgress * 100)}%`
                  : docDetected
                  ? 'Mantén el documento estable'
                  : 'Apunta al documento'}
              </div>
            </div>
          )}

          {/* Processing spinner */}
          {mode === 'processing' && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
              <div className="text-white text-center space-y-3">
                <div className="h-10 w-10 rounded-full border-2 border-white border-t-transparent animate-spin mx-auto" />
                <p className="text-sm">Procesando…</p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom controls */}
        <div className="bg-black px-6 py-6 flex items-center justify-between">
          {/* Cancel */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white h-12 w-12"
            onClick={onCancel}
          >
            <X className="h-6 w-6" />
          </Button>

          {/* Shutter */}
          <button
            disabled={mode !== 'live'}
            onClick={runCapture}
            aria-label="Capturar documento"
            className="h-16 w-16 rounded-full bg-white disabled:opacity-40 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          >
            <Camera className="h-7 w-7 text-black" />
          </button>

          {/* OpenCV status indicator */}
          <div className="h-12 w-12 flex items-center justify-center">
            <div
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                cvReady ? 'bg-green-400' : 'bg-amber-400 animate-pulse'
              }`}
              title={cvReady ? 'Detección automática lista' : 'Cargando OpenCV…'}
            />
          </div>
        </div>
      </div>
    </>
  );
}
