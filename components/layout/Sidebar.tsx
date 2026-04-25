'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Calculator, ChefHat, ClipboardCheck, ConciergeBell, Home, LogIn, LogOut, Package, Receipt, Settings, ShoppingBasket, Truck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

const navItems = [
    { label: 'Inicio', mobileLabel: 'Inicio', href: '/', icon: Home },
    { label: 'Obrador', mobileLabel: 'Obrador', href: '/recetario', icon: ChefHat },
    { label: 'Fichas de Servicio', mobileLabel: 'Fichas', href: '/fichas', icon: ConciergeBell },
    { label: 'Revisión Docs', mobileLabel: 'Revisión', href: '/admin/revision', icon: ClipboardCheck },
    { label: 'Proveedores', mobileLabel: 'Proveed.', href: '/proveedores', icon: Truck },
    { label: 'Catálogo', mobileLabel: 'Catálogo', href: '/catalogo', icon: ShoppingBasket },
    { label: 'Pedidos', mobileLabel: 'Pedidos', href: '/pedidos', icon: Package },
    { label: 'Documentos', mobileLabel: 'Docs', href: '/documentos', icon: Receipt },
    { label: 'Escandallos', mobileLabel: 'Escand.', href: '/escandallos', icon: Calculator },
    { label: 'Configuración', mobileLabel: 'Config.', href: '/admin/usuarios', icon: Settings },
]

export default function Sidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [user, setUser] = useState<User | null>(null)
    const supabase = createClient()

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setUser(data.user))
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => setUser(session?.user ?? null)
        )
        return () => subscription.unsubscribe()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    async function handleSignOut() {
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    const isActive = (href: string) =>
        href === '/' ? pathname === '/' : pathname.startsWith(href)

    return (
        <>
            {/* ── Desktop Sidebar — oculto en móvil con max-md:hidden ── */}
            <aside
                className="sidebar-desktop max-md:hidden flex h-full w-56 shrink-0 flex-col overflow-hidden border-r border-border bg-background px-3 py-6"
            >
                {/* Logo */}
                <div className="mb-8 px-3">
                    <Link href="/" className="hover:opacity-80 transition-opacity block">
                        <Image src="/logo-pizca.png" alt="Pizca" width={120} height={40} priority />
                    </Link>
                </div>

                {/* Nav — scrollable if many items, but never pushes session section out */}
                <nav className="flex flex-1 flex-col gap-1 min-h-0 overflow-y-auto">
                    {navItems.map(({ label, href, icon: Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive(href)
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                }`}
                        >
                            <Icon className="h-4 w-4 shrink-0" />
                            {label}
                        </Link>
                    ))}
                </nav>

                {/* Session — always visible, never clipped */}
                <div className="flex-shrink-0 border-t border-border pt-4">
                    {user ? (
                        <div className="flex flex-col gap-2">
                            <p className="truncate px-3 text-xs text-muted-foreground" title={user.email}>
                                {user.email}
                            </p>
                            <button
                                onClick={handleSignOut}
                                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                                <LogOut className="h-4 w-4 shrink-0" />
                                Cerrar Sesión
                            </button>
                        </div>
                    ) : (
                        <Link
                            href="/login"
                            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                            <LogIn className="h-4 w-4 shrink-0" />
                            Iniciar Sesión
                        </Link>
                    )}
                </div>
            </aside>

            {/* ── Mobile Bottom-Nav — solo visible en móvil con md:hidden ── */}
            <nav
                className="sidebar-mobile md:hidden fixed bottom-0 left-0 right-0 z-50 h-16 border-t border-border bg-background"
            >
                <div className="flex h-full w-full items-stretch">
                    {navItems.map(({ mobileLabel, href, icon: Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${isActive(href)
                                ? 'text-primary'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <Icon className={`h-5 w-5 shrink-0 ${isActive(href) ? 'scale-110' : ''} transition-transform`} />
                            <span className="w-full text-center text-[10px] font-medium whitespace-nowrap overflow-hidden text-ellipsis px-0.5">
                                {mobileLabel}
                            </span>
                            {isActive(href) && (
                                <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
                            )}
                        </Link>
                    ))}

                    {user ? (
                        <button
                            onClick={handleSignOut}
                            className="flex flex-1 flex-col items-center justify-center gap-0.5 text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <LogOut className="h-5 w-5 shrink-0" />
                            <span className="text-[10px] font-medium whitespace-nowrap">Salir</span>
                        </button>
                    ) : (
                        <Link
                            href="/login"
                            className="flex flex-1 flex-col items-center justify-center gap-0.5 text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <LogIn className="h-5 w-5 shrink-0" />
                            <span className="text-[10px] font-medium whitespace-nowrap">Entrar</span>
                        </Link>
                    )}
                </div>
            </nav>
        </>
    )
}
