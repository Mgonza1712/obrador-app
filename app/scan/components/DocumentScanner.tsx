'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, RotateCcw, Check } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'starting' | 'live' | 'processing' | 'perspective' | 'review' | 'error';

interface CornerSet {
  tl: { x: number; y: number };
  tr: { x: number; y: number };
  bl: { x: number; y: number };
  br: { x: number; y: number };
}

interface Rect { x: number; y: number; w: number; h: number }

export interface DocumentScannerProps {
  onCapture: (processedDataUrl: string) => void;
  onCancel: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DETECT_W            = 640;
const DETECTION_MS        = 120;
const STABLE_FRAMES       = 12;
const STABLE_THRESHOLD    = 12;
const EMA_ALPHA           = 0.3;
const MIN_AREA_RATIO      = 0.07;
const EXTRACT_MIN_AREA_RATIO = 0.15;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Rect where an image is displayed within a container using object-contain. */
function getContainRect(cw: number, ch: number, vw: number, vh: number): Rect {
  const scale = Math.min(cw / vw, ch / vh);
  return { x: (cw - vw * scale) / 2, y: (ch - vh * scale) / 2, w: vw * scale, h: vh * scale };
}

/** Scale + offsets to map video/image coords → display coords under object-cover. */
function getCoverMapping(ow: number, oh: number, vw: number, vh: number) {
  const scale = Math.max(ow / vw, oh / vh);
  return { scale, offsetX: (ow - vw * scale) / 2, offsetY: (oh - vh * scale) / 2 };
}

/** Image coords → display coords inside a contain rect. */
function imgToDisp(pt: { x: number; y: number }, cr: Rect, dims: { w: number; h: number }) {
  return { x: pt.x / dims.w * cr.w + cr.x, y: pt.y / dims.h * cr.h + cr.y };
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

function drawLiveOverlay(ctx: CanvasRenderingContext2D, c: CornerSet, progress: number) {
  const isGreen = progress > 0.4;
  ctx.beginPath();
  ctx.moveTo(c.tl.x, c.tl.y); ctx.lineTo(c.tr.x, c.tr.y);
  ctx.lineTo(c.br.x, c.br.y); ctx.lineTo(c.bl.x, c.bl.y);
  ctx.closePath();
  ctx.fillStyle   = isGreen ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.08)';
  ctx.fill();
  ctx.strokeStyle = isGreen ? '#22c55e' : '#f59e0b';
  ctx.lineWidth   = 3;
  ctx.stroke();
  ctx.fillStyle = isGreen ? '#22c55e' : '#f59e0b';
  for (const p of [c.tl, c.tr, c.bl, c.br]) ctx.fillRect(p.x - 6, p.y - 6, 12, 12);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DocumentScanner({ onCapture, onCancel }: DocumentScannerProps) {
  // ── Refs ───────────────────────────────────────────────────────────────────
  const videoRef           = useRef<HTMLVideoElement>(null);
  const overlayRef         = useRef<HTMLCanvasElement>(null);
  const containerRef       = useRef<HTMLDivElement>(null);
  const perspContainerRef  = useRef<HTMLDivElement>(null);
  const streamRef          = useRef<MediaStream | null>(null);
  const rafRef             = useRef<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef         = useRef<any>(null);
  const tempCanvasRef      = useRef<HTMLCanvasElement | null>(null);
  const focusTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingCornerRef  = useRef<keyof CornerSet | null>(null);

  const prevRawCornersRef  = useRef<CornerSet | null>(null);
  const smoothedCornersRef = useRef<CornerSet | null>(null);
  const stableCountRef     = useRef(0);
  const stableProgressRef  = useRef(0);
  const lastDetectTimeRef  = useRef(0);
  const didCaptureRef      = useRef(false);

  // ── State ──────────────────────────────────────────────────────────────────
  const [mode, setMode]                   = useState<Mode>('starting');
  const [cvReady, setCvReady]             = useState(false);
  const [docDetected, setDocDetected]     = useState(false);
  const [stableProgress, setStableProgress] = useState(0);
  const [reviewUrl, setReviewUrl]         = useState<string | null>(null);
  const [brightness, setBrightness]       = useState(100);
  const [cameraError, setCameraError]     = useState<string | null>(null);
  const [focusRing, setFocusRing]         = useState<{ x: number; y: number } | null>(null);

  // Perspective editor
  const [rawDataUrl, setRawDataUrl]       = useState<string | null>(null);
  const [rawDims, setRawDims]             = useState<{ w: number; h: number } | null>(null);
  const [imgCorners, setImgCorners]       = useState<CornerSet | null>(null);
  const [perspSize, setPerspSize]         = useState<{ w: number; h: number } | null>(null);

  // ── OpenCV loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    const init = () => {
      if (!active) return;
      import('jscanify/client').then(({ default: Jscanify }) => {
        if (!active) return;
        scannerRef.current = new Jscanify();
        setCvReady(true);
      }).catch(() => {});
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.cv?.Mat) { init(); return () => { active = false; }; }
    if (w.cv)      { w.cv.onRuntimeInitialized = init; return () => { active = false; }; }
    const existing = document.querySelector('script[data-opencv]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => { if (!active) return; if (w.cv?.Mat) init(); else if (w.cv) w.cv.onRuntimeInitialized = init; }, { once: true });
      return () => { active = false; };
    }
    const s = document.createElement('script');
    s.src = '/opencv.js'; s.async = true; s.setAttribute('data-opencv', '1');
    s.onload = () => { if (!active) return; if (w.cv?.Mat) init(); else if (w.cv) w.cv.onRuntimeInitialized = init; };
    document.head.appendChild(s);
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

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const constraints = isIOS
      ? { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      : { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1440 } };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: constraints });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play().then(() => {
          setMode('live');
          if (!isIOS) {
            stream.getVideoTracks()[0]?.applyConstraints({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              advanced: [{ focusMode: 'continuous' } as any],
            }).catch(() => {});
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

  // ── Perspective editor: container size via ResizeObserver ──────────────────
  useEffect(() => {
    if (mode !== 'perspective' || !perspContainerRef.current) return;
    const el = perspContainerRef.current;
    const update = () => setPerspSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  // ── Perspective: touch drag handlers ───────────────────────────────────────
  const handlePerspTouchStart = useCallback((e: React.TouchEvent) => {
    if (!perspContainerRef.current || !perspSize || !rawDims || !imgCorners) return;
    const rect  = perspContainerRef.current.getBoundingClientRect();
    const tapX  = e.touches[0].clientX - rect.left;
    const tapY  = e.touches[0].clientY - rect.top;
    const cr    = getContainRect(perspSize.w, perspSize.h, rawDims.w, rawDims.h);
    const pts: [keyof CornerSet, { x: number; y: number }][] = [
      ['tl', imgToDisp(imgCorners.tl, cr, rawDims)],
      ['tr', imgToDisp(imgCorners.tr, cr, rawDims)],
      ['bl', imgToDisp(imgCorners.bl, cr, rawDims)],
      ['br', imgToDisp(imgCorners.br, cr, rawDims)],
    ];
    let closest: keyof CornerSet | null = null;
    let minDist = 56;
    for (const [key, pt] of pts) {
      const d = Math.hypot(tapX - pt.x, tapY - pt.y);
      if (d < minDist) { minDist = d; closest = key; }
    }
    draggingCornerRef.current = closest;
  }, [perspSize, rawDims, imgCorners]);

  const handlePerspTouchMove = useCallback((e: React.TouchEvent) => {
    if (!draggingCornerRef.current || !perspContainerRef.current || !perspSize || !rawDims) return;
    const rect   = perspContainerRef.current.getBoundingClientRect();
    const tapX   = e.touches[0].clientX - rect.left;
    const tapY   = e.touches[0].clientY - rect.top;
    const cr     = getContainRect(perspSize.w, perspSize.h, rawDims.w, rawDims.h);
    const cx     = Math.max(cr.x, Math.min(cr.x + cr.w, tapX));
    const cy     = Math.max(cr.y, Math.min(cr.y + cr.h, tapY));
    const corner = draggingCornerRef.current;
    setImgCorners(prev => prev
      ? { ...prev, [corner]: { x: (cx - cr.x) / cr.w * rawDims.w, y: (cy - cr.y) / cr.h * rawDims.h } }
      : null);
  }, [perspSize, rawDims]);

  const handlePerspTouchEnd = useCallback(() => {
    draggingCornerRef.current = null;
  }, []);

  // ── Tap-to-focus (live view) ───────────────────────────────────────────────
  const handleTapToFocus = useCallback(async (e: React.TouchEvent | React.MouseEvent) => {
    if (mode !== 'live') return;
    const video     = videoRef.current;
    const track     = streamRef.current?.getVideoTracks()[0];
    const container = containerRef.current;
    if (!video || !track || !container) return;
    const rect    = container.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const tapX    = clientX - rect.left;
    const tapY    = clientY - rect.top;
    const { scale: cs, offsetX, offsetY } = getCoverMapping(
      container.clientWidth, container.clientHeight, video.videoWidth, video.videoHeight,
    );
    const norm = {
      x: Math.max(0, Math.min(1, (tapX - offsetX) / (cs * video.videoWidth))),
      y: Math.max(0, Math.min(1, (tapY - offsetY) / (cs * video.videoHeight))),
    };
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    setFocusRing({ x: tapX, y: tapY });
    focusTimerRef.current = setTimeout(() => setFocusRing(null), 1500);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await track.applyConstraints({ advanced: [{ focusMode: 'manual', pointOfInterest: norm } as any] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setTimeout(() => track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => {}), 3000);
    } catch { /* unsupported */ }
  }, [mode]);

  // ── Manual capture → perspective editor ────────────────────────────────────
  // Never runs extractPaper. Always shows the 4-point editor so the user can
  // define the crop area manually before perspective correction is applied.
  const captureManual = useCallback(() => {
    if (didCaptureRef.current) return;
    didCaptureRef.current = true;
    const video = videoRef.current;
    if (!video || video.readyState < 2) { didCaptureRef.current = false; return; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) { didCaptureRef.current = false; return; }

    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = vw; rawCanvas.height = vh;
    rawCanvas.getContext('2d')!.drawImage(video, 0, 0);
    streamRef.current?.getTracks().forEach((t) => t.stop());

    setRawDataUrl(rawCanvas.toDataURL('image/jpeg', 0.92));
    setRawDims({ w: vw, h: vh });

    // Pre-populate handles from jscanify if a contour is detected (best-effort)
    let initCorners: CornerSet;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cv = (window as any).cv;
      if (!cv || !scannerRef.current) throw new Error();
      const mat     = cv.imread(rawCanvas);
      const contour = scannerRef.current.findPaperContour(mat);
      mat.delete();
      if (!contour) throw new Error();
      const area = cv.contourArea(contour);
      const raw  = scannerRef.current.getCornerPoints(contour);
      contour.delete();
      if (area < vw * vh * 0.05 || !raw.topLeftCorner || !raw.topRightCorner ||
          !raw.bottomLeftCorner || !raw.bottomRightCorner) throw new Error();
      initCorners = {
        tl: raw.topLeftCorner,  tr: raw.topRightCorner,
        bl: raw.bottomLeftCorner, br: raw.bottomRightCorner,
      };
    } catch {
      // Default: inset 12% from each edge
      initCorners = {
        tl: { x: vw * 0.12, y: vh * 0.12 }, tr: { x: vw * 0.88, y: vh * 0.12 },
        bl: { x: vw * 0.12, y: vh * 0.88 }, br: { x: vw * 0.88, y: vh * 0.88 },
      };
    }

    setImgCorners(initCorners);
    setMode('perspective');
  }, []);

  // ── Auto-capture (detection loop only) ────────────────────────────────────
  // Only called when document is green + stable. Runs extractPaper directly.
  const runCapture = useCallback(() => {
    if (didCaptureRef.current) return;
    didCaptureRef.current = true;
    const video = videoRef.current;
    if (!video || video.readyState < 2) { didCaptureRef.current = false; return; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setMode('processing');

    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) { didCaptureRef.current = false; setMode('live'); return; }

    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = vw; rawCanvas.height = vh;
    rawCanvas.getContext('2d')!.drawImage(video, 0, 0);
    streamRef.current?.getTracks().forEach((t) => t.stop());

    if (scannerRef.current && cvReady) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cv = (window as any).cv;
        const mat     = cv.imread(rawCanvas);
        const contour = scannerRef.current.findPaperContour(mat);
        mat.delete();
        if (contour) {
          const area = cv.contourArea(contour);
          if (area >= vw * vh * EXTRACT_MIN_AREA_RATIO) {
            const corners = scannerRef.current.getCornerPoints(contour);
            contour.delete();
            if (corners.topLeftCorner && corners.topRightCorner &&
                corners.bottomLeftCorner && corners.bottomRightCorner) {
              const outW = Math.min(vw, 2480);
              const outH = Math.round(outW * (297 / 210));
              const result = scannerRef.current.extractPaper(rawCanvas, outW, outH, corners) as HTMLCanvasElement | null;
              if (result && result.width > 50) {
                setReviewUrl(result.toDataURL('image/jpeg', 0.92));
                setMode('review');
                return;
              }
            }
          } else { contour.delete(); }
        }
      } catch { /* fall through */ }
    }
    setReviewUrl(rawCanvas.toDataURL('image/jpeg', 0.92));
    setMode('review');
  }, [cvReady]);

  // ── Detection loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'live') return;
    if (!tempCanvasRef.current) tempCanvasRef.current = document.createElement('canvas');
    const tempCanvas = tempCanvasRef.current;

    const tick = (ts: number) => {
      const video   = videoRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || video.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }

      const ow = overlay.offsetWidth, oh = overlay.offsetHeight;
      if (ow > 0 && oh > 0 && (overlay.width !== ow || overlay.height !== oh)) { overlay.width = ow; overlay.height = oh; }

      const ctx = overlay.getContext('2d')!;
      ctx.clearRect(0, 0, ow, oh);
      if (smoothedCornersRef.current) drawLiveOverlay(ctx, smoothedCornersRef.current, stableProgressRef.current);

      if (!cvReady || !scannerRef.current || ts - lastDetectTimeRef.current < DETECTION_MS) { rafRef.current = requestAnimationFrame(tick); return; }
      lastDetectTimeRef.current = ts;

      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) { rafRef.current = requestAnimationFrame(tick); return; }

      const DETECT_H = Math.round((vh / vw) * DETECT_W);
      tempCanvas.width = DETECT_W; tempCanvas.height = DETECT_H;
      tempCanvas.getContext('2d')!.drawImage(video, 0, 0, DETECT_W, DETECT_H);

      const clear = () => {
        prevRawCornersRef.current = null; smoothedCornersRef.current = null;
        stableCountRef.current = 0; stableProgressRef.current = 0;
        setDocDetected(false); setStableProgress(0);
      };

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cv      = (window as any).cv;
        const img     = cv.imread(tempCanvas);
        const contour = scannerRef.current.findPaperContour(img);
        img.delete();
        if (!contour) { clear(); rafRef.current = requestAnimationFrame(tick); return; }
        if (cv.contourArea(contour) < DETECT_W * DETECT_H * MIN_AREA_RATIO) { contour.delete(); clear(); rafRef.current = requestAnimationFrame(tick); return; }

        const raw = scannerRef.current.getCornerPoints(contour);
        contour.delete();
        if (!raw.topLeftCorner || !raw.topRightCorner || !raw.bottomLeftCorner || !raw.bottomRightCorner) { clear(); rafRef.current = requestAnimationFrame(tick); return; }

        const rawC: CornerSet = {
          tl: { x: raw.topLeftCorner.x,     y: raw.topLeftCorner.y },
          tr: { x: raw.topRightCorner.x,    y: raw.topRightCorner.y },
          bl: { x: raw.bottomLeftCorner.x,  y: raw.bottomLeftCorner.y },
          br: { x: raw.bottomRightCorner.x, y: raw.bottomRightCorner.y },
        };

        const prevRaw  = prevRawCornersRef.current;
        const stable   = prevRaw !== null && cornersMaxDist(rawC, prevRaw) < STABLE_THRESHOLD;
        stableCountRef.current = stable ? stableCountRef.current + 1 : Math.max(0, stableCountRef.current - 1);
        prevRawCornersRef.current = rawC;

        const progress = Math.min(stableCountRef.current / STABLE_FRAMES, 1);
        stableProgressRef.current = progress;

        // Map detection corners → overlay coords (object-cover)
        const { scale: cs, offsetX, offsetY } = getCoverMapping(ow, oh, vw, vh);
        const sx = (vw / DETECT_W) * cs, sy = (vh / DETECT_H) * cs;
        const sc: CornerSet = {
          tl: { x: rawC.tl.x * sx + offsetX, y: rawC.tl.y * sy + offsetY },
          tr: { x: rawC.tr.x * sx + offsetX, y: rawC.tr.y * sy + offsetY },
          bl: { x: rawC.bl.x * sx + offsetX, y: rawC.bl.y * sy + offsetY },
          br: { x: rawC.br.x * sx + offsetX, y: rawC.br.y * sy + offsetY },
        };
        smoothedCornersRef.current = lerpCorners(smoothedCornersRef.current ?? sc, sc, EMA_ALPHA);
        setDocDetected(true);
        setStableProgress(progress);
        if (stableCountRef.current >= STABLE_FRAMES) { runCapture(); return; }
      } catch { /* cv warming */ }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [mode, cvReady, runCapture]);

  // ── Retake ─────────────────────────────────────────────────────────────────
  const handleRetake = useCallback(() => {
    prevRawCornersRef.current = null; smoothedCornersRef.current = null;
    stableCountRef.current = 0; stableProgressRef.current = 0;
    setDocDetected(false); setStableProgress(0);
    setReviewUrl(null); setBrightness(100); setFocusRing(null);
    setRawDataUrl(null); setRawDims(null); setImgCorners(null); setPerspSize(null);
    setMode('starting');
    startCamera();
  }, [startCamera]);

  // ── Perspective: apply user-defined crop ───────────────────────────────────
  const handleApplyCrop = useCallback(() => {
    if (!rawDataUrl || !rawDims || !imgCorners) return;
    setMode('processing');
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = rawDims.w; c.height = rawDims.h;
      c.getContext('2d')!.drawImage(img, 0, 0);
      const outW = Math.min(rawDims.w, 2480);
      const outH = Math.round(outW * (297 / 210));
      const pts  = { topLeftCorner: imgCorners.tl, topRightCorner: imgCorners.tr,
                     bottomLeftCorner: imgCorners.bl, bottomRightCorner: imgCorners.br };
      try {
        const result = scannerRef.current?.extractPaper(c, outW, outH, pts) as HTMLCanvasElement | null;
        if (result && result.width > 50) { setReviewUrl(result.toDataURL('image/jpeg', 0.92)); setMode('review'); return; }
      } catch { /* fall through */ }
      setReviewUrl(rawDataUrl);
      setMode('review');
    };
    img.src = rawDataUrl;
  }, [rawDataUrl, rawDims, imgCorners]);

  // ── Perspective: skip crop (raw frame to review) ───────────────────────────
  const handleSkipCrop = useCallback(() => {
    if (!rawDataUrl) return;
    setReviewUrl(rawDataUrl);
    setMode('review');
  }, [rawDataUrl]);

  // ── Review: confirm ────────────────────────────────────────────────────────
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

  // ── Render: review ──────────────────────────────────────────────────────────
  if (mode === 'review' && reviewUrl) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex-1 relative flex items-center justify-center overflow-hidden p-2">
          <img src={reviewUrl} alt="Captura" style={{ filter: `brightness(${brightness}%)` }}
            className="max-h-full max-w-full object-contain rounded" />
        </div>
        <div className="bg-background px-4 pt-4 pb-6 space-y-3 border-t">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-14 shrink-0">Brillo</span>
            <input type="range" min={60} max={180} value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))} className="flex-1 accent-primary" />
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

  // ── Render: perspective editor ─────────────────────────────────────────────
  if (mode === 'perspective' && rawDataUrl) {
    const cr   = perspSize && rawDims ? getContainRect(perspSize.w, perspSize.h, rawDims.w, rawDims.h) : null;
    const disp = cr && imgCorners && rawDims ? {
      tl: imgToDisp(imgCorners.tl, cr, rawDims),
      tr: imgToDisp(imgCorners.tr, cr, rawDims),
      bl: imgToDisp(imgCorners.bl, cr, rawDims),
      br: imgToDisp(imgCorners.br, cr, rawDims),
    } : null;

    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div
          ref={perspContainerRef}
          className="relative flex-1 overflow-hidden select-none"
          style={{ touchAction: 'none' }}
          onTouchStart={handlePerspTouchStart}
          onTouchMove={handlePerspTouchMove}
          onTouchEnd={handlePerspTouchEnd}
        >
          <img src={rawDataUrl} className="w-full h-full object-contain" alt="Recorte" draggable={false} />
          {disp && (
            <>
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
                <polygon
                  points={`${disp.tl.x},${disp.tl.y} ${disp.tr.x},${disp.tr.y} ${disp.br.x},${disp.br.y} ${disp.bl.x},${disp.bl.y}`}
                  fill="rgba(34,197,94,0.12)" stroke="#22c55e" strokeWidth="2" strokeLinejoin="round"
                />
              </svg>
              {(['tl', 'tr', 'bl', 'br'] as const).map((k) => (
                <div key={k} className="absolute w-12 h-12 rounded-full bg-green-500 border-[3px] border-white shadow-lg"
                  style={{ left: disp[k].x - 24, top: disp[k].y - 24 }} />
              ))}
            </>
          )}
          <div className="absolute bottom-4 inset-x-0 flex justify-center pointer-events-none">
            <p className="px-3 py-1.5 rounded-full bg-black/60 text-white/70 text-xs backdrop-blur-sm">
              Arrastra los puntos para ajustar el recorte
            </p>
          </div>
        </div>
        <div className="bg-background px-4 pt-4 pb-6 border-t">
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleRetake}>
              <RotateCcw className="h-4 w-4 mr-1.5" /> Repetir
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleSkipCrop}>
              Sin recorte
            </Button>
            <Button className="flex-1" onClick={handleApplyCrop}>
              <Check className="h-4 w-4 mr-1.5" /> Recortar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: processing ──────────────────────────────────────────────────────
  if (mode === 'processing') {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-white text-center space-y-3">
          <div className="h-10 w-10 rounded-full border-2 border-white border-t-transparent animate-spin mx-auto" />
          <p className="text-sm">Procesando…</p>
        </div>
      </div>
    );
  }

  // ── Render: error ───────────────────────────────────────────────────────────
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

  // ── Render: live camera view ────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div ref={containerRef} className="relative flex-1 overflow-hidden"
        onTouchStart={handleTapToFocus} onClick={handleTapToFocus}>
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {mode === 'live' && focusRing && (
          <div className="absolute pointer-events-none"
            style={{ left: focusRing.x - 28, top: focusRing.y - 28, width: 56, height: 56 }}>
            <div className="w-full h-full rounded-full border-2 border-white/80 animate-ping" />
            <div className="absolute inset-2 rounded-full border border-white/60" />
          </div>
        )}

        {mode === 'live' && !docDetected && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative border-2 border-white/50 rounded" style={{ width: '80%', aspectRatio: '0.707' }}>
              {(['top-0 left-0 border-t-4 border-l-4 rounded-tl',
                 'top-0 right-0 border-t-4 border-r-4 rounded-tr',
                 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl',
                 'bottom-0 right-0 border-b-4 border-r-4 rounded-br'] as const).map((cls, i) => (
                <div key={i} className={`absolute w-6 h-6 border-white ${cls}`} />
              ))}
            </div>
          </div>
        )}

        {mode === 'live' && (
          <div className="absolute top-4 inset-x-0 flex justify-center pointer-events-none">
            <div className={`px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm transition-colors ${
              cvReady && docDetected && stableProgress > 0.4 ? 'bg-green-500/80 text-white'
              : cvReady && docDetected ? 'bg-amber-500/80 text-white'
              : cvReady ? 'bg-black/50 text-white/60' : 'bg-black/40 text-white/40'
            }`}>
              {!cvReady ? 'Cargando detección automática…'
              : docDetected && stableProgress > 0.4 ? `Capturando… ${Math.round(stableProgress * 100)}%`
              : docDetected ? 'Mantén el documento estable'
              : 'Toca para enfocar · Apunta al documento'}
            </div>
          </div>
        )}
      </div>

      <div className="bg-black px-6 py-6 flex items-center justify-between shrink-0">
        <Button variant="ghost" size="icon" className="text-white h-12 w-12" onClick={onCancel}>
          <X className="h-6 w-6" />
        </Button>
        {/* Manual shutter: always raw capture → 4-point perspective editor */}
        <button disabled={mode !== 'live'} onClick={captureManual} aria-label="Capturar documento"
          className="h-16 w-16 rounded-full bg-white disabled:opacity-40 flex items-center justify-center shadow-lg active:scale-95 transition-transform">
          <Camera className="h-7 w-7 text-black" />
        </button>
        <div className="h-12 w-12 flex items-center justify-center">
          <div className={`h-2.5 w-2.5 rounded-full transition-colors ${cvReady ? 'bg-green-400' : 'bg-amber-400 animate-pulse'}`}
            title={cvReady ? 'Detección automática lista' : 'Cargando OpenCV…'} />
        </div>
      </div>
    </div>
  );
}
