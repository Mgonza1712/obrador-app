'use server'

import { createClient } from '@/lib/supabase/server'

export async function getSecureDocumentUrl(driveUrl: string | null): Promise<string | null> {
    if (!driveUrl) return null

    // Limpiamos la URL por si es un registro antiguo que contiene la ruta pública completa
    const fileName = driveUrl.split('/').pop()

    if (!fileName) return null

    const supabase = await createClient()

    // Generamos una URL firmada válida por 1 hora (3600 segundos)
    const { data, error } = await supabase.storage.from('facturas').createSignedUrl(fileName, 3600)

    if (error) {
        console.error('Error generando Signed URL:', error.message)
        return null
    }

    return data.signedUrl
}
