import { redirect } from 'next/navigation'
import { getTenantContext, getRedirectPath } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export default async function AuthRedirectPage() {
  try {
    const ctx = await getTenantContext()
    const admin = createAdminClient()

    if (ctx.isClient && ctx.clientId) {
      const { data: client } = await admin
        .from('clients').select('branch_id').eq('id', ctx.clientId).single()
      if (client?.branch_id) {
        const { data: br } = await admin
          .from('branches').select('slug').eq('id', client.branch_id).single()
        if (br?.slug) redirect(`/${br.slug}/cliente`)
      }
    } else if (ctx.branchId) {
      const { data: br } = await admin
        .from('branches').select('slug').eq('id', ctx.branchId).single()
      redirect(getRedirectPath(ctx.role, br?.slug ?? null))
    } else {
      redirect(getRedirectPath(ctx.role, null))
    }
  } catch {
    redirect('/login')
  }
}
