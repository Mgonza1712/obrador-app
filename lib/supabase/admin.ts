import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/database.types'

/**
 * Admin client with service role key — bypasses RLS.
 * Only use in server-side code (Server Actions, Route Handlers).
 * Never expose to the browser. Access control must be enforced at application level.
 */
export function createAdminClient() {
    return createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    )
}
