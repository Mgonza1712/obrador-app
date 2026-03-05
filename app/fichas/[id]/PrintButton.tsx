'use client'

import { Printer } from 'lucide-react'

export default function PrintButton() {
    return (
        <button
            onClick={() => window.print()}
            className="print:hidden flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow transition-all hover:opacity-90 active:scale-95"
        >
            <Printer className="h-4 w-4" /> Imprimir Ficha
        </button>
    )
}
