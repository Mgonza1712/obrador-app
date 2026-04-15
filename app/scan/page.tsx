'use client';

import { Suspense, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Camera,
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  ChevronLeft,
} from 'lucide-react';

const WEBHOOK_URL = 'https://n8n.wescaleops.com/webhook/scanner-intake';

const LOCALES = [
  { slug: 'biergarten', name: 'Biergarten by 78' },
  { slug: 'cafeseamos', name: 'Cafeseamos' },
  { slug: '78sabores', name: '78 Sabores y Copas' },
] as const;

type LocalSlug = (typeof LOCALES)[number]['slug'];
type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error' | 'duplicate';

interface FilePreview {
  base64: string;
  filename: string;
  mimeType: string;
  sizeKb: number;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix if present
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ScannerContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('t') ?? '';
  const localParam = searchParams.get('local') as LocalSlug | null;
  const lockedLocal = localParam && LOCALES.some(l => l.slug === localParam) ? localParam : null;

  const [local, setLocal] = useState<LocalSlug | null>(lockedLocal);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [resultMessage, setResultMessage] = useState('');
  const [docId, setDocId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      alert('El archivo supera los 20 MB. Usa un archivo más pequeño.');
      return;
    }
    const base64 = await fileToBase64(file);
    setPreview({
      base64,
      filename: file.name,
      mimeType: file.type,
      sizeKb: Math.round(file.size / 1024),
    });
    setStatus('idle');
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleSubmit = async () => {
    if (!preview || !local || !token) return;

    setStatus('submitting');
    setResultMessage('');

    const isImage = preview.mimeType.startsWith('image/');
    const filename = isImage
      ? `scan_${Date.now()}.jpg`
      : preview.filename || `scan_${Date.now()}.pdf`;

    try {
      const res = await fetch(`${WEBHOOK_URL}?t=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          t: token,
          document_base64: preview.base64,
          local: local,
          filename,
          is_image: isImage,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.ok === false) {
        setStatus('error');
        setResultMessage(data.error || `Error ${res.status}`);
        return;
      }

      if (data.status === 'duplicate') {
        setStatus('duplicate');
        setResultMessage(data.message || 'Documento ya procesado anteriormente.');
        return;
      }

      setStatus('success');
      setDocId(data.doc_id ?? null);
      setResultMessage(
        data.auto_approval
          ? 'Documento aprobado automáticamente.'
          : 'Documento enviado. Pendiente de revisión.'
      );
    } catch {
      setStatus('error');
      setResultMessage('No se pudo conectar. Verifica tu conexión e intenta de nuevo.');
    }
  };

  const handleReset = () => {
    setPreview(null);
    setStatus('idle');
    setResultMessage('');
    setDocId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  // No token → access denied
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-3">
            <XCircle className="h-12 w-12 text-destructive" />
            <p className="font-semibold text-lg">Enlace no válido</p>
            <p className="text-sm text-muted-foreground">
              Este enlace no contiene un token de acceso. Solicita un enlace
              válido al administrador.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
            <CheckCircle className="h-14 w-14 text-green-500" />
            <div>
              <p className="font-semibold text-lg">¡Enviado!</p>
              <p className="text-sm text-muted-foreground mt-1">{resultMessage}</p>
              {docId && (
                <p className="text-xs text-muted-foreground mt-2 font-mono">
                  ID: {docId}
                </p>
              )}
            </div>
            <Button onClick={handleReset} className="w-full mt-2">
              Escanear otro documento
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center p-4 pt-8 pb-16">
      <div className="w-full max-w-md space-y-5">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Pizca Scanner</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Escanea o adjunta una factura o albarán
          </p>
        </div>

        {/* Local selector */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              Local
              {lockedLocal && <span className="text-xs font-normal text-muted-foreground">(fijado por QR)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lockedLocal ? (
              <div className="flex items-center gap-3 rounded-lg border border-primary bg-primary/5 px-4 py-3">
                <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium text-primary">
                  {LOCALES.find(l => l.slug === lockedLocal)?.name}
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {LOCALES.map((l) => (
                  <button
                    key={l.slug}
                    onClick={() => setLocal(l.slug)}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors ${
                      local === l.slug
                        ? 'border-primary bg-primary/5 font-medium text-primary'
                        : 'border-border hover:border-primary/50 hover:bg-accent'
                    }`}
                  >
                    <span>{l.name}</span>
                    {local === l.slug && (
                      <CheckCircle className="h-4 w-4 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* File / Camera inputs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Documento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Hidden inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/jpeg,image/jpg,image/png"
              className="hidden"
              onChange={handleInputChange}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleInputChange}
            />

            {preview ? (
              <div className="space-y-3">
                {/* Preview */}
                {preview.mimeType.startsWith('image/') ? (
                  <div className="relative overflow-hidden rounded-lg border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:${preview.mimeType};base64,${preview.base64}`}
                      alt="Vista previa"
                      className="mx-auto max-h-60 object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-lg border bg-muted p-4">
                    <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {preview.filename}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PDF · {preview.sizeKb} KB
                      </p>
                    </div>
                  </div>
                )}

                {/* Change file */}
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="h-3 w-3" />
                  Cambiar documento
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="flex-col h-20 gap-2"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="h-6 w-6" />
                  <span className="text-xs">Fotografiar</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex-col h-20 gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-6 w-6" />
                  <span className="text-xs">Adjuntar PDF</span>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status feedback */}
        {status === 'error' && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{resultMessage}</span>
          </div>
        )}
        {status === 'duplicate' && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{resultMessage}</span>
          </div>
        )}

        {/* Submit */}
        <Button
          className="w-full h-12 text-base"
          disabled={!preview || !local || status === 'submitting'}
          onClick={handleSubmit}
        >
          {status === 'submitting' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Procesando…
            </>
          ) : (
            'Enviar documento'
          )}
        </Button>

        {/* Validation hints */}
        {(!preview || !local) && status === 'idle' && (
          <div className="space-y-1">
            {!local && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Label className="text-xs text-muted-foreground">
                  ↑ Selecciona un local
                </Label>
              </div>
            )}
            {!preview && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Label className="text-xs text-muted-foreground">
                  ↑ Adjunta o fotografía el documento
                </Label>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ScannerContent />
    </Suspense>
  );
}
