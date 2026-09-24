import { redirect } from 'next/navigation'
import { getTenantContext, getRedirectPath } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

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
      const client = await ler(admin
        .from('clients').select('branch_id').eq('id', ctx.clientId).single(), 'buscar o cliente')
      if (client?.branch_id) {
        const br = await ler(admin
          .from('branches').select('slug').eq('id', client.branch_id).single(), 'buscar a unidade')
        if (br?.slug) dest = `/${br.slug}/cliente`
      }
    } else if (ctx.branchId) {
      const br = await ler(admin
        .from('branches').select('slug').eq('id', ctx.branchId).single(), 'buscar a unidade')
      dest = getRedirectPath(ctx.role, br?.slug ?? null)
    } else {
      dest = getRedirectPath(ctx.role, null)
    }
  } catch {
    dest = '/login'
  }

  redirect(dest)
}
