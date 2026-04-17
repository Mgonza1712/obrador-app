'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Check, RotateCcw } from 'lucide-react';

interface Point { x: number; y: number }

interface PerspectiveEditorProps {
  imageDataUrl: string;
  onConfirm: (processedDataUrl: string) => void;
  onRetake: () => void;
}

const HANDLE_RADIUS = 22; // px, touch-friendly

/** Solve 8-variable system for perspective homography (direct linear transform) */
function computeHomography(src: Point[], dst: Point[]): number[] {
  // Build 8x8 matrix A and vector b for Ah = b
  // h = [h0..h7], H[3x3] with H[2][2]=1
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }
  // Gaussian elimination
  const n = 8;
  const aug = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-10) continue;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col] / pivot;
      for (let k = col; k <= n; k++) aug[row][k] -= factor * aug[col][k];
    }
    for (let k = col; k <= n; k++) aug[col][k] /= pivot;
  }
  const h = aug.map((row) => row[n]);
  return [...h, 1]; // h0..h7, h8=1
}

/** Apply homography H (row-major 3x3) to a point */
function applyH(H: number[], x: number, y: number): Point {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}


/**
 * Process image:
 * 1. Perspective-correct using the 4 handle points
 * 2. Resize to max 2000px on longest dimension
 * 3. Grayscale + adaptive threshold binarization (16×16 blocks)
 */
function processImage(
  source: HTMLImageElement,
  handles: Point[],      // in display coords
  displayW: number,
  displayH: number,
): string {
  const scaleX = source.naturalWidth / displayW;
  const scaleY = source.naturalHeight / displayH;

  // Scale handles to natural image coords
  const srcPts = handles.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }));

  // Compute output dimensions from the handle quad (use longer sides)
  const w1 = Math.hypot(srcPts[1].x - srcPts[0].x, srcPts[1].y - srcPts[0].y);
  const w2 = Math.hypot(srcPts[2].x - srcPts[3].x, srcPts[2].y - srcPts[3].y);
  const h1 = Math.hypot(srcPts[3].x - srcPts[0].x, srcPts[3].y - srcPts[0].y);
  const h2 = Math.hypot(srcPts[2].x - srcPts[1].x, srcPts[2].y - srcPts[1].y);
  let outW = Math.round(Math.max(w1, w2));
  let outH = Math.round(Math.max(h1, h2));

  // Clamp to max 2000px on longest dimension
  const maxDim = 2000;
  if (Math.max(outW, outH) > maxDim) {
    const scale = maxDim / Math.max(outW, outH);
    outW = Math.round(outW * scale);
    outH = Math.round(outH * scale);
  }

  const dstPts: Point[] = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ];

  const H = computeHomography(dstPts, srcPts); // dst→src for inverse mapping

  // Draw source image into a temp canvas at natural resolution
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = source.naturalWidth;
  srcCanvas.height = source.naturalHeight;
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.drawImage(source, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, source.naturalWidth, source.naturalHeight);

  // Output canvas
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d')!;
  const outData = outCtx.createImageData(outW, outH);

  // Inverse map: for each output pixel, find source pixel via H (dst→src)
  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      const sp = applyH(H, dx, dy);
      const sx = Math.round(sp.x);
      const sy = Math.round(sp.y);
      const outIdx = (dy * outW + dx) * 4;

      if (sx < 0 || sx >= source.naturalWidth || sy < 0 || sy >= source.naturalHeight) {
        outData.data[outIdx] = 255;
        outData.data[outIdx + 1] = 255;
        outData.data[outIdx + 2] = 255;
        outData.data[outIdx + 3] = 255;
        continue;
      }
      const srcIdx = (sy * source.naturalWidth + sx) * 4;
      const r = srcData.data[srcIdx];
      const g = srcData.data[srcIdx + 1];
      const b = srcData.data[srcIdx + 2];
      // Grayscale (luminance)
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      outData.data[outIdx] = gray;
      outData.data[outIdx + 1] = gray;
      outData.data[outIdx + 2] = gray;
      outData.data[outIdx + 3] = 255;
    }
  }

  // Adaptive threshold: 16×16 blocks
  const BLOCK = 16;
  const BIAS = 0.85; // pixel < mean*BIAS → black
  const result = new Uint8ClampedArray(outData.data);

  for (let by = 0; by < outH; by += BLOCK) {
    for (let bx = 0; bx < outW; bx += BLOCK) {
      const x1 = bx, y1 = by;
      const x2 = Math.min(bx + BLOCK, outW);
      const y2 = Math.min(by + BLOCK, outH);
      let sum = 0, count = 0;
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          sum += outData.data[(y * outW + x) * 4];
          count++;
        }
      }
      const mean = sum / count;
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const idx = (y * outW + x) * 4;
          const v = outData.data[idx] < mean * BIAS ? 0 : 255;
          result[idx] = result[idx + 1] = result[idx + 2] = v;
          result[idx + 3] = 255;
        }
      }
    }
  }

  outCtx.putImageData(new ImageData(result, outW, outH), 0, 0);
  return outCanvas.toDataURL('image/jpeg', 0.90);
}

export function PerspectiveEditor({ imageDataUrl, onConfirm, onRetake }: PerspectiveEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [handles, setHandles] = useState<Point[]>([]);
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);

  // Load image and initialize handles at corners
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const container = containerRef.current;
      if (!container) return;
      const maxW = container.clientWidth;
      const maxH = container.clientHeight;
      const ratio = img.naturalWidth / img.naturalHeight;
      let w = maxW, h = maxW / ratio;
      if (h > maxH) { h = maxH; w = maxH * ratio; }
      w = Math.floor(w); h = Math.floor(h);
      setDisplaySize({ w, h });
      const margin = Math.min(w, h) * 0.08;
      setHandles([
        { x: margin, y: margin },
        { x: w - margin, y: margin },
        { x: w - margin, y: h - margin },
        { x: margin, y: h - margin },
      ]);
    };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  // Draw on canvas whenever handles or image change
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || handles.length < 4) return;
    const { w, h } = displaySize;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // Semi-transparent overlay outside quad
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, w, h);

    // Cut out the quad (show image inside)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(handles[0].x, handles[0].y);
    handles.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();

    // Quad border
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(handles[0].x, handles[0].y);
    handles.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.stroke();

    // Handles
    handles.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 3;
      ctx.stroke();
      // corner label
      const labels = ['↖', '↗', '↘', '↙'];
      ctx.fillStyle = '#2563eb';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[i], p.x, p.y);
    });
  }, [handles, displaySize]);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement): Point => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const findHandle = (pos: Point): number => {
    return handles.findIndex((p) => Math.hypot(p.x - pos.x, p.y - pos.y) < HANDLE_RADIUS + 8);
  };

  const onPointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const pos = getPos(e, canvas);
    const idx = findHandle(pos);
    if (idx !== -1) setDragging(idx);
  };

  const onPointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (dragging === null) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const pos = getPos(e, canvas);
    setHandles((prev) => prev.map((p, i) => (i === dragging ? pos : p)));
  };

  const onPointerUp = () => setDragging(null);

  const handleConfirm = useCallback(() => {
    const img = imgRef.current;
    if (!img || handles.length < 4) return;
    setProcessing(true);
    setTimeout(() => {
      try {
        const result = processImage(img, handles, displaySize.w, displaySize.h);
        onConfirm(result);
      } finally {
        setProcessing(false);
      }
    }, 50); // let UI update first
  }, [handles, displaySize, onConfirm]);

  return (
    <div className="flex flex-col h-full">
      <p className="text-center text-sm text-muted-foreground py-2 px-4">
        Arrastra las esquinas para encuadrar el documento
      </p>

      <div ref={containerRef} className="flex-1 flex items-center justify-center bg-black overflow-hidden">
        {displaySize.w > 0 && (
          <canvas
            ref={canvasRef}
            style={{ width: displaySize.w, height: displaySize.h, touchAction: 'none' }}
            onMouseDown={onPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onMouseLeave={onPointerUp}
            onTouchStart={onPointerDown}
            onTouchMove={onPointerMove}
            onTouchEnd={onPointerUp}
          />
        )}
      </div>

      <div className="flex gap-3 p-4 bg-background border-t">
        <Button variant="outline" className="flex-1" onClick={onRetake} disabled={processing}>
          <RotateCcw className="h-4 w-4 mr-2" /> Repetir foto
        </Button>
        <Button className="flex-1" onClick={handleConfirm} disabled={processing}>
          {processing ? (
            <span className="flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Procesando…</span>
          ) : (
            <><Check className="h-4 w-4 mr-2" /> Confirmar</>
          )}
        </Button>
      </div>
    </div>
  );
}
