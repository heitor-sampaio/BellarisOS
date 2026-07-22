import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { toggleBranchStatus } from '@/actions/branches'
import { BranchEditForm } from '@/components/admin/branch-edit-form'
import { ArrowLeft, Power, PowerOff, Users } from 'lucide-react'

interface Props {
  params: Promise<{ id: string }>
}

export default async function BranchDetailPage({ params }: Props) {
  const { id } = await params
  const ctx = await getTenantContext()
  assertPermission(ctx, 'settings', 'MANAGE')

  const supabase = await createClient()

  const { data: branch } = await supabase
    .from('branches')
    .select(`
      id, name, slug, document, state_registration,
      email, phone, address, city, state, zip_code,
      is_active, created_at,
      users(id, name, role, is_active)
    `)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()

  if (!branch) notFound()

  const members = Array.isArray(branch.users) ? branch.users : []
  const activeMembers = members.filter((u: any) => u.is_active).length

  return (
    <div style={{ maxWidth: 760 }}>

      {/* Breadcrumb */}
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/admin/settings?tab=unidades"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={13} /> Configurações · Unidades
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 style={{
              fontSize: 'var(--text-title)', fontWeight: 'var(--weight-extrabold)',
              letterSpacing: 'var(--tracking-tight)', color: 'var(--text)', margin: 0,
            }}>
              {branch.name}
            </h1>
            <span className={branch.is_active ? 'chip chip-success' : 'chip chip-muted'}>
              {branch.is_active ? 'Ativa' : 'Inativa'}
            </span>
          </div>
          <code style={{
            fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)',
            background: 'var(--bg-app)', padding: '2px 8px',
            borderRadius: 6, border: '1px solid var(--border)',
          }}>
            /{branch.slug}
          </code>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <form action={async () => {
            'use server'
            await toggleBranchStatus(id, !branch.is_active)
          }}>
            <button
              type="submit"
              className="btn-secondary"
              style={{ gap: 6, fontSize: 'var(--text-xs-sz)', color: branch.is_active ? 'var(--text-faint)' : 'var(--success)' }}
            >
              {branch.is_active
                ? <><PowerOff size={13} /> Desativar</>
                : <><Power size={13} /> Reativar</>
              }
            </button>
          </form>
        </div>
      </div>

      {/* Equipe da unidade — resumo rápido */}
      <div className="card-sm" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28, padding: '12px 18px' }}>
        <Users size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
          <strong style={{ fontWeight: 'var(--weight-extrabold)' }}>{activeMembers}</strong>
          <span style={{ color: 'var(--text-muted)' }}>
            {' '}membro{activeMembers !== 1 ? 's' : ''} ativo{activeMembers !== 1 ? 's' : ''}
            {members.length > activeMembers ? ` · ${members.length - activeMembers} inativo${members.length - activeMembers !== 1 ? 's' : ''}` : ''}
          </span>
        </span>
      </div>

      {/* Formulário de edição */}
      <BranchEditForm branch={branch as any} />

    </div>
  )
}
