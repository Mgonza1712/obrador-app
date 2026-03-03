'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BookOpen, Home, LogIn, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

const navItems = [
    {
        label: 'Inicio',
        href: '/',
        icon: Home,
    },
    {
        label: 'Recetario',
        href: '/recetario',
        icon: BookOpen,
    },
]

export default function Sidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [user, setUser] = useState<User | null>(null)
    const supabase = createClient()

    useEffect(() => {
        // Obtener sesión inicial
        supabase.auth.getUser().then(({ data }) => setUser(data.user))

        // Suscribirse a cambios de sesión en tiempo real
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

    return (
        <aside className="flex h-screen w-60 flex-col border-r border-border bg-background px-3 py-6">
            {/* Logo / Brand */}
            <div className="mb-8 px-3">
                <Link href="/" className="text-lg font-semibold tracking-tight text-foreground hover:opacity-80 transition-opacity">
                    Obrador
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex flex-1 flex-col gap-1">
                {navItems.map(({ label, href, icon: Icon }) => {
                    const isActive = href === '/'
                        ? pathname === '/'
                        : pathname.startsWith(href)
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                                }`}
                        >
                            <Icon className="h-4 w-4 shrink-0" />
                            {label}
                        </Link>
                    )
                })}
            </nav>

            {/* Session controls */}
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
    )
}
