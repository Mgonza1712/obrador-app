'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChefHat, Loader2, Mail, Lock, AlertCircle, CheckCircle2 } from 'lucide-react'

type Mode = 'signin' | 'signup'

// Componente interno — usa useSearchParams, necesita estar dentro de <Suspense>
function LoginForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const nextPath = searchParams.get('next') ?? '/'

    const [mode, setMode] = useState<Mode>('signin')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const supabase = createClient()

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError(null)
        setSuccess(null)

        if (mode === 'signin') {
            const { error } = await supabase.auth.signInWithPassword({ email, password })
            if (error) {
                setError(error.message)
            } else {
                router.push(nextPath)
                router.refresh()
            }
        } else {
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${location.origin}/auth/callback?next=${nextPath}`,
                },
            })
            if (error) {
                setError(error.message)
            } else {
                setSuccess('¡Cuenta creada! Revisa tu correo para confirmar tu dirección.')
            }
        }

        setLoading(false)
    }

    return (
        <Card className="border-border shadow-xl">
            <CardHeader className="space-y-1 pb-4">
                <CardTitle className="text-xl font-semibold">
                    {mode === 'signin' ? 'Iniciar Sesión' : 'Crear cuenta'}
                </CardTitle>
                <CardDescription>
                    {mode === 'signin'
                        ? 'Accede con tu email y contraseña'
                        : 'Regístrate para empezar a usar Obrador'}
                </CardDescription>
            </CardHeader>

            <form onSubmit={handleSubmit}>
                <CardContent className="flex flex-col gap-4">
                    {/* Email */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-foreground" htmlFor="email">
                            Email
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                id="email"
                                type="email"
                                required
                                autoComplete="email"
                                placeholder="chef@obrador.app"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-ring transition-shadow"
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-foreground" htmlFor="password">
                            Contraseña
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                id="password"
                                type="password"
                                required
                                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-ring transition-shadow"
                            />
                        </div>
                        {mode === 'signup' && (
                            <p className="text-xs text-muted-foreground">Mínimo 6 caracteres</p>
                        )}
                    </div>

                    {/* Feedback */}
                    {error && (
                        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                            {success}
                        </div>
                    )}
                </CardContent>

                <CardFooter className="flex flex-col gap-3 pt-2">
                    <Button type="submit" className="w-full gap-2" disabled={loading}>
                        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                        {mode === 'signin' ? 'Iniciar Sesión' : 'Registrarse'}
                    </Button>
                    <p className="text-center text-sm text-muted-foreground">
                        {mode === 'signin' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}
                        {' '}
                        <button
                            type="button"
                            onClick={() => {
                                setMode(mode === 'signin' ? 'signup' : 'signin')
                                setError(null)
                                setSuccess(null)
                            }}
                            className="font-medium text-foreground underline-offset-4 hover:underline"
                        >
                            {mode === 'signin' ? 'Regístrate' : 'Inicia sesión'}
                        </button>
                    </p>
                </CardFooter>
            </form>
        </Card>
    )
}

// Page — envuelve LoginForm en Suspense para satisfacer el requisito de useSearchParams
export default function LoginPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
            <div className="w-full max-w-md">
                {/* Brand */}
                <div className="mb-8 flex flex-col items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
                        <ChefHat className="h-7 w-7" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">Obrador App</h1>
                        <p className="text-sm text-muted-foreground">SaaS Gastronómico</p>
                    </div>
                </div>

                <Suspense fallback={
                    <Card className="border-border shadow-xl">
                        <CardContent className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </CardContent>
                    </Card>
                }>
                    <LoginForm />
                </Suspense>
            </div>
        </div>
    )
}
