'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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

const DETECT_W = 640;         // detection canvas width (performance)
const DETECTION_MS = 120;     // run OpenCV every 120ms (~8fps) — rest of loop runs at 60fps
const STABLE_FRAMES = 12;     // 12 consecutive stable detections → auto-capture (~1.5s)
const STABLE_THRESHOLD = 12;  // px max corner movement in detection coords to count as stable
const EMA_ALPHA = 0.3;        // exponential smoothing for display (0=frozen, 1=raw)
const MIN_AREA_RATIO = 0.07;  // ignore contours covering <7% of frame (noise)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lerpPt(
  ax: number, ay: number,
  bx: number, by: number,
  α: number,
): { x: number; y: number } {
  return { x: α * bx + (1 - α) * ax, y: α * by + (1 - α) * ay };
}

function lerpCorners(prev: CornerSet, next: CornerSet, α: number): CornerSet {
  return {
    tl: lerpPt(prev.tl.x, prev.tl.y, next.tl.x, next.tl.y, α),
    tr: lerpPt(prev.tr.x, prev.tr.y, next.tr.x, next.tr.y, α),
    bl: lerpPt(prev.bl.x, prev.bl.y, next.bl.x, next.bl.y, α),
    br: lerpPt(prev.br.x, prev.br.y, next.br.x, next.br.y, α),
  };
}

function cornersMaxDist(a: CornerSet, b: CornerSet): number {
  return Math.max(
    Math.hypot(a.tl.x - b.tl.x, a.tl.y - b.tl.y),
    Math.hypot(a.tr.x - b.tr.x, a.tr.y - b.tr.y),
    Math.hypot(a.bl.x - b.bl.x, a.bl.y - b.bl.y),
    Math.hypot(a.br.x - b.br.x, a.br.y - b.br.y),
  );
}

function drawCornerOverlay(ctx: CanvasRenderingContext2D, c: CornerSet, progress: number) {
  const isGreen = progress > 0.4;
  const color = isGreen ? '#22c55e' : '#f59e0b';
  ctx.beginPath();
  ctx.moveTo(c.tl.x, c.tl.y);
  ctx.lineTo(c.tr.x, c.tr.y);
  ctx.lineTo(c.br.x, c.br.y);
  ctx.lineTo(c.bl.x, c.bl.y);
  ctx.closePath();
  ctx.fillStyle = isGreen ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.08)';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  // corner accent squares
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
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Detection state — all in refs to avoid stale closure issues in RAF loop
  const prevRawCornersRef = useRef<CornerSet | null>(null);  // raw, for stability check
  const smoothedCornersRef = useRef<CornerSet | null>(null); // EMA, for display
  const stableCountRef = useRef(0);
  const stableProgressRef = useRef(0);
  const lastDetectTimeRef = useRef(0);
  const didCaptureRef = useRef(false);

  const [mode, setMode] = useState<Mode>('starting');
  const [cvReady, setCvReady] = useState(false);
  const [docDetected, setDocDetected] = useState(false);
  const [stableProgress, setStableProgress] = useState(0);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // ── Fix 1: Programmatic OpenCV loading + onRuntimeInitialized ─────────────
  // next/script with strategy="lazyOnload" waits for browser idle — the camera
  // RAF loop prevents idle, so it never fires. We inject the script ourselves
  // and hook into cv.onRuntimeInitialized which fires when WASM is truly ready.
  useEffect(() => {
    let active = true;

    const initJscanify = () => {
      if (!active) return;
      import('jscanify/client')
        .then(({ default: Jscanify }) => {
          if (!active) return;
          scannerRef.current = new Jscanify();
          setCvReady(true);
        })
        .catch(() => { /* smart detection unavailable, manual shutter still works */ });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;

    if (w.cv && w.cv.Mat) {
      // Already fully initialized (hot reload or cached page)
      initJscanify();
      return () => { active = false; };
    }

    if (w.cv) {
      // Script loaded but WASM still initializing
      w.cv.onRuntimeInitialized = initJscanify;
      return () => { active = false; };
    }

    // Script already in DOM but loading (e.g. navigated back to page)
    const existing = document.querySelector('script[data-opencv]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => {
        if (!active) return;
        const cv2 = w.cv;
        if (!cv2) return;
        if (cv2.Mat) initJscanify(); else cv2.onRuntimeInitialized = initJscanify;
      }, { once: true });
      return () => { active = false; };
    }

    // Inject script for the first time
    const script = document.createElement('script');
    script.src = '/opencv.js';
    script.async = true;
    script.setAttribute('data-opencv', '1');
    script.onload = () => {
      if (!active) return;
      const cv2 = w.cv;
      if (!cv2) return;
      if (cv2.Mat) initJscanify(); else cv2.onRuntimeInitialized = initJscanify;
    };
    document.head.appendChild(script);

    return () => { active = false; };
  }, []);

  // ── Camera ─────────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null);
    didCaptureRef.current = false;
    prevRawCornersRef.current = null;
    smoothedCornersRef.current = null;
    stableCountRef.current = 0;
    stableProgressRef.current = 0;

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

  // ── Fix 3: Capture frame BEFORE stopping the stream ───────────────────────
  const runCapture = useCallback(() => {
    if (didCaptureRef.current) return;
    didCaptureRef.current = true;

    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      didCaptureRef.current = false;
      return;
    }

    // Stop detection loop
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

    setMode('processing');

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) { didCaptureRef.current = false; setMode('live'); return; }

    // 1️⃣  Grab the frame first
    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = vw;
    rawCanvas.height = vh;
    rawCanvas.getContext('2d')!.drawImage(video, 0, 0);

    // 2️⃣  THEN stop the stream (order matters — stopping before draw = black frame)
    streamRef.current?.getTracks().forEach((t) => t.stop());

    // Try jscanify perspective correction
    if (scannerRef.current && cvReady) {
      try {
        const outW = Math.min(vw, 2480);
        const outH = Math.round(outW * (297 / 210)); // A4 portrait ratio
        const result: HTMLCanvasElement | null = scannerRef.current.extractPaper(rawCanvas, outW, outH);
        if (result && result.width > 50) {
          setReviewUrl(result.toDataURL('image/jpeg', 0.92));
          setMode('review');
          return;
        }
      } catch { /* fall through to raw */ }
    }

    setReviewUrl(rawCanvas.toDataURL('image/jpeg', 0.92));
    setMode('review');
  }, [cvReady]);

  // ── Fix 2: Stable detection + smooth overlay ──────────────────────────────
  useEffect(() => {
    if (mode !== 'live') return;

    if (!tempCanvasRef.current) tempCanvasRef.current = document.createElement('canvas');
    const tempCanvas = tempCanvasRef.current;

    const tick = (timestamp: number) => {
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Sync overlay pixel size to its CSS size
      const ow = overlay.offsetWidth;
      const oh = overlay.offsetHeight;
      if (ow > 0 && oh > 0 && (overlay.width !== ow || overlay.height !== oh)) {
        overlay.width = ow;
        overlay.height = oh;
      }

      const overlayCtx = overlay.getContext('2d')!;
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

      // Always redraw the last smoothed corners at full 60fps (no flicker)
      if (smoothedCornersRef.current) {
        drawCornerOverlay(overlayCtx, smoothedCornersRef.current, stableProgressRef.current);
      }

      // OpenCV detection is throttled to DETECTION_MS
      if (!cvReady || !scannerRef.current || timestamp - lastDetectTimeRef.current < DETECTION_MS) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastDetectTimeRef.current = timestamp;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) { rafRef.current = requestAnimationFrame(tick); return; }

      // Scale down for fast detection
      const DETECT_H = Math.round((vh / vw) * DETECT_W);
      tempCanvas.width = DETECT_W;
      tempCanvas.height = DETECT_H;
      tempCanvas.getContext('2d')!.drawImage(video, 0, 0, DETECT_W, DETECT_H);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cv = (window as any).cv;
        const img = cv.imread(tempCanvas);
        const contour = scannerRef.current.findPaperContour(img);
        img.delete();

        if (!contour) {
          prevRawCornersRef.current = null;
          smoothedCornersRef.current = null;
          stableCountRef.current = 0;
          stableProgressRef.current = 0;
          setDocDetected(false);
          setStableProgress(0);
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        // Minimum area filter — avoids reacting to tiny noise contours
        const area = cv.contourArea(contour);
        const minArea = DETECT_W * DETECT_H * MIN_AREA_RATIO;
        if (area < minArea) {
          contour.delete();
          prevRawCornersRef.current = null;
          smoothedCornersRef.current = null;
          stableCountRef.current = 0;
          stableProgressRef.current = 0;
          setDocDetected(false);
          setStableProgress(0);
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        const raw = scannerRef.current.getCornerPoints(contour);
        contour.delete();

        if (!raw.topLeftCorner || !raw.topRightCorner || !raw.bottomLeftCorner || !raw.bottomRightCorner) {
          prevRawCornersRef.current = null;
          smoothedCornersRef.current = null;
          stableCountRef.current = 0;
          stableProgressRef.current = 0;
          setDocDetected(false);
          setStableProgress(0);
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        // Raw corners in detection-canvas coordinates
        const rawCorners: CornerSet = {
          tl: { x: raw.topLeftCorner.x, y: raw.topLeftCorner.y },
          tr: { x: raw.topRightCorner.x, y: raw.topRightCorner.y },
          bl: { x: raw.bottomLeftCorner.x, y: raw.bottomLeftCorner.y },
          br: { x: raw.bottomRightCorner.x, y: raw.bottomRightCorner.y },
        };

        // Stability check on raw corners (fast response)
        const prevRaw = prevRawCornersRef.current;
        const isStable = prevRaw !== null && cornersMaxDist(rawCorners, prevRaw) < STABLE_THRESHOLD;
        stableCountRef.current = isStable
          ? stableCountRef.current + 1
          : Math.max(0, stableCountRef.current - 1);
        prevRawCornersRef.current = rawCorners; // update AFTER stability check

        const progress = Math.min(stableCountRef.current / STABLE_FRAMES, 1);
        stableProgressRef.current = progress;

        // Scale raw to overlay display coords for EMA + rendering
        const sx = ow / DETECT_W;
        const sy = oh / DETECT_H;
        const scaledCorners: CornerSet = {
          tl: { x: rawCorners.tl.x * sx, y: rawCorners.tl.y * sy },
          tr: { x: rawCorners.tr.x * sx, y: rawCorners.tr.y * sy },
          bl: { x: rawCorners.bl.x * sx, y: rawCorners.bl.y * sy },
          br: { x: rawCorners.br.x * sx, y: rawCorners.br.y * sy },
        };

        // EMA smoothing for display — eliminates visual jitter
        smoothedCornersRef.current = lerpCorners(
          smoothedCornersRef.current ?? scaledCorners,
          scaledCorners,
          EMA_ALPHA,
        );

        setDocDetected(true);
        setStableProgress(progress);

        if (stableCountRef.current >= STABLE_FRAMES) {
          runCapture();
          return;
        }
      } catch {
        // Detection error — OpenCV might still be warm-starting
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [mode, cvReady, runCapture]);

  // ── Retake ─────────────────────────────────────────────────────────────────
  const handleRetake = useCallback(() => {
    prevRawCornersRef.current = null;
    smoothedCornersRef.current = null;
    stableCountRef.current = 0;
    stableProgressRef.current = 0;
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

  // ── Review ─────────────────────────────────────────────────────────────────
  if (mode === 'review' && reviewUrl) {
    return (
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
              type="range" min={60} max={180} value={brightness}
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
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (mode === 'error') {
    return (
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
    );
  }

  // ── Camera live view ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

        {/* Overlay canvas — redrawn at 60fps using cached smoothed corners */}
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Static A4 guide when no document detected */}
        {mode === 'live' && !docDetected && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="border-2 border-white/50 rounded" style={{ width: '85%', aspectRatio: '0.707' }}>
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
            <div className={`px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm transition-colors ${
              cvReady && docDetected && stableProgress > 0.4
                ? 'bg-green-500/80 text-white'
                : cvReady && docDetected
                ? 'bg-amber-500/80 text-white'
                : cvReady
                ? 'bg-black/50 text-white/60'
                : 'bg-black/40 text-white/40'
            }`}>
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

      {/* Controls */}
      <div className="bg-black px-6 py-6 flex items-center justify-between">
        <Button variant="ghost" size="icon" className="text-white h-12 w-12" onClick={onCancel}>
          <X className="h-6 w-6" />
        </Button>

        {/* Shutter — always available as fallback */}
        <button
          disabled={mode !== 'live'}
          onClick={runCapture}
          aria-label="Capturar documento"
          className="h-16 w-16 rounded-full bg-white disabled:opacity-40 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        >
          <Camera className="h-7 w-7 text-black" />
        </button>

        {/* OpenCV readiness dot */}
        <div className="h-12 w-12 flex items-center justify-center">
          <div
            className={`h-2.5 w-2.5 rounded-full transition-colors ${cvReady ? 'bg-green-400' : 'bg-amber-400 animate-pulse'}`}
            title={cvReady ? 'Detección automática lista' : 'Cargando OpenCV…'}
          />
        </div>
      </div>
    </div>
  );
}
