import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createClient as createSupabase } from '@/lib/supabase/server'
import { ClientForm } from '@/components/branch/client-form'
import { prefillDaBusca } from '@/lib/busca/acoes'
import { ler } from '@/lib/db'
import { redeTemUmaUnidade } from '@/lib/unidades/uma-so'

export default async function NewClientPage({ params, searchParams }: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ nome?: string; telefone?: string }>
}) {
  // A busca universal manda o termo que não achou ninguém (`?nome=` ou `?telefone=`).
  const prefill = prefillDaBusca(await searchParams)
  const { slug } = await params
  const ctx      = await getTenantContext()
  assertPermission(ctx, 'clients', 'MANAGE')

  const supabase = await createSupabase()
  const branch = await ler(supabase
    .from('branches')
    .select('id, name')
    .eq('slug', slug)
    .eq('tenant_id', ctx.tenantId!)
    .single(), 'buscar a unidade')
  if (!branch) notFound()
  // Onde a cliente aparece só se explica com outras unidades (J-24, D-19).
  const variasUnidades = !(await redeTemUmaUnidade(ctx.tenantId!))

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
        <ClientForm branchId={branch.id} slug={slug} branchName={branch.name} prefill={prefill} variasUnidades={variasUnidades} />
      </div>
    </div>
  )
}
