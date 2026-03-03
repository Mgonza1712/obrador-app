'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BookOpen, Home, LogIn, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

const navItems = [
    { label: 'Inicio', href: '/', icon: Home },
    { label: 'Recetario', href: '/recetario', icon: BookOpen },
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
                className="sidebar-desktop max-md:hidden flex h-screen w-56 shrink-0 flex-col border-r border-border bg-background px-3 py-6"
            >
                {/* Logo */}
                <div className="mb-8 px-3">
                    <Link
                        href="/"
                        className="text-lg font-semibold tracking-tight text-foreground hover:opacity-80 transition-opacity"
                    >
                        Obrador
                    </Link>
                </div>

                {/* Nav */}
                <nav className="flex flex-1 flex-col gap-1">
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

                {/* Session */}
                <div className="border-t border-border pt-4">
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
                style={{ display: undefined }} /* let CSS handle it via md:hidden */
            >
                <div className="flex h-full w-full items-stretch">
                    {navItems.map(({ label, href, icon: Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${isActive(href)
                                ? 'text-primary'
                                : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <Icon className={`h-5 w-5 ${isActive(href) ? 'scale-110' : ''} transition-transform`} />
                            <span>{label}</span>
                            {isActive(href) && (
                                <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
                            )}
                        </Link>
                    ))}

                    {user ? (
                        <button
                            onClick={handleSignOut}
                            className="flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <LogOut className="h-5 w-5" />
                            <span>Salir</span>
                        </button>
                    ) : (
                        <Link
                            href="/login"
                            className="flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <LogIn className="h-5 w-5" />
                            <span>Entrar</span>
                        </Link>
                    )}
                </div>
            </nav>
        </>
    )
}
