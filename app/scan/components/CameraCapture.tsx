'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, RotateCcw } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (imageDataUrl: string) => void;
  onCancel: () => void;
}

export function CameraCapture({ onCapture, onCancel }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setReady(true);
      }
    } catch {
      setError('No se pudo acceder a la cámara. Verifica los permisos.');
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(dataUrl);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Video */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* Document guide overlay */}
        {ready && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="border-2 border-white/70 rounded"
              style={{ width: '85%', aspectRatio: '0.707' }} // A4 ratio
            >
              {/* Corner marks */}
              {[
                'top-0 left-0 border-t-4 border-l-4 rounded-tl',
                'top-0 right-0 border-t-4 border-r-4 rounded-tr',
                'bottom-0 left-0 border-b-4 border-l-4 rounded-bl',
                'bottom-0 right-0 border-b-4 border-r-4 rounded-br',
              ].map((cls, i) => (
                <div key={i} className={`absolute w-6 h-6 border-white ${cls}`} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center text-white px-6 space-y-3">
              <p className="text-sm">{error}</p>
              <Button variant="outline" size="sm" onClick={startCamera}>
                <RotateCcw className="h-4 w-4 mr-2" /> Reintentar
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-black px-6 py-6 flex items-center justify-between">
        <Button variant="ghost" size="icon" className="text-white h-12 w-12" onClick={onCancel}>
          <X className="h-6 w-6" />
        </Button>

        {/* Shutter */}
        <button
          disabled={!ready}
          onClick={handleCapture}
          className="h-16 w-16 rounded-full bg-white disabled:opacity-40 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        >
          <Camera className="h-7 w-7 text-black" />
        </button>

        <div className="h-12 w-12" /> {/* spacer */}
      </div>
    </div>
  );
}
