'use client';

import { FileText, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface CapturedPage {
  dataUrl: string; // processed image data URL
  index: number;
}

interface PagePreviewProps {
  pages: CapturedPage[];
  onRemove: (index: number) => void;
  onAddPage: () => void;
}

export function PagePreview({ pages, onRemove, onAddPage }: PagePreviewProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {pages.map((page, i) => (
          <div key={i} className="relative aspect-[0.707] rounded-lg overflow-hidden border bg-muted group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={page.dataUrl}
              alt={`Página ${i + 1}`}
              className="w-full h-full object-cover"
            />
            {/* Page number */}
            <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] font-medium rounded px-1.5 py-0.5">
              {i + 1}
            </div>
            {/* Remove button */}
            <button
              onClick={() => onRemove(i)}
              className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5 transition-colors"
              aria-label={`Eliminar página ${i + 1}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {/* Add page tile */}
        <button
          onClick={onAddPage}
          className="aspect-[0.707] rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-accent flex flex-col items-center justify-center gap-1 transition-colors"
        >
          <Plus className="h-5 w-5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">Agregar</span>
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span>
          {pages.length} {pages.length === 1 ? 'página capturada' : 'páginas capturadas'}
          {' — se enviarán como un solo PDF'}
        </span>
      </div>
    </div>
  );
}
