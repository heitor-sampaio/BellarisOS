import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { ClientForm } from '@/components/branch/client-form'

export default async function NewClientPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx      = await getTenantContext()
  assertPermission(ctx, 'clients', 'MANAGE')

  const supabase = await createSupabase()
  const { data: branch } = await supabase
    .from('branches')
    .select('id, name')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single()
  if (!branch) notFound()

  return (
    <div style={{ maxWidth: 620 }}>
      {/* Breadcrumb */}
      <Link
        href={`/${slug}/clients`}
        className="btn-ghost"
        style={{ padding: '4px 0', marginBottom: 20, display: 'inline-flex', color: 'var(--text-muted)' }}
      >
        <ChevronLeft size={15} /> Voltar para Clientes
      </Link>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)', letterSpacing: 'var(--tracking-tight)', color: 'var(--text)' }}>
          Novo cliente
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
          {branch.name}
        </p>
      </div>

      <div className="card">
        <ClientForm branchId={branch.id} slug={slug} branchName={branch.name} />
      </div>
    </div>
  )
}
