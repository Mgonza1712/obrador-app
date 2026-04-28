'use client';

import { Suspense, useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Send,
} from 'lucide-react';
import { DocumentScanner } from './components/DocumentScanner';
import { PagePreview, type CapturedPage } from './components/PagePreview';

const WEBHOOK_URL = 'https://n8n.wescaleops.com/webhook/scanner-intake';

const LOCALES = [
  { slug: 'biergarten', name: 'Biergarten by 78' },
  { slug: 'cafeseamos', name: 'Cafeseamos' },
  { slug: '78sabores', name: '78 Sabores y Copas' },
] as const;

type LocalSlug = (typeof LOCALES)[number]['slug'];
type SubmitStatus = 'idle' | 'submitting' | 'processing' | 'success' | 'error' | 'duplicate';
type Step = 'select-local' | 'capture' | 'review' | 'result';

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
}

/** Build a PDF from an array of image data URLs using jsPDF */
async function buildPdf(pages: CapturedPage[]): Promise<string> {
  const { jsPDF } = await import('jspdf');

  // Get dimensions from first image
  const getImgSize = (dataUrl: string): Promise<{ w: number; h: number }> =>
    new Promise((res) => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.src = dataUrl;
    });

  const firstSize = await getImgSize(pages[0].dataUrl);
  const isLandscape = firstSize.w > firstSize.h;
  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'px',
    format: [firstSize.w, firstSize.h],
    compress: true,
  });

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) {
      const size = await getImgSize(pages[i].dataUrl);
      pdf.addPage([size.w, size.h], size.w > size.h ? 'landscape' : 'portrait');
    }
    const size = await getImgSize(pages[i].dataUrl);
    pdf.addImage(pages[i].dataUrl, 'JPEG', 0, 0, size.w, size.h);
  }

  return dataUrlToBase64(pdf.output('datauristring'));
}

function ScannerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('t') ?? '';
  const localParam = searchParams.get('local') as LocalSlug | null;

  // Redirect legacy ?t=TOKEN URLs to the canonical /scan/[token] route
  useEffect(() => {
    if (token) router.replace(`/scan/${token}`);
  }, [token, router]);
  const lockedLocal = localParam && LOCALES.some((l) => l.slug === localParam) ? localParam : null;

  const [local, setLocal] = useState<LocalSlug | null>(lockedLocal);
  const [step, setStep] = useState<Step>(lockedLocal ? 'capture' : 'select-local');

  // Pages accumulator
  const [pages, setPages] = useState<CapturedPage[]>([]);

  // PDF file flow (bypass camera)
  const [pdfPreview, setPdfPreview] = useState<{ base64: string; filename: string; sizeKb: number } | null>(null);

  // Submit state
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
  const [resultMessage, setResultMessage] = useState('');
  const [docId, setDocId] = useState<string | null>(null);

  const [jobId, setJobId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Polling — arranca cuando jobId está seteado ─────────────────────
  useEffect(() => {
    if (!jobId) return;

    const MAX_POLLS = 36; // 3 minutos a 5s por poll
    pollCountRef.current = 0;

    pollingRef.current = setInterval(async () => {
      pollCountRef.current += 1;

      try {
        const res = await fetch(`/api/job-status/${jobId}`, { cache: 'no-store' });
        const data = await res.json();

        if (data.status === 'success') {
          clearInterval(pollingRef.current!);
          setSubmitStatus('success');
          setDocId(data.document_id ?? null);
          setResultMessage(
            data.auto_approval
              ? 'Documento aprobado automáticamente.'
              : 'Documento enviado. Pendiente de revisión.'
          );
          setStep('result');
        } else if (data.status === 'duplicate') {
          clearInterval(pollingRef.current!);
          setSubmitStatus('duplicate');
          setResultMessage(data.message || 'Documento ya procesado anteriormente.');
        } else if (data.status === 'failed') {
          clearInterval(pollingRef.current!);
          setSubmitStatus('error');
          setResultMessage(data.error || 'Error durante la extracción.');
        } else if (pollCountRef.current >= MAX_POLLS) {
          // Timeout — el documento puede haberse procesado igual
          clearInterval(pollingRef.current!);
          setSubmitStatus('success');
          setDocId(null);
          setResultMessage('Documento enviado. Puede tardar unos minutos en aparecer en la lista.');
          setStep('result');
        }
        // status === 'processing' | 'extracted' | 'not_found' → seguir esperando
      } catch {
        // Error de red transitorio — seguir intentando hasta MAX_POLLS
        if (pollCountRef.current >= MAX_POLLS) {
          clearInterval(pollingRef.current!);
          setSubmitStatus('error');
          setResultMessage('No se pudo obtener el estado. Verifica la lista de documentos.');
        }
      }
    }, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [jobId]);

  // ─── Local selection ────────────────────────────────────────────────
  const handleLocalSelect = (slug: LocalSlug) => {
    setLocal(slug);
    setStep('capture');
  };

  // ─── PDF upload (skip perspective) ──────────────────────────────────
  const handlePdfSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      alert('El archivo supera los 20 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setPdfPreview({ base64, filename: file.name, sizeKb: Math.round(file.size / 1024) });
      setStep('review');
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ─── DocumentScanner confirmed → add to pages ───────────────────────
  const handleDocumentScanned = (processedDataUrl: string) => {
    setPages((prev) => [...prev, { dataUrl: processedDataUrl, index: prev.length }]);
    setStep('review');
  };

  // ─── Remove page ─────────────────────────────────────────────────────
  const handleRemovePage = (index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, index: i })));
  };

  // ─── Add another page ────────────────────────────────────────────────
  const handleAddPage = () => {
    setStep('capture');
  };

  // ─── Submit ──────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!local || !token) return;
    if (pages.length === 0 && !pdfPreview) return;

    setSubmitStatus('submitting');
    setResultMessage('');

    try {
      let base64: string;
      let filename: string;
      const isImage = false; // always send as PDF

      if (pdfPreview) {
        base64 = pdfPreview.base64;
        filename = pdfPreview.filename;
      } else {
        filename = `scan_${Date.now()}.pdf`;
        if (pages.length === 1) {
          // Single page: convert image to single-page PDF
          base64 = await buildPdf(pages);
        } else {
          // Multi-page: build PDF from all pages
          base64 = await buildPdf(pages);
        }
      }

      const res = await fetch(`${WEBHOOK_URL}?t=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          t: token,
          document_base64: base64,
          local,
          filename,
          is_image: isImage,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.ok === false) {
        setSubmitStatus('error');
        setResultMessage(data.error || `Error ${res.status}`);
        return;
      }

      // Respuesta async: el extractor procesará en background
      if (data.status === 'processing' && data.job_id) {
        setJobId(data.job_id);
        setSubmitStatus('processing');
        return;
      }

      // Respuesta sync legacy (por si acaso) o respuesta directa de n8n
      if (data.status === 'duplicate') {
        setSubmitStatus('duplicate');
        setResultMessage(data.message || 'Documento ya procesado anteriormente.');
        return;
      }

      setSubmitStatus('success');
      setDocId(data.doc_id ?? data.document_id ?? null);
      setResultMessage(
        data.auto_approval
          ? 'Documento aprobado automáticamente.'
          : 'Documento enviado. Pendiente de revisión.'
      );
      setStep('result');
    } catch {
      setSubmitStatus('error');
      setResultMessage('No se pudo conectar. Verifica tu conexión e intenta de nuevo.');
    }
  };

  // ─── Reset ───────────────────────────────────────────────────────────
  const handleReset = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setPages([]);
    setPdfPreview(null);
    setSubmitStatus('idle');
    setResultMessage('');
    setDocId(null);
    setJobId(null);
    setStep(lockedLocal ? 'capture' : 'select-local');
    if (!lockedLocal) setLocal(null);
  };

  // ─── Guard: no token ─────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-3">
            <XCircle className="h-12 w-12 text-destructive" />
            <p className="font-semibold text-lg">Enlace no válido</p>
            <p className="text-sm text-muted-foreground">
              Este enlace no contiene un token de acceso. Solicita un enlace válido al administrador.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Full-screen steps ───────────────────────────────────────────────

  if (step === 'capture') {
    return (
      <DocumentScanner
        onCapture={handleDocumentScanned}
        onCancel={() => setStep(pages.length > 0 ? 'review' : 'select-local')}
      />
    );
  }

  if (step === 'result') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
            <CheckCircle className="h-14 w-14 text-green-500" />
            <div>
              <p className="font-semibold text-lg">¡Enviado!</p>
              <p className="text-sm text-muted-foreground mt-1">{resultMessage}</p>
              {docId && (
                <p className="text-xs text-muted-foreground mt-2 font-mono">ID: {docId}</p>
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

  // ─── Main card UI (select-local + review) ────────────────────────────
  return (
    <div className="flex min-h-screen flex-col items-center p-4 pt-8 pb-16">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handlePdfSelect}
      />

      <div className="w-full max-w-md space-y-5">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Pizca Scanner</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Escanea o adjunta una factura o albarán
          </p>
        </div>

        {/* Step: local selector */}
        {step === 'select-local' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Selecciona el local</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-2">
                {LOCALES.map((l) => (
                  <button
                    key={l.slug}
                    onClick={() => handleLocalSelect(l.slug)}
                    className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm hover:border-primary/50 hover:bg-accent transition-colors"
                  >
                    <span>{l.name}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: review (pages accumulated or PDF uploaded) */}
        {step === 'review' && (
          <>
            {/* Local badge */}
            <div className="flex items-center gap-3 rounded-lg border border-primary bg-primary/5 px-4 py-3">
              <CheckCircle className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium text-primary">
                {LOCALES.find((l) => l.slug === local)?.name}
                {lockedLocal && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">(fijado por QR)</span>
                )}
              </span>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Documento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pdfPreview ? (
                  <>
                    <div className="flex items-center gap-3 rounded-lg border bg-muted p-4">
                      <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{pdfPreview.filename}</p>
                        <p className="text-xs text-muted-foreground">PDF · {pdfPreview.sizeKb} KB</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setPdfPreview(null); setStep('capture'); }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronLeft className="h-3 w-3" /> Cambiar documento
                    </button>
                  </>
                ) : (
                  <PagePreview
                    pages={pages}
                    onRemove={handleRemovePage}
                    onAddPage={handleAddPage}
                  />
                )}
              </CardContent>
            </Card>

            {/* Status feedback */}
            {submitStatus === 'error' && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{resultMessage}</span>
              </div>
            )}
            {submitStatus === 'duplicate' && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{resultMessage}</span>
              </div>
            )}

            {/* Submit */}
            <Button
              className="w-full h-12 text-base"
              disabled={submitStatus === 'submitting' || submitStatus === 'processing' || (pages.length === 0 && !pdfPreview)}
              onClick={handleSubmit}
            >
              {submitStatus === 'submitting' ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando…</>
              ) : submitStatus === 'processing' ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Procesando documento…</>
              ) : (
                <><Send className="mr-2 h-4 w-4" /> Enviar {pages.length > 1 ? `(${pages.length} páginas)` : 'documento'}</>
              )}
            </Button>
          </>
        )}

        {/* Capture options (only shown in review if no pages yet or as alternate entry) */}
        {step === 'review' && pages.length === 0 && !pdfPreview && (
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="flex-col h-20 gap-2"
                  onClick={() => setStep('capture')}
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
            </CardContent>
          </Card>
        )}

        {/* Capture entry point from select-local after local chosen (shouldn't render, but fallback) */}
        {step === 'select-local' && local && (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="flex-col h-20 gap-2" onClick={() => setStep('capture')}>
              <Camera className="h-6 w-6" />
              <span className="text-xs">Fotografiar</span>
            </Button>
            <Button variant="outline" className="flex-col h-20 gap-2" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-6 w-6" />
              <span className="text-xs">Adjuntar PDF</span>
            </Button>
          </div>
        )}

        {/* Validation hints */}
        {step === 'select-local' && !local && (
          <div className="text-xs text-muted-foreground">
            <Label className="text-xs text-muted-foreground">↑ Selecciona un local para continuar</Label>
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
