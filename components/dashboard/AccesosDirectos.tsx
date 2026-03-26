'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calculator, ClipboardCheck, Loader2, Receipt, ShoppingBasket } from 'lucide-react'

const accesos = [
  { key: 'escandallos', icon: Calculator,     label: 'Escandallos',   href: '/escandallos' },
  { key: 'revision',   icon: ClipboardCheck,  label: 'Revisión Docs', href: '/admin/revision' },
  { key: 'documentos', icon: Receipt,         label: 'Documentos',    href: '/documentos' },
  { key: 'catalogo',   icon: ShoppingBasket,  label: 'Catálogo',      href: '/catalogo' },
]

export function AccesosDirectos() {
  const router = useRouter()
  const [loadingBtn, setLoadingBtn] = useState<string | null>(null)

  const handleNav = (key: string, href: string) => {
    setLoadingBtn(key)
    router.push(href)
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {accesos.map(({ key, icon: Icon, label, href }) => (
        <Button
          key={key}
          variant="outline"
          size="lg"
          className="flex flex-col items-center gap-2 h-auto py-4"
          disabled={loadingBtn !== null}
          onClick={() => handleNav(key, href)}
        >
          {loadingBtn === key
            ? <Loader2 className="h-5 w-5 animate-spin" />
            : <Icon className="h-5 w-5" />
          }
          <span className="text-xs font-medium text-center leading-tight">{label}</span>
        </Button>
      ))}
    </div>
  )
}
