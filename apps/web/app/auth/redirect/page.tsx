import { redirect } from 'next/navigation'
import { getTenantContext, getRedirectPath } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export default async function AuthRedirectPage() {
  // Resolve o destino sem chamar redirect() dentro do try/catch.
  // redirect() lança NEXT_REDIRECT internamente; se estiver dentro de
  // um catch, o catch o captura e sobrescreve com redirect('/login').
  let dest = '/login'

  try {
    const ctx   = await getTenantContext()
    const admin = createAdminClient()

    if (ctx.isClient && ctx.clientId) {
      const { data: client } = await admin
        .from('clients').select('branch_id').eq('id', ctx.clientId).single()
      if (client?.branch_id) {
        const { data: br } = await admin
          .from('branches').select('slug').eq('id', client.branch_id).single()
        if (br?.slug) dest = `/${br.slug}/cliente`
      }
    } else if (ctx.branchId) {
      const { data: br } = await admin
        .from('branches').select('slug').eq('id', ctx.branchId).single()
      dest = getRedirectPath(ctx.role, br?.slug ?? null)
    } else {
      dest = getRedirectPath(ctx.role, null)
    }
  } catch {
    dest = '/login'
  }

  redirect(dest)
}
