import { createClient } from '@supabase/supabase-js'

// Client com service role — usa HTTPS, não precisa de DATABASE_URL
// Nunca expor no client-side
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
