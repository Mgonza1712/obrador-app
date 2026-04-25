'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, MessageCircle, Settings } from 'lucide-react'

const tabs = [
    { label: 'Usuarios', href: '/admin/usuarios', icon: Users },
    { label: 'WhatsApp', href: '/admin/whatsapp', icon: MessageCircle },
    { label: 'Configuración', href: '/admin/configuracion', icon: Settings },
]

export default function AdminTabNav() {
    const pathname = usePathname()

    return (
        <div className="flex gap-1 border-b border-border mb-6">
            {tabs.map(({ label, href, icon: Icon }) => {
                const active = pathname.startsWith(href)
                return (
                    <Link
                        key={href}
                        href={href}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                            active
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                        }`}
                    >
                        <Icon className="h-4 w-4" />
                        {label}
                    </Link>
                )
            })}
        </div>
    )
}
