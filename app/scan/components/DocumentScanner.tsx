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

interface VideoRect { x: number; y: number; w: number; h: number }

export interface DocumentScannerProps {
  onCapture: (processedDataUrl: string) => void;
  onCancel: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DETECT_W = 640;
const DETECTION_MS = 120;
const STABLE_FRAMES = 12;
const STABLE_THRESHOLD = 12;     // px in detection-canvas coords
const EMA_ALPHA = 0.3;
const MIN_AREA_RATIO = 0.07;
const EXTRACT_MIN_AREA_RATIO = 0.15;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Rect where video is displayed within a container using object-contain semantics */
function getContainRect(cw: number, ch: number, vw: number, vh: number): VideoRect {
  const scale = Math.min(cw / vw, ch / vh);
  const w = vw * scale;
  const h = vh * scale;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

/**
 * Maps a tap position (in container coords) to normalized [0,1] video coords.
 * Returns null if the tap is in the letterbox area (outside the video rect).
 */
function tapToVideoNorm(
  tapX: number, tapY: number,
  cw: number, ch: number,
  vw: number, vh: number,
): { x: number; y: number } | null {
  const r = getContainRect(cw, ch, vw, vh);
  if (tapX < r.x || tapX > r.x + r.w || tapY < r.y || tapY > r.y + r.h) return null;
  return { x: (tapX - r.x) / r.w, y: (tapY - r.y) / r.h };
}

function lerpPt(ax: number, ay: number, bx: number, by: number, α: number) {
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
  ctx.beginPath();
  ctx.moveTo(c.tl.x, c.tl.y);
  ctx.lineTo(c.tr.x, c.tr.y);
  ctx.lineTo(c.br.x, c.br.y);
  ctx.lineTo(c.bl.x, c.bl.y);
  ctx.closePath();
  ctx.fillStyle = isGreen ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.08)';
  ctx.fill();
  ctx.strokeStyle = isGreen ? '#22c55e' : '#f59e0b';
  ctx.lineWidth = 3;
  ctx.stroke();
  const PX = 12;
  ctx.fillStyle = isGreen ? '#22c55e' : '#f59e0b';
  for (const p of [c.tl, c.tr, c.bl, c.br]) {
    ctx.fillRect(p.x - PX / 2, p.y - PX / 2, PX, PX);
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DocumentScanner({ onCapture, onCancel }: DocumentScannerProps) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const rafRef     = useRef<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const tempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detection refs — avoid stale closures in RAF loop
  const prevRawCornersRef  = useRef<CornerSet | null>(null);
  const smoothedCornersRef = useRef<CornerSet | null>(null);
  const stableCountRef     = useRef(0);
  const stableProgressRef  = useRef(0);
  const lastDetectTimeRef  = useRef(0);
  const didCaptureRef      = useRef(false);

  const [mode, setMode]               = useState<Mode>('starting');
  const [cvReady, setCvReady]         = useState(false);
  const [docDetected, setDocDetected] = useState(false);
  const [stableProgress, setStableProgress] = useState(0);
  const [reviewUrl, setReviewUrl]     = useState<string | null>(null);
  const [brightness, setBrightness]   = useState(100);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [focusRing, setFocusRing]     = useState<{ x: number; y: number } | null>(null);
  // Rect where the video is actually drawn (object-contain letterbox awareness)
  const [videoRect, setVideoRect]     = useState<VideoRect | null>(null);

  // ── OpenCV loading ─────────────────────────────────────────────────────────
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
        .catch(() => {});
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.cv?.Mat) { initJscanify(); return () => { active = false; }; }
    if (w.cv)       { w.cv.onRuntimeInitialized = initJscanify; return () => { active = false; }; }

    const existing = document.querySelector('script[data-opencv]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => {
        if (!active) return;
        if (w.cv?.Mat) initJscanify(); else if (w.cv) w.cv.onRuntimeInitialized = initJscanify;
      }, { once: true });
      return () => { active = false; };
    }

    const script = document.createElement('script');
    script.src = '/opencv.js';
    script.async = true;
    script.setAttribute('data-opencv', '1');
    script.onload = () => {
      if (!active) return;
      if (w.cv?.Mat) initJscanify(); else if (w.cv) w.cv.onRuntimeInitialized = initJscanify;
    };
    document.head.appendChild(script);
    return () => { active = false; };
  }, []);

  // ── Camera ─────────────────────────────────────────────────────────────────
  // Root cause fix: minimal constraints only.
  // - No width/height: iOS picks its native video mode → autofocus works
  // - No applyConstraints(focusMode): not supported on WebKit, silently fails
  // - facingMode as string (not object): broader iOS compatibility
  const startCamera = useCallback(async () => {
    setCameraError(null);
    didCaptureRef.current = false;
    prevRawCornersRef.current = null;
    smoothedCornersRef.current = null;
    stableCountRef.current = 0;
    stableProgressRef.current = 0;
    setVideoRect(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play().then(() => {
          setMode('live');
          // Compute where the video is displayed (for overlay alignment)
          const container = containerRef.current;
          if (container && video.videoWidth) {
            setVideoRect(getContainRect(
              container.clientWidth,
              container.clientHeight,
              video.videoWidth,
              video.videoHeight,
            ));
          }
        });
      };
    } catch {
      setCameraError('No se pudo acceder a la cámara. Verifica los permisos.');
      setMode('error');
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  // ── Tap-to-focus ────────────────────────────────────────────────────────────
  // object-contain coordinate mapping: tap inside video area → normalized [0,1]
  const handleTapToFocus = useCallback(async (e: React.TouchEvent | React.MouseEvent) => {
    if (mode !== 'live') return;
    const video = videoRef.current;
    const track = streamRef.current?.getVideoTracks()[0];
    const container = containerRef.current;
    if (!video || !track || !container) return;

    const rect = container.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const tapX = clientX - rect.left;
    const tapY = clientY - rect.top;

    // Ignore taps in letterbox area
    const norm = tapToVideoNorm(tapX, tapY, container.clientWidth, container.clientHeight, video.videoWidth, video.videoHeight);
    if (!norm) return;

    // Visual focus ring
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    setFocusRing({ x: tapX, y: tapY });
    focusTimerRef.current = setTimeout(() => setFocusRing(null), 1500);

    // pointOfInterest — best-effort, silently ignored on unsupported devices
    try {
      await track.applyConstraints({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        advanced: [{ focusMode: 'manual', pointOfInterest: norm } as any],
      });
      setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => {});
      }, 3000);
    } catch { /* device doesn't support — no-op */ }
  }, [mode]);

  // ── Capture ─────────────────────────────────────────────────────────────────
  // object-contain: drawImage(video, 0, 0, vw, vh) captures the FULL video frame
  // which is exactly what the user sees on screen (no crop mismatch).
  const runCapture = useCallback(() => {
    if (didCaptureRef.current) return;
    didCaptureRef.current = true;

    const video = videoRef.current;
    if (!video || video.readyState < 2) { didCaptureRef.current = false; return; }

    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setMode('processing');

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) { didCaptureRef.current = false; setMode('live'); return; }

    // 1️⃣  Capture frame BEFORE stopping stream
    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = vw;
    rawCanvas.height = vh;
    rawCanvas.getContext('2d')!.drawImage(video, 0, 0);

    // 2️⃣  Stop stream AFTER capture
    streamRef.current?.getTracks().forEach((t) => t.stop());

    if (scannerRef.current && cvReady) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cv = (window as any).cv;
        const imgMat = cv.imread(rawCanvas);
        const contour = scannerRef.current.findPaperContour(imgMat);
        imgMat.delete();

        if (contour) {
          const area = cv.contourArea(contour);
          if (area >= vw * vh * EXTRACT_MIN_AREA_RATIO) {
            const corners = scannerRef.current.getCornerPoints(contour);
            contour.delete();

            if (corners.topLeftCorner && corners.topRightCorner &&
                corners.bottomLeftCorner && corners.bottomRightCorner) {
              const outW = Math.min(vw, 2480);
              const outH = Math.round(outW * (297 / 210));
              const result: HTMLCanvasElement | null =
                scannerRef.current.extractPaper(rawCanvas, outW, outH, corners);
              if (result && result.width > 50) {
                setReviewUrl(result.toDataURL('image/jpeg', 0.92));
                setMode('review');
                return;
              }
            }
          } else {
            contour.delete();
          }
        }
      } catch { /* fall through */ }
    }

    // Fallback: raw frame — shows exactly what user saw (object-contain = no crop)
    setReviewUrl(rawCanvas.toDataURL('image/jpeg', 0.92));
    setMode('review');
  }, [cvReady]);

  // ── Detection loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'live') return;
    if (!tempCanvasRef.current) tempCanvasRef.current = document.createElement('canvas');
    const tempCanvas = tempCanvasRef.current;

    const tick = (timestamp: number) => {
      const video   = videoRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick); return;
      }

      // Sync overlay pixel size to CSS size
      const ow = overlay.offsetWidth;
      const oh = overlay.offsetHeight;
      if (ow > 0 && oh > 0 && (overlay.width !== ow || overlay.height !== oh)) {
        overlay.width = ow; overlay.height = oh;
      }

      const overlayCtx = overlay.getContext('2d')!;
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

      // Always redraw cached smoothed corners at 60fps (no flicker)
      if (smoothedCornersRef.current) {
        drawCornerOverlay(overlayCtx, smoothedCornersRef.current, stableProgressRef.current);
      }

      if (!cvReady || !scannerRef.current || timestamp - lastDetectTimeRef.current < DETECTION_MS) {
        rafRef.current = requestAnimationFrame(tick); return;
      }
      lastDetectTimeRef.current = timestamp;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) { rafRef.current = requestAnimationFrame(tick); return; }

      const DETECT_H = Math.round((vh / vw) * DETECT_W);
      tempCanvas.width  = DETECT_W;
      tempCanvas.height = DETECT_H;
      tempCanvas.getContext('2d')!.drawImage(video, 0, 0, DETECT_W, DETECT_H);

      const clearDetection = () => {
        prevRawCornersRef.current  = null;
        smoothedCornersRef.current = null;
        stableCountRef.current     = 0;
        stableProgressRef.current  = 0;
        setDocDetected(false);
        setStableProgress(0);
      };

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cv = (window as any).cv;
        const img     = cv.imread(tempCanvas);
        const contour = scannerRef.current.findPaperContour(img);
        img.delete();

        if (!contour) { clearDetection(); rafRef.current = requestAnimationFrame(tick); return; }

        if (cv.contourArea(contour) < DETECT_W * DETECT_H * MIN_AREA_RATIO) {
          contour.delete(); clearDetection(); rafRef.current = requestAnimationFrame(tick); return;
        }

        const raw = scannerRef.current.getCornerPoints(contour);
        contour.delete();

        if (!raw.topLeftCorner || !raw.topRightCorner || !raw.bottomLeftCorner || !raw.bottomRightCorner) {
          clearDetection(); rafRef.current = requestAnimationFrame(tick); return;
        }

        const rawCorners: CornerSet = {
          tl: { x: raw.topLeftCorner.x,     y: raw.topLeftCorner.y },
          tr: { x: raw.topRightCorner.x,    y: raw.topRightCorner.y },
          bl: { x: raw.bottomLeftCorner.x,  y: raw.bottomLeftCorner.y },
          br: { x: raw.bottomRightCorner.x, y: raw.bottomRightCorner.y },
        };

        // Stability on raw coords
        const prevRaw = prevRawCornersRef.current;
        const isStable = prevRaw !== null && cornersMaxDist(rawCorners, prevRaw) < STABLE_THRESHOLD;
        stableCountRef.current = isStable
          ? stableCountRef.current + 1
          : Math.max(0, stableCountRef.current - 1);
        prevRawCornersRef.current = rawCorners; // update AFTER stability check

        const progress = Math.min(stableCountRef.current / STABLE_FRAMES, 1);
        stableProgressRef.current = progress;

        // Map corners into overlay coords accounting for object-contain letterbox
        // Detection canvas has same aspect ratio as video → use same getContainRect
        const vr = getContainRect(ow, oh, DETECT_W, DETECT_H);
        const scaledCorners: CornerSet = {
          tl: { x: rawCorners.tl.x * vr.w / DETECT_W + vr.x, y: rawCorners.tl.y * vr.h / DETECT_H + vr.y },
          tr: { x: rawCorners.tr.x * vr.w / DETECT_W + vr.x, y: rawCorners.tr.y * vr.h / DETECT_H + vr.y },
          bl: { x: rawCorners.bl.x * vr.w / DETECT_W + vr.x, y: rawCorners.bl.y * vr.h / DETECT_H + vr.y },
          br: { x: rawCorners.br.x * vr.w / DETECT_W + vr.x, y: rawCorners.br.y * vr.h / DETECT_H + vr.y },
        };

        // EMA smoothing for display only
        smoothedCornersRef.current = lerpCorners(
          smoothedCornersRef.current ?? scaledCorners,
          scaledCorners,
          EMA_ALPHA,
        );

        setDocDetected(true);
        setStableProgress(progress);

        if (stableCountRef.current >= STABLE_FRAMES) { runCapture(); return; }
      } catch { /* cv warm-starting */ }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [mode, cvReady, runCapture]);

  // ── Retake ─────────────────────────────────────────────────────────────────
  const handleRetake = useCallback(() => {
    prevRawCornersRef.current  = null;
    smoothedCornersRef.current = null;
    stableCountRef.current     = 0;
    stableProgressRef.current  = 0;
    setDocDetected(false);
    setStableProgress(0);
    setReviewUrl(null);
    setBrightness(100);
    setFocusRing(null);
    setMode('starting');
    startCamera();
  }, [startCamera]);

  // ── Confirm ────────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!reviewUrl) return;
    if (brightness === 100) { onCapture(reviewUrl); return; }
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
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

  // ── Live camera view ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Camera area */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        onTouchStart={handleTapToFocus}
        onClick={handleTapToFocus}
      >
        {/* object-contain: full video frame visible, no CSS crop → canvas matches */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-contain"
        />

        {/* Detection overlay — corners mapped into video display rect */}
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Focus ring at tap position */}
        {mode === 'live' && focusRing && (
          <div
            className="absolute pointer-events-none"
            style={{ left: focusRing.x - 28, top: focusRing.y - 28, width: 56, height: 56 }}
          >
            <div className="w-full h-full rounded-full border-2 border-white/80 animate-ping" />
            <div className="absolute inset-2 rounded-full border border-white/60" />
          </div>
        )}

        {/* A4 guide — positioned within the actual video display rect */}
        {mode === 'live' && !docDetected && videoRect && (
          <div
            className="absolute pointer-events-none"
            style={{ left: videoRect.x, top: videoRect.y, width: videoRect.w, height: videoRect.h }}
          >
            <div
              className="absolute border-2 border-white/50 rounded"
              style={{
                width: '80%',
                aspectRatio: '0.707',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            >
              {(
                ['top-0 left-0 border-t-4 border-l-4 rounded-tl',
                 'top-0 right-0 border-t-4 border-r-4 rounded-tr',
                 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl',
                 'bottom-0 right-0 border-b-4 border-r-4 rounded-br'] as const
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
                : 'Toca para enfocar · Apunta al documento'}
            </div>
          </div>
        )}

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
      <div className="bg-black px-6 py-6 flex items-center justify-between shrink-0">
        <Button variant="ghost" size="icon" className="text-white h-12 w-12" onClick={onCancel}>
          <X className="h-6 w-6" />
        </Button>
        <button
          disabled={mode !== 'live'}
          onClick={runCapture}
          aria-label="Capturar documento"
          className="h-16 w-16 rounded-full bg-white disabled:opacity-40 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        >
          <Camera className="h-7 w-7 text-black" />
        </button>
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
